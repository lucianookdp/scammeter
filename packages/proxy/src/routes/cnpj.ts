import type { FastifyInstance } from "fastify";
import { normalizeCnpj, validateCnpj, type CnpjRecord } from "@scammeter/core";
import { TtlCache } from "../cache.js";
import { PROXY_USER_AGENT } from "../userAgent.js";

const cache = new TtlCache<CnpjRecord>(60 * 60_000); // 1h — CNPJ status rarely changes minute to minute

const SITUACAO_MAP: Record<string, CnpjRecord["status"]> = {
  ATIVA: "ativa",
  BAIXADA: "baixada",
  INAPTA: "inapta",
  SUSPENSA: "suspensa",
  NULA: "nula",
};

export function registerCnpjRoute(app: FastifyInstance) {
  app.get<{ Params: { cnpj: string } }>("/cnpj/:cnpj", async (req, reply) => {
    const cnpj = normalizeCnpj(req.params.cnpj);
    if (!validateCnpj(cnpj)) {
      return reply.code(400).send({ error: "invalid_cnpj" });
    }

    const cached = cache.get(cnpj);
    if (cached) return { ...cached, cached: true };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
        signal: controller.signal,
        // BrasilAPI's CDN (Cloudflare) 403s requests with no User-Agent at all.
        headers: { "User-Agent": PROXY_USER_AGENT, Accept: "application/json" },
      });
      clearTimeout(timeout);

      if (!res.ok) {
        return reply.code(res.status === 404 ? 404 : 502).send({ error: "cnpj_lookup_failed" });
      }

      const data = (await res.json()) as {
        descricao_situacao_cadastral?: string;
        razao_social?: string;
        nome_fantasia?: string;
        data_inicio_atividade?: string;
        cnae_fiscal_descricao?: string;
        municipio?: string;
      };

      const record: CnpjRecord = {
        status: SITUACAO_MAP[data.descricao_situacao_cadastral ?? ""] ?? "desconhecida",
        razaoSocial: data.razao_social,
        nomeFantasia: data.nome_fantasia,
        abertura: data.data_inicio_atividade,
        cnae: data.cnae_fiscal_descricao,
        municipio: data.municipio,
      };

      cache.set(cnpj, record);
      return { ...record, cached: false };
    } catch {
      return reply.code(504).send({ error: "cnpj_lookup_timeout" });
    }
  });
}
