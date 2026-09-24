import { browser } from "wxt/browser";
import { reasonText } from "@scammeter/core";
import type { StoredAnalysis } from "../../lib/messages";
import { storageKeyForTab } from "../../lib/messages";

const app = document.getElementById("app")!;

function t(key: string): string {
  // Keys are built at runtime ("badge_" + verdict), so they can't be checked
  // against the generated message list.
  return browser.i18n.getMessage(key as Parameters<typeof browser.i18n.getMessage>[0]) || key;
}

// Brand and platform names come from the address being checked — never raw HTML.
function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function render(analysis: StoredAnalysis | null) {
  if (!analysis) {
    app.innerHTML = `<p class="empty">${t("popup_no_page")}</p>`;
    return;
  }

  const { result } = analysis;
  const reasons = result.signals
    .map((s) => `<li class="reason reason-${s.status}">${escapeHtml(reasonText(s, t))}</li>`)
    .join("");

  app.innerHTML = `
    <div class="badge badge-${result.verdict}">${t(`badge_${result.verdict}`)}</div>
    <p class="summary">${t(`summary_${result.verdict}`)}</p>
    <ul class="reasons">${reasons}</ul>
    <p class="footer">${t("footer_disclaimer")}</p>
  `;
}

async function init() {
  app.innerHTML = `<p class="loading">${t("popup_checking")}</p>`;
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    render(null);
    return;
  }
  const key = storageKeyForTab(tab.id);
  const stored = await browser.storage.session.get(key);
  render((stored[key] as StoredAnalysis) ?? null);
}

void init();
