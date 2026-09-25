import type { FastifyInstance } from "fastify";
import {
  computeScore,
  scoringInputFrom,
  storeCnpjFrom,
  type CnpjRecord,
  type PageScan,
  type Verdict,
} from "@scammeter/core";
import { TtlCache } from "../cache.js";

const SITE_URL = "https://lucianookdp.github.io/scammeter/";
const MAX_URL_LENGTH = 2048;

const LABELS: Record<Verdict, string> = {
  baixo_risco: "Baixo risco",
  atencao: "Atenção",
  alto_risco: "Alto risco",
  muito_alto_risco: "Risco muito alto",
  nao_verificado: "Não verificado",
};

// A shared link is opened by every person in a group chat, plus WhatsApp's
// own preview crawler; one assessment serves them all for a while.
const cache = new TtlCache<{ verdict: Verdict; score: number }>(10 * 60_000);

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * The link as it will be shared: scheme, host and path. The query string and
 * fragment are dropped, since they carry tracking ids, e-mails and tokens, not the site.
 */
export function shareTarget(raw: string | undefined): URL | null {
  if (!raw || raw.length > MAX_URL_LENGTH) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password || !url.hostname.includes(".")) return null;
    url.search = "";
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

/**
 * A tiny page whose Open Graph tags carry the verdict, so a link pasted in
 * WhatsApp previews as "site: Risco muito alto". The verdict is always
 * computed here, from the site itself: taking it from the link would let
 * anyone mint a "Risco muito alto" preview for an honest shop. People are
 * sent straight on to the full result page.
 */
export function registerShareRoute(app: FastifyInstance) {
  app.get<{ Querystring: { url?: string } }>("/share", async (req, reply) => {
    const target = shareTarget(req.query.url);
    if (!target) return reply.code(400).send({ error: "invalid_url" });

    let result = cache.get(target.href);
    if (!result) {
      // The same routes the web page calls, with their validation, SSRF
      // guard and caches, charged to the caller's own rate limit.
      const get = async <T>(url: string): Promise<T | null> => {
        const res = await app.inject({ method: "GET", url, remoteAddress: req.ip });
        return res.statusCode === 200 ? (res.json() as T) : null;
      };
      const host = encodeURIComponent(target.hostname);
      const [scan, domain, reputation, popularity] = await Promise.all([
        get<PageScan>(`/scan?url=${encodeURIComponent(target.href)}`),
        get<{ ageDays: number | null }>(`/domain/${host}`),
        get<{ blocklisted: boolean | null }>(`/reputation/${host}`),
        get<{ top100k: boolean | null }>(`/popularity/${host}`),
      ]);
      const storeCnpj = storeCnpjFrom({ scan });
      const cnpjRecord = storeCnpj ? await get<CnpjRecord>(`/cnpj/${storeCnpj}`) : undefined;
      const score = computeScore(
        scoringInputFrom({
          hostname: target.hostname,
          scan,
          cnpjRecord,
          domainAgeDays: domain?.ageDays ?? null,
          blocklisted: reputation?.blocklisted,
          top100k: popularity?.top100k,
        }),
      );
      result = { verdict: score.verdict, score: score.score };
      cache.set(target.href, result);
    }

    const page = `${SITE_URL}?site=${encodeURIComponent(target.href)}`;
    const title =
      result.verdict === "nao_verificado"
        ? `${target.hostname}: não verificado`
        : `${target.hostname}: ${LABELS[result.verdict]} (${result.score}/100)`;
    const description = "Resultado do Scammeter. Toque para ver o porquê de cada ponto e checar o site de novo.";

    reply
      .type("text/html; charset=utf-8")
      // No scripts, no styles, nothing to load but the preview image.
      .header("Content-Security-Policy", "default-src 'none'; img-src https:")
      .header("Cache-Control", "public, max-age=600");
    return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<meta name="robots" content="noindex">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Scammeter">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${SITE_URL}og/${result.verdict}.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0; url=${escapeHtml(page)}">
</head>
<body><p><a href="${escapeHtml(page)}">Ver o resultado no Scammeter</a></p></body>
</html>`;
  });
}
