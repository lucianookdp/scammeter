// Hostname-only heuristics. Both the web page and the extension already hold a
// hostname before any network call, so these cost nothing to compute.

// ponytail: label heuristic, not the Public Suffix List. Covers .com.br and
// friends; swap in the PSL if an exotic suffix ever shows up wrong.
const MULTI_LABEL_SLDS = new Set([
  "com", "net", "org", "gov", "edu", "mil", "int", "co", "ind", "esp",
  "adv", "art", "eco", "emp", "etc", "far", "inf", "rec", "srv", "tur", "tv",
]);

/** "www.loja.magazineluiza.com.br" -> "magazineluiza.com.br". */
export function registrableDomain(hostname: string): string {
  const labels = hostname.toLowerCase().replace(/^www\./, "").split(".");
  if (labels.length <= 2) return labels.join(".");
  const sld = labels[labels.length - 2];
  return labels.slice(MULTI_LABEL_SLDS.has(sld) ? -3 : -2).join(".");
}

// The brands Brazilian phishing actually impersonates, mapped to the domains
// that are legitimately theirs. Everything else wearing the name is a fake.
const BRANDS: Array<{ token: string; official: string[] }> = [
  { token: "magazineluiza", official: ["magazineluiza.com.br", "magalu.com.br"] },
  { token: "magalu", official: ["magalu.com.br", "magazineluiza.com.br"] },
  { token: "mercadolivre", official: ["mercadolivre.com.br", "mercadolibre.com"] },
  { token: "mercadopago", official: ["mercadopago.com.br", "mercadopago.com"] },
  { token: "americanas", official: ["americanas.com.br"] },
  { token: "casasbahia", official: ["casasbahia.com.br"] },
  { token: "pontofrio", official: ["pontofrio.com.br"] },
  { token: "submarino", official: ["submarino.com.br"] },
  { token: "shopee", official: ["shopee.com.br"] },
  { token: "aliexpress", official: ["aliexpress.com"] },
  { token: "amazon", official: ["amazon.com.br", "amazon.com"] },
  { token: "correios", official: ["correios.com.br"] },
  { token: "receitafederal", official: ["gov.br"] },
  { token: "serasa", official: ["serasa.com.br", "serasaexperian.com.br"] },
  { token: "nubank", official: ["nubank.com.br"] },
  { token: "itau", official: ["itau.com.br"] },
  { token: "bradesco", official: ["bradesco.com.br"] },
  { token: "santander", official: ["santander.com.br"] },
  { token: "caixa", official: ["caixa.gov.br"] },
  { token: "bancodobrasil", official: ["bb.com.br"] },
  { token: "picpay", official: ["picpay.com"] },
  { token: "netshoes", official: ["netshoes.com.br"] },
  { token: "renner", official: ["lojasrenner.com.br"] },
  { token: "riachuelo", official: ["riachuelo.com.br"] },
  { token: "ifood", official: ["ifood.com.br"] },
  { token: "vivo", official: ["vivo.com.br"] },
  { token: "claro", official: ["claro.com.br"] },
  { token: "netflix", official: ["netflix.com"] },
];

/**
 * True when the hostname wears a known brand's name but isn't that brand's
 * domain — `magazineluiza-ofertas.shop`, `correios-rastreio.com`.
 *
 * ponytail: substring/segment match, not edit distance. Catches names that are
 * spelled right and placed wrong, which is the bulk of real Brazilian phishing;
 * it will not catch a typo-squat like `mercadolivrre`. Add a distance pass if
 * those start showing up.
 */
export function domainImitatesBrand(hostname: string): boolean {
  const host = hostname.toLowerCase();
  const registrable = registrableDomain(host);
  // Segments are what a human reads as separate words in an address.
  const segments = new Set(host.split(/[.-]/));

  for (const { token, official } of BRANDS) {
    const t = token.toLowerCase();
    // Short tokens ("vivo", "claro", "caixa") are ordinary words, so they only
    // count as a whole segment. Long ones are distinctive enough to match glued
    // into a longer label ("magazineluizaofertas").
    const wears = segments.has(t) || (t.length >= 6 && host.includes(t));
    if (!wears) continue;
    return !official.some((d) => registrable === d || registrable.endsWith(`.${d}`));
  }
  return false;
}

// Registries that hand out domains for pocket change and see heavy scam abuse.
// A mild signal on its own — plenty of honest small shops sit on .shop.
const CHEAP_TLDS = new Set([
  "shop", "store", "online", "site", "website", "space", "fun", "click", "link",
  "xyz", "top", "icu", "cyou", "buzz", "sbs", "cfd", "lol", "monster", "quest", "rest", "beauty",
]);

export function hasCheapTld(hostname: string): boolean {
  const tld = hostname.toLowerCase().split(".").pop() ?? "";
  return CHEAP_TLDS.has(tld);
}
