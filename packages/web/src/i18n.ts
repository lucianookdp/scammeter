import pt from "../../extension/public/_locales/pt_BR/messages.json";

type Messages = typeof pt;

// Page-only copy, not shared with the extension's manifest-driven _locales.
const pageStrings: Record<string, string> = {
  tagline: "Verifique se um site é confiável antes de continuar, e entenda o motivo.",
  input_link: "Link do site",
  label_advanced: "Informar CNPJ ou código Pix manualmente",
  input_cnpj: "CNPJ da empresa",
  input_pix: "Código Pix copia-e-cola",
  button_verify: "Verificar",
  gauge_idle: "Cole o link para começar",
  checking: "Analisando…",
  error_invalid_url: "Cole um link válido.",
  scan_no_cnpj: "Não encontramos um CNPJ nesta página. Se souber, informe abaixo.",
  scan_unreachable: "Não conseguimos acessar este site automaticamente. Se souber, informe o CNPJ abaixo.",
  theme_to_dark: "Mudar para tema escuro",
  theme_to_light: "Mudar para tema claro",
  trust_open_source: "Código aberto",
  trust_no_tracking: "Sem rastreamento",
  trust_cnpj_pix: "Checagem de CNPJ e Pix",
};

export function t(key: string): string {
  return pageStrings[key] ?? pt[key as keyof Messages]?.message ?? key;
}
