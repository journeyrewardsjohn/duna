import type { ContractCheck } from "./types";

/**
 * Adaptive-layout rule for native feature screens (M-F2;
 * docs/mobile/ADAPTIVE.md). It applies only to `src/features/**` paths a
 * contract lists as migrated, so it cannot fail on today's code: each screen
 * package adds its folder to `migrated` when it moves onto the scaffolds.
 *
 * Migrated screens lay out by the pane they are in, never by the screen:
 * - no `Dimensions.get` (stale after the Duo opens or an iPad window resizes;
 *   use `useLayout()` or `usePane()`),
 * - no direct `<Modal presentationStyle="pageSheet">` (a stretched form sheet
 *   on iPad and the open Duo; use `AdaptiveSheet`),
 * - no fixed `width`, `minWidth` or `maxWidth` of 300 pt or more (size from
 *   the pane instead),
 * - and they import the scaffolds from `@duna/ui/native/layout`.
 */
export function adaptiveScreenCheck(
  app: "player" | "pro",
  migrated: readonly string[],
): ContractCheck {
  const featureRoot = `apps/${app}/src/features/`;
  return {
    kind: "migratedSourceRules",
    roots: migrated.filter((path) => path.startsWith(featureRoot)),
    forbidden: [
      {
        pattern: String.raw`\bDimensions\.get\s*\(`,
        message:
          "migrated screens must not read Dimensions.get; use useLayout() or usePane() from @duna/ui/native/layout",
      },
      {
        pattern: String.raw`presentationStyle\s*=\s*\{?\s*["']pageSheet["']`,
        message:
          'migrated screens must not open <Modal presentationStyle="pageSheet"> directly; use AdaptiveSheet',
      },
      {
        pattern: String.raw`\b(?:width|minWidth|maxWidth)\s*:\s*(?:[3-9]\d{2}|[1-9]\d{3,})(?:\.\d+)?\b`,
        message:
          "migrated screens must not use a fixed width of 300 pt or more; size from the pane (usePane) or the scaffolds",
      },
    ],
    required: [
      {
        value: "@duna/ui/native/layout",
        message:
          "a migrated screen folder must lay out with the scaffolds from @duna/ui/native/layout",
      },
    ],
  };
}
