import { describe, expect, it } from "vitest";
import {
  baitWords,
  brandImpersonation,
  domainImitatesBrand,
  hasCheapTld,
  hasRestrictedTld,
  isIpHost,
  isPunycode,
  officialBrandFor,
  registrableDomain,
  sharedHostingPlatform,
} from "../src/domain.js";

describe("registrableDomain", () => {
  it("strips subdomains so RDAP gets a domain it actually knows", () => {
    expect(registrableDomain("www.facebook.com")).toBe("facebook.com");
    expect(registrableDomain("shop.loja.example.com")).toBe("example.com");
  });

  it("keeps the second level for Brazilian multi-label suffixes", () => {
    expect(registrableDomain("www.magazineluiza.com.br")).toBe("magazineluiza.com.br");
    expect(registrableDomain("magazineluiza.com.br")).toBe("magazineluiza.com.br");
  });

  it("leaves an already-bare domain alone", () => {
    expect(registrableDomain("facebook.com")).toBe("facebook.com");
  });
});

describe("domainImitatesBrand", () => {
  it("flags a brand name worn by someone else's domain", () => {
    expect(domainImitatesBrand("magazineluiza-ofertas.shop")).toBe(true);
    expect(domainImitatesBrand("correios-rastreio.com")).toBe(true);
    expect(domainImitatesBrand("magazineluizaofertas.xyz")).toBe(true);
    expect(domainImitatesBrand("caixa-atendimento.top")).toBe(true);
  });

  it("leaves the brand's own site, and its subdomains, alone", () => {
    expect(domainImitatesBrand("www.magazineluiza.com.br")).toBe(false);
    expect(domainImitatesBrand("ofertas.magazineluiza.com.br")).toBe(false);
    expect(domainImitatesBrand("www.correios.com.br")).toBe(false);
    expect(domainImitatesBrand("caixa.gov.br")).toBe(false);
  });

  it("does not flag ordinary words that merely contain a short brand token", () => {
    // "caixa" and "claro" are everyday Portuguese; only a whole segment counts.
    expect(domainImitatesBrand("caixadagua.com.br")).toBe(false);
    expect(domainImitatesBrand("clarodocelular.com.br")).toBe(false);
  });

  it("ignores a site with no brand name in it", () => {
    expect(domainImitatesBrand("lojadobairro.com.br")).toBe(false);
  });
});

describe("hasCheapTld", () => {
  it("recognises the registries scams cluster on", () => {
    expect(hasCheapTld("oferta.shop")).toBe(true);
    expect(hasCheapTld("promo.xyz")).toBe(true);
  });

  it("leaves ordinary TLDs alone", () => {
    expect(hasCheapTld("loja.com.br")).toBe(false);
    expect(hasCheapTld("facebook.com")).toBe(false);
  });
});

describe("brandImpersonation", () => {
  it("names the brand worn outright", () => {
    expect(brandImpersonation("nubank-app.com")).toEqual({ brand: "Nubank", kind: "name" });
  });

  it("catches a brand one letter off", () => {
    expect(brandImpersonation("mercadolivrre.com")).toEqual({ brand: "Mercado Livre", kind: "typo" });
    expect(brandImpersonation("nubamk.com")).toEqual({ brand: "Nubank", kind: "typo" });
    expect(brandImpersonation("mercado-livre-ofertas.com")?.brand).toBe("Mercado Livre");
  });

  it("catches digits and letter pairs posing as letters", () => {
    expect(brandImpersonation("rnercadolivre.com")?.kind).toBe("typo");
    expect(brandImpersonation("sh0pee-promo.com")?.brand).toBe("Shopee");
  });

  it("catches the government suffix used as a subdomain", () => {
    expect(brandImpersonation("servicos.gov.br.consulta.online")?.brand).toBe("gov.br");
    expect(brandImpersonation("www.gov.br")).toBeNull();
  });

  it("does not flag ordinary words that happen to contain a brand", () => {
    for (const host of [
      "caixa-de-som.com.br",
      "portaldaamazonia.com.br",
      "amazonas.am.gov.br",
      "s3.amazonaws.com",
      "correias.com.br",
      "jornal-correio.com.br",
      "americana.sp.gov.br",
      "benner.com.br",
      "vivo-bem.com.br",
    ]) {
      expect(brandImpersonation(host), host).toBeNull();
    }
  });

  it("flags an everyday-word brand once the address says what the scam is about", () => {
    expect(brandImpersonation("caixa-fgts-saque.com")?.brand).toBe("Caixa");
    expect(brandImpersonation("claro-fatura.com")?.brand).toBe("Claro");
  });

  it("ignores IP addresses", () => {
    expect(brandImpersonation("192.168.0.1")).toBeNull();
  });
});

describe("hostname trust and risk markers", () => {
  it("names the brand behind an official domain", () => {
    expect(officialBrandFor("www.nubank.com.br")).toBe("Nubank");
    expect(officialBrandFor("ofertas.magazineluiza.com.br")).toBe("Magazine Luiza");
    expect(officialBrandFor("lojadobairro.com.br")).toBeNull();
    expect(officialBrandFor("caixa.gov.br")).toBe("Caixa");
  });

  it("recognises suffixes that require proof of identity", () => {
    expect(hasRestrictedTld("www.gov.br")).toBe(true);
    expect(hasRestrictedTld("receita.fazenda.gov.br")).toBe(true);
    expect(hasRestrictedTld("tjsp.jus.br")).toBe(true);
    expect(hasRestrictedTld("gov.br.golpe.com")).toBe(false);
    expect(hasRestrictedTld("meugov.com.br")).toBe(false);
  });

  it("identifies free hosting platforms only for pages on them", () => {
    expect(sharedHostingPlatform("golpe.vercel.app")).toBe("vercel.app");
    expect(sharedHostingPlatform("sites.google.com")).toBe("sites.google.com");
    expect(sharedHostingPlatform("vercel.app")).toBeNull();
    expect(sharedHostingPlatform("www.google.com")).toBeNull();
  });

  it("finds lure words whole or glued", () => {
    expect(baitWords("correios-rastreio.com")).toContain("rastreio");
    expect(baitWords("saque-fgts-2026.com")).toEqual(expect.arrayContaining(["saque", "fgts"]));
    expect(baitWords("desbloqueiodeconta.com")).toContain("desbloqueio");
    expect(baitWords("lojadobairro.com.br")).toEqual([]);
  });

  it("spots punycode and IP hosts", () => {
    expect(isPunycode("xn--nubnk-3ve.com")).toBe(true);
    expect(isPunycode("nubank.com.br")).toBe(false);
    expect(isIpHost("203.0.113.9")).toBe(true);
    expect(isIpHost("[::1]")).toBe(true);
    expect(isIpHost("example.com")).toBe(false);
  });
});
