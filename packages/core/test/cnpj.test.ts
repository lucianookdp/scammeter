import { describe, expect, it } from "vitest";
import { extractCnpjCandidates, findValidCnpjInText, formatCnpj, validateCnpj } from "../src/cnpj.js";

describe("validateCnpj", () => {
  it("accepts a known-valid numeric CNPJ, formatted or raw", () => {
    expect(validateCnpj("11.222.333/0001-81")).toBe(true);
    expect(validateCnpj("11222333000181")).toBe(true);
  });

  it("rejects a wrong check digit", () => {
    expect(validateCnpj("11.222.333/0001-80")).toBe(false);
  });

  it("rejects garbage input", () => {
    expect(validateCnpj("not a cnpj")).toBe(false);
    expect(validateCnpj("123")).toBe(false);
  });

  it("rejects all-identical-digit CNPJs even though they pass the checksum trivially", () => {
    expect(validateCnpj("00000000000000")).toBe(false);
    expect(validateCnpj("11111111111111")).toBe(false);
  });

  it("keeps the same digit math for the alphanumeric format (letters valid as chars, still checksum-checked)", () => {
    // Same base as the valid fixture above but with a letter substituted for a digit:
    // it must NOT validate, because the checksum no longer matches the changed value.
    expect(validateCnpj("1A.222.333/0001-81")).toBe(false);
  });
});

describe("formatCnpj", () => {
  it("adds the standard punctuation", () => {
    expect(formatCnpj("11222333000181")).toBe("11.222.333/0001-81");
  });
});

describe("extractCnpjCandidates / findValidCnpjInText", () => {
  it("finds a valid CNPJ inside page text", () => {
    const html = "<footer>CNPJ: 11.222.333/0001-81 — Todos os direitos reservados</footer>";
    expect(extractCnpjCandidates(html)).toContain("11222333000181");
    expect(findValidCnpjInText(html)).toBe("11222333000181");
  });

  it("returns null when no valid CNPJ is present", () => {
    expect(findValidCnpjInText("Fale conosco pelo WhatsApp")).toBeNull();
    expect(findValidCnpjInText("CNPJ: 11.222.333/0001-00")).toBeNull();
  });
});
