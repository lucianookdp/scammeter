import pt from "../../extension/public/_locales/pt_BR/messages.json";

type Messages = typeof pt;

// Page-only copy, not shared with the extension's manifest-driven _locales.
const pageStrings: Record<string, string> = {
  tagline: "Verifique se uma loja é confiável antes de comprar, e entenda o motivo.",
  input_link: "Link da loja",
  label_advanced: "Verificar CNPJ ou código Pix também",
  input_cnpj: "CNPJ da loja",
  input_pix: "Código Pix copia-e-cola",
  button_verify: "Verificar",
  gauge_idle: "Cole o link para começar",
  checking: "Analisando…",
  install_extension: "Instale a extensão para verificar qualquer loja automaticamente.",
  error_invalid_url: "Cole um link válido de uma loja.",
  theme_to_dark: "Mudar para tema escuro",
  theme_to_light: "Mudar para tema claro",
  trust_open_source: "Código aberto",
  trust_no_tracking: "Sem rastreamento",
  trust_cnpj_pix: "Checagem de CNPJ e Pix",
};

export function t(key: string): string {
  return pageStrings[key] ?? pt[key as keyof Messages]?.message ?? key;
}
