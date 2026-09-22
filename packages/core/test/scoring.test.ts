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

  it("no data at all yields nao_verificado, never baixo_risco", () => {
    const result = computeScore({
      storeCnpj: "11222333000181",
      cnpjRecord: null,
      domainAgeDays: null,
    });
    expect(result.verdict).toBe("nao_verificado");
  });

  it("a well-known site without a CNPJ is low risk, not atencao", () => {
    // The bug this guards: a 20-year-old domain that simply has no reason to
    // publish a CNPJ used to score 30 and come back yellow.
    const result = computeScore({ storeCnpj: null, domainAgeDays: 20 * 365 });
    expect(result.score).toBe(0);
    expect(result.verdict).toBe("baixo_risco");
    expect(result.signals.find((s) => s.key === "no_cnpj")?.status).toBe("unverified");
  });

  it("a missing CNPJ does count against a page that asks for Pix", () => {
    const result = computeScore({ storeCnpj: null, pix: { keyType: "random" }, domainAgeDays: 400 });
    expect(result.signals.some((s) => s.key === "no_cnpj_with_payment")).toBe(true);
    expect(result.verdict).toBe("atencao");
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

  it("an established, CNPJ-coherent site scores low risk", () => {
    const result = computeScore({
      storeCnpj: "11222333000181",
      cnpjRecord: { status: "ativa" },
      domainAgeDays: 3000,
    });
    expect(result.score).toBe(0);
    expect(result.verdict).toBe("baixo_risco");
    expect(result.signals.some((s) => s.key === "cnpj_active")).toBe(true);
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


describe("warnings survive reputation bonuses", () => {
  it("keeps a brand warning visible on old popular domains", () => {
    const result = computeScore({ domainImitatesBrand: true, domainAgeDays: 9000, domainRankTop100k: true });
    expect(result.score).toBe(30);
    expect(result.verdict).toBe("atencao");
  });
  it("keeps blocklist score consistent with the verdict", () => {
    expect(computeScore({ siteBlocklisted: true, domainAgeDays: 9000, domainRankTop100k: true }).score).toBe(100);
  });
  it("does not confuse unknown company status with inactivity", () => {
    const result = computeScore({ cnpjRecord: { status: "desconhecida" } });
    expect(result.score).toBe(0);
    expect(result.verdict).toBe("nao_verificado");
  });
});

it("a negative feed lookup alone does not prove low risk", () => {
  expect(computeScore({ siteBlocklisted: false }).verdict).toBe("nao_verificado");
});
