"use client";

import { useSyncExternalStore } from "react";

/**
 * When the first screen of a visit has arrived: the document has loaded, the
 * entrance motion has had time to finish, and the browser has a quiet moment.
 * Until then the public site spends a phone's bandwidth and main thread on
 * the page in front of the visitor, not on pages they might open next
 * (link prefetch) or on parts nobody has asked for yet (the phone menu).
 *
 * A visitor who starts using the page (a scroll, a tap, a key) settles it at
 * once: what they reach for comes first. Once settled it stays settled for
 * the rest of the visit, so client-side navigations prefetch at once.
 * Nothing here changes what a visitor sees.
 * See docs/design/website-performance.md §7.
 */

/**
 * The hero's Rally ends about 1.4 s after the first paint (up to eight items
 * 120 ms apart, each a 600 ms Rise). Work that can wait starts after it.
 */
export const FIRST_VIEW_MS = 1500;

let settled = false;
let scheduled = false;
const listeners = new Set<() => void>();

/** What counts as the visitor starting to use the page. */
const intentEvents = [
  "keydown",
  "pointerdown",
  "scroll",
  "touchstart",
] as const;

function settle() {
  if (settled) return;
  settled = true;
  for (const type of intentEvents) {
    window.removeEventListener(type, settle, { capture: true });
  }
  for (const listener of listeners) listener();
  listeners.clear();
}

function whenIdle() {
  const wait = Math.max(0, FIRST_VIEW_MS - performance.now());
  window.setTimeout(() => {
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(settle, { timeout: 1000 });
    } else {
      settle();
    }
  }, wait);
}

function schedule() {
  if (scheduled || typeof window === "undefined") return;
  scheduled = true;
  for (const type of intentEvents) {
    window.addEventListener(type, settle, { capture: true, passive: true });
  }
  if (document.readyState === "complete") whenIdle();
  else window.addEventListener("load", whenIdle, { once: true });
}

function subscribe(listener: () => void) {
  if (settled) return () => {};
  listeners.add(listener);
  schedule();
  return () => {
    listeners.delete(listener);
  };
}

/** False on the server and during the first screen; true once it has settled. */
export function useFirstViewSettled(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => settled,
    () => false,
  );
}

/** Resolves once the first screen has settled (never on the server). */
export function firstViewSettled(): Promise<void> {
  if (settled) return Promise.resolve();
  return new Promise((resolve) => {
    listeners.add(resolve);
    schedule();
  });
}
