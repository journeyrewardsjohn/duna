import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const support = (file: string) =>
  fileURLToPath(new URL(`./src/native/${file}`, import.meta.url));

export default defineConfig({
  test: {
    // Never run compiled copies from `tsc -p tsconfig.build.json`.
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
  resolve: {
    // Native tests render with react-test-renderer against plain host
    // components; React Native's own sources are Flow and do not run in Node.
    // The foundation stand-in extends the layout one (same window object).
    alias: [
      {
        find: /^react-native$/,
        replacement: support("test-support/react-native.ts"),
      },
      {
        find: /^react-native-svg$/,
        replacement: support("test-support/react-native-svg.ts"),
      },
      {
        find: /^@duna\/expo-device-posture$/,
        replacement: support("layout/test-support/device-posture.ts"),
      },
    ],
  },
});
