"use client";

import type { DiscoveryEntityType, DiscoveryMapItem } from "@duna/api";
import {
  LocateFixed,
  MapIcon,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapboxMap } from "mapbox-gl";
import { DiscoveryCard } from "./discovery-card";

type MapFilter = "all" | DiscoveryEntityType;

const filters: readonly { value: MapFilter; label: string }[] = [
  { value: "all", label: "Everything" },
  { value: "venue", label: "Courts" },
  { value: "event", label: "Events" },
  { value: "coach", label: "Coaches" },
  { value: "pro-tour", label: "Pro tour" },
];

const layerIds = {
  clusters: "duna-discovery-clusters",
  clusterCount: "duna-discovery-cluster-count",
  points: "duna-discovery-points",
  proHalo: "duna-discovery-pro-halo",
} as const;

function featureCollection(items: readonly DiscoveryMapItem[]) {
  return {
    type: "FeatureCollection" as const,
    features: items.flatMap((item) =>
      item.latitude !== undefined && item.longitude !== undefined
        ? [
            {
              type: "Feature" as const,
              geometry: {
                type: "Point" as const,
                coordinates: [item.longitude, item.latitude],
              },
              properties: {
                id: item.id,
                entityType: item.entityType,
                title: item.title,
                live: item.live ? 1 : 0,
              },
            },
          ]
        : [],
    ),
  };
}

function visibleInBounds(
  item: DiscoveryMapItem,
  bounds: NonNullable<ReturnType<MapboxMap["getBounds"]>>,
): boolean {
  return (
    item.latitude !== undefined &&
    item.longitude !== undefined &&
    bounds.contains([item.longitude, item.latitude])
  );
}

export function DiscoveryMap({
  items,
  full = false,
}: {
  readonly items: readonly DiscoveryMapItem[];
  readonly full?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const [mapFilter, setMapFilter] = useState<MapFilter>("all");
  const [loaded, setLoaded] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [moved, setMoved] = useState(false);
  const [areaIds, setAreaIds] = useState<readonly string[]>();
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();

  const filteredItems = useMemo(
    () =>
      mapFilter === "all"
        ? items
        : items.filter((item) => item.entityType === mapFilter),
    [items, mapFilter],
  );
  const mappedItems = useMemo(
    () =>
      filteredItems.filter(
        (item) => item.latitude !== undefined && item.longitude !== undefined,
      ),
    [filteredItems],
  );
  const listItems = useMemo(() => {
    const inArea = areaIds
      ? filteredItems.filter((item) => areaIds.includes(item.id))
      : filteredItems;
    const selected = inArea.find((item) => item.id === selectedId);
    return selected
      ? [selected, ...inArea.filter((item) => item.id !== selected.id)]
      : inArea;
  }, [areaIds, filteredItems, selectedId]);

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      try {
        const response = await fetch("/api/mapbox/token");
        if (!response.ok) throw new Error("Mapbox is unavailable");
        const payload = (await response.json()) as { token?: string };
        if (!payload.token?.startsWith("pk.")) throw new Error("Invalid token");
        const imported = await import("mapbox-gl");
        if (cancelled || !containerRef.current) return;
        const mapboxgl = imported.default;
        mapboxgl.accessToken = payload.token;
        const map = new mapboxgl.Map({
          container: containerRef.current,
          style: "mapbox://styles/mapbox/standard",
          projection: "globe",
          center: full ? [-24, 22] : [-118.405, 33.89],
          zoom: full ? 1.55 : 9.5,
          minZoom: 0.7,
          maxZoom: 18,
          attributionControl: false,
          cooperativeGestures: full,
        });
        mapRef.current = map;
        map.addControl(
          new mapboxgl.AttributionControl({ compact: true }),
          "bottom-left",
        );
        map.addControl(new mapboxgl.NavigationControl(), "top-right");
        if (full) {
          const geolocate = new mapboxgl.GeolocateControl({
            positionOptions: { enableHighAccuracy: true },
            trackUserLocation: true,
            showUserHeading: true,
          });
          map.addControl(geolocate, "top-right");
        }
        map.on("style.load", () => {
          map.setFog({
            color: "#d9eef0",
            "high-color": "#173a63",
            "horizon-blend": 0.12,
            "space-color": "#07101e",
            "star-intensity": 0.18,
          });
        });
        map.on("load", () => {
          map.addSource("duna-discovery", {
            type: "geojson",
            data: featureCollection(filteredItems),
            cluster: true,
            clusterMaxZoom: 14,
            clusterRadius: 54,
            clusterProperties: {
              pro_count: [
                "+",
                ["case", ["==", ["get", "entityType"], "pro-tour"], 1, 0],
              ],
              venue_count: [
                "+",
                ["case", ["==", ["get", "entityType"], "venue"], 1, 0],
              ],
              coach_count: [
                "+",
                ["case", ["==", ["get", "entityType"], "coach"], 1, 0],
              ],
            },
          });
          map.addLayer({
            id: layerIds.clusters,
            type: "circle",
            source: "duna-discovery",
            filter: ["has", "point_count"],
            paint: {
              "circle-color": [
                "case",
                [">", ["get", "pro_count"], 0],
                "#f2c46d",
                ["==", ["get", "venue_count"], ["get", "point_count"]],
                "#66d9d0",
                ["==", ["get", "coach_count"], ["get", "point_count"]],
                "#ee8e74",
                "#173a63",
              ],
              "circle-radius": [
                "step",
                ["get", "point_count"],
                18,
                10,
                23,
                40,
                29,
              ],
              "circle-stroke-color": "rgba(255,255,255,.92)",
              "circle-stroke-width": 2,
              "circle-opacity": 0.94,
            },
          });
          map.addLayer({
            id: layerIds.clusterCount,
            type: "symbol",
            source: "duna-discovery",
            filter: ["has", "point_count"],
            layout: {
              "text-field": ["get", "point_count_abbreviated"],
              "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
              "text-size": 12,
            },
            paint: { "text-color": "#071b2d" },
          });
          map.addLayer({
            id: layerIds.proHalo,
            type: "circle",
            source: "duna-discovery",
            filter: [
              "all",
              ["!", ["has", "point_count"]],
              ["==", ["get", "entityType"], "pro-tour"],
            ],
            paint: {
              "circle-radius": 13,
              "circle-color": "rgba(242,196,109,.2)",
              "circle-stroke-color": "#f2c46d",
              "circle-stroke-width": 2,
            },
          });
          map.addLayer({
            id: layerIds.points,
            type: "circle",
            source: "duna-discovery",
            filter: ["!", ["has", "point_count"]],
            paint: {
              "circle-color": [
                "match",
                ["get", "entityType"],
                "venue",
                "#35c8bd",
                "coach",
                "#ec8064",
                "pro-tour",
                "#f2c46d",
                "#2d65a1",
              ],
              "circle-radius": [
                "case",
                ["==", ["get", "entityType"], "pro-tour"],
                8,
                7,
              ],
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 2,
            },
          });
          setLoaded(true);
        });
        map.on("moveend", () => setMoved(true));
        map.on("click", layerIds.clusters, (event) => {
          const feature = event.features?.[0] as unknown as
            | {
                readonly properties?: Record<string, unknown>;
                readonly geometry: { readonly coordinates: [number, number] };
              }
            | undefined;
          const clusterId = Number(feature?.properties?.cluster_id);
          if (!feature || !Number.isFinite(clusterId)) return;
          const source = map.getSource("duna-discovery") as GeoJSONSource;
          source.getClusterExpansionZoom(clusterId, (error, zoom) => {
            if (error || zoom === null || zoom === undefined) return;
            const coordinates = feature.geometry.coordinates;
            map.easeTo({ center: coordinates, zoom: Math.min(zoom, 16) });
          });
        });
        map.on("click", layerIds.points, (event) => {
          const feature = event.features?.[0] as unknown as
            { readonly properties?: Record<string, unknown> } | undefined;
          const id = feature?.properties?.id;
          if (typeof id === "string") {
            setSelectedId(id);
            setSheetExpanded(true);
          }
        });
        for (const layer of [layerIds.clusters, layerIds.points]) {
          map.on("mouseenter", layer, () => {
            map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", layer, () => {
            map.getCanvas().style.cursor = "";
          });
        }
      } catch {
        if (!cancelled) setUnavailable(true);
      }
    }
    void initialize();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [full]);

  useEffect(() => {
    setAreaIds(undefined);
    setMoved(false);
    const source = mapRef.current?.getSource("duna-discovery") as
      GeoJSONSource | undefined;
    source?.setData(featureCollection(filteredItems));
  }, [filteredItems]);

  const searchArea = () => {
    const map = mapRef.current;
    if (!map) return;
    const bounds = map.getBounds();
    if (!bounds) return;
    setAreaIds(
      filteredItems
        .filter((item) => visibleInBounds(item, bounds))
        .map((item) => item.id),
    );
    setMoved(false);
    setSheetExpanded(true);
  };

  const locate = () => {
    navigator.geolocation?.getCurrentPosition((position) => {
      mapRef.current?.flyTo({
        center: [position.coords.longitude, position.coords.latitude],
        zoom: 10,
        essential: true,
      });
    });
  };

  return (
    <section
      className={`discover-v2-map${full ? " discover-v2-map--full" : ""}`}
    >
      <div
        aria-label="Interactive discovery map"
        className="discover-v2-map__canvas"
        ref={containerRef}
      />
      {!loaded && !unavailable ? (
        <div className="discover-v2-map__loading">
          <span />
          <strong>Opening the world of sand…</strong>
        </div>
      ) : null}
      {unavailable ? (
        <div className="discover-v2-map__fallback">
          <MapIcon aria-hidden size={28} />
          <strong>Map view is almost ready.</strong>
          <span>
            {mappedItems.length} geocoded places are available in the list.
          </span>
        </div>
      ) : null}
      <div className="discover-v2-map__filters" aria-label="Map filters">
        <SlidersHorizontal aria-hidden size={15} />
        {filters.map((filter) => (
          <button
            aria-pressed={mapFilter === filter.value}
            key={filter.value}
            onClick={() => setMapFilter(filter.value)}
            type="button"
          >
            {filter.label}
          </button>
        ))}
      </div>
      {!full ? (
        <Link className="discover-v2-map__open" href="/app/discover/map">
          <MapIcon aria-hidden size={16} /> Explore the full globe
        </Link>
      ) : null}
      {full ? (
        <button
          aria-label="Center map on my location"
          className="discover-v2-map__locate"
          onClick={locate}
          type="button"
        >
          <LocateFixed aria-hidden size={18} />
        </button>
      ) : null}
      {full && moved ? (
        <button
          className="discover-v2-map__search-area"
          onClick={searchArea}
          type="button"
        >
          <Search aria-hidden size={16} /> Search this area
        </button>
      ) : null}
      {full ? (
        <div
          className={`discover-v2-sheet${sheetExpanded ? " is-expanded" : ""}`}
        >
          <button
            aria-expanded={sheetExpanded}
            className="discover-v2-sheet__handle"
            onClick={() => setSheetExpanded((value) => !value)}
            type="button"
          >
            <i />
            <span>
              <strong>{listItems.length} places in view</strong>
              <small>Pull up for the list</small>
            </span>
            {sheetExpanded ? <X aria-hidden size={18} /> : <span>↑</span>}
          </button>
          <div className="discover-v2-sheet__list">
            {listItems.slice(0, 30).map((item) => (
              <DiscoveryCard compact item={item} key={item.id} />
            ))}
            {listItems.length === 0 ? (
              <div className="discover-v2-sheet__empty">
                Move the map or clear a filter to find more play.
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="discover-v2-map__legend">
          <span>
            <i data-type="event" /> Events
          </span>
          <span>
            <i data-type="venue" /> Courts
          </span>
          <span>
            <i data-type="coach" /> Coaches
          </span>
          <span>
            <i data-type="pro-tour" /> Pro tour
          </span>
        </div>
      )}
    </section>
  );
}
