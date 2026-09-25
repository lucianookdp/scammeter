import { browser } from "wxt/browser";
import {
  computeScore,
  findPixPayloadInText,
  findValidCnpjInText,
  pageAsksCredentials,
  scoringInputFrom,
  type ScoreResult,
} from "@scammeter/core";
import { fetchCnpjRecord, fetchDomainInfo, fetchPopularity, fetchReputation } from "../lib/proxyClient";
import type { AnalysisMessage } from "../lib/messages";

const MAX_TEXT_LENGTH = 200_000; // ponytail: cap collection so a huge page can't stall analysis

export default defineContentScript({
  matches: ["<all_urls>"],
  async main() {
    const bodyText = (document.body?.innerText ?? "").slice(0, MAX_TEXT_LENGTH);
    const storeCnpj = findValidCnpjInText(bodyText);

    const html = document.documentElement.innerHTML.slice(0, MAX_TEXT_LENGTH);
    const domain = location.hostname;

    const [cnpjRecord, domainInfo, reputation, popularity] = await Promise.all([
      storeCnpj ? fetchCnpjRecord(storeCnpj) : Promise.resolve(undefined),
      fetchDomainInfo(domain),
      fetchReputation(domain),
      fetchPopularity(domain),
    ]);

    // The live page stands in for the proxy's /scan; the same builder as the
    // web page and the share preview turns it into the score's input.
    const input = scoringInputFrom({
      hostname: domain,
      scan: {
        fetched: true,
        cnpj: storeCnpj,
        pixPayload: findPixPayloadInText(html),
        title: document.title,
        asksCredentials: pageAsksCredentials(html),
      },
      cnpjRecord: storeCnpj ? (cnpjRecord ?? null) : undefined,
      domainAgeDays: domainInfo?.ageDays ?? null,
      blocklisted: reputation?.blocklisted,
      top100k: popularity?.top100k,
    });

    const result = computeScore(input);

    const message: AnalysisMessage = { type: "scammeter:analysis", url: location.href, result };
    void browser.runtime.sendMessage(message);

    if (result.verdict === "atencao" || result.verdict === "alto_risco" || result.verdict === "muito_alto_risco") {
      renderBanner(result);
    }
  },
});

function renderBanner(result: ScoreResult) {
  if (document.getElementById("scammeter-root")) return;

  const host = document.createElement("div");
  host.id = "scammeter-root";
  // Fixed max z-index + closed Shadow DOM: the page's own CSS can't hide or
  // reshape this banner (see "Interferência no banner" in the threat model).
  host.style.cssText = "all: initial; position: fixed; top: 0; left: 0; right: 0; z-index: 2147483647;";
  const shadow = host.attachShadow({ mode: "closed" });

  const isHigh = result.verdict === "alto_risco" || result.verdict === "muito_alto_risco";
  const bar = document.createElement("div");
  bar.textContent = `${browser.i18n.getMessage(`badge_${result.verdict}`)} — ${browser.i18n.getMessage(`summary_${result.verdict}`)}`;
  bar.style.cssText = `
    font: 14px/1.4 system-ui, sans-serif;
    padding: 10px 16px;
    color: #fff;
    background: ${result.verdict === "muito_alto_risco" ? "#7d1a14" : isHigh ? "#b3261e" : "#8a5b00"};
    text-align: center;
  `;
  // textContent only — never innerHTML with data pulled from the page (XSS risk noted in the threat model).
  shadow.appendChild(bar);
  document.documentElement.appendChild(host);
}
