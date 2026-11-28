import { LayoutLab } from "@duna/ui/native/layout/lab";

/**
 * Simulator runs without touch: start Metro with
 * EXPO_PUBLIC_DUNA_LAYOUT_LAB=1, and optionally
 * EXPO_PUBLIC_DUNA_LAYOUT_LAB_TAB=<tab key> and
 * EXPO_PUBLIC_DUNA_LAYOUT_LAB_SCRIPTED=1. Preview builds only.
 */
export const layoutLabAutostart =
  process.env.EXPO_PUBLIC_DUNA_LAYOUT_LAB || undefined;
const initialTab = process.env.EXPO_PUBLIC_DUNA_LAYOUT_LAB_TAB || undefined;
const scripted = process.env.EXPO_PUBLIC_DUNA_LAYOUT_LAB_SCRIPTED === "1";

/**
 * Development-only Layout lab for Duna Pro (preview builds only; opened with
 * a long press on the preview banner or duna-pro://dev/layout-lab). See
 * docs/mobile/ADAPTIVE.md.
 */
export function ProLayoutLab({ onClose }: { readonly onClose: () => void }) {
  return (
    <LayoutLab
      appName="pro"
      centerAction={{ title: "New", systemImage: "plus" }}
      initialTab={initialTab}
      onClose={onClose}
      scripted={scripted}
      tabs={[
        { key: "today", title: "Today", systemImage: "sun.max" },
        { key: "schedule", title: "Schedule", systemImage: "calendar" },
        { key: "people", title: "People", systemImage: "person.2" },
        { key: "inbox", title: "Inbox", systemImage: "tray" },
      ]}
    />
  );
}
