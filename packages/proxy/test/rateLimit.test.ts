import { beforeEach, describe, expect, it, vi } from "vitest";
import { isRateLimited, resetRateLimit } from "../src/rateLimit.js";

describe("isRateLimited", () => {
  beforeEach(() => {
    resetRateLimit();
    vi.useRealTimers();
  });

  it("lets a normal caller through and stops a flood", () => {
    for (let i = 0; i < 30; i++) expect(isRateLimited("1.2.3.4")).toBe(false);
    expect(isRateLimited("1.2.3.4")).toBe(true);
  });

  it("counts each caller separately", () => {
    for (let i = 0; i < 31; i++) isRateLimited("1.2.3.4");
    expect(isRateLimited("5.6.7.8")).toBe(false);
  });

  it("forgives the caller once the window rolls over", () => {
    vi.useFakeTimers();
    for (let i = 0; i < 31; i++) isRateLimited("1.2.3.4");
    expect(isRateLimited("1.2.3.4")).toBe(true);
    vi.advanceTimersByTime(61_000);
    expect(isRateLimited("1.2.3.4")).toBe(false);
  });

  it("does not grow without bound when every request is a new IP", () => {
    // The table itself was the denial-of-service: one request per spoofed
    // source and we held the key until the process died.
    for (let i = 0; i < 25_000; i++) isRateLimited(`10.0.${(i >> 8) & 255}.${i & 255}`);
    // Still enforcing after the eviction churn, which is the part that matters.
    for (let i = 0; i < 30; i++) isRateLimited("9.9.9.9");
    expect(isRateLimited("9.9.9.9")).toBe(true);
  });
});
