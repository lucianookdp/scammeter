import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { isRateLimited } from "./rateLimit.js";
import { registerCnpjRoute } from "./routes/cnpj.js";
import { registerDomainRoute } from "./routes/domain.js";
import { registerPopularityRoute } from "./routes/popularity.js";
import { registerReputationRoute } from "./routes/reputation.js";
import { registerScanRoute } from "./routes/scan.js";

export interface BuildOptions {
  logger?: boolean;
}

export async function buildApp({ logger = true }: BuildOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger, trustProxy: true });

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
    // A CORS preflight isn't a lookup; counting it would halve everyone's budget.
    if (req.method === "OPTIONS") return;
    if (isRateLimited(req.ip)) {
      // The `return` matters: an async hook that sends without returning the
      // reply lets the request carry on into the handler, so the limit was
      // being reported and then ignored.
      return reply.code(429).send({ error: "rate_limited" });
    }
  });

  // Nothing here is a document, and none of it should be sniffed or framed.
  app.addHook("onSend", async (_req, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "no-referrer");
  });

  app.get("/", async () => ({ status: "ok", service: "scammeter-proxy" }));

  registerCnpjRoute(app);
  registerDomainRoute(app);
  registerReputationRoute(app);
  registerPopularityRoute(app);
  registerScanRoute(app);

  return app;
}
