import {
  useDevicePosture,
  type PostureSnapshot,
} from "@duna/expo-device-posture";
import {
  createContext,
  type ComponentRef,
  type RefObject,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  useWindowDimensions,
  type LayoutChangeEvent,
  type View,
} from "react-native";

type ViewRef = ComponentRef<typeof View>;
import {
  resolveLayout,
  type LayoutEdges,
  type LayoutRect,
  type PaneId,
  type ResolvedLayout,
} from "./resolve-layout";

export interface WindowLayout extends ResolvedLayout {
  readonly window: { readonly width: number; readonly height: number };
  readonly fontScale: number;
  readonly posture: PostureSnapshot;
  readonly safeArea: LayoutEdges;
}

const ZERO: LayoutEdges = { top: 0, left: 0, bottom: 0, right: 0 };

/**
 * The window's layout: width and height classes, panes, fold and insets.
 * Built on `useWindowDimensions` (it updates when the Duo opens or closes and
 * when an iPad window resizes) and the device-posture module. Never reads the
 * screen, the idiom or the orientation.
 */
export function useLayout(): WindowLayout {
  const { width, height, fontScale } = useWindowDimensions();
  const posture = useDevicePosture();
  return useMemo(() => {
    const safeArea = posture.safeArea ?? ZERO;
    const resolved = resolveLayout({
      width,
      height,
      fontScale,
      posture: posture.posture,
      foldRect: posture.fold?.rect ?? null,
      foldActive: posture.fold?.active,
      safeArea,
      occlusions: posture.occlusions,
    });
    return {
      ...resolved,
      window: { width, height },
      fontScale,
      posture,
      safeArea,
    };
  }, [fontScale, height, posture, width]);
}

/** Converts window-coordinate inputs into a region's own coordinates. */
export function localLayoutInputs(
  frame: LayoutRect,
  layout: WindowLayout,
): {
  readonly foldRect: LayoutRect | null;
  readonly safeArea: LayoutEdges;
  readonly occlusions: readonly LayoutRect[];
} {
  const shift = (rect: LayoutRect): LayoutRect | null => {
    const x = Math.max(rect.x, frame.x);
    const y = Math.max(rect.y, frame.y);
    const right = Math.min(rect.x + rect.width, frame.x + frame.width);
    const bottom = Math.min(rect.y + rect.height, frame.y + frame.height);
    if (right <= x || bottom <= y) return null;
    return {
      x: x - frame.x,
      y: y - frame.y,
      width: right - x,
      height: bottom - y,
    };
  };
  const { window, safeArea } = layout;
  return {
    foldRect: layout.posture.fold ? shift(layout.posture.fold.rect) : null,
    // Only the part of the window's safe area that reaches into this region.
    safeArea: {
      top: Math.max(0, safeArea.top - frame.y),
      left: Math.max(0, safeArea.left - frame.x),
      bottom: Math.max(
        0,
        safeArea.bottom - (window.height - (frame.y + frame.height)),
      ),
      right: Math.max(
        0,
        safeArea.right - (window.width - (frame.x + frame.width)),
      ),
    },
    occlusions: layout.posture.occlusions
      .map(shift)
      .filter((rect): rect is LayoutRect => rect !== null),
  };
}

/**
 * Lays out a region (a scaffold) by its own measured frame rather than the
 * window: a scaffold beside a sidebar or below a header is narrower than the
 * window, and the fold and safe area are clipped to it.
 */
export function useRegionLayout(): {
  readonly layout: ResolvedLayout;
  readonly windowLayout: WindowLayout;
  readonly ref: RefObject<ViewRef | null>;
  readonly onLayout: (event: LayoutChangeEvent) => void;
} {
  const windowLayout = useLayout();
  const ref = useRef<ViewRef | null>(null);
  const [frame, setFrame] = useState<LayoutRect | null>(null);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    const node = ref.current;
    if (node && typeof node.measureInWindow === "function") {
      node.measureInWindow(
        (
          x: number,
          y: number,
          measuredWidth: number,
          measuredHeight: number,
        ) => {
          setFrame((current) => {
            const next = {
              x,
              y,
              width: measuredWidth || width,
              height: measuredHeight || height,
            };
            return current &&
              current.x === next.x &&
              current.y === next.y &&
              current.width === next.width &&
              current.height === next.height
              ? current
              : next;
          });
        },
      );
    } else {
      setFrame({ x: 0, y: 0, width, height });
    }
  }, []);
  const layout = useMemo(() => {
    const region = frame ?? {
      x: 0,
      y: 0,
      width: windowLayout.window.width,
      height: windowLayout.window.height,
    };
    const local = localLayoutInputs(region, windowLayout);
    return resolveLayout({
      width: region.width,
      height: region.height,
      fontScale: windowLayout.fontScale,
      posture: windowLayout.posture.posture,
      foldRect: local.foldRect,
      foldActive: windowLayout.posture.fold?.active,
      safeArea: local.safeArea,
      occlusions: local.occlusions,
    });
  }, [frame, windowLayout]);
  return { layout, windowLayout, ref, onLayout };
}

export interface PaneInfo {
  readonly id: PaneId;
  /** The pane's measured size; 0 until the first layout pass. */
  readonly width: number;
  readonly height: number;
  /** Safe-area and occlusion insets this pane's content must respect. */
  readonly insets: LayoutEdges;
  /** True when this pane is shown alone as a pushed detail (compact). */
  readonly stacked: boolean;
}

const PaneContext = createContext<PaneInfo | null>(null);

export function PaneProvider({
  children,
  value,
}: {
  readonly children: ReactNode;
  readonly value: PaneInfo;
}) {
  return <PaneContext.Provider value={value}>{children}</PaneContext.Provider>;
}

/**
 * The size of the pane this component is in. Feature code sizes itself from
 * this, never from the window: a pane is narrower than the window.
 */
export function usePane(): PaneInfo {
  const pane = useContext(PaneContext);
  const { width, height } = useWindowDimensions();
  return (
    pane ?? {
      id: "primary",
      width,
      height,
      insets: ZERO,
      stacked: false,
    }
  );
}
