import { browser } from "wxt/browser";
import type { AnalysisMessage } from "../lib/messages";
import { storageKeyForTab } from "../lib/messages";

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: AnalysisMessage, sender) => {
    if (message?.type !== "scammeter:analysis" || !sender.tab?.id) return;
    void browser.storage.session.set({
      [storageKeyForTab(sender.tab.id)]: { url: message.url, result: message.result },
    });
  });
});
