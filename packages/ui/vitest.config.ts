import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const support = (file: string) =>
  fileURLToPath(
    new URL(`./src/native/layout/test-support/${file}`, import.meta.url),
  );

export default defineConfig({
  test: {
    // Never run compiled copies from `tsc -p tsconfig.build.json`.
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
  resolve: {
    // Native layout tests render with react-test-renderer against plain host
    // components; React Native's own sources are Flow and do not run in Node.
    alias: [
      { find: /^react-native$/, replacement: support("react-native.ts") },
      {
        find: /^@duna\/expo-device-posture$/,
        replacement: support("device-posture.ts"),
      },
    ],
  },
});
