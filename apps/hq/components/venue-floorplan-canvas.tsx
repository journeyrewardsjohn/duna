"use client";

import type { VenueLayoutAsset } from "@duna/api";
import { FileImage, Move } from "lucide-react";
import { useRef } from "react";

interface VenueFloorplanCanvasProps {
  readonly imageUrl?: string;
  readonly assets: readonly VenueLayoutAsset[];
  readonly selectedAssetId?: string;
  readonly readOnly: boolean;
  readonly courtActivity?: Readonly<Record<string, string>>;
  readonly onSelect: (assetId?: string) => void;
  readonly onAssetChange: (asset: VenueLayoutAsset) => void;
}

export function VenueFloorplanCanvas({
  imageUrl,
  assets,
  selectedAssetId,
  readOnly,
  courtActivity,
  onSelect,
  onAssetChange,
}: VenueFloorplanCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<string | undefined>(undefined);

  function normalizedPoint(clientX: number, clientY: number) {
    const bounds = svgRef.current?.getBoundingClientRect();
    if (!bounds) return undefined;
    return {
      x: Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (clientY - bounds.top) / bounds.height)),
    };
  }

  function moveAsset(assetId: string, x: number, y: number) {
    const asset = assets.find((item) => item.id === assetId);
    if (
      !asset ||
      asset.locked ||
      asset.geometry.coordinateSpace !== "floorplan"
    ) {
      return;
    }
    onAssetChange({
      ...asset,
      geometry: { ...asset.geometry, center: { x, y } },
    });
  }

  function nudgeAsset(asset: VenueLayoutAsset, x: number, y: number) {
    if (asset.geometry.coordinateSpace !== "floorplan") return;
    moveAsset(
      asset.id,
      Math.max(0, Math.min(1, asset.geometry.center.x + x)),
      Math.max(0, Math.min(1, asset.geometry.center.y + y)),
    );
  }

  const floorplanAssets = assets.filter(
    (asset) => asset.geometry.coordinateSpace === "floorplan",
  );

  return (
    <div className="venue-floorplan-shell">
      <svg
        aria-label="Indoor venue floorplan canvas"
        className="venue-floorplan-canvas"
        onPointerLeave={() => {
          dragRef.current = undefined;
        }}
        onPointerMove={(event) => {
          const assetId = dragRef.current;
          if (!assetId) return;
          const point = normalizedPoint(event.clientX, event.clientY);
          if (point) moveAsset(assetId, point.x, point.y);
        }}
        onPointerUp={() => {
          dragRef.current = undefined;
        }}
        preserveAspectRatio="xMidYMid meet"
        ref={svgRef}
        role="application"
        viewBox="0 0 1000 700"
      >
        {imageUrl ? (
          <image
            height="700"
            href={imageUrl}
            opacity="0.78"
            preserveAspectRatio="xMidYMid meet"
            width="1000"
          />
        ) : (
          <g className="venue-floorplan-canvas__empty">
            <rect height="698" rx="24" width="998" x="1" y="1" />
            <text textAnchor="middle" x="500" y="330">
              Upload a venue schematic
            </text>
            <text className="is-detail" textAnchor="middle" x="500" y="365">
              AI can trace visible spaces, or you can draw manually.
            </text>
          </g>
        )}
        {floorplanAssets.map((asset) => {
          const geometry = asset.geometry;
          if (geometry.coordinateSpace !== "floorplan") return null;
          const centerX = geometry.center.x * 1000;
          const centerY = geometry.center.y * 700;
          const width = geometry.width * 1000;
          const height = geometry.height * 700;
          const bufferX = geometry.buffer * 1000;
          const bufferY = geometry.buffer * 700;
          const selected = asset.id === selectedAssetId;
          return (
            <g
              aria-label={`${asset.label} layout element`}
              className={`venue-floorplan-asset is-${asset.appearance.palette} ${
                selected ? "is-selected" : ""
              }`}
              key={asset.id}
              onClick={(event) => {
                event.stopPropagation();
                onSelect(asset.id);
              }}
              onKeyDown={(event) => {
                if (readOnly || asset.locked) return;
                const amount = event.shiftKey ? 0.01 : 0.002;
                if (event.key === "ArrowLeft") nudgeAsset(asset, -amount, 0);
                else if (event.key === "ArrowRight")
                  nudgeAsset(asset, amount, 0);
                else if (event.key === "ArrowUp") nudgeAsset(asset, 0, -amount);
                else if (event.key === "ArrowDown")
                  nudgeAsset(asset, 0, amount);
                else return;
                event.preventDefault();
              }}
              onPointerDown={(event) => {
                event.stopPropagation();
                onSelect(asset.id);
                if (readOnly || asset.locked) return;
                dragRef.current = asset.id;
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              role="button"
              tabIndex={0}
              transform={`rotate(${geometry.rotationDegrees} ${centerX} ${centerY})`}
            >
              {geometry.shape === "circle" ? (
                <>
                  <circle
                    className="venue-floorplan-asset__buffer"
                    cx={centerX}
                    cy={centerY}
                    r={(geometry.radius ?? geometry.width / 2) * 700 + bufferY}
                  />
                  <circle
                    className="venue-floorplan-asset__core"
                    cx={centerX}
                    cy={centerY}
                    r={(geometry.radius ?? geometry.width / 2) * 700}
                  />
                </>
              ) : (
                <>
                  <rect
                    className="venue-floorplan-asset__buffer"
                    height={height + bufferY * 2}
                    rx="8"
                    width={width + bufferX * 2}
                    x={centerX - width / 2 - bufferX}
                    y={centerY - height / 2 - bufferY}
                  />
                  <rect
                    className="venue-floorplan-asset__core"
                    height={height}
                    rx="8"
                    width={width}
                    x={centerX - width / 2}
                    y={centerY - height / 2}
                  />
                </>
              )}
              <text
                className="venue-floorplan-asset__label"
                textAnchor="middle"
                transform={`rotate(${-geometry.rotationDegrees} ${centerX} ${centerY})`}
                x={centerX}
                y={centerY - 3}
              >
                {asset.label}
              </text>
              {asset.identifierCode && (
                <text
                  className="venue-floorplan-asset__code"
                  textAnchor="middle"
                  transform={`rotate(${-geometry.rotationDegrees} ${centerX} ${centerY})`}
                  x={centerX}
                  y={centerY + 15}
                >
                  {asset.identifierCode}
                </text>
              )}
              {asset.courtId && courtActivity?.[asset.courtId] && (
                <text
                  className="venue-floorplan-asset__activity"
                  textAnchor="middle"
                  transform={`rotate(${-geometry.rotationDegrees} ${centerX} ${centerY})`}
                  x={centerX}
                  y={centerY + 31}
                >
                  {courtActivity[asset.courtId]}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="venue-floorplan-shell__mode">
        {imageUrl ? (
          <Move aria-hidden size={15} />
        ) : (
          <FileImage aria-hidden size={15} />
        )}
        {imageUrl ? "Schematic · normalized geometry" : "Schematic needed"}
      </div>
    </div>
  );
}
