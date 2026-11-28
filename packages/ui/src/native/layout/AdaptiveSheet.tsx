import { useEffect, useId, type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Pane } from "./Pane";
import type { LayoutEdges, WidthClass } from "./resolve-layout";
import { useSheetHost } from "./sheet-host";
import { layoutTheme, type LayoutTheme } from "./theme";
import { useLayout } from "./use-layout";

export type AdaptiveSheetPresentation =
  /** Compact: a sheet from the bottom edge. */
  | "bottom"
  /** Regular: fills the secondary pane of the nearest AdaptiveScaffold. */
  | "pane"
  /** Expanded: a panel on the trailing edge (search, filters). */
  | "side"
  /** Expanded: a centred sheet (pay, confirmations). */
  | "centered";

export interface AdaptiveSheetProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly children: ReactNode;
  /**
   * What the sheet is for in an expanded window: "panel" for search and
   * filters (side panel), "dialog" for pay and confirmations (centred). In a
   * regular window "dialog" also stays a modal sheet, as the design asks
   * ("pay stays a sheet").
   */
  readonly kind?: "panel" | "dialog";
  readonly accessibilityLabel?: string;
  readonly theme?: Partial<LayoutTheme>;
  readonly contentStyle?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

/** Which presentation a sheet uses for a width class. Pure; unit-tested. */
export function sheetPresentation(
  widthClass: WidthClass,
  kind: "panel" | "dialog",
  hasPaneHost: boolean,
): AdaptiveSheetPresentation {
  if (widthClass === "compact") return "bottom";
  if (widthClass === "expanded") return kind === "dialog" ? "centered" : "side";
  if (kind === "panel" && hasPaneHost) return "pane";
  return kind === "dialog" ? "centered" : "bottom";
}

const ZERO: LayoutEdges = { top: 0, left: 0, bottom: 0, right: 0 };

/**
 * One sheet API for every window size. Feature code uses this instead of
 * `<Modal presentationStyle="pageSheet">`, which turns into a stretched form
 * sheet on iPad and the open Duo.
 */
export function AdaptiveSheet({
  accessibilityLabel,
  children,
  contentStyle,
  kind = "panel",
  onClose,
  testID,
  theme: themeOverrides,
  visible,
}: AdaptiveSheetProps) {
  const theme = layoutTheme(themeOverrides);
  const layout = useLayout();
  const host = useSheetHost();
  const key = useId();
  const presentation = sheetPresentation(
    layout.widthClass,
    kind,
    Boolean(host),
  );
  const inPane = presentation === "pane" && host !== null;

  const body = (
    <Pane
      id="secondary"
      insets={inPane ? ZERO : layout.safeArea}
      style={[styles.paneBody, { backgroundColor: theme.sheet }, contentStyle]}
      testID={testID}
    >
      {children}
    </Pane>
  );

  useEffect(() => {
    if (!host || !inPane) return;
    if (visible) host.mount(key, body);
    else host.unmount(key);
  });
  useEffect(() => {
    if (!host) return;
    return () => host.unmount(key);
  }, [host, key]);

  if (inPane) return null;

  const { safeArea, window } = layout;
  let frame: ViewStyle;
  if (presentation === "side") {
    frame = {
      position: "absolute",
      top: safeArea.top + 12,
      bottom: safeArea.bottom + 12,
      right: safeArea.right + 12,
      width: Math.min(400, window.width * 0.4),
      borderRadius: 24,
    };
  } else if (presentation === "centered") {
    frame = {
      alignSelf: "center",
      width: Math.min(560, window.width - 48),
      maxHeight: window.height - safeArea.top - safeArea.bottom - 48,
      borderRadius: 24,
    };
  } else {
    frame = {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      maxHeight: window.height - safeArea.top - 12,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingBottom: safeArea.bottom,
    };
  }

  return (
    <Modal
      animationType={presentation === "bottom" ? "slide" : "fade"}
      onRequestClose={onClose}
      supportedOrientations={[
        "portrait",
        "portrait-upside-down",
        "landscape-left",
        "landscape-right",
      ]}
      transparent
      visible={visible}
    >
      <KeyboardAvoidingView
        behavior="padding"
        style={[
          styles.backdrop,
          presentation === "centered" ? styles.centered : null,
        ]}
      >
        <Pressable
          accessibilityLabel="Close"
          accessibilityRole="button"
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.scrim }]}
        />
        <View
          accessibilityLabel={accessibilityLabel}
          accessibilityViewIsModal
          style={[frame, styles.sheet, { backgroundColor: theme.sheet }]}
        >
          {presentation === "bottom" ? (
            <View style={styles.grabberRow}>
              <View
                style={[styles.grabber, { backgroundColor: theme.separator }]}
              />
            </View>
          ) : null}
          <Pane
            id="secondary"
            insets={ZERO}
            style={[styles.modalBody, contentStyle]}
            testID={testID}
          >
            {children}
          </Pane>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  centered: { justifyContent: "center" },
  sheet: { overflow: "hidden" },
  paneBody: { flex: 1 },
  modalBody: { flexShrink: 1 },
  grabberRow: { alignItems: "center", paddingTop: 8, paddingBottom: 4 },
  grabber: { width: 36, height: 5, borderRadius: 3 },
});
