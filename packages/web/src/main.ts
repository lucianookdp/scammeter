import {
  computeScore,
  formatCnpj,
  parsePixPayload,
  validateCnpj,
  type ScoreResult,
  type ScoringInput,
} from "@scammeter/core";
import { t } from "./i18n";
import { getTheme, setTheme } from "./theme";
import { fetchCnpjRecord, fetchDomainInfo, fetchReputation, fetchScan } from "./proxyClient";

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
document.getElementById("label-advanced")!.textContent = t("label_advanced");
document.getElementById("label-cnpj")!.textContent = t("input_cnpj");
document.getElementById("label-pix")!.textContent = t("input_pix");
document.getElementById("submit-btn")!.textContent = t("button_verify");
document.getElementById("footer-note")!.textContent = t("footer_disclaimer");

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
const reasonsEl = document.getElementById("reasons") as HTMLUListElement;

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
  if (reduceMotion) {
    scoreEl.textContent = String(target);
    return;
  }
  const start = performance.now();
  const duration = 700;
  function tick(now: number) {
    const progress = Math.min(1, (now - start) / duration);
    const eased = 1 - (1 - progress) ** 3;
    scoreEl.textContent = String(Math.round(target * eased));
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function setLoading(isLoading: boolean) {
  submitBtn.disabled = isLoading;
  gauge.classList.toggle("loading", isLoading);
  if (isLoading) {
    captionEl.textContent = t("checking");
    reasonsEl.classList.remove("visible");
  }
}

function renderResult(result: ScoreResult) {
  const unverified = result.verdict === "nao_verificado";
  gauge.classList.remove("idle");
  gauge.classList.toggle("unverified", unverified);

  setNeedle(unverified ? 0 : result.score);
  if (unverified) {
    scoreEl.textContent = "?";
  } else {
    animateScore(result.score);
  }

  badgeEl.textContent = t(`badge_${result.verdict}`);
  badgeEl.className = `badge badge-${result.verdict}`;
  captionEl.textContent = t(`summary_${result.verdict}`);

  reasonsEl.innerHTML = result.signals
    .map((s) => `<li class="reason reason-${s.status}">${ICONS[s.status]}<span>${reasonLabel(s.reasonKey)}</span></li>`)
    .join("");
  reasonsEl.hidden = result.signals.length === 0;
  requestAnimationFrame(() => reasonsEl.classList.add("visible"));
}

function showScanHint(key: string) {
  scanHint.textContent = t(key);
  scanHint.hidden = false;
  advanced.open = true;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  linkError.hidden = true;
  scanHint.hidden = true;

  let link: string;
  let domain: string;
  try {
    link = linkInput.value.trim();
    domain = new URL(link).hostname;
  } catch {
    linkError.textContent = t("error_invalid_url");
    linkError.hidden = false;
    return;
  }

  setLoading(true);

  const cnpjValue = cnpjInput.value.trim();
  const pixValue = pixInput.value.trim();
  // Nobody knows a company's CNPJ by heart — try to find it (and a Pix code,
  // if one's sitting on the page) on the site itself before asking the user.
  const needsScan = !cnpjValue || !pixValue;

  const [scan, domainInfo, reputation] = await Promise.all([
    needsScan ? fetchScan(link) : Promise.resolve(null),
    fetchDomainInfo(domain),
    fetchReputation(domain),
  ]);

  let storeCnpj: string | null | undefined = cnpjValue ? (validateCnpj(cnpjValue) ? cnpjValue : null) : undefined;
  if (!cnpjValue) {
    if (scan?.fetched) {
      storeCnpj = scan.cnpj;
      if (scan.cnpj) {
        cnpjInput.value = formatCnpj(scan.cnpj);
        advanced.open = true;
      } else {
        showScanHint("scan_no_cnpj");
      }
    } else {
      showScanHint("scan_unreachable");
    }
  }

  const pixPayload = pixValue || scan?.pixPayload || "";
  const parsedPix = pixPayload ? parsePixPayload(pixPayload) : null;

  const cnpjRecord = storeCnpj ? await fetchCnpjRecord(storeCnpj) : undefined;

  const input: ScoringInput = {
    siteBlocklisted: reputation?.blocklisted ?? undefined,
    domainRankTop100k: reputation?.top100k ?? undefined,
    storeCnpj,
    cnpjRecord: storeCnpj ? (cnpjRecord ?? null) : undefined,
    domainAgeDays: domainInfo?.ageDays ?? null,
    pix:
      parsedPix?.merchantAccount?.key && parsedPix.keyType !== "unknown"
        ? {
            keyType: parsedPix.keyType,
            keyCnpj: parsedPix.keyType === "cnpj" ? parsedPix.merchantAccount.key : undefined,
          }
        : undefined,
  };

  setLoading(false);
  renderResult(computeScore(input));
});
