import type { FastifyInstance } from "fastify";
import { createReputationLookup, reputationHostname } from "../reputation.js";

export function registerReputationRoute(app: FastifyInstance) {
  const lookup = createReputationLookup();
  app.get<{ Params: { domain: string } }>("/reputation/:domain", async (req, reply) => {
    const hostname = reputationHostname(req.params.domain);
    if (!hostname) return reply.code(400).send({ error: "invalid_domain" });
    reply.header("Cache-Control", "no-store");
    return lookup(hostname);
  });
}
