// ponytail: fixed-window counter per IP, in-memory. Good enough for a single
// free-tier instance; move to a shared store if we run more than one replica.
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 30;

const hits = new Map<string, { count: number; windowStart: number }>();

export function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    hits.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_REQUESTS_PER_WINDOW;
}
