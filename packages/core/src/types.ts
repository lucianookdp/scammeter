export type CheckStatus = "ok" | "alert" | "unverified";

export interface CnpjRecord {
  status: "ativa" | "baixada" | "inapta" | "suspensa" | "nula" | string;
  razaoSocial?: string;
  nomeFantasia?: string;
  abertura?: string;
  cnae?: string;
  municipio?: string;
}
