import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/.eve/**",
      "**/.output/**",
      "**/.expo/**",
      "**/dist/**",
      "**/coverage/**",
      "**/.agents/**",
      "**/playwright-report/**",
      "**/test-results/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,mts}"],
    rules: {
      "no-undef": "off",
    },
  },
  // Observability ratchet: product code logs through @duna/observability
  // (`log`, `report`), never `console.*`. Existing calls are counted in each
  // package's eslint-suppressions.json; the count can only go down (ESLint
  // fails on new calls and on suppressions that are no longer needed, so
  // run `eslint --prune-suppressions` after removing one). See
  // docs/OBSERVABILITY.md.
  {
    files: [
      "packages/api/src/**/*.{ts,tsx,mts}",
      "packages/observability/src/**/*.{ts,tsx,mts}",
      "apps/web/**/*.{ts,tsx,mts}",
      "apps/hq/**/*.{ts,tsx,mts}",
    ],
    ignores: [
      "**/*.test.{ts,tsx}",
      "**/*.spec.{ts,tsx}",
      "**/*.test-support.ts",
    ],
    rules: {
      "no-console": "error",
    },
  },
);
