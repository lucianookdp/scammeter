import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deflateRawSync } from "node:zlib";
import Fastify from "fastify";
import { createPopularityLookup, parseTrancoCsv, unzipFirstEntry } from "../src/popularity.js";
import { registerPopularityRoute } from "../src/routes/popularity.js";

/** A one-file zip the way a streaming writer produces it: sizes only in the central directory. */
function makeZip(name: string, content: string, method: 0 | 8 = 8): Buffer {
  const raw = Buffer.from(content);
  const data = method === 8 ? deflateRawSync(raw) : raw;
  const nameBuf = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0008, 6); // sizes follow in a data descriptor
  local.writeUInt16LE(method, 8);
  local.writeUInt16LE(nameBuf.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(method, 10);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(raw.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt32LE(0, 42);
  const cdOffset = local.length + nameBuf.length + data.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length + nameBuf.length, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  return Buffer.concat([local, nameBuf, data, central, nameBuf, eocd]);
}

describe("unzipFirstEntry", () => {
  it("reads deflated and stored entries", () => {
    expect(unzipFirstEntry(makeZip("top-1m.csv", "1,google.com\n")).toString()).toBe("1,google.com\n");
    expect(unzipFirstEntry(makeZip("top-1m.csv", "1,google.com\n", 0)).toString()).toBe("1,google.com\n");
  });
  it.each([
    ["an empty buffer", Buffer.alloc(0)],
    ["an HTML error page", Buffer.from("<html>Service unavailable</html>")],
    ["a truncated archive", makeZip("a.csv", "1,a.com\n".repeat(50)).subarray(0, 40)],
  ])("rejects %s", (_label, buffer) => {
    expect(() => unzipFirstEntry(buffer)).toThrow();
  });
  it("bounds the decompressed size", () => {
    expect(() => unzipFirstEntry(makeZip("a.csv", "x".repeat(10_000)), 1000)).toThrow();
  });
});

describe("parseTrancoCsv", () => {
  it("keeps rank order, stops at the limit and skips junk", () => {
    const ranks = parseTrancoCsv("1,Google.com\r\n2,facebook.com\ngarbage\n3,,\n4,amazon.com\n5,x.com\n", 3);
    expect([...ranks]).toEqual([["google.com", 1], ["facebook.com", 2], ["amazon.com", 4]]);
  });
});

describe("cached popularity list", () => {
  const list = new Map([["google.com", 1], ["mercadolivre.com.br", 250], ["vercel.app", 900]]);
  let download: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-22T00:00:00Z"));
    download = vi.fn(async () => list);
  });
  afterEach(() => vi.useRealTimers());

  it("looks up the registrable domain and reports its rank", async () => {
    const lookup = createPopularityLookup(download);
    expect(await lookup("www.mercadolivre.com.br")).toMatchObject({
      top100k: true, rank: 250, domain: "mercadolivre.com.br", source: "Tranco", status: "available",
      fetchedAt: "2026-09-22T00:00:00.000Z",
    });
    expect(await lookup("lojadobairro.com.br")).toMatchObject({ top100k: false, rank: null });
    expect(download).toHaveBeenCalledTimes(1);
  });

  it("shares one download across concurrent callers", async () => {
    const lookup = createPopularityLookup(download);
    await Promise.all(Array.from({ length: 20 }, () => lookup("google.com")));
    expect(download).toHaveBeenCalledTimes(1);
  });

  it("reports unavailable instead of 'not popular' when the list can't load", async () => {
    download.mockRejectedValue(new Error("offline"));
    const lookup = createPopularityLookup(download);
    expect(await lookup("google.com")).toMatchObject({ top100k: null, status: "unavailable" });
    await lookup("google.com");
    expect(download).toHaveBeenCalledTimes(1); // backs off before retrying
  });

  it("keeps serving the old copy, marked stale, while a refresh fails", async () => {
    const lookup = createPopularityLookup(download);
    await lookup("google.com");
    download.mockRejectedValue(new Error("offline"));
    await vi.advanceTimersByTimeAsync(24 * 60 * 60_000);
    await lookup("google.com");
    await vi.advanceTimersByTimeAsync(0);
    expect(await lookup("google.com")).toMatchObject({ top100k: true, status: "stale" });
  });

  it("validates the HTTP route", async () => {
    const app = Fastify();
    registerPopularityRoute(app, createPopularityLookup(download));
    try {
      expect((await app.inject({ url: "/popularity/not_a_host" })).statusCode).toBe(400);
      const response = await app.inject({ url: "/popularity/WWW.GOOGLE.COM" });
      expect(response.json()).toMatchObject({ top100k: true, rank: 1 });
      expect(response.headers["cache-control"]).toBe("no-store");
    } finally {
      await app.close();
    }
  });
});
