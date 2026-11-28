import type { SurfaceContract } from "./types";

/** Legacy sheets that no design-system document may import. */
const legacySheets = [
  "@duna/ui/styles.css",
  "@duna/ui/hq-workspace.css",
  "globals.css",
  "design-v3.css",
  "training.css",
  "work-focus.css",
  "ask-duna.css",
  "forms.css",
  "legacy-bridge",
  "mapbox-gl/dist/mapbox-gl.css",
];

/** Duna HQ (`apps/hq`). Owners: S1, S2, S3, S4, H1–H14, F5a–e. */
export const hq: SurfaceContract = {
  surface: "hq",
  owners: "S1, S2, S3, S4, H1–H14, F5a–e",
  migrated: [],
  checks: [
    { kind: "noFontPackages", app: "hq" },
    // HQ has two root layouts (docs/design/hq-shell.md): app/(next) for the
    // screens on the design system, app/(legacy) for pages not yet rebuilt.
    // Both load the brand fonts through the one font module.
    ...["apps/hq/app/(next)/layout.tsx", "apps/hq/app/(legacy)/layout.tsx"].map(
      (file) => ({
        kind: "includes" as const,
        file,
        values: [
          'import { dunaFontClassName } from "../fonts"',
          "dunaFontClassName",
        ],
        message: `${file} must load Jost, Geist and Geist Mono through the brand font module (app/fonts.ts)`,
      }),
    ),
    {
      kind: "includes",
      file: "apps/hq/app/(next)/layout.tsx",
      values: [
        'import "@duna/ui/tideline/styles.css"',
        'import "./hq.css"',
        'className="td"',
        'data-zone="hq"',
        "hqThemeBootScript",
      ],
      message:
        "apps/hq/app/(next)/layout.tsx must be a design-system document: the Tideline styles, HQ's token sheet, the .td body in the HQ zone and the theme boot script",
    },
    {
      // Nothing under app/(next) (and neither root-level document that
      // loads with it) may bring a legacy sheet into a rebuilt screen.
      kind: "treeExcludes",
      root: "apps/hq/app/(next)",
      values: legacySheets,
      message:
        "app/(next) imports only the design system (docs/plan/legacy-styles.md)",
    },
    ...["apps/hq/app/global-error.tsx", "apps/hq/app/global-not-found.tsx"].map(
      (file) => ({
        kind: "excludes" as const,
        file,
        values: legacySheets,
        message: `${file} loads with app/(next) pages, so it imports only the design system`,
      }),
    ),
    {
      kind: "excludes",
      file: "apps/hq/app/(next)/hq.css",
      values: ["@import", "!important"],
      message:
        "apps/hq/app/(next)/hq.css is HQ's own token-based sheet: no imports, no !important",
    },
    { kind: "absent", path: "apps/hq/app/layout.tsx" },
    { kind: "absent", path: "packages/ui/src/tideline/legacy-bridge.css" },
    {
      kind: "includes",
      file: "apps/hq/app/fonts.ts",
      values: [
        "next/font/google",
        "Jost({",
        "Geist({",
        "Geist_Mono({",
        '"--td-font-brand"',
        '"--td-font-ui"',
        '"--td-font-mono"',
        'weight: "500"',
        'display: "swap"',
      ],
      message:
        "apps/hq/app/fonts.ts must expose Jost 500, Geist and Geist Mono as the Tideline font variables",
    },
  ],
};
