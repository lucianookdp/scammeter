import type { CheckStatus, ReputationResult } from "@scammeter/core";
import type { FetchFailure } from "./proxyClient";
import { t } from "./i18n";

export function reputationCheck(data: ReputationResult | null, failure: FetchFailure | null): { value: string; state: CheckStatus } {
  if (failure) return { value: t(`check_failed_${failure}`), state: "unverified" };
  if (!data || data.status !== "available" || data.blocklisted === null) {
    return { value: t(data?.status === "stale" ? "check_blocklist_stale" : "check_blocklist_unavailable"), state: "unverified" };
  }
  const date = data.fetchedAt ? new Date(data.fetchedAt) : null;
  const downloaded = date && Number.isFinite(date.getTime())
    ? ` · ${t("check_blocklist_downloaded")} ${date.toLocaleString("pt-BR")}` : "";
  return {
    value: `${t(data.blocklisted ? "check_blocklist_listed" : "check_blocklist_clean")} · PhishDestroy${downloaded}`,
    state: data.blocklisted ? "alert" : "unverified",
  };
}
