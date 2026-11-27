import { View, Pressable, Image } from "react-native";
import { tabs, type Tab, type NavDestination } from "./navigation";
import { styles } from "../legacy/styles";
import { selectionHaptic } from "../shared/haptics";
import { dunaProWordmarkBlue } from "./brand";
import { colors } from "../shared/palette";

export function TabBar({
  active,
  onChange,
}: {
  readonly active: Tab;
  readonly onChange: (tab: NavDestination) => void;
}) {
  return (
    <View style={styles.tabBar}>
      {tabs.map((tab) => (
        <Pressable
          accessibilityLabel={tab.label}
          accessibilityRole="tab"
          accessibilityState={{ selected: active === tab.key }}
          key={tab.key}
          onPress={() => {
            selectionHaptic();
            onChange(tab.key);
          }}
          style={[styles.tabItem, tab.key === "ai" && styles.aiTab]}
        >
          {tab.key === "ai" ? (
            <View style={styles.aiTabMarkCrop}>
              <Image
                accessibilityLabel="Duna AI"
                accessibilityIgnoresInvertColors
                resizeMode="contain"
                source={dunaProWordmarkBlue}
                style={styles.aiTabMarkImage}
              />
            </View>
          ) : (
            <View
              style={[
                styles.tabIconShell,
                active === tab.key && styles.tabIconShellActive,
              ]}
            >
              {tab.icon ? (
                <tab.icon
                  color={active === tab.key ? colors.warning : colors.muted}
                  size={24}
                  strokeWidth={active === tab.key ? 2.25 : 1.75}
                />
              ) : null}
            </View>
          )}
        </Pressable>
      ))}
    </View>
  );
}
