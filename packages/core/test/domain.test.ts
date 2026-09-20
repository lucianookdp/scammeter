import { describe, expect, it } from "vitest";
import { domainImitatesBrand, hasCheapTld, registrableDomain } from "../src/domain.js";

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
