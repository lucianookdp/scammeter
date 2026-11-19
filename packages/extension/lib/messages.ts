import type { CnpjRecord, PageScan, ScoreResult } from "@scammeter/core";

/**
 * Content script -> background. First without `page` (the address may be
 * enough); again with it only when the background answers `needPage`.
 */
export interface CheckRequest {
  type: "scammeter:check";
  url: string;
  page: PageScan | null;
}

export type CheckResponse = { result: ScoreResult } | { needPage: true };

/** What each lookup found, so the popup can show the evidence, not just the verdict. */
export interface CheckFacts {
  ageDays: number | null;
  cnpj: string | null;
  cnpjRecord: CnpjRecord | null;
  blocklisted: boolean | null;
  rank: number | null;
  /** Popular or official sites aren't looked up anywhere, to keep browsing private. */
  skippedLookups: boolean;
}

export interface StoredAnalysis {
  url: string;
  result: ScoreResult;
  facts: CheckFacts;
}

export function storageKeyForTab(tabId: number): string {
  return `analysis:${tabId}`;
}
