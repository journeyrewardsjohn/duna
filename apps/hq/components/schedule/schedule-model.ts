/**
 * Schedule (H-SCHEDULE): the club calendar's pure logic. Everything here is
 * deterministic and testable without a browser:
 *
 * - the URL is the state (`parseScheduleQuery` / `scheduleHref`), so a view
 *   is shareable and the back button is correct;
 * - days are the PLACE's calendar days in the place's time zone, measured in
 *   elapsed minutes from local midnight, so a daylight-saving day is 23 or 25
 *   hours tall and nothing lands in the wrong hour (`placeDay`);
 * - slot layout puts overlapping items side by side and all-day items in
 *   their own row (`layoutLane`);
 * - a drag maps a pointer position to a new start, snapped (`dragToTime`);
 * - conflicts and "who is free" come from the shared availability rule in
 *   `@duna/scheduling` (`availabilityFor`): this module never decides
 *   availability itself, it only turns the rule's reasons into words.
 */
import {
  addCalendarDays,
  availabilityFor,
  localDateOf,
  localMinuteOf,
  minuteOfDayFromTime,
  wallTimeToInstant,
  weekdayOfDate,
  type BusyInterval,
  type StaffAvailabilityInputs,
  type StaffAvailabilitySchedule,
} from "@duna/scheduling";

export const MINUTE_MS = 60_000;

/* ------------------------------------------------------------------ */
/* What the calendar draws                                             */
/* ------------------------------------------------------------------ */

/** What an item is: drawn by shape, label and icon, never colour alone. */
export type ItemKind = "booking" | "lesson" | "session" | "event" | "block";

export const itemKinds: readonly ItemKind[] = [
  "booking",
  "lesson",
  "session",
  "event",
  "block",
];

export const kindLabels: Readonly<Record<ItemKind, string>> = {
  booking: "Court booking",
  lesson: "Lesson",
  session: "Group session",
  event: "Event",
  block: "Blocked time",
};

/** Filter chip labels (plural). */
export const kindFilterLabels: Readonly<Record<ItemKind, string>> = {
  booking: "Bookings",
  lesson: "Lessons",
  session: "Sessions",
  event: "Events",
  block: "Blocks",
};

/** Where an item came from, so actions reach the right procedure. */
export type ItemSource =
  | "calendar-session"
  | "court-booking"
  | "pickup"
  | "catalog-occurrence"
  | "block"
  | "court-override"
  | "demo";

export interface ItemPerson {
  /** The roster row's own id (registration, participant or booking). */
  readonly id: string;
  readonly personId?: string;
  readonly name: string;
  readonly checkedIn: boolean;
  readonly noShow?: boolean;
  /** `due` when the person still owes money for this item. */
  readonly payment?: "paid" | "due" | "free";
  readonly minor?: boolean;
}

export interface ScheduleItem {
  readonly id: string;
  readonly source: ItemSource;
  readonly kind: ItemKind;
  readonly title: string;
  /** Who, in a few words: the booker, the coach and pupil, "Pool A". */
  readonly who?: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly timeZone: string;
  readonly placeId?: string;
  readonly placeName?: string;
  readonly courtId?: string;
  readonly courtName?: string;
  /** The coach's person id. */
  readonly coachId?: string;
  readonly coachName?: string;
  readonly status: string;
  readonly cancelled?: boolean;
  readonly capacity?: number;
  readonly booked?: number;
  /** The group's minimum to run, when it has one. */
  readonly minimum?: number;
  /** A group session's state in the shared words ("Needs 2 more"). */
  readonly groupStatus?: string;
  readonly groupLine?: string;
  readonly groupNeedsPeople?: boolean;
  readonly people: readonly ItemPerson[];
  /** Equipment reserved for a session. */
  readonly equipment?: readonly {
    readonly id: string;
    readonly label: string;
    readonly quantity: number;
  }[];
  /** Total and paid so far, minor units (bookings). */
  readonly amountMinor?: number;
  readonly paidMinor?: number;
  readonly currency?: string;
  /** May be moved or resized on the calendar (the procedures allow it). */
  readonly movable: boolean;
  /** Events and other read-only items open their own page. */
  readonly href?: string;
  /** Blocks: why ("Sand grooming", "Weather hold"). */
  readonly reason?: string;
  readonly blockMode?: "blocked" | "maintenance" | "weather";
  /** A block over every court of a place for the day. */
  readonly allDay?: boolean;
}

/* ------------------------------------------------------------------ */
/* The URL                                                             */
/* ------------------------------------------------------------------ */

export type ScheduleView = "day" | "week" | "list";
export type ScheduleBy = "court" | "coach";

export interface ScheduleQuery {
  readonly date: string;
  readonly view: ScheduleView;
  readonly by: ScheduleBy;
  readonly place?: string;
  readonly court?: string;
  readonly coach?: string;
  readonly kinds: readonly ItemKind[];
  /** The item open in the side panel (`<source>:<id>`). */
  readonly open?: string;
}

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

function one(value: string | readonly string[] | undefined) {
  return Array.isArray(value) ? value[0] : (value as string | undefined);
}

/**
 * Reads the view from the address. Anything unknown falls back to today,
 * the day view by court, every kind; `defaultView` lets a phone default to
 * the agenda list.
 */
export function parseScheduleQuery(
  params: Readonly<Record<string, string | readonly string[] | undefined>>,
  today: string,
  defaultView: ScheduleView = "day",
): ScheduleQuery {
  const date = one(params.date);
  const view = one(params.view);
  const by = one(params.by);
  const kindParam = one(params.kind);
  const kinds = (kindParam ?? "")
    .split(",")
    .filter((kind: string): kind is ItemKind =>
      (itemKinds as readonly string[]).includes(kind),
    );
  const pick = (key: string) => {
    const value = one(params[key])?.trim();
    return value && value !== "all" ? value : undefined;
  };
  return {
    date: date && isoDate.test(date) && validDate(date) ? date : today,
    view:
      view === "week" || view === "list" || view === "day" ? view : defaultView,
    by: by === "coach" ? "coach" : "court",
    place: pick("place"),
    court: pick("court"),
    coach: pick("coach"),
    kinds,
    open: pick("open"),
  };
}

function validDate(value: string): boolean {
  const parsed = new Date(`${value}T12:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

/** The address of a view: only what differs from the defaults is written. */
export function scheduleHref(
  query: ScheduleQuery,
  patch: Partial<ScheduleQuery> = {},
  today?: string,
  /** The view was chosen (not the default), so it is written even when "day". */
  viewChosen = false,
): string {
  const next = { ...query, ...patch };
  const params = new URLSearchParams();
  if (next.date !== today) params.set("date", next.date);
  if (next.view !== "day" || viewChosen) params.set("view", next.view);
  if (next.by !== "court") params.set("by", next.by);
  if (next.place) params.set("place", next.place);
  if (next.court) params.set("court", next.court);
  if (next.coach) params.set("coach", next.coach);
  if (next.kinds.length > 0) params.set("kind", next.kinds.join(","));
  if (next.open) params.set("open", next.open);
  const search = params.toString();
  return search ? `/schedule?${search}` : "/schedule";
}

/** Next or previous day (day and list views) or week (week view). */
export function stepDate(query: ScheduleQuery, direction: -1 | 1): string {
  return addCalendarDays(
    query.date,
    direction * (query.view === "week" ? 7 : 1),
  );
}

/** The seven days of the week that holds `date`, Monday first. */
export function weekDays(date: string): string[] {
  const weekday = weekdayOfDate(date);
  const monday = addCalendarDays(date, -((weekday + 6) % 7));
  return Array.from({ length: 7 }, (_, index) =>
    addCalendarDays(monday, index),
  );
}

/** The days a view shows. */
export function viewDays(query: ScheduleQuery): string[] {
  return query.view === "week" ? weekDays(query.date) : [query.date];
}

/** Keeps the items a filter asks for. */
export function filterItems(
  items: readonly ScheduleItem[],
  query: Pick<ScheduleQuery, "place" | "court" | "coach" | "kinds">,
): ScheduleItem[] {
  return items.filter(
    (item) =>
      (!query.place || item.placeId === query.place || !item.placeId) &&
      (!query.court || item.courtId === query.court) &&
      (!query.coach || item.coachId === query.coach) &&
      (query.kinds.length === 0 || query.kinds.includes(item.kind)),
  );
}

/* ------------------------------------------------------------------ */
/* Days in the place's time zone                                       */
/* ------------------------------------------------------------------ */

export interface PlaceDay {
  readonly date: string;
  readonly timeZone: string;
  /** Local midnight, epoch ms. */
  readonly startMs: number;
  /** The next local midnight, epoch ms. */
  readonly endMs: number;
  /** 1440 on most days; 1380 or 1500 on a daylight-saving change. */
  readonly minutes: number;
  /** Each local hour that exists that day, with its elapsed minute. */
  readonly hours: readonly { readonly hour: number; readonly minute: number }[];
}

export function placeDay(date: string, timeZone: string): PlaceDay {
  const startMs = wallTimeToInstant(date, 0, timeZone);
  const endMs = wallTimeToInstant(addCalendarDays(date, 1), 0, timeZone);
  const hours: { hour: number; minute: number }[] = [];
  const seen = new Set<number>();
  for (let hour = 0; hour < 24; hour += 1) {
    const at = wallTimeToInstant(date, hour * 60, timeZone);
    // A skipped hour (spring forward) resolves to the next one: draw it once.
    if (localMinuteOf(at, timeZone) !== hour * 60) continue;
    const minute = Math.round((at - startMs) / MINUTE_MS);
    if (seen.has(minute)) continue;
    seen.add(minute);
    hours.push({ hour, minute });
  }
  return {
    date,
    timeZone,
    startMs,
    endMs,
    minutes: Math.round((endMs - startMs) / MINUTE_MS),
    hours,
  };
}

/** Today's date on the place's calendar. */
export function placeToday(nowMs: number, timeZone: string): string {
  return localDateOf(nowMs, timeZone);
}

/** Elapsed minutes from the day's local midnight (may be < 0 or > minutes). */
export function minuteOfPlaceDay(iso: string | number, day: PlaceDay): number {
  const at = typeof iso === "number" ? iso : Date.parse(iso);
  return (at - day.startMs) / MINUTE_MS;
}

/** True when an item touches the day. */
export function onDay(
  item: Pick<ScheduleItem, "startsAt" | "endsAt">,
  day: PlaceDay,
) {
  return (
    Date.parse(item.startsAt) < day.endMs &&
    Date.parse(item.endsAt) > day.startMs
  );
}

/* ------------------------------------------------------------------ */
/* Times in words, always in the place's zone                          */
/* ------------------------------------------------------------------ */

const timeFormats = new Map<string, Intl.DateTimeFormat>();
function format(timeZone: string, options: Intl.DateTimeFormatOptions) {
  const key = `${timeZone}|${JSON.stringify(options)}`;
  let formatter = timeFormats.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone, ...options });
    timeFormats.set(key, formatter);
  }
  return formatter;
}

/** "6:30 PM" (minutes kept only when there are some: "6 PM"? no: "6:00 PM"). */
export function clock(at: string | number, timeZone: string): string {
  return format(timeZone, { hour: "numeric", minute: "2-digit" }).format(
    new Date(at),
  );
}

/** "9:00–10:30 AM" style range, in the place's zone. */
export function clockRange(
  startsAt: string | number,
  endsAt: string | number,
  timeZone: string,
): string {
  return `${clock(startsAt, timeZone)}–${clock(endsAt, timeZone)}`;
}

/** "Saturday, November 28". */
export function longDate(date: string): string {
  return format("UTC", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(`${date}T12:00:00Z`));
}

/** "Sat 28". */
export function shortDate(date: string): string {
  return format("UTC", { weekday: "short", day: "numeric" }).format(
    new Date(`${date}T12:00:00Z`),
  );
}

/** "8 AM" for an hour label. */
export function hourLabel(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour === 12) return "Noon";
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

/** Minutes as "1 h 30 min", "45 min", "2 h". */
export function durationWords(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/* ------------------------------------------------------------------ */
/* Slot layout                                                         */
/* ------------------------------------------------------------------ */

export interface PlacedItem {
  readonly item: ScheduleItem;
  /** Elapsed minutes from local midnight, clamped to the day. */
  readonly top: number;
  readonly height: number;
  /** Side-by-side column inside an overlap cluster. */
  readonly column: number;
  readonly columns: number;
  /** Starts before or ends after the day shown. */
  readonly continuesBefore: boolean;
  readonly continuesAfter: boolean;
}

export interface LaneLayout {
  readonly allDay: readonly ScheduleItem[];
  readonly placed: readonly PlacedItem[];
}

/** The shortest an item is drawn, so a 10-minute block is still a target. */
export const MIN_DRAWN_MINUTES = 20;

/**
 * Lays out one lane (a court or a coach) for one day. Items that cover the
 * whole day (or say they are all-day) go to the all-day row. The rest are
 * grouped into clusters of overlapping items; inside a cluster each item
 * takes the first free column, and every item in the cluster shares the
 * cluster's column count, so widths line up.
 */
export function layoutLane(
  items: readonly ScheduleItem[],
  day: PlaceDay,
): LaneLayout {
  const allDay: ScheduleItem[] = [];
  const timed: {
    item: ScheduleItem;
    start: number;
    end: number;
    before: boolean;
    after: boolean;
  }[] = [];
  for (const item of items) {
    if (!onDay(item, day)) continue;
    const start = minuteOfPlaceDay(item.startsAt, day);
    const end = minuteOfPlaceDay(item.endsAt, day);
    if (item.allDay || (start <= 0 && end >= day.minutes)) {
      allDay.push(item);
      continue;
    }
    const top = Math.max(0, start);
    const bottom = Math.min(day.minutes, end);
    timed.push({
      item,
      start: top,
      end: Math.max(bottom, Math.min(day.minutes, top + MIN_DRAWN_MINUTES)),
      before: start < 0,
      after: end > day.minutes,
    });
  }
  timed.sort(
    (left, right) =>
      left.start - right.start ||
      right.end - left.end ||
      left.item.id.localeCompare(right.item.id),
  );
  const placed: PlacedItem[] = [];
  let cluster: { entry: (typeof timed)[number]; column: number }[] = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    const columns = Math.max(1, ...cluster.map((entry) => entry.column + 1));
    for (const { entry, column } of cluster) {
      placed.push({
        item: entry.item,
        top: entry.start,
        height: entry.end - entry.start,
        column,
        columns,
        continuesBefore: entry.before,
        continuesAfter: entry.after,
      });
    }
    cluster = [];
  };
  for (const entry of timed) {
    if (entry.start >= clusterEnd) {
      flush();
      clusterEnd = -Infinity;
    }
    const busy = new Set(
      cluster
        .filter((other) => other.entry.end > entry.start)
        .map((other) => other.column),
    );
    let column = 0;
    while (busy.has(column)) column += 1;
    cluster.push({ entry, column });
    clusterEnd = Math.max(clusterEnd, entry.end);
  }
  flush();
  allDay.sort((left, right) => left.title.localeCompare(right.title));
  return { allDay, placed };
}

/* ------------------------------------------------------------------ */
/* Dragging                                                            */
/* ------------------------------------------------------------------ */

export const SNAP_MINUTES = 15;

/** Rounds elapsed minutes to the nearest snap step. */
export function snap(minutes: number, step = SNAP_MINUTES): number {
  return Math.round(minutes / step) * step;
}

/**
 * Where a dragged item lands. `pointerMinute` is the elapsed minute under
 * the pointer now and `grabMinute` where it was when the drag began; the
 * item moves by the difference, snapped, and stays inside the day. For a
 * resize only the end moves, never shorter than one step.
 */
export function dragToTime(input: {
  readonly day: PlaceDay;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly grabMinute: number;
  readonly pointerMinute: number;
  readonly mode: "move" | "resize";
  readonly step?: number;
}): { readonly startsAt: string; readonly endsAt: string } {
  const step = input.step ?? SNAP_MINUTES;
  const start = minuteOfPlaceDay(input.startsAt, input.day);
  const end = minuteOfPlaceDay(input.endsAt, input.day);
  const delta = snap(input.pointerMinute - input.grabMinute, step);
  if (input.mode === "resize") {
    const nextEnd = Math.min(
      input.day.minutes,
      Math.max(start + step, snap(end + delta, step)),
    );
    return {
      startsAt: input.startsAt,
      endsAt: new Date(input.day.startMs + nextEnd * MINUTE_MS).toISOString(),
    };
  }
  const length = end - start;
  const nextStart = Math.min(
    Math.max(0, snap(start + delta, step)),
    Math.max(0, input.day.minutes - length),
  );
  return {
    startsAt: new Date(input.day.startMs + nextStart * MINUTE_MS).toISOString(),
    endsAt: new Date(
      input.day.startMs + (nextStart + length) * MINUTE_MS,
    ).toISOString(),
  };
}

/** The instant of an elapsed minute in a day, snapped. */
export function slotStart(day: PlaceDay, minute: number, step = SNAP_MINUTES) {
  const snapped = Math.min(
    Math.max(0, Math.floor(minute / step) * step),
    day.minutes - step,
  );
  return new Date(day.startMs + snapped * MINUTE_MS).toISOString();
}

export function addMinutes(iso: string, minutes: number): string {
  return new Date(Date.parse(iso) + minutes * MINUTE_MS).toISOString();
}

/* ------------------------------------------------------------------ */
/* Conflicts, by the shared availability rule                          */
/* ------------------------------------------------------------------ */

export interface CourtFacts {
  readonly id: string;
  readonly name: string;
  readonly placeId: string;
  readonly timeZone: string;
  /** Weekly windows from the court's schedule (open hours). */
  readonly windows: readonly {
    readonly weekday: number;
    readonly startsAtMinute: number;
    readonly endsAtMinute: number;
    readonly mode: string;
    readonly effectiveFrom?: string;
    readonly effectiveTo?: string;
  }[];
  /** Dated overrides (blackouts, maintenance). */
  readonly overrides: readonly {
    readonly id: string;
    readonly startsAt: string;
    readonly endsAt: string;
    readonly mode: string;
    readonly reason: string;
  }[];
}

export interface CoachFacts {
  /** Person id (what items carry). */
  readonly id: string;
  readonly name: string;
  readonly staffProfileId?: string;
  /** Loaded availability, or undefined when it could not be read. */
  readonly availability?: Omit<StaffAvailabilityInputs, "commitments">;
}

/** A court with no weekly hours stored is treated as open around the clock. */
const closedModes = new Set(["blocked", "maintenance"]);

export function courtAvailabilityInputs(
  court: CourtFacts,
  items: readonly ScheduleItem[],
  ignoreId?: string,
): StaffAvailabilityInputs {
  const open = court.windows.filter((window) => !closedModes.has(window.mode));
  const schedule: StaffAvailabilitySchedule = {
    id: `court:${court.id}`,
    status: "active",
    effectiveFrom: "2000-01-01",
    timezone: court.timeZone,
    windows:
      court.windows.length === 0
        ? [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
            weekday,
            startMinute: 0,
            endMinute: 1440,
          }))
        : open.map((window) => ({
            weekday: window.weekday,
            startMinute: window.startsAtMinute,
            endMinute: window.endsAtMinute,
          })),
  };
  return {
    schedules: [schedule],
    blackouts: [
      ...court.overrides
        .filter((override) => closedModes.has(override.mode))
        .map((override) => ({
          id: `override:${override.id}`,
          startsAt: override.startsAt,
          endsAt: override.endsAt,
        })),
      // Weekly closed windows are blackouts on the dates they apply.
    ],
    timeOff: [],
    commitments: items
      .filter(
        (item) =>
          item.courtId === court.id && item.id !== ignoreId && !item.cancelled,
      )
      .map((item) => ({
        id: item.id,
        kind:
          item.kind === "block" ? ("other" as const) : ("calendar" as const),
        startsAt: item.startsAt,
        endsAt: item.endsAt,
        title: item.title,
      })),
  };
}

export function coachAvailabilityInputs(
  coach: CoachFacts,
  items: readonly ScheduleItem[],
  ignoreId?: string,
): StaffAvailabilityInputs | undefined {
  if (!coach.availability) return undefined;
  return {
    ...coach.availability,
    commitments: items
      .filter(
        (item) =>
          item.coachId === coach.id && item.id !== ignoreId && !item.cancelled,
      )
      .map((item) => ({
        id: item.id,
        kind: "session" as const,
        startsAt: item.startsAt,
        endsAt: item.endsAt,
        title: item.title,
      })),
  };
}

/** Team availability (`operator.teamAvailability.staff`) as the shared rule's input. */
export function teamAvailabilityToInputs(page: {
  readonly schedules: readonly {
    readonly id: string;
    readonly status: StaffAvailabilitySchedule["status"];
    readonly effectiveFrom: string;
    readonly effectiveTo?: string;
    readonly timezone: string;
    readonly windows: readonly {
      readonly weekday: number;
      readonly startsAt: string;
      readonly endsAt: string;
      readonly kind?: string;
      readonly venueId?: string;
    }[];
  }[];
  readonly blackouts: readonly {
    readonly id: string;
    readonly startsAt: string;
    readonly endsAt: string;
  }[];
  readonly timeOff: readonly {
    readonly id: string;
    readonly startsAt: string;
    readonly endsAt: string;
    readonly status: string;
  }[];
}): Omit<StaffAvailabilityInputs, "commitments"> {
  return {
    schedules: page.schedules.map((schedule) => ({
      id: schedule.id,
      status: schedule.status,
      effectiveFrom: schedule.effectiveFrom,
      ...(schedule.effectiveTo ? { effectiveTo: schedule.effectiveTo } : {}),
      timezone: schedule.timezone,
      windows: schedule.windows.map((window) => ({
        weekday: window.weekday,
        startMinute: minuteOfDayFromTime(window.startsAt),
        endMinute: minuteOfDayFromTime(window.endsAt),
        ...(window.kind ? { kind: window.kind } : {}),
        ...(window.venueId ? { venueId: window.venueId } : {}),
      })),
    })),
    blackouts: page.blackouts.map((blackout) => ({
      id: blackout.id,
      startsAt: blackout.startsAt,
      endsAt: blackout.endsAt,
    })),
    timeOff: page.timeOff
      .filter((entry) =>
        ["requested", "approved", "declined", "cancelled"].includes(
          entry.status,
        ),
      )
      .map((entry) => ({
        id: entry.id,
        startsAt: entry.startsAt,
        endsAt: entry.endsAt,
        status: entry.status as
          "requested" | "approved" | "declined" | "cancelled",
      })),
  };
}

export interface Conflict {
  readonly subject: "court" | "coach";
  readonly reason: BusyInterval["reason"];
  /** "Court 3 is booked until 6:30 PM", "Ana is off that day". */
  readonly sentence: string;
}

export interface SlotRequest {
  readonly startsAt: string;
  readonly endsAt: string;
  readonly court?: CourtFacts;
  readonly coach?: CoachFacts;
  /** The item being moved (it does not conflict with itself). */
  readonly ignoreId?: string;
  /** The zone times are said in (the place's); defaults to the court's. */
  readonly timeZone?: string;
}

/**
 * Why a slot cannot be used, in words, by the shared rule. Empty when the
 * court (and the coach, when one is chosen and their availability is known)
 * is free for the whole slot.
 */
export function explainConflicts(
  request: SlotRequest,
  items: readonly ScheduleItem[],
): Conflict[] {
  const range = { startsAt: request.startsAt, endsAt: request.endsAt };
  const conflicts: Conflict[] = [];
  if (request.court) {
    const court = request.court;
    const inputs = courtAvailabilityInputs(court, items, request.ignoreId);
    const result = availabilityFor({ staffProfileId: court.id }, range, inputs);
    const first = result.busy[0];
    if (first) {
      conflicts.push({
        subject: "court",
        reason: first.reason,
        sentence: courtSentence(court, first, items, result.busy),
      });
    }
  }
  if (request.coach) {
    const coach = request.coach;
    const inputs = coachAvailabilityInputs(coach, items, request.ignoreId);
    if (inputs) {
      const result = availabilityFor(
        { staffProfileId: coach.staffProfileId ?? coach.id },
        range,
        inputs,
      );
      const first = result.busy[0];
      if (first) {
        conflicts.push({
          subject: "coach",
          reason: first.reason,
          sentence: coachSentence(coach, first, items, request, inputs),
        });
      }
    }
  }
  return conflicts;
}

function busyEnd(busy: readonly BusyInterval[], from: BusyInterval): string {
  // Adjacent busy intervals with the same reason read as one.
  let end = from.endsAt;
  for (const interval of busy) {
    if (interval.startsAt === end && interval.reason === from.reason) {
      end = interval.endsAt;
    }
  }
  return end;
}

function courtSentence(
  court: CourtFacts,
  busy: BusyInterval,
  items: readonly ScheduleItem[],
  all: readonly BusyInterval[],
): string {
  const zone = court.timeZone;
  const until = clock(busyEnd(all, busy), zone);
  switch (busy.reason) {
    case "commitment": {
      const item = items.find((candidate) =>
        busy.sourceIds.includes(candidate.id),
      );
      if (item?.kind === "block") {
        return `${court.name} is blocked until ${until}${item.reason ? ` (${item.reason})` : ""}`;
      }
      return `${court.name} is booked until ${clock(item?.endsAt ?? busy.endsAt, zone)}`;
    }
    case "blackout": {
      const id = busy.sourceIds[0]?.replace(/^override:/, "");
      const override = court.overrides.find((candidate) => candidate.id === id);
      return `${court.name} is closed until ${until}${override?.reason ? ` (${override.reason})` : ""}`;
    }
    case "time-off":
    case "outside-hours":
    case "no-schedule":
      return `${court.name} isn't open then`;
  }
}

function coachSentence(
  coach: CoachFacts,
  busy: BusyInterval,
  items: readonly ScheduleItem[],
  request: SlotRequest,
  inputs: StaffAvailabilityInputs,
): string {
  const name = coach.name.split(/\s+/)[0] ?? coach.name;
  const zone =
    request.timeZone ??
    request.court?.timeZone ??
    inputs.schedules[0]?.timezone ??
    "UTC";
  switch (busy.reason) {
    case "time-off": {
      const entry = inputs.timeOff.find((row) =>
        busy.sourceIds.includes(row.id),
      );
      return entry && coversDay(entry, request.startsAt, zone)
        ? `${name} is off that day`
        : `${name} is off until ${clock(entry?.endsAt ?? busy.endsAt, zone)}`;
    }
    case "blackout": {
      const entry = inputs.blackouts.find((row) =>
        busy.sourceIds.includes(row.id),
      );
      return entry && coversDay(entry, request.startsAt, zone)
        ? `${name} is off that day`
        : `${name} is unavailable until ${clock(entry?.endsAt ?? busy.endsAt, zone)}`;
    }
    case "commitment": {
      const item = items.find((candidate) =>
        busy.sourceIds.includes(candidate.id),
      );
      return item
        ? `${name} is teaching ${item.title} until ${clock(item.endsAt, zone)}`
        : `${name} is busy until ${clock(busy.endsAt, zone)}`;
    }
    case "outside-hours":
      return `${name} doesn't work at that time`;
    case "no-schedule":
      return `${name} has no working hours set for that day`;
  }
}

function coversDay(
  span: { readonly startsAt: string; readonly endsAt: string },
  at: string,
  zone: string,
): boolean {
  const date = localDateOf(Date.parse(at), zone);
  const day = placeDay(date, zone);
  return (
    Date.parse(span.startsAt) <= day.startMs &&
    Date.parse(span.endsAt) >= day.endMs
  );
}

export interface Alternative {
  readonly startsAt: string;
  readonly endsAt: string;
  readonly court?: CourtFacts;
  /** "Community Court at 11:00 AM", "Court 2 at the same time". */
  readonly label: string;
}

/**
 * The nearest free alternatives to a slot that conflicts: the same court
 * at the closest free start that day (searching both ways in `step`
 * minutes), and another court at the same time. At most two.
 */
export function nearestAlternatives(
  request: SlotRequest,
  items: readonly ScheduleItem[],
  courts: readonly CourtFacts[],
  step = SNAP_MINUTES,
  nowMs?: number,
): Alternative[] {
  const length =
    (Date.parse(request.endsAt) - Date.parse(request.startsAt)) / MINUTE_MS;
  const results: Alternative[] = [];
  const zone = request.court?.timeZone ?? courts[0]?.timeZone ?? "UTC";
  const day = placeDay(localDateOf(Date.parse(request.startsAt), zone), zone);
  if (request.court) {
    const start = minuteOfPlaceDay(request.startsAt, day);
    for (let offset = step; offset <= day.minutes; offset += step) {
      const found = [start + offset, start - offset].find((candidate) => {
        if (candidate < 0 || candidate + length > day.minutes) return false;
        const startsAt = new Date(
          day.startMs + candidate * MINUTE_MS,
        ).toISOString();
        if (nowMs !== undefined && Date.parse(startsAt) < nowMs) return false;
        return (
          explainConflicts(
            { ...request, startsAt, endsAt: addMinutes(startsAt, length) },
            items,
          ).length === 0
        );
      });
      if (found !== undefined) {
        const startsAt = new Date(
          day.startMs + found * MINUTE_MS,
        ).toISOString();
        results.push({
          startsAt,
          endsAt: addMinutes(startsAt, length),
          court: request.court,
          label: `${request.court.name} at ${clock(startsAt, zone)}`,
        });
        break;
      }
    }
  }
  const other = courts.find(
    (court) =>
      court.id !== request.court?.id &&
      (!request.court || court.placeId === request.court.placeId) &&
      explainConflicts({ ...request, court }, items).length === 0,
  );
  if (other) {
    results.push({
      startsAt: request.startsAt,
      endsAt: request.endsAt,
      court: other,
      label: `${other.name} at the same time`,
    });
  }
  return results.slice(0, 2);
}

/** Who is free for a whole interval, by the shared rule; unknown availability is left out. */
export function whoIsFree(
  coaches: readonly CoachFacts[],
  items: readonly ScheduleItem[],
  startsAt: string,
  endsAt: string,
): {
  readonly free: CoachFacts[];
  readonly busy: { coach: CoachFacts; sentence: string }[];
  readonly unknown: CoachFacts[];
} {
  const free: CoachFacts[] = [];
  const busy: { coach: CoachFacts; sentence: string }[] = [];
  const unknown: CoachFacts[] = [];
  for (const coach of coaches) {
    if (!coach.availability) {
      unknown.push(coach);
      continue;
    }
    const [conflict] = explainConflicts({ startsAt, endsAt, coach }, items);
    if (conflict) busy.push({ coach, sentence: conflict.sentence });
    else free.push(coach);
  }
  return { free, busy, unknown };
}

/* ------------------------------------------------------------------ */
/* Now and next (the front desk's strip)                               */
/* ------------------------------------------------------------------ */

export interface NowAndNext {
  readonly onNow: ScheduleItem[];
  readonly next: ScheduleItem[];
  /** People due now or within the hour who have not checked in. */
  readonly notCheckedIn: { item: ScheduleItem; person: ItemPerson }[];
  readonly unpaid: ScheduleItem[];
}

/** True while an item is happening: the only time the page uses the live colour. */
export function isLive(
  item: Pick<ScheduleItem, "startsAt" | "endsAt" | "cancelled" | "kind">,
  nowMs: number,
) {
  return (
    !item.cancelled &&
    item.kind !== "block" &&
    Date.parse(item.startsAt) <= nowMs &&
    Date.parse(item.endsAt) > nowMs
  );
}

export function nowAndNext(
  items: readonly ScheduleItem[],
  nowMs: number,
): NowAndNext {
  const active = items.filter(
    (item) => !item.cancelled && item.kind !== "block",
  );
  const hour = nowMs + 60 * MINUTE_MS;
  const onNow = active.filter((item) => isLive(item, nowMs));
  const next = active
    .filter(
      (item) =>
        Date.parse(item.startsAt) > nowMs && Date.parse(item.startsAt) <= hour,
    )
    .sort(
      (left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt),
    );
  const due = [...onNow, ...next];
  const notCheckedIn = due.flatMap((item) =>
    item.people
      .filter((person) => !person.checkedIn && !person.noShow)
      .map((person) => ({ item, person })),
  );
  const unpaid = active.filter(
    (item) =>
      item.kind === "booking" &&
      Date.parse(item.endsAt) > nowMs &&
      Date.parse(item.startsAt) <= hour &&
      ((item.amountMinor ?? 0) > (item.paidMinor ?? 0) ||
        item.people.some((person) => person.payment === "due")),
  );
  return { onNow, next, notCheckedIn, unpaid };
}

/* ------------------------------------------------------------------ */
/* Money and people in words                                            */
/* ------------------------------------------------------------------ */

export function money(minor: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(minor / 100);
}

export function plural(count: number, word: string, many = `${word}s`): string {
  return `${count} ${count === 1 ? word : many}`;
}

/** "Maya Chen, Noah Park and 3 others". */
export function namesWords(names: readonly string[], max = 3): string {
  if (names.length === 0) return "nobody";
  if (names.length <= max) {
    return names.length === 1
      ? names[0]!
      : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  }
  return `${names.slice(0, max).join(", ")} and ${plural(names.length - max, "other")}`;
}

/** Items a closure over these courts and times would affect. */
export function affectedBy(
  items: readonly ScheduleItem[],
  closure: {
    readonly courtIds: readonly string[];
    readonly startsAt: string;
    readonly endsAt: string;
  },
): ScheduleItem[] {
  const start = Date.parse(closure.startsAt);
  const end = Date.parse(closure.endsAt);
  return items
    .filter(
      (item) =>
        !item.cancelled &&
        item.kind !== "block" &&
        item.courtId !== undefined &&
        closure.courtIds.includes(item.courtId) &&
        Date.parse(item.startsAt) < end &&
        Date.parse(item.endsAt) > start,
    )
    .sort(
      (left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt),
    );
}

/** "Moving it tells 6 people", for the move confirmation. */
export function peopleWithBookings(item: ScheduleItem): ItemPerson[] {
  return item.people.filter((person) => !person.noShow);
}

/** The viewer's zone differs from the place's at that instant. */
export function zonesDiffer(
  atMs: number,
  placeZone: string,
  viewerZone: string,
): boolean {
  if (placeZone === viewerZone) return false;
  const offset = (zone: string) =>
    format(zone, { timeZoneName: "longOffset" })
      .formatToParts(new Date(atMs))
      .find((part) => part.type === "timeZoneName")?.value;
  return offset(placeZone) !== offset(viewerZone);
}

/** A stable `open` key for an item. */
export function itemKey(item: Pick<ScheduleItem, "source" | "id">): string {
  return `${item.source}:${item.id}`;
}
