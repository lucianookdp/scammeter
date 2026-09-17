import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: ".",
  manifest: {
    name: "__MSG_extName__",
    description: "__MSG_extDescription__",
    default_locale: "pt_BR",
    permissions: ["activeTab", "storage"],
    // ponytail: <all_urls> for v0.1 simplicity. The scope calls for this to be
    // an *optional* permission requested from the user instead — move to
    // `optional_host_permissions` + a request-access onboarding screen for v0.2.
    host_permissions: ["<all_urls>"],
  },
});
