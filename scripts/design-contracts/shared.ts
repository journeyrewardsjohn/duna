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
  tidelineExemptions: [],
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
  ],
};
