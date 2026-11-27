import { dunaAppColors, mobileGrid } from "@duna/ui/mobile";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DunaIcon, type DunaIconName } from "../../duna-icon";
import { LiquidGlassSurface } from "../../liquid-glass-surface";
import {
  playerPrimaryDestination,
  type PlayerPrimaryDestination,
} from "../../player-navigation";
import { SatoshiText as Text } from "../../satoshi-text";
import { DunaMark } from "./brand";
import { colors, rgba } from "../shared/palette";
import type { Tab } from "./navigation";
import { selectionHaptic } from "../shared/haptics";
import { styles } from "../legacy/styles";

export function TabBar({
  active,
  onDunaAi,
  onChange,
  onQuickActions,
  unreadCount,
}: {
  readonly active: Tab;
  readonly onDunaAi: () => void;
  readonly onChange: (destination: PlayerPrimaryDestination) => void;
  readonly onQuickActions: () => void;
  readonly unreadCount: number;
}) {
  const insets = useSafeAreaInsets();
  const selected = playerPrimaryDestination(active);
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
          selectionHaptic();
          onChange(destination);
        }}
        style={[styles.tabItem, isSelected && styles.tabItemActive]}
      >
        <View style={styles.tabIconWrap}>
          <DunaIcon
            color={isSelected ? dunaAppColors.ink : dunaAppColors.textSecondary}
            name={icon}
            size={20}
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
      </Pressable>
    );
  };

  return (
    <View
      style={[
        styles.tabBarPosition,
        { bottom: Math.max(mobileGrid[2], insets.bottom - mobileGrid[5]) },
      ]}
    >
      <View style={styles.tabBar}>
        <LiquidGlassSurface
          borderColor={rgba(colors.whiteRgb, 0.82)}
          cornerRadius={mobileGrid[7]}
          fallbackColor={rgba(colors.whiteRgb, 0.82)}
          tint={dunaAppColors.card}
        />
        {destinationButton("home", "Home", "home")}
        {destinationButton("calendar", "Calendar", "calendar")}
        <Pressable
          accessibilityHint="Opens your full-screen Duna AI copilot"
          accessibilityLabel="Duna AI"
          accessibilityRole="button"
          onPress={() => {
            selectionHaptic();
            onDunaAi();
          }}
          style={styles.tabAiButton}
        >
          <View style={styles.tabAiHalo}>
            <DunaMark size={mobileGrid[5]} />
          </View>
        </Pressable>
        <Pressable
          accessibilityHint="Opens contextual Player actions"
          accessibilityLabel="Quick actions"
          accessibilityRole="button"
          onPress={() => {
            selectionHaptic();
            onQuickActions();
          }}
          style={styles.tabItem}
        >
          <DunaIcon
            color={dunaAppColors.ink}
            name="plus"
            size={20}
            strokeWidth={1.55}
          />
        </Pressable>
        {destinationButton("messages", "Messages", "message")}
      </View>
    </View>
  );
}
