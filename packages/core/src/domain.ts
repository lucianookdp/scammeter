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

interface Brand {
  token: string;
  name: string;
  official: string[];
  /**
   * Everyday words ("caixa", "vivo", "claro") only count when the address also
   * says what the scam is about — "caixa-fgts-saque", not "caixa-de-som".
   */
  ambiguous?: boolean;
  /** Real words that contain the token or sit one letter away from it. */
  lookalikeWords?: string[];
}

// The brands Brazilian phishing actually impersonates, mapped to the domains
// that are legitimately theirs. Everything else wearing the name is a fake.
const BRANDS: Brand[] = [
  { token: "magazineluiza", name: "Magazine Luiza", official: ["magazineluiza.com.br", "magalu.com.br", "magalu.com"] },
  { token: "magalu", name: "Magalu", official: ["magalu.com.br", "magalu.com", "magazineluiza.com.br"], lookalikeWords: ["magali"] },
  { token: "mercadolivre", name: "Mercado Livre", official: ["mercadolivre.com.br", "mercadolibre.com", "mercadolivre.com"] },
  { token: "mercadopago", name: "Mercado Pago", official: ["mercadopago.com.br", "mercadopago.com"] },
  { token: "americanas", name: "Americanas", official: ["americanas.com.br", "americanas.com"], lookalikeWords: ["americana", "sulamericana"] },
  { token: "casasbahia", name: "Casas Bahia", official: ["casasbahia.com.br"] },
  { token: "pontofrio", name: "Ponto", official: ["pontofrio.com.br"] },
  { token: "submarino", name: "Submarino", official: ["submarino.com.br"] },
  { token: "shopee", name: "Shopee", official: ["shopee.com.br", "shopee.com"], lookalikeWords: ["shoppe"] },
  { token: "aliexpress", name: "AliExpress", official: ["aliexpress.com", "aliexpress.us"] },
  {
    token: "amazon",
    name: "Amazon",
    official: ["amazon.com.br", "amazon.com", "amazonaws.com", "amazon.dev"],
    lookalikeWords: ["amazonia", "amazonas", "amazonica", "amazonico", "amazonense", "amazone"],
  },
  { token: "correios", name: "Correios", official: ["correios.com.br"], lookalikeWords: ["correio", "correias", "correia"] },
  { token: "receitafederal", name: "Receita Federal", official: ["gov.br"] },
  { token: "govbr", name: "gov.br", official: ["gov.br"] },
  { token: "detran", name: "Detran", official: ["gov.br"] },
  { token: "serasa", name: "Serasa", official: ["serasa.com.br", "serasaexperian.com.br"] },
  { token: "nubank", name: "Nubank", official: ["nubank.com.br", "nu.com.br", "nubank.com"] },
  { token: "itau", name: "Itaú", official: ["itau.com.br", "itau.com"] },
  { token: "bradesco", name: "Bradesco", official: ["bradesco.com.br", "bradesco"] },
  { token: "santander", name: "Santander", official: ["santander.com.br", "santander.com"] },
  { token: "caixa", name: "Caixa", official: ["caixa.gov.br"], ambiguous: true },
  { token: "bancodobrasil", name: "Banco do Brasil", official: ["bb.com.br"] },
  { token: "bancointer", name: "Banco Inter", official: ["bancointer.com.br", "inter.co"] },
  { token: "c6bank", name: "C6 Bank", official: ["c6bank.com.br"] },
  { token: "picpay", name: "PicPay", official: ["picpay.com", "picpay.com.br"] },
  { token: "pagseguro", name: "PagSeguro", official: ["pagseguro.com.br", "pagbank.com.br"] },
  { token: "pagbank", name: "PagBank", official: ["pagbank.com.br", "pagseguro.com.br"] },
  { token: "sicredi", name: "Sicredi", official: ["sicredi.com.br"] },
  { token: "sicoob", name: "Sicoob", official: ["sicoob.com.br"] },
  { token: "paypal", name: "PayPal", official: ["paypal.com", "paypal.com.br"] },
  { token: "netshoes", name: "Netshoes", official: ["netshoes.com.br"] },
  { token: "renner", name: "Renner", official: ["lojasrenner.com.br"], lookalikeWords: ["benner", "tenner", "penner", "rennes"] },
  { token: "riachuelo", name: "Riachuelo", official: ["riachuelo.com.br"] },
  { token: "ifood", name: "iFood", official: ["ifood.com.br"] },
  { token: "olx", name: "OLX", official: ["olx.com.br", "olx.com"] },
  { token: "vivo", name: "Vivo", official: ["vivo.com.br"], ambiguous: true },
  { token: "claro", name: "Claro", official: ["claro.com.br"], ambiguous: true },
  { token: "netflix", name: "Netflix", official: ["netflix.com"] },
  { token: "whatsapp", name: "WhatsApp", official: ["whatsapp.com", "whatsapp.net"] },
  { token: "instagram", name: "Instagram", official: ["instagram.com"] },
  { token: "facebook", name: "Facebook", official: ["facebook.com", "facebook.net", "fb.com"] },
];

// Words that only turn up in an address to make a lure sound urgent or
// official. Mild alone; damning next to a brand name.
const BAIT_WORDS = [
  "oferta", "ofertas", "promo", "promocao", "promocoes", "desconto", "descontos", "liquidacao",
  "queimadeestoque", "blackfriday", "saldao", "cupom", "brinde", "gratis",
  "saque", "fgts", "restituicao", "indenizacao", "beneficio", "auxilio", "valoresareceber",
  "rastreio", "rastreamento", "taxa", "encomenda",
  "seguranca", "atualizacao", "atualizar", "desbloqueio", "desbloquear", "liberar", "liberacao",
  "regularizar", "regularizacao", "pendencia", "bloqueio", "bloqueado", "suspenso", "verificacao",
  "premio", "premiado", "premiacao", "sorteio", "resgate", "resgatar", "bonus",
  "limpanome", "divida", "quitar",
];

// Service words that give an ambiguous brand ("caixa") its meaning. Not
// suspicious on their own, so they never score by themselves.
const CONTEXT_WORDS = [
  ...BAIT_WORDS,
  "atendimento", "cliente", "clientes", "conta", "app", "login", "acesso", "fatura", "boleto",
  "pagamento", "pix", "cartao", "credito", "emprestimo", "loterias", "habitacao", "tem",
  "recarga", "chip", "plano", "oficial", "suporte", "sac", "digital", "segundavia", "banco", "bank", "pis",
];

// Anyone can publish on these in minutes, so the platform's age and fame say
// nothing about the page on it.
const SHARED_HOSTING_SUFFIXES = [
  "vercel.app", "netlify.app", "github.io", "gitlab.io", "pages.dev", "workers.dev", "web.app",
  "firebaseapp.com", "herokuapp.com", "onrender.com", "glitch.me", "replit.app", "repl.co",
  "fly.dev", "railway.app", "surge.sh", "wixsite.com", "weebly.com", "blogspot.com",
  "wordpress.com", "webflow.io", "framer.app", "framer.website", "carrd.co", "godaddysites.com",
  "square.site", "mystrikingly.com", "jimdosite.com", "site123.me", "webnode.page", "webnode.com.br",
  "000webhostapp.com", "azurewebsites.net", "cloudfront.net", "r2.dev", "ngrok.io", "ngrok-free.app",
  "trycloudflare.com", "s3.amazonaws.com", "blob.core.windows.net", "firebasestorage.app",
  "myshopify.com", "lojaintegrada.com.br", "nuvemshop.com.br", "linktr.ee",
];
const SHARED_HOSTING_EXACT = [
  "sites.google.com", "docs.google.com", "forms.gle", "storage.googleapis.com",
  "firebasestorage.googleapis.com", "forms.office.com",
];

// Registries that hand out domains for pocket change and see heavy scam abuse.
// A mild signal on its own — plenty of honest small shops sit on .shop.
const CHEAP_TLDS = new Set([
  "shop", "store", "online", "site", "website", "space", "fun", "click", "link",
  "xyz", "top", "icu", "cyou", "buzz", "sbs", "cfd", "lol", "monster", "quest", "rest", "beauty",
  "vip", "live", "life", "cc", "biz", "work", "today", "bond", "autos",
]);

// Suffixes nobody can register without proving who they are: government,
// judiciary, legislature, military, prosecutors, schools and (.b.br) banks.
const RESTRICTED_SUFFIXES = [
  "gov.br", "jus.br", "leg.br", "mil.br", "mp.br", "def.br", "b.br", "edu.br", "gov", "mil", "edu",
];

// Digits and letter pairs that pass for other letters at a glance.
const HOMOGLYPHS: Array<[RegExp, string]> = [
  [/0/g, "o"], [/1/g, "l"], [/3/g, "e"], [/4/g, "a"], [/5/g, "s"], [/7/g, "t"],
  [/rn/g, "m"], [/vv/g, "w"],
];

function unmaskHomoglyphs(s: string): string {
  return HOMOGLYPHS.reduce((acc, [pattern, letter]) => acc.replace(pattern, letter), s);
}

function endsWithDomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/** Optimal string alignment distance, capped: we only ever care about "at most one". */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v);
    }
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length] <= 1;
}

/** What a human reads as words in an address: labels, their hyphen-split pieces, and each label unhyphenated. */
function readableParts(host: string): string[] {
  const parts = new Set<string>();
  for (const label of host.split(".")) {
    parts.add(label);
    parts.add(label.replace(/-/g, ""));
    for (const segment of label.split("-")) parts.add(segment);
  }
  parts.delete("");
  return [...parts];
}

function removeWords(text: string, words: string[] | undefined): string {
  return (words ?? []).reduce((acc, word) => acc.split(word).join("|"), text);
}

export interface BrandImpersonation {
  brand: string;
  kind: "name" | "typo";
}

/**
 * The brand an address pretends to be, and how: wearing the name outright
 * (`magazineluiza-ofertas.shop`, `correios-rastreio.com`) or one letter off
 * (`mercadolivrre.com`, `nubamk.com`, `rnercadolivre.com`).
 *
 * ponytail: whole-part edit distance, not a sliding window — a typo glued to
 * other words (`mercadolivrreofertas`) slips through. Widen if those show up.
 */
export function brandImpersonation(hostname: string): BrandImpersonation | null {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (!host || isIpHost(host)) return null;
  const registrable = registrableDomain(host);
  const parts = readableParts(host);
  const glued = host.replace(/[.-]/g, "");
  const unmasked = unmaskHomoglyphs(glued);
  const hasContext =
    parts.some((p) => CONTEXT_WORDS.includes(p)) || CONTEXT_WORDS.some((w) => w.length >= 6 && glued.includes(w));

  for (const brand of BRANDS) {
    if (brand.official.some((d) => endsWithDomain(registrable, d))) continue;
    if (brand.ambiguous && !hasContext) continue;
    const t = brand.token;

    // Short tokens are ordinary words, so they only count as a whole part.
    // Long ones are distinctive enough to match glued into a longer label.
    if (parts.includes(t) || (t.length >= 6 && removeWords(glued, brand.lookalikeWords).includes(t))) {
      return { brand: brand.name, kind: "name" };
    }
    if (t.length < 6) continue;
    if (unmasked !== glued && removeWords(unmasked, brand.lookalikeWords).includes(t)) {
      return { brand: brand.name, kind: "typo" };
    }
    const typo = parts.some(
      (p) => p.length >= 5 && !(brand.lookalikeWords ?? []).includes(p) && (withinOneEdit(p, t) || unmaskHomoglyphs(p) === t),
    );
    if (typo) return { brand: brand.name, kind: "typo" };
  }

  // "servicos.gov.br.consulta.online" borrows the government suffix as a subdomain.
  if (/(^|\.)gov\.br\./.test(host) || /(^|[.-])gov-br([.-]|$)/.test(host)) {
    return { brand: "gov.br", kind: "name" };
  }
  return null;
}

/** True when the hostname wears a known brand's name (or a one-letter variant) but isn't that brand's domain. */
export function domainImitatesBrand(hostname: string): boolean {
  return brandImpersonation(hostname) !== null;
}

/** The brand whose official domain this is — "nubank.com.br" -> "Nubank". */
export function officialBrandFor(hostname: string): string | null {
  const registrable = registrableDomain(hostname.toLowerCase().replace(/\.$/, ""));
  // gov.br belongs to the restricted-suffix rule, not to any single brand.
  const brand = BRANDS.find((b) => b.official.some((d) => d !== "gov.br" && endsWithDomain(registrable, d)));
  return brand ? brand.name : null;
}

function foldAccents(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * The brand a page title claims to be when the address isn't that brand's:
 * "Nubank - Acesse sua conta" on atendimento-online24.com. The brand has to
 * be a whole title segment, or lead the first one, so "Capinha para Samsung
 * e Nubank" doesn't count. Ambiguous brands ("Caixa de som") never do.
 */
export function titleImpersonation(title: string | null | undefined, hostname: string): string | null {
  if (!title) return null;
  const registrable = registrableDomain(hostname.toLowerCase().replace(/\.$/, ""));
  const segments = foldAccents(title)
    .split(/\s+[-|:·–—]\s+|\s*[|·–—]\s*|:\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const brand of BRANDS) {
    if (brand.ambiguous || brand.official.some((d) => endsWithDomain(registrable, d))) continue;
    const name = foldAccents(brand.name);
    if (segments.some((s, i) => s === name || s === brand.token || (i === 0 && s.startsWith(`${name} `)))) {
      return brand.name;
    }
  }
  return null;
}

// Words any company name may carry; matching on them would tie "Lojas Pompéia"
// to every lojas-something.com.br.
const GENERIC_NAME_WORDS = new Set([
  "ltda", "eireli", "comercio", "comercial", "servicos", "industria", "brasil", "brasileira", "artigos",
  "produtos", "vestuario", "participacoes", "empreendimentos", "importacao", "exportacao", "distribuidora",
  "tecnologia", "digital", "online", "store", "loja", "lojas", "moda", "varejo", "holding", "grupo",
  "instituicao", "pagamento", "pagamentos", "financeira", "sociedade", "limitada", "company",
]);

/**
 * Whether the company behind a CNPJ plausibly runs this address: a distinctive
 * word of its name in the domain, or the domain's name inside the company's.
 * Real stores often trade under a name that isn't their legal one, so a
 * mismatch is a note for the reader to check, never evidence by itself.
 */
export function companyMatchesHost(companyNames: Array<string | undefined>, hostname: string): boolean {
  const label = registrableDomain(hostname).split(".")[0].replace(/-/g, "");
  const folded = companyNames.map((n) => foldAccents(n ?? ""));
  const words = folded.flatMap((n) => n.split(/[^a-z0-9]+/)).filter((w) => w.length >= 4 && !GENERIC_NAME_WORDS.has(w));
  const glued = folded.map((n) => n.replace(/[^a-z0-9]/g, ""));
  return words.some((w) => label.includes(w)) || (label.length >= 4 && glued.some((n) => n.includes(label)));
}

export function hasCheapTld(hostname: string): boolean {
  const tld = hostname.toLowerCase().split(".").pop() ?? "";
  return CHEAP_TLDS.has(tld);
}

/** Suffixes that require proof of identity to register (.gov.br, .jus.br, .b.br…). */
export function hasRestrictedTld(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return RESTRICTED_SUFFIXES.some((suffix) => host.endsWith(`.${suffix}`));
}

/** The free platform a page lives on — "golpe.vercel.app" -> "vercel.app". */
export function sharedHostingPlatform(hostname: string): string | null {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (SHARED_HOSTING_EXACT.includes(host)) return host;
  return SHARED_HOSTING_SUFFIXES.find((suffix) => host.endsWith(`.${suffix}`)) ?? null;
}

/** Lure words found in the address ("saque", "rastreio", "liberar"). */
export function baitWords(hostname: string): string[] {
  const host = hostname.toLowerCase();
  const parts = readableParts(host);
  const glued = host.replace(/[.-]/g, "");
  return BAIT_WORDS.filter((w) => parts.includes(w) || (w.length >= 6 && glued.includes(w)));
}

/** An internationalized label — the form a homograph ("nubаnk" with a Cyrillic а) takes on the wire. */
export function isPunycode(hostname: string): boolean {
  return hostname.toLowerCase().split(".").some((label) => label.startsWith("xn--"));
}

export function isIpHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "");
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":");
}

/** Everything the address alone can tell us, shaped to spread into ScoringInput. */
export interface HostnameAnalysis {
  domainImitatesBrand: boolean;
  brandTyposquat: boolean;
  impersonatedBrand?: string;
  officialBrand?: string;
  restrictedTld: boolean;
  sharedHosting?: string;
  suspiciousKeywords: boolean;
  punycode: boolean;
  ipHost: boolean;
  cheapTldPrivateWhois: boolean;
}

export function analyzeHostname(hostname: string): HostnameAnalysis {
  const impersonation = brandImpersonation(hostname);
  return {
    domainImitatesBrand: impersonation?.kind === "name",
    brandTyposquat: impersonation?.kind === "typo",
    impersonatedBrand: impersonation?.brand,
    officialBrand: officialBrandFor(hostname) ?? undefined,
    restrictedTld: hasRestrictedTld(hostname),
    sharedHosting: sharedHostingPlatform(hostname) ?? undefined,
    suspiciousKeywords: baitWords(hostname).length > 0,
    punycode: isPunycode(hostname),
    ipHost: isIpHost(hostname),
    cheapTldPrivateWhois: hasCheapTld(hostname),
  };
}
