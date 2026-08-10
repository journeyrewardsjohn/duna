"use client";

import { bearing, destination, featureCollection, point } from "@turf/turf";
import type { VenueLayoutAsset, VenueLayoutGeoGeometry } from "@duna/api";
import { MapPinned, Move3D, RotateCw, Satellite } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type {
  GeoJSONSource,
  ExpressionSpecification,
  Map as MapboxMap,
  MapMouseEvent,
  MapTouchEvent,
} from "mapbox-gl";
import {
  moveGeoGeometry,
  venueLayoutFeatureCollection,
  venueLayoutMapMoveIsUserInitiated,
} from "@/lib/venue-layout-geometry";

interface MapView {
  readonly latitude: number;
  readonly longitude: number;
  readonly zoom: number;
  readonly bearing: number;
  readonly pitch: number;
}

interface VenueLayoutMapProps {
  readonly assets: readonly VenueLayoutAsset[];
  readonly selectedAssetId?: string;
  readonly view: MapView;
  readonly readOnly: boolean;
  readonly courtActivity?: Readonly<Record<string, string>>;
  readonly onSelect: (assetId?: string) => void;
  readonly onAssetChange: (asset: VenueLayoutAsset) => void;
  readonly onViewChange: (view: MapView) => void;
}

interface DragState {
  readonly assetId: string;
  readonly mode: "move" | "rotate";
}

function normalizeRotation(value: number) {
  return ((((value + 180) % 360) + 360) % 360) - 180;
}

function handleBaseBearing(geometry: VenueLayoutGeoGeometry) {
  return (
    (Math.atan2(geometry.widthMeters / 2, geometry.heightMeters / 2) * 180) /
    Math.PI
  );
}

function rotationHandleFeature(
  geometry: VenueLayoutGeoGeometry,
  assetId: string,
) {
  const distanceMeters = Math.hypot(
    geometry.widthMeters / 2,
    geometry.heightMeters / 2,
  );
  const handle = destination(
    point([geometry.center.longitude, geometry.center.latitude]),
    distanceMeters,
    handleBaseBearing(geometry) - geometry.rotationDegrees,
    { units: "meters" },
  );
  handle.properties = { assetId };
  return handle;
}

function mapColors(container: HTMLElement) {
  const styles = getComputedStyle(container);
  const color = (name: string) =>
    styles.getPropertyValue(name).trim() || "transparent";
  return {
    sand: color("--layout-sand-core"),
    ticketed: color("--layout-ticketed-core"),
    amenity: color("--layout-amenity-core"),
    service: color("--layout-service-core"),
    restricted: color("--layout-restricted-core"),
    neutral: color("--layout-neutral-core"),
    outline: color("--layout-outline"),
    selected: color("--layout-selected"),
    label: color("--layout-label"),
    handle: color("--layout-handle"),
  };
}

function paletteExpression(
  colors: ReturnType<typeof mapColors>,
): ExpressionSpecification {
  return [
    "match",
    ["get", "palette"],
    "sand",
    colors.sand,
    "ticketed",
    colors.ticketed,
    "amenity",
    colors.amenity,
    "service",
    colors.service,
    "restricted",
    colors.restricted,
    colors.neutral,
  ] as unknown as ExpressionSpecification;
}

export function VenueLayoutMap({
  assets,
  selectedAssetId,
  view,
  readOnly,
  courtActivity,
  onSelect,
  onAssetChange,
  onViewChange,
}: VenueLayoutMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | undefined>(undefined);
  const assetsRef = useRef(assets);
  const selectedRef = useRef(selectedAssetId);
  const onAssetChangeRef = useRef(onAssetChange);
  const onSelectRef = useRef(onSelect);
  const onViewChangeRef = useRef(onViewChange);
  const readOnlyRef = useRef(readOnly);
  const courtActivityRef = useRef(courtActivity);
  const dragRef = useRef<DragState | undefined>(undefined);
  const frameRef = useRef<number | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  assetsRef.current = assets;
  selectedRef.current = selectedAssetId;
  onAssetChangeRef.current = onAssetChange;
  onSelectRef.current = onSelect;
  onViewChangeRef.current = onViewChange;
  readOnlyRef.current = readOnly;
  courtActivityRef.current = courtActivity;

  function renderedAssets() {
    const activity = courtActivityRef.current;
    if (!activity) return assetsRef.current;
    return assetsRef.current.map((asset) => {
      const detail = asset.courtId ? activity[asset.courtId] : undefined;
      return detail ? { ...asset, label: `${asset.label}\n${detail}` } : asset;
    });
  }

  function handleFeature() {
    const selected = assetsRef.current.find(
      (asset) => asset.id === selectedRef.current,
    );
    if (
      !selected ||
      selected.locked ||
      selected.geometry.coordinateSpace !== "geo" ||
      selected.geometry.shape === "circle"
    ) {
      return featureCollection([]);
    }
    const geometry = selected.geometry;
    return featureCollection([rotationHandleFeature(geometry, selected.id)]);
  }

  function updateSources() {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      const map = mapRef.current;
      if (!map?.isStyleLoaded()) return;
      (
        map.getSource("venue-layout-assets") as GeoJSONSource | undefined
      )?.setData(
        venueLayoutFeatureCollection(renderedAssets(), selectedRef.current),
      );
      (
        map.getSource("venue-layout-handle") as GeoJSONSource | undefined
      )?.setData(handleFeature());
    });
  }

  useEffect(() => {
    assetsRef.current = assets;
    selectedRef.current = selectedAssetId;
    updateSources();
  }, [assets, courtActivity, selectedAssetId]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    let resizeFrame: number | undefined;
    const observer = new ResizeObserver(() => {
      if (resizeFrame) cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => mapRef.current?.resize());
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
      if (resizeFrame) cancelAnimationFrame(resizeFrame);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container || mapRef.current) return;
    async function start() {
      try {
        const tokenResponse = await fetch("/api/mapbox/token");
        const payload = (await tokenResponse.json()) as {
          readonly token?: string;
          readonly error?: string;
        };
        if (!tokenResponse.ok || !payload.token) {
          throw new Error(payload.error || "Satellite map is unavailable.");
        }
        const mapboxgl = await import("mapbox-gl");
        if (cancelled || !containerRef.current) return;
        mapboxgl.default.accessToken = payload.token;
        const map = new mapboxgl.default.Map({
          container: containerRef.current,
          style: "mapbox://styles/mapbox/satellite-streets-v12",
          center: [view.longitude, view.latitude],
          zoom: view.zoom,
          bearing: view.bearing,
          pitch: view.pitch,
          maxZoom: 22,
          attributionControl: true,
          cooperativeGestures: false,
        });
        mapRef.current = map;
        map.addControl(
          new mapboxgl.default.NavigationControl({ visualizePitch: true }),
          "top-right",
        );
        map.addControl(new mapboxgl.default.ScaleControl({ unit: "metric" }));
        map.on("load", () => {
          setError(undefined);
          map.resize();
          const colors = mapColors(containerRef.current!);
          const firstLabel = map
            .getStyle()
            .layers?.find(
              (layer) =>
                layer.type === "symbol" &&
                Boolean(layer.layout && "text-field" in layer.layout),
            )?.id;
          map.addSource("venue-layout-assets", {
            type: "geojson",
            data: venueLayoutFeatureCollection(
              renderedAssets(),
              selectedRef.current,
            ),
          });
          map.addSource("venue-layout-handle", {
            type: "geojson",
            data: handleFeature(),
          });
          map.addLayer(
            {
              id: "venue-layout-buffer",
              type: "fill",
              source: "venue-layout-assets",
              filter: ["==", ["get", "layer"], "buffer"],
              paint: {
                "fill-color": paletteExpression(colors),
                "fill-opacity": 0.2,
              },
            },
            firstLabel,
          );
          map.addLayer(
            {
              id: "venue-layout-core",
              type: "fill",
              source: "venue-layout-assets",
              filter: ["==", ["get", "layer"], "core"],
              paint: {
                "fill-color": paletteExpression(colors),
                "fill-opacity": 0.76,
              },
            },
            firstLabel,
          );
          map.addLayer(
            {
              id: "venue-layout-outline",
              type: "line",
              source: "venue-layout-assets",
              filter: ["==", ["get", "layer"], "core"],
              paint: {
                "line-color": [
                  "case",
                  ["==", ["get", "selected"], true],
                  colors.selected,
                  colors.outline,
                ],
                "line-width": ["case", ["==", ["get", "selected"], true], 4, 2],
              },
            },
            firstLabel,
          );
          map.addLayer(
            {
              id: "venue-layout-labels",
              type: "symbol",
              source: "venue-layout-assets",
              filter: ["==", ["get", "layer"], "core"],
              layout: {
                "text-field": ["get", "label"],
                "text-size": 12,
                "text-font": ["DIN Pro Medium", "Arial Unicode MS Bold"],
                "text-allow-overlap": false,
              },
              paint: {
                "text-color": colors.label,
                "text-halo-color": colors.outline,
                "text-halo-width": 1,
              },
            },
            firstLabel,
          );
          map.addLayer(
            {
              id: "venue-layout-rotate-handle",
              type: "circle",
              source: "venue-layout-handle",
              paint: {
                "circle-radius": 12,
                "circle-color": colors.handle,
                "circle-stroke-color": colors.selected,
                "circle-stroke-width": 3,
              },
            },
            firstLabel,
          );
          map.addLayer(
            {
              id: "venue-layout-rotate-handle-icon",
              type: "symbol",
              source: "venue-layout-handle",
              layout: {
                "text-field": "↻",
                "text-size": 17,
                "text-allow-overlap": true,
                "text-ignore-placement": true,
              },
              paint: {
                "text-color": colors.label,
              },
            },
            firstLabel,
          );

          const beginDrag = (
            event: MapMouseEvent | MapTouchEvent,
            mode: DragState["mode"],
          ) => {
            if (readOnlyRef.current) return;
            const feature = event.features?.[0];
            const assetId = feature?.properties?.assetId;
            if (typeof assetId !== "string") return;
            const asset = assetsRef.current.find((item) => item.id === assetId);
            if (!asset || asset.locked) return;
            event.preventDefault();
            onSelectRef.current(assetId);
            dragRef.current = { assetId, mode };
            map.dragPan.disable();
            map.getCanvas().style.cursor = "grabbing";
          };
          map.on("mousedown", "venue-layout-core", (event) =>
            beginDrag(event, "move"),
          );
          map.on("mousedown", "venue-layout-rotate-handle", (event) =>
            beginDrag(event, "rotate"),
          );
          map.on("touchstart", "venue-layout-core", (event) =>
            beginDrag(event, "move"),
          );
          map.on("touchstart", "venue-layout-rotate-handle", (event) =>
            beginDrag(event, "rotate"),
          );
          const drag = (event: MapMouseEvent | MapTouchEvent) => {
            const state = dragRef.current;
            if (!state) return;
            const asset = assetsRef.current.find(
              (item) => item.id === state.assetId,
            );
            if (!asset || asset.geometry.coordinateSpace !== "geo") return;
            const coordinate = "lngLat" in event ? event.lngLat : undefined;
            if (!coordinate) return;
            const geometry = asset.geometry;
            const nextGeometry =
              state.mode === "move"
                ? moveGeoGeometry(geometry, {
                    latitude: coordinate.lat,
                    longitude: coordinate.lng,
                  })
                : {
                    ...geometry,
                    rotationDegrees: normalizeRotation(
                      handleBaseBearing(geometry) -
                        bearing(
                          point([
                            geometry.center.longitude,
                            geometry.center.latitude,
                          ]),
                          point([coordinate.lng, coordinate.lat]),
                        ),
                    ),
                  };
            onAssetChangeRef.current({ ...asset, geometry: nextGeometry });
          };
          map.on("mousemove", drag);
          map.on("touchmove", drag);
          const endDrag = () => {
            if (!dragRef.current) return;
            dragRef.current = undefined;
            map.dragPan.enable();
            map.getCanvas().style.cursor = "";
          };
          map.on("mouseup", endDrag);
          map.on("touchend", endDrag);
          map.on("click", "venue-layout-core", (event) => {
            const assetId = event.features?.[0]?.properties?.assetId;
            if (typeof assetId === "string") onSelectRef.current(assetId);
          });
          map.on("click", (event) => {
            const feature = map.queryRenderedFeatures(event.point, {
              layers: ["venue-layout-core", "venue-layout-rotate-handle"],
            })[0];
            if (!feature) onSelectRef.current(undefined);
          });
          for (const layer of [
            "venue-layout-core",
            "venue-layout-rotate-handle",
          ]) {
            map.on("mouseenter", layer, () => {
              map.getCanvas().style.cursor = readOnlyRef.current
                ? "pointer"
                : "grab";
            });
            map.on("mouseleave", layer, () => {
              if (!dragRef.current) map.getCanvas().style.cursor = "";
            });
          }
          map.on("moveend", (event) => {
            if (!venueLayoutMapMoveIsUserInitiated(event.originalEvent)) return;
            const center = map.getCenter();
            onViewChangeRef.current({
              latitude: center.lat,
              longitude: center.lng,
              zoom: map.getZoom(),
              bearing: map.getBearing(),
              pitch: map.getPitch(),
            });
          });
        });
        map.on("error", (event) => {
          if (!map.loaded())
            setError(event.error?.message || "Map could not load.");
        });
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Satellite map is unavailable.",
          );
        }
      }
    }
    void start();
    return () => {
      cancelled = true;
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      mapRef.current?.remove();
      mapRef.current = undefined;
    };
  }, []);

  return (
    <div className="venue-layout-map-shell">
      <div
        aria-label="Satellite venue layout canvas"
        className="venue-layout-map"
        ref={containerRef}
      />
      <div className="venue-layout-map__mode">
        <Satellite aria-hidden size={15} /> Satellite · metric geometry
      </div>
      {selectedAssetId && !readOnly && (
        <div className="venue-layout-map__interaction-hint">
          <span>
            <Move3D aria-hidden size={14} /> Drag element to move
          </span>
          <span>
            <RotateCw aria-hidden size={14} /> Drag corner to rotate
          </span>
        </div>
      )}
      {error && (
        <div className="venue-layout-map__error" role="status">
          <MapPinned aria-hidden size={28} />
          <strong>Satellite canvas needs Mapbox</strong>
          <p>{error}</p>
          <small>Your saved courts and spaces are still intact.</small>
          <div className="venue-layout-map__error-directory">
            {assets.map((asset) => (
              <button
                key={asset.id}
                onClick={() => onSelect(asset.id)}
                type="button"
              >
                {asset.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
