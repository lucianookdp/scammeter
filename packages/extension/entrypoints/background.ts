import { browser } from "wxt/browser";
import type { Verdict } from "@scammeter/core";
import { checkPage } from "../lib/checker";
import type { CheckRequest, CheckResponse } from "../lib/messages";
import { storageKeyForTab } from "../lib/messages";

// The toolbar icon carries the verdict, so a risky page stays flagged even
// after the banner is closed.
const BADGE: Partial<Record<Verdict, { text: string; color: string }>> = {
  baixo_risco: { text: "✓", color: "#1e7d32" },
  atencao: { text: "!", color: "#8a5b00" },
  alto_risco: { text: "!!", color: "#b3261e" },
  muito_alto_risco: { text: "!!!", color: "#7d1a14" },
};

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: CheckRequest, sender) => {
    const tabId = sender.tab?.id;
    if (message?.type !== "scammeter:check" || tabId === undefined || sender.frameId !== 0) return;
    return checkPage(message.url, message.page).then(async (analysis): Promise<CheckResponse> => {
      if (!analysis) return { needPage: true };
      await browser.storage.session.set({ [storageKeyForTab(tabId)]: analysis });
      const badge = BADGE[analysis.result.verdict];
      await browser.action.setBadgeText({ tabId, text: badge?.text ?? "" });
      if (badge) await browser.action.setBadgeBackgroundColor({ tabId, color: badge.color });
      return { result: analysis.result };
    });
  });

  // A new page in the tab: the old verdict no longer applies.
  browser.tabs.onUpdated.addListener((tabId, change) => {
    if (change.status !== "loading" || !change.url) return;
    void browser.storage.session.remove(storageKeyForTab(tabId));
    void browser.action.setBadgeText({ tabId, text: "" });
  });
  browser.tabs.onRemoved.addListener((tabId) => void browser.storage.session.remove(storageKeyForTab(tabId)));
});
