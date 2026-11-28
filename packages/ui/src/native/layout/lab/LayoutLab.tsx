import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { AdaptiveScaffold } from "../AdaptiveScaffold";
import { AdaptiveSheet } from "../AdaptiveSheet";
import { FoldScaffold } from "../FoldScaffold";
import {
  NavigationChrome,
  type ChromeTab,
  type NavigationChromeProps,
} from "../NavigationChrome";
import type { LayoutRect } from "../resolve-layout";
import { useLayout, usePane, type WindowLayout } from "../use-layout";
import { neutralLayoutTheme } from "../theme";

/**
 * Development-only Layout lab. Each app opens it from its preview build
 * (never from production navigation) to verify the adaptive layer on the
 * simulator matrix: live resolver output, panes and the fold drawn to scale,
 * the system tab bar, list → detail continuity, the half-open mode and the
 * adaptive sheet. Styling is deliberately plain.
 */

export interface LayoutLabTab {
  readonly key: string;
  readonly title: string;
  readonly systemImage: string;
}

export interface LayoutLabProps {
  /** The app's real tab names and symbols; the lab fills them with demos. */
  readonly tabs: readonly LayoutLabTab[];
  readonly centerAction?: {
    readonly title: string;
    readonly systemImage: string;
  };
  readonly onClose: () => void;
  readonly appName: string;
  /** The tab to open first (simulator runs without touch). */
  readonly initialTab?: string;
  /**
   * Selects a court and types a note by itself, so continuity can be shown on
   * a simulator without touch input. The detail shows its mount number.
   */
  readonly scripted?: boolean;
  /** Renders a different tab-bar implementation (the tab-bar spike). */
  readonly renderChrome?: (props: NavigationChromeProps) => ReactNode;
}

const ink = neutralLayoutTheme.control;
const hairline = neutralLayoutTheme.separator;

function rectText(rect: LayoutRect | null | undefined) {
  if (!rect) return "none";
  return `${round(rect.x)},${round(rect.y)} ${round(rect.width)}×${round(rect.height)}`;
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function edgesText(
  edges: { top: number; left: number; bottom: number; right: number } | null,
) {
  if (!edges) return "none";
  return `t${round(edges.top)} l${round(edges.left)} b${round(edges.bottom)} r${round(edges.right)}`;
}

/** The numbers the lab shows, also logged to Metro for evidence. */
export function layoutReport(layout: WindowLayout) {
  return {
    window: `${round(layout.window.width)}×${round(layout.window.height)}`,
    fontScale: round(layout.fontScale),
    widthClass: layout.widthClass,
    heightClass: layout.heightClass,
    paneCount: layout.paneCount,
    mode: layout.mode,
    posture: layout.posture.posture,
    regionsAvailable: layout.posture.isAvailable,
    hingeAngle: layout.posture.hingeAngle,
    fold: layout.posture.fold
      ? `${layout.posture.fold.axis} ${layout.posture.fold.active ? "active" : "inactive"} ${rectText(layout.posture.fold.rect)} margins ${edgesText(layout.posture.fold.margins)}`
      : "none",
    occlusions: layout.posture.occlusions.map((region) => rectText(region)),
    safeArea: edgesText(layout.posture.safeArea),
    panes: layout.panes.map(
      (pane) =>
        `${pane.id} ${rectText(pane.frame)} insets ${edgesText(pane.insets)}`,
    ),
  };
}

function Diagram({ layout }: { readonly layout: WindowLayout }) {
  const pane = usePane();
  const available = Math.max(160, (pane.width || layout.window.width) - 32);
  const scale = Math.min(
    available / layout.window.width,
    220 / layout.window.height,
  );
  const box = (rect: LayoutRect) => ({
    left: rect.x * scale,
    top: rect.y * scale,
    width: rect.width * scale,
    height: rect.height * scale,
  });
  return (
    <View
      accessibilityLabel="Window diagram"
      style={[
        styles.diagram,
        {
          width: layout.window.width * scale,
          height: layout.window.height * scale,
        },
      ]}
    >
      {layout.panes.map((p) => (
        <View key={p.id} style={[styles.diagramPane, box(p.frame)]}>
          <Text style={styles.diagramLabel}>{p.id}</Text>
        </View>
      ))}
      {layout.posture.fold ? (
        <View
          style={[
            styles.diagramFold,
            box(layout.posture.fold.rect),
            { opacity: layout.posture.fold.active ? 0.8 : 0.3 },
          ]}
        />
      ) : null}
      {layout.posture.occlusions.map((region, index) => (
        <View
          key={`occ-${index}`}
          style={[styles.diagramOcclusion, box(region)]}
        />
      ))}
    </View>
  );
}

function Readout({
  onClose,
  appName,
}: {
  readonly onClose: () => void;
  readonly appName: string;
}) {
  const layout = useLayout();
  const tabInsets = useSafeAreaInsets();
  const report = useMemo(
    () => ({
      ...layoutReport(layout),
      // The tab's own safe area: includes the system tab bar, vertical bar or sidebar.
      tabInsets: edgesText(tabInsets),
    }),
    [layout, tabInsets],
  );
  useEffect(() => {
    console.log(`[layout-lab] ${appName} ${JSON.stringify(report)}`);
  }, [appName, report]);
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="never"
      contentContainerStyle={[
        styles.readout,
        {
          paddingTop: tabInsets.top + 12,
          paddingLeft: tabInsets.left + 16,
          paddingRight: tabInsets.right + 16,
          paddingBottom: tabInsets.bottom + 24,
        },
      ]}
      testID="layout-lab-readout"
    >
      <View style={styles.row}>
        <Text accessibilityRole="header" style={styles.title}>
          Layout lab
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          style={styles.button}
        >
          <Text style={styles.buttonText}>Close lab</Text>
        </Pressable>
      </View>
      <Diagram layout={layout} />
      {Object.entries(report).map(([key, value]) => (
        <Text key={key} selectable style={styles.mono}>
          {`${key}: ${Array.isArray(value) ? value.join("\n  ") || "none" : String(value)}`}
        </Text>
      ))}
    </ScrollView>
  );
}

const ITEMS = Array.from({ length: 14 }, (_, index) => ({
  id: `court-${index + 1}`,
  title: `Court ${index + 1}`,
}));

/** Counts detail mounts across the lab's lifetime: a remount shows as 2×. */
const detailMounts = { count: 0 };

function clock() {
  return new Date().toTimeString().slice(0, 8);
}

function DetailForm({
  scripted,
  title,
}: {
  readonly scripted: boolean;
  readonly title: string;
}) {
  const [note, setNote] = useState("");
  const [mount] = useState(() => {
    detailMounts.count += 1;
    return { index: detailMounts.count, at: clock() };
  });
  const pane = usePane();
  useEffect(() => {
    if (!scripted) return;
    // Scripted runs (no keyboard on the simulator): type a note after mount.
    const timer = setTimeout(
      () => setNote(`Serve to zone 1 · ${clock()}`),
      800,
    );
    return () => clearTimeout(timer);
  }, [scripted]);
  useEffect(() => {
    console.log(
      `[layout-lab] detail ${title} mount #${mount.index} at ${mount.at} pane ${round(pane.width)}x${round(pane.height)}${pane.stacked ? " stacked" : ""} note "${note}"`,
    );
  }, [mount, note, pane.height, pane.stacked, pane.width, title]);
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="never"
      contentContainerStyle={[
        styles.detail,
        { paddingTop: pane.insets.top + 12 },
      ]}
    >
      <Text style={styles.title}>{title}</Text>
      <Text
        style={styles.mono}
      >{`pane ${round(pane.width)}×${round(pane.height)}${pane.stacked ? " (stacked)" : ""}`}</Text>
      <Text style={styles.body}>
        Type a note, then open, half-open or close the Duo:
      </Text>
      <TextInput
        accessibilityLabel="Note"
        onChangeText={setNote}
        placeholder="Note"
        style={styles.input}
        testID="layout-lab-note"
        value={note}
      />
      <Text style={styles.mono}>{`kept: "${note}"`}</Text>
      <Text
        style={styles.mono}
      >{`mounted #${mount.index} at ${mount.at} (a remount would show a new number)`}</Text>
    </ScrollView>
  );
}

function ListDetail({ scripted }: { readonly scripted: boolean }) {
  const [selected, setSelected] = useState<string | null>(
    scripted ? "court-3" : null,
  );
  const item = ITEMS.find((candidate) => candidate.id === selected);
  return (
    <AdaptiveScaffold
      detail={
        item ? (
          <DetailForm key={item.id} scripted={scripted} title={item.title} />
        ) : null
      }
      emptyDetail={
        <View style={styles.empty}>
          <Text style={styles.body}>Select a court</Text>
        </View>
      }
      inspector={
        <View style={styles.detail}>
          <Text style={styles.title}>Inspector</Text>
          <Text style={styles.body}>Conditions, summary or notes.</Text>
        </View>
      }
      onDismissDetail={() => setSelected(null)}
      primary={<List selected={selected} onSelect={setSelected} />}
      testID="layout-lab-scaffold"
    />
  );
}

function List({
  onSelect,
  selected,
}: {
  readonly onSelect: (id: string) => void;
  readonly selected: string | null;
}) {
  const pane = usePane();
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="never"
      contentContainerStyle={{
        paddingTop: pane.insets.top,
        paddingBottom: 120,
      }}
    >
      {ITEMS.map((item) => (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: item.id === selected }}
          key={item.id}
          onPress={() => onSelect(item.id)}
          style={[
            styles.listRow,
            item.id === selected ? styles.listRowSelected : null,
          ]}
        >
          <Text style={styles.body}>{item.title}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function Watching() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const pane = usePane();
  return (
    <View style={[styles.watch, { paddingTop: pane.insets.top }]}>
      <Text style={styles.score}>21 – 19</Text>
      <Text
        style={styles.mono}
      >{`running ${seconds}s (resets only on remount)`}</Text>
      <Text
        style={styles.mono}
      >{`${pane.id} ${round(pane.width)}×${round(pane.height)}`}</Text>
    </View>
  );
}

function Controls() {
  const [points, setPoints] = useState(0);
  const pane = usePane();
  return (
    <View style={[styles.controls, { paddingBottom: pane.insets.bottom + 56 }]}>
      <Text
        style={styles.mono}
      >{`${pane.id} ${round(pane.width)}×${round(pane.height)} · points ${points}`}</Text>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          onPress={() => setPoints((p) => p + 1)}
          style={styles.bigButton}
        >
          <Text style={styles.buttonText}>Point us</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => setPoints((p) => p - 1)}
          style={styles.bigButton}
        >
          <Text style={styles.buttonText}>Undo</Text>
        </Pressable>
      </View>
    </View>
  );
}

function SheetDemo({
  dialogOpen,
  setDialogOpen,
}: {
  readonly dialogOpen: boolean;
  readonly setDialogOpen: (open: boolean) => void;
}) {
  const [panelOpen, setPanelOpen] = useState(false);
  const layout = useLayout();
  return (
    <AdaptiveScaffold
      detail={
        <View style={styles.detail}>
          <Text style={styles.title}>Detail pane</Text>
          <Text style={styles.body}>
            A regular window opens the filters sheet over this pane.
          </Text>
        </View>
      }
      primary={
        <View style={[styles.detail, { paddingTop: layout.safeArea.top + 12 }]}>
          <Text style={styles.title}>Sheets</Text>
          <Text style={styles.mono}>{`width class ${layout.widthClass}`}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setPanelOpen(true)}
            style={styles.button}
          >
            <Text style={styles.buttonText}>Filters (panel)</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => setDialogOpen(true)}
            style={styles.button}
          >
            <Text style={styles.buttonText}>Pay (dialog)</Text>
          </Pressable>
          <AdaptiveSheet
            accessibilityLabel="Filters"
            onClose={() => setPanelOpen(false)}
            visible={panelOpen}
          >
            <SheetBody label="Filters" onClose={() => setPanelOpen(false)} />
          </AdaptiveSheet>
          <AdaptiveSheet
            accessibilityLabel="Pay"
            kind="dialog"
            onClose={() => setDialogOpen(false)}
            visible={dialogOpen}
          >
            <SheetBody label="Pay" onClose={() => setDialogOpen(false)} />
          </AdaptiveSheet>
        </View>
      }
    />
  );
}

function SheetBody({
  label,
  onClose,
}: {
  readonly label: string;
  readonly onClose: () => void;
}) {
  const pane = usePane();
  return (
    <View style={styles.detail}>
      <Text style={styles.title}>{label}</Text>
      <Text
        style={styles.mono}
      >{`sheet ${round(pane.width)}×${round(pane.height)}`}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onClose}
        style={styles.button}
      >
        <Text style={styles.buttonText}>Close</Text>
      </Pressable>
    </View>
  );
}

export function LayoutLab({
  appName,
  centerAction,
  onClose,
  initialTab,
  renderChrome,
  scripted = false,
  tabs,
}: LayoutLabProps) {
  const [selected, setSelected] = useState(
    tabs.find((tab) => tab.key === initialTab)?.key ?? tabs[0]?.key ?? "",
  );
  const [chromeHidden, setChromeHidden] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  // Screens inside the system tabs take the tab's safe area (bar, vertical
  // bar or sidebar included); the scaffolds then lay out the remaining region.
  const framed = (key: string, node: ReactNode) => (
    <SafeAreaView
      edges={["top", "left", "right", "bottom"]}
      key={key}
      style={styles.fill}
    >
      {node}
    </SafeAreaView>
  );
  const demos = [
    <Readout appName={appName} key="readout" onClose={onClose} />,
    framed("list", <ListDetail scripted={scripted} />),
    <FoldScaffold
      key="fold"
      onTabletopChange={setChromeHidden}
      primary={<Watching />}
      secondary={<Controls />}
      testID="layout-lab-fold"
    />,
    framed(
      "sheet",
      <SheetDemo dialogOpen={dialogOpen} setDialogOpen={setDialogOpen} />,
    ),
  ];
  const chromeTabs: ChromeTab[] = tabs.map((tab, index) => ({
    ...tab,
    badge: index === tabs.length - 1 ? "3" : undefined,
    content: demos[index % demos.length],
  }));
  const chromeProps: NavigationChromeProps = {
    centerAction: centerAction
      ? {
          ...centerAction,
          onPress: () => {
            setSelected(tabs[3]?.key ?? selected);
            setDialogOpen(true);
          },
        }
      : undefined,
    hidden: chromeHidden,
    onSelect: setSelected,
    selected,
    tabs: chromeTabs,
  };
  return (
    <View style={styles.lab} testID="layout-lab">
      {renderChrome ? (
        renderChrome(chromeProps)
      ) : (
        <NavigationChrome {...chromeProps} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  lab: {
    ...StyleSheet.absoluteFill,
    backgroundColor: neutralLayoutTheme.sheet,
  },
  readout: { paddingHorizontal: 16, gap: 6 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  title: { fontSize: 22, fontWeight: "600", color: ink },
  body: { fontSize: 16, color: ink },
  mono: { fontSize: 13, color: ink, fontFamily: "Menlo" },
  button: {
    minHeight: 44,
    paddingHorizontal: 14,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: hairline,
    borderRadius: 10,
    alignSelf: "flex-start",
  },
  bigButton: {
    minHeight: 64,
    minWidth: 120,
    paddingHorizontal: 16,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: hairline,
    borderRadius: 12,
  },
  buttonText: { fontSize: 16, fontWeight: "600", color: ink },
  diagram: { borderWidth: 1, borderColor: ink, marginVertical: 8 },
  diagramPane: {
    position: "absolute",
    borderWidth: 1,
    borderColor: hairline,
    padding: 2,
  },
  diagramLabel: { fontSize: 12, color: ink },
  diagramFold: { position: "absolute", backgroundColor: ink },
  diagramOcclusion: {
    position: "absolute",
    borderWidth: 2,
    borderColor: ink,
    borderStyle: "dashed",
  },
  detail: { padding: 16, gap: 10 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center" },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: hairline,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 16,
    color: ink,
  },
  listRow: {
    minHeight: 52,
    justifyContent: "center",
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: hairline,
  },
  listRowSelected: { backgroundColor: hairline },
  watch: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  score: {
    fontSize: 64,
    fontWeight: "600",
    color: ink,
    fontVariant: ["tabular-nums"],
  },
  controls: { padding: 16, gap: 12, alignItems: "center" },
});
