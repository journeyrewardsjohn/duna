/**
 * Data model for the design-system verifier (`scripts/verify-design-system.ts`).
 *
 * Every surface keeps its contracts in its own file in this folder. A check
 * marked `legacy` pins behaviour of an old screen (for example "Next up comes
 * from future bookings") until that screen is rebuilt on the Duna Design System
 * (Tideline 4.1.1); the rebuild deletes it and re-expresses the behaviour as a
 * unit or e2e test. Checks that pinned old styling were removed on 28 November
 * 2026: nothing guards or preserves a legacy style (docs/plan/legacy-styles.md).
 *
 * Contract: docs/design/tideline-4.1.1/README.md. Rules: docs/plan/README.md.
 */

/** Why a check exists only until a surface migrates. Shown in failures. */
export type Legacy = `legacy: ${string}`;

interface Base {
  /** Present on pre-Tideline pins: "legacy: delete when <surface> migrates (<WP>)". */
  readonly legacy?: Legacy;
  /** The check applies only while this path exists (relative to the repo root). */
  readonly when?: string;
  /** Failure text. Defaults to a generated message. */
  readonly message?: string;
}

export type ContractCheck =
  | (Base & { readonly kind: "exists"; readonly path: string })
  /** The path must not exist (a temporary fixture or a retired artefact). */
  | (Base & { readonly kind: "absent"; readonly path: string })
  | (Base & {
      readonly kind: "includes";
      readonly file: string;
      readonly values: readonly string[];
    })
  | (Base & {
      readonly kind: "excludes";
      readonly file: string;
      readonly values: readonly string[];
    })
  /** The rule block that starts at `selector` (up to the next `}`) contains every value. */
  | (Base & {
      readonly kind: "cssRule";
      readonly file: string;
      readonly selector: string;
      readonly values: readonly string[];
    })
  /**
   * Each declaration (for example `function TabBar(`) must appear in exactly
   * one non-test source under `root`; the concatenated sources must contain
   * every value. Contracts follow the component, not the file path.
   */
  | (Base & {
      readonly kind: "declares";
      readonly root: string;
      readonly declarations: readonly string[];
      readonly values: readonly string[];
    })
  /** In the single source declaring `declaration`, every marker exists, in this order. */
  | (Base & {
      readonly kind: "declaresInOrder";
      readonly root: string;
      readonly declaration: string;
      readonly markers: readonly string[];
    })
  /** No non-test TypeScript source under `root` contains any value. */
  | (Base & {
      readonly kind: "treeExcludes";
      readonly root: string;
      readonly values: readonly string[];
    })
  /**
   * Source rules for screens that have migrated (each root is a file or a
   * folder): no source may match a forbidden pattern, and each root's sources
   * together must contain every required value. Used by the adaptive-layout
   * rule for native feature screens (`adaptive-screens.ts`).
   */
  | (Base & {
      readonly kind: "migratedSourceRules";
      readonly roots: readonly string[];
      readonly forbidden: readonly {
        readonly pattern: string;
        readonly flags?: string;
        readonly message: string;
      }[];
      readonly required: readonly {
        readonly value: string;
        readonly message: string;
      }[];
    })
  /** A file stays at or below `bytes` while it exists. */
  | (Base & {
      readonly kind: "maxBytes";
      readonly path: string;
      readonly bytes: number;
    })
  /** Expo app config: device appearance and light / dark / tinted / Android icons. */
  | (Base & { readonly kind: "expoAppConfig"; readonly app: string })
  /**
   * A native font loader: every `./assets/fonts/<file>` it references exists
   * and is a full font, and it never loads a forbidden family.
   */
  | (Base & {
      readonly kind: "fontLoader";
      readonly app: string;
      readonly loader: string;
      readonly forbidden: readonly string[];
    })
  /** A Next.js app loads no product font through `@fontsource` or `@expo-google-fonts`. */
  | (Base & { readonly kind: "noFontPackages"; readonly app: string })
  /** Every asset in the brand imagery log has its files. */
  | (Base & { readonly kind: "imageryLog"; readonly file: string });

/** Tideline guard rules. They run only on migrated paths. */
export type TidelineRule =
  | "retired-orange"
  | "solar-outside-live"
  | "important"
  | "vendor-name"
  | "tracking";

export interface TidelineExemption {
  /** A file or directory prefix relative to the repo root. */
  readonly path: string;
  readonly rules: readonly TidelineRule[];
  /** Why, who removes it, and when. */
  readonly reason: Legacy;
}

export interface SurfaceContract {
  readonly surface: "shared" | "hq" | "web" | "public" | "player" | "pro";
  /** Work packages that own this file's entries (see docs/plan/README.md). */
  readonly owners: string;
  /**
   * Files or directory prefixes that are on the Duna Design System. The
   * Tideline guard (no retired orange, Solar only in live states, no
   * `!important`, no infrastructure vendor names in user-facing strings)
   * applies to them. Add your paths when your surface migrates.
   */
  readonly migrated: readonly string[];
  readonly checks: readonly ContractCheck[];
  /** Temporary guard exemptions. Only R2 adds them; owners delete them. */
  readonly tidelineExemptions?: readonly TidelineExemption[];
}
