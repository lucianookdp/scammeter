import type { CheckStatus, CnpjRecord } from "./types.js";
import type { PixKeyType } from "./pix.js";
import { normalizeCnpj } from "./cnpj.js";

export interface Signal {
  key: string;
  points: number;
  /** i18n key; the UI layer resolves this to PT/EN copy. */
  reasonKey: string;
  status: CheckStatus;
}

export interface ScoringInput {
  siteBlocklisted?: boolean;
  pix?: { keyType: PixKeyType; keyCnpj?: string };
  /** null = no CNPJ found on the page at all. undefined = not checked yet. */
  storeCnpj?: string | null;
  /** null = CNPJ lookup failed/unavailable. undefined = not attempted. */
  cnpjRecord?: CnpjRecord | null;
  /** null = domain age could not be verified (RDAP unsupported/unreachable). */
  domainAgeDays?: number | null;
  domainRankTop100k?: boolean;
  isMarketplace?: boolean;
  // Camada 3 signals — optional because they depend on heuristics the proxy
  // may not have computed yet (brand list, CNAE taxonomy, WHOIS privacy).
  domainImitatesBrand?: boolean;
  registrantMismatch?: boolean;
  cnaeMismatch?: boolean;
  missingAddress?: boolean;
  missingReturnPolicy?: boolean;
  contactOnlyWhatsappOrFreeEmail?: boolean;
  cheapTldPrivateWhois?: boolean;
  brokenSocialLinks?: boolean;
}

export type Verdict = "baixo_risco" | "atencao" | "alto_risco" | "nao_verificado";

export interface ScoreResult {
  score: number;
  verdict: Verdict;
  signals: Signal[];
}

export function computeScore(input: ScoringInput): ScoreResult {
  const signals: Signal[] = [];
  let score = 0;

  const add = (key: string, points: number, reasonKey: string, status: CheckStatus = "alert") => {
    signals.push({ key, points, reasonKey, status });
    score += points;
  };

  if (input.siteBlocklisted) add("blocklist", 100, "reason.blocklist");

  if (input.pix) {
    const { keyType, keyCnpj } = input.pix;
    if (keyType === "cpf" || keyType === "phone" || keyType === "email") {
      add("pix_personal", 50, "reason.pix_personal");
    } else if (keyType === "cnpj" && input.storeCnpj && keyCnpj && normalizeCnpj(keyCnpj) !== normalizeCnpj(input.storeCnpj)) {
      add("pix_wrong_cnpj", 45, "reason.pix_wrong_cnpj");
    }
  }

  if (input.cnpjRecord && input.cnpjRecord.status !== "ativa") {
    add("cnpj_inactive", 45, "reason.cnpj_inactive");
  }
  if (input.storeCnpj === null) add("no_cnpj", 30, "reason.no_cnpj");
  if (typeof input.domainAgeDays === "number" && input.domainAgeDays < 30) {
    add("domain_new", 25, "reason.domain_new");
  }
  if (input.domainImitatesBrand) add("brand_lookalike", 30, "reason.brand_lookalike");
  if (input.cnaeMismatch) add("cnae_mismatch", 20, "reason.cnae_mismatch");
  if (input.registrantMismatch) add("registrant_mismatch", 15, "reason.registrant_mismatch");
  if (input.missingAddress) add("missing_address", 10, "reason.missing_address");
  if (input.missingReturnPolicy) add("missing_return_policy", 10, "reason.missing_return_policy");
  if (input.contactOnlyWhatsappOrFreeEmail) add("contact_only_whatsapp", 10, "reason.contact_only_whatsapp");
  if (input.cheapTldPrivateWhois) add("cheap_tld_private_whois", 10, "reason.cheap_tld_private_whois");
  if (input.brokenSocialLinks) add("broken_social_links", 5, "reason.broken_social_links");

  if (input.domainRankTop100k) add("tranco_top100k", -40, "reason.tranco_top100k", "ok");
  if (
    typeof input.domainAgeDays === "number" &&
    input.domainAgeDays > 5 * 365 &&
    input.cnpjRecord?.status === "ativa"
  ) {
    add("domain_established", -25, "reason.domain_established", "ok");
  }

  score = Math.max(0, Math.min(100, score));

  const cnpjUnverified = input.storeCnpj != null && input.cnpjRecord === null;
  const domainUnverified = input.domainAgeDays === null;
  const insufficientData = !input.siteBlocklisted && cnpjUnverified && domainUnverified;

  let verdict: Verdict;
  if (input.siteBlocklisted) verdict = "alto_risco";
  else if (insufficientData) verdict = "nao_verificado";
  else if (score >= 50) verdict = "alto_risco";
  else if (score >= 20) verdict = "atencao";
  else verdict = "baixo_risco";

  if (input.isMarketplace) {
    signals.unshift({ key: "marketplace_notice", points: 0, reasonKey: "reason.marketplace_notice", status: "ok" });
  }

  return { score, verdict, signals };
}
