import type { SurfaceContract } from "./types";

/**
 * Repository-wide contracts: the design contract documents, `packages/ui`
 * shared styles and tokens, and the brand imagery log.
 * Owners: R2 (docs), F1/F2a/F2b/F3 (`packages/ui` web styles, brand),
 * the native planner (`packages/ui/src/tokens.ts`, `mobile.ts`).
 */
export const shared: SurfaceContract = {
  surface: "shared",
  owners: "R2, F1, F2a, F2b, F3, native planner",
  migrated: ["packages/ui/src/tideline/", "packages/ui/src/native/"],
  tidelineExemptions: [
    {
      path: "packages/ui/src/tideline/tokens/tokens.json",
      rules: ["retired-orange"],
      reason:
        "legacy: Tideline 3.1 token source from the UI SDK branch; F2a replaces it with 4.1.1 and deletes this exemption",
    },
    {
      path: "packages/ui/src/tideline/tokens/tokens.css",
      rules: ["retired-orange"],
      reason:
        "legacy: generated from the 3.1 token source; F2a regenerates it and deletes this exemption",
    },
    {
      path: "packages/ui/src/tideline/tokens/tokens.ts",
      rules: ["retired-orange"],
      reason:
        "legacy: generated from the 3.1 token source; F2a regenerates it and deletes this exemption",
    },
    {
      path: "packages/ui/src/tideline/tokens/tokens.additions.json",
      rules: ["retired-orange"],
      reason: "legacy: 3.1 token additions; F2a folds them into 4.1.1",
    },
    {
      path: "packages/ui/src/tideline/base/base.css",
      rules: ["important"],
      reason:
        "legacy: the 3.1 stylesheet (split by F1) hides closed UI SDK content with one !important until the apps' global CSS is layered (F5a/F6a); F2a deletes this exemption",
    },
    {
      path: "packages/ui/src/tideline/button/button.css",
      rules: ["important"],
      reason:
        "legacy: the 3.1 stylesheet (split by F1) locks the primary label colour with three !important declarations against unlayered host CSS; F2a deletes this exemption",
    },
    {
      path: "packages/ui/src/tideline/styles.test.ts",
      rules: ["important"],
      reason:
        "legacy: not a style; the unit test that enforces the same no-!important rule (and allow-lists the two legacy uses above) names the keyword; delete with those exemptions (F2a)",
    },
    {
      path: "packages/ui/src/tideline/search/search.css",
      rules: ["solar-outside-live"],
      reason:
        "legacy: the 3.1 stylesheet (split by F1) uses live colour on the offline search state (Tideline 4.0 step 1 removed it); F2a deletes this exemption",
    },
  ],
  checks: [
    // The design contract itself (not legacy).
    { kind: "exists", path: "AGENTS.md" },
    { kind: "exists", path: "docs/design/tideline-4.1.1/README.md" },
    { kind: "exists", path: "docs/design/tideline-4.1.1/brand-book.md" },
    { kind: "exists", path: "docs/design/tideline-4.1.1/tokens.json" },
    { kind: "exists", path: "docs/design/tideline-4.1.1/components.md" },
    { kind: "exists", path: "docs/design/tideline-4.1.1/canvases.md" },
    { kind: "exists", path: "docs/design/tideline-4.1.1/ia-hq.md" },
    { kind: "exists", path: "docs/design/tideline-4.1.1/adaptive.md" },
    { kind: "exists", path: "docs/plan/README.md" },
    {
      kind: "includes",
      file: "docs/design/tideline-4.1.1/README.md",
      values: [
        "This folder overrides every older design document",
        "Jost Medium 500",
        "Geist Mono",
        "**live\n  states only**",
        "No serif anywhere",
        "never Salt, Dune",
        "`DunaMark` and `DunaLogo`",
      ],
      message:
        "docs/design/tideline-4.1.1/README.md must keep the core contract statement",
    },
    {
      kind: "includes",
      file: "AGENTS.md",
      values: ["docs/design/tideline-4.1.1/README.md", "docs/plan/README.md"],
      message: "AGENTS.md must point to the Tideline 4.1.1 contract and plan",
    },
    {
      kind: "includes",
      file: "docs/design/README.md",
      values: ["tideline-4.1.1/README.md"],
      message:
        "docs/design/README.md must point to the Tideline 4.1.1 contract",
    },
    ...[
      "duna-font-usage-guide.md",
      "duna-design-system.md",
      "duna-design-system-v3.md",
      "duna-design-system-v4.md",
      "duna-mobile-design-guide.md",
      "duna-mobile-interface-v4.md",
      "duna-theming-light-dark.md",
      "duna-implementation-audit.md",
      "duna-hq-component-system.md",
    ].map(
      (doc) =>
        ({
          kind: "includes",
          file: `docs/design/${doc}`,
          when: `docs/design/${doc}`,
          values: ["Superseded by Tideline 4.1.1"],
          message: `docs/design/${doc} must keep its "Superseded by Tideline 4.1.1" banner`,
        }) as const,
    ),
    {
      kind: "excludes",
      file: "docs/design/duna-font-usage-guide.md",
      when: "docs/design/duna-font-usage-guide.md",
      values: ["Fraunces", "Figtree", "JetBrains Mono"],
      message:
        "docs/design/duna-font-usage-guide.md must not restore a retired product family",
    },
    {
      kind: "imageryLog",
      file: "apps/web/public/media/brand/imagery-log.json",
    },

    // packages/ui legacy pins: delete when the shared layer migrates.
    {
      kind: "exists",
      path: "docs/licenses/Archivo-OFL-1.1.txt",
      legacy:
        "legacy: delete when the Archivo font files are removed (M-F1, M-X1)",
    },
    {
      kind: "exists",
      path: "packages/ui/src/brand/club-colors.ts",
    },
    {
      kind: "exists",
      path: "packages/ui/src/brand/duna-mark.tsx",
    },
    {
      kind: "exists",
      path: "packages/ui/src/brand/duna-logo.tsx",
    },
    {
      kind: "includes",
      file: "packages/ui/src/mobile.ts",
      values: ['ground: whiteCanvas ? "#FFFFFF"'],
      message:
        "packages/ui/src/mobile.ts must preserve the true-white light mobile ground",
      legacy:
        "legacy: delete when native tokens move to Tideline (Salt ground) (M-F0)",
    },
    {
      kind: "includes",
      file: "packages/ui/src/web.tsx",
      values: [
        "function buttonClassName",
        "function PageHeader",
        "function AvatarStack",
        "function StatCard",
        "function EmptyState",
        "function ProgressBar",
        '"score"',
        '"monument"',
        '"hero"',
        '"block"',
        '"table"',
        '"chip"',
      ],
      message:
        "packages/ui/src/web.tsx must keep its shared primitives and numeric tiers",
      legacy:
        "legacy: delete when the web surfaces use packages/ui/src/tideline (F1, F3)",
    },
    {
      kind: "includes",
      file: "packages/ui/src/styles.css",
      values: [
        '--font-display: var(--td-font-ui, "Helvetica Neue", Arial, sans-serif)',
        '--font-body: var(--td-font-ui, "Helvetica Neue", Arial, sans-serif)',
        "--font-heading: var(--font-display)",
        "--font-ui: var(--font-body)",
        "--font-sans: var(--font-body)",
        '--font-data: var(--td-font-ui, "Helvetica Neue", Arial, sans-serif)',
        "--td-font-display: var(--td-font-ui)",
        "--td-font-numeric: var(--td-font-ui)",
        "--signal-text: #52630f",
        "--signal-text: #c9e265",
        "clamp(4.5rem, 8vw, 8.75rem)",
        "clamp(7.5rem, 12vw, 12.5rem)",
        "clamp(2.5rem, 4vw, 3.5rem)",
        "clamp(2rem, 3vw, 2.875rem)",
        "clamp(0.8125rem, 1.25vw, 1.1875rem)",
        "clamp(0.75rem, 1vw, 0.8125rem)",
      ],
      message:
        "packages/ui/src/styles.css must keep the legacy font and numeric-tier contract",
      legacy: "legacy: delete when the web fonts move to Jost/Geist (F2b, F3)",
    },
    ...(
      [
        [".duna-numeric--score", '"wght" 900'],
        [".duna-numeric--monument", '"wght" 900'],
        [".duna-numeric--hero", '"wght" 800'],
        [".duna-numeric--block", '"wght" 800'],
        [".duna-numeric--table", '"wght" 700'],
        [".duna-numeric--chip", '"wght" 700'],
      ] as const
    ).map(
      ([selector, weight]) =>
        ({
          kind: "cssRule",
          file: "packages/ui/src/styles.css",
          selector,
          values: [weight],
          message: `packages/ui/src/styles.css must preserve ${selector} at ${weight}`,
          legacy:
            "legacy: delete when the web fonts move to Jost/Geist (F2b, F3)",
        }) as const,
    ),
    {
      kind: "includes",
      file: "packages/ui/src/tokens.ts",
      values: [
        'display: "Satoshi"',
        'body: "Satoshi"',
        'data: "Satoshi"',
        'mono: "Satoshi"',
      ],
      message: "packages/ui/src/tokens.ts must keep the legacy font tokens",
      legacy:
        "legacy: delete when native type moves to Jost/Geist (native planner, M-F0/M-F1)",
    },
  ],
};
