import type { FastifyInstance } from "fastify";
import { findValidCnpjInText, findPixPayloadInText } from "@scammeter/core";
import { PROXY_USER_AGENT } from "../userAgent.js";
import { resolvesToPrivateIp } from "../ssrf.js";
import { TtlCache } from "../cache.js";

const MAX_BYTES = 2_000_000; // enough for real page HTML, not enough to be a DoS vector
const FETCH_TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 4;

interface ScanResult {
  fetched: boolean;
  cnpj: string | null;
  pixPayload: string | null;
}

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
      received += value.length;
      html += decoder.decode(value, { stream: true });
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
    if (current.protocol !== "http:" && current.protocol !== "https:") return null;
    if (await resolvesToPrivateIp(current.hostname)) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(current, {
        signal: controller.signal,
        redirect: "manual",
        headers: { "User-Agent": PROXY_USER_AGENT, Accept: "text/html" },
      });
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return null;
      try {
        current = new URL(location, current);
      } catch {
        return null;
      }
      continue;
    }

    if (!res.ok || !res.body) return null;
    return readCappedText(res.body);
  }

  return null; // too many redirects
}

export function registerScanRoute(app: FastifyInstance) {
  app.get<{ Querystring: { url?: string } }>("/scan", async (req, reply) => {
    const raw = req.query.url;
    if (!raw) return reply.code(400).send({ error: "missing_url" });

    let target: URL;
    try {
      target = new URL(raw);
    } catch {
      return reply.code(400).send({ error: "invalid_url" });
    }
    if (target.protocol !== "http:" && target.protocol !== "https:") {
      return reply.code(400).send({ error: "invalid_protocol" });
    }

    const cacheKey = target.toString();
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
