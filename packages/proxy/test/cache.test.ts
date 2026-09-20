import { describe, expect, it, vi } from "vitest";
import { TtlCache } from "../src/cache.js";

describe("TtlCache", () => {
  it("returns what was stored, and nothing for an unknown key", () => {
    const cache = new TtlCache<number>(1000);
    cache.set("a", 1);
    expect(cache.get("a")).toBe(1);
    expect(cache.get("b")).toBeUndefined();
  });

  it("forgets an entry once its TTL passes", () => {
    vi.useFakeTimers();
    const cache = new TtlCache<number>(1000);
    cache.set("a", 1);
    vi.advanceTimersByTime(1001);
    expect(cache.get("a")).toBeUndefined();
    vi.useRealTimers();
  });

  it("stays under its ceiling when keys are attacker-supplied", () => {
    // /scan is keyed on a pasted URL, so an unbounded map is a memory
    // exhaustion vector rather than merely untidy.
    const cache = new TtlCache<number>(60_000, 100);
    for (let i = 0; i < 1000; i++) cache.set(`https://evil.example/${i}`, i);
    expect(cache.size).toBeLessThanOrEqual(100);
  });

  it("keeps serving correct values after eviction has kicked in", () => {
    const cache = new TtlCache<number>(60_000, 10);
    for (let i = 0; i < 50; i++) cache.set(`k${i}`, i);
    expect(cache.get("k49")).toBe(49); // most recent survives
    expect(cache.get("k0")).toBeUndefined(); // oldest was dropped
  });

  it("overwriting an existing key does not count against the ceiling", () => {
    const cache = new TtlCache<number>(60_000, 3);
    cache.set("a", 1);
    for (let i = 0; i < 100; i++) cache.set("a", i);
    expect(cache.get("a")).toBe(99);
    expect(cache.size).toBe(1);
  });

  it("prefers dropping expired entries over live ones", () => {
    vi.useFakeTimers();
    const cache = new TtlCache<number>(1000, 3);
    cache.set("old", 1);
    vi.advanceTimersByTime(1500);
    cache.set("fresh", 2);
    cache.set("fresher", 3);
    cache.set("freshest", 4); // trips eviction
    expect(cache.get("fresh")).toBe(2);
    expect(cache.get("old")).toBeUndefined();
    vi.useRealTimers();
  });
});
