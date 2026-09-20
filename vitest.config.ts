import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts"],
  },
  resolve: {
    alias: {
      // Tests read core's source, not its build output. Otherwise `pnpm test`
      // on a fresh clone fails until someone remembers to build core first —
      // which is exactly how CI broke.
      "@scammeter/core": fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url)),
    },
  },
});
