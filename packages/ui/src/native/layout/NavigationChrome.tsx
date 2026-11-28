import { useCallback, useMemo, useRef, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import {
  Tabs,
  type TabSelectedEvent,
  type TabSelectionPreventedEvent,
  type TabSelectionRejectedEvent,
} from "react-native-screens";
import type { NativeSyntheticEvent } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

export interface ChromeTab {
  readonly key: string;
  readonly title: string;
  /**
   * SF Symbol name. Required: on the Duo's inner display iOS moves the tab bar
   * to a vertical bar, which shows only items that have a symbol.
   */
  readonly systemImage: string;
  /** Badge text ("3", "New"); omit for none. */
  readonly badge?: string;
  /** The tab's screen. It stays mounted while other tabs are selected. */
  readonly content: ReactNode;
}

export interface ChromeCenterAction {
  readonly key?: string;
  readonly title: string;
  readonly systemImage: string;
  /** Runs instead of selecting a tab (the Player's "+", Pro's New). */
  readonly onPress: () => void;
}

export interface NavigationChromeProps {
  readonly tabs: readonly ChromeTab[];
  readonly selected: string;
  readonly onSelect: (key: string) => void;
  /** Placed in the middle of the tabs and given the system's prominent treatment on iOS 27. */
  readonly centerAction?: ChromeCenterAction;
  /** Hides the bar (half-open full-screen modes, modals). */
  readonly hidden?: boolean;
  /**
   * Lets iPad turn the tab bar into a sidebar (UIKit's sidebar-adaptable
   * tabs). Defaults to true.
   */
  readonly sidebarAdaptable?: boolean;
  /** Selected-item tint. Structural default: the system tint. */
  readonly tintColor?: string;
}

const CENTER_KEY = "__duna_center_action";

/** Where the centre action goes: the middle of the tab list. Pure; unit-tested. */
export function chromeItems(
  tabs: readonly ChromeTab[],
  centerAction?: ChromeCenterAction,
): readonly (
  | { readonly kind: "tab"; readonly tab: ChromeTab }
  | {
      readonly kind: "center";
      readonly action: ChromeCenterAction;
      readonly key: string;
    }
)[] {
  const items = tabs.map((tab) => ({ kind: "tab" as const, tab }));
  if (!centerAction) return items;
  const middle = Math.floor(tabs.length / 2);
  return [
    ...items.slice(0, middle),
    {
      kind: "center" as const,
      action: centerAction,
      key: centerAction.key ?? CENTER_KEY,
    },
    ...items.slice(middle),
  ];
}

/**
 * The app shell's tab navigation, drawn by the system: UIKit's
 * `UITabBarController` through react-native-screens' native tabs (the engine
 * behind Expo Router's native tabs). iOS places it: a bottom tab bar when
 * compact, a vertical bar on the leading edge of the Duo's inner display, a
 * sidebar on iPad. Each tab's screen is an ordinary React Native tree that
 * stays mounted, so its state survives tab switches and posture changes.
 */
export function NavigationChrome({
  centerAction,
  hidden = false,
  onSelect,
  selected,
  sidebarAdaptable = true,
  tabs,
  tintColor,
}: NavigationChromeProps) {
  // The native host owns selection; JS requests changes against the last
  // state it acknowledged (react-native-screens' provenance model).
  const provenance = useRef(0);
  const items = chromeItems(tabs, centerAction);
  const centerKey = centerAction ? (centerAction.key ?? CENTER_KEY) : null;

  const onTabSelected = useCallback(
    (event: NativeSyntheticEvent<TabSelectedEvent>) => {
      provenance.current = event.nativeEvent.provenance;
      const key = event.nativeEvent.selectedScreenKey;
      if (key !== selected && key !== centerKey) onSelect(key);
    },
    [centerKey, onSelect, selected],
  );
  const onTabSelectionRejected = useCallback(
    (event: NativeSyntheticEvent<TabSelectionRejectedEvent>) => {
      provenance.current = event.nativeEvent.provenance;
    },
    [],
  );
  const onTabSelectionPrevented = useCallback(
    (event: NativeSyntheticEvent<TabSelectionPreventedEvent>) => {
      provenance.current = event.nativeEvent.provenance;
      if (centerAction && event.nativeEvent.preventedScreenKey === centerKey) {
        centerAction.onPress();
      }
    },
    [centerAction, centerKey],
  );

  // Re-sent only when the requested tab changes, based on the last state the
  // native host acknowledged.
  const navStateRequest = useMemo(
    () => ({ selectedScreenKey: selected, baseProvenance: provenance.current }),
    [selected],
  );

  return (
    <Tabs.Host
      ios={{
        prominentScreenKey: centerKey ?? undefined,
        tabBarControllerMode: sidebarAdaptable ? "tabSidebar" : "tabBar",
        tabBarTintColor: tintColor,
      }}
      navStateRequest={navStateRequest}
      onTabSelected={onTabSelected}
      onTabSelectionPrevented={onTabSelectionPrevented}
      onTabSelectionRejected={onTabSelectionRejected}
      tabBarHidden={hidden}
    >
      {items.map((item) =>
        item.kind === "tab" ? (
          <Tabs.Screen
            badgeValue={item.tab.badge}
            ios={{ icon: { type: "sfSymbol", name: item.tab.systemImage } }}
            key={item.tab.key}
            screenKey={item.tab.key}
            title={item.tab.title}
          >
            {/* Each tab measures its own safe area: on the Duo the system
                bar is vertical, on iPad it is a sidebar, so the insets a
                screen needs come from the tab, not the window. */}
            <SafeAreaProvider style={styles.fill}>
              {item.tab.content}
            </SafeAreaProvider>
          </Tabs.Screen>
        ) : (
          <Tabs.Screen
            ios={{ icon: { type: "sfSymbol", name: item.action.systemImage } }}
            key={item.key}
            preventNativeSelection
            screenKey={item.key}
            tabBarItemAccessibilityLabel={item.action.title}
            title={item.action.title}
          >
            <View style={styles.fill} />
          </Tabs.Screen>
        ),
      )}
    </Tabs.Host>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
