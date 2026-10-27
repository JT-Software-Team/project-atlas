import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Client, InArgs, InValue, ResultSet, Transaction } from '@libsql/client';
import { migrations } from './schema.js';

export type Row = Record<string, unknown>;
type Param = InValue | Buffer | undefined | Record<string, unknown>;

export interface Statement {
  get(...params: Param[]): Promise<Row | undefined>;
  all(...params: Param[]): Promise<Row[]>;
  run(...params: Param[]): Promise<{ lastInsertRowid: number; changes: number }>;
}

export interface DB {
  prepare(sql: string): Statement;
  exec(sql: string): Promise<void>;
  /** Run `fn` atomically. Queries made through this DB inside `fn` join the transaction automatically. */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  close(): void;
}

export interface DatabaseTarget {
  /** A local SQLite file path, ':memory:', or a remote libSQL URL (libsql://, https://). */
  url: string;
  authToken?: string;
}

const isRemote = (url: string) => /^(libsql|https?|wss?):\/\//i.test(url);

/**
 * One SQL interface for local SQLite files (development, tests, Docker) and a hosted libSQL/Turso
 * database (serverless deployments, where every instance must share the same data).
 */
export async function openDatabase(target: string | DatabaseTarget, options: { readOnlySource?: boolean } = {}): Promise<DB> {
  const { url, authToken } = typeof target === 'string' ? { url: target } : target;
  let clientUrl = url;
  if (!isRemote(url)) {
    // The client opens extra connections around transactions, so an in-memory database would split
    // into several empty ones. Tests get a throwaway file instead.
    const file = url === ':memory:'
      ? path.join(os.tmpdir(), `atlas-mem-${process.pid}-${crypto.randomBytes(6).toString('hex')}.db`)
      : path.resolve(url);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    clientUrl = `file:${file}`;
  }
  // The remote client is plain HTTP; only local files need the native SQLite binding, so serverless
  // bundles never have to load it.
  const { createClient } = isRemote(url) ? await import('@libsql/client/web') : await import('@libsql/client');
  const client = createClient({ url: clientUrl, authToken, timeout: 5000 });
  // A copy source (migration, backup) is only read: no journal-mode change, no migrations.
  if (options.readOnlySource) return wrap(client);
  if (!isRemote(url)) await client.executeMultiple('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const db = wrap(client);
  await migrate(db);
  return db;
}

function wrap(client: Client): DB {
  const active = new AsyncLocalStorage<Transaction>();
  const exec = (sql: string, args: InArgs) => (active.getStore() ?? client).execute({ sql, args });

  const db: DB = {
    prepare(sql) {
      return {
        async get(...params) { return toRows(await exec(sql, toArgs(sql, params)))[0]; },
        async all(...params) { return toRows(await exec(sql, toArgs(sql, params))); },
        async run(...params) {
          const rs = await exec(sql, toArgs(sql, params));
          return { lastInsertRowid: Number(rs.lastInsertRowid ?? 0), changes: rs.rowsAffected };
        },
      };
    },
    async exec(sql) {
      await (active.getStore() ?? client).executeMultiple(sql);
    },
    async transaction(fn) {
      if (active.getStore()) return fn(); // already inside one: join it
      const tx = await client.transaction('write');
      try {
        const result = await active.run(tx, fn);
        await tx.commit();
        return result;
      } catch (err) {
        await tx.rollback().catch(() => {});
        throw err;
      } finally {
        tx.close();
      }
    },
    close: () => client.close(),
  };
  return db;
}

function toValue(v: Param): InValue {
  if (v !== null && typeof v === 'object' && !(v instanceof Uint8Array) && !(v instanceof ArrayBuffer) && !(v instanceof Date)) {
    throw new TypeError('Unsupported SQL parameter value.');
  }
  if (v === undefined) return null;
  if (Buffer.isBuffer(v)) return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  return v;
}

/** Positional params pass through; a single object binds `:name` placeholders that appear in the SQL. */
function toArgs(sql: string, params: Param[]): InArgs {
  const [first] = params;
  const named = params.length === 1 && first !== null && typeof first === 'object'
    && !Buffer.isBuffer(first) && !(first instanceof Uint8Array) && !(first instanceof ArrayBuffer) && !(first instanceof Date);
  if (!named) return params.map(toValue);
  const out: Record<string, InValue> = {};
  for (const [key, value] of Object.entries(first as Record<string, Param>)) {
    if (new RegExp(`:${key}\\b`).test(sql)) out[`:${key}`] = toValue(value);
  }
  return out;
}

function toRows(rs: ResultSet): Row[] {
  return rs.rows.map((r) => {
    const row: Row = {};
    rs.columns.forEach((c, i) => {
      const v = r[i];
      row[c] = v instanceof ArrayBuffer ? Buffer.from(v) : v;
    });
    return row;
  });
}

/**
 * The applied schema version lives in a table: hosted Turso rejects `PRAGMA user_version = n` writes.
 * Databases created before this table existed recorded their version in user_version, which is still
 * readable, so they continue from where they were.
 */
async function migrate(db: DB) {
  // Several serverless instances can cold-start at once: re-check the version inside the write lock.
  await db.transaction(async () => {
    await db.exec('CREATE TABLE IF NOT EXISTS schema_version (id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL)');
    const row = await db.prepare('SELECT version FROM schema_version WHERE id = 1').get() as { version: number } | undefined;
    const legacy = row ? 0 : ((await db.prepare('PRAGMA user_version').get()) as { user_version: number }).user_version;
    const current = row?.version ?? legacy;
    for (let v = current; v < migrations.length; v++) await db.exec(migrations[v]);
    await db.prepare('INSERT INTO schema_version (id, version) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET version = excluded.version')
      .run(migrations.length);
  });
}

/** Schema version recorded for this database. */
export async function schemaVersion(db: DB): Promise<number> {
  return ((await db.prepare('SELECT version FROM schema_version WHERE id = 1').get()) as { version: number }).version;
}

export function transaction<T>(db: DB, fn: () => Promise<T>): Promise<T> {
  return db.transaction(fn);
}

export const nowIso = () => new Date().toISOString();
