import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { findValidCnpjInText, findPixPayloadInText } from "@scammeter/core";
import { PROXY_USER_AGENT } from "../userAgent.js";
import { resolvesToPrivateIp } from "../ssrf.js";
import { TtlCache } from "../cache.js";

const MAX_BYTES = 2_000_000; // enough for real page HTML, not enough to be a DoS vector
const FETCH_TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 4;
// A URL is only worth fetching on the ports the web actually serves on.
// Anything else is someone using us to reach an internal service.
const ALLOWED_PORTS = new Set(["", "80", "443", "8080", "8443"]);

/** The checks a URL must pass before we will fetch it, on the way in and on every redirect. */
function isFetchableUrl(url: URL): boolean {
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (!ALLOWED_PORTS.has(url.port)) return false;
  // Embedded credentials would be forwarded upstream and kept in our cache key.
  if (url.username || url.password) return false;
  return true;
}

interface ScanResult {
  fetched: boolean;
  cnpj: string | null;
  pixPayload: string | null;
}

const MAX_URL_LENGTH = 2048;

const cache = new TtlCache<ScanResult>(10 * 60_000); // 10m — a page's own CNPJ/Pix rarely changes minute to minute

async function readCappedText(body: ReadableStream<Uint8Array>): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let html = "";
  let received = 0;
  try {
    while (received < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      // Trim the chunk that crosses the line — checking only before the read
      // let a single large chunk carry us well past the cap.
      const remaining = MAX_BYTES - received;
      const chunk = value.length > remaining ? value.subarray(0, remaining) : value;
      received += chunk.length;
      html += decoder.decode(chunk, { stream: true });
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  return html;
}

/** Fetches the page HTML, following redirects manually so each hop is re-checked against SSRF targets. */
async function safeFetchHtml(startUrl: URL): Promise<string | null> {
  let current = startUrl;

  for (let hop = 0; hop < MAX_REDIRECTS; hop++) {
    if (!isFetchableUrl(current)) return null;
    if (await resolvesToPrivateIp(current.hostname)) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(current, {
        signal: controller.signal,
        redirect: "manual",
        headers: { "User-Agent": PROXY_USER_AGENT, Accept: "text/html" },
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        await res.body?.cancel();
        if (!location) return null;
        try {
          current = new URL(location, current);
        } catch {
          return null;
        }
        continue;
      }

      if (!res.ok || !res.body) {
        await res.body?.cancel();
        return null;
      }
      return await readCappedText(res.body);
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  return null; // too many redirects
}

export function registerScanRoute(app: FastifyInstance) {
  app.get<{ Querystring: { url?: string } }>("/scan", async (req, reply) => {
    const raw = req.query.url;
    if (!raw) return reply.code(400).send({ error: "missing_url" });

    if (raw.length > MAX_URL_LENGTH) return reply.code(400).send({ error: "url_too_long" });

    let target: URL;
    try {
      target = new URL(raw);
    } catch {
      return reply.code(400).send({ error: "invalid_url" });
    }
    if (!isFetchableUrl(target)) {
      return reply.code(400).send({ error: "invalid_url" });
    }

    // Keep query-dependent pages distinct without storing raw tokens as keys.
    target.hash = "";
    const cacheKey = createHash("sha256").update(target.href).digest("hex");
    const cached = cache.get(cacheKey);
    if (cached) return { ...cached, cached: true };

    const html = await safeFetchHtml(target);
    const result: ScanResult =
      html === null
        ? { fetched: false, cnpj: null, pixPayload: null }
        : { fetched: true, cnpj: findValidCnpjInText(html), pixPayload: findPixPayloadInText(html) };

    cache.set(cacheKey, result);
    return { ...result, cached: false };
  });
}
