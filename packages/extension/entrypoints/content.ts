import { browser } from "wxt/browser";
import {
  findPixPayloadInText,
  findValidCnpjInText,
  pageAsksCredentials,
  type ScoreResult,
} from "@scammeter/core";
import type { CheckRequest, CheckResponse } from "../lib/messages";
import type { PageScan } from "@scammeter/core";

const MAX_TEXT_LENGTH = 200_000; // cap collection so a huge page can't stall analysis

/** Waits for a quiet moment, so reading the page never competes with it loading. */
const idle = () => new Promise<void>((resolve) => requestIdleCallback(() => resolve(), { timeout: 2000 }));

function readPage(): PageScan {
  // textContent, not innerText: innerText forces a layout pass, which is the
  // expensive part on a heavy page and on a slow computer.
  const bodyText = (document.body?.textContent ?? "").slice(0, MAX_TEXT_LENGTH);
  const html = document.documentElement.innerHTML.slice(0, MAX_TEXT_LENGTH);
  return {
    fetched: true,
    cnpj: findValidCnpjInText(bodyText),
    pixPayload: findPixPayloadInText(html),
    title: document.title,
    asksCredentials: pageAsksCredentials(html),
  };
}

async function ask(page: PageScan | null): Promise<CheckResponse | undefined> {
  const request: CheckRequest = { type: "scammeter:check", url: location.href, page };
  try {
    return (await browser.runtime.sendMessage(request)) as CheckResponse | undefined;
  } catch {
    return undefined; // extension reloaded or updated while the page was open
  }
}

export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  runAt: "document_idle",
  async main() {
    // Intranet names aren't sites anyone needs warning about.
    if (!location.hostname.includes(".")) return;

    // Step 1: the address alone. For a popular or official site that's the
    // whole check, and the page is never read.
    let response = await ask(null);
    // Step 2: an unknown site. Read the page once it's idle. Only these few
    // values leave the tab, and only to the extension's own background worker.
    if (response && "needPage" in response) {
      await idle();
      response = await ask(readPage());
    }
    const result = response && "result" in response ? response.result : undefined;
    // Only red gets a banner; yellow ("attention") stays on the toolbar icon,
    // so the warning keeps its weight when it does show up.
    if (result && (result.verdict === "alto_risco" || result.verdict === "muito_alto_risco")) {
      renderBanner(result);
    }
  },
});

function t(key: string): string {
  return browser.i18n.getMessage(key as Parameters<typeof browser.i18n.getMessage>[0]) || key;
}

function renderBanner(result: ScoreResult) {
  if (document.getElementById("scammeter-root")) return;

  const host = document.createElement("div");
  host.id = "scammeter-root";
  // Fixed max z-index + closed Shadow DOM: the page's own CSS can't hide or
  // reshape this banner.
  host.style.cssText = "all: initial; position: fixed; top: 0; left: 0; right: 0; z-index: 2147483647;";
  const shadow = host.attachShadow({ mode: "closed" });

  const isHigh = result.verdict === "alto_risco" || result.verdict === "muito_alto_risco";
  const style = document.createElement("style");
  style.textContent = `
    .bar { display: flex; align-items: center; gap: 12px; padding: 10px 16px; color: #fff;
      font: 14px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
      background: ${result.verdict === "muito_alto_risco" ? "#7d1a14" : isHigh ? "#b3261e" : "#8a5b00"};
      box-shadow: 0 2px 8px rgba(0,0,0,.25); }
    .text { flex: 1; text-align: center; }
    .hint { display: block; opacity: .85; font-size: 12px; }
    button { all: unset; cursor: pointer; padding: 2px 8px; border-radius: 4px; font-size: 20px; line-height: 1; }
    button:hover, button:focus-visible { background: rgba(255,255,255,.2); }
  `;
  const bar = document.createElement("div");
  bar.className = "bar";
  bar.setAttribute("role", "alert");
  const text = document.createElement("div");
  text.className = "text";
  // textContent only — never innerHTML with anything derived from the page.
  text.textContent = `Scammeter · ${t(`badge_${result.verdict}`)} (${result.score}/100) — ${t(`summary_${result.verdict}`)}`;
  const hint = document.createElement("span");
  hint.className = "hint";
  hint.textContent = t("banner_hint");
  text.append(hint);
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "×";
  close.setAttribute("aria-label", t("banner_close"));
  close.addEventListener("click", () => host.remove());
  bar.append(text, close);
  shadow.append(style, bar);
  document.documentElement.appendChild(host);
}
