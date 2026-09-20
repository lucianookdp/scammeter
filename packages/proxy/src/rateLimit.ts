// ponytail: fixed-window counter per IP, in-memory. Good enough for a single
// free-tier instance; move to a shared store if we run more than one replica.
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 30;
// Without a ceiling the map is itself the DoS: one request per spoofed IP and
// we hold every key we have ever seen until the process dies.
const MAX_TRACKED_IPS = 10_000;

const hits = new Map<string, { count: number; windowStart: number }>();

function dropStaleEntries(now: number): void {
  for (const [ip, entry] of hits) {
    if (now - entry.windowStart > WINDOW_MS) hits.delete(ip);
  }
  // Still full of live windows: evict oldest-first. Map preserves insertion
  // order, so the head is the least recently started window.
  if (hits.size >= MAX_TRACKED_IPS) {
    const excess = hits.size - MAX_TRACKED_IPS + 1;
    let dropped = 0;
    for (const ip of hits.keys()) {
      hits.delete(ip);
      if (++dropped >= excess) break;
    }
  }
}

export function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    if (hits.size >= MAX_TRACKED_IPS) dropStaleEntries(now);
    hits.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_REQUESTS_PER_WINDOW;
}

/** Test seam: the counters are process-global otherwise. */
export function resetRateLimit(): void {
  hits.clear();
}
