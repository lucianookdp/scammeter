// ponytail: single in-memory Map with a size ceiling. Fine for one Railway
// instance; swap to Redis if we ever scale to multiple instances.
interface Entry<T> {
  value: T;
  expiresAt: number;
}

const DEFAULT_MAX_ENTRIES = 5_000;

export class TtlCache<T> {
  private store = new Map<string, Entry<T>>();

  constructor(
    private ttlMs: number,
    private maxEntries = DEFAULT_MAX_ENTRIES,
  ) {}

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    // Keys come from user input (a pasted URL, a hostname), so an unbounded
    // map is a memory-exhaustion vector, not just untidy.
    if (this.store.size >= this.maxEntries && !this.store.has(key)) this.evict();
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  get size(): number {
    return this.store.size;
  }

  private evict(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) this.store.delete(key);
    }
    // All still live — drop oldest-inserted until we're back under the cap.
    while (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next();
      if (oldest.done) break;
      this.store.delete(oldest.value);
    }
  }
}
