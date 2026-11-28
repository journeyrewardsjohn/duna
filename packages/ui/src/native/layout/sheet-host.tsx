import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { StyleSheet, View } from "react-native";

interface SheetHostValue {
  readonly mount: (key: string, node: ReactNode) => void;
  readonly unmount: (key: string) => void;
}

const SheetHostContext = createContext<SheetHostValue | null>(null);

/** The pane that hosts pane-sized sheets in a regular layout, if any. */
export function useSheetHost(): SheetHostValue | null {
  return useContext(SheetHostContext);
}

/**
 * Collects sheets that should open inside the secondary pane and renders them
 * above that pane's content. AdaptiveScaffold places one in its secondary
 * pane whenever two or more panes are visible.
 */
export function SheetHost({
  children,
  enabled,
  overlay,
}: {
  readonly children: ReactNode;
  /** When false the host is withdrawn and sheets fall back to modals. */
  readonly enabled: boolean;
  /** Where the overlay renders; the scaffold passes it to the secondary pane. */
  readonly overlay: (layer: ReactNode) => ReactNode;
}) {
  const [sheets, setSheets] = useState<readonly [string, ReactNode][]>([]);
  const mount = useCallback((key: string, node: ReactNode) => {
    setSheets((current) => {
      const index = current.findIndex(([candidate]) => candidate === key);
      if (index < 0) return [...current, [key, node]];
      const next = current.slice();
      next[index] = [key, node];
      return next;
    });
  }, []);
  const unmount = useCallback((key: string) => {
    setSheets((current) => current.filter(([candidate]) => candidate !== key));
  }, []);
  const value = useMemo(
    () => (enabled ? { mount, unmount } : null),
    [enabled, mount, unmount],
  );
  const layer =
    enabled && sheets.length > 0 ? (
      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        {sheets.map(([key, node]) => (
          <View
            key={key}
            pointerEvents="box-none"
            style={StyleSheet.absoluteFill}
          >
            {node}
          </View>
        ))}
      </View>
    ) : null;
  return (
    <SheetHostContext.Provider value={value}>
      {children}
      {overlay(layer)}
    </SheetHostContext.Provider>
  );
}
