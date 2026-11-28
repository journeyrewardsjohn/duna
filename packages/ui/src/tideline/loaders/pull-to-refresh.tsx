"use client";

import {
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
  useRef,
  useState,
} from "react";
import { cx } from "../base/cx";
import { Button } from "../button/button";
import { useAction } from "../interactions/kit-hooks";
import { RallyLoader } from "./brand-loaders";

/** Pull this far (after resistance) and release to refresh. PROMOTE: --td-pull-threshold. */
const PULL_THRESHOLD = 64;
/** The furthest the content follows the finger. */
const PULL_MAX = 96;

export interface PullToRefreshProps {
  /** Reloads the list. Runs once at a time, however often it is pulled. */
  onRefresh: () => Promise<unknown>;
  /** The refresh button's label. */
  label?: string;
  /** Read while it refreshes. */
  refreshingLabel?: string;
  className?: string;
  /** The scrolling list. This element scrolls; pull works at its top. */
  children: ReactNode;
}

/**
 * Pull to refresh for lists on touch screens: the line follows the finger,
 * and on release past the threshold the crests pop and Rally while
 * `onRefresh` runs. Keyboard and switch users get the same action from a
 * Refresh button that appears when focused, so no function is gesture-only.
 * Under reduced motion the content does not travel; the line still shows
 * how far to pull.
 */
export function PullToRefresh({
  onRefresh,
  label = "Refresh",
  refreshingLabel = "Refreshing",
  className,
  children,
}: PullToRefreshProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const start = useRef<number | null>(null);
  const [pull, setPull] = useState(0);
  const refresh = useAction(() => onRefresh());

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" || refresh.pending) return;
    if ((scroller.current?.scrollTop ?? 0) > 0) return;
    start.current = event.clientY;
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (start.current === null) return;
    const distance = event.clientY - start.current;
    // Resistance: the content moves half as far as the finger.
    setPull(Math.max(0, Math.min(PULL_MAX, distance / 2)));
  };
  const onPointerEnd = () => {
    if (start.current === null) return;
    start.current = null;
    if (pull >= PULL_THRESHOLD) void refresh.run();
    setPull(0);
  };

  const armed = pull >= PULL_THRESHOLD;
  return (
    <div
      className={cx("td-pull", className)}
      data-pulling={pull > 0 ? "" : undefined}
      data-refreshing={refresh.pending ? "" : undefined}
      style={
        {
          "--td-pull": `${pull}px`,
          "--td-pull-progress": Math.min(1, pull / PULL_THRESHOLD),
        } as CSSProperties
      }
    >
      <div
        aria-hidden="true"
        className="td-pull__indicator"
        data-armed={armed ? "" : undefined}
      >
        <span className="td-pull__line" />
      </div>
      {refresh.pending ? (
        <div className="td-pull__loading">
          <RallyLoader label={refreshingLabel} size="sm" />
        </div>
      ) : null}
      <Button
        className="td-pull__button"
        size="sm"
        variant="secondary"
        {...refresh.buttonProps}
      >
        {label}
      </Button>
      <div
        className="td-pull__scroller"
        onPointerCancel={onPointerEnd}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        ref={scroller}
      >
        {children}
      </div>
    </div>
  );
}
