import { domainToASCII } from "node:url";
import { isIP } from "node:net";
import type { ReputationResult } from "@scammeter/core";
import { PROXY_USER_AGENT } from "./userAgent.js";

// Primary curated list only, not the aggregated community feed. No submitted
// hostname is ever sent to the provider. Attribution: THIRD_PARTY_NOTICES.md.
const FEED_URL = "https://raw.githubusercontent.com/phishdestroy/destroylist/main/list.txt";
const SOURCE_URL = "https://github.com/phishdestroy/destroylist";
const TTL_MS = 60 * 60_000;
const RETRY_MS = 60_000;
const MAX_BYTES = 8 * 1024 * 1024;

export function reputationHostname(value: string): string | null {
  if (!value || /[\s/\\:@?#%\[\]]/.test(value)) return null;
  const host = domainToASCII(value.toLowerCase().replace(/\.$/, ""));
  if (!host || host.length > 253 || isIP(host)) return null;
  const labels = host.split(".");
  if (labels.length < 2 || !/[a-z]/.test(labels.at(-1)!)) return null;
  return labels.every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) ? host : null;
}

async function downloadDomains(): Promise<Set<string>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch(FEED_URL, {
      signal: controller.signal,
      redirect: "error",
      headers: { Accept: "text/plain", "User-Agent": PROXY_USER_AGENT },
    });
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw new Error("feed_unavailable");
    }
    const reader = response.body.getReader();
    let bytes = 0;
    let text = "";
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_BYTES) throw new Error("feed_too_large");
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
    } finally {
      await reader.cancel().catch(() => {});
    }
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith("#"));
    const domains = lines.map(reputationHostname).filter((host): host is string => host !== null);
    // Empty, truncated or HTML error documents must never become a clean list.
    if (!domains.length || domains.length < lines.length * 0.9) throw new Error("invalid_feed");
    return new Set(domains);
  } finally {
    clearTimeout(timeout);
  }
}

/** One bounded feed cache per app. Refresh on demand, coalesce concurrent
 * downloads, and back off for a minute after failures. No cron is needed.
 * ponytail: memory only; each replica downloads its own copy after restart. */
export function createReputationLookup() {
  let snapshot: { domains: Set<string>; fetchedAt: number } | null = null;
  let pending: Promise<void> | null = null;
  let retryAt = 0;

  return async (hostname: string): Promise<ReputationResult> => {
    if ((!snapshot || Date.now() - snapshot.fetchedAt >= TTL_MS) && Date.now() >= retryAt) {
      if (!pending) {
        pending = downloadDomains().then(domains => {
          snapshot = { domains, fetchedAt: Date.now() };
        }).catch(() => {
          retryAt = Date.now() + RETRY_MS;
        }).finally(() => { pending = null; });
      }
      await pending;
    }
    const current = snapshot;
    const fresh = current !== null && Date.now() - current.fetchedAt < TTL_MS;
    // Exact hostname only. Never condemn a platform or sibling tenant because
    // a different subdomain appeared in the feed; no registrable-domain heuristic.
    const listed = fresh ? current.domains.has(hostname) : null;
    return {
      blocklisted: listed,
      top100k: null,
      source: "PhishDestroy",
      sourceUrl: SOURCE_URL,
      fetchedAt: current ? new Date(current.fetchedAt).toISOString() : null,
      status: fresh ? "available" : current ? "stale" : "unavailable",
      match: listed ? "exact_hostname" : null,
    };
  };
}
