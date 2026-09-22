export type CheckStatus = "ok" | "alert" | "unverified";

export interface CnpjRecord {
  status: "ativa" | "baixada" | "inapta" | "suspensa" | "nula" | string;
  razaoSocial?: string;
  nomeFantasia?: string;
  abertura?: string;
  cnae?: string;
  municipio?: string;
}

export interface ReputationResult {
  blocklisted: boolean | null;
  top100k: null;
  source: "PhishDestroy";
  sourceUrl: string;
  /** Time our server successfully downloaded this copy, not detection time. */
  fetchedAt: string | null;
  status: "available" | "unavailable" | "stale";
  match: "exact_hostname" | null;
}
