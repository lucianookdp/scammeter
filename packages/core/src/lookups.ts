// Lookups that run straight from a browser, with no server of our own: the web
// page calls them from the visitor's browser and the extension from its
// background worker. Every source here answers with CORS headers.

import { normalizeCnpj, validateCnpj } from "./cnpj.js";
import { registrableDomain } from "./domain.js";
import type { CnpjRecord, ReputationResult } from "./types.js";

export type FetchFailure = "rate_limited" | "timeout" | "offline" | "upstream" | "not_found";

/** A lookup's answer, or why there is none. Never both. */
export interface Fetched<T> {
  data: T | null;
  failure: FetchFailure | null;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const TIMEOUT_MS = 8000;

async function getJson<T>(url: string, fetchImpl: FetchLike, headers: Record<string, string> = {}): Promise<Fetched<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { signal: controller.signal, headers: { Accept: "application/json", ...headers } });
    if (res.status === 404) return { data: null, failure: "not_found" };
    if (res.status === 429) return { data: null, failure: "rate_limited" };
    if (!res.ok) return { data: null, failure: "upstream" };
    return { data: (await res.json()) as T, failure: null };
  } catch (error) {
    const aborted = (error as Error)?.name === "AbortError";
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    return { data: null, failure: aborted ? "timeout" : offline ? "offline" : "upstream" };
  } finally {
    clearTimeout(timer);
  }
}

const SITUACAO: Record<string, CnpjRecord["status"]> = {
  ATIVA: "ativa",
  BAIXADA: "baixada",
  INAPTA: "inapta",
  SUSPENSA: "suspensa",
  NULA: "nula",
};

/** Company registration from BrasilAPI (Receita Federal data). */
export async function lookupCnpj(cnpj: string, fetchImpl: FetchLike = fetch): Promise<Fetched<CnpjRecord>> {
  const digits = normalizeCnpj(cnpj);
  if (!validateCnpj(digits)) return { data: null, failure: "not_found" };
  const res = await getJson<{
    descricao_situacao_cadastral?: string;
    razao_social?: string;
    nome_fantasia?: string;
    data_inicio_atividade?: string;
    cnae_fiscal_descricao?: string;
    municipio?: string;
  }>(`https://brasilapi.com.br/api/cnpj/v1/${digits}`, fetchImpl);
  if (!res.data) return { data: null, failure: res.failure };
  const d = res.data;
  return {
    data: {
      status: SITUACAO[d.descricao_situacao_cadastral ?? ""] ?? "desconhecida",
      razaoSocial: d.razao_social,
      nomeFantasia: d.nome_fantasia || undefined,
      abertura: d.data_inicio_atividade,
      cnae: d.cnae_fiscal_descricao,
      municipio: d.municipio,
    },
    failure: null,
  };
}

const HOSTNAME_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export function rdapUrlFor(domain: string): string {
  return domain.endsWith(".br") ? `https://rdap.registro.br/domain/${domain}` : `https://rdap.org/domain/${domain}`;
}

/** Days since the domain was registered, from RDAP. null when the registry doesn't say. */
export async function lookupDomainAge(hostname: string, fetchImpl: FetchLike = fetch, now = Date.now()): Promise<Fetched<{ ageDays: number | null }>> {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (!HOSTNAME_PATTERN.test(host)) return { data: { ageDays: null }, failure: null };
  const res = await getJson<{ events?: Array<{ eventAction?: string; eventDate?: string }> }>(
    rdapUrlFor(registrableDomain(host)),
    fetchImpl,
    { Accept: "application/rdap+json, application/json" },
  );
  // A TLD without RDAP is an expected "unverified", not a failed check.
  if (res.failure === "not_found" || res.failure === "upstream") return { data: { ageDays: null }, failure: null };
  if (!res.data) return { data: null, failure: res.failure };
  const registered = res.data.events?.find((e) => e.eventAction === "registration")?.eventDate;
  const time = registered ? new Date(registered).getTime() : NaN;
  return { data: { ageDays: Number.isFinite(time) ? Math.floor((now - time) / 86_400_000) : null }, failure: null };
}

/* ---------- Lists shipped as static files ---------- */

/**
 * The phishing list and the popularity ranking are downloaded at build time
 * (scripts/fetch-lists.mjs) and served next to the page or packed into the
 * extension, one hostname per line. These turn that text into lookups.
 */
export interface ListMeta {
  /** When the build downloaded the lists (ISO 8601). */
  generatedAt: string;
  phishing: number;
  popular: number;
}

/** Clean, deduplicate and sort lines: what SortedLines needs, done once. */
export function sortLines(text: string): string {
  const lines = new Set<string>();
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line && !line.startsWith("#")) lines.add(line);
  }
  return [...lines].sort().join("\n");
}

/**
 * A sorted text list searched in place. A Set of 230,000 hostnames costs about
 * 40 MB in a browser; the text itself plus one offset per line is about 6 MB,
 * and a binary search still answers in a few microseconds. That difference is
 * what keeps the extension light on slow computers.
 *
 * A line's key is the text before its first comma ("domain,rank" -> "domain").
 */
export class SortedLines {
  readonly size: number;
  private readonly text: string;
  private readonly starts: Uint32Array;

  constructor(text: string) {
    if (!SortedLines.isSorted(text)) text = sortLines(text);
    this.text = text;
    const starts: number[] = [];
    let at = 0;
    while (at < text.length) {
      const end = text.indexOf("\n", at);
      const stop = end === -1 ? text.length : end;
      if (stop > at) starts.push(at);
      at = stop + 1;
    }
    this.starts = Uint32Array.from(starts);
    this.size = starts.length;
  }

  private static isSorted(text: string): boolean {
    let previous = "";
    for (const line of text.split("\n")) {
      if (!line) continue;
      if (line.startsWith("#") || line !== line.trim()) return false;
      const key = line.split(",", 1)[0];
      if (key <= previous) return false;
      previous = key;
    }
    return true;
  }

  private line(i: number): string {
    const start = this.starts[i];
    const end = this.text.indexOf("\n", start);
    return this.text.slice(start, end === -1 ? undefined : end);
  }

  /** The line whose key equals `key`, or null. */
  find(key: string): string | null {
    let lo = 0;
    let hi = this.size - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const line = this.line(mid);
      const comma = line.indexOf(",");
      const lineKey = comma === -1 ? line : line.slice(0, comma);
      if (lineKey === key) return line;
      if (lineKey < key) lo = mid + 1;
      else hi = mid - 1;
    }
    return null;
  }

  has(key: string): boolean {
    return this.find(key) !== null;
  }
}

export interface HostnameLookup {
  has(host: string): boolean;
}
export interface RankLookup {
  get(domain: string): number | undefined;
}

/** The phishing list: one hostname per line. */
export function parseHostnameList(text: string): SortedLines {
  return new SortedLines(text);
}

/** The popularity list: "domain,rank" per line. */
export function parseRankList(text: string): RankLookup & { size: number } {
  const lines = new SortedLines(text);
  return {
    size: lines.size,
    get(domain) {
      const line = lines.find(domain);
      const rank = line ? Number(line.slice(line.indexOf(",") + 1)) : NaN;
      return Number.isInteger(rank) && rank > 0 ? rank : undefined;
    },
  };
}

const PHISHDESTROY_URL = "https://github.com/phishdestroy/destroylist";

/** Exact-hostname match only: a listed subdomain never condemns its platform. */
export function reputationFromList(hostname: string, list: HostnameLookup | null, meta: ListMeta | null, now = Date.now()): ReputationResult {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (!list) {
    return { blocklisted: null, top100k: null, source: "PhishDestroy", sourceUrl: PHISHDESTROY_URL, fetchedAt: null, status: "unavailable", match: null };
  }
  const listed = list.has(host);
  // Older than three days means the scheduled refresh stopped: say so instead
  // of vouching with a stale copy.
  const stale = meta ? now - new Date(meta.generatedAt).getTime() > 3 * 86_400_000 : false;
  return {
    blocklisted: stale ? null : listed,
    top100k: null,
    source: "PhishDestroy",
    sourceUrl: PHISHDESTROY_URL,
    fetchedAt: meta?.generatedAt ?? null,
    status: stale ? "stale" : "available",
    match: listed && !stale ? "exact_hostname" : null,
  };
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

export function popularityFromList(hostname: string, ranks: RankLookup | null, meta: ListMeta | null): PopularityResult {
  const domain = registrableDomain(hostname.toLowerCase());
  const rank = ranks?.get(domain) ?? null;
  return {
    top100k: ranks ? rank !== null : null,
    rank,
    domain,
    source: "Tranco",
    sourceUrl: "https://tranco-list.eu/",
    fetchedAt: meta?.generatedAt ?? null,
    // Popularity moves slowly; an old ranking still vouches for an old site.
    status: ranks ? "available" : "unavailable",
  };
}
