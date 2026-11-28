import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Pane } from "./Pane";
import type { LayoutEdges, ResolvedLayout } from "./resolve-layout";
import { layoutTheme, type LayoutTheme } from "./theme";
import { useRegionLayout } from "./use-layout";

export type FoldScaffoldMode = "compact" | "split" | "tabletop";

export interface FoldScaffoldProps {
  /**
   * The watched content: the score, the video, the drill. Top region when
   * half-open, left pane when open, the main area when compact.
   */
  readonly primary: ReactNode;
  /**
   * The touched content: point buttons, the timeline, controls. Bottom region
   * when half-open, right pane when open, below the primary when compact.
   */
  readonly secondary: ReactNode;
  /**
   * Half-open is a full-screen mode. "auto" enters it when the device is
   * propped half-open with a horizontal fold; "off" never does.
   */
  readonly tabletop?: "auto" | "off";
  /** Called when the full-screen half-open mode starts or ends. Hide the tab bar while true. */
  readonly onTabletopChange?: (active: boolean) => void;
  readonly doneLabel?: string;
  readonly theme?: Partial<LayoutTheme>;
  readonly style?: StyleProp<ViewStyle>;
  /** Overrides the measured layout (tests and the Layout lab). */
  readonly layout?: ResolvedLayout;
  readonly testID?: string;
}

const ZERO: LayoutEdges = { top: 0, left: 0, bottom: 0, right: 0 };

/**
 * Lays two regions out around the fold:
 * - open: two panes split at the fold, never across it;
 * - half-open (propped, fold horizontal): a full-screen mode with the watched
 *   region on top and the touch region below, and an explicit Done;
 * - closed and every compact window: the primary over the secondary.
 *
 * Both regions keep their positions in the React tree in every mode, so a
 * video or score keeps playing when the posture changes.
 */
export function FoldScaffold({
  doneLabel = "Done",
  layout: layoutOverride,
  onTabletopChange,
  primary,
  secondary,
  style,
  tabletop = "auto",
  testID,
  theme: themeOverrides,
}: FoldScaffoldProps) {
  const theme = layoutTheme(themeOverrides);
  const region = useRegionLayout();
  const layout = layoutOverride ?? region.layout;
  const tabletopAvailable = tabletop === "auto" && layout.mode === "tabletop";

  // Done leaves the mode until the posture changes again.
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (!tabletopAvailable) setDismissed(false);
  }, [tabletopAvailable]);
  const mode: FoldScaffoldMode =
    tabletopAvailable && !dismissed
      ? "tabletop"
      : layout.paneCount >= 2 && layout.mode !== "tabletop"
        ? "split"
        : "compact";

  const reported = useRef<boolean | null>(null);
  useEffect(() => {
    const active = mode === "tabletop";
    if (reported.current === active) return;
    reported.current = active;
    onTabletopChange?.(active);
  }, [mode, onTabletopChange]);

  const pane = (id: "primary" | "secondary" | "top" | "bottom") =>
    layout.panes.find((candidate) => candidate.id === id);
  const first = mode === "tabletop" ? pane("top") : pane("primary");
  const second = mode === "tabletop" ? pane("bottom") : pane("secondary");
  const firstFrame = first?.frame;
  const secondFrame = second?.frame;

  let containerStyle: ViewStyle = styles.column;
  let firstStyle: ViewStyle = styles.fill;
  let secondStyle: ViewStyle = {};
  if (mode === "tabletop" && firstFrame && secondFrame) {
    containerStyle = styles.column;
    firstStyle = { height: firstFrame.height };
    secondStyle = {
      height: secondFrame.height,
      marginTop: secondFrame.y - (firstFrame.y + firstFrame.height),
    };
  } else if (mode === "split" && firstFrame && secondFrame) {
    containerStyle = styles.row;
    firstStyle = { width: firstFrame.width };
    secondStyle = {
      flex: 1,
      marginLeft: secondFrame.x - (firstFrame.x + firstFrame.width),
    };
  }

  const fullInsets = layout.panes[0]?.insets ?? ZERO;
  return (
    <View
      onLayout={region.onLayout}
      ref={region.ref}
      style={[styles.root, { backgroundColor: theme.ground }, style]}
      testID={testID}
    >
      <View style={containerStyle}>
        <Pane
          id={mode === "tabletop" ? "top" : "primary"}
          insets={mode === "compact" ? fullInsets : (first?.insets ?? ZERO)}
          style={firstStyle}
          testID="fold-scaffold-primary"
        >
          {primary}
        </Pane>
        <Pane
          id={mode === "tabletop" ? "bottom" : "secondary"}
          insets={second?.insets ?? ZERO}
          style={secondStyle}
          testID="fold-scaffold-secondary"
        >
          {secondary}
          {mode === "tabletop" ? (
            <Pressable
              accessibilityHint="Leaves the half-open view"
              accessibilityLabel={doneLabel}
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => setDismissed(true)}
              style={[
                styles.done,
                { bottom: (second?.insets.bottom ?? 0) + 8 },
              ]}
            >
              <Text style={[styles.doneText, { color: theme.control }]}>
                {doneLabel}
              </Text>
            </Pressable>
          ) : null}
        </Pane>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fill: { flex: 1 },
  column: { flex: 1, flexDirection: "column" },
  row: { flex: 1, flexDirection: "row" },
  done: {
    position: "absolute",
    right: 16,
    minHeight: 44,
    minWidth: 64,
    justifyContent: "center",
    alignItems: "center",
  },
  doneText: { fontSize: 17, fontWeight: "600" },
});
