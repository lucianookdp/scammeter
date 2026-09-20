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

describe("parseSiteUrl — hostile and malformed input", () => {
  it("rejects a javascript: payload instead of prefixing https:// onto it", () => {
    // The old code only tested for a leading http(s)://, so anything else got
    // "https://" glued on front and silently became a weird but valid URL.
    expect(() => parseSiteUrl("javascript:alert(1)")).toThrow("unsupported_scheme");
    expect(() => parseSiteUrl("JavaScript:alert(1)")).toThrow("unsupported_scheme");
  });

  it("rejects other schemes we can't check", () => {
    expect(() => parseSiteUrl("data:text/html,<h1>x</h1>")).toThrow("unsupported_scheme");
    expect(() => parseSiteUrl("file:///etc/passwd")).toThrow("unsupported_scheme");
    expect(() => parseSiteUrl("ftp://example.com")).toThrow("unsupported_scheme");
  });

  it("rejects a link with embedded credentials", () => {
    // Also the classic phishing shape: the real host is the one after the @.
    expect(() => parseSiteUrl("https://mercadolivre.com.br@evil.example")).toThrow("url_has_credentials");
    expect(() => parseSiteUrl("https://user:senha@loja.com.br")).toThrow("url_has_credentials");
  });

  it("rejects an absurdly long link rather than shipping it to the proxy", () => {
    expect(() => parseSiteUrl(`https://loja.com.br/${"a".repeat(3000)}`)).toThrow("url_too_long");
  });

  it("names the specific problem so the page can explain it", () => {
    expect(() => parseSiteUrl("")).toThrow("empty_url");
    expect(() => parseSiteUrl("golpe")).toThrow("no_tld");
  });

  it("survives unicode and punycode hostnames without throwing something unexpected", () => {
    expect(parseSiteUrl("lojaçúcar.com.br").hostname).toContain("xn--");
    expect(parseSiteUrl("xn--80ak6aa92e.com").hostname).toBe("xn--80ak6aa92e.com");
  });

  it("does not choke on a trailing dot or an uppercase host", () => {
    expect(parseSiteUrl("LOJA.COM.BR").hostname).toBe("loja.com.br");
    expect(parseSiteUrl("loja.com.br.").hostname).toBe("loja.com.br.");
  });
});
