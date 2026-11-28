import type { ReactNode } from "react";
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
import { SheetHost } from "./sheet-host";
import { layoutTheme, type LayoutTheme } from "./theme";
import { useRegionLayout } from "./use-layout";

export interface AdaptiveScaffoldProps {
  /** The list or primary content. Always mounted. */
  readonly primary: ReactNode;
  /**
   * The pushed detail, or null when nothing is selected. In a compact
   * window it covers the primary pane with a Back control; in a wider window
   * it is the second pane. The same element stays mounted across the change,
   * so its scroll position and form state survive opening or closing the Duo
   * and resizing an iPad window.
   */
  readonly detail?: ReactNode | null;
  /** Shown in the second pane while nothing is selected (regular and wider). */
  readonly emptyDetail?: ReactNode;
  /** An optional third pane (conditions, summary, notes) when there is room. */
  readonly inspector?: ReactNode;
  /** Called by the compact Back control. Clear the selection here. */
  readonly onDismissDetail?: () => void;
  readonly backLabel?: string;
  readonly theme?: Partial<LayoutTheme>;
  readonly style?: StyleProp<ViewStyle>;
  /** Overrides the measured layout (tests and the Layout lab). */
  readonly layout?: ResolvedLayout;
  readonly testID?: string;
}

const ZERO: LayoutEdges = { top: 0, left: 0, bottom: 0, right: 0 };

/**
 * Primary + optional detail + optional inspector. Collapses to a stack when
 * compact. Every pane keeps the same position in the React tree in every
 * arrangement, so switching between one, two and three panes never remounts
 * a pane's content.
 */
export function AdaptiveScaffold({
  backLabel = "Back",
  detail = null,
  emptyDetail = null,
  inspector,
  layout: layoutOverride,
  onDismissDetail,
  primary,
  style,
  testID,
  theme: themeOverrides,
}: AdaptiveScaffoldProps) {
  const theme = layoutTheme(themeOverrides);
  const region = useRegionLayout();
  const layout = layoutOverride ?? region.layout;
  const stacked = layout.paneCount === 1 || layout.mode === "tabletop";
  const hasDetail = detail !== null && detail !== undefined && detail !== false;
  const showInspector = Boolean(inspector) && layout.paneCount === 3;

  const frame = (id: "primary" | "secondary" | "inspector") =>
    layout.panes.find((pane) => pane.id === id);
  const primaryFrame = frame("primary");
  const secondaryFrame = frame("secondary");
  const inspectorFrame = frame("inspector");
  const fullInsets = layout.panes[0]?.insets ?? ZERO;

  // Stack: one pane visible at a time, both mounted.
  // Split: primary width from the resolver (at the fold on the Duo), then the
  // detail, then the inspector when there is room for three.
  const primaryStyle: ViewStyle = stacked
    ? styles.fill
    : { width: primaryFrame?.frame.width ?? 0, height: "100%" };
  const gap =
    !stacked && primaryFrame && secondaryFrame
      ? secondaryFrame.frame.x -
        (primaryFrame.frame.x + primaryFrame.frame.width)
      : 0;
  const secondaryStyle: ViewStyle = stacked
    ? styles.fill
    : {
        flex: 1,
        marginLeft: gap,
        borderLeftWidth: gap > 0 ? 0 : StyleSheet.hairlineWidth,
        borderLeftColor: theme.separator,
      };
  const inspectorStyle: ViewStyle = {
    width: inspectorFrame?.frame.width ?? 0,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: theme.separator,
  };

  return (
    <View
      onLayout={region.onLayout}
      ref={region.ref}
      style={[styles.root, { backgroundColor: theme.ground }, style]}
      testID={testID}
    >
      <SheetHost
        enabled={!stacked}
        overlay={(layer) =>
          layer && secondaryFrame ? (
            <View
              pointerEvents="box-none"
              style={[
                styles.overlay,
                {
                  left: secondaryFrame.frame.x,
                  width: secondaryFrame.frame.width,
                },
              ]}
            >
              {layer}
            </View>
          ) : null
        }
      >
        <View style={stacked ? styles.fill : styles.row}>
          <Pane
            hidden={stacked && hasDetail}
            id="primary"
            insets={stacked ? fullInsets : (primaryFrame?.insets ?? ZERO)}
            style={primaryStyle}
            testID="adaptive-scaffold-primary"
          >
            {primary}
          </Pane>
          <Pane
            hidden={stacked && !hasDetail}
            id="secondary"
            insets={stacked ? fullInsets : (secondaryFrame?.insets ?? ZERO)}
            stacked={stacked}
            style={secondaryStyle}
            testID="adaptive-scaffold-detail"
          >
            {stacked && hasDetail && onDismissDetail ? (
              <Pressable
                accessibilityLabel={backLabel}
                accessibilityRole="button"
                hitSlop={8}
                onPress={onDismissDetail}
                style={[styles.back, { marginTop: fullInsets.top }]}
              >
                <Text style={[styles.backText, { color: theme.control }]}>
                  {`‹ ${backLabel}`}
                </Text>
              </Pressable>
            ) : null}
            <View style={styles.fill}>{hasDetail ? detail : emptyDetail}</View>
          </Pane>
          {inspector ? (
            <Pane
              hidden={!showInspector}
              id="inspector"
              insets={inspectorFrame?.insets ?? ZERO}
              style={inspectorStyle}
              testID="adaptive-scaffold-inspector"
            >
              {inspector}
            </Pane>
          ) : null}
        </View>
      </SheetHost>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fill: { flex: 1 },
  row: { flex: 1, flexDirection: "row" },
  overlay: { position: "absolute", top: 0, bottom: 0 },
  back: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 16,
    alignSelf: "flex-start",
  },
  backText: { fontSize: 17 },
});
