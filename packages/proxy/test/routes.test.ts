import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { resetRateLimit } from "../src/rateLimit.js";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp({ logger: false });
  await app.ready();
});
afterAll(async () => app.close());
beforeEach(() => resetRateLimit());

// Nothing here should ever touch the network. Any route that tries is a bug.
const noNetwork = () => {
  vi.stubGlobal("fetch", async () => {
    throw new Error("test tried to reach the network");
  });
};

describe("hardening that applies to every route", () => {
  it("answers the health check", async () => {
    const res = await app.inject({ method: "GET", url: "/" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "ok" });
  });

  it("sets the headers that keep a JSON API from being treated as a document", async () => {
    const res = await app.inject({ method: "GET", url: "/" });
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
  });

  it("actually stops a caller past the limit instead of only saying so", async () => {
    // The hook used to send 429 without returning the reply, so Fastify ran
    // the handler anyway and the caller got their data.
    const flood = [];
    for (let i = 0; i < 35; i++) {
      flood.push(await app.inject({ method: "GET", url: "/", remoteAddress: "7.7.7.7" }));
    }
    const limited = flood.filter((r) => r.statusCode === 429);
    expect(limited.length).toBeGreaterThan(0);
    expect(limited[0].json()).toEqual({ error: "rate_limited" });
  });

  it("returns 404 for an unknown path rather than leaking a stack trace", async () => {
    const res = await app.inject({ method: "GET", url: "/../../etc/passwd" });
    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain("at ");
  });
});

describe("/cnpj — input it must refuse before making any request", () => {
  beforeEach(noNetwork);

  it("rejects a CNPJ that fails its own check digits", async () => {
    const res = await app.inject({ method: "GET", url: "/cnpj/11111111111111" });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "invalid_cnpj" });
  });

  it("rejects the wrong number of digits", async () => {
    for (const bad of ["1", "123456789", "112223330001811111"]) {
      expect((await app.inject({ method: "GET", url: `/cnpj/${bad}` })).statusCode).toBe(400);
    }
  });

  it("rejects path-traversal and injection shapes in the parameter", async () => {
    for (const bad of ["..%2F..%2Fetc%2Fpasswd", "abc", "%00", "11222333000181%20OR%201=1"]) {
      const res = await app.inject({ method: "GET", url: `/cnpj/${bad}` });
      expect([400, 404]).toContain(res.statusCode);
    }
  });
});

describe("/domain — hostname validation", () => {
  beforeEach(noNetwork);

  it("rejects anything that isn't a plain hostname", async () => {
    for (const bad of [
      "localhost",
      "not_a_host",
      "exa mple.com",
      "http%3A%2F%2Fevil.com",
      "-leading-hyphen.com",
      `${"a".repeat(80)}.com`,
    ]) {
      const res = await app.inject({ method: "GET", url: `/domain/${bad}` });
      expect(res.statusCode, `expected ${bad} to be rejected`).toBe(400);
    }
  });
});

describe("/scan — the route that fetches a URL on the caller's behalf", () => {
  beforeEach(noNetwork);

  it("requires a url", async () => {
    expect((await app.inject({ method: "GET", url: "/scan" })).statusCode).toBe(400);
  });

  it("refuses schemes that aren't http(s)", async () => {
    for (const bad of ["file:///etc/passwd", "ftp://example.com", "gopher://example.com/"]) {
      const res = await app.inject({ method: "GET", url: `/scan?url=${encodeURIComponent(bad)}` });
      expect(res.statusCode, bad).toBe(400);
    }
  });

  it("refuses a URL with embedded credentials", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/scan?url=${encodeURIComponent("https://user:pass@example.com")}`,
    });
    expect(res.statusCode).toBe(400);
  });

  it("refuses ports that aren't the web's", async () => {
    // Otherwise we are a proxy for reaching Redis, SSH or an admin panel.
    for (const port of [22, 6379, 3306, 25]) {
      const res = await app.inject({
        method: "GET",
        url: `/scan?url=${encodeURIComponent(`http://example.com:${port}/`)}`,
      });
      expect(res.statusCode, `port ${port}`).toBe(400);
    }
  });

  it("refuses an over-long URL before parsing it", async () => {
    const long = `https://example.com/${"a".repeat(3000)}`;
    const res = await app.inject({ method: "GET", url: `/scan?url=${encodeURIComponent(long)}` });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "url_too_long" });
  });

  it("reports a private target as unfetched instead of fetching it", async () => {
    // The SSRF guard runs before the fetch, so this must not hit `noNetwork`.
    for (const target of ["http://127.0.0.1/", "http://169.254.169.254/latest/meta-data/", "http://10.0.0.1/"]) {
      const res = await app.inject({ method: "GET", url: `/scan?url=${encodeURIComponent(target)}` });
      expect(res.statusCode, target).toBe(200);
      expect(res.json()).toMatchObject({ fetched: false, cnpj: null, pixPayload: null });
    }
  });
});

describe("/reputation — the stub", () => {
  it("reports unverified rather than inventing a clean result", async () => {
    const res = await app.inject({ method: "GET", url: "/reputation/example.com" });
    expect(res.json()).toEqual({ blocklisted: null, top100k: null });
  });
});
