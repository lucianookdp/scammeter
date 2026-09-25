import { describe, expect, it } from "vitest";
import { scoringInputFrom, storeCnpjFrom } from "../src/assemble.js";

describe("storeCnpjFrom", () => {
  it("prefers the typed CNPJ, then the page's, and tells 'none' from 'unknown'", () => {
    const scan = { fetched: true, cnpj: "11222333000181", pixPayload: null };
    expect(storeCnpjFrom({ scan, manualCnpj: "33000167000101" })).toBe("33000167000101");
    expect(storeCnpjFrom({ scan })).toBe("11222333000181");
    expect(storeCnpjFrom({ scan: { ...scan, cnpj: null } })).toBeNull();
    expect(storeCnpjFrom({ scan: { fetched: false, cnpj: null, pixPayload: null } })).toBeUndefined();
  });
});

describe("scoringInputFrom", () => {
  it("combines address, page and lookups into the score's input", () => {
    const input = scoringInputFrom({
      hostname: "atendimento-online24.com",
      scan: { fetched: true, cnpj: null, pixPayload: null, title: "Nubank - Acesse sua conta", asksCredentials: true },
      domainAgeDays: 12,
      blocklisted: null,
      top100k: false,
    });
    expect(input).toMatchObject({
      titleBrand: "Nubank",
      asksCredentials: true,
      storeCnpj: null,
      domainAgeDays: 12,
      domainRankTop100k: false,
      siteBlocklisted: undefined,
    });
  });
});
