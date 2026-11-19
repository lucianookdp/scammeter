import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: ".",
  manifest: {
    name: "__MSG_extName__",
    description: "__MSG_extDescription__",
    default_locale: "pt_BR",
    homepage_url: "https://github.com/lucianookdp/scammeter",
    icons: { 16: "icon/16.png", 32: "icon/32.png", 48: "icon/48.png", 128: "icon/128.png" },
    action: { default_title: "Scammeter" },
    // storage: per-tab results and a small lookup cache. unlimitedStorage: the
    // daily refreshed phishing list is ~5 MB, over the default 10 MB quota with
    // the cache. No other permission: the content script's matches are what
    // let it read the page you open.
    permissions: ["storage", "unlimitedStorage"],
    // Only the public data sources the background worker asks. rdap.org
    // redirects to each registry's server, which answers with CORS headers.
    host_permissions: [
      "https://brasilapi.com.br/*",
      "https://rdap.registro.br/*",
      "https://rdap.org/*",
      "https://raw.githubusercontent.com/*",
    ],
  },
});
