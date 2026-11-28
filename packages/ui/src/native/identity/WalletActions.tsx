/**
 * The four actions under the selected card (spec §3): 48 pt circles with a
 * label on the dark band. A toggle (Show pass) fills Salt while on. An
 * action that does not apply keeps its place, reads as unavailable and says
 * why when pressed (`onUnavailable`), never silently.
 */
import { Pressable, StyleSheet, View } from "react-native";
import { Icon, type GlyphName } from "../icons";
import { useHaptics } from "../motion";
import { nativeTokens } from "../tokens";
import { Text } from "../type";

const SALT = nativeTokens.brand.salt;
const NIGHT = nativeTokens.brand["night-court"];

export interface WalletActionItem {
  readonly key: string;
  readonly label: string;
  readonly icon: GlyphName;
  readonly onPress: () => void;
  /** A toggle that is on (Show pass while the pass shows). */
  readonly pressed?: boolean;
  readonly disabled?: boolean;
  /** Why it is unavailable ("This membership has ended"). */
  readonly reason?: string;
  readonly hint?: string;
}

export function WalletActions({
  items,
  label,
  onUnavailable,
}: {
  readonly items: readonly WalletActionItem[];
  /** "Actions for Saltline Beach Club". */
  readonly label: string;
  readonly onUnavailable?: (reason: string) => void;
}) {
  const haptics = useHaptics();
  return (
    <View accessibilityLabel={label} style={styles.row} testID="wallet-actions">
      {items.map((item) => (
        <Pressable
          accessibilityHint={item.disabled ? item.reason : item.hint}
          accessibilityLabel={item.label}
          accessibilityRole="button"
          accessibilityState={{
            disabled: item.disabled === true,
            ...(item.pressed !== undefined ? { selected: item.pressed } : {}),
          }}
          key={item.key}
          onPress={() => {
            if (item.disabled) {
              haptics.refused();
              if (item.reason) onUnavailable?.(item.reason);
              return;
            }
            haptics.selection();
            item.onPress();
          }}
          style={styles.item}
          testID={`wallet-action-${item.key}`}
        >
          {({ pressed }) => (
            <>
              <View
                style={[
                  styles.circle,
                  item.pressed ? styles.on : null,
                  item.disabled ? styles.off : null,
                  pressed ? styles.down : null,
                ]}
              >
                <Icon
                  color={item.pressed ? NIGHT : SALT}
                  name={item.icon}
                  size="control"
                />
              </View>
              <Text
                numberOfLines={2}
                style={[styles.label, item.disabled ? styles.offText : null]}
                variant="phone-meta"
                weight={500}
              >
                {item.label}
              </Text>
            </>
          )}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "flex-start",
    gap: 8,
  },
  item: { flex: 1, alignItems: "center", gap: 6, minHeight: 48 },
  circle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(244,242,236,0.1)",
    borderWidth: 1,
    borderColor: "rgba(244,242,236,0.22)",
  },
  on: { backgroundColor: SALT, borderColor: SALT },
  off: { opacity: 0.42 },
  down: { transform: [{ scale: 0.96 }] },
  label: { color: SALT, textAlign: "center" },
  offText: { opacity: 0.6 },
});
