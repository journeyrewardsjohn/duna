"use client";

import {
  dayLightMinutes,
  daypartGlyph,
  dstTransition,
  groupByDaypart,
  lightMarkAtMinute,
  slotChip,
  staleStarts,
  type DayLight,
  type SlotChipState,
  type SlotReason,
  type SunTimes,
  zonedTimeToInstant,
} from "@duna/tideline-core";
import {
  Radio as UiRadio,
  RadioGroup as UiRadioGroup,
} from "@ui-sdk/react/radio";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cx } from "../base/cx";
import { Icon } from "../base/icons";
import { LightMark, lightGlyph } from "../conditions/light-mark";
import {
  civilDate,
  minuteLabel,
  minuteRangeLabel,
  slotMinWidth,
  type VenueDate,
} from "./time-format";
import { TimeZoneNote } from "./zone-note";

/** One start time. `Slot` from `timeSlots()` in `@duna/tideline-core` fits as is. */
export interface TimeSlotItem {
  /** Wall-clock minutes after the venue's midnight (1350 is 10:30 PM). */
  startMinute: number;
  available: boolean;
  reason?: SlotReason | null;
  /** Places left (spots, courts); a few left says so. Omit for a single booking. */
  remaining?: number | null;
  /** Taken while the person was looking (the component also finds these itself). */
  stale?: boolean;
}

export interface TimeSlotsProps {
  slots: ReadonlyArray<TimeSlotItem>;
  /** Names the group of chips for screen readers ("Court 3 start times"). */
  label: string;
  /** A visible heading above the chips. */
  title?: ReactNode;
  /** The chosen start minute. */
  value?: number | null;
  defaultValue?: number | null;
  onValueChange?: (startMinute: number | null) => void;
  /** Called with the starts that were taken while the person was looking. */
  onStale?: (startMinutes: ReadonlyArray<number>) => void;
  /** The venue's date and IANA zone: times are on its clock. */
  date: VenueDate;
  timeZone: string;
  /** The viewer's zone; the venue's is shown when they differ. */
  viewerTimeZone?: string;
  /** For the daylight-saving and zone notes: an instant on this day. */
  locale?: string;
  /** Sun times for the venue's date; without them (indoor) slots are not grouped by light. */
  sun?: SunTimes | null;
  /** The court has lights. An unlit court is too dark after sunset. */
  courtIsLit?: boolean;
  /** Group by daypart (morning, midday, afternoon, golden hour, evening). Default on with `sun`. */
  groupByDaypart?: boolean;
  /** Places at or below this read "few left". */
  fewLeftAt?: number;
  loading?: boolean;
  /** Shown when the day has no start times at all. */
  empty?: ReactNode;
  className?: string;
}

interface ChipModel {
  startMinute: number;
  text: string;
  state: SlotChipState;
  selectable: boolean;
  words: string | null;
  glyph: "golden-hour" | "under-lights" | "too-dark" | null;
}

/** Remembers starts taken while the person was looking, for this date. */
function useJustTaken(
  slots: ReadonlyArray<TimeSlotItem>,
  dateKey: string,
): ReadonlySet<number> {
  const previous = useRef<{ key: string; slots: ReadonlyArray<TimeSlotItem> }>({
    key: dateKey,
    slots,
  });
  const [taken, setTaken] = useState<{ key: string; starts: Set<number> }>({
    key: dateKey,
    starts: new Set(),
  });
  useEffect(() => {
    const before = previous.current;
    previous.current = { key: dateKey, slots };
    if (before.key !== dateKey) {
      setTaken({ key: dateKey, starts: new Set() });
      return;
    }
    const lost = staleStarts(before.slots, slots);
    if (lost.length === 0) return;
    setTaken((current) => ({
      key: dateKey,
      starts: new Set([
        ...(current.key === dateKey ? current.starts : []),
        ...lost,
      ]),
    }));
  }, [slots, dateKey]);
  return taken.key === dateKey ? taken.starts : new Set();
}

/**
 * Bookable start times as chips. Every chip holds its time and a 14 px light
 * mark with 12 px padding at the longest label ("10:30 PM") and any text
 * size; nothing clips or wraps. Chips are grouped by daypart with the light
 * of that part of the day. Full slots stay visible, struck and disabled;
 * outside-hours and too-dark starts say why; a slot taken while the person
 * was looking changes in place to "Just taken", is never bookable, and a
 * selection on it is dropped and announced.
 *
 * UI SDK Radio: one tab stop, arrow keys move between bookable times.
 * Parts: Root, Heading, Group, GroupHeading, Option, Mark, Note.
 */
export function TimeSlots({
  slots,
  label,
  title,
  value,
  defaultValue = null,
  onValueChange,
  onStale,
  date,
  timeZone,
  viewerTimeZone,
  locale = "en-US",
  sun,
  courtIsLit = true,
  groupByDaypart: grouped,
  fewLeftAt,
  loading = false,
  empty,
  className,
}: TimeSlotsProps) {
  const civil = civilDate(date);
  const dateKey =
    typeof date === "string"
      ? date
      : `${civil.year}-${civil.month}-${civil.day}`;
  const [inner, setInner] = useState<number | null>(defaultValue);
  const selected = value !== undefined ? value : inner;
  const justTaken = useJustTaken(slots, `${dateKey}|${timeZone}`);
  const light: DayLight | null = useMemo(
    () => (sun ? dayLightMinutes(sun, civil, timeZone) : null),
    [sun, dateKey, timeZone],
  );

  const chips: ChipModel[] = useMemo(
    () =>
      [...slots]
        .sort((a, b) => a.startMinute - b.startMinute)
        .map((slot) => {
          const mark = sun
            ? lightMarkAtMinute(slot.startMinute, {
                date: civil,
                timeZone,
                sun,
                courtIsLit,
              })
            : null;
          const chip = slotChip({
            available: slot.available,
            reason: slot.reason ?? null,
            remaining: slot.remaining ?? null,
            stale: slot.stale || justTaken.has(slot.startMinute),
            selected: selected === slot.startMinute,
            light: mark,
            fewLeftAt,
          });
          const glyph = mark ? lightGlyph(mark) : null;
          return {
            startMinute: slot.startMinute,
            text: minuteLabel(slot.startMinute, locale),
            ...chip,
            glyph:
              glyph === "golden-hour" ||
              glyph === "under-lights" ||
              glyph === "too-dark"
                ? glyph
                : null,
          };
        }),
    [
      slots,
      sun,
      dateKey,
      timeZone,
      courtIsLit,
      justTaken,
      selected,
      fewLeftAt,
      locale,
    ],
  );

  const staleNow = chips
    .filter((c) => c.state === "stale")
    .map((c) => c.startMinute);
  const staleKey = staleNow.join(",");
  const lostSelection = selected !== null && staleNow.includes(selected);
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    if (staleNow.length === 0) return;
    onStale?.(staleNow);
    if (lostSelection && selected !== null) {
      setAnnouncement(
        `${minuteLabel(selected, locale)} was just taken. Choose another time.`,
      );
      setInner(null);
      onValueChange?.(null);
    } else {
      setAnnouncement(
        `${staleNow.map((m) => minuteLabel(m, locale)).join(", ")} just taken.`,
      );
    }
    // Only when the set of stale starts changes.
  }, [staleKey]);

  // Measure the widest chip content once on screen, so the grid never makes a
  // column narrower than its longest label at the current text size.
  const root = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<number | null>(null);
  useLayoutEffect(() => {
    const element = root.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      let widest = 0;
      element
        .querySelectorAll<HTMLElement>(".td-tchip__inner, .td-tchip__note")
        .forEach((node) => {
          widest = Math.max(widest, node.scrollWidth);
        });
      // 12 px padding each side plus the 1.5 px hairline.
      if (widest > 0) setMeasured(Math.ceil(widest + 24 + 3));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [chips.length]);

  const minWidth =
    measured !== null
      ? `${measured}px`
      : slotMinWidth(
          chips.map((c) => c.text),
          chips.some((c) => c.glyph !== null || c.state === "stale"),
        );

  const dst = dstTransition(civil, timeZone);
  const groups =
    (grouped ?? Boolean(light)) && light
      ? groupByDaypart(chips, light)
      : [
          {
            daypart: null,
            label: "",
            fromMinute: 0,
            toMinute: 1440,
            items: chips,
          },
        ];
  const darkFrom =
    !courtIsLit &&
    light?.sunsetMinute != null &&
    chips.some((c) => c.state === "too-dark")
      ? light.sunsetMinute
      : null;
  const litFrom =
    courtIsLit &&
    light?.sunsetMinute != null &&
    chips.some((c) => c.glyph === "under-lights")
      ? light.sunsetMinute
      : null;
  const at = zonedTimeToInstant(civil, 12 * 60, timeZone);

  const head = (
    <div className="td-tslots__head">
      {title ? <div className="td-tslots__title">{title}</div> : null}
      {viewerTimeZone ? (
        <TimeZoneNote
          at={at}
          locale={locale}
          timeZone={timeZone}
          viewerTimeZone={viewerTimeZone}
        />
      ) : null}
    </div>
  );

  if (loading) {
    return (
      <div className={cx("td-tslots", className)} ref={root}>
        {head}
        <div
          aria-busy="true"
          aria-label={label}
          className="td-tslots__grid"
          role="status"
        >
          {Array.from({ length: 8 }, (_, index) => (
            <span className="td-skel td-tslots__skel" key={index} />
          ))}
          <span className="td-sr">Loading start times</span>
        </div>
      </div>
    );
  }

  if (chips.length === 0) {
    return (
      <div className={cx("td-tslots", className)} ref={root}>
        {head}
        <div className="td-tslots__empty" role="status">
          {empty ?? (
            <>
              <Icon name="clock" size="inline" />
              <span>No start times on this day.</span>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cx("td-tslots", className)}
      ref={root}
      style={{ "--td-slot-min": minWidth } as CSSProperties}
    >
      {head}
      <UiRadioGroup
        aria-label={label}
        className="td-tslots__groups"
        onValueChange={(next) => {
          const minute = next === null ? null : Number(next);
          if (
            minute !== null &&
            !chips.find((c) => c.startMinute === minute)?.selectable
          )
            return;
          setInner(minute);
          onValueChange?.(minute);
        }}
        value={selected === null ? null : String(selected)}
      >
        {groups.map((group) => (
          <div
            className="td-tslots__group"
            key={group.daypart ?? "all"}
            role="presentation"
          >
            {group.daypart ? (
              <div aria-hidden="true" className="td-tslots__daypart">
                <LightMark
                  label={group.label}
                  state={daypartGlyph(group.daypart, courtIsLit)}
                  time={
                    group.items.length > 1
                      ? minuteRangeLabel(
                          group.items[0]?.startMinute ?? group.fromMinute,
                          group.items[group.items.length - 1]?.startMinute ??
                            group.toMinute,
                          locale,
                        )
                      : minuteLabel(
                          group.items[0]?.startMinute ?? group.fromMinute,
                          locale,
                        )
                  }
                />
              </div>
            ) : null}
            <div className="td-tslots__grid">
              {group.items.map((chip) => (
                <UiRadio
                  aria-label={[
                    chip.text,
                    group.daypart ? group.label.toLowerCase() : null,
                    chip.glyph === "under-lights"
                      ? "under lights"
                      : chip.glyph === "golden-hour" &&
                          group.daypart !== "golden-hour"
                        ? "golden hour"
                        : null,
                    chip.words,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                  className="td-tchip"
                  data-state={chip.state}
                  disabled={!chip.selectable}
                  key={chip.startMinute}
                  value={String(chip.startMinute)}
                >
                  <span className="td-tchip__inner">
                    <span className="td-tchip__time">{chip.text}</span>
                    {chip.state === "stale" ? (
                      <Icon
                        className="td-tchip__mark"
                        name="close"
                        size="chip"
                      />
                    ) : chip.glyph ? (
                      <Icon
                        className="td-tchip__mark"
                        data-light={chip.glyph}
                        name={chip.glyph}
                        size="chip"
                      />
                    ) : null}
                  </span>
                  {chip.state === "few-left" || chip.state === "stale" ? (
                    <span aria-hidden="true" className="td-tchip__note">
                      {chip.state === "stale" ? "Just taken" : chip.words}
                    </span>
                  ) : null}
                </UiRadio>
              ))}
            </div>
          </div>
        ))}
      </UiRadioGroup>
      {darkFrom !== null ? (
        <p className="td-tslots__note">
          <Icon name="too-dark" size="chip" />
          This court has no lights. Starts from {minuteLabel(
            darkFrom,
            locale,
          )}{" "}
          are too dark to play.
        </p>
      ) : litFrom !== null ? (
        <p className="td-tslots__note">
          <Icon name="under-lights" size="chip" />
          Starts from {minuteLabel(litFrom, locale)} are under lights.
        </p>
      ) : null}
      {dst ? (
        <p className="td-tslots__note">
          <Icon name="clock" size="chip" />
          {dst.kind === "spring-forward"
            ? `Clocks go forward ${dst.shiftMinutes === 60 ? "an hour" : `${dst.shiftMinutes} minutes`} at ${minuteLabel(dst.atMinute, locale)} on this day. Times are on the club's clock.`
            : `Clocks go back ${dst.shiftMinutes === 60 ? "an hour" : `${dst.shiftMinutes} minutes`} at ${minuteLabel(dst.atMinute, locale)} on this day. Times are on the club's clock.`}
        </p>
      ) : null}
      <p aria-live="assertive" className="td-sr" role="status">
        {announcement}
      </p>
    </div>
  );
}
