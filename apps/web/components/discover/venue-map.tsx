"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

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
}: {
  readonly id: string;
  readonly name: string;
  readonly latitude: number;
  readonly longitude: number;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
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
  return (
    <div className="vn-map" ref={frame}>
      {near ? (
        <DiscoverMap
          feature="The venue map"
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
