/**
 * When intros show: once per section on the first visit (after the screen
 * has drawn, never in front of a whole-window route or another sheet), and
 * on request from the profile's "What's in Duna". Every way of closing an
 * intro marks what was shown as seen.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { RouteKey, TabKey } from "../../app/router";
import { introForLocation, introToShow, type IntroKey } from "./intro-content";
import type { IntroRequest } from "./IntroSheet";
import { loadSeenIntros, saveSeenIntros } from "./intro-store";

/** The section's screen draws first; the intro follows it up. */
const SETTLE_MS = 650;

export function useIntros({
  tab,
  route,
  blocked,
}: {
  readonly tab: TabKey;
  readonly route: RouteKey | null;
  /** A whole-window route, a sheet or a modal is in front. */
  readonly blocked: boolean;
}) {
  const [request, setRequest] = useState<IntroRequest | null>(null);
  const [seen, setSeen] = useState<Set<IntroKey> | null>(null);

  useEffect(() => {
    let active = true;
    void loadSeenIntros().then((stored) => {
      // An unreadable store shows nothing automatically (see intro-store).
      if (active)
        setSeen(
          stored ?? new Set(["find", "play", "rating", "wallet", "profile"]),
        );
    });
    return () => {
      active = false;
    };
  }, []);

  const requestRef = useRef(request);
  requestRef.current = request;

  useEffect(() => {
    if (!seen || blocked || requestRef.current) return;
    const key = introToShow(introForLocation(tab, route), seen);
    if (!key) return;
    const timer = setTimeout(() => {
      if (!requestRef.current) setRequest({ kind: "section", key });
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [blocked, route, seen, tab]);

  const close = useCallback((shown: readonly IntroKey[]) => {
    setRequest(null);
    setSeen((current) => {
      const next = new Set(current ?? []);
      for (const key of shown) next.add(key);
      void saveSeenIntros(next);
      return next;
    });
  }, []);

  const show = useCallback((next: IntroRequest) => setRequest(next), []);

  return { request, show, close };
}
