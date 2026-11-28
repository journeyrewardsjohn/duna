/**
 * Where Find's map opens (M-P4a fix from the Find review). Pure; tested.
 *
 * On a phone the map keeps its behaviour: centred on the chosen place at
 * zoom 11, else fitted to the results. In a wide pane (the open iPhone Duo,
 * iPad) it always fits the results, including the chosen place, so it
 * never opens at continent zoom on a single pin: it fits the main cluster
 * of results (one far-away result does not pull it out), a lone pin or a tight
 * cluster is widened to a box about 1.5 km across (so the fit lands near
 * `MAX_FIT_ZOOM`, street level, without limiting how far the person can
 * zoom in afterwards), and the padding leaves room for the map controls.
 */
export const MAX_FIT_ZOOM = 14;
/** Degrees: about 1.5 km, the narrowest box a fit may make. */
export const MIN_SPAN_DEGREES = 0.014;

export interface MapPoint {
  readonly latitude: number;
  readonly longitude: number;
}

export type InitialCamera =
  | {
      readonly kind: "center";
      readonly centerCoordinate: [number, number];
      readonly zoomLevel: number;
    }
  | {
      readonly kind: "bounds";
      readonly ne: [number, number];
      readonly sw: [number, number];
      readonly padding: {
        readonly top: number;
        readonly right: number;
        readonly bottom: number;
        readonly left: number;
      };
      readonly maxZoomLevel: number;
    };

const FALLBACK: InitialCamera = {
  kind: "center",
  centerCoordinate: [-118.4, 33.86],
  zoomLevel: 9,
};

/** The bounding box of points, widened to the minimum span. Pure. */
export function fitBox(points: readonly MapPoint[]): {
  readonly ne: [number, number];
  readonly sw: [number, number];
} | null {
  if (points.length === 0) return null;
  const lats = points.map((point) => point.latitude);
  const lngs = points.map((point) => point.longitude);
  let north = Math.max(...lats);
  let south = Math.min(...lats);
  let east = Math.max(...lngs);
  let west = Math.min(...lngs);
  if (north - south < MIN_SPAN_DEGREES) {
    const middle = (north + south) / 2;
    north = middle + MIN_SPAN_DEGREES / 2;
    south = middle - MIN_SPAN_DEGREES / 2;
  }
  if (east - west < MIN_SPAN_DEGREES) {
    const middle = (east + west) / 2;
    east = middle + MIN_SPAN_DEGREES / 2;
    west = middle - MIN_SPAN_DEGREES / 2;
  }
  return { ne: [east, north], sw: [west, south] };
}

function rawBox(points: readonly MapPoint[]) {
  if (points.length === 0) return null;
  const lats = points.map((point) => point.latitude);
  const lngs = points.map((point) => point.longitude);
  return {
    ne: [Math.max(...lngs), Math.max(...lats)] as [number, number],
    sw: [Math.min(...lngs), Math.min(...lats)] as [number, number],
  };
}

/** Kilometres between two points (haversine). Pure. */
function distanceKm(a: MapPoint, b: MapPoint): number {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLng = (b.longitude - a.longitude) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * rad) *
      Math.cos(b.latitude * rad) *
      Math.sin(dLng / 2) ** 2;
  return 12_742 * Math.asin(Math.sqrt(h));
}

/** Results this far from the middle of the pack are outliers in the first fit. */
export const CLUSTER_RADIUS_KM = 150;

/**
 * The pins the first view fits: the main cluster around the median point,
 * so one far-away result does not pull the map out to the continent. Every
 * pin is still drawn; the person pans or zooms out to the rest. Pure.
 */
export function mainCluster(points: readonly MapPoint[]): readonly MapPoint[] {
  if (points.length < 3) return points;
  const median = (values: number[]) => {
    const sorted = [...values].sort((x, y) => x - y);
    return sorted[Math.floor(sorted.length / 2)]!;
  };
  const centre = {
    latitude: median(points.map((point) => point.latitude)),
    longitude: median(points.map((point) => point.longitude)),
  };
  const near = points.filter(
    (point) => distanceKm(point, centre) <= CLUSTER_RADIUS_KM,
  );
  return near.length * 2 >= points.length ? near : points;
}

export function initialCamera(input: {
  readonly pins: readonly MapPoint[];
  readonly where: MapPoint | null;
  /** A phone-width map keeps its earlier behaviour. */
  readonly compact: boolean;
  /** The pane's safe edges, so pins never sit under the bars. */
  readonly edges: {
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly left: number;
  };
  /** Width of the control column on the trailing edge. */
  readonly controlsWidth?: number;
}): InitialCamera {
  const { pins, where, compact, edges } = input;
  if (compact) {
    if (where)
      return {
        kind: "center",
        centerCoordinate: [where.longitude, where.latitude],
        zoomLevel: 11,
      };
    // Unchanged on phones: the raw bounds of the pins.
    const box = rawBox(pins);
    return box
      ? {
          kind: "bounds",
          ...box,
          padding: { top: 64, right: 48, bottom: 64, left: 48 },
          maxZoomLevel: MAX_FIT_ZOOM,
        }
      : FALLBACK;
  }
  const cluster = where
    ? pins.filter((pin) => distanceKm(pin, where) <= CLUSTER_RADIUS_KM)
    : mainCluster(pins);
  const box = fitBox(where ? [...cluster, where] : cluster);
  if (!box) {
    return where
      ? {
          kind: "center",
          centerCoordinate: [where.longitude, where.latitude],
          zoomLevel: 11,
        }
      : FALLBACK;
  }
  const controls = input.controlsWidth ?? 64;
  return {
    kind: "bounds",
    ...box,
    padding: {
      top: edges.top + 56,
      right: edges.right + controls + 24,
      bottom: edges.bottom + 56,
      left: edges.left + 48,
    },
    maxZoomLevel: MAX_FIT_ZOOM,
  };
}
