"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { MapPresence } from "./map-presence";

const DiscoverMap = dynamic(() => import("./discover-map"), {
  ssr: false,
  loading: () => <div aria-hidden="true" className="dv-map dv-map--waiting" />,
});

/**
 * The venue on a map, loaded only when the map scrolls into view (the
 * engine is the heaviest thing on the page). Its frame is sized before it
 * loads, so nothing below it moves.
 */
export function VenueMap({
  id,
  name,
  latitude,
  longitude,
  presence = "on",
}: {
  /** Decided on the server: `off` draws nothing (the address stays). */
  readonly presence?: MapPresence;
  readonly id: string;
  readonly name: string;
  readonly latitude: number;
  readonly longitude: number;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [gone, setGone] = useState(presence === "off");
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  if (gone) return null;
  return (
    <div className="vn-map" ref={frame}>
      {near ? (
        <DiscoverMap
          explainMissing={presence === "explain"}
          feature="The venue map"
          onUnavailable={
            presence === "explain" ? undefined : () => setGone(true)
          }
          label={`${name} on a map`}
          points={[{ id, latitude, longitude, title: name }]}
          selectedId={id}
          zoom={15}
        />
      ) : (
        <div aria-hidden="true" className="dv-map dv-map--waiting" />
      )}
    </div>
  );
}
