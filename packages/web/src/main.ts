import {
  computeScore,
  parsePixPayload,
  validateCnpj,
  type ScoreResult,
  type ScoringInput,
} from "@scammeter/core";
import { detectLocale, t } from "./i18n";
import { fetchCnpjRecord, fetchDomainInfo, fetchReputation } from "./proxyClient";

const locale = detectLocale();

document.getElementById("tagline")!.textContent = t(locale, "tagline");
document.getElementById("label-link")!.textContent = t(locale, "input_link");
document.getElementById("label-cnpj")!.textContent = t(locale, "input_cnpj");
document.getElementById("label-pix")!.textContent = t(locale, "input_pix");
document.getElementById("submit-btn")!.textContent = t(locale, "button_verify");
document.getElementById("install-note")!.textContent = t(locale, "install_extension");

const form = document.getElementById("check-form") as HTMLFormElement;
const resultEl = document.getElementById("result")!;

function reasonLabel(reasonKey: string): string {
  return t(locale, reasonKey.replace(/\./g, "_"));
}

function renderResult(result: ScoreResult) {
  const reasons = result.signals
    .map((s) => `<li class="reason reason-${s.status}">${reasonLabel(s.reasonKey)}</li>`)
    .join("");

  resultEl.innerHTML = `
    <div class="badge badge-${result.verdict}">${t(locale, `badge_${result.verdict}`)}</div>
    <p class="summary">${t(locale, `summary_${result.verdict}`)}</p>
    <ul class="reasons">${reasons}</ul>
    <p class="footer">${t(locale, "footer_disclaimer")}</p>
  `;
  resultEl.hidden = false;
}

function renderError(message: string) {
  resultEl.innerHTML = `<p class="error">${message}</p>`;
  resultEl.hidden = false;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const linkValue = (document.getElementById("input-link") as HTMLInputElement).value.trim();
  const cnpjValue = (document.getElementById("input-cnpj") as HTMLInputElement).value.trim();
  const pixValue = (document.getElementById("input-pix") as HTMLTextAreaElement).value.trim();

  let domain: string;
  try {
    domain = new URL(linkValue).hostname;
  } catch {
    renderError(t(locale, "error_invalid_url"));
    return;
  }

  resultEl.hidden = false;
  resultEl.innerHTML = `<p class="loading">${t(locale, "popup_checking")}</p>`;

  const storeCnpj = cnpjValue && validateCnpj(cnpjValue) ? cnpjValue : cnpjValue ? null : undefined;
  const parsedPix = pixValue ? parsePixPayload(pixValue) : null;

  const [cnpjRecord, domainInfo, reputation] = await Promise.all([
    storeCnpj ? fetchCnpjRecord(storeCnpj) : Promise.resolve(undefined),
    fetchDomainInfo(domain),
    fetchReputation(domain),
  ]);

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

  renderResult(computeScore(input));
});
