import { analyzeHostname, companyMatchesHost, titleImpersonation } from "./domain.js";
import { parsePixPayload } from "./pix.js";
import type { ScoringInput } from "./scoring.js";
import type { CnpjRecord } from "./types.js";

/** What the proxy's /scan returns for a page. */
export interface PageScan {
  fetched: boolean;
  cnpj: string | null;
  pixPayload: string | null;
  title?: string | null;
  asksCredentials?: boolean;
}

/** Everything the lookups returned for one site; absent means "not looked up". */
export interface SiteLookups {
  hostname: string;
  scan?: PageScan | null;
  manualCnpj?: string;
  manualPix?: string;
  cnpjRecord?: CnpjRecord | null;
  domainAgeDays?: number | null;
  blocklisted?: boolean | null;
  top100k?: boolean | null;
}

/**
 * The CNPJ to score the site against: the one typed in, else the one found on
 * the page. null = the page was read and shows none; undefined = unknown.
 */
export function storeCnpjFrom(lookups: Pick<SiteLookups, "scan" | "manualCnpj">): string | null | undefined {
  if (lookups.manualCnpj) return lookups.manualCnpj;
  return lookups.scan?.fetched ? lookups.scan.cnpj : undefined;
}

/**
 * Turns lookups into the score's input. The web page and the proxy's share
 * preview both build it here, so a shared link can't disagree with what the
 * person saw on the page.
 */
export function scoringInputFrom(lookups: SiteLookups): ScoringInput {
  const { hostname, scan, cnpjRecord } = lookups;
  const storeCnpj = storeCnpjFrom(lookups);
  const pixPayload = lookups.manualPix || scan?.pixPayload || "";
  const pix = pixPayload ? parsePixPayload(pixPayload) : null;

  return {
    ...analyzeHostname(hostname),
    siteBlocklisted: lookups.blocklisted ?? undefined,
    domainRankTop100k: lookups.top100k ?? undefined,
    storeCnpj,
    cnpjRecord: storeCnpj ? (cnpjRecord ?? null) : undefined,
    domainAgeDays: lookups.domainAgeDays ?? null,
    titleBrand: titleImpersonation(scan?.title, hostname) ?? undefined,
    asksCredentials: scan?.asksCredentials,
    companyNameMismatch: cnpjRecord?.razaoSocial
      ? !companyMatchesHost([cnpjRecord.razaoSocial, cnpjRecord.nomeFantasia], hostname)
      : undefined,
    pix:
      pix?.merchantAccount?.key && pix.keyType !== "unknown"
        ? { keyType: pix.keyType, keyCnpj: pix.keyType === "cnpj" ? pix.merchantAccount.key : undefined }
        : undefined,
  };
}
