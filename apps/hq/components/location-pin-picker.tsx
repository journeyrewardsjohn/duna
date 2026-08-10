"use client";

import { LocateFixed, MapPin } from "lucide-react";
import {
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { moveMapCoordinate, nudgeMapCoordinate } from "@/lib/map-pin";

const MAP_ZOOM = 17;
const STATIC_MAP_WIDTH = 640;
const STATIC_MAP_HEIGHT = 360;

function mapPixelDelta(
  map: HTMLElement,
  deltaX: number,
  deltaY: number,
): { readonly deltaX: number; readonly deltaY: number } {
  const bounds = map.getBoundingClientRect();
  const scale = Math.max(
    bounds.width / STATIC_MAP_WIDTH,
    bounds.height / STATIC_MAP_HEIGHT,
  );
  return {
    deltaX: deltaX / scale,
    deltaY: deltaY / scale,
  };
}

export function LocationPinPicker({
  latitude,
  longitude,
  onChange,
}: {
  readonly latitude: number;
  readonly longitude: number;
  readonly onChange: (coordinates: {
    readonly latitude: number;
    readonly longitude: number;
  }) => void;
}) {
  const dragOrigin = useRef<{ x: number; y: number } | undefined>(undefined);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  function finishDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!dragOrigin.current) return;
    const renderedDeltaX = event.clientX - dragOrigin.current.x;
    const renderedDeltaY = event.clientY - dragOrigin.current.y;
    event.currentTarget.releasePointerCapture(event.pointerId);
    dragOrigin.current = undefined;
    setDragging(false);
    setOffset({ x: 0, y: 0 });
    if (Math.abs(renderedDeltaX) + Math.abs(renderedDeltaY) < 2) return;
    const map = event.currentTarget.parentElement;
    if (!map) return;
    const { deltaX, deltaY } = mapPixelDelta(
      map,
      renderedDeltaX,
      renderedDeltaY,
    );
    onChange(
      moveMapCoordinate({
        latitude,
        longitude,
        deltaX,
        deltaY,
        zoom: MAP_ZOOM,
      }),
    );
  }

  return (
    <section className="location-pin-picker" aria-label="Exact venue location">
      <header>
        <span>
          <LocateFixed aria-hidden size={17} />
          <strong>Set the exact venue pin</strong>
        </span>
        <small>
          {latitude.toFixed(6)}, {longitude.toFixed(6)}
        </small>
      </header>
      <div
        className="location-pin-picker__map"
        onClick={(event) => {
          if (dragging) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          const { deltaX, deltaY } = mapPixelDelta(
            event.currentTarget,
            event.clientX - (bounds.left + bounds.width / 2),
            event.clientY - (bounds.top + bounds.height / 2),
          );
          onChange(
            moveMapCoordinate({
              latitude,
              longitude,
              deltaX,
              deltaY,
              zoom: MAP_ZOOM,
            }),
          );
        }}
      >
        {/* The image is served through Duna so the Google key never reaches the browser. */}
        <img
          alt="Map centered on the exact venue location"
          draggable={false}
          src={`/api/places/map?latitude=${latitude}&longitude=${longitude}&zoom=${MAP_ZOOM}&marker=false`}
        />
        <button
          aria-label="Exact venue pin. Drag it, click the map, or use the arrow keys to adjust the location."
          className={`location-pin-picker__pin ${dragging ? "is-dragging" : ""}`}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            const direction =
              event.key === "ArrowUp"
                ? "up"
                : event.key === "ArrowDown"
                  ? "down"
                  : event.key === "ArrowLeft"
                    ? "left"
                    : event.key === "ArrowRight"
                      ? "right"
                      : undefined;
            if (!direction) return;
            event.preventDefault();
            onChange(
              nudgeMapCoordinate({
                latitude,
                longitude,
                direction,
                large: event.shiftKey,
                zoom: MAP_ZOOM,
              }),
            );
          }}
          onPointerCancel={finishDrag}
          onPointerDown={(event) => {
            event.stopPropagation();
            dragOrigin.current = { x: event.clientX, y: event.clientY };
            setDragging(true);
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!dragOrigin.current) return;
            setOffset({
              x: event.clientX - dragOrigin.current.x,
              y: event.clientY - dragOrigin.current.y,
            });
          }}
          onPointerUp={finishDrag}
          style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
          type="button"
        >
          <MapPin aria-hidden size={38} />
        </button>
      </div>
      <p>
        Drag the pin to the right court entrance or playing area. The Google
        address stays attached while Duna saves these exact coordinates.
      </p>
    </section>
  );
}
