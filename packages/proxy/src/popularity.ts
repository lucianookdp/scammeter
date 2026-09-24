import { inflateRawSync } from "node:zlib";
import { registrableDomain } from "@scammeter/core";
import { PROXY_USER_AGENT } from "./userAgent.js";

// The Tranco list: a research ranking of the most visited registrable domains,
// averaged over several providers so no single one can be gamed. The file is
// public; no submitted hostname is ever sent upstream. See THIRD_PARTY_NOTICES.md.
const LIST_URL = "https://tranco-list.eu/top-1m.csv.zip";
export const TRANCO_SOURCE_URL = "https://tranco-list.eu/";
const TOP_N = 100_000;
const TTL_MS = 24 * 60 * 60_000; // the list itself is published daily
const RETRY_MS = 10 * 60_000;
const MAX_ZIP_BYTES = 32 * 1024 * 1024;
const MAX_CSV_BYTES = 64 * 1024 * 1024;
const TIMEOUT_MS = 20_000;

export interface PopularityResult {
  /** true/false when the list is loaded, null when it isn't. */
  top100k: boolean | null;
  rank: number | null;
  domain: string;
  source: "Tranco";
  sourceUrl: string;
  fetchedAt: string | null;
  status: "available" | "unavailable" | "stale";
}

/**
 * The first file inside a zip archive, decompressed. Reads the central
 * directory rather than the local header, because the local header's sizes are
 * zero when the archive was streamed (general-purpose flag bit 3).
 */
export function unzipFirstEntry(zip: Buffer, maxOutput = MAX_CSV_BYTES): Buffer {
  const EOCD = 0x06054b50;
  let eocd = -1;
  // The end-of-central-directory record sits in the last 22 bytes plus an
  // optional comment of up to 64 KiB.
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i--) {
    if (zip.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("zip_no_eocd");
  const cdOffset = zip.readUInt32LE(eocd + 16);
  if (cdOffset + 46 > zip.length || zip.readUInt32LE(cdOffset) !== 0x02014b50) throw new Error("zip_bad_cd");
  const method = zip.readUInt16LE(cdOffset + 10);
  const compressedSize = zip.readUInt32LE(cdOffset + 20);
  const localOffset = zip.readUInt32LE(cdOffset + 42);
  if (localOffset + 30 > zip.length || zip.readUInt32LE(localOffset) !== 0x04034b50) throw new Error("zip_bad_local");
  const dataStart = localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28);
  const data = zip.subarray(dataStart, dataStart + compressedSize);
  if (data.length !== compressedSize) throw new Error("zip_truncated");
  if (method === 0) return data;
  if (method === 8) return inflateRawSync(data, { maxOutputLength: maxOutput });
  throw new Error("zip_unsupported_method");
}

const DOMAIN_SHAPE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

/** "1,google.com\n2,facebook.com\n…" -> domain -> rank, first `limit` rows only. */
export function parseTrancoCsv(csv: string, limit = TOP_N): Map<string, number> {
  const ranks = new Map<string, number>();
  let start = 0;
  while (ranks.size < limit && start < csv.length) {
    let end = csv.indexOf("\n", start);
    if (end === -1) end = csv.length;
    const line = csv.slice(start, end).trim();
    start = end + 1;
    const comma = line.indexOf(",");
    if (comma <= 0) continue;
    const rank = Number(line.slice(0, comma));
    const domain = line.slice(comma + 1).toLowerCase();
    if (Number.isInteger(rank) && rank > 0 && DOMAIN_SHAPE.test(domain) && !ranks.has(domain)) ranks.set(domain, rank);
  }
  return ranks;
}

async function downloadList(): Promise<Map<string, number>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(LIST_URL, {
      signal: controller.signal,
      headers: { Accept: "application/zip", "User-Agent": PROXY_USER_AGENT },
    });
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw new Error("list_unavailable");
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_ZIP_BYTES) throw new Error("list_too_large");
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    const ranks = parseTrancoCsv(unzipFirstEntry(Buffer.concat(chunks)).toString("utf8"));
    // A truncated or wrong file must never become a short "popular" list that
    // quietly stops vouching for real sites.
    if (ranks.size < TOP_N * 0.9) throw new Error("invalid_list");
    return ranks;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * One bounded list cache per app, same shape as the phishing feed: refresh on
 * demand, share one download between concurrent callers, back off on failure.
 * An expired copy is still used — popularity changes slowly, and unlike a
 * blocklist a day-old ranking can't hide a new threat.
 * ponytail: memory only (~10 MB for 100k names); each replica downloads its own copy.
 */
export function createPopularityLookup(download: () => Promise<Map<string, number>> = downloadList) {
  let snapshot: { ranks: Map<string, number>; fetchedAt: number } | null = null;
  let pending: Promise<void> | null = null;
  let retryAt = 0;

  return async (hostname: string): Promise<PopularityResult> => {
    if ((!snapshot || Date.now() - snapshot.fetchedAt >= TTL_MS) && Date.now() >= retryAt) {
      if (!pending) {
        pending = download()
          .then((ranks) => {
            snapshot = { ranks, fetchedAt: Date.now() };
          })
          .catch(() => {
            retryAt = Date.now() + RETRY_MS;
          })
          .finally(() => {
            pending = null;
          });
      }
      // A cold start waits for the list; a refresh serves the old copy meanwhile.
      if (!snapshot) await pending;
    }
    const domain = registrableDomain(hostname);
    const current = snapshot;
    const rank = current?.ranks.get(domain) ?? null;
    return {
      top100k: current ? rank !== null : null,
      rank,
      domain,
      source: "Tranco",
      sourceUrl: TRANCO_SOURCE_URL,
      fetchedAt: current ? new Date(current.fetchedAt).toISOString() : null,
      status: !current ? "unavailable" : Date.now() - current.fetchedAt < TTL_MS ? "available" : "stale",
    };
  };
}
