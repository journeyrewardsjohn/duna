"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import {
  addMinutes,
  clock,
  clockRange,
  dragToTime,
  hourLabel,
  isLive,
  layoutLane,
  MINUTE_MS,
  minuteOfPlaceDay,
  snap,
  SNAP_MINUTES,
  type PlaceDay,
  type PlacedItem,
  type ScheduleItem,
} from "./schedule-model";
import { GroupChip, itemLabel, KindIcon, kindWords } from "./schedule-parts";

export interface Lane {
  readonly id: string;
  readonly label: string;
  readonly sublabel?: string;
  readonly day: PlaceDay;
  readonly courtId?: string;
  readonly coachId?: string;
  /** Nothing can be created here (a lane for items without a court). */
  readonly readonly?: boolean;
}

export interface SlotDraft {
  readonly startsAt: string;
  readonly endsAt: string;
  readonly lane: Lane;
}

const HOUR_PX = 64;
const PX_PER_MINUTE = HOUR_PX / 60;
const DEFAULT_START_HOUR = 6;
const DEFAULT_END_HOUR = 22;
/** Rows outside the viewport drawn anyway, so a fast scroll never shows a gap. */
const OVERSCAN_MINUTES = 180;

type Drag =
  | {
      readonly type: "item";
      readonly item: ScheduleItem;
      readonly mode: "move" | "resize";
      readonly lane: Lane;
      readonly grabMinute: number;
      readonly x: number;
      readonly y: number;
      moved: boolean;
      target?: { startsAt: string; endsAt: string; lane: Lane };
    }
  | {
      readonly type: "select";
      readonly lane: Lane;
      readonly from: number;
      to: number;
    };

/**
 * The calendar grid (day by court or by coach, or a week): one column per
 * lane, time down the side, the current time as the only live line. Long
 * days are virtualised (only items near the viewport are drawn); the frame
 * has fixed geometry so nothing shifts while data arrives.
 *
 * Pointer: press an empty slot (or drag over several) to create there;
 * drag an item to move it, its bottom edge to resize it. The item follows
 * the pointer directly (no spring, no bounce), snapped to 15 minutes.
 * Keyboard: Tab to the grid, arrows move a slot cursor (15 minutes, or a
 * lane), Enter creates or opens, Page Up / Page Down change the day, and
 * Alt+Up / Alt+Down move a focused item by 15 minutes.
 */
export function ScheduleGrid({
  label,
  lanes,
  items,
  nowMs,
  sunsetMs,
  canCreate,
  canMove,
  pendingIds,
  auto,
  onOpen,
  onCreate,
  onMove,
  onStepDay,
}: {
  readonly label: string;
  readonly lanes: readonly Lane[];
  readonly items: (lane: Lane) => readonly ScheduleItem[];
  readonly nowMs: number;
  readonly sunsetMs?: number;
  readonly canCreate: boolean;
  readonly canMove: (item: ScheduleItem) => boolean;
  readonly pendingIds: ReadonlySet<string>;
  readonly auto: boolean;
  readonly onOpen: (item: ScheduleItem) => void;
  readonly onCreate: (draft: SlotDraft) => void;
  readonly onMove: (
    item: ScheduleItem,
    next: { startsAt: string; endsAt: string; lane: Lane },
  ) => void;
  readonly onStepDay: (direction: -1 | 1) => void;
}) {
  const instructions = useId();
  const scroller = useRef<HTMLDivElement>(null);
  const laneRefs = useRef(new Map<string, HTMLDivElement>());
  const drag = useRef<Drag | null>(null);
  const [dragView, setDragView] = useState<Drag | null>(null);
  const [cursor, setCursor] = useState<{ lane: number; minute: number } | null>(
    null,
  );
  const [announce, setAnnounce] = useState("");
  const [viewport, setViewport] = useState({ top: 0, height: 900 });

  const layouts = useMemo(
    () =>
      new Map(
        lanes.map((lane) => [lane.id, layoutLane(items(lane), lane.day)]),
      ),
    [items, lanes],
  );

  // The span drawn: 6 AM to 10 PM, widened to fit anything earlier or later.
  const range = useMemo(() => {
    const day = lanes[0]?.day;
    if (!day) return { start: 0, end: 24 * 60 };
    const at = (hour: number) =>
      day.hours.find((entry) => entry.hour >= hour)?.minute ?? day.minutes;
    let start = at(DEFAULT_START_HOUR);
    let end = at(DEFAULT_END_HOUR);
    for (const layout of layouts.values()) {
      for (const placed of layout.placed) {
        start = Math.min(start, Math.floor(placed.top / 60) * 60);
        end = Math.max(end, Math.ceil((placed.top + placed.height) / 60) * 60);
      }
    }
    return { start: Math.max(0, start), end: Math.min(day.minutes, end) };
  }, [lanes, layouts]);

  const span = range.end - range.start;
  const toPx = (minute: number) => (minute - range.start) * PX_PER_MINUTE;

  // Scroll to "now" (or the first item) once, before paint settles.
  const scrolled = useRef(false);
  useEffect(() => {
    const element = scroller.current;
    if (!element || scrolled.current) return;
    scrolled.current = true;
    const day = lanes[0]?.day;
    if (!day) return;
    const now = minuteOfPlaceDay(nowMs, day);
    const first = Math.min(
      ...[...layouts.values()].flatMap((layout) =>
        layout.placed.map((placed) => placed.top),
      ),
    );
    const target =
      now >= range.start && now <= range.end
        ? now - 90
        : Number.isFinite(first)
          ? first - 30
          : range.start;
    element.scrollTop = Math.max(0, toPx(target));
    // Only on first mount: later updates keep the person's scroll position.
  }, []);

  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        setViewport({ top: element.scrollTop, height: element.clientHeight }),
      );
    };
    update();
    element.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      cancelAnimationFrame(frame);
      element.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  const visibleFrom =
    range.start + viewport.top / PX_PER_MINUTE - OVERSCAN_MINUTES;
  const visibleTo =
    range.start +
    (viewport.top + viewport.height) / PX_PER_MINUTE +
    OVERSCAN_MINUTES;

  const minuteAt = useCallback(
    (laneId: string, clientY: number) => {
      const element = laneRefs.current.get(laneId);
      if (!element) return range.start;
      const rect = element.getBoundingClientRect();
      return range.start + (clientY - rect.top) / PX_PER_MINUTE;
    },
    [range.start],
  );

  const laneAt = (clientX: number, clientY: number): Lane | undefined => {
    const element = document
      .elementFromPoint(clientX, clientY)
      ?.closest<HTMLElement>("[data-lane]");
    const id = element?.dataset.lane;
    return lanes.find((lane) => lane.id === id);
  };

  const target = (
    current: Extract<Drag, { type: "item" }>,
    clientX: number,
    clientY: number,
  ) => {
    const lane =
      current.mode === "resize"
        ? current.lane
        : (laneAt(clientX, clientY) ?? current.lane);
    if (lane.readonly) return undefined;
    const pointerMinute = minuteAt(lane.id, clientY);
    const next = dragToTime({
      day: current.lane.day,
      startsAt: current.item.startsAt,
      endsAt: current.item.endsAt,
      grabMinute: current.grabMinute,
      pointerMinute,
      mode: current.mode,
    });
    if (lane.day.startMs === current.lane.day.startMs) return { ...next, lane };
    // Moved to another day (week view): keep the elapsed minute of the day.
    const shift = lane.day.startMs - current.lane.day.startMs;
    return {
      startsAt: new Date(Date.parse(next.startsAt) + shift).toISOString(),
      endsAt: new Date(Date.parse(next.endsAt) + shift).toISOString(),
      lane,
    };
  };

  const onItemPointerDown = (
    event: PointerEvent<HTMLElement>,
    item: ScheduleItem,
    lane: Lane,
    mode: "move" | "resize",
  ) => {
    if (event.button !== 0 || !canMove(item)) return;
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    drag.current = {
      type: "item",
      item,
      mode,
      lane,
      grabMinute: minuteAt(lane.id, event.clientY),
      x: event.clientX,
      y: event.clientY,
      moved: false,
    };
  };

  const onLanePointerDown = (
    event: PointerEvent<HTMLDivElement>,
    lane: Lane,
  ) => {
    if (event.button !== 0 || !canCreate || lane.readonly) return;
    if (event.target !== event.currentTarget) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const minute =
      Math.floor(minuteAt(lane.id, event.clientY) / SNAP_MINUTES) *
      SNAP_MINUTES;
    const next: Drag = {
      type: "select",
      lane,
      from: minute,
      to: minute + SNAP_MINUTES,
    };
    drag.current = next;
    setDragView({ ...next });
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const current = drag.current;
    if (!current) return;
    if (current.type === "select") {
      const minute =
        Math.ceil(minuteAt(current.lane.id, event.clientY) / SNAP_MINUTES) *
        SNAP_MINUTES;
      current.to = Math.max(current.from + SNAP_MINUTES, minute);
      setDragView({ ...current });
      return;
    }
    if (
      !current.moved &&
      Math.hypot(event.clientX - current.x, event.clientY - current.y) < 4
    ) {
      return;
    }
    current.moved = true;
    current.target = target(current, event.clientX, event.clientY);
    setDragView({ ...current });
  };

  const finish = (event: PointerEvent<HTMLElement>, cancelled = false) => {
    const current = drag.current;
    drag.current = null;
    setDragView(null);
    if (!current || cancelled) return;
    if (current.type === "select") {
      const length = current.to - current.from;
      const day = current.lane.day;
      const startsAt = new Date(
        day.startMs + current.from * MINUTE_MS,
      ).toISOString();
      onCreate({
        startsAt,
        endsAt: addMinutes(startsAt, length <= SNAP_MINUTES ? 60 : length),
        lane: current.lane,
      });
      return;
    }
    if (!current.moved) return; // a click: onClick opens it
    event.preventDefault();
    const next = current.target;
    if (
      next &&
      (next.startsAt !== current.item.startsAt ||
        next.endsAt !== current.item.endsAt ||
        next.lane.id !== current.lane.id)
    ) {
      onMove(current.item, next);
    }
  };

  const suppressClick = useRef(false);

  // Keyboard: a slot cursor over the lanes.
  const describe = (laneIndex: number, minute: number) => {
    const lane = lanes[laneIndex];
    if (!lane) return "";
    const at = lane.day.startMs + minute * MINUTE_MS;
    const busy = layouts
      .get(lane.id)
      ?.placed.find(
        (placed) => placed.top <= minute && placed.top + placed.height > minute,
      );
    return `${lane.label}, ${clock(at, lane.day.timeZone)}, ${
      busy ? `${kindWords(busy.item)}: ${busy.item.title}` : "free"
    }`;
  };

  const moveCursor = (laneIndex: number, minute: number) => {
    const lane = Math.min(Math.max(0, laneIndex), lanes.length - 1);
    const at = Math.min(
      Math.max(range.start, minute),
      range.end - SNAP_MINUTES,
    );
    setCursor({ lane, minute: at });
    setAnnounce(describe(lane, at));
    const element = scroller.current;
    if (element) {
      const top = toPx(at);
      if (top < element.scrollTop + 64)
        element.scrollTop = Math.max(0, top - 96);
      else if (top > element.scrollTop + element.clientHeight - 64) {
        element.scrollTop = top - element.clientHeight + 128;
      }
    }
  };

  const onGridKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    const current = cursor ?? {
      lane: 0,
      minute: snap(
        Math.max(range.start, minuteOfPlaceDay(nowMs, lanes[0]!.day)),
      ),
    };
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveCursor(current.lane, current.minute + SNAP_MINUTES);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveCursor(current.lane, current.minute - SNAP_MINUTES);
        break;
      case "ArrowRight":
        event.preventDefault();
        moveCursor(current.lane + 1, current.minute);
        break;
      case "ArrowLeft":
        event.preventDefault();
        moveCursor(current.lane - 1, current.minute);
        break;
      case "Home":
        event.preventDefault();
        moveCursor(0, current.minute);
        break;
      case "End":
        event.preventDefault();
        moveCursor(lanes.length - 1, current.minute);
        break;
      case "PageDown":
        event.preventDefault();
        onStepDay(1);
        break;
      case "PageUp":
        event.preventDefault();
        onStepDay(-1);
        break;
      case "Enter":
      case " ": {
        event.preventDefault();
        if (!cursor) {
          moveCursor(current.lane, current.minute);
          break;
        }
        const lane = lanes[cursor.lane];
        if (!lane) break;
        const busy = layouts
          .get(lane.id)
          ?.placed.find(
            (placed) =>
              placed.top <= cursor.minute &&
              placed.top + placed.height > cursor.minute,
          );
        if (busy) onOpen(busy.item);
        else if (canCreate && !lane.readonly) {
          const startsAt = new Date(
            lane.day.startMs + cursor.minute * MINUTE_MS,
          ).toISOString();
          onCreate({ startsAt, endsAt: addMinutes(startsAt, 60), lane });
        }
        break;
      }
      case "Escape":
        setCursor(null);
        break;
    }
  };

  const onItemKeyDown = (
    event: KeyboardEvent<HTMLElement>,
    item: ScheduleItem,
    lane: Lane,
  ) => {
    if (!event.altKey || !canMove(item)) return;
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const delta = (event.key === "ArrowDown" ? 1 : -1) * SNAP_MINUTES;
    onMove(item, {
      startsAt: addMinutes(item.startsAt, delta),
      endsAt: addMinutes(item.endsAt, delta),
      lane,
    });
  };

  // The first hour sits under the sticky lane names, so its label is left out.
  const hours = lanes[0]?.day.hours.filter(
    (entry) => entry.minute > range.start && entry.minute < range.end,
  );
  const allDay = lanes.some(
    (lane) => (layouts.get(lane.id)?.allDay.length ?? 0) > 0,
  );
  const dragging =
    dragView?.type === "item" && dragView.moved ? dragView : null;

  const renderItem = (placed: PlacedItem, lane: Lane) => {
    const { item } = placed;
    const live = isLive(item, nowMs);
    const isDragged = dragging?.item.id === item.id;
    const shown =
      isDragged && dragging.target
        ? {
            top: minuteOfPlaceDay(
              dragging.target.startsAt,
              dragging.target.lane.day,
            ),
            height:
              (Date.parse(dragging.target.endsAt) -
                Date.parse(dragging.target.startsAt)) /
              MINUTE_MS,
          }
        : { top: placed.top, height: placed.height };
    const laneShift =
      isDragged && dragging.target && dragging.target.lane.id !== lane.id
        ? laneOffset(lane.id, dragging.target.lane.id)
        : 0;
    const width = 100 / placed.columns;
    const style: CSSProperties = {
      top: toPx(shown.top) + 1,
      height: Math.max(22, shown.height * PX_PER_MINUTE - 2),
      left: `calc(${placed.column * width}% + 3px)`,
      width: `calc(${width}% - 6px)`,
      ...(laneShift ? { translate: `${laneShift}px 0` } : {}),
    };
    const compact = shown.height < 45;
    const movable = canMove(item);
    return (
      <button
        aria-describedby={movable ? instructions : undefined}
        aria-label={itemLabel(item, live)}
        className={`sch-item sch-item--${item.kind}`}
        data-cancelled={item.cancelled ? "" : undefined}
        data-dragging={isDragged ? "" : undefined}
        data-live={live ? "" : undefined}
        data-pending={pendingIds.has(item.id) ? "" : undefined}
        data-testid="schedule-item"
        key={item.id}
        onClick={() => {
          if (suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          onOpen(item);
        }}
        onKeyDown={(event) => onItemKeyDown(event, item, lane)}
        onLostPointerCapture={(event) => {
          if (drag.current?.type === "item" && drag.current.moved) {
            suppressClick.current = true;
          }
          finish(event);
        }}
        onPointerDown={(event) => onItemPointerDown(event, item, lane, "move")}
        onPointerMove={onPointerMove}
        style={style}
        title={undefined}
        type="button"
      >
        <span className="sch-item__title">
          <KindIcon kind={item.kind} />
          <span>{item.title}</span>
        </span>
        {compact ? null : (
          <span className="sch-item__meta">
            <span className="sch-time">
              {clockRange(
                isDragged && dragging.target
                  ? dragging.target.startsAt
                  : item.startsAt,
                isDragged && dragging.target
                  ? dragging.target.endsAt
                  : item.endsAt,
                item.timeZone,
              )}
            </span>
            {item.who ? ` · ${item.who}` : ""}
          </span>
        )}
        {compact || shown.height < 70 ? null : (
          <span className="sch-item__state">
            <GroupChip item={item} />
          </span>
        )}
        {movable ? (
          <span
            aria-hidden="true"
            className="sch-item__resize"
            onPointerDown={(event) =>
              onItemPointerDown(event, item, lane, "resize")
            }
          />
        ) : null}
      </button>
    );
  };

  const laneOffset = (fromId: string, toId: string) => {
    const from = laneRefs.current.get(fromId)?.getBoundingClientRect();
    const to = laneRefs.current.get(toId)?.getBoundingClientRect();
    return from && to ? to.left - from.left : 0;
  };

  const style = {
    "--sch-lanes": String(lanes.length),
    "--sch-span": String(span),
    "--sch-offset": String(range.start),
    // A week (or many courts) gets narrower lanes before the grid scrolls.
    ...(lanes.length > 5 ? { "--sch-lane-min": "112px" } : {}),
  } as CSSProperties;

  return (
    <section aria-label={label} className="sch-grid-wrap">
      <p className="td-sr" id={instructions}>
        Drag to move, drag the bottom edge to change the length, or press Alt
        with the up or down arrow to move by 15 minutes.
      </p>
      <div
        aria-label={`${label}. Arrow keys move between time slots, Enter opens or creates, Page Up and Page Down change the day.`}
        className="sch-grid"
        data-auto={auto ? "" : undefined}
        data-testid="schedule-grid"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget))
            setCursor(null);
        }}
        onKeyDown={onGridKeyDown}
        ref={scroller}
        role="region"
        style={style}
        tabIndex={0}
      >
        <div className="sch-grid__inner">
          <div aria-hidden="true" className="sch-grid__corner">
            Time
          </div>
          {lanes.map((lane) => (
            <div className="sch-lane-head" key={lane.id}>
              {lane.label}
              {lane.sublabel ? <small>{lane.sublabel}</small> : null}
            </div>
          ))}
          {allDay ? (
            <div className="sch-allday">
              <div className="sch-allday__label">All day</div>
              {lanes.map((lane) => (
                <div className="sch-allday__cell" key={lane.id}>
                  {layouts.get(lane.id)?.allDay.map((item) => (
                    <button
                      aria-label={itemLabel(item, false)}
                      className={`sch-item sch-item--${item.kind}`}
                      key={item.id}
                      onClick={() => onOpen(item)}
                      type="button"
                    >
                      <span className="sch-item__title">
                        <KindIcon kind={item.kind} />
                        <span>{item.title}</span>
                      </span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ) : null}
          <div aria-hidden="true" className="sch-hours">
            {hours?.map((entry) => (
              <span key={entry.minute} style={{ top: toPx(entry.minute) }}>
                {hourLabel(entry.hour)}
              </span>
            ))}
          </div>
          {lanes.map((lane, laneIndex) => {
            const layout = layouts.get(lane.id);
            const now = minuteOfPlaceDay(nowMs, lane.day);
            const sun =
              sunsetMs !== undefined
                ? minuteOfPlaceDay(sunsetMs, lane.day)
                : undefined;
            const select =
              dragView?.type === "select" && dragView.lane.id === lane.id
                ? dragView
                : null;
            return (
              <div
                aria-label={
                  lane.sublabel ? `${lane.label}, ${lane.sublabel}` : lane.label
                }
                className="sch-lane"
                data-lane={lane.id}
                data-readonly={lane.readonly || !canCreate ? "" : undefined}
                key={lane.id}
                onLostPointerCapture={(event) => finish(event)}
                onPointerDown={(event) => onLanePointerDown(event, lane)}
                onPointerMove={onPointerMove}
                ref={(element) => {
                  if (element) laneRefs.current.set(lane.id, element);
                  else laneRefs.current.delete(lane.id);
                }}
                role="group"
              >
                {layout?.placed
                  .filter(
                    (placed) =>
                      (placed.top + placed.height >= visibleFrom &&
                        placed.top <= visibleTo) ||
                      dragging?.item.id === placed.item.id,
                  )
                  .map((placed) => renderItem(placed, lane))}
                {select ? (
                  <div
                    aria-hidden="true"
                    className="sch-select"
                    style={{
                      top: toPx(select.from),
                      height: (select.to - select.from) * PX_PER_MINUTE,
                    }}
                  >
                    {clockRange(
                      lane.day.startMs + select.from * MINUTE_MS,
                      lane.day.startMs + select.to * MINUTE_MS,
                      lane.day.timeZone,
                    )}
                  </div>
                ) : null}
                {cursor?.lane === laneIndex ? (
                  <div
                    aria-hidden="true"
                    className="sch-cursor"
                    style={{
                      top: toPx(cursor.minute),
                      height: SNAP_MINUTES * PX_PER_MINUTE,
                    }}
                  />
                ) : null}
                {sun !== undefined && sun > range.start && sun < range.end ? (
                  <div
                    aria-hidden="true"
                    className="sch-sunline"
                    style={{ top: toPx(sun) }}
                  >
                    {laneIndex === lanes.length - 1 ? (
                      <span className="sch-sunline__label">
                        Sunset {clock(sunsetMs!, lane.day.timeZone)}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                {now > range.start && now < range.end ? (
                  <div
                    aria-hidden="true"
                    className="sch-nowline"
                    data-testid="schedule-now"
                    style={{ top: toPx(now) }}
                  >
                    {laneIndex === 0 ? (
                      <span className="sch-nowline__label">
                        {clock(nowMs, lane.day.timeZone)}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
      <p aria-live="polite" className="td-sr">
        {announce}
      </p>
    </section>
  );
}
