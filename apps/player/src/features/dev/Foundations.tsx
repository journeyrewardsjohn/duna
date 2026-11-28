import {
  FoundationsScreen,
  parseFoundationsUrl,
  type FoundationsOptions,
} from "@duna/ui/native/foundations";

export { parseFoundationsUrl, type FoundationsOptions };

/**
 * Simulator runs without touch: start Metro with
 * EXPO_PUBLIC_DUNA_FOUNDATIONS=1, or open duna://dev/foundations
 * (query: section=palette|type|icons|motion|loaders|states,
 * theme=light|dark|live, motion=reduced). Preview builds only.
 */
export const foundationsAutostart: FoundationsOptions | null = process.env
  .EXPO_PUBLIC_DUNA_FOUNDATIONS
  ? (parseFoundationsUrl(
      `duna://dev/foundations?${process.env.EXPO_PUBLIC_DUNA_FOUNDATIONS}`,
    ) ?? {})
  : null;

/**
 * Development-only Foundations gallery for the Player app: palette, type, icons,
 * motion, loaders and state parts of the Duna Design System. Opened like
 * the Layout lab (preview builds only). See docs/mobile/DESIGN_SYSTEM.md.
 */
export function PlayerFoundations({
  initial,
  onClose,
}: {
  readonly initial: FoundationsOptions;
  readonly onClose: () => void;
}) {
  return (
    <FoundationsScreen appName="Player" initial={initial} onClose={onClose} />
  );
}
