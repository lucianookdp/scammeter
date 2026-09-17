import type { FastifyInstance } from "fastify";

// ponytail: stub. Safe Browsing/URLhaus/PhishTank/Tranco need locally-cached
// hash/URL lists refreshed on a cron, which is a separate piece of
// infrastructure — wire it in for v0.2 (see project roadmap). Until then this
// always reports "unverified" rather than a fabricated "clean" result, so the
// scoring engine correctly falls back to nao_verificado instead of a false
// baixo_risco.
export function registerReputationRoute(app: FastifyInstance) {
  app.get<{ Params: { domain: string } }>("/reputation/:domain", async () => {
    return { blocklisted: null, top100k: null };
  });
}
