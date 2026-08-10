import {
  circle,
  destination,
  featureCollection,
  point,
  polygon,
} from "@turf/turf";
import type {
  Feature,
  FeatureCollection,
  GeoJsonProperties,
  Polygon,
  Position,
} from "geojson";
import type { VenueLayoutAsset, VenueLayoutGeoGeometry } from "@duna/api";

export interface VenueLayoutTemplate {
  readonly key: string;
  readonly label: string;
  readonly category: "court" | "table" | "space";
  readonly shape: "rectangle" | "circle";
  readonly widthMeters: number;
  readonly heightMeters: number;
  readonly radiusMeters?: number;
  readonly bufferMeters: number;
  readonly detail: string;
}

export interface VenueLayoutMapView {
  readonly latitude: number;
  readonly longitude: number;
  readonly zoom: number;
  readonly bearing: number;
  readonly pitch: number;
}

export function venueLayoutMapViewChanged(
  current: VenueLayoutMapView,
  next: VenueLayoutMapView,
): boolean {
  return (
    Math.abs(next.latitude - current.latitude) > 0.0000001 ||
    Math.abs(next.longitude - current.longitude) > 0.0000001 ||
    Math.abs(next.zoom - current.zoom) > 0.0001 ||
    Math.abs(next.bearing - current.bearing) > 0.0001 ||
    Math.abs(next.pitch - current.pitch) > 0.0001
  );
}

export const VENUE_LAYOUT_TEMPLATES = [
  {
    key: "fivb-short-court",
    label: "FIVB short court",
    category: "court",
    shape: "rectangle",
    widthMeters: 8,
    heightMeters: 16,
    bufferMeters: 6,
    detail: "16 × 8 m court · 28 × 20 m with safety zone",
  },
  {
    key: "duna-short-court",
    label: "Duna short court",
    category: "court",
    shape: "rectangle",
    widthMeters: 8,
    heightMeters: 16,
    bufferMeters: 3,
    detail: "16 × 8 m court · 22 × 14 m with safety zone",
  },
  {
    key: "duna-full-court",
    label: "Duna full court",
    category: "court",
    shape: "rectangle",
    widthMeters: 9,
    heightMeters: 18,
    bufferMeters: 3,
    detail: "18 × 9 m court · 24 × 15 m with safety zone",
  },
  {
    key: "vip-table-4ft",
    label: "VIP table · 4 ft",
    category: "table",
    shape: "circle",
    widthMeters: 1.22,
    heightMeters: 1.22,
    radiusMeters: 0.61,
    bufferMeters: 0.915,
    detail: "1.22 m table · 3.05 m hospitality footprint",
  },
  {
    key: "vip-table-6ft",
    label: "VIP table · 6 ft",
    category: "table",
    shape: "circle",
    widthMeters: 1.83,
    heightMeters: 1.83,
    radiusMeters: 0.915,
    bufferMeters: 1.065,
    detail: "1.83 m table · 3.96 m hospitality footprint",
  },
] as const satisfies readonly VenueLayoutTemplate[];

export type VenueLayoutMapFeatureProperties = GeoJsonProperties & {
  readonly assetId: string;
  readonly label: string;
  readonly kind: VenueLayoutAsset["kind"];
  readonly palette: VenueLayoutAsset["appearance"]["palette"];
  readonly layer: "buffer" | "core";
  readonly selected: boolean;
};

function offsetCoordinate(
  center: VenueLayoutGeoGeometry["center"],
  eastMeters: number,
  northMeters: number,
): Position {
  const distanceMeters = Math.hypot(eastMeters, northMeters);
  if (distanceMeters === 0) return [center.longitude, center.latitude];
  const bearing = (Math.atan2(eastMeters, northMeters) * 180) / Math.PI;
  return destination(
    point([center.longitude, center.latitude]),
    distanceMeters,
    bearing,
    { units: "meters" },
  ).geometry.coordinates;
}

function rotatedOffset(
  x: number,
  y: number,
  rotationDegrees: number,
): readonly [number, number] {
  const rotation = (rotationDegrees * Math.PI) / 180;
  return [
    x * Math.cos(rotation) - y * Math.sin(rotation),
    x * Math.sin(rotation) + y * Math.cos(rotation),
  ];
}

export function rectangleCoordinates(
  geometry: VenueLayoutGeoGeometry,
  extraMeters = 0,
): Position[] {
  const halfWidth = geometry.widthMeters / 2 + extraMeters;
  const halfHeight = geometry.heightMeters / 2 + extraMeters;
  const corners = [
    [-halfWidth, -halfHeight],
    [halfWidth, -halfHeight],
    [halfWidth, halfHeight],
    [-halfWidth, halfHeight],
  ] as const;
  const coordinates = corners.map(([x, y]) => {
    const [east, north] = rotatedOffset(x, y, geometry.rotationDegrees);
    return offsetCoordinate(geometry.center, east, north);
  });
  return [...coordinates, coordinates[0]!];
}

function assetPolygon(
  asset: VenueLayoutAsset,
  layer: "buffer" | "core",
  selected: boolean,
): Feature<Polygon, VenueLayoutMapFeatureProperties> | undefined {
  const geometry = asset.geometry;
  if (geometry.coordinateSpace !== "geo") return undefined;
  const properties: VenueLayoutMapFeatureProperties = {
    assetId: asset.id,
    label: asset.label,
    kind: asset.kind,
    palette: asset.appearance.palette,
    layer,
    selected,
  };
  const extra = layer === "buffer" ? geometry.bufferMeters : 0;
  if (geometry.shape === "circle") {
    const radius = (geometry.radiusMeters ?? geometry.widthMeters / 2) + extra;
    return circle(
      point([geometry.center.longitude, geometry.center.latitude]),
      radius,
      { steps: 64, units: "meters", properties },
    ) as Feature<Polygon, VenueLayoutMapFeatureProperties>;
  }
  if (geometry.shape === "polygon" && geometry.points?.length) {
    const coordinates = geometry.points.map((item) => [
      item.longitude,
      item.latitude,
    ]);
    return polygon([[...coordinates, coordinates[0]!]], properties) as Feature<
      Polygon,
      VenueLayoutMapFeatureProperties
    >;
  }
  return polygon(
    [rectangleCoordinates(geometry, extra)],
    properties,
  ) as Feature<Polygon, VenueLayoutMapFeatureProperties>;
}

export function venueLayoutFeatureCollection(
  assets: readonly VenueLayoutAsset[],
  selectedAssetId?: string,
): FeatureCollection<Polygon, VenueLayoutMapFeatureProperties> {
  const features = assets.flatMap((asset) => {
    if (asset.geometry.coordinateSpace !== "geo") return [];
    const selected = asset.id === selectedAssetId;
    return [
      assetPolygon(asset, "buffer", selected),
      assetPolygon(asset, "core", selected),
    ].filter(
      (feature): feature is Feature<Polygon, VenueLayoutMapFeatureProperties> =>
        Boolean(feature),
    );
  });
  return featureCollection(features);
}

export function moveGeoGeometry(
  geometry: VenueLayoutGeoGeometry,
  center: VenueLayoutGeoGeometry["center"],
): VenueLayoutGeoGeometry {
  if (geometry.shape !== "polygon" || !geometry.points?.length) {
    return { ...geometry, center };
  }
  const latitudeDelta = center.latitude - geometry.center.latitude;
  const longitudeDelta = center.longitude - geometry.center.longitude;
  return {
    ...geometry,
    center,
    points: geometry.points.map((item) => ({
      latitude: item.latitude + latitudeDelta,
      longitude: item.longitude + longitudeDelta,
    })),
  };
}
