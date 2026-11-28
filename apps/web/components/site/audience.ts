"use client";

import { useCallback, useSyncExternalStore } from "react";
import { siteAudienceStorageKey } from "./boot";

/** Who the visitor says they are. It changes the primary call to action only. */
export type SiteAudience = "play" | "run";

const changeEvent = "duna-site-audience-change";

function read(): SiteAudience {
  if (typeof document === "undefined") return "play";
  return document.documentElement.dataset.audience === "run" ? "run" : "play";
}

function subscribe(notify: () => void) {
  // Another tab changed it: take its value, then repaint.
  const fromStorage = (event: StorageEvent) => {
    if (event.key !== siteAudienceStorageKey) return;
    document.documentElement.dataset.audience =
      event.newValue === "run" ? "run" : "play";
    notify();
  };
  window.addEventListener(changeEvent, notify);
  window.addEventListener("storage", fromStorage);
  return () => {
    window.removeEventListener(changeEvent, notify);
    window.removeEventListener("storage", fromStorage);
  };
}

/** Remembers the choice on this device and repaints every call to action. */
export function setSiteAudience(audience: SiteAudience) {
  document.documentElement.dataset.audience = audience;
  try {
    window.localStorage.setItem(siteAudienceStorageKey, audience);
  } catch {
    // Private windows may refuse storage; the choice still applies now.
  }
  window.dispatchEvent(new Event(changeEvent));
}

/**
 * The audience, read from `<html data-audience>` (written before paint by the
 * boot script, so server and first client render agree on "play" and then
 * settle on the stored value without a flash in the CSS-driven parts).
 */
export function useSiteAudience(): [
  SiteAudience,
  (next: SiteAudience) => void,
] {
  const audience = useSyncExternalStore(subscribe, read, () => "play" as const);
  const update = useCallback((next: SiteAudience) => setSiteAudience(next), []);
  return [audience, update];
}
