"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The phase of a concept that plays once when it comes into view.
 * - `rest`: the end state. What the server renders, what a visitor without
 *   script or with reduced motion sees, and what a concept already on screen
 *   when the page loads keeps (it never jumps back to replay).
 * - `armed`: below the fold after hydration; the start state, unseen.
 * - `play`: 45% of it is visible; it plays from the start state to the end.
 */
export type PlayPhase = "rest" | "armed" | "play";

/** How much of a concept must be visible before it plays (spec 2.10). */
export const PLAY_THRESHOLD = 0.45;

function reducedMotion() {
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function usePlayOnce<T extends Element>(
  threshold: number = PLAY_THRESHOLD,
) {
  const ref = useRef<T>(null);
  const [phase, setPhase] = useState<PlayPhase>("rest");
  useEffect(() => {
    const element = ref.current;
    if (!element || reducedMotion() || !("IntersectionObserver" in window))
      return;
    const box = element.getBoundingClientRect();
    if (box.width === 0 && box.height === 0) return;
    if (box.top < window.innerHeight && box.bottom > 0) return;
    setPhase("armed");
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setPhase("play");
          observer.disconnect();
        }
      },
      { threshold },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [threshold]);
  return { ref, phase };
}

/**
 * Plays a concept when a parent says it is active (the story's sticky media
 * column), once per activation: `rest` until first activated, then `play`.
 */
export function useActivatedPhase(active: boolean): PlayPhase {
  const [phase, setPhase] = useState<PlayPhase>("rest");
  const played = useRef(false);
  useEffect(() => {
    if (!active || played.current) return;
    played.current = true;
    if (reducedMotion()) return;
    setPhase("play");
  }, [active]);
  return phase;
}
