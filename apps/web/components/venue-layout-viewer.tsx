"use client";

import {
  bbox,
  circle,
  destination,
  featureCollection,
  point,
  polygon,
} from "@turf/turf";
import type { PublicVenueLayout, VenueLayoutAsset } from "@duna/api";
import { Numeric } from "@duna/ui";
import {
  ArrowUpRight,
  LocateFixed,
  MapPin,
  Ticket,
  Users,
  Waves,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapboxMap } from "mapbox-gl";

function offset(
  center: { readonly latitude: number; readonly longitude: number },
  east: number,
  north: number,
) {
  const meters = Math.hypot(east, north);
  if (!meters) return [center.longitude, center.latitude];
  const bearing = (Math.atan2(east, north) * 180) / Math.PI;
  return destination(
    point([center.longitude, center.latitude]),
    meters,
    bearing,
    {
      units: "meters",
    },
  ).geometry.coordinates;
}

function mapData(layout: PublicVenueLayout, selectedAssetId?: string) {
  const features = layout.assets.flatMap((asset) => {
    const geometry = asset.geometry;
    if (geometry.coordinateSpace !== "geo") return [];
    const liveMatch = asset.courtId
      ? layout.liveMatches.find((match) => match.courtId === asset.courtId)
      : undefined;
    const liveScore = liveMatch?.score
      ? ` · ${liveMatch.score.setsA}–${liveMatch.score.setsB} (${liveMatch.score.pointsA}–${liveMatch.score.pointsB})`
      : "";
    const properties = {
      assetId: asset.id,
      label: liveMatch
        ? `${asset.label}\n${liveMatch.teamAName} vs ${liveMatch.teamBName}${liveScore}`
        : asset.label,
      kind: asset.kind,
      palette: asset.appearance.palette,
      selected: asset.id === selectedAssetId,
    };
    if (geometry.shape === "circle") {
      return [
        circle(
          point([geometry.center.longitude, geometry.center.latitude]),
          (geometry.radiusMeters ?? geometry.widthMeters / 2) +
            geometry.bufferMeters,
          {
            steps: 48,
            units: "meters",
            properties: { ...properties, layer: "buffer" },
          },
        ),
        circle(
          point([geometry.center.longitude, geometry.center.latitude]),
          geometry.radiusMeters ?? geometry.widthMeters / 2,
          {
            steps: 48,
            units: "meters",
            properties: { ...properties, layer: "core" },
          },
        ),
      ];
    }
    if (geometry.shape === "polygon" && geometry.points?.length) {
      const coordinates = geometry.points.map((item) => [
        item.longitude,
        item.latitude,
      ]);
      return [
        polygon([[...coordinates, coordinates[0]!]], {
          ...properties,
          layer: "core",
        }),
      ];
    }
    const rotation = (geometry.rotationDegrees * Math.PI) / 180;
    const coordinates = (extra: number) => {
      const halfWidth = geometry.widthMeters / 2 + extra;
      const halfHeight = geometry.heightMeters / 2 + extra;
      return [
        [-halfWidth, -halfHeight],
        [halfWidth, -halfHeight],
        [halfWidth, halfHeight],
        [-halfWidth, halfHeight],
      ].map(([x, y]) =>
        offset(
          geometry.center,
          x! * Math.cos(rotation) - y! * Math.sin(rotation),
          x! * Math.sin(rotation) + y! * Math.cos(rotation),
        ),
      );
    };
    const bufferCoordinates = coordinates(geometry.bufferMeters);
    const coreCoordinates = coordinates(0);
    return [
      polygon([[...bufferCoordinates, bufferCoordinates[0]!]], {
        ...properties,
        layer: "buffer",
      }),
      polygon([[...coreCoordinates, coreCoordinates[0]!]], {
        ...properties,
        layer: "core",
      }),
    ];
  });
  return featureCollection(features);
}

function PlayerLayoutMap({
  layout,
  selectedAssetId,
  onSelect,
}: {
  readonly layout: PublicVenueLayout;
  readonly selectedAssetId?: string;
  readonly onSelect: (assetId?: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | undefined>(undefined);
  const frameRef = useRef<number | undefined>(undefined);
  const selectedRef = useRef(selectedAssetId);
  const [error, setError] = useState(false);
  selectedRef.current = selectedAssetId;

  useEffect(() => {
    const source = mapRef.current?.getSource("player-venue-layout") as
      GeoJSONSource | undefined;
    if (!source) return;
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() =>
      source.setData(mapData(layout, selectedAssetId)),
    );
  }, [layout, selectedAssetId]);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      try {
        const response = await fetch("/api/mapbox/token");
        const payload = (await response.json()) as { readonly token?: string };
        if (!response.ok || !payload.token) throw new Error("Map unavailable");
        const mapboxgl = await import("mapbox-gl");
        if (cancelled || !containerRef.current) return;
        mapboxgl.default.accessToken = payload.token;
        const map = new mapboxgl.default.Map({
          container: containerRef.current,
          style: "mapbox://styles/mapbox/satellite-streets-v12",
          center: [
            layout.mapCenterLongitude ?? 0,
            layout.mapCenterLatitude ?? 0,
          ],
          zoom: layout.mapZoom,
          bearing: layout.mapBearing,
          pitch: layout.mapPitch,
          maxZoom: 22,
          cooperativeGestures: true,
        });
        mapRef.current = map;
        map.addControl(new mapboxgl.default.NavigationControl(), "top-right");
        map.on("load", () => {
          const styles = getComputedStyle(containerRef.current!);
          const color = (token: string) =>
            styles.getPropertyValue(token).trim() || "transparent";
          const data = mapData(layout, selectedRef.current);
          const firstLabel = map
            .getStyle()
            .layers?.find(
              (layer) =>
                layer.type === "symbol" &&
                Boolean(layer.layout && "text-field" in layer.layout),
            )?.id;
          map.addSource("player-venue-layout", { type: "geojson", data });
          map.addLayer(
            {
              id: "player-venue-layout-buffer",
              type: "fill",
              source: "player-venue-layout",
              filter: ["==", ["get", "layer"], "buffer"],
              paint: {
                "fill-color": [
                  "match",
                  ["get", "palette"],
                  "sand",
                  color("--player-layout-sand"),
                  "ticketed",
                  color("--player-layout-ticketed"),
                  "amenity",
                  color("--player-layout-amenity"),
                  "service",
                  color("--player-layout-service"),
                  color("--player-layout-neutral"),
                ],
                "fill-opacity": 0.2,
              },
            },
            firstLabel,
          );
          map.addLayer(
            {
              id: "player-venue-layout-fill",
              type: "fill",
              source: "player-venue-layout",
              filter: ["==", ["get", "layer"], "core"],
              paint: {
                "fill-color": [
                  "match",
                  ["get", "palette"],
                  "sand",
                  color("--player-layout-sand"),
                  "ticketed",
                  color("--player-layout-ticketed"),
                  "amenity",
                  color("--player-layout-amenity"),
                  "service",
                  color("--player-layout-service"),
                  color("--player-layout-neutral"),
                ],
                "fill-opacity": 0.78,
              },
            },
            firstLabel,
          );
          map.addLayer(
            {
              id: "player-venue-layout-outline",
              type: "line",
              source: "player-venue-layout",
              filter: ["==", ["get", "layer"], "core"],
              paint: {
                "line-color": [
                  "case",
                  ["==", ["get", "selected"], true],
                  color("--player-layout-selected"),
                  color("--player-layout-outline"),
                ],
                "line-width": ["case", ["==", ["get", "selected"], true], 4, 2],
              },
            },
            firstLabel,
          );
          map.addLayer(
            {
              id: "player-venue-layout-label",
              type: "symbol",
              source: "player-venue-layout",
              filter: ["==", ["get", "layer"], "core"],
              layout: {
                "text-field": ["get", "label"],
                "text-size": 12,
                "text-font": ["DIN Pro Medium", "Arial Unicode MS Bold"],
              },
              paint: {
                "text-color": color("--player-layout-label"),
                "text-halo-color": color("--player-layout-outline"),
                "text-halo-width": 1,
              },
            },
            firstLabel,
          );
          map.on("click", "player-venue-layout-fill", (event) => {
            const assetId = event.features?.[0]?.properties?.assetId;
            if (typeof assetId === "string") onSelect(assetId);
          });
          map.on("mouseenter", "player-venue-layout-fill", () => {
            map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", "player-venue-layout-fill", () => {
            map.getCanvas().style.cursor = "";
          });
          if (data.features.length) {
            const bounds = bbox(data);
            map.fitBounds(
              [
                [bounds[0], bounds[1]],
                [bounds[2], bounds[3]],
              ],
              { padding: 70, duration: 0, maxZoom: 20.5 },
            );
          }
        });
      } catch {
        if (!cancelled) setError(true);
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
    <div className="player-venue-layout__map" ref={containerRef}>
      {error && (
        <div role="status">
          <MapPin aria-hidden size={25} />
          <strong>Venue map unavailable</strong>
          <span>Use the court directory below.</span>
        </div>
      )}
    </div>
  );
}

function PlayerFloorplan({
  layout,
  selectedAssetId,
  onSelect,
}: {
  readonly layout: PublicVenueLayout;
  readonly selectedAssetId?: string;
  readonly onSelect: (assetId?: string) => void;
}) {
  return (
    <svg
      aria-label="Venue floorplan"
      className="player-venue-layout__floorplan"
      preserveAspectRatio="xMidYMid meet"
      viewBox="0 0 1000 700"
    >
      {layout.floorplanImageUrl && (
        <image
          height="700"
          href={layout.floorplanImageUrl}
          opacity="0.75"
          preserveAspectRatio="xMidYMid meet"
          width="1000"
        />
      )}
      {layout.assets.map((asset) => {
        const geometry = asset.geometry;
        if (geometry.coordinateSpace !== "floorplan") return null;
        const liveMatch = asset.courtId
          ? layout.liveMatches.find((match) => match.courtId === asset.courtId)
          : undefined;
        const x = geometry.center.x * 1000;
        const y = geometry.center.y * 700;
        const width = geometry.width * 1000;
        const height = geometry.height * 700;
        return (
          <g
            className={`is-${asset.appearance.palette} ${asset.id === selectedAssetId ? "is-selected" : ""}`}
            key={asset.id}
            onClick={() => onSelect(asset.id)}
            role="button"
            tabIndex={0}
            transform={`rotate(${geometry.rotationDegrees} ${x} ${y})`}
          >
            {geometry.shape === "circle" ? (
              <circle
                cx={x}
                cy={y}
                r={(geometry.radius ?? geometry.width / 2) * 700}
              />
            ) : (
              <rect
                height={height}
                rx="8"
                width={width}
                x={x - width / 2}
                y={y - height / 2}
              />
            )}
            <text
              textAnchor="middle"
              transform={`rotate(${-geometry.rotationDegrees} ${x} ${y})`}
              x={x}
              y={y + 4}
            >
              {asset.label}
            </text>
            {liveMatch && (
              <text
                className="is-live-label"
                textAnchor="middle"
                transform={`rotate(${-geometry.rotationDegrees} ${x} ${y})`}
                x={x}
                y={y + 22}
              >
                {liveMatch.teamAName} vs {liveMatch.teamBName}
                {liveMatch.score
                  ? ` · ${liveMatch.score.setsA}–${liveMatch.score.setsB}`
                  : ""}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function assetIcon(asset: VenueLayoutAsset) {
  if (asset.kind === "court") return <Waves aria-hidden size={18} />;
  if (asset.kind === "ticketed-space" || asset.kind === "table") {
    return <Ticket aria-hidden size={18} />;
  }
  return <Users aria-hidden size={18} />;
}

export function VenueLayoutViewer({
  layout,
  venueName,
}: {
  readonly layout: PublicVenueLayout;
  readonly venueName: string;
}) {
  const [selectedAssetId, setSelectedAssetId] = useState(
    layout.assets.find((asset) => asset.kind === "court")?.id,
  );
  const selected = layout.assets.find((asset) => asset.id === selectedAssetId);
  const selectedMatch = selected?.courtId
    ? layout.liveMatches.find((match) => match.courtId === selected.courtId)
    : undefined;
  const directions = useMemo(() => {
    const geometry = selected?.geometry;
    const center =
      geometry?.coordinateSpace === "geo"
        ? geometry.center
        : layout.mapCenterLatitude !== undefined &&
            layout.mapCenterLongitude !== undefined
          ? {
              latitude: layout.mapCenterLatitude,
              longitude: layout.mapCenterLongitude,
            }
          : undefined;
    return center
      ? `https://www.google.com/maps/dir/?api=1&destination=${center.latitude},${center.longitude}`
      : undefined;
  }, [layout.mapCenterLatitude, layout.mapCenterLongitude, selected]);
  return (
    <section className="player-venue-layout">
      <header>
        <div>
          <span>
            <LocateFixed aria-hidden size={16} /> FIND YOUR COURT
          </span>
          <h2>{layout.name}</h2>
          <p>
            Use the visual map and court identifiers to navigate {venueName}.
          </p>
        </div>
        {directions && (
          <a href={directions} rel="noreferrer" target="_blank">
            Open directions <ArrowUpRight aria-hidden size={16} />
          </a>
        )}
      </header>
      <div className="player-venue-layout__grid">
        {layout.sourceType === "satellite" ? (
          <PlayerLayoutMap
            layout={layout}
            onSelect={setSelectedAssetId}
            selectedAssetId={selectedAssetId}
          />
        ) : (
          <PlayerFloorplan
            layout={layout}
            onSelect={setSelectedAssetId}
            selectedAssetId={selectedAssetId}
          />
        )}
        <aside>
          <div className="player-venue-layout__selected">
            {selected ? (
              <>
                <span className={`is-${selected.appearance.palette}`}>
                  {assetIcon(selected)}
                </span>
                <div>
                  <small>{selected.kind.replaceAll("-", " ")}</small>
                  <strong>{selected.label}</strong>
                  {selected.identifierCode && <b>{selected.identifierCode}</b>}
                </div>
                {selected.capacity && (
                  <Numeric>
                    {selected.capacity}
                    <small>capacity</small>
                  </Numeric>
                )}
                {selectedMatch && (
                  <div className="player-venue-layout__live">
                    <span>
                      <i />{" "}
                      {selectedMatch.status === "live" ? "LIVE" : "WARMUP"}
                    </span>
                    <strong>
                      {selectedMatch.teamAName} <em>vs</em>{" "}
                      {selectedMatch.teamBName}
                    </strong>
                    {selectedMatch.score && (
                      <Numeric>
                        {selectedMatch.score.setsA}–{selectedMatch.score.setsB}
                        <small>
                          {selectedMatch.score.pointsA}–
                          {selectedMatch.score.pointsB}
                        </small>
                      </Numeric>
                    )}
                  </div>
                )}
              </>
            ) : (
              <p>Select a court or venue space.</p>
            )}
          </div>
          <div className="player-venue-layout__directory">
            {layout.assets.map((asset) => (
              <button
                aria-pressed={asset.id === selectedAssetId}
                key={asset.id}
                onClick={() => setSelectedAssetId(asset.id)}
                type="button"
              >
                <span className={`is-${asset.appearance.palette}`}>
                  {assetIcon(asset)}
                </span>
                <span>
                  <strong>{asset.label}</strong>
                  <small>
                    {asset.identifierCode ?? asset.kind.replaceAll("-", " ")}
                  </small>
                </span>
              </button>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}
