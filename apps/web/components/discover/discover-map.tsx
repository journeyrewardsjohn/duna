"use client";

import { report } from "@duna/observability";
import {
  ErrorState,
  Icon,
  IconButton,
  NotConfigured,
  Skeleton,
} from "@duna/ui/tideline";
import {
  CLUSTER_MAX_ZOOM,
  LABEL_MIN_ZOOM,
  mapStyleForZoom,
  MAP_MAX_ZOOM,
  type MapStyle,
} from "@duna/tideline-core";
import type { GeoJSONSource, Map as MapboxMap, MapMouseEvent } from "mapbox-gl";
import { useEffect, useRef, useState } from "react";
import { distanceMiles } from "./results";
import { loadMapEngine, MAP_STYLES } from "./map-engine";
import { RADIUS_STEPS_MILES } from "./search-state";

export interface MapPoint {
  readonly id: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly title: string;
  readonly live?: boolean;
}

export interface MapArea {
  readonly latitude: number;
  readonly longitude: number;
  readonly radiusMiles: number;
}

export interface DiscoverMapProps {
  readonly points: readonly MapPoint[];
  /** The searched point and area: the map opens on it. */
  readonly origin?: { readonly latitude: number; readonly longitude: number };
  readonly radiusMiles?: number;
  readonly selectedId?: string | null;
  readonly hoveredId?: string | null;
  readonly onSelect?: (id: string | null) => void;
  readonly onHover?: (id: string | null) => void;
  /** Offers "Search this area" after the person moves the map. */
  readonly onSearchArea?: (area: MapArea) => void;
  /** The map's accessible name. */
  readonly label: string;
  /** For the honest not-configured state: "The discovery map". */
  readonly feature?: string;
  /** Opening zoom when there is one point and no area. */
  readonly zoom?: number;
  /**
   * Show why a map is missing (demo and development). For the public the
   * map instead calls `onUnavailable` and draws nothing.
   */
  readonly explainMissing?: boolean;
  readonly onUnavailable?: () => void;
}

const SOURCE = "duna-results";
const LAYERS = {
  clusters: "duna-results-clusters",
  count: "duna-results-count",
  points: "duna-results-points",
  labels: "duna-results-labels",
} as const;

function reducedMotion() {
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function tokens(element: HTMLElement) {
  const style = getComputedStyle(element);
  const read = (name: string, fallback: string) =>
    style.getPropertyValue(name).trim() || fallback;
  return {
    ink: read("--td-brand-night-court", "#0E1A22"),
    salt: read("--td-brand-salt", "#F4F2EC"),
    dune: read("--td-brand-dune", "#D9C3A0"),
    solar: read("--td-brand-solar", "#F2542D"),
  };
}

function collection(points: readonly MapPoint[]) {
  return {
    type: "FeatureCollection" as const,
    features: points.map((point) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [point.longitude, point.latitude],
      },
      properties: {
        id: point.id,
        title: point.title,
        live: point.live ? 1 : 0,
      },
    })),
  };
}

/** The smallest search area that covers what the map shows. */
function areaOf(map: MapboxMap): MapArea {
  const center = map.getCenter();
  const bounds = map.getBounds();
  const corner = bounds
    ? { latitude: bounds.getNorth(), longitude: bounds.getEast() }
    : { latitude: center.lat, longitude: center.lng };
  const reach = distanceMiles(
    { latitude: center.lat, longitude: center.lng },
    corner,
  );
  const radiusMiles =
    RADIUS_STEPS_MILES.find((step) => step >= reach * 0.8) ??
    RADIUS_STEPS_MILES[RADIUS_STEPS_MILES.length - 1]!;
  return { latitude: center.lat, longitude: center.lng, radiusMiles };
}

function featureId(event: MapMouseEvent): string | undefined {
  const feature = event.features?.[0] as
    { readonly properties?: Record<string, unknown> | null } | undefined;
  const id = feature?.properties?.id;
  return typeof id === "string" ? id : undefined;
}

function zoomForRadius(miles: number | undefined) {
  if (miles === undefined) return 9;
  if (miles <= 1) return 14;
  if (miles <= 5) return 11.5;
  if (miles <= 10) return 10.5;
  if (miles <= 25) return 9;
  if (miles <= 50) return 8;
  return 7;
}

/**
 * The results on a map (an enhancement: the list is the accessible source of
 * truth). Pins follow the zoom ladder (dots far out, labels close in),
 * overlapping pins cluster until zoom 14, the street map turns to satellite
 * for the last three zoom levels, and a single button switches the look.
 * Hovering or choosing a row highlights its pin and the other way round.
 * Without a map key it says so honestly instead of a blank or broken map.
 */
export default function DiscoverMap({
  points,
  origin,
  radiusMiles,
  selectedId = null,
  hoveredId = null,
  onSelect,
  onHover,
  onSearchArea,
  label,
  feature = "The map",
  zoom,
  explainMissing = true,
  onUnavailable,
}: DiscoverMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapboxMap | null>(null);
  const latest = useRef({ points, onSelect, onHover });
  latest.current = { points, onSelect, onHover };
  const gone = useRef(onUnavailable);
  gone.current = onUnavailable;
  const [state, setState] = useState<
    "loading" | "ready" | "not-configured" | "error"
  >("loading");
  const [reference, setReference] = useState<string>();
  const [moved, setMoved] = useState(false);
  const [look, setLook] = useState<MapStyle>("standard");
  const override = useRef<MapStyle | null>(null);
  const marked = useRef<{ hovered: string | null; selected: string | null }>({
    hovered: null,
    selected: null,
  });

  useEffect(() => {
    let cancelled = false;
    let instance: MapboxMap | null = null;
    void loadMapEngine().then((engine) => {
      if (cancelled || !container.current) return;
      if (engine.state === "not-configured") {
        setState("not-configured");
        gone.current?.();
        return;
      }
      if (engine.state === "error") {
        setReference(
          report(engine.error, {
            event: "web.discover.map.load_failed",
            level: "warning",
          }),
        );
        setState("error");
        gone.current?.();
        return;
      }
      const { mapboxgl } = engine;
      const colours = tokens(container.current);
      const first = latest.current.points;
      const center = origin
        ? [origin.longitude, origin.latitude]
        : first[0]
          ? [first[0].longitude, first[0].latitude]
          : [-118.4, 33.88];
      instance = new mapboxgl.Map({
        container: container.current,
        style: MAP_STYLES.standard,
        center: center as [number, number],
        zoom: zoom ?? zoomForRadius(radiusMiles),
        maxZoom: MAP_MAX_ZOOM,
        cooperativeGestures: true,
        attributionControl: false,
      });
      map.current = instance;
      const current = instance;
      current.addControl(
        new mapboxgl.AttributionControl({ compact: true }),
        "bottom-left",
      );
      current.addControl(
        new mapboxgl.NavigationControl({ showCompass: false }),
        "top-right",
      );

      const addLayers = () => {
        if (current.getSource(SOURCE)) return;
        current.addSource(SOURCE, {
          type: "geojson",
          data: collection(latest.current.points),
          cluster: true,
          clusterMaxZoom: CLUSTER_MAX_ZOOM,
          clusterRadius: 48,
          promoteId: "id",
        });
        current.addLayer({
          id: LAYERS.clusters,
          type: "circle",
          source: SOURCE,
          filter: ["has", "point_count"],
          paint: {
            "circle-color": colours.ink,
            "circle-radius": [
              "step",
              ["get", "point_count"],
              16,
              10,
              20,
              40,
              24,
            ],
            "circle-stroke-color": colours.salt,
            "circle-stroke-width": 2,
          },
        });
        current.addLayer({
          id: LAYERS.count,
          type: "symbol",
          source: SOURCE,
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["get", "point_count_abbreviated"],
            "text-size": 12,
            "text-allow-overlap": true,
          },
          paint: { "text-color": colours.salt },
        });
        current.addLayer({
          id: LAYERS.points,
          type: "circle",
          source: SOURCE,
          filter: ["!", ["has", "point_count"]],
          paint: {
            // The zoom ladder: a dot far out, a pin close in.
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              6,
              4,
              11,
              7,
              15,
              9,
            ],
            "circle-color": [
              "case",
              ["==", ["get", "live"], 1],
              colours.solar,
              [
                "any",
                ["boolean", ["feature-state", "selected"], false],
                ["boolean", ["feature-state", "hovered"], false],
              ],
              colours.dune,
              colours.ink,
            ],
            "circle-stroke-color": [
              "case",
              ["boolean", ["feature-state", "selected"], false],
              colours.ink,
              colours.salt,
            ],
            "circle-stroke-width": [
              "case",
              ["boolean", ["feature-state", "selected"], false],
              3,
              2,
            ],
          },
        });
        current.addLayer({
          id: LAYERS.labels,
          type: "symbol",
          source: SOURCE,
          minzoom: LABEL_MIN_ZOOM,
          filter: ["!", ["has", "point_count"]],
          layout: {
            "text-field": ["get", "title"],
            "text-size": 12,
            "text-offset": [0, 1.2],
            "text-anchor": "top",
            "text-max-width": 12,
          },
          paint: {
            "text-color": colours.ink,
            "text-halo-color": colours.salt,
            "text-halo-width": 1.5,
          },
        });
        marked.current = { hovered: null, selected: null };
      };

      current.on("style.load", addLayers);
      current.on("load", () => {
        addLayers();
        setState("ready");
      });
      current.on("moveend", (event) => {
        if ((event as { originalEvent?: unknown }).originalEvent) {
          setMoved(true);
        }
      });
      current.on("zoomend", () => {
        if (override.current) return;
        const wanted = mapStyleForZoom(current.getZoom());
        setLook((was) => {
          if (was !== wanted) current.setStyle(MAP_STYLES[wanted]);
          return wanted;
        });
      });
      current.on("click", LAYERS.clusters, (event: MapMouseEvent) => {
        const feature = event.features?.[0] as
          | {
              readonly properties?: Record<string, unknown> | null;
              readonly geometry: { readonly coordinates: number[] };
            }
          | undefined;
        const clusterId = Number(feature?.properties?.cluster_id);
        if (!feature || !Number.isFinite(clusterId)) return;
        const source = current.getSource(SOURCE) as GeoJSONSource;
        source.getClusterExpansionZoom(clusterId, (error, next) => {
          if (error || next === null || next === undefined) return;
          current.easeTo({
            center: feature.geometry.coordinates as [number, number],
            zoom: Math.min(next, 16),
            duration: reducedMotion() ? 0 : 320,
          });
        });
      });
      current.on("click", LAYERS.points, (event: MapMouseEvent) => {
        const id = featureId(event);
        if (id) latest.current.onSelect?.(id);
      });
      current.on("mousemove", LAYERS.points, (event: MapMouseEvent) => {
        current.getCanvas().style.cursor = "pointer";
        const id = featureId(event);
        if (id) latest.current.onHover?.(id);
      });
      current.on("mouseleave", LAYERS.points, () => {
        current.getCanvas().style.cursor = "";
        latest.current.onHover?.(null);
      });
      current.on("error", (event) => {
        report(event.error, {
          event: "web.discover.map.runtime_error",
          level: "warning",
        });
      });
    });
    return () => {
      cancelled = true;
      instance?.remove();
      map.current = null;
    };
    // The map is created once; data and camera follow in the effects below.
  }, []);

  // New results: new pins, and the camera moves to them (a Cross, or a jump
  // under reduced motion).
  useEffect(() => {
    const current = map.current;
    if (!current || state !== "ready") return;
    const source = current.getSource(SOURCE) as GeoJSONSource | undefined;
    source?.setData(collection(points));
    setMoved(false);
    const duration = reducedMotion() ? 0 : 320;
    if (points.length > 1) {
      let west = Infinity;
      let south = Infinity;
      let east = -Infinity;
      let north = -Infinity;
      for (const point of points) {
        west = Math.min(west, point.longitude);
        east = Math.max(east, point.longitude);
        south = Math.min(south, point.latitude);
        north = Math.max(north, point.latitude);
      }
      current.fitBounds(
        [
          [west, south],
          [east, north],
        ],
        { padding: 56, maxZoom: 15, duration },
      );
    } else if (points[0] || origin) {
      const target = points[0] ?? origin!;
      current.easeTo({
        center: [target.longitude, target.latitude],
        zoom: zoom ?? (points[0] ? 13 : zoomForRadius(radiusMiles)),
        duration,
      });
    }
  }, [points, origin, radiusMiles, state, zoom]);

  // Row hover and choice light the matching pin.
  useEffect(() => {
    const current = map.current;
    if (!current || state !== "ready" || !current.getSource(SOURCE)) return;
    const mark = (key: "hovered" | "selected", id: string | null) => {
      const was = marked.current[key];
      if (was === id) return;
      if (was) {
        current.setFeatureState({ source: SOURCE, id: was }, { [key]: false });
      }
      if (id) {
        current.setFeatureState({ source: SOURCE, id }, { [key]: true });
      }
      marked.current[key] = id;
    };
    mark("hovered", hoveredId);
    mark("selected", selectedId);
    if (selectedId) {
      const point = points.find((candidate) => candidate.id === selectedId);
      const bounds = current.getBounds();
      if (
        point &&
        bounds &&
        !bounds.contains([point.longitude, point.latitude])
      ) {
        current.easeTo({
          center: [point.longitude, point.latitude],
          duration: reducedMotion() ? 0 : 320,
        });
      }
    }
  }, [hoveredId, selectedId, points, state]);

  const switchLook = () => {
    const current = map.current;
    if (!current) return;
    const next: MapStyle = look === "standard" ? "satellite" : "standard";
    override.current = next;
    setLook(next);
    current.setStyle(MAP_STYLES[next]);
  };

  if (!explainMissing && (state === "not-configured" || state === "error")) {
    return null;
  }

  return (
    <div className="dv-map" data-state={state}>
      <div
        aria-label={label}
        className="dv-map__canvas"
        ref={container}
        role="region"
      />
      {state === "loading" ? (
        <div aria-hidden="true" className="dv-map__veil">
          <Skeleton kind="card" />
        </div>
      ) : null}
      {state === "not-configured" ? (
        <div className="dv-map__state">
          <NotConfigured
            compact
            feature={feature}
            needs="a map key"
            owner="the Duna team"
          />
        </div>
      ) : null}
      {state === "error" ? (
        <div className="dv-map__state">
          <ErrorState
            compact
            message="The map didn't load. The list has every result."
            reference={reference}
            title="Map unavailable"
          />
        </div>
      ) : null}
      {state === "ready" ? (
        <div className="dv-map__tools">
          <IconButton
            label={look === "standard" ? "Show satellite" : "Show street map"}
            onClick={switchLook}
            variant="tonal"
          >
            <Icon
              name={look === "standard" ? "satellite" : "map"}
              size="control"
            />
          </IconButton>
        </div>
      ) : null}
      {state === "ready" && moved && onSearchArea ? (
        <button
          className="dv-map__area td-rise td-rise--short"
          onClick={() => {
            if (map.current) onSearchArea(areaOf(map.current));
            setMoved(false);
          }}
          type="button"
        >
          <Icon name="search" size="inline" />
          Search this area
        </button>
      ) : null}
    </div>
  );
}
