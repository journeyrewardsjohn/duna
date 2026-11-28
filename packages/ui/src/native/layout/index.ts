/**
 * `@duna/ui/native/layout`: adaptive layout for the native apps (iPhone,
 * iPhone Duo, iPad). Never imported by web; never pulls DOM code.
 * Guide: docs/mobile/ADAPTIVE.md.
 */
export {
  LAYOUT_THRESHOLDS,
  heightClassFor,
  resolveLayout,
  widthClassFor,
  type FoldAxis,
  type HeightClass,
  type LayoutEdges,
  type LayoutInput,
  type LayoutMode,
  type LayoutRect,
  type PaneId,
  type PaneLayout,
  type Posture,
  type ResolvedLayout,
  type WidthClass,
} from "./resolve-layout";
export {
  localLayoutInputs,
  useLayout,
  usePane,
  useRegionLayout,
  type PaneInfo,
  type WindowLayout,
} from "./use-layout";
export { Pane } from "./Pane";
export {
  AdaptiveScaffold,
  type AdaptiveScaffoldProps,
} from "./AdaptiveScaffold";
export {
  FoldScaffold,
  type FoldScaffoldMode,
  type FoldScaffoldProps,
} from "./FoldScaffold";
export {
  AdaptiveSheet,
  sheetPresentation,
  type AdaptiveSheetPresentation,
  type AdaptiveSheetProps,
} from "./AdaptiveSheet";
export {
  NavigationChrome,
  chromeItems,
  type ChromeCenterAction,
  type ChromeTab,
  type NavigationChromeProps,
} from "./NavigationChrome";
export { layoutTheme, neutralLayoutTheme, type LayoutTheme } from "./theme";
export {
  DevicePostureProvider,
  isDevicePostureAvailable,
  useDevicePosture,
  type PostureSnapshot,
} from "@duna/expo-device-posture";
