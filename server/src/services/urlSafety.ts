import dns from 'node:dns/promises';
import net from 'node:net';
import { config } from '../config.js';

const allowHttp = () => process.env.ATLAS_ALLOW_HTTP_DASHBOARDS === 'true';

/** Validate a dashboard link. Returns an error message or null. */
export function dashboardUrlProblem(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return 'Enter a full URL, starting with https://';
  }
  if (url.protocol !== 'https:' && !(allowHttp() && url.protocol === 'http:')) {
    return 'Dashboard links must use https://';
  }
  if (url.username || url.password) return 'Do not include usernames or passwords in the link.';
  if (!url.hostname) return 'The link has no host name.';
  if (raw.length > 2048) return 'The link is too long.';
  if (/(?:^|[?&])(password|passwd|pwd|token|apikey|api_key|secret)=/i.test(url.search)) {
    return 'Do not include credentials or tokens in the link.';
  }
  return null;
}

export function websiteUrlProblem(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (!['http:', 'https:'].includes(url.protocol)) return 'Website must start with https:// or http://';
    if (url.username || url.password) return 'Do not include credentials in the link.';
    return null;
  } catch {
    return 'Enter a full URL, starting with https://';
  }
}

function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const lower = ip.toLowerCase();
  if (lower.startsWith('::ffff:')) return isPrivateAddress(lower.slice(7));
  return lower === '::1' || lower === '::' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80');
}

export interface CheckResult {
  result: 'responded' | 'no_response' | 'skipped';
  detail: string;
}

/**
 * Lightweight reachability check: does the host answer an HTTP request at all?
 * It sends no credentials and never reads dashboard content. A response (even
 * 401/403) only means the web server answered — it says nothing about the
 * health of the plant or machine behind the dashboard.
 */
export async function checkDashboardReachability(raw: string): Promise<CheckResult> {
  if (!config.dashboardCheck.enabled) return { result: 'skipped', detail: 'Automatic checks are disabled on this server.' };
  const url = new URL(raw);
  const allowPrivate = process.env.ATLAS_ALLOW_PRIVATE_CHECKS === 'true';
  try {
    const addresses = await dns.lookup(url.hostname, { all: true });
    if (!allowPrivate && addresses.some((a) => isPrivateAddress(a.address))) {
      return { result: 'skipped', detail: 'Host is on a private network; the server does not probe internal addresses.' };
    }
  } catch {
    return { result: 'no_response', detail: 'Host name could not be resolved.' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.dashboardCheck.timeoutMs);
  try {
    let res = await fetch(url, { method: 'HEAD', redirect: 'manual', signal: controller.signal });
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, { method: 'GET', redirect: 'manual', signal: controller.signal });
      await res.body?.cancel();
    }
    const note = res.status === 401 || res.status === 403 ? ' (sign-in required at the dashboard)' : '';
    return { result: 'responded', detail: `Web server answered with HTTP ${res.status}${note}.` };
  } catch (err) {
    const aborted = (err as Error).name === 'AbortError';
    return { result: 'no_response', detail: aborted ? 'No answer before the time limit.' : 'Connection failed.' };
  } finally {
    clearTimeout(timer);
  }
}
