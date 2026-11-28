"use client";

import {
  fitConditionsLine,
  formatTime,
  lightMarkFor,
  type ConditionThresholds,
  type HourlyConditions,
  type PlayCall,
  type SunTimes,
  type UnitSystem,
} from "@duna/tideline-core";
import {
  Drawer as UiDrawer,
  DrawerTrigger as UiDrawerTrigger,
} from "@ui-sdk/react/drawer";
import {
  Popover as UiPopover,
  PopoverTrigger as UiPopoverTrigger,
} from "@ui-sdk/react/popover";
import {
  Fragment,
  type ReactNode,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { cx } from "../base/cx";
import { Icon } from "../base/icons";
import { SheetContent } from "../dialog/dialog";
import { riseClassName } from "../motion/verbs";
import { PopoverContent } from "../popover/popover";
import {
  freshness,
  lineParts,
  playCallView,
  temperatureText,
  type ConditionsStatus,
} from "./conditions-logic";
import { lightGlyph } from "./light-mark";

export interface ConditionsLineProps {
  conditions?: HourlyConditions | null;
  status?: ConditionsStatus;
  readAt?: number;
  now?: number;
  freshMinutes?: number;
  units?: UnitSystem;
  thresholds?: Partial<ConditionThresholds>;
  /** The service's call wins over the numbers (lightning). */
  call?: PlayCall;
  /** Words for that call ("Lightning 8 mi away"). */
  reason?: string;
  /** Sun times for the venue's date: adds the light now and the sunset. */
  sun?: SunTimes | null;
  courtIsLit?: boolean;
  timeZone: string;
  locale?: string;
  /** What the line opens: usually `<Conditions … />`. Without it the line is static. */
  panel?: ReactNode;
  /** The panel's title ("Conditions · Sat, Nov 28"). */
  panelTitle?: string;
  /** The line's accessible name when it opens the panel. */
  label?: string;
  className?: string;
}

const WIDE = "(min-width: 900px)";

function subscribe(onChange: () => void): () => void {
  if (typeof matchMedia !== "function") return () => {};
  const query = matchMedia(WIDE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Popover on wide screens, sheet on phones. The server renders the popover form. */
function useWide(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => (typeof matchMedia === "function" ? matchMedia(WIDE).matches : true),
    () => true,
  );
}

/**
 * One compact line of conditions for a list row or a schedule header:
 * temperature, wind with its direction, the light now and sunset, and the
 * play call only when it is caution or stop (icon and words, never colour
 * alone; stop is `danger` and announced). It never wraps: when space is
 * short it drops parts in the core's order (sunset first; the call never).
 * It opens the full `Conditions` as a popover on desktop and a sheet on
 * phones, the panel Rising from the line. Honest states fit the same row:
 * loading, no data, stale (says how old) and not set up yet.
 */
export function ConditionsLine({
  conditions,
  status = "ready",
  readAt,
  now,
  freshMinutes,
  units = "us",
  thresholds,
  call,
  reason,
  sun,
  courtIsLit = false,
  timeZone,
  locale = "en-US",
  panel,
  panelTitle = "Conditions",
  label = "Light and weather. Open full conditions",
  className,
}: ConditionsLineProps) {
  const wide = useWide();
  const line = useRef<HTMLSpanElement>(null);
  const ready = status === "ready" && Boolean(conditions);
  const hour = conditions ?? { at: now ?? 0 };
  const view = playCallView(hour, { thresholds, call, reason });
  const { parts } = lineParts(hour, {
    units,
    sunsetAt: sun?.sunset ?? null,
    thresholds,
  });
  const fresh = freshness(readAt, now, freshMinutes);
  // The reason is shown by the call lead, so the line's own reason part is the call.
  const all = parts;
  const [keep, setKeep] = useState(all.length);
  const [width, setWidth] = useState(0);

  // Fit on one line: drop the lowest-priority part until nothing overflows.
  useLayoutEffect(() => {
    const element = line.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const next = Math.round(entries[0]?.contentRect.width ?? 0);
      setWidth((previous) => {
        if (next > previous) setKeep(all.length);
        return next;
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [all.length]);
  useLayoutEffect(() => {
    const element = line.current;
    if (!element) return;
    const reasonPart = element.querySelector<HTMLElement>(
      ".td-condline__reason",
    );
    const squeezed =
      element.scrollWidth > element.clientWidth + 1 ||
      (reasonPart !== null &&
        reasonPart.scrollWidth > reasonPart.clientWidth + 1);
    if (squeezed && keep > 1) {
      setKeep((k) => k - 1);
    }
  }, [keep, width, all.length]);

  const shown = fitConditionsLine({ call: view.call, units, parts: all }, keep);
  const kinds = new Set(shown.map((p) => p.kind));
  const time = (ms: number) => formatTime(ms, { locale, timeZone });
  const glyph =
    sun && ready
      ? lightGlyph(lightMarkFor(hour.at, { sun, courtIsLit }))
      : null;

  if (status === "not-configured") {
    return (
      <span
        className={cx("td-condline", className)}
        data-state="not-configured"
        role="status"
      >
        <Icon name="info" size="chip" />
        <span className="td-condline__text">
          Weather isn&rsquo;t set up yet
        </span>
      </span>
    );
  }
  if (status === "loading") {
    return (
      <span
        aria-busy="true"
        className={cx("td-condline", className)}
        data-state="loading"
        role="status"
      >
        <span className="td-skel td-condline__skel" />
        <span className="td-sr">Loading weather</span>
      </span>
    );
  }
  if (!ready) {
    return (
      <span
        className={cx("td-condline", className)}
        data-state="no-data"
        role="status"
      >
        <Icon name="info" size="chip" />
        <span className="td-condline__text">No weather for this location</span>
      </span>
    );
  }

  const windPart = shown.find((p) => p.kind === "wind");
  // "Caution · Gusty 32 mph" says it once: the wind part names a wind reason.
  const windSaysIt = Boolean(windPart?.gusty) && view.reasonKind === "gusts";
  const items: ReactNode[] = [];
  if (view.call !== "good") {
    items.push(
      <span className="td-condline__call" key="call">
        <Icon name={view.icon} size="chip" />
        <b>{view.words}</b>
        {view.reason && !windSaysIt ? (
          <span className="td-condline__reason">{view.reason}</span>
        ) : null}
      </span>,
    );
  }
  if (fresh?.stale) {
    items.push(
      <span className="td-condline__item td-condline__stale" key="stale">
        <Icon name="clock" size="chip" />
        {fresh.ago}
      </span>,
    );
  }
  if (kinds.has("temp") && hour.temperatureC !== undefined) {
    items.push(
      <span className="td-condline__item" key="temp">
        <b>{temperatureText(hour.temperatureC, units)}</b>
      </span>,
    );
  }
  if (windPart?.text) {
    items.push(
      <span className="td-condline__item" key="wind">
        <Icon name={windPart.gusty ? "gust" : "wind"} size="chip" />
        {windPart.text}
      </span>,
    );
  }
  for (const part of shown) {
    if ((part.kind === "rain" || part.kind === "uv") && part.text) {
      items.push(
        <span className="td-condline__item" key={part.kind}>
          <Icon name={part.kind} size="chip" />
          {part.text}
        </span>,
      );
    }
  }
  if (kinds.has("sunset") && sun?.sunset != null) {
    items.push(
      <span className="td-condline__item" key="sunset">
        {glyph ? <Icon data-light={glyph} name={glyph} size="chip" /> : null}
        Sunset {time(sun.sunset)}
      </span>,
    );
  }

  const spoken = [
    view.call !== "good"
      ? `${view.words}${view.reason ? `: ${view.reason}` : ""}`
      : null,
    fresh?.stale ? `read ${fresh.ago}` : null,
    hour.temperatureC !== undefined
      ? temperatureText(hour.temperatureC, units)
      : null,
    windPart?.text ?? null,
    sun?.sunset != null ? `sunset ${time(sun.sunset)}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const content = (
    <span className="td-condline__parts" ref={line}>
      {items.map((item, index) => (
        <Fragment key={index}>
          {index > 0 ? (
            <span aria-hidden="true" className="td-condline__sep">
              ·
            </span>
          ) : null}
          {item}
        </Fragment>
      ))}
    </span>
  );
  const alert =
    view.call === "stop" ? (
      <span className="td-sr" role="alert">
        {view.words}
        {view.reason ? `: ${view.reason}` : ""}
      </span>
    ) : null;

  if (!panel) {
    return (
      <span
        className={cx("td-condline", className)}
        data-call={view.call}
        data-stale={fresh?.stale ? "" : undefined}
      >
        <span className="td-sr">{spoken}</span>
        <span aria-hidden="true" className="td-condline__visual">
          {content}
        </span>
        {alert}
      </span>
    );
  }

  const trigger = (
    <>
      <span className="td-sr">{`${label}. ${spoken}`}</span>
      <span aria-hidden="true" className="td-condline__visual">
        {content}
      </span>
      <Icon
        className="td-condline__go"
        name={wide ? "chevron-down" : "chevron-right"}
        size="chip"
      />
    </>
  );
  const body = (
    <div
      className={riseClassName(
        { from: wide ? "top" : "bottom", short: true },
        "td-condline__panel",
      )}
    >
      {panel}
    </div>
  );

  return (
    <span className={cx("td-condline-root", className)}>
      {wide ? (
        <UiPopover>
          <UiPopoverTrigger
            className="td-condline td-condline--button"
            data-call={view.call}
            data-stale={fresh?.stale ? "" : undefined}
          >
            {trigger}
          </UiPopoverTrigger>
          <PopoverContent
            align="start"
            className="td-condline__popover"
            title={panelTitle}
          >
            {body}
          </PopoverContent>
        </UiPopover>
      ) : (
        <UiDrawer>
          <UiDrawerTrigger
            className="td-condline td-condline--button"
            data-call={view.call}
            data-stale={fresh?.stale ? "" : undefined}
          >
            {trigger}
          </UiDrawerTrigger>
          <SheetContent className="td-condline__sheet" title={panelTitle}>
            {body}
          </SheetContent>
        </UiDrawer>
      )}
      {alert}
    </span>
  );
}
