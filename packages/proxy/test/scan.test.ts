import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { registerScanRoute } from "../src/routes/scan.js";
vi.mock("../src/ssrf.js", () => ({ resolvesToPrivateIp: async () => false }));
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("scan response boundaries", () => {
  it("keeps different query strings in separate cache entries", async () => {
    const fetchMock = vi.fn(async () => new Response("<html>hello</html>"));
    vi.stubGlobal("fetch", fetchMock);
    const app = Fastify(); registerScanRoute(app);
    try {
      for (const query of ["one", "two", "one"]) {
        await app.inject({ url: `/scan?url=${encodeURIComponent(`https://cache.example/product?id=${query}`)}` });
      }
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally { await app.close(); }
  });
  it("aborts a body that stalls after headers arrive", async () => {
    vi.useFakeTimers();
    let started!: () => void;
    const reading = new Promise<void>(resolve => { started = resolve; });
    vi.stubGlobal("fetch", vi.fn(async (_url, options) => new Response(new ReadableStream({
      start(controller) {
        options.signal.addEventListener("abort", () => controller.error(new Error("aborted")));
        started();
      },
    }))));
    const app = Fastify(); registerScanRoute(app);
    try {
      const response = app.inject({ url: `/scan?url=${encodeURIComponent("https://stall.example/")}` });
      await reading;
      await vi.advanceTimersByTimeAsync(8001);
      expect((await response).json()).toMatchObject({ fetched: false });
    } finally { await app.close(); }
  });
});
