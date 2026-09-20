import type { FastifyInstance } from "fastify";
// RDAP only answers for registered domains, so "www.facebook.com" — which is
// what people actually paste — returns nothing. Strip down first.
import { registrableDomain } from "@scammeter/core";
import { TtlCache } from "../cache.js";
import { PROXY_USER_AGENT } from "../userAgent.js";

interface DomainInfo {
  ageDays: number | null;
  registrant: string | null;
}

const cache = new TtlCache<DomainInfo>(6 * 60 * 60_000); // 6h

// Bounded hostname shape only — this is the one thing standing between an
// attacker and making our server fetch an arbitrary URL (SSRF).
const HOSTNAME_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i;

function rdapUrlFor(domain: string): string {
  return domain.endsWith(".br")
    ? `https://rdap.registro.br/domain/${domain}`
    : `https://rdap.org/domain/${domain}`;
}

function extractRegistrationEvent(events: Array<{ eventAction?: string; eventDate?: string }> | undefined) {
  return events?.find((e) => e.eventAction === "registration")?.eventDate ?? null;
}

export function registerDomainRoute(app: FastifyInstance) {
  app.get<{ Params: { domain: string } }>("/domain/:domain", async (req, reply) => {
    const hostname = req.params.domain.toLowerCase();
    if (!HOSTNAME_PATTERN.test(hostname)) {
      return reply.code(400).send({ error: "invalid_domain" });
    }
    const domain = registrableDomain(hostname);

    const cached = cache.get(domain);
    if (cached) return { ...cached, cached: true };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(rdapUrlFor(domain), {
        signal: controller.signal,
        headers: { accept: "application/rdap+json", "User-Agent": PROXY_USER_AGENT },
      });
      clearTimeout(timeout);

      if (!res.ok) {
        // RDAP not supporting this TLD is an expected "unverified" case, not a server error.
        return { ageDays: null, registrant: null, cached: false };
      }

      const data = (await res.json()) as {
        events?: Array<{ eventAction?: string; eventDate?: string }>;
        entities?: Array<{ roles?: string[]; vcardArray?: unknown }>;
      };

      const registrationDate = extractRegistrationEvent(data.events);
      const ageDays = registrationDate
        ? Math.floor((Date.now() - new Date(registrationDate).getTime()) / 86_400_000)
        : null;

      const info: DomainInfo = { ageDays, registrant: null };
      cache.set(domain, info);
      return { ...info, cached: false };
    } catch {
      return reply.code(504).send({ error: "domain_lookup_timeout" });
    }
  });
}
