import { browser } from "wxt/browser";
import { formatCnpj, reasonText } from "@scammeter/core";
import type { StoredAnalysis } from "../../lib/messages";
import { storageKeyForTab } from "../../lib/messages";

const app = document.getElementById("app")!;
const WEB_URL = "https://lucianookdp.github.io/scammeter/";

function t(key: string): string {
  // Keys are built at runtime ("badge_" + verdict), so they can't be checked
  // against the generated message list.
  return browser.i18n.getMessage(key as Parameters<typeof browser.i18n.getMessage>[0]) || key;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function age(days: number): string {
  return days >= 365 ? `${Math.floor(days / 365)} ${t(days >= 730 ? "unit_years" : "unit_year")}` : `${days} ${t(days === 1 ? "unit_day" : "unit_days")}`;
}

// Everything below comes from the checked site, so it is set as text, never HTML.
function render(analysis: StoredAnalysis | null) {
  app.replaceChildren();
  if (!analysis) {
    app.append(el("p", "empty", t("popup_no_page")));
    return;
  }
  const { result, facts } = analysis;
  const host = new URL(analysis.url).hostname;

  const head = el("div", "head");
  head.append(el("span", `badge badge-${result.verdict}`, t(`badge_${result.verdict}`)));
  if (result.verdict !== "nao_verificado") head.append(el("span", "score", `${result.score}/100`));
  app.append(head, el("p", "host", host), el("p", "summary", t(`summary_${result.verdict}`)));

  const reasons = el("ul", "reasons");
  // Heaviest warning first, then what counts in the site's favour, then the
  // neutral notes: reading a "no CNPJ" note before a +50 buries what matters.
  const order = { alert: 0, ok: 1, unverified: 2 } as const;
  const signals = [...result.signals].sort((a, b) => order[a.status] - order[b.status] || Math.abs(b.points) - Math.abs(a.points));
  for (const s of signals) {
    const li = el("li", `reason reason-${s.status}`);
    if (s.points !== 0) li.append(el("span", "weight", `${s.points > 0 ? "+" : ""}${s.points}`));
    li.append(el("span", undefined, reasonText(s, t)));
    reasons.append(li);
  }
  if (result.signals.length) app.append(reasons);

  const checks = el("dl", "checks");
  const row = (label: string, value: string) => checks.append(el("dt", undefined, t(label)), el("dd", undefined, value));
  if (facts.skippedLookups) {
    row("check_lookups", t("popup_skipped"));
  } else {
    row("check_domain", facts.ageDays === null ? t("check_domain_unknown") : t("check_domain_age").replace("{age}", age(facts.ageDays)));
    row(
      "check_cnpj",
      facts.cnpjRecord?.razaoSocial && facts.cnpj
        ? `${facts.cnpjRecord.razaoSocial} · ${formatCnpj(facts.cnpj)} · ${facts.cnpjRecord.status}`
        : facts.cnpj
          ? `${formatCnpj(facts.cnpj)} · ${t("check_cnpj_unknown")}`
          : t("check_cnpj_none"),
    );
  }
  row("check_blocklist", facts.blocklisted === null ? t("check_blocklist_unavailable") : t(facts.blocklisted ? "check_blocklist_listed" : "check_blocklist_clean"));
  row("check_popularity", facts.rank ? `${t("check_popularity_top")} · #${facts.rank.toLocaleString("pt-BR")}` : t("check_popularity_not_top"));
  app.append(checks);

  const link = el("a", "details", t("popup_details"));
  link.href = `${WEB_URL}?${new URLSearchParams({ site: `https://${host}/` })}`;
  link.target = "_blank";
  link.rel = "noopener";
  app.append(link, el("p", "footer", t("footer_disclaimer")));
}

async function init() {
  app.replaceChildren(el("p", "loading", t("popup_checking")));
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) return render(null);
  const key = storageKeyForTab(tab.id);
  const stored = await browser.storage.session.get(key);
  render((stored[key] as StoredAnalysis) ?? null);
}

void init();
