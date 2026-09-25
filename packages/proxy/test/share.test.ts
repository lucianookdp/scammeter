import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { resetRateLimit } from "../src/rateLimit.js";
import { shareTarget } from "../src/routes/share.js";

vi.mock("../src/ssrf.js", () => ({ resolvesToPrivateIp: async () => false }));
afterEach(() => {
  vi.unstubAllGlobals();
  resetRateLimit();
});

describe("shareTarget", () => {
  it("keeps scheme, host and path, and drops the query and fragment", () => {
    expect(shareTarget("https://loja.example.com/produto/1?email=a@b.com&token=x#top")?.href).toBe(
      "https://loja.example.com/produto/1",
    );
  });

  it("refuses anything that isn't a plain web address", () => {
    for (const raw of [undefined, "", "javascript:alert(1)", "ftp://x.com", "https://user:pw@x.com", "https://localhost", "x".repeat(3000)]) {
      expect(shareTarget(raw)).toBeNull();
    }
  });
});

describe("GET /share", () => {
  it("computes the verdict itself and previews it, with no scripts", async () => {
    // Every upstream unreachable: the verdict has to come from the address alone.
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const app = await buildApp({ logger: false });
    try {
      const res = await app.inject({
        url: `/share?url=${encodeURIComponent("https://nubank-seguranca.vercel.app/login?cpf=123&verdict=baixo_risco")}`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("text/html");
      expect(res.headers["content-security-policy"]).toBe("default-src 'none'; img-src https:");
      expect(res.body).toContain('content="nubank-seguranca.vercel.app: Risco muito alto (100/100)"');
      expect(res.body).toContain("/og/muito_alto_risco.png");
      expect(res.body).not.toContain("cpf=123");
      expect(res.body).not.toContain("<script");
    } finally {
      await app.close();
    }
  });

  it("rejects a missing or bad url", async () => {
    const app = await buildApp({ logger: false });
    try {
      expect((await app.inject({ url: "/share" })).statusCode).toBe(400);
      expect((await app.inject({ url: "/share?url=javascript:alert(1)" })).statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });
});
