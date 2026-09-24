import type { FastifyInstance } from "fastify";
import { createPopularityLookup } from "../popularity.js";
import { reputationHostname } from "../reputation.js";

export function registerPopularityRoute(app: FastifyInstance, lookup = createPopularityLookup()) {
  app.get<{ Params: { domain: string } }>("/popularity/:domain", async (req, reply) => {
    const hostname = reputationHostname(req.params.domain);
    if (!hostname) return reply.code(400).send({ error: "invalid_domain" });
    reply.header("Cache-Control", "no-store");
    return lookup(hostname);
  });
}
