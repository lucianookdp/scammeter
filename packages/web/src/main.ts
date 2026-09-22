import {
  computeScore,
  domainImitatesBrand,
  formatCnpj,
  hasCheapTld,
  parsePixPayload,
  validateCnpj,
  type CheckStatus,
  type CnpjRecord,
  type ScoreResult,
  type ScoringInput,
} from "@scammeter/core";
import { t } from "./i18n";
import { getTheme, setTheme } from "./theme";
import { parseSiteUrl } from "./url";
import { fetchCnpjRecord, fetchDomainInfo, fetchReputation, fetchScan, type FetchFailure } from "./proxyClient";

// Lucide icons (ISC license), inlined as static markup — no icon-font/JS dependency needed.
const ICONS = {
  ok: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="m16 9-5.5 5.5L8 12"/></svg>',
  alert:
    '<svg viewBox="0 0 24 24"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
  unverified:
    '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>',
};

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const themeToggle = document.getElementById("theme-toggle") as HTMLButtonElement;

setTheme(getTheme());
themeToggle.addEventListener("click", () => {
  setTheme(getTheme() === "dark" ? "light" : "dark");
  updateThemeLabel();
});

function updateThemeLabel() {
  const next = getTheme() === "dark" ? "light" : "dark";
  themeToggle.setAttribute("aria-label", t(next === "dark" ? "theme_to_dark" : "theme_to_light"));
}

updateThemeLabel();
document.getElementById("brand-name")!.textContent = t("extName");
document.getElementById("tagline")!.textContent = t("tagline");
document.getElementById("chip-open-source")!.textContent = t("trust_open_source");
document.getElementById("chip-no-tracking")!.textContent = t("trust_no_tracking");
document.getElementById("chip-cnpj-pix")!.textContent = t("trust_cnpj_pix");
document.getElementById("label-link")!.textContent = t("input_link");
document.getElementById("label-advanced-text")!.textContent = t("label_advanced");
document.getElementById("label-cnpj")!.textContent = t("input_cnpj");
document.getElementById("label-pix")!.textContent = t("input_pix");
document.getElementById("submit-btn-text")!.textContent = t("button_verify");
document.getElementById("footer-note")!.textContent = t("footer_disclaimer");
document.getElementById("footer-github-text")!.textContent = t("footer_github");

const form = document.getElementById("check-form") as HTMLFormElement;
const submitBtn = document.getElementById("submit-btn") as HTMLButtonElement;
const linkInput = document.getElementById("input-link") as HTMLInputElement;
const linkError = document.getElementById("link-error") as HTMLSpanElement;
const cnpjInput = document.getElementById("input-cnpj") as HTMLInputElement;
const pixInput = document.getElementById("input-pix") as HTMLTextAreaElement;
const advanced = document.getElementById("advanced") as HTMLDetailsElement;
const scanHint = document.getElementById("scan-hint") as HTMLSpanElement;
const gauge = document.querySelector(".gauge") as HTMLElement;
const needleGroup = document.querySelector(".needle-group") as HTMLElement;
const scoreEl = document.getElementById("score")!;
const badgeEl = document.getElementById("badge")!;
const captionEl = document.getElementById("gauge-caption")!;
const alertBar = document.getElementById("alertbar") as HTMLParagraphElement;
const resultsEl = document.getElementById("results") as HTMLDivElement;
const checksGroup = document.getElementById("group-checks") as HTMLElement;
const checksList = checksGroup.querySelector(".checks") as HTMLDListElement;
const factRaEl = document.getElementById("fact-reclameaqui") as HTMLAnchorElement;
const factRaTextEl = document.getElementById("fact-reclameaqui-text")!;

const GROUPS: Record<CheckStatus, { section: HTMLElement; title: HTMLElement; list: HTMLUListElement }> = {
  alert: groupRefs("group-alert"),
  ok: groupRefs("group-ok"),
  unverified: groupRefs("group-unverified"),
};

function groupRefs(id: string) {
  const section = document.getElementById(id) as HTMLElement;
  return {
    section,
    title: section.querySelector(".group-title") as HTMLElement,
    list: section.querySelector(".reasons") as HTMLUListElement,
  };
}


captionEl.textContent = t("gauge_idle");

// One orchestrated boot moment on load — not a fade-in on every element.
if (!reduceMotion) {
  needleGroup.classList.add("boot");
  needleGroup.addEventListener("animationend", () => needleGroup.classList.remove("boot"), { once: true });
}

function reasonLabel(reasonKey: string): string {
  return t(reasonKey.replace(/\./g, "_"));
}

function setNeedle(score: number) {
  needleGroup.style.setProperty("--needle-rotate", `${(score / 100) * 180 - 90}deg`);
}

function animateScore(target: number) {
  scoreEl.textContent = String(target);
}

function setLoading(isLoading: boolean) {
  submitBtn.disabled = isLoading;
  gauge.classList.toggle("loading", isLoading);
  if (isLoading) {
    captionEl.textContent = t("checking");
    resultsEl.hidden = true;
    alertBar.hidden = true;
  }
}

/** One line per lookup, so the reader can see what the verdict is actually built on. */
export interface CheckRow {
  labelKey: string;
  value: string;
  state: CheckStatus;
}

function renderResult(result: ScoreResult, checks: CheckRow[]) {
  const unverified = result.verdict === "nao_verificado";
  gauge.classList.remove("idle");
  gauge.classList.toggle("unverified", unverified);

  setNeedle(unverified ? 0 : result.score);
  if (unverified) {
    scoreEl.textContent = "?";
  } else {
    animateScore(result.score);
  }
  scoreEl.className = `score score-${result.verdict}`;

  badgeEl.textContent = t(`badge_${result.verdict}`);
  badgeEl.className = `badge badge-${result.verdict}`;
  captionEl.textContent = t(`summary_${result.verdict}`);

  // Heaviest risk first. Scoring order is an implementation detail, and reading
  // a +5 before a +50 buries the thing the person most needs to see.
  const byStatus: Record<CheckStatus, typeof result.signals> = { alert: [], ok: [], unverified: [] };
  for (const signal of result.signals) byStatus[signal.status]?.push(signal);
  byStatus.alert.sort((a, b) => b.points - a.points);

  for (const status of ["alert", "ok", "unverified"] as CheckStatus[]) {
    const group = GROUPS[status];
    const signals = byStatus[status];
    group.section.hidden = signals.length === 0;
    group.title.textContent = t(`group_${status}`);
    group.list.replaceChildren(
      ...signals.map((signal) => {
        const li = document.createElement("li");
        li.className = `reason reason-${signal.status}`;
        li.insertAdjacentHTML("afterbegin", ICONS[signal.status]);
        // Showing the weight is what turns the score from a verdict into
        // arithmetic the reader can follow.
        if (signal.points !== 0) {
          const weight = document.createElement("span");
          weight.className = "reason-weight";
          weight.textContent = `${signal.points > 0 ? "+" : ""}${signal.points}`;
          li.append(weight);
        }
        const text = document.createElement("span");
        text.textContent = reasonLabel(signal.reasonKey);
        li.append(text);
        return li;
      }),
    );
  }

  checksGroup.hidden = checks.length === 0;
  checksGroup.querySelector(".group-title")!.textContent = t("group_checks");
  checksList.replaceChildren(
    ...checks.flatMap((check) => {
      const dt = document.createElement("dt");
      dt.textContent = t(check.labelKey);
      const dd = document.createElement("dd");
      dd.className = `check-value check-${check.state}`;
      dd.textContent = check.value;
      return [dt, dd];
    }),
  );

  resultsEl.hidden = false;
  // A timer, not rAF, for the same reason: timers still run while hidden, so
  // the result is never left sitting at opacity 0.
  setTimeout(() => resultsEl.classList.add("visible"), 0);
}

function formatAge(days: number): string {
  if (days >= 365) {
    const years = Math.floor(days / 365);
    return years === 1 ? "1 ano" : `${years} anos`;
  }
  return days === 1 ? "1 dia" : `${days} dias`;
}

/**
 * A lookup that came back empty and a lookup that never happened are different
 * things, and the page used to render both as silence.
 */
function showTransportProblem(failures: FetchFailure[]) {
  if (failures.length === 0) {
    alertBar.hidden = true;
    return;
  }
  const worst = failures.includes("rate_limited")
    ? "rate_limited"
    : failures.every((f) => f === "offline")
      ? "offline"
      : "degraded";
  alertBar.textContent = t(`transport_${worst}`);
  alertBar.className = `alertbar alertbar-${worst === "rate_limited" ? "warn" : "info"}`;
  alertBar.hidden = false;
}

function showScanHint(key: string) {
  scanHint.textContent = t(key);
  scanHint.hidden = false;
  advanced.open = true;
}

const CNPJ_STATUS_LABEL: Record<string, string> = {
  ativa: "ativa",
  baixada: "baixada",
  inapta: "inapta",
  suspensa: "suspensa",
  nula: "nula",
};

/** The one thing a failed lookup should never look like is a clean result. */
function failureText(failure: FetchFailure): string {
  return t(`check_failed_${failure}`);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (submitBtn.disabled) return;
  linkError.hidden = true;
  scanHint.hidden = true;

  let link: string;
  let domain: string;
  try {
    const parsed = parseSiteUrl(linkInput.value);
    link = parsed.toString();
    domain = parsed.hostname;
  } catch (error) {
    const key = `error_${(error as Error).message}`;
    linkError.textContent = t(key) === key ? "Cole um endereço válido, como exemplo.com.br." : t(key);
    linkError.hidden = false;
    return;
  }

  const cnpjValue = cnpjInput.value.trim();
  const pixValue = pixInput.value.trim();
  if (cnpjValue && !validateCnpj(cnpjValue)) {
    linkError.textContent = t("error_invalid_cnpj");
    linkError.hidden = false;
    return;
  }
  setLoading(true);
  try {
    // Nobody knows a company's CNPJ by heart — try to find it (and a Pix code,
    // if one's sitting on the page) on the site itself before asking the user.
    const needsScan = !cnpjValue || !pixValue;

    const [scan, domainInfo, reputation] = await Promise.all([
      needsScan ? fetchScan(link) : Promise.resolve(null),
      fetchDomainInfo(domain),
      fetchReputation(domain),
    ]);

    const checks: CheckRow[] = [];

    let storeCnpj: string | null | undefined;
    if (cnpjValue) {
      storeCnpj = cnpjValue;
    } else if (scan?.data?.fetched) {
      storeCnpj = scan.data.cnpj;
      if (!scan.data.cnpj) {
        showScanHint("scan_no_cnpj");
      }
    } else {
      showScanHint("scan_unreachable");
    }

    checks.push({
      labelKey: "check_site",
      value: scan?.data?.fetched
        ? t("check_site_read")
        : scan?.failure
          ? failureText(scan.failure)
          : cnpjValue && pixValue
            ? t("check_site_skipped")
            : t("check_site_unreachable"),
      state: scan?.data?.fetched ? "ok" : "unverified",
    });

    const pixPayload = pixValue || scan?.data?.pixPayload || "";
    const parsedPix = pixPayload ? parsePixPayload(pixPayload) : null;

    const cnpjResult = storeCnpj ? await fetchCnpjRecord(storeCnpj) : undefined;
    const cnpjRecord = cnpjResult?.data ?? undefined;

    const ageDays = domainInfo?.data?.ageDays ?? null;
    checks.push({
      labelKey: "check_domain",
      value:
        typeof ageDays === "number"
          ? `${domain} · ${t("check_domain_age").replace("{age}", formatAge(ageDays))}`
          : domainInfo?.failure
            ? failureText(domainInfo.failure)
            : t("check_domain_unknown"),
      state: typeof ageDays === "number" ? "ok" : "unverified",
    });

    checks.push({
      labelKey: "check_cnpj",
      value: cnpjRecord?.razaoSocial
        ? `${cnpjRecord.razaoSocial} · ${formatCnpj(storeCnpj as string)} · ${CNPJ_STATUS_LABEL[cnpjRecord.status] ?? cnpjRecord.status}`
        : storeCnpj
          ? (cnpjResult?.failure ? failureText(cnpjResult.failure) : t("check_cnpj_unknown"))
          : t(scan?.data?.fetched ? "check_cnpj_none" : "check_cnpj_unknown"),
      state: cnpjRecord?.status === "ativa" ? "ok" : cnpjRecord && ["baixada", "inapta", "suspensa", "nula"].includes(cnpjRecord.status) ? "alert" : "unverified",
    });

    checks.push({
      labelKey: "check_pix",
      value: parsedPix?.merchantAccount?.key
        ? t(`pix_key_${parsedPix.keyType}`)
        : pixPayload
          ? t("check_pix_unreadable")
          : (scan?.data?.fetched ? t("check_pix_none") : "Não foi possível verificar se há Pix nesta página."),
      state: parsedPix?.merchantAccount?.key ? (parsedPix.keyType === "cnpj" ? "ok" : "alert") : "unverified",
    });

    checks.push({
      labelKey: "check_blocklist",
      value: reputation?.data?.blocklisted == null ? t("check_blocklist_unavailable") : t("check_blocklist_clean"),
      state: "unverified",
    });

    const input: ScoringInput = {
      siteBlocklisted: reputation?.data?.blocklisted ?? undefined,
      domainRankTop100k: reputation?.data?.top100k ?? undefined,
      domainImitatesBrand: domainImitatesBrand(domain),
      cheapTldPrivateWhois: hasCheapTld(domain),
      storeCnpj,
      cnpjRecord: storeCnpj ? (cnpjRecord ?? null) : undefined,
      domainAgeDays: ageDays,
      pix:
        parsedPix?.merchantAccount?.key && parsedPix.keyType !== "unknown"
          ? {
              keyType: parsedPix.keyType,
              keyCnpj: parsedPix.keyType === "cnpj" ? parsedPix.merchantAccount.key : undefined,
            }
          : undefined,
    };

    setLoading(false);
    renderResult(computeScore(input), checks);
    showTransportProblem(
      [scan?.failure, domainInfo?.failure, reputation?.failure, cnpjResult?.failure].filter(
        (f): f is FetchFailure => Boolean(f),
      ),
    );

    const searchTerm = cnpjRecord?.razaoSocial ?? domain;
    factRaEl.href = `https://www.google.com/search?q=${encodeURIComponent(`${searchTerm} reclame aqui`)}`;
    factRaTextEl.textContent = t("see_reclame_aqui");
    factRaEl.hidden = false;
  } catch {
    alertBar.textContent = t("transport_degraded");
    alertBar.hidden = false;
  } finally {
    setLoading(false);
  }
});
