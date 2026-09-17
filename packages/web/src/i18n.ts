import pt from "../../extension/public/_locales/pt_BR/messages.json";

type Messages = typeof pt;

// Page-only copy, not shared with the extension's manifest-driven _locales.
const pageStrings: Record<string, string> = {
  input_link: "Link da loja",
  label_advanced: "Adicionar CNPJ ou código Pix",
  input_cnpj: "CNPJ da loja",
  input_pix: "Código Pix copia-e-cola",
  button_verify: "Verificar",
  gauge_idle: "Cole o link para começar",
  checking: "Analisando…",
  install_extension: "Quer isso automático em toda loja? Instale a extensão.",
  error_invalid_url: "Cole um link válido de uma loja.",
  theme_to_dark: "Mudar para tema escuro",
  theme_to_light: "Mudar para tema claro",
};

export function t(key: string): string {
  return pageStrings[key] ?? pt[key as keyof Messages]?.message ?? key;
}
