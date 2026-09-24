import { describe, expect, it } from "vitest";
import { computeScore } from "../src/scoring.js";
import { analyzeHostname } from "../src/domain.js";

describe("computeScore", () => {
  it("blocklist forces muito_alto_risco regardless of any bonus", () => {
    const result = computeScore({
      siteBlocklisted: true,
      domainRankTop100k: true, // even a big negative-point bonus can't downgrade the verdict
    });
    expect(result.verdict).toBe("muito_alto_risco");
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
    expect(result.score).toBe(45);
    expect(result.verdict).toBe("alto_risco");
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

// The address alone plus what the lookups returned, the way the page calls it.
const scoreFor = (host: string, rest: Parameters<typeof computeScore>[0] = {}) =>
  computeScore({ ...analyzeHostname(host), ...rest });

describe("obvious scams land high, not in the yellow", () => {
  it.each([
    ["mercadolivrre.com", { storeCnpj: null, domainAgeDays: 10 }],
    ["nubank-login.vercel.app", { domainAgeDays: 4000, domainRankTop100k: true }],
    ["magazineluiza-ofertas.shop", { storeCnpj: null, domainAgeDays: 5 }],
    ["caixa-fgts-saque.com", { domainAgeDays: 8 }],
    ["super-ofertas-tenis.online", { storeCnpj: null, domainAgeDays: 12 }],
  ] as const)("%s is muito_alto_risco", (host, rest) => {
    expect(scoreFor(host, rest).verdict).toBe("muito_alto_risco");
  });

  it("a cheap-TLD shop a few weeks old is high risk, not low", () => {
    const result = scoreFor("tenisbarato.shop", { storeCnpj: null, domainAgeDays: 40 });
    expect(result.score).toBeGreaterThanOrEqual(40);
    expect(result.verdict).toBe("alto_risco");
  });

  it("combinations are listed as their own weighted lines", () => {
    const result = scoreFor("nubank-seguranca.com", { domainAgeDays: 3 });
    expect(result.signals.map((s) => s.key)).toEqual(expect.arrayContaining(["combo_brand_new", "combo_brand_bait"]));
    expect(result.signals.find((s) => s.key === "brand_lookalike")?.params).toEqual({ brand: "Nubank" });
  });
});

describe("shared hosting", () => {
  it("does not let a page inherit the platform's age or ranking", () => {
    const result = scoreFor("nubank-login.vercel.app", { domainAgeDays: 4000, domainRankTop100k: true });
    expect(result.signals.some((s) => s.key === "domain_established" || s.key === "tranco_top100k")).toBe(false);
    expect(result.signals.find((s) => s.key === "shared_hosting")?.params).toEqual({ platform: "vercel.app" });
  });

  it("an ordinary page on a platform is worth a look, not an alarm", () => {
    expect(scoreFor("fulano.github.io", { domainAgeDays: 5000 }).verdict).toBe("atencao");
  });
});

describe("trusted sites go to zero", () => {
  it("a brand's official domain scores 0 even when RDAP fails", () => {
    const result = scoreFor("nubank.com.br", { domainAgeDays: null });
    expect(result.score).toBe(0);
    expect(result.verdict).toBe("baixo_risco");
    expect(result.signals.find((s) => s.key === "official_domain")?.params).toEqual({ brand: "Nubank" });
  });

  it("a restricted government suffix scores 0", () => {
    expect(scoreFor("www.gov.br", { storeCnpj: null }).score).toBe(0);
    expect(scoreFor("www.gov.br", { storeCnpj: null }).verdict).toBe("baixo_risco");
  });

  it("popularity plus age clears a cheap TLD", () => {
    expect(scoreFor("abc.xyz", { domainAgeDays: 4000, domainRankTop100k: true }).verdict).toBe("baixo_risco");
  });

  it("an official domain on a blocklist is still flagged", () => {
    expect(scoreFor("nubank.com.br", { siteBlocklisted: true }).verdict).toBe("muito_alto_risco");
  });
});

describe("sites with no track record", () => {
  it("a months-old site with nothing to vouch for it is not low risk", () => {
    const result = scoreFor("lojinha.com.br", { storeCnpj: null, domainAgeDays: 200 });
    expect(result.score).toBe(30);
    expect(result.verdict).toBe("atencao");
    expect(result.signals.some((s) => s.key === "no_track_record")).toBe(true);
  });

  it("an active CNPJ is a track record", () => {
    const result = scoreFor("lojinha.com.br", { storeCnpj: "11222333000181", cnpjRecord: { status: "ativa" }, domainAgeDays: 200 });
    expect(result.signals.some((s) => s.key === "no_track_record")).toBe(false);
  });

  it("the age penalty fades across the first year", () => {
    const pointsAt = (days: number) => computeScore({ domainAgeDays: days, cnpjRecord: { status: "ativa" } }).score;
    expect([pointsAt(10), pointsAt(60), pointsAt(120), pointsAt(300), pointsAt(400)]).toEqual([35, 25, 15, 10, 0]);
  });
});

describe("typosquats", () => {
  it("a near-miss spelling online for years is a softer signal", () => {
    const result = computeScore({ brandTyposquat: true, impersonatedBrand: "Renner", domainAgeDays: 4000 });
    expect(result.signals.some((s) => s.key === "brand_typosquat_old")).toBe(true);
    expect(result.verdict).toBe("atencao");
  });
});
