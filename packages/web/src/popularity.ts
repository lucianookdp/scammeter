import type { CheckStatus } from "@scammeter/core";
import type { FetchFailure, PopularityResult } from "./proxyClient";
import { t } from "./i18n";

export function popularityCheck(
  data: PopularityResult | null,
  failure: FetchFailure | null,
  sharedHosting: boolean,
): { value: string; state: CheckStatus } {
  // The ranking is the platform's (vercel.app, github.io), not this page's.
  if (sharedHosting) return { value: t("check_popularity_shared"), state: "unverified" };
  if (failure) return { value: t(`check_failed_${failure}`), state: "unverified" };
  if (!data || data.top100k === null) return { value: t("check_popularity_unavailable"), state: "unverified" };
  if (data.top100k) {
    const rank = data.rank ? ` · #${data.rank.toLocaleString("pt-BR")}` : "";
    return { value: `${t("check_popularity_top")}${rank}`, state: "ok" };
  }
  return { value: t("check_popularity_not_top"), state: "unverified" };
}
