import { useMemo, useState, type ReactNode } from "react";
import {
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { PaneProvider, type PaneInfo } from "./use-layout";
import type { LayoutEdges, PaneId } from "./resolve-layout";

/**
 * One pane: measures itself and gives its children their own size, so a
 * screen inside a pane lays out for the pane, not the window. Hidden panes
 * stay mounted (`display: "none"`) so their state survives.
 */
export function Pane({
  children,
  hidden = false,
  id,
  insets,
  stacked = false,
  style,
  testID,
}: {
  readonly children: ReactNode;
  readonly hidden?: boolean;
  readonly id: PaneId;
  readonly insets: LayoutEdges;
  readonly stacked?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize((current) =>
      current.width === width && current.height === height
        ? current
        : { width, height },
    );
  };
  const value: PaneInfo = useMemo(
    () => ({ id, width: size.width, height: size.height, insets, stacked }),
    [id, insets, size.height, size.width, stacked],
  );
  return (
    <View
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? "no-hide-descendants" : "auto"}
      onLayout={onLayout}
      style={[
        { overflow: "hidden" },
        style,
        hidden ? { display: "none" } : null,
      ]}
      testID={testID}
    >
      <PaneProvider value={value}>{children}</PaneProvider>
    </View>
  );
}
