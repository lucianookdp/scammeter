import { describe, expect, it } from "vitest";
import { computeScore } from "../src/scoring.js";

describe("computeScore", () => {
  it("blocklist forces alto_risco regardless of any bonus", () => {
    const result = computeScore({
      siteBlocklisted: true,
      domainRankTop100k: true, // even a big negative-point bonus can't downgrade the verdict
    });
    expect(result.verdict).toBe("alto_risco");
  });

  it("insufficient data yields nao_verificado, never baixo_risco", () => {
    const result = computeScore({
      storeCnpj: "11222333000181",
      cnpjRecord: null,
      domainAgeDays: null,
    });
    expect(result.verdict).toBe("nao_verificado");
  });

  it("Pix to a personal key is a strong signal", () => {
    const result = computeScore({
      pix: { keyType: "cpf" },
      storeCnpj: "11222333000181",
      cnpjRecord: { status: "ativa" },
      domainAgeDays: 400,
    });
    expect(result.score).toBeGreaterThanOrEqual(50);
    expect(result.verdict).toBe("alto_risco");
    expect(result.signals.some((s) => s.key === "pix_personal")).toBe(true);
  });

  it("an established, popular, CNPJ-coherent site scores low risk", () => {
    const result = computeScore({
      storeCnpj: "11222333000181",
      cnpjRecord: { status: "ativa" },
      domainAgeDays: 3000,
      domainRankTop100k: true,
    });
    expect(result.score).toBe(0);
    expect(result.verdict).toBe("baixo_risco");
  });

  it("clamps the score at 100 even with overlapping high-weight signals", () => {
    const result = computeScore({
      siteBlocklisted: true,
      pix: { keyType: "cpf" },
      storeCnpj: null,
      domainAgeDays: 2,
    });
    expect(result.score).toBe(100);
  });

  it("flags a marketplace as a distinct, zero-point notice", () => {
    const result = computeScore({ isMarketplace: true, storeCnpj: "11222333000181", cnpjRecord: { status: "ativa" }, domainAgeDays: 3000 });
    expect(result.signals[0].key).toBe("marketplace_notice");
    expect(result.signals[0].points).toBe(0);
  });
});
