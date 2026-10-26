import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

/** Wrap async handlers so rejections reach the error middleware. */
export const ah =
  (fn: (req: Request, res: Response, next: NextFunction) => unknown): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of err.issues) {
      const key = issue.path.join('.') || '_';
      if (!fields[key]) fields[key] = issue.message;
    }
    return res.status(400).json({ error: 'Please check the highlighted fields.', fields });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, ...(err.details ? { details: err.details } : {}) });
  }
  const anyErr = err as { type?: string; code?: string; status?: number };
  if (anyErr?.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large.' });
  if (anyErr?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File is too large.' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
}

export function parseId(value: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid id.');
  return id;
}
