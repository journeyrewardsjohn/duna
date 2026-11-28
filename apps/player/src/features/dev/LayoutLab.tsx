import { LayoutLab } from "@duna/ui/native/layout/lab";

/**
 * Simulator runs without touch: start Metro with
 * EXPO_PUBLIC_DUNA_LAYOUT_LAB=1 (Pro also accepts a tab-bar variant), and
 * optionally EXPO_PUBLIC_DUNA_LAYOUT_LAB_TAB=<tab key> and
 * EXPO_PUBLIC_DUNA_LAYOUT_LAB_SCRIPTED=1. Preview builds only.
 */
export const layoutLabAutostart =
  process.env.EXPO_PUBLIC_DUNA_LAYOUT_LAB || undefined;
const initialTab = process.env.EXPO_PUBLIC_DUNA_LAYOUT_LAB_TAB || undefined;
const scripted = process.env.EXPO_PUBLIC_DUNA_LAYOUT_LAB_SCRIPTED === "1";

/**
 * Development-only Layout lab for the Player (preview builds only; opened
 * from the preview banner or duna://dev/layout-lab). See
 * docs/mobile/ADAPTIVE.md.
 */
export function PlayerLayoutLab({ onClose }: { readonly onClose: () => void }) {
  return (
    <LayoutLab
      appName="player"
      centerAction={{ title: "New", systemImage: "plus" }}
      initialTab={initialTab}
      onClose={onClose}
      scripted={scripted}
      tabs={[
        { key: "find", title: "Find", systemImage: "magnifyingglass" },
        { key: "play", title: "Play", systemImage: "figure.volleyball" },
        {
          key: "improve",
          title: "Improve",
          systemImage: "chart.line.uptrend.xyaxis",
        },
        {
          key: "connect",
          title: "Connect",
          systemImage: "bubble.left.and.bubble.right",
        },
      ]}
    />
  );
}
