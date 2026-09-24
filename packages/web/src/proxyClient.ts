import type { CnpjRecord, ReputationResult } from "@scammeter/core";

const PROXY_URL = import.meta.env.DEV ? "http://localhost:8787" : "https://scammeter-proxy-production.up.railway.app";

/** Why a lookup produced nothing — the page tells the user which it was. */
export type FetchFailure = "rate_limited" | "timeout" | "offline" | "upstream" | "not_found";

export interface Fetched<T> {
  data: T | null;
  failure: FetchFailure | null;
}

const ok = <T>(data: T): Fetched<T> => ({ data, failure: null });
const failed = <T>(failure: FetchFailure): Fetched<T> => ({ data: null, failure });

async function getJson<T>(path: string, timeoutMs = 5000): Promise<Fetched<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${PROXY_URL}${path}`, { signal: controller.signal });
    if (res.status === 429) return failed("rate_limited");
    if (res.status === 404) return failed("not_found");
    if (!res.ok) return failed("upstream");
    return ok((await res.json()) as T);
  } catch (error) {
    // An abort is our own timeout firing; anything else never reached the
    // server at all — offline, DNS, CORS, or the proxy being down.
    return failed((error as Error)?.name === "AbortError" ? "timeout" : "offline");
  } finally {
    clearTimeout(timeout);
  }
}

export function fetchCnpjRecord(cnpj: string): Promise<Fetched<CnpjRecord>> {
  return getJson<CnpjRecord>(`/cnpj/${encodeURIComponent(cnpj)}`);
}

export function fetchDomainInfo(domain: string): Promise<Fetched<{ ageDays: number | null }>> {
  return getJson(`/domain/${encodeURIComponent(domain)}`);
}

export function fetchReputation(
  domain: string,
): Promise<Fetched<ReputationResult>> {
  return getJson(`/reputation/${encodeURIComponent(domain)}`);
}

export interface PopularityResult {
  top100k: boolean | null;
  rank: number | null;
  domain: string;
  source: "Tranco";
  sourceUrl: string;
  fetchedAt: string | null;
  status: "available" | "unavailable" | "stale";
}

/** Longer timeout: right after a proxy restart the first call waits for the list download. */
export function fetchPopularity(domain: string): Promise<Fetched<PopularityResult>> {
  return getJson(`/popularity/${encodeURIComponent(domain)}`, 9000);
}

export interface ScanResult {
  fetched: boolean;
  cnpj: string | null;
  pixPayload: string | null;
}

/** Longer timeout: the proxy itself fetches the target page (up to 8s) before we get a reply. */
export function fetchScan(url: string): Promise<Fetched<ScanResult>> {
  return getJson<ScanResult>(`/scan?url=${encodeURIComponent(url)}`, 12000);
}
