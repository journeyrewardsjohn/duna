"use client";

import {
  type ComponentType,
  createElement,
  lazy,
  type ReactNode,
  Suspense,
} from "react";
import { firstViewSettled } from "./first-view";

/**
 * A client component whose script waits for the first screen to settle.
 *
 * The server renders it as usual, so its HTML is in the document from the
 * first byte: same markup, same layout, nothing a visitor can see changes.
 * In the browser its code is fetched once the first screen has settled (or
 * the visitor starts scrolling or tapping); until then React keeps the
 * server's HTML in place and hydrates it when the code arrives (selective
 * hydration). Use it for islands below the first screen (the concept
 * animations, calculators lower on a page), never for the hero.
 *
 * `load` must be a dynamic `import()`, so the component lands in its own
 * chunk instead of the page's first-view script. Only a page that renders
 * the island fetches it. After a client navigation (no server HTML) the
 * island appears when its code arrives; islands sit below the first screen,
 * so that is out of view.
 */
export function deferHydration<Props extends object>(
  load: () => Promise<ComponentType<Props>>,
): ComponentType<Props> {
  let loaded: ComponentType<Props> | undefined;
  let pending: Promise<{ default: ComponentType<Props> }> | undefined;
  const fetchComponent = () => {
    pending ??= load().then((component) => {
      loaded = component;
      return { default: component };
    });
    return pending;
  };
  const Lazy = lazy(() =>
    typeof window === "undefined"
      ? fetchComponent()
      : firstViewSettled().then(fetchComponent),
  );
  function Deferred(props: Props): ReactNode {
    // The same tree on both sides of hydration: one Suspense boundary
    // around the component, lazy until its code is here.
    return (
      <Suspense fallback={null}>
        {loaded ? createElement(loaded, props) : <Lazy {...props} />}
      </Suspense>
    );
  }
  return Deferred;
}
