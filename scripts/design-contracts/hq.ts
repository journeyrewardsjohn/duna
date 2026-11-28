import type { SurfaceContract } from "./types";

/** Duna HQ (`apps/hq`). Owners: S1, S2, S3, S4, H1–H14, F5a–e. */
export const hq: SurfaceContract = {
  surface: "hq",
  owners: "S1, S2, S3, S4, H1–H14, F5a–e",
  migrated: [],
  checks: [
    { kind: "noFontPackages", app: "hq" },
    {
      kind: "includes",
      file: "apps/hq/app/layout.tsx",
      values: [
        'import { dunaFontClassName } from "./fonts"',
        "dunaFontClassName",
      ],
      message:
        "apps/hq/app/layout.tsx must load Jost, Geist and Geist Mono through the brand font module (app/fonts.ts)",
    },
    {
      kind: "includes",
      file: "apps/hq/app/fonts.ts",
      values: [
        "next/font/google",
        "Jost({",
        "Geist({",
        "Geist_Mono({",
        '"--duna-font-brand"',
        '"--duna-font-ui"',
        '"--duna-font-mono"',
        'weight: "500"',
        'display: "swap"',
      ],
      message:
        "apps/hq/app/fonts.ts must expose Jost 500, Geist and Geist Mono as the --duna-font-* variables the Tideline font tokens read",
    },
  ],
};
