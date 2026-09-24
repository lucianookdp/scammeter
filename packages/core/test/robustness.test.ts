import { describe, expect, it } from "vitest";
import { computeScore } from "../src/scoring.js";
import { parsePixPayload, findPixPayloadInText, parseTLV, classifyPixKey } from "../src/pix.js";
import { findValidCnpjInText, normalizeCnpj, validateCnpj } from "../src/cnpj.js";
import { analyzeHostname, domainImitatesBrand, hasCheapTld, registrableDomain } from "../src/domain.js";

// Everything here is text pulled off a stranger's web page. None of it is
// trustworthy, and none of it is allowed to hang, throw, or take forever.

const HOSTILE_STRINGS = [
  "",
  " ",
  String.fromCharCode(0),
  "null",
  "undefined",
  "../../etc/passwd",
  "<script>alert(1)</script>",
  "'; DROP TABLE users; --",
  "%%%%%%",
  "\u{1F642}".repeat(100),
  ["", "", ""].join(String.fromCharCode(10)),
  "a".repeat(10_000),
];

describe("parsers survive hostile page content", () => {
  it("parsePixPayload returns null instead of throwing", () => {
    for (const s of HOSTILE_STRINGS) {
      expect(() => parsePixPayload(s)).not.toThrow();
      expect(parsePixPayload(s)).toBeNull();
    }
  });

  it("parseTLV terminates on a length field that lies", () => {
    // "99" claims 99 bytes that aren't there; the parser must stop, not spin.
    expect(() => parseTLV("0099short")).not.toThrow();
    expect(parseTLV("0099short")).toEqual([]);
    expect(parseTLV("00-5abcde")).toEqual([]); // non-numeric length
  });

  it("parseTLV does not loop forever on a zero-length field", () => {
    const start = Date.now();
    expect(() => parseTLV("0000".repeat(5000))).not.toThrow();
    expect(Date.now() - start).toBeLessThan(1000);
  });

  it("findPixPayloadInText stays bounded on a page that is one huge digit run", () => {
    const start = Date.now();
    expect(findPixPayloadInText(`000201${"0".repeat(500_000)}`)).toBeNull();
    expect(Date.now() - start).toBeLessThan(1000);
  });

  it("findPixPayloadInText ignores a marker with no Pix GUI behind it", () => {
    expect(findPixPayloadInText("00020163041234")).toBeNull();
  });

  it("findValidCnpjInText returns null rather than a wrong answer", () => {
    for (const s of HOSTILE_STRINGS) {
      expect(() => findValidCnpjInText(s)).not.toThrow();
    }
    // Fourteen digits that fail the check digits are not a CNPJ.
    expect(findValidCnpjInText("11.111.111/1111-11")).toBeNull();
  });

  it("classifyPixKey never throws and never guesses", () => {
    for (const s of HOSTILE_STRINGS) {
      expect(() => classifyPixKey(s)).not.toThrow();
    }
    expect(classifyPixKey("")).toBe("unknown");
  });

  it("CNPJ helpers tolerate junk", () => {
    for (const s of HOSTILE_STRINGS) {
      expect(() => normalizeCnpj(s)).not.toThrow();
      expect(validateCnpj(s)).toBe(false);
    }
  });

  it("domain helpers tolerate junk hostnames", () => {
    for (const s of HOSTILE_STRINGS) {
      expect(() => registrableDomain(s)).not.toThrow();
      expect(() => domainImitatesBrand(s)).not.toThrow();
      expect(() => hasCheapTld(s)).not.toThrow();
      expect(() => computeScore(analyzeHostname(s))).not.toThrow();
    }
  });
});

describe("computeScore is total — no input shape breaks it", () => {
  it("handles a completely empty input", () => {
    const result = computeScore({});
    expect(result.score).toBe(0);
    expect(result.verdict).toBe("nao_verificado");
  });

  it("never produces a score outside 0..100", () => {
    const everythingBad = computeScore({
      siteBlocklisted: true,
      pix: { keyType: "cpf" },
      storeCnpj: null,
      cnpjRecord: { status: "baixada" },
      domainAgeDays: 1,
      domainImitatesBrand: true,
      cnaeMismatch: true,
      registrantMismatch: true,
      missingAddress: true,
      missingReturnPolicy: true,
      contactOnlyWhatsappOrFreeEmail: true,
      cheapTldPrivateWhois: true,
      brokenSocialLinks: true,
    });
    expect(everythingBad.score).toBe(100);

    const everythingGood = computeScore({
      domainRankTop100k: true,
      domainAgeDays: 20 * 365,
      storeCnpj: "11222333000181",
      cnpjRecord: { status: "ativa" },
    });
    expect(everythingGood.score).toBe(0);
  });

  it("treats a negative or absurd domain age as unusable rather than as evidence", () => {
    // A registry clock skew or a bad parse must not mint a "brand new site" alert.
    expect(computeScore({ domainAgeDays: -5 }).signals.some((s) => s.key === "domain_new")).toBe(false);
    expect(computeScore({ domainAgeDays: Number.NaN }).verdict).toBe("nao_verificado");
    expect(computeScore({ domainAgeDays: Number.POSITIVE_INFINITY }).score).toBe(0);
  });

  it("a blocklisted site is high risk even when every other signal is clean", () => {
    const result = computeScore({
      siteBlocklisted: true,
      domainAgeDays: 20 * 365,
      storeCnpj: "11222333000181",
      cnpjRecord: { status: "ativa" },
      domainRankTop100k: true,
    });
    expect(result.verdict).toBe("muito_alto_risco");
  });

  it("an inactive CNPJ outweighs an old domain", () => {
    const result = computeScore({
      storeCnpj: "11222333000181",
      cnpjRecord: { status: "baixada" },
      domainAgeDays: 20 * 365,
    });
    expect(result.verdict).toBe("alto_risco");
    expect(result.signals.some((s) => s.key === "cnpj_inactive")).toBe(true);
  });

  it("a Pix paying a different company than the site names is flagged", () => {
    const result = computeScore({
      storeCnpj: "11222333000181",
      pix: { keyType: "cnpj", keyCnpj: "11.444.777/0001-61" },
      cnpjRecord: { status: "ativa" },
      domainAgeDays: 400,
    });
    expect(result.signals.some((s) => s.key === "pix_wrong_cnpj")).toBe(true);
  });

  it("the same CNPJ written in two formats is not a mismatch", () => {
    const result = computeScore({
      storeCnpj: "11222333000181",
      pix: { keyType: "cnpj", keyCnpj: "11.222.333/0001-81" },
      cnpjRecord: { status: "ativa" },
      domainAgeDays: 400,
    });
    expect(result.signals.some((s) => s.key === "pix_wrong_cnpj")).toBe(false);
  });

  it("every signal carries a reason key the UI can render", () => {
    const result = computeScore({
      siteBlocklisted: true,
      pix: { keyType: "cpf" },
      storeCnpj: null,
      domainAgeDays: 1,
      domainImitatesBrand: true,
      cheapTldPrivateWhois: true,
      isMarketplace: true,
    });
    for (const signal of result.signals) {
      expect(signal.reasonKey).toMatch(/^reason\./);
      expect(["ok", "alert", "unverified"]).toContain(signal.status);
    }
  });
});
