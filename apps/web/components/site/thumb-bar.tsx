"use client";

import { useEffect, useState } from "react";
import { AudienceCta } from "./site-header";

/** How far a visitor scrolls before the phone thumb bar comes up. */
export const THUMB_BAR_AFTER = 420;

/**
 * Phones only (CSS): after 420 px of scroll, one 56 px button at the thumb,
 * "Find a game" or "Start your club" by audience. It Rises in with Cross
 * timing and never covers content (the footer leaves room for it).
 */
export function ThumbBar() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const update = () => setShown(window.scrollY > THUMB_BAR_AFTER);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  return (
    <div
      aria-hidden={!shown}
      className="site-thumb"
      data-shown={shown || undefined}
      inert={!shown}
    >
      <AudienceCta block className="site-thumb__cta" />
    </div>
  );
}
