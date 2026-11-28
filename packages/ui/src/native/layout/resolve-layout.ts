/**
 * The adaptive layout resolver for the native apps.
 *
 * Pure: no React, React Native or DOM. It lays out by the size the window
 * actually has, never by device, idiom or orientation
 * (`docs/design/tideline-4.1.1/adaptive.md`).
 *
 * Width classes reproduce the design boards:
 * - compact: width < 560
 * - expanded: width >= 740 and height >= 720
 * - regular: everything else
 */

export type Posture =
  "closed" | "half-open" | "open" | "not-foldable" | "unknown";

export type WidthClass = "compact" | "regular" | "expanded";
export type HeightClass = "compact" | "regular";
export type FoldAxis = "vertical" | "horizontal";

export interface LayoutRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface LayoutEdges {
  readonly top: number;
  readonly left: number;
  readonly bottom: number;
  readonly right: number;
}

export type PaneId = "primary" | "secondary" | "inspector" | "top" | "bottom";

export interface PaneLayout {
  readonly id: PaneId;
  /** The pane's frame in window coordinates. */
  readonly frame: LayoutRect;
  /**
   * Insets the pane's content must respect inside its frame: the window's
   * safe area on edges the pane touches, and any occlusion (the camera) that
   * overlaps it. An active fold is never inside a frame.
   */
  readonly insets: LayoutEdges;
}

export type LayoutMode =
  /** One pane; details push over it. */
  | "stack"
  /** Two or three panes side by side. */
  | "split"
  /** Duo half-open with a horizontal fold: watch on top, touch below. */
  | "tabletop";

export interface LayoutInput {
  readonly width: number;
  readonly height: number;
  /** React Native's `fontScale` (1 is the default text size). */
  readonly fontScale?: number;
  readonly posture?: Posture;
  /** The fold's reserved region in window coordinates, if the device has one. */
  readonly foldRect?: LayoutRect | null;
  /**
   * Whether the fold is an active reserved region. Defaults to true only when
   * the posture is half-open (UIKit marks the division active while folded).
   */
  readonly foldActive?: boolean;
  /** The window's safe-area insets (asymmetric on the Duo). */
  readonly safeArea?: LayoutEdges;
  /** Active occlusion regions (the camera) in window coordinates. */
  readonly occlusions?: readonly LayoutRect[];
}

export interface ResolvedLayout {
  readonly widthClass: WidthClass;
  readonly heightClass: HeightClass;
  readonly paneCount: 1 | 2 | 3;
  readonly mode: LayoutMode;
  readonly fold: {
    readonly axis: FoldAxis;
    readonly rect: LayoutRect;
    readonly active: boolean;
  } | null;
  readonly panes: readonly PaneLayout[];
  /** The font scale the pane rules used, clamped to [1, 2]. */
  readonly effectiveFontScale: number;
}

export const LAYOUT_THRESHOLDS = Object.freeze({
  /** Below this width the window is compact. */
  compactMaxWidth: 560,
  /** At or above this width (and height) the window is expanded. */
  expandedMinWidth: 740,
  expandedMinHeight: 720,
  /** Below this height the window is height-compact (phone landscape). */
  heightCompactMax: 480,
  /** An expanded window shows the inspector as a third pane from here. */
  threePaneMinWidth: 1000,
  /** The narrowest a pane may be at the default text size. */
  minPaneWidth: 300,
});

const ZERO_EDGES: LayoutEdges = Object.freeze({
  top: 0,
  left: 0,
  bottom: 0,
  right: 0,
});

export function widthClassFor(width: number, height: number): WidthClass {
  if (width < LAYOUT_THRESHOLDS.compactMaxWidth) return "compact";
  if (
    width >= LAYOUT_THRESHOLDS.expandedMinWidth &&
    height >= LAYOUT_THRESHOLDS.expandedMinHeight
  ) {
    return "expanded";
  }
  return "regular";
}

export function heightClassFor(height: number): HeightClass {
  return height < LAYOUT_THRESHOLDS.heightCompactMax ? "compact" : "regular";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function intersects(a: LayoutRect, b: LayoutRect): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

/**
 * Insets for one pane: the window safe area on each edge the pane touches,
 * raised wherever an occlusion overlaps the pane near that edge.
 */
function paneInsets(
  frame: LayoutRect,
  window: { width: number; height: number },
  safeArea: LayoutEdges,
  occlusions: readonly LayoutRect[],
): LayoutEdges {
  const epsilon = 0.5;
  let top = frame.y <= epsilon ? safeArea.top : 0;
  let left = frame.x <= epsilon ? safeArea.left : 0;
  let bottom =
    frame.y + frame.height >= window.height - epsilon ? safeArea.bottom : 0;
  let right =
    frame.x + frame.width >= window.width - epsilon ? safeArea.right : 0;
  for (const region of occlusions) {
    if (!intersects(frame, region)) continue;
    // Push content away from the nearest pane edge the occlusion covers.
    const fromTop = region.y + region.height - frame.y;
    const fromBottom = frame.y + frame.height - region.y;
    const fromLeft = region.x + region.width - frame.x;
    const fromRight = frame.x + frame.width - region.x;
    const nearest = Math.min(fromTop, fromBottom, fromLeft, fromRight);
    if (nearest === fromTop) top = Math.max(top, fromTop);
    else if (nearest === fromBottom) bottom = Math.max(bottom, fromBottom);
    else if (nearest === fromLeft) left = Math.max(left, fromLeft);
    else right = Math.max(right, fromRight);
  }
  return { top, left, bottom, right };
}

function rect(x: number, y: number, width: number, height: number): LayoutRect {
  return { x, y, width: Math.max(0, width), height: Math.max(0, height) };
}

/**
 * Resolves the width and height classes, pane count, fold and per-pane
 * insets for one window.
 */
export function resolveLayout(input: LayoutInput): ResolvedLayout {
  const width = Math.max(0, input.width);
  const height = Math.max(0, input.height);
  const posture = input.posture ?? "unknown";
  const effectiveFontScale = clamp(input.fontScale ?? 1, 1, 2);
  const safeArea = input.safeArea ?? ZERO_EDGES;
  const occlusions = input.occlusions ?? [];
  const window = { width, height };
  const widthClass = widthClassFor(width, height);
  const heightClass = heightClassFor(height);

  // A closed Duo shows only the outer display; no fold applies there.
  const foldRect =
    posture === "closed" || !input.foldRect ? null : input.foldRect;
  const fold = foldRect
    ? {
        axis: (foldRect.height >= foldRect.width
          ? "vertical"
          : "horizontal") as FoldAxis,
        rect: foldRect,
        active: input.foldActive ?? posture === "half-open",
      }
    : null;

  const panesFrom = (frames: [PaneId, LayoutRect][]): PaneLayout[] =>
    frames.map(([id, frame]) => ({
      id,
      frame,
      insets: paneInsets(frame, window, safeArea, occlusions),
    }));

  // Half-open with a horizontal fold: watch on top, touch below.
  if (fold && fold.active && fold.axis === "horizontal") {
    const top = rect(0, 0, width, fold.rect.y);
    const bottomY = fold.rect.y + fold.rect.height;
    const bottom = rect(0, bottomY, width, height - bottomY);
    return {
      widthClass,
      heightClass,
      paneCount: 2,
      mode: "tabletop",
      fold,
      panes: panesFrom([
        ["top", top],
        ["bottom", bottom],
      ]),
      effectiveFontScale,
    };
  }

  // How many panes fit at this text size.
  const minPane = LAYOUT_THRESHOLDS.minPaneWidth * effectiveFontScale;
  const classMax: 1 | 2 | 3 =
    widthClass === "compact"
      ? 1
      : widthClass === "expanded" &&
          width >= LAYOUT_THRESHOLDS.threePaneMinWidth
        ? 3
        : 2;
  const fitting = Math.max(1, Math.floor(width / minPane));
  let paneCount = Math.min(classMax, fitting) as 1 | 2 | 3;

  // Never let one pane straddle an active vertical fold.
  const verticalFold = fold && fold.axis === "vertical" ? fold : null;
  if (verticalFold?.active && paneCount < 2) paneCount = 2;

  if (paneCount === 1) {
    return {
      widthClass,
      heightClass,
      paneCount,
      mode: "stack",
      fold,
      panes: panesFrom([["primary", rect(0, 0, width, height)]]),
      effectiveFontScale,
    };
  }

  if (verticalFold && paneCount === 2) {
    // Split at the fold. While the fold is active its band (with UIKit's
    // margins) belongs to neither pane; when flat, the seam is its centre.
    const leftEnd = verticalFold.active
      ? verticalFold.rect.x
      : verticalFold.rect.x + verticalFold.rect.width / 2;
    const rightStart = verticalFold.active
      ? verticalFold.rect.x + verticalFold.rect.width
      : leftEnd;
    return {
      widthClass,
      heightClass,
      paneCount,
      mode: "split",
      fold,
      panes: panesFrom([
        ["primary", rect(0, 0, leftEnd, height)],
        ["secondary", rect(rightStart, 0, width - rightStart, height)],
      ]),
      effectiveFontScale,
    };
  }

  const primaryWidth = Math.round(
    clamp(
      width * (paneCount === 3 ? 0.3 : 0.4),
      minPane,
      420 * effectiveFontScale,
    ),
  );
  if (paneCount === 2) {
    return {
      widthClass,
      heightClass,
      paneCount,
      mode: "split",
      fold,
      panes: panesFrom([
        ["primary", rect(0, 0, primaryWidth, height)],
        ["secondary", rect(primaryWidth, 0, width - primaryWidth, height)],
      ]),
      effectiveFontScale,
    };
  }
  const inspectorWidth = Math.round(clamp(width * 0.28, minPane, 380));
  const secondaryWidth = width - primaryWidth - inspectorWidth;
  return {
    widthClass,
    heightClass,
    paneCount,
    mode: "split",
    fold,
    panes: panesFrom([
      ["primary", rect(0, 0, primaryWidth, height)],
      ["secondary", rect(primaryWidth, 0, secondaryWidth, height)],
      [
        "inspector",
        rect(primaryWidth + secondaryWidth, 0, inspectorWidth, height),
      ],
    ]),
    effectiveFontScale,
  };
}
