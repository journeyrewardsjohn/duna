import { Pressable } from "react-native";
import { usePlayerRuntime } from "../../runtime";
import { useShell } from "./ShellContext";
import { StatusChip } from "./ui";

/**
 * The shell's honest status under a hub or Home title: a preview build
 * (sign-in and payments off) or offline (when it last synced). Replaces the
 * old full-width preview and offline banners. In preview builds a long press
 * opens the development Layout lab.
 */
export function ShellStatus() {
  const { isOffline, lastSuccessfulSyncAt, mode } = usePlayerRuntime();
  const shell = useShell();
  if (mode === "preview") {
    return (
      <Pressable
        accessibilityHint="Long press opens the development Layout lab"
        accessibilityLabel="Preview build. Sign-in and payments are off."
        delayLongPress={600}
        onLongPress={shell.openLayoutLab}
      >
        <StatusChip
          icon="info"
          label="Preview · sign-in and payments are off"
        />
      </Pressable>
    );
  }
  if (!isOffline) return null;
  const synced = lastSuccessfulSyncAt
    ? new Date(lastSuccessfulSyncAt).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })
    : null;
  return (
    <StatusChip
      icon="signal-line"
      label={synced ? `Offline · synced ${synced}` : "Offline · saved data"}
      tone="warning"
      wash="warning-wash"
    />
  );
}
