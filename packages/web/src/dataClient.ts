import {
  lookupCnpj,
  lookupDomainAge,
  parseHostnameList,
  parseRankList,
  popularityFromList,
  reputationFromList,
  type CnpjRecord,
  type Fetched,
  type FetchFailure,
  type HostnameLookup,
  type RankLookup,
  type ListMeta,
  type PopularityResult,
  type ReputationResult,
} from "@scammeter/core";

/**
 * Every lookup the page makes, straight from the visitor's browser: no server
 * of ours sits in between. CNPJ and domain age go to BrasilAPI and RDAP; the
 * phishing and popularity lists are static files next to the page, so the
 * address being checked never leaves the browser for them.
 *
 * The two `.example` addresses are fictional showcases with fixed answers.
 */
export type { Fetched, FetchFailure, PopularityResult };

export const DEMO_RISKY = "oferta-magazineluiza.example";
export const DEMO_CALM = "loja-confiavel.example";
export const isDemo = (domain: string) => domain === DEMO_RISKY || domain === DEMO_CALM;

const ok = <T>(data: T): Fetched<T> => ({ data, failure: null });

export function shareLink(siteUrl: string): string {
  const url = new URL(window.location.href);
  url.search = new URLSearchParams({ site: siteUrl }).toString();
  url.hash = "";
  return url.toString();
}

/* ---------- Static lists, downloaded once and kept for the session ---------- */

interface Lists {
  meta: ListMeta | null;
  phishing: HostnameLookup | null;
  popular: RankLookup | null;
}

let listsPromise: Promise<Lists> | null = null;

async function text(path: string): Promise<string | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/${path}`);
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

/** Starts the downloads early (on focus) so the first check doesn't wait for them. */
export function preloadLists(): Promise<Lists> {
  listsPromise ??= Promise.all([text("meta.json"), text("phishing.txt"), text("popular.txt")]).then(([meta, phishing, popular]) => {
    let parsedMeta: ListMeta | null = null;
    try {
      parsedMeta = meta ? (JSON.parse(meta) as ListMeta) : null;
    } catch {
      parsedMeta = null;
    }
    const lists = {
      meta: parsedMeta,
      phishing: phishing ? parseHostnameList(phishing) : null,
      popular: popular ? parseRankList(popular) : null,
    };
    // A failed download shouldn't stick for the whole visit.
    if (!lists.phishing || !lists.popular) listsPromise = null;
    return lists;
  });
  return listsPromise;
}

/* ---------- Lookups ---------- */

export async function fetchCnpjRecord(cnpj: string): Promise<Fetched<CnpjRecord>> {
  if (cnpj === "11222333000181") return ok({ status: "ativa", razaoSocial: "LOJA CONFIÁVEL DEMONSTRAÇÃO LTDA", abertura: "2018-01-01" });
  return lookupCnpj(cnpj);
}

export async function fetchDomainInfo(domain: string): Promise<Fetched<{ ageDays: number | null }>> {
  if (isDemo(domain)) return ok({ ageDays: domain === DEMO_RISKY ? 12 : 2400 });
  return lookupDomainAge(domain);
}

export async function fetchReputation(domain: string): Promise<Fetched<ReputationResult>> {
  if (isDemo(domain)) return ok(reputationFromList(domain, null, null));
  const lists = await preloadLists();
  return ok(reputationFromList(domain, lists.phishing, lists.meta));
}

export async function fetchPopularity(domain: string): Promise<Fetched<PopularityResult>> {
  if (isDemo(domain)) return ok(popularityFromList(domain, null, null));
  const lists = await preloadLists();
  return ok(popularityFromList(domain, lists.popular, lists.meta));
}

export interface ScanResult {
  fetched: boolean;
  cnpj: string | null;
  pixPayload: string | null;
  title?: string | null;
  asksCredentials?: boolean;
}

/**
 * Reading the page itself needs either a server or the extension: a browser
 * won't let one site read another's HTML. Only the fictional examples have one.
 */
export async function fetchScan(url: string): Promise<Fetched<ScanResult> | null> {
  const domain = new URL(url).hostname;
  if (!isDemo(domain)) return null;
  return ok({
    fetched: true,
    cnpj: domain === DEMO_CALM ? "11222333000181" : null,
    pixPayload: null,
    title: domain === DEMO_RISKY ? "Magazine Luiza — ofertas imperdíveis" : "Loja Confiável",
    asksCredentials: domain === DEMO_RISKY,
  });
}
