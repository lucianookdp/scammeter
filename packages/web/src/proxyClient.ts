import type { CnpjRecord, ReputationResult } from "@scammeter/core";

/** Static, labelled scenarios for the GitHub Pages portfolio demo. No network requests. */
export type FetchFailure = "rate_limited" | "timeout" | "offline" | "upstream" | "not_found";
export interface Fetched<T> { data: T | null; failure: FetchFailure | null }
const ok = <T>(data: T): Fetched<T> => ({ data, failure: null });
const missing = <T>(): Fetched<T> => ({ data: null, failure: "not_found" });
const risky = "oferta-magazineluiza.example";
const calm = "loja-confiavel.example";
const isDemo = (domain: string) => domain === risky || domain === calm;

export function shareLink(siteUrl: string): string {
  const url = new URL(window.location.href);
  url.search = new URLSearchParams({ site: siteUrl }).toString();
  url.hash = "";
  return url.toString();
}
export async function fetchCnpjRecord(cnpj: string): Promise<Fetched<CnpjRecord>> {
  if (cnpj === "11222333000181") return ok({ status: "ativa", razaoSocial: "LOJA CONFIÁVEL DEMONSTRAÇÃO LTDA", abertura: "2018-01-01" });
  return missing();
}
export async function fetchDomainInfo(domain: string): Promise<Fetched<{ ageDays: number | null }>> {
  return isDemo(domain) ? ok({ ageDays: domain === risky ? 12 : 2400 }) : missing();
}
export async function fetchReputation(domain: string): Promise<Fetched<ReputationResult>> {
  if (!isDemo(domain)) return missing();
  return ok({
    blocklisted: null, top100k: null, source: "PhishDestroy",
    sourceUrl: "https://github.com/phishdestroy/destroylist", fetchedAt: null,
    status: "unavailable", match: null,
  });
}
export interface PopularityResult {
  top100k: boolean | null; rank: number | null; domain: string; source: "Tranco";
  sourceUrl: string; fetchedAt: string | null; status: "available" | "unavailable" | "stale";
}
export async function fetchPopularity(domain: string): Promise<Fetched<PopularityResult>> {
  if (!isDemo(domain)) return missing();
  return ok({ top100k: null, rank: null, domain,
    source: "Tranco", sourceUrl: "https://tranco-list.eu/", fetchedAt: null, status: "unavailable" });
}
export interface ScanResult {
  fetched: boolean; cnpj: string | null; pixPayload: string | null;
  title?: string | null; asksCredentials?: boolean;
}
export async function fetchScan(url: string): Promise<Fetched<ScanResult>> {
  const domain = new URL(url).hostname;
  if (!isDemo(domain)) return missing();
  return ok({
    fetched: true, cnpj: domain === calm ? "11222333000181" : null,
    pixPayload: null, title: domain === risky ? "Magazine Luiza — ofertas imperdíveis" : "Loja Confiável",
    asksCredentials: domain === risky,
  });
}
