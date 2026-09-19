import { usePlayerDesign } from "./design-theme";
import { useMemo } from "react";
import type { resolveDunaSandColors } from "@duna/ui/mobile";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DunaIcon, type DunaIconName } from "./duna-icon";
import type { PlayerPrimaryDestination } from "./player-navigation";
import { SatoshiText as Text } from "./satoshi-text";

// Metro bundles the brand mark from this static asset reference.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const brandMark = require("./assets/duna-mark.png");

function DunaMark({ size }: { readonly size: number }) {
  return (
    <Image
      accessibilityIgnoresInvertColors
      resizeMode="contain"
      source={brandMark}
      style={{ height: size, width: size }}
    />
  );
}

export function SandTabBar({
  selected,
  onDunaAi,
  onChange,
  onQuickActions,
  unreadCount,
  onPressFeedback,
}: {
  readonly selected?: PlayerPrimaryDestination;
  readonly onDunaAi: () => void;
  readonly onChange: (destination: PlayerPrimaryDestination) => void;
  readonly onQuickActions: () => void;
  readonly unreadCount: number;
  readonly onPressFeedback?: () => void;
}) {
  const { sand: sandColors } = usePlayerDesign();
  const styles = useMemo(() => createStyles(sandColors), [sandColors]);

  const insets = useSafeAreaInsets();
  const destinationButton = (
    destination: PlayerPrimaryDestination,
    label: string,
    icon: DunaIconName,
  ) => {
    const isSelected = selected === destination;
    return (
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="tab"
        accessibilityState={{ selected: isSelected }}
        key={destination}
        onPress={() => {
          onPressFeedback?.();
          onChange(destination);
        }}
        style={[styles.tabItem, isSelected && styles.tabItemActive]}
      >
        <View style={styles.tabIconWrap}>
          <DunaIcon
            color={sandColors.ink}
            name={icon}
            size={21}
            strokeWidth={isSelected ? 1.75 : 1.45}
          />
          {destination === "messages" && unreadCount > 0 && (
            <View style={styles.tabUnreadBadge}>
              <Text style={styles.tabUnreadText}>
                {Math.min(unreadCount, 9)}
              </Text>
            </View>
          )}
        </View>
        <Text style={styles.tabLabel}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <View
      style={[
        styles.tabBarPosition,
        { bottom: 0, paddingBottom: Math.max(10, insets.bottom) },
      ]}
    >
      <View style={styles.tabBar}>
        {destinationButton("home", "Home", "home")}
        {destinationButton("calendar", "Schedule", "calendar")}
        <Pressable
          accessibilityHint="Opens your full-screen Duna AI copilot"
          accessibilityLabel="Duna AI"
          accessibilityRole="button"
          onPress={() => {
            onPressFeedback?.();
            onDunaAi();
          }}
          style={styles.tabAiButton}
        >
          <View style={styles.tabAiHalo}>
            <DunaMark size={24} />
          </View>
          <Text style={styles.tabLabel}>Duna</Text>
        </Pressable>
        <Pressable
          accessibilityHint="Opens contextual Player actions"
          accessibilityLabel="Quick actions"
          accessibilityRole="button"
          onPress={() => {
            onPressFeedback?.();
            onQuickActions();
          }}
          style={styles.tabItem}
        >
          <DunaIcon
            color={sandColors.ink}
            name="menu"
            size={21}
            strokeWidth={1.55}
          />
          <Text style={styles.tabLabel}>Explore</Text>
        </Pressable>
        {destinationButton("messages", "Messages", "message")}
      </View>
    </View>
  );
}

const createStyles = (sandColors: ReturnType<typeof resolveDunaSandColors>) =>
  StyleSheet.create({
    tabBarPosition: {
      left: 0,
      position: "absolute",
      right: 0,
      zIndex: 90,
      backgroundColor: sandColors.canvas,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: sandColors.line,
    },
    tabBar: {
      alignItems: "center",
      flexDirection: "row",
      minHeight: 65,
      paddingHorizontal: 10,
      paddingTop: 5,
    },
    tabItem: {
      alignItems: "center",
      flex: 1,
      minHeight: 55,
      justifyContent: "center",
      gap: 5,
      position: "relative",
    },
    tabItemActive: { opacity: 1 },
    tabLabel: { color: sandColors.ink, fontSize: 12, lineHeight: 16 },
    tabIconWrap: { position: "relative" },
    tabUnreadBadge: {
      alignItems: "center",
      backgroundColor: sandColors.ink,
      borderColor: sandColors.surface,
      borderRadius: 8,
      borderWidth: 2,
      height: 16,
      justifyContent: "center",
      minWidth: 16,
      position: "absolute",
      right: -11,
      top: -10,
    },
    tabUnreadText: {
      color: sandColors.surface,
      fontSize: 12,
      fontWeight: "700",
      lineHeight: 14,
    },
    tabAiButton: {
      alignItems: "center",
      flex: 1,
      justifyContent: "center",
      minHeight: 55,
      gap: 3,
    },
    tabAiHalo: {
      alignItems: "center",
      justifyContent: "center",
      height: 25,
      width: 25,
    },
  });
