import { describe, expect, it } from "vitest";
import { parseSiteUrl } from "../src/url.js";

describe("parseSiteUrl", () => {
  it("accepts a bare domain, the #1 real-world case (the mercadolivre.com.br bug)", () => {
    expect(parseSiteUrl("mercadolivre.com.br").hostname).toBe("mercadolivre.com.br");
  });

  it("accepts a bare domain with www", () => {
    expect(parseSiteUrl("www.mercadolivre.com.br").hostname).toBe("www.mercadolivre.com.br");
  });

  it("accepts an explicit https:// or http:// link unchanged in scheme", () => {
    expect(parseSiteUrl("https://www.mercadolivre.com.br").protocol).toBe("https:");
    expect(parseSiteUrl("http://example.com").protocol).toBe("http:");
  });

  it("is case-insensitive about an existing scheme", () => {
    expect(parseSiteUrl("HTTPS://example.com").hostname).toBe("example.com");
  });

  it("trims surrounding whitespace (pasted from WhatsApp often has it)", () => {
    expect(parseSiteUrl("  mercadolivre.com.br  ").hostname).toBe("mercadolivre.com.br");
  });

  it("keeps a path and query string intact", () => {
    const url = parseSiteUrl("loja.com.br/produto?id=123");
    expect(url.hostname).toBe("loja.com.br");
    expect(url.pathname).toBe("/produto");
    expect(url.search).toBe("?id=123");
  });

  it("rejects empty input", () => {
    expect(() => parseSiteUrl("")).toThrow();
  });

  it("rejects whitespace-only input", () => {
    expect(() => parseSiteUrl("   ")).toThrow();
  });

  it("rejects plain garbage text with no dot", () => {
    expect(() => parseSiteUrl("golpe")).toThrow();
  });

  it("does not misfire on a scheme-like word inside the domain", () => {
    // must not just check .includes("http") — "httpsomething.com" has no real scheme
    expect(parseSiteUrl("httpsomething.com").protocol).toBe("https:");
    expect(parseSiteUrl("httpsomething.com").hostname).toBe("httpsomething.com");
  });
});
