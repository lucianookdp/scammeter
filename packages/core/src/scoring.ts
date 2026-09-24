import type { CheckStatus, CnpjRecord } from "./types.js";
import type { PixKeyType } from "./pix.js";
import { normalizeCnpj } from "./cnpj.js";

export interface Signal {
  key: string;
  points: number;
  /** i18n key; the UI layer resolves this to PT/EN copy. */
  reasonKey: string;
  status: CheckStatus;
  /** Values the copy interpolates, e.g. {brand} in "imita a marca {brand}". */
  params?: Record<string, string>;
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

  // Read off the address alone — see analyzeHostname().
  domainImitatesBrand?: boolean;
  brandTyposquat?: boolean;
  impersonatedBrand?: string;
  officialBrand?: string;
  restrictedTld?: boolean;
  /** The free platform the page lives on ("vercel.app"), if any. */
  sharedHosting?: string;
  suspiciousKeywords?: boolean;
  punycode?: boolean;
  ipHost?: boolean;
  cheapTldPrivateWhois?: boolean;

  // Page-content signals — optional because they depend on heuristics the
  // proxy may not have computed yet (CNAE taxonomy, WHOIS privacy).
  registrantMismatch?: boolean;
  cnaeMismatch?: boolean;
  missingAddress?: boolean;
  missingReturnPolicy?: boolean;
  contactOnlyWhatsappOrFreeEmail?: boolean;
  brokenSocialLinks?: boolean;
}

export type Verdict = "baixo_risco" | "atencao" | "alto_risco" | "muito_alto_risco" | "nao_verificado";

/** Lower bound of each band. Below `atencao` is low risk (or unverified). */
export const VERDICT_BANDS = { atencao: 15, alto_risco: 40, muito_alto_risco: 70 } as const;

/**
 * Where a site with no track record at all lands. Nothing wrong was found, but
 * nothing vouches for it either, and "low risk" would read as a clean bill.
 */
const NO_TRACK_RECORD_FLOOR = 30;

export interface ScoreResult {
  score: number;
  verdict: Verdict;
  signals: Signal[];
}

/**
 * A usable age, or null. A registry can report a registration date in the
 * future (clock skew, a bad parse), and `-5 < 30` would otherwise read as
 * "created days ago" — inventing an alert out of broken data.
 */
function usableAgeDays(days: number | null | undefined): number | null {
  if (typeof days !== "number" || !Number.isFinite(days) || days < 0) return null;
  return days;
}

export function computeScore(input: ScoringInput): ScoreResult {
  const signals: Signal[] = [];
  const shared = Boolean(input.sharedHosting);
  // On a shared platform the registration date and the ranking belong to the
  // platform — `golpe.vercel.app` must not inherit vercel.app's ten years.
  const domainAgeDays = shared ? null : usableAgeDays(input.domainAgeDays);
  const popular = !shared && input.domainRankTop100k === true;
  const young = domainAgeDays !== null && domainAgeDays < 180;
  const established = domainAgeDays !== null && domainAgeDays > 2 * 365;
  const brandParams = input.impersonatedBrand ? { brand: input.impersonatedBrand } : undefined;
  let score = 0;

  const add = (
    key: string,
    points: number,
    reasonKey: string,
    status: CheckStatus = "alert",
    params?: Record<string, string>,
  ) => {
    signals.push(params ? { key, points, reasonKey, status, params } : { key, points, reasonKey, status });
    score += points;
  };

  if (input.siteBlocklisted) add("blocklist", 100, "reason.blocklist");
  if (input.ipHost) add("ip_host", 40, "reason.ip_host");

  if (input.pix) {
    const { keyType, keyCnpj } = input.pix;
    if (keyType === "cpf" || keyType === "phone" || keyType === "email") {
      add("pix_personal", 50, "reason.pix_personal");
    } else if (keyType === "cnpj" && input.storeCnpj && keyCnpj && normalizeCnpj(keyCnpj) !== normalizeCnpj(input.storeCnpj)) {
      add("pix_wrong_cnpj", 50, "reason.pix_wrong_cnpj");
    }
  }

  if (input.cnpjRecord && ["baixada", "inapta", "suspensa", "nula"].includes(input.cnpjRecord.status)) {
    add("cnpj_inactive", 45, "reason.cnpj_inactive");
  }

  // Most sites on the web have no reason to publish a CNPJ — a foreign site, a
  // news page, a social network. Its absence is missing information, not a red
  // flag. It only becomes one when the page is asking you for money: then not
  // knowing who receives it is the whole problem.
  if (input.storeCnpj === null) {
    if (input.pix) add("no_cnpj_with_payment", 25, "reason.no_cnpj_with_payment");
    else add("no_cnpj", 0, "reason.no_cnpj", "unverified");
  }

  // Fake shops live for weeks to a few months, so the penalty fades over the
  // first year instead of vanishing on day 30.
  if (domainAgeDays !== null) {
    if (domainAgeDays < 30) add("domain_new", 35, "reason.domain_new");
    else if (domainAgeDays < 90) add("domain_young", 25, "reason.domain_young");
    else if (domainAgeDays < 180) add("domain_recent", 15, "reason.domain_recent");
    else if (domainAgeDays < 365) add("domain_under_year", 10, "reason.domain_under_year");
  }

  if (input.domainImitatesBrand) {
    add("brand_lookalike", 45, "reason.brand_lookalike", "alert", brandParams);
  } else if (input.brandTyposquat) {
    // A near-miss spelling that has been online for years is usually someone's
    // real name, not a trap — still worth a look, not a red light.
    if (established || popular) add("brand_typosquat_old", 20, "reason.brand_typosquat_old", "alert", brandParams);
    else add("brand_typosquat", 50, "reason.brand_typosquat", "alert", brandParams);
  }
  if (input.punycode) add("punycode", 25, "reason.punycode");
  if (shared) add("shared_hosting", 15, "reason.shared_hosting", "alert", { platform: input.sharedHosting! });
  if (input.suspiciousKeywords) add("suspicious_keywords", 10, "reason.suspicious_keywords");
  if (input.cheapTldPrivateWhois) add("cheap_tld_private_whois", 10, "reason.cheap_tld_private_whois");

  if (input.cnaeMismatch) add("cnae_mismatch", 20, "reason.cnae_mismatch");
  if (input.registrantMismatch) add("registrant_mismatch", 15, "reason.registrant_mismatch");
  if (input.missingAddress) add("missing_address", 10, "reason.missing_address");
  if (input.missingReturnPolicy) add("missing_return_policy", 10, "reason.missing_return_policy");
  if (input.contactOnlyWhatsappOrFreeEmail) add("contact_only_whatsapp", 10, "reason.contact_only_whatsapp");
  if (input.brokenSocialLinks) add("broken_social_links", 5, "reason.broken_social_links");

  // Signals that are mild apart and damning together. Each gets its own line,
  // so the extra weight is arithmetic the reader can follow, not a hidden bump.
  const wearsBrand = input.domainImitatesBrand || (input.brandTyposquat && !established && !popular);
  if (wearsBrand && young) add("combo_brand_new", 25, "reason.combo_brand_new");
  if (wearsBrand && shared) add("combo_brand_hosting", 25, "reason.combo_brand_hosting");
  if (wearsBrand && input.suspiciousKeywords) add("combo_brand_bait", 15, "reason.combo_brand_bait");
  if (input.cheapTldPrivateWhois && young) add("combo_cheap_new", 15, "reason.combo_cheap_new");

  const official = Boolean(input.officialBrand) && !shared;
  if (official) add("official_domain", -100, "reason.official_domain", "ok", { brand: input.officialBrand! });
  if (input.restrictedTld) add("restricted_tld", -40, "reason.restricted_tld", "ok");
  if (popular) add("tranco_top100k", -40, "reason.tranco_top100k", "ok");

  // Domain age stands on its own. Gating it on an active CNPJ meant no site
  // without a published CNPJ could ever earn credit for being 20 years old.
  if (domainAgeDays !== null) {
    if (domainAgeDays > 5 * 365) add("domain_established", -25, "reason.domain_established", "ok");
    else if (established) add("domain_mature", -10, "reason.domain_mature", "ok");
  }
  const cnpjActive = input.cnpjRecord?.status === "ativa";
  if (cnpjActive) add("cnpj_active", 0, "reason.cnpj_active", "ok");

  // Reputation and age cannot erase the strongest observed warning.
  const strongestWarning = Math.max(0, ...signals.filter(s => s.status === "alert").map(s => s.points));
  score = Math.max(strongestWarning, Math.min(100, score));

  // "Low risk" has to mean something was actually checked. If every lookup came
  // back empty, a score of 0 is ignorance, not a clean bill of health.
  const verifiedSomething = domainAgeDays !== null || cnpjActive || official || Boolean(input.restrictedTld) || popular;
  const hasTrackRecord =
    official || Boolean(input.restrictedTld) || popular || cnpjActive || (domainAgeDays !== null && domainAgeDays >= 365);

  // A months-old site with nothing to vouch for it is not "low risk" just
  // because nothing damning turned up yet.
  if (verifiedSomething && !hasTrackRecord && score < NO_TRACK_RECORD_FLOOR) {
    signals.push({ key: "no_track_record", points: NO_TRACK_RECORD_FLOOR - score, reasonKey: "reason.no_track_record", status: "alert" });
    score = NO_TRACK_RECORD_FLOOR;
  }

  let verdict: Verdict;
  if (input.siteBlocklisted) verdict = "muito_alto_risco";
  else if (score >= VERDICT_BANDS.muito_alto_risco) verdict = "muito_alto_risco";
  else if (score >= VERDICT_BANDS.alto_risco) verdict = "alto_risco";
  else if (score >= VERDICT_BANDS.atencao) verdict = "atencao";
  else if (verifiedSomething) verdict = "baixo_risco";
  else verdict = "nao_verificado";

  if (input.isMarketplace) {
    signals.unshift({ key: "marketplace_notice", points: 0, reasonKey: "reason.marketplace_notice", status: "ok" });
  }

  return { score, verdict, signals };
}

/**
 * The copy for a signal. A signal carrying params prefers the `_named` variant
 * ("imita o nome {brand}") when the catalogue has one, and falls back to the
 * generic line otherwise, so a missing name never leaves a raw "{brand}".
 */
export function reasonText(signal: Signal, t: (key: string) => string): string {
  const key = signal.reasonKey.replace(/\./g, "_");
  if (signal.params) {
    const namedKey = `${key}_named`;
    const named = t(namedKey);
    if (named && named !== namedKey) {
      return named.replace(/\{(\w+)\}/g, (match, name: string) => signal.params?.[name] ?? match);
    }
  }
  return t(key);
}
