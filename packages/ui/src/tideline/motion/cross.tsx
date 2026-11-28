"use client";

/**
 * Cross as a component: a view, a pane or a page travelling in over the line
 * when its key changes. Its own module, apart from the rest of the motion
 * parts, so a layout that only wraps its page in `PageTransition` (every
 * public page) does not also ship the first-open sequence, the animated list
 * and the Button they use.
 */
import { type ComponentProps, useState } from "react";
import { cx } from "../base/cx";

/**
 * Whether `key` has changed since the component mounted. Unlike
 * `useFirstRender`, a re-render with the same key (a parent's state settling
 * after mount) still counts as unchanged, so the first view never animates.
 */
function useKeyChanged(key: string): boolean {
  const [seen, setSeen] = useState({ key, changed: false });
  if (seen.key !== key) {
    setSeen({ key, changed: true });
    return true;
  }
  return seen.changed;
}

export interface CrossProps extends ComponentProps<"div"> {
  /** Changing it swaps the content with a Cross: a route path, a tab, a step. */
  transitionKey: string;
  /** `forward` arrives from the end side (next), `back` from the start side. */
  direction?: "forward" | "back";
}

/**
 * Cross: the next view travels in over the line, 320 ms on `ease-cross`.
 * CSS only, so it never blocks input (the new view is usable while it
 * arrives) and needs no browser support; the first render is still. Under
 * reduced motion it is a 200 ms fade.
 */
export function Cross({
  transitionKey,
  direction = "forward",
  className,
  ...props
}: CrossProps) {
  // Only a new key crosses. A re-render of the same view (the shell settling
  // its layout after mount) must not start the Cross on content already on
  // screen: its travel overflowed phone-width pages on load.
  const crossed = useKeyChanged(transitionKey);
  return (
    <div
      className={cx(
        crossed && "td-cross",
        crossed && direction === "back" && "td-cross--back",
        className,
      )}
      data-transition-key={transitionKey}
      key={transitionKey}
      {...props}
    />
  );
}

export type PaneTransitionProps = CrossProps;

/** A pane (detail panel, wizard step, tab panel) crossing to its next content. */
export function PaneTransition({ className, ...props }: PaneTransitionProps) {
  return <Cross className={cx("td-pane-transition", className)} {...props} />;
}

export interface PageTransitionProps extends Omit<CrossProps, "transitionKey"> {
  /**
   * The route. In the Next.js App Router pass `usePathname()` from a client
   * layout: the page content Crosses in when it changes.
   */
  routeKey: string;
}

/**
 * The page's content crossing in on a route change. Put it in a client
 * layout around `children`. It uses the CSS Cross (works in every browser,
 * never holds input); see `crossViewTransition` for the View Transitions API.
 */
export function PageTransition({
  routeKey,
  className,
  ...props
}: PageTransitionProps) {
  return (
    <Cross
      className={cx("td-page-transition", className)}
      transitionKey={routeKey}
      {...props}
    />
  );
}
