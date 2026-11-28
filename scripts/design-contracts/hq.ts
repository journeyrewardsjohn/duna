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
  // Rebuilt screens on the design system (the Tideline guard checks them).
  migrated: [
    "apps/hq/app/(next)/(hq)/team/",
    "apps/hq/components/team/",
    "apps/hq/app/(next)/(hq)/schedule/",
    "apps/hq/components/schedule/",
  ],
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
    // The shell and rebuilt screens' components render only inside
    // app/(next), so they may not reach a legacy sheet either (the legacy
    // pages' AccessDenied wrapper and ThemedTideline load the bridge).
    ...[
      "apps/hq/components/shell",
      "apps/hq/components/today",
      "apps/hq/components/money",
      "apps/hq/components/team",
      "apps/hq/components/offerings",
      "apps/hq/components/participation",
      "apps/hq/components/setup",
      "apps/hq/components/schedule",
    ].map((root) => ({
      kind: "treeExcludes" as const,
      root,
      values: [...legacySheets, '"@/lib/access"', "themed-tideline"],
      message: `${root} renders inside app/(next): design system only`,
    })),
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
