import type {
  CaptureEdgeVisibility,
  CaptureGuidance,
  CaptureLine,
  CapturePoint,
} from "./modules/duna-video-capture";

export type CourtCornerIndex = 0 | 1 | 2 | 3;

export interface CourtGeometry {
  /** Far-left, far-right, near-right, near-left. Points may be off-screen. */
  readonly corners: readonly [
    CapturePoint,
    CapturePoint,
    CapturePoint,
    CapturePoint,
  ];
  /** The net line where it meets the sand. */
  readonly netLine: CaptureLine;
  /** The visible net tape. */
  readonly netTopLine?: CaptureLine;
  readonly antennaPoints?: CaptureLine;
  readonly nearLineVisible: boolean;
  readonly edgeVisibility: CaptureEdgeVisibility;
  readonly mode: "automatic" | "assisted" | "manual";
}

export interface SavedCourtGeometry {
  readonly corners?: readonly CapturePoint[];
  readonly netLine?: readonly CapturePoint[];
  readonly netTopLine?: readonly CapturePoint[];
  readonly antennaPoints?: readonly CapturePoint[];
  readonly nearLineVisible?: boolean;
  readonly edgeVisibility?: CaptureEdgeVisibility;
  readonly calibrationMode?: "automatic" | "assisted" | "manual";
}

export const fallbackCourtCorners = [
  { x: 0.33, y: 0.26 },
  { x: 0.67, y: 0.26 },
  { x: 0.92, y: 0.77 },
  { x: 0.08, y: 0.77 },
] as const;

function point(value: CapturePoint): CapturePoint {
  return {
    x: Math.max(-1.5, Math.min(2.5, value.x)),
    y: Math.max(-1.5, Math.min(2.5, value.y)),
  };
}

function tuple(
  value: readonly CapturePoint[] | undefined,
): CourtGeometry["corners"] | undefined {
  if (value?.length !== 4) return undefined;
  return [
    point(value[0]!),
    point(value[1]!),
    point(value[2]!),
    point(value[3]!),
  ];
}

function line(
  value: readonly CapturePoint[] | undefined,
): CaptureLine | undefined {
  if (value?.length !== 2) return undefined;
  return [point(value[0]!), point(value[1]!)];
}

export function interpolatePoint(
  from: CapturePoint,
  to: CapturePoint,
  amount: number,
): CapturePoint {
  return {
    x: from.x + (to.x - from.x) * amount,
    y: from.y + (to.y - from.y) * amount,
  };
}

export function deriveNetLine(corners: CourtGeometry["corners"]): CaptureLine {
  return [
    interpolatePoint(corners[0], corners[3], 0.5),
    interpolatePoint(corners[1], corners[2], 0.5),
  ];
}

export function isCapturePointVisible(value: CapturePoint): boolean {
  return value.x >= 0 && value.x <= 1 && value.y >= 0 && value.y <= 1;
}

export function edgeVisibility(
  corners: CourtGeometry["corners"],
  netTopLine?: CaptureLine,
): CaptureEdgeVisibility {
  return {
    far: isCapturePointVisible(corners[0]) && isCapturePointVisible(corners[1]),
    right:
      isCapturePointVisible(corners[1]) && isCapturePointVisible(corners[2]),
    near:
      isCapturePointVisible(corners[2]) && isCapturePointVisible(corners[3]),
    left:
      isCapturePointVisible(corners[3]) && isCapturePointVisible(corners[0]),
    net: Boolean(netTopLine?.every(isCapturePointVisible)),
  };
}

export function geometryFromGuidance(
  guidance: CaptureGuidance | undefined,
  saved?: SavedCourtGeometry,
): CourtGeometry {
  const corners =
    tuple(saved?.corners) ?? tuple(guidance?.corners) ?? fallbackCourtCorners;
  const netTopLine = line(saved?.netTopLine) ?? line(guidance?.netTopLine);
  const antennaPoints =
    line(saved?.antennaPoints) ?? line(guidance?.antennaPoints);
  const visibility =
    saved?.edgeVisibility ??
    guidance?.edgeVisibility ??
    edgeVisibility(corners, netTopLine);
  return {
    corners,
    netLine:
      line(saved?.netLine) ?? line(guidance?.netLine) ?? deriveNetLine(corners),
    netTopLine,
    antennaPoints,
    nearLineVisible:
      saved?.nearLineVisible ?? guidance?.nearLineVisible ?? visibility.near,
    edgeVisibility: visibility,
    mode: saved?.calibrationMode ?? guidance?.calibrationMode ?? "automatic",
  };
}

export function geometrySettings(geometry: CourtGeometry): SavedCourtGeometry {
  return {
    corners: geometry.corners,
    netLine: geometry.netLine,
    netTopLine: geometry.netTopLine,
    antennaPoints: geometry.antennaPoints,
    nearLineVisible: geometry.nearLineVisible,
    edgeVisibility: geometry.edgeVisibility,
    calibrationMode: geometry.mode,
  };
}

function extendToY(
  far: CapturePoint,
  near: CapturePoint,
  targetY: number,
): CapturePoint {
  const deltaY = near.y - far.y;
  if (Math.abs(deltaY) < 0.001) return point({ x: near.x, y: targetY });
  const amount = (targetY - far.y) / deltaY;
  return point({
    x: far.x + (near.x - far.x) * amount,
    y: targetY,
  });
}

export function withNearLineOffscreen(geometry: CourtGeometry): CourtGeometry {
  const nearY = 1.14;
  const corners = [
    geometry.corners[0],
    geometry.corners[1],
    extendToY(geometry.corners[1], geometry.corners[2], nearY),
    extendToY(geometry.corners[0], geometry.corners[3], nearY),
  ] as const;
  return {
    ...geometry,
    corners,
    netLine: deriveNetLine(corners),
    nearLineVisible: false,
    edgeVisibility: {
      ...edgeVisibility(corners, geometry.netTopLine),
      near: false,
    },
    mode: "assisted",
  };
}

export function withFullCourtVisible(geometry: CourtGeometry): CourtGeometry {
  const corners = geometry.corners.map((corner) => ({
    x: Math.max(0.05, Math.min(0.95, corner.x)),
    y: Math.max(0.08, Math.min(0.9, corner.y)),
  })) as unknown as CourtGeometry["corners"];
  return {
    ...geometry,
    corners,
    netLine: deriveNetLine(corners),
    nearLineVisible: true,
    edgeVisibility: edgeVisibility(corners, geometry.netTopLine),
    mode: "assisted",
  };
}

export function moveCourtCorner(
  geometry: CourtGeometry,
  index: CourtCornerIndex,
  next: CapturePoint,
): CourtGeometry {
  const corners = [...geometry.corners] as [
    CapturePoint,
    CapturePoint,
    CapturePoint,
    CapturePoint,
  ];
  corners[index] = point(next);
  const normalized = corners as CourtGeometry["corners"];
  const visibility = edgeVisibility(normalized, geometry.netTopLine);
  return {
    ...geometry,
    corners: normalized,
    netLine: deriveNetLine(normalized),
    nearLineVisible: visibility.near,
    edgeVisibility: visibility,
    mode: "manual",
  };
}

export function moveNetTopAnchor(
  geometry: CourtGeometry,
  index: 0 | 1,
  next: CapturePoint,
): CourtGeometry {
  const current = geometry.netTopLine ?? geometry.netLine;
  const netTopLine: [CapturePoint, CapturePoint] = [current[0], current[1]];
  const delta = {
    x: next.x - current[index].x,
    y: next.y - current[index].y,
  };
  netTopLine[index] = point(next);
  const antennaPoints = geometry.antennaPoints
    ? ([...geometry.antennaPoints] as [CapturePoint, CapturePoint])
    : undefined;
  if (antennaPoints) {
    antennaPoints[index] = point({
      x: antennaPoints[index].x + delta.x,
      y: antennaPoints[index].y + delta.y,
    });
  }
  return {
    ...geometry,
    netTopLine,
    antennaPoints,
    edgeVisibility: edgeVisibility(geometry.corners, netTopLine),
    mode: "manual",
  };
}

export function moveAntennaAnchor(
  geometry: CourtGeometry,
  index: 0 | 1,
  next: CapturePoint,
): CourtGeometry {
  if (!geometry.antennaPoints) return geometry;
  const antennaPoints: [CapturePoint, CapturePoint] = [
    geometry.antennaPoints[0],
    geometry.antennaPoints[1],
  ];
  antennaPoints[index] = point(next);
  return { ...geometry, antennaPoints, mode: "manual" };
}

export function toggleAntennas(
  geometry: CourtGeometry,
  enabled: boolean,
): CourtGeometry {
  const top = geometry.netTopLine ?? geometry.netLine;
  return {
    ...geometry,
    antennaPoints: enabled
      ? [
          { x: top[0].x, y: top[0].y - 0.08 },
          { x: top[1].x, y: top[1].y - 0.08 },
        ]
      : undefined,
    mode: "manual",
  };
}

export function visibleCornerCount(geometry: CourtGeometry): number {
  return geometry.corners.filter(isCapturePointVisible).length;
}
