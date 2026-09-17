import type { ScoreResult } from "@scammeter/core";

export interface AnalysisMessage {
  type: "scammeter:analysis";
  url: string;
  result: ScoreResult;
}

export interface StoredAnalysis {
  url: string;
  result: ScoreResult;
}

export function storageKeyForTab(tabId: number): string {
  return `analysis:${tabId}`;
}
