import type { SurfaceContract } from "./types";

/** Duna HQ (`apps/hq`). Owners: S1, S2, S3, S4, H1–H14, F5a–e. */
const legacy = "legacy: delete when HQ migrates (S1/S2/H*)" as const;

export const hq: SurfaceContract = {
  surface: "hq",
  owners: "S1, S2, S3, S4, H1–H14, F5a–e",
  migrated: [],
  checks: [
    { kind: "noFontPackages", app: "hq" },
    { kind: "exists", path: "apps/hq/app/design-v3.css", legacy },
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
    {
      kind: "includes",
      file: "docs/design/duna-hq-component-system.md",
      values: [
        "PageHeader",
        "buttonClassName",
        "AddressEntry",
        "PlayerCombobox",
        "All rules (AND)",
        "Any rule (OR)",
      ],
      legacy,
    },
    {
      kind: "excludes",
      file: "apps/hq/app/globals.css",
      values: [".hq-page-heading > div:last-child {"],
      message:
        "HQ page headers must not treat a single copy block as an action group",
      legacy,
    },
    {
      kind: "includes",
      file: "apps/hq/app/audiences/audience-editor.tsx",
      values: [
        "All rules",
        "Any rule",
        "Add rule",
        "Audience preview",
        "Search by name, role, city, or Sand Rating",
        "Create audience",
      ],
      legacy: "legacy: delete when Marketing › Audiences migrates (H13)",
    },
    {
      kind: "cssRule",
      file: "apps/hq/app/design-v3.css",
      selector: ".duna-numeric[data-numeric-tier].duna-numeric--monument",
      values: [
        'font-feature-settings: "pnum" 1',
        "font-variant-numeric: proportional-nums",
      ],
      message:
        "apps/hq/app/design-v3.css must override the tabular base with proportional Monument spacing",
      legacy,
    },
  ],
};
