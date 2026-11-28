/**
 * Map pins and the map look by zoom (contract R14).
 *
 * Standard street map up to zoom 16; satellite for the last three zoom levels
 * (17, 18, 19). Pins follow the zoom ladder dot, icon, icon + label, the
 * club's mark; overlapping pins become a cluster. An inverted pin means
 * "yours"; Solar is for a live pin only.
 */

export const MAP_MAX_ZOOM = 19;
/** Satellite shows on the last three zoom levels. */
export const SATELLITE_LEVELS = 3;
/** Zoom levels above this show clusters no more: every pin stands alone. */
export const CLUSTER_MAX_ZOOM = 14;

/** Zoom below which a pin is only a dot. */
export const ICON_MIN_ZOOM = 11;
export const LABEL_MIN_ZOOM = 13;
export const BRAND_MIN_ZOOM = 15;
/** Individual courts appear from here. */
export const COURT_MIN_ZOOM = 18;

export type MapStyle = "standard" | "satellite";

/** Street map to zoom 16, satellite above it (17 to 19 by default). */
export function mapStyleForZoom(
  zoom: number,
  maxZoom: number = MAP_MAX_ZOOM,
): MapStyle {
  return zoom > maxZoom - SATELLITE_LEVELS ? "satellite" : "standard";
}

export type PinKind =
  | "club"
  | "public"
  | "court"
  | "tournament"
  | "league"
  | "match"
  | "pickup"
  | "lesson";

export type PinTier =
  "hidden" | "dot" | "icon" | "icon-label" | "club-mark" | "court" | "cluster";

export interface PinInput {
  readonly zoom: number;
  readonly kind: PinKind;
  /** Number of pins this one stands for; more than 1 makes a cluster (only at or below CLUSTER_MAX_ZOOM). */
  readonly clusterCount?: number;
  /** The player's own club, booking or match: drawn inverted. */
  readonly yours?: boolean;
  /** Play is in progress here: the only pin that may use Solar. */
  readonly live?: boolean;
}

export interface PinModel {
  readonly tier: PinTier;
  readonly showIcon: boolean;
  readonly showLabel: boolean;
  /** The club's own mark replaces the generic icon. */
  readonly showClubMark: boolean;
  readonly inverted: boolean;
  readonly solar: boolean;
  readonly clusterCount: number | null;
}

/** Whether pins may be grouped at this zoom. */
export function clustersAllowed(zoom: number): boolean {
  return zoom <= CLUSTER_MAX_ZOOM;
}

export function pinModel(input: PinInput): PinModel {
  const { zoom, kind } = input;
  const inverted = input.yours === true;
  const solar = input.live === true;
  const base = { inverted, solar, clusterCount: null as number | null };

  if (kind === "court") {
    return zoom >= COURT_MIN_ZOOM
      ? {
          ...base,
          tier: "court",
          showIcon: true,
          showLabel: true,
          showClubMark: false,
        }
      : {
          ...base,
          tier: "hidden",
          showIcon: false,
          showLabel: false,
          showClubMark: false,
        };
  }

  const count = input.clusterCount ?? 1;
  if (count > 1 && clustersAllowed(zoom)) {
    return {
      ...base,
      tier: "cluster",
      showIcon: false,
      showLabel: false,
      showClubMark: false,
      clusterCount: count,
    };
  }
  if (zoom < ICON_MIN_ZOOM) {
    return {
      ...base,
      tier: "dot",
      showIcon: false,
      showLabel: false,
      showClubMark: false,
    };
  }
  if (zoom < LABEL_MIN_ZOOM) {
    return {
      ...base,
      tier: "icon",
      showIcon: true,
      showLabel: false,
      showClubMark: false,
    };
  }
  // Only clubs have a mark; other kinds stay icon + label at every higher zoom.
  if (zoom >= BRAND_MIN_ZOOM && kind === "club") {
    return {
      ...base,
      tier: "club-mark",
      showIcon: false,
      showLabel: true,
      showClubMark: true,
    };
  }
  return {
    ...base,
    tier: "icon-label",
    showIcon: true,
    showLabel: true,
    showClubMark: false,
  };
}
