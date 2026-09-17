import Fastify from "fastify";
import cors from "@fastify/cors";
import { isRateLimited } from "./rateLimit.js";
import { registerCnpjRoute } from "./routes/cnpj.js";
import { registerDomainRoute } from "./routes/domain.js";
import { registerReputationRoute } from "./routes/reputation.js";

const app = Fastify({ logger: true, trustProxy: true });

// Only the extension and the web app may call this proxy — never a bare
// `origin: true`, that would turn it into a free public API for anyone.
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

await app.register(cors, {
  origin: allowedOrigins.length > 0 ? allowedOrigins : false,
});

app.addHook("onRequest", async (req, reply) => {
  if (isRateLimited(req.ip)) {
    reply.code(429).send({ error: "rate_limited" });
  }
});

app.get("/", async () => ({ status: "ok", service: "scammeter-proxy" }));

registerCnpjRoute(app);
registerDomainRoute(app);
registerReputationRoute(app);

const port = Number(process.env.PORT ?? 8787);
app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
