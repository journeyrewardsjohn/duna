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
  {
    // Icons: new code imports `Icon` from `@duna/ui/icons` so every glyph takes
    // the brand stroke and sizes. A warning, not an error: the existing import
    // sites are converted in a later sweep.
    files: ["**/*.{ts,tsx,mts}"],
    ignores: ["packages/ui/src/icons/**", "packages/ui/src/tideline/**"],
    rules: {
      "no-restricted-imports": [
        "warn",
        {
          paths: [
            {
              name: "lucide-react",
              message:
                "Import Icon from `@duna/ui/icons` instead of lucide-react directly (24 grid, 1.75 stroke, square ends; sizes chip / inline / control / nav).",
            },
          ],
        },
      ],
    },
  },
);
