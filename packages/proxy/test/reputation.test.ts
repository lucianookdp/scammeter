import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { createReputationLookup, reputationHostname } from "../src/reputation.js";
import { registerReputationRoute } from "../src/routes/reputation.js";

const feed = "bad.example\nphishing.tenant.example\n";
let upstream: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-22T00:00:00Z"));
  upstream = vi.fn(async () => new Response(feed));
  vi.stubGlobal("fetch", upstream);
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("reputation hostnames", () => {
  it("normalizes case, trailing dots and IDNs", () => {
    expect(reputationHostname("BAD.EXAMPLE.")).toBe("bad.example");
    expect(reputationHostname("açúcar.example")).toBe("xn--acar-0oa8i.example");
  });
  it.each(["localhost", "https://bad.example", "bad.example/path", "bad.example:443", "a@bad.example", "bad.example?x", "bad.example#x", "bad%2eexample", "a..example", "127.0.0.1", "[::1]", "-bad.example", "a ", "a\\b.example", "x".repeat(64) + ".example"])("rejects %s before network access", value => {
    expect(reputationHostname(value)).toBeNull();
    expect(upstream).not.toHaveBeenCalled();
  });
});

describe("cached reputation feed", () => {
  it("matches exact hostname and returns attribution and download time", async () => {
    expect(await createReputationLookup()("bad.example")).toMatchObject({
      blocklisted: true, top100k: null, status: "available", source: "PhishDestroy",
      match: "exact_hostname", fetchedAt: "2026-09-22T00:00:00.000Z",
    });
    expect(upstream.mock.calls[0][0]).not.toContain("bad.example");
  });
  it("does not match parents, children, siblings or partial names", async () => {
    const lookup = createReputationLookup();
    for (const host of ["tenant.example", "safe.tenant.example", "x.bad.example", "notbad.example", "bad.example.evil.test", "example"]) {
      expect((await lookup(host)).blocklisted).toBe(false);
    }
    expect(upstream).toHaveBeenCalledTimes(1);
  });
  it("shares one download across concurrent callers", async () => {
    const lookup = createReputationLookup();
    await Promise.all(Array.from({ length: 30 }, () => lookup("bad.example")));
    expect(upstream).toHaveBeenCalledTimes(1);
  });
  it("refreshes after expiry and removes delisted entries", async () => {
    const lookup = createReputationLookup();
    await lookup("bad.example");
    upstream.mockImplementation(async () => new Response("other.example\n"));
    await vi.advanceTimersByTimeAsync(3600000);
    expect((await lookup("bad.example")).blocklisted).toBe(false);
    expect(upstream).toHaveBeenCalledTimes(2);
  });
  it.each(["", "<html>upstream error</html>", "https://bad.example/path\n", "garbage\nbad.example"])("rejects malformed feed %s", async body => {
    upstream.mockImplementation(async () => new Response(body));
    expect(await createReputationLookup()("safe.example")).toMatchObject({ blocklisted: null, status: "unavailable" });
  });
  it("rejects a non-OK response", async () => {
    upstream.mockImplementation(async () => new Response("bad.example", { status: 503 }));
    expect((await createReputationLookup()("bad.example")).blocklisted).toBeNull();
  });
  it("bounds downloaded bytes", async () => {
    upstream.mockImplementation(async () => new Response("a".repeat(8 * 1024 * 1024 + 1)));
    expect((await createReputationLookup()("safe.example")).status).toBe("unavailable");
  });
  it("expires stale evidence after refresh fails and backs off", async () => {
    const lookup = createReputationLookup();
    await lookup("bad.example");
    await vi.advanceTimersByTimeAsync(3600000);
    upstream.mockRejectedValue(new Error("offline"));
    expect(await lookup("bad.example")).toMatchObject({ blocklisted: null, status: "stale", fetchedAt: "2026-09-22T00:00:00.000Z" });
    await lookup("safe.example");
    expect(upstream).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(60000);
    upstream.mockImplementation(async () => new Response(feed));
    expect((await lookup("bad.example")).status).toBe("available");
    expect(upstream).toHaveBeenCalledTimes(3);
  });
  it("coalesces failed cold starts and waits before retrying", async () => {
    upstream.mockRejectedValue(new Error("offline"));
    const lookup = createReputationLookup();
    await Promise.all([lookup("bad.example"), lookup("safe.example")]);
    await lookup("bad.example");
    expect(upstream).toHaveBeenCalledTimes(1);
  });
  it("aborts a body stalled after headers and returns unknown", async () => {
    upstream.mockImplementation(async (_url, options) => new Response(new ReadableStream({
      start(controller) {
        options.signal.addEventListener("abort", () => controller.error(new Error("aborted")));
      },
    })));
    const request = createReputationLookup()("bad.example");
    await vi.advanceTimersByTimeAsync(3501);
    expect((await request).status).toBe("unavailable");
  });
  it("validates the HTTP route and encodes unavailability explicitly", async () => {
    const app = Fastify(); registerReputationRoute(app);
    try {
      expect((await app.inject({ url: "/reputation/not_a_host" })).statusCode).toBe(400);
      expect(upstream).not.toHaveBeenCalled();
      const response = await app.inject({ url: "/reputation/BAD.EXAMPLE." });
      expect(response.statusCode).toBe(200);
      expect(response.json().blocklisted).toBe(true);
      expect(response.headers["cache-control"]).toBe("no-store");
    } finally { await app.close(); }
  });
});
