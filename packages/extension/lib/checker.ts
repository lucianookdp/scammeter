import { browser } from "wxt/browser";
import {
  analyzeHostname,
  computeScore,
  lookupCnpj,
  lookupDomainAge,
  parseHostnameList,
  parseRankList,
  popularityFromList,
  registrableDomain,
  reputationFromList,
  scoringInputFrom,
  type CnpjRecord,
  type RankLookup,
  SortedLines,
  sortLines,
  type ListMeta,
  type PageScan,
} from "@scammeter/core";
import type { CheckFacts, StoredAnalysis } from "./messages";

/**
 * Runs in the background worker, which may fetch other sites without the
 * page's CORS limits. No server of ours: CNPJ goes to BrasilAPI, domain age to
 * RDAP, and the phishing and popularity lists ship inside the extension (the
 * phishing list is also refreshed from its source once a day).
 */

const DAY = 86_400_000;
const PHISHING_URL = "https://raw.githubusercontent.com/phishdestroy/destroylist/main/list.txt";

interface Lists {
  meta: ListMeta;
  phishing: SortedLines;
  popular: RankLookup;
}

let lists: Promise<Lists> | null = null;
let refreshing = false;

async function packaged(path: string): Promise<string> {
  const res = await fetch(browser.runtime.getURL(`/data/${path}` as "/data/meta.json"));
  return res.text();
}

async function loadLists(): Promise<Lists> {
  const [metaText, phishingText, popularText, stored] = await Promise.all([
    packaged("meta.json"),
    packaged("phishing.txt"),
    packaged("popular.txt"),
    browser.storage.local.get(["phishingText", "phishingAt"]),
  ]);
  const meta = JSON.parse(metaText) as ListMeta;
  // A copy refreshed after this version was packaged wins over the packaged one.
  const fresher = typeof stored.phishingAt === "string" && stored.phishingAt > meta.generatedAt && typeof stored.phishingText === "string";
  return {
    meta: fresher ? { ...meta, generatedAt: stored.phishingAt as string } : meta,
    phishing: parseHostnameList(fresher ? (stored.phishingText as string) : phishingText),
    popular: parseRankList(popularText),
  };
}

/** Once a day, fetch the phishing list again; a failed or odd download is ignored. */
async function refreshPhishing(current: Lists) {
  if (refreshing || Date.now() - new Date(current.meta.generatedAt).getTime() < DAY) return;
  refreshing = true;
  try {
    const res = await fetch(PHISHING_URL, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return;
    // Sorted once here, so every later wake-up of the worker loads it as is.
    const text = sortLines((await res.text()).toLowerCase());
    const set = parseHostnameList(text);
    if (set.size < 10_000 || set.size < current.phishing.size * 0.5) return;
    const at = new Date().toISOString();
    await browser.storage.local.set({ phishingText: text, phishingAt: at });
    current.phishing = set;
    current.meta = { ...current.meta, generatedAt: at, phishing: set.size };
  } catch {
    // Keep the copy we have; the reputation check reports it as stale after three days.
  } finally {
    refreshing = false;
  }
}

async function getLists(): Promise<Lists> {
  lists ??= loadLists().catch((error) => {
    lists = null;
    throw error;
  });
  const current = await lists;
  void refreshPhishing(current);
  return current;
}

/* ---------- Lookups with a local cache, so a site isn't asked about twice ---------- */

async function cached<T>(key: string, ttl: number, load: () => Promise<T | null>): Promise<T | null> {
  const hit = (await browser.storage.local.get(key))[key] as { at: number; value: T } | undefined;
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  const value = await load();
  if (value !== null) await browser.storage.local.set({ [key]: { at: Date.now(), value } });
  return value;
}

async function domainAge(hostname: string): Promise<number | null> {
  const domain = registrableDomain(hostname);
  const hit = await cached(`age:${domain}`, 7 * DAY, async () => {
    const res = await lookupDomainAge(domain);
    return res.data ? { ageDays: res.data.ageDays, at: Date.now() } : null;
  });
  if (!hit || hit.ageDays === null) return null;
  return hit.ageDays + Math.floor((Date.now() - hit.at) / DAY);
}

async function cnpjRecord(cnpj: string): Promise<CnpjRecord | null> {
  return cached(`cnpj:${cnpj}`, DAY, async () => (await lookupCnpj(cnpj)).data);
}

/* ---------- The check ---------- */

/**
 * Two steps, to stay light on slow computers. Called first with no page: if
 * the address alone settles it (a popular, official or government site, which
 * is most of what anyone opens), the answer comes back at once and the page is
 * never read. Otherwise it returns null and the content script reads the page
 * and calls again with it.
 */
export async function checkPage(url: string, page: PageScan | null): Promise<StoredAnalysis | null> {
  const hostname = new URL(url).hostname.toLowerCase();
  const host = analyzeHostname(hostname);
  const { meta, phishing, popular } = await getLists();
  const reputation = reputationFromList(hostname, phishing, meta);
  const popularity = popularityFromList(hostname, popular, meta);

  // Popular, official and government sites already have their answer, and
  // asking a registry about every big site someone opens would leak their
  // browsing for nothing. Only unknown sites are looked up.
  const skippedLookups =
    reputation.blocklisted !== true && (popularity.top100k === true || Boolean(host.officialBrand) || Boolean(host.restrictedTld));
  if (!page && !skippedLookups) return null;
  const [ageDays, record] = skippedLookups || !page
    ? [null, null]
    : await Promise.all([host.sharedHosting ? Promise.resolve(null) : domainAge(hostname), page.cnpj ? cnpjRecord(page.cnpj) : Promise.resolve(null)]);

  const input = scoringInputFrom({
    hostname,
    scan: page ?? undefined,
    cnpjRecord: page?.cnpj && !skippedLookups ? record : undefined,
    domainAgeDays: ageDays,
    blocklisted: reputation.blocklisted,
    top100k: popularity.top100k,
  });

  const facts: CheckFacts = {
    ageDays,
    cnpj: page?.cnpj ?? null,
    cnpjRecord: record,
    blocklisted: reputation.blocklisted,
    rank: popularity.rank,
    skippedLookups,
  };
  return { url, result: computeScore(input), facts };
}
