import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Lets unit tests import and render HQ components. Next.js compiles JSX
// itself, so tsconfig.json keeps `jsx: "preserve"`; Vitest needs it compiled.
export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
});
