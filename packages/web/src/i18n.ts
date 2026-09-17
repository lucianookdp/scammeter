import pt from "../../extension/public/_locales/pt_BR/messages.json";
import en from "../../extension/public/_locales/en/messages.json";

type Messages = typeof pt;
type Locale = "pt" | "en";

const dictionaries: Record<Locale, Messages> = { pt, en };

// Page-only copy, not shared with the extension's manifest-driven _locales.
const pageStrings: Record<Locale, Record<string, string>> = {
  pt: {
    tagline: "Cole o link da loja e veja se é golpe, e por quê.",
    input_link: "Link da loja",
    input_cnpj: "CNPJ da loja (opcional)",
    input_pix: "Código Pix copia-e-cola (opcional)",
    button_verify: "Verificar",
    install_extension: "Instale a extensão para checar o Pix automaticamente no checkout.",
    error_invalid_url: "Cole um link válido de uma loja.",
  },
  en: {
    tagline: "Paste the store's link and see if it's a scam, and why.",
    input_link: "Store link",
    input_cnpj: "Store's tax ID (CNPJ, optional)",
    input_pix: 'Pix "copy and paste" code (optional)',
    button_verify: "Check",
    install_extension: "Install the extension to check the Pix automatically at checkout.",
    error_invalid_url: "Paste a valid store link.",
  },
};

export function detectLocale(): Locale {
  return navigator.language.toLowerCase().startsWith("pt") ? "pt" : "en";
}

export function t(locale: Locale, key: string): string {
  return pageStrings[locale][key] ?? dictionaries[locale][key as keyof Messages]?.message ?? key;
}

export type { Locale };
