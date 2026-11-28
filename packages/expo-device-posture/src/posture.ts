/**
 * Pure posture logic for the iPhone Duo (and any device without a fold).
 *
 * Nothing here imports React Native or Expo, so it runs in unit tests and on
 * every platform. The native view reports UIKit's reserved regions; the hinge
 * status and angle come from `expo-hinge`. When either source is missing this
 * module derives nothing: no aspect-ratio or device-name guesses.
 */

export type Posture =
  /** Folded shut: the app is on the outer display. */
  | "closed"
  /** Partially open (propped like a laptop or held like a book). */
  | "half-open"
  /** Opened flat: the inner display is one surface. */
  | "open"
  /** The hinge API is available and reports no hinge (iPhone, iPad). */
  | "not-foldable"
  /** The hinge API is not available on this OS or platform. */
  | "unknown";

export type HingeStatus = "closed" | "partiallyOpen" | "fullyOpen" | "unknown";

export interface HingeReading {
  /** Degrees, 0 closed to 180 flat. For effects only, never for layout. */
  readonly angle: number;
  readonly status: HingeStatus;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Edges {
  readonly top: number;
  readonly left: number;
  readonly bottom: number;
  readonly right: number;
}

export interface ReservedRegion extends Rect {
  readonly id: string;
  /** Margins UIKit includes in the frame around the reserved rect. */
  readonly margins: Edges;
  /** Division regions are active only while the device is folded. */
  readonly active: boolean;
}

/** What the native observer view sends, after validation. */
export interface NativeRegions {
  readonly available: boolean;
  readonly hingeStatus: HingeStatus | "none" | "unavailable";
  readonly window: { readonly width: number; readonly height: number };
  readonly safeArea: Edges;
  readonly division: readonly ReservedRegion[];
  readonly occlusion: readonly ReservedRegion[];
}

export type FoldAxis =
  /** The fold runs top to bottom (open like a book): panes sit left and right. */
  | "vertical"
  /** The fold runs left to right (propped half-open): regions sit above and below. */
  | "horizontal";

export interface Fold {
  readonly axis: FoldAxis;
  /** Window coordinates, including UIKit's margins. */
  readonly rect: Rect;
  readonly margins: Edges;
  /** Only an active fold is a reserved region that content must avoid. */
  readonly active: boolean;
}

export interface PostureSnapshot {
  /** True when this build and OS can report reserved regions (iOS 27.1+). */
  readonly isAvailable: boolean;
  readonly posture: Posture;
  /**
   * The hinge angle when the posture last changed, from `expo-hinge`. It is
   * not live: for effects, read `useHinge()` from `expo-hinge` directly.
   */
  readonly hingeAngle: number | null;
  readonly fold: Fold | null;
  /** Active occlusion regions (the camera), window coordinates. */
  readonly occlusions: readonly ReservedRegion[];
  /** The window's own safe-area insets as UIKit reports them. */
  readonly safeArea: Edges | null;
  readonly window: { readonly width: number; readonly height: number } | null;
}

export const UNAVAILABLE_POSTURE: PostureSnapshot = Object.freeze({
  isAvailable: false,
  posture: "unknown",
  hingeAngle: null,
  fold: null,
  occlusions: [],
  safeArea: null,
  window: null,
});

const HINGE_STATUSES: readonly string[] = [
  "closed",
  "partiallyOpen",
  "fullyOpen",
  "unknown",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseEdges(value: unknown): Edges | null {
  if (!isRecord(value)) return null;
  const top = finite(value.top);
  const left = finite(value.left);
  const bottom = finite(value.bottom);
  const right = finite(value.right);
  if (top === null || left === null || bottom === null || right === null) {
    return null;
  }
  return { top, left, bottom, right };
}

function parseRegion(value: unknown): ReservedRegion | null {
  if (!isRecord(value)) return null;
  const x = finite(value.x);
  const y = finite(value.y);
  const width = finite(value.width);
  const height = finite(value.height);
  if (x === null || y === null || width === null || height === null) {
    return null;
  }
  if (width < 0 || height < 0) return null;
  return {
    id: typeof value.id === "string" ? value.id : "",
    x,
    y,
    width,
    height,
    margins: parseEdges(value.margins) ?? {
      top: 0,
      left: 0,
      bottom: 0,
      right: 0,
    },
    active: value.active === true,
  };
}

function parseRegions(value: unknown): ReservedRegion[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(parseRegion)
    .filter((region): region is ReservedRegion => region !== null);
}

/**
 * Validates the native `onRegionsChange` payload. Returns null for anything
 * malformed so the caller falls back to "derive nothing".
 */
export function parseRegionsEvent(raw: unknown): NativeRegions | null {
  if (!isRecord(raw)) return null;
  const windowRecord = isRecord(raw.window) ? raw.window : null;
  const width = finite(windowRecord?.width);
  const height = finite(windowRecord?.height);
  const safeArea = parseEdges(raw.safeArea);
  if (width === null || height === null || safeArea === null) return null;
  const status =
    typeof raw.hingeStatus === "string" &&
    (HINGE_STATUSES.includes(raw.hingeStatus) ||
      raw.hingeStatus === "none" ||
      raw.hingeStatus === "unavailable")
      ? (raw.hingeStatus as NativeRegions["hingeStatus"])
      : "unavailable";
  return {
    available: raw.available === true,
    hingeStatus: status,
    window: { width, height },
    safeArea,
    division: parseRegions(raw.division),
    occlusion: parseRegions(raw.occlusion),
  };
}

export function postureFromHingeStatus(
  status: HingeStatus | "none" | "unavailable" | null | undefined,
): Posture {
  switch (status) {
    case "closed":
      return "closed";
    case "partiallyOpen":
      return "half-open";
    case "fullyOpen":
      return "open";
    case "none":
      return "not-foldable";
    default:
      return "unknown";
  }
}

/** The axis of a fold rectangle: a tall, thin band is a vertical fold. */
export function foldAxis(rect: Rect): FoldAxis {
  return rect.height >= rect.width ? "vertical" : "horizontal";
}

/** Picks the fold from the division regions, preferring an active one. */
export function foldFromDivision(
  division: readonly ReservedRegion[],
): Fold | null {
  const region =
    division.find((candidate) => candidate.active) ?? division[0] ?? null;
  if (!region || region.width === 0 || region.height === 0) return null;
  return {
    axis: foldAxis(region),
    rect: {
      x: region.x,
      y: region.y,
      width: region.width,
      height: region.height,
    },
    margins: region.margins,
    active: region.active,
  };
}

export interface PostureInputs {
  /** Whether the native observer module is linked in this binary. */
  readonly nativeModuleLinked: boolean;
  /** The latest validated payload from the observer view, if any yet. */
  readonly regions: NativeRegions | null;
  /** `expo-hinge`'s `isAvailable()`. */
  readonly hingeAvailable: boolean;
  /** `expo-hinge`'s current reading (`useHinge()`), null when no hinge. */
  readonly hinge: HingeReading | null;
}

/**
 * Combines the hinge reading and the reserved regions into one snapshot.
 * The hinge reading wins for the posture; the observer's own hinge status is
 * used only before `expo-hinge` has reported.
 */
export function derivePostureSnapshot(input: PostureInputs): PostureSnapshot {
  const regionsAvailable =
    input.nativeModuleLinked && input.regions?.available === true;
  const anyApi = regionsAvailable || input.hingeAvailable;
  if (!anyApi) {
    return {
      ...UNAVAILABLE_POSTURE,
      safeArea: input.regions?.safeArea ?? null,
      window: input.regions?.window ?? null,
    };
  }
  let posture: Posture;
  if (input.hinge) {
    posture = postureFromHingeStatus(input.hinge.status);
  } else if (input.hingeAvailable) {
    // expo-hinge is available and reports no hinge for this window.
    posture =
      input.regions && input.regions.hingeStatus !== "unavailable"
        ? postureFromHingeStatus(input.regions.hingeStatus)
        : "not-foldable";
    if (posture === "unknown") posture = "not-foldable";
  } else {
    posture = postureFromHingeStatus(input.regions?.hingeStatus);
  }
  const fold = regionsAvailable
    ? foldFromDivision(input.regions?.division ?? [])
    : null;
  return {
    isAvailable: regionsAvailable,
    posture,
    hingeAngle: input.hinge?.angle ?? null,
    // A closed device shows only the outer display: no fold applies.
    fold: posture === "closed" ? null : fold,
    occlusions: regionsAvailable
      ? (input.regions?.occlusion ?? []).filter((region) => region.active)
      : [],
    safeArea: input.regions?.safeArea ?? null,
    window: input.regions?.window ?? null,
  };
}
