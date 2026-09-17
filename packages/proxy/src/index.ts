import Fastify from "fastify";
import cors from "@fastify/cors";
import { isRateLimited } from "./rateLimit.js";
import { registerCnpjRoute } from "./routes/cnpj.js";
import { registerDomainRoute } from "./routes/domain.js";
import { registerReputationRoute } from "./routes/reputation.js";
import { registerScanRoute } from "./routes/scan.js";

const app = Fastify({ logger: true, trustProxy: true });

// Only the extension and the web app may call this proxy — never a bare
// `origin: true`, that would turn it into a free public API for anyone.
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

await app.register(cors, {
  // ponytail: any chrome-extension:// origin, not just one fixed ID — an
  // unpacked dev install gets a random ID per machine. Tighten to the exact
  // published extension ID once it's live on the Chrome Web Store.
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (origin.startsWith("chrome-extension://") || allowedOrigins.includes(origin)) {
      return cb(null, true);
    }
    cb(null, false);
  },
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
registerScanRoute(app);

const port = Number(process.env.PORT ?? 8787);
app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
