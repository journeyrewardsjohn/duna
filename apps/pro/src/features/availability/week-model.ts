/**
 * My week as blocks (M-R5, board P18-Availability; persona CH-1.n). Pure:
 * no React Native, no clock, no network; `week-model.test.ts` covers it.
 *
 * - A block is one window of a weekly schedule in the PLACE's wall-clock
 *   time (the club's time zone): weekday 0 = Sunday, minutes after local
 *   midnight. A block that runs past midnight ends after 1440 (the
 *   contract's window then has an end at or before its start).
 * - The API shape is `operator.teamAvailability` windows ("HH:MM"); the
 *   mapping round-trips exactly (`blocksFromWindows` ↔ `windowsFromBlocks`).
 * - Whether a session still fits is decided by the ONE shared rule
 *   (`isFreeThroughout` from @duna/scheduling), the same rule the backend
 *   uses when it lists sessions that need cover after a schedule change.
 * - Sentences come from `team-words.ts` (HQ's words); nothing here words
 *   availability differently.
 */
import {
  addCalendarDays,
  affectedCommitments,
  isFreeThroughout,
  localDateOf,
  wallTimeToInstant,
  type StaffAvailabilitySchedule,
  type StaffCommitment,
} from "@duna/scheduling";
import {
  availabilitySummary,
  minuteOf,
  timeOf,
  toRuleSchedule,
  weekdayLong,
  weekOrder,
  windowKindLabels,
  windowLabel,
  type ScheduleRow,
  type WindowKind,
  type WindowRow,
} from "./team-words";

export const DAY_MINUTES = 1440;
/** The backend looks this far ahead for an open-ended schedule (B3a). */
export const LOOKAHEAD_DAYS = 120;
/** Times move in half hours on the phone (thumbs, not a keyboard). */
export const STEP_MINUTES = 30;

export interface WeekBlock {
  /** Stable while editing (a window id, or a local key for a new block). */
  readonly key: string;
  readonly weekday: number;
  readonly start: number;
  /** After `start`; above 1440 when the block runs past midnight. */
  readonly end: number;
  readonly kind: WindowKind;
  readonly label?: string;
  readonly venueId?: string;
}

export type WindowInput = Omit<WindowRow, "id">;

/** Contract windows → blocks, Monday first, then by start. */
export function blocksFromWindows(windows: readonly WindowRow[]): WeekBlock[] {
  return sortBlocks(
    windows.map((window) => {
      const start = minuteOf(window.startsAt);
      const endOfDay = minuteOf(window.endsAt);
      const end = endOfDay <= start ? endOfDay + DAY_MINUTES : endOfDay;
      return {
        key: window.id,
        weekday: window.weekday,
        start,
        end,
        kind: window.kind,
        ...(window.label ? { label: window.label } : {}),
        ...(window.venueId ? { venueId: window.venueId } : {}),
      };
    }),
  );
}

/** Blocks → the `upsertSchedule` input's windows. */
export function windowsFromBlocks(blocks: readonly WeekBlock[]): WindowInput[] {
  return sortBlocks(blocks).map((block) => ({
    weekday: block.weekday,
    startsAt: timeOf(block.start),
    endsAt: timeOf(block.end),
    kind: block.kind,
    ...(block.label ? { label: block.label } : {}),
    ...(block.venueId ? { venueId: block.venueId } : {}),
  }));
}

const orderIndex = (weekday: number) =>
  (weekOrder as readonly number[]).indexOf(weekday);

export function sortBlocks(blocks: readonly WeekBlock[]): WeekBlock[] {
  return [...blocks].sort(
    (left, right) =>
      orderIndex(left.weekday) - orderIndex(right.weekday) ||
      left.start - right.start ||
      left.end - right.end,
  );
}

export function blocksOn(
  blocks: readonly WeekBlock[],
  weekday: number,
): WeekBlock[] {
  return sortBlocks(blocks.filter((block) => block.weekday === weekday));
}

/** True when the two block lists say the same week. */
export function sameWeek(
  left: readonly WeekBlock[],
  right: readonly WeekBlock[],
): boolean {
  const shape = (blocks: readonly WeekBlock[]) =>
    JSON.stringify(windowsFromBlocks(blocks));
  return shape(left) === shape(right);
}

/** "5–9 PM" for the block's row (HQ's `windowLabel`). */
export function blockTimeLabel(block: WeekBlock): string {
  return windowLabel(timeOf(block.start), timeOf(block.end));
}

/** "5 PM", "7:30 AM", "12 PM": for spoken labels. */
export function spokenTime(minute: number): string {
  const value = ((minute % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  const suffix = hours < 12 ? "AM" : "PM";
  const twelve = hours % 12 === 0 ? 12 : hours % 12;
  return minutes === 0
    ? `${twelve} ${suffix}`
    : `${twelve}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

/** "Monday, 5 to 9 PM, coaching" (VoiceOver reads each block like this). */
export function blockSpokenLabel(block: WeekBlock): string {
  const start = spokenTime(block.start);
  const end = spokenTime(block.end);
  const startSuffix = start.slice(-2);
  const sameHalf = startSuffix === end.slice(-2) && block.end <= DAY_MINUTES;
  const span = sameHalf
    ? `${start.slice(0, -3)} to ${end}`
    : `${start} to ${end}${block.end > DAY_MINUTES ? " the next day" : ""}`;
  const what = (
    block.label ?? windowKindLabels[block.kind]
  ).toLocaleLowerCase();
  return `${weekdayLong[block.weekday]}, ${span}, ${what}`;
}

/** Why a block cannot be saved as it is, or undefined. */
export function blockProblem(
  block: Pick<WeekBlock, "weekday" | "start" | "end" | "key">,
  others: readonly WeekBlock[],
): string | undefined {
  if (block.end <= block.start) return "A block must end after it starts.";
  if (block.end - block.start > DAY_MINUTES)
    return "A block can be at most a day long.";
  const clash = others.find(
    (other) => other.key !== block.key && overlapsOnWeek(block, other),
  );
  if (clash) {
    return `It overlaps ${weekdayLong[clash.weekday]} ${blockTimeLabel(clash)}.`;
  }
  return undefined;
}

function weekSpans(block: Pick<WeekBlock, "weekday" | "start" | "end">) {
  const base = block.weekday * DAY_MINUTES;
  const start = base + block.start;
  const end = base + block.end;
  const week = 7 * DAY_MINUTES;
  // A Saturday block past midnight wraps to Sunday morning.
  return end > week
    ? [
        [start, week],
        [0, end - week],
      ]
    : [[start, end]];
}

function overlapsOnWeek(
  left: Pick<WeekBlock, "weekday" | "start" | "end">,
  right: Pick<WeekBlock, "weekday" | "start" | "end">,
): boolean {
  return weekSpans(left).some(([leftStart, leftEnd]) =>
    weekSpans(right).some(
      ([rightStart, rightEnd]) =>
        leftStart! < rightEnd! && rightStart! < leftEnd!,
    ),
  );
}

/** Adds or replaces one block (by key). */
export function putBlock(
  blocks: readonly WeekBlock[],
  block: WeekBlock,
): WeekBlock[] {
  return sortBlocks([
    ...blocks.filter((candidate) => candidate.key !== block.key),
    block,
  ]);
}

export function removeBlock(
  blocks: readonly WeekBlock[],
  key: string,
): WeekBlock[] {
  return blocks.filter((block) => block.key !== key);
}

export function clearDay(
  blocks: readonly WeekBlock[],
  weekday: number,
): WeekBlock[] {
  return blocks.filter((block) => block.weekday !== weekday);
}

/**
 * Copies one day's blocks onto other days: each target day's blocks are
 * REPLACED by the copy (what "copy Monday to Wednesday" means on a phone).
 * New keys are made with `makeKey` so the copies are separate blocks.
 */
export function copyDay(
  blocks: readonly WeekBlock[],
  from: number,
  to: readonly number[],
  makeKey: (weekday: number, index: number) => string,
): WeekBlock[] {
  const source = blocksOn(blocks, from);
  const targets = new Set(to.filter((weekday) => weekday !== from));
  const kept = blocks.filter((block) => !targets.has(block.weekday));
  const copies = [...targets].flatMap((weekday) =>
    source.map((block, index) => ({
      ...block,
      key: makeKey(weekday, index),
      weekday,
    })),
  );
  return sortBlocks([...kept, ...copies]);
}

/** One block's start or end moved by whole steps, kept inside the day. */
export function nudge(
  block: WeekBlock,
  edge: "start" | "end",
  steps: number,
): WeekBlock {
  if (edge === "start") {
    const start = Math.min(
      Math.max(0, block.start + steps * STEP_MINUTES),
      DAY_MINUTES - STEP_MINUTES,
    );
    return { ...block, start };
  }
  const end = Math.min(
    Math.max(block.start + STEP_MINUTES, block.end + steps * STEP_MINUTES),
    block.start + DAY_MINUTES,
  );
  return { ...block, end };
}

/* ------------------------------------------------------------ patterns */

export interface WeekPattern {
  readonly key: string;
  readonly title: string;
  readonly days: readonly number[];
  readonly start: number;
  readonly end: number;
}

/** A two-tap start for a member with no availability yet. */
export const WEEK_PATTERNS: readonly WeekPattern[] = [
  {
    key: "weekday-evenings",
    title: "Weekday evenings",
    days: [1, 2, 3, 4, 5],
    start: 17 * 60,
    end: 21 * 60,
  },
  {
    key: "after-school",
    title: "After school",
    days: [1, 2, 3, 4, 5],
    start: 15 * 60,
    end: 20 * 60,
  },
  {
    key: "weekday-mornings",
    title: "Weekday mornings",
    days: [1, 2, 3, 4, 5],
    start: 7 * 60,
    end: 12 * 60,
  },
  {
    key: "weekends",
    title: "Weekend mornings",
    days: [6, 0],
    start: 8 * 60,
    end: 12 * 60,
  },
];

export function blocksFromPattern(pattern: WeekPattern): WeekBlock[] {
  return sortBlocks(
    pattern.days.map((weekday) => ({
      key: `${pattern.key}-${weekday}`,
      weekday,
      start: pattern.start,
      end: pattern.end,
      kind: "coaching" as const,
    })),
  );
}

/* ------------------------------------------------------------ sentence */

/**
 * The shared sentence for a week being edited, as if it were in force
 * today ("Available Mon and Wed evenings, Sat mornings"). Uses HQ's
 * `availabilitySummary`, never its own wording.
 */
export function draftSentence(input: {
  readonly blocks: readonly WeekBlock[];
  readonly timeZone: string;
  readonly now: string;
}): string {
  const today = localDateOf(Date.parse(input.now), input.timeZone);
  const sentence = availabilitySummary({
    schedules: [
      {
        id: "draft",
        staffProfileId: "me",
        name: "Draft",
        status: "active",
        effectiveFrom: today,
        timezone: input.timeZone,
        windows: windowsFromBlocks(input.blocks).map((window, index) => ({
          ...window,
          id: `draft-${index}`,
        })),
        updatedAt: input.now,
      },
    ],
    blackouts: [],
    timeOff: [],
    now: input.now,
    timeZone: input.timeZone,
  });
  return sentence;
}

/* ----------------------------------------------------- schedule changes */

/** A session the member leads (from the calendar they already have). */
export interface MySession {
  readonly id: string;
  readonly title: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly venueName?: string;
}

/**
 * What saving does to the member's schedules, as the backend will do it:
 * - `replace`: change an existing schedule's windows and dates in place
 *   (a schedule in force changes at once);
 * - `start`: a new schedule that takes over on `effectiveFrom`
 *   (`upsertSchedule` then `transitionSchedule` → active, which ends an
 *   earlier active schedule the day before);
 * - `draft`: saved without taking effect (a draft never counts).
 */
export type ScheduleChange =
  | {
      readonly kind: "replace";
      readonly scheduleId: string;
      readonly effectiveFrom: string;
      readonly effectiveTo?: string;
      readonly blocks: readonly WeekBlock[];
    }
  | {
      readonly kind: "start";
      readonly effectiveFrom: string;
      readonly effectiveTo?: string;
      readonly blocks: readonly WeekBlock[];
    }
  | { readonly kind: "draft" };

/** The member's schedules after the change, as the shared rule reads them. */
export function schedulesAfter(
  schedules: readonly ScheduleRow[],
  change: ScheduleChange,
  timeZone: string,
): StaffAvailabilitySchedule[] {
  const rule = schedules.map(toRuleSchedule);
  if (change.kind === "draft") return rule;
  const windows = windowsFromBlocks(change.blocks).map((window) => ({
    weekday: window.weekday,
    startMinute: minuteOf(window.startsAt),
    endMinute: minuteOf(window.endsAt),
    kind: window.kind,
  }));
  if (change.kind === "replace") {
    return rule.map((schedule) =>
      schedule.id === change.scheduleId
        ? {
            ...schedule,
            effectiveFrom: change.effectiveFrom,
            ...(change.effectiveTo
              ? { effectiveTo: change.effectiveTo }
              : { effectiveTo: undefined }),
            windows,
          }
        : schedule,
    );
  }
  const dayBefore = addCalendarDays(change.effectiveFrom, -1);
  return [
    ...rule.map((schedule) =>
      schedule.status === "active" &&
      schedule.effectiveFrom < change.effectiveFrom &&
      (schedule.effectiveTo === undefined ||
        schedule.effectiveTo >= change.effectiveFrom)
        ? { ...schedule, effectiveTo: dayBefore }
        : schedule,
    ),
    {
      id: "proposed",
      status: "active" as const,
      effectiveFrom: change.effectiveFrom,
      ...(change.effectiveTo ? { effectiveTo: change.effectiveTo } : {}),
      timezone: timeZone,
      windows,
    },
  ];
}

export interface SessionConflict extends MySession {
  /** It fitted the hours before this change (the change moves it out). */
  readonly newlyOutside: boolean;
}

/**
 * Booked sessions a schedule change leaves outside the member's hours,
 * judged by the shared rule (schedules only: time away is its own list).
 * These are exactly the sessions the backend lists as needing cover with
 * the reason "hours changed"; they stay booked with the member until a
 * manager assigns someone else.
 */
export function scheduleConflicts(input: {
  readonly sessions: readonly MySession[];
  readonly schedules: readonly ScheduleRow[];
  readonly change: ScheduleChange;
  readonly timeZone: string;
  readonly now: string;
}): SessionConflict[] {
  if (input.change.kind === "draft") return [];
  const now = Date.parse(input.now);
  const horizon = now + LOOKAHEAD_DAYS * 86_400_000;
  const from = input.change.effectiveFrom;
  const to = input.change.effectiveTo;
  const before = input.schedules.map(toRuleSchedule);
  const after = schedulesAfter(input.schedules, input.change, input.timeZone);
  const inputsFor = (schedules: StaffAvailabilitySchedule[]) => ({
    schedules,
    blackouts: [],
    timeOff: [],
    commitments: [],
  });
  const member = { staffProfileId: "me" };
  return input.sessions
    .filter((session) => {
      const starts = Date.parse(session.startsAt);
      const ends = Date.parse(session.endsAt);
      if (!(ends > now) || starts > horizon || !(ends > starts)) return false;
      const date = localDateOf(starts, input.timeZone);
      return date >= from && (to === undefined || date <= to);
    })
    .flatMap((session) => {
      const span = { startsAt: session.startsAt, endsAt: session.endsAt };
      if (isFreeThroughout(member, span, inputsFor(after))) return [];
      return [
        {
          ...session,
          newlyOutside: isFreeThroughout(member, span, inputsFor(before)),
        },
      ];
    })
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
}

/* ------------------------------------------------------------- time away */

/**
 * Whole local days in the place's time zone as the instants the API takes:
 * from the start of `from` to the start of the day after `to`. On a
 * daylight-saving day the span is 23 or 25 hours, as the wall clock says.
 */
export function wholeDaySpan(
  from: string,
  to: string,
  timeZone: string,
): { readonly startsAt: string; readonly endsAt: string } {
  const [first, last] = from <= to ? [from, to] : [to, from];
  return {
    startsAt: new Date(wallTimeToInstant(first, 0, timeZone)).toISOString(),
    endsAt: new Date(
      wallTimeToInstant(addCalendarDays(last, 1), 0, timeZone),
    ).toISOString(),
  };
}

/** Picking days on the strip: the first tap starts the range, the second ends it. */
export function nextRange(
  current: { readonly from: string | null; readonly to: string | null },
  date: string,
): { readonly from: string; readonly to: string | null } {
  if (!current.from || current.to) return { from: date, to: null };
  if (date <= current.from) return { from: date, to: null };
  return { from: current.from, to: date };
}

/** My booked sessions inside a span (the shared rule's `affectedCommitments`). */
export function sessionsInSpan(
  sessions: readonly MySession[],
  span: { readonly startsAt: string; readonly endsAt: string },
  now: string,
): MySession[] {
  const byId = new Map(sessions.map((session) => [session.id, session]));
  const commitments: StaffCommitment[] = sessions
    .filter((session) => Date.parse(session.endsAt) > Date.parse(now))
    .map((session) => ({
      id: session.id,
      kind: "session",
      startsAt: session.startsAt,
      endsAt: session.endsAt,
    }));
  return affectedCommitments({ commitments, unavailable: span }).flatMap(
    (commitment) => {
      const session = byId.get(commitment.id);
      return session ? [session] : [];
    },
  );
}

/** "Mon 1 Dec, 5:00–6:30 PM" for a session line, in the place's time. */
export function sessionWhenWords(
  session: Pick<MySession, "startsAt" | "endsAt">,
  timeZone: string,
): string {
  const start = Date.parse(session.startsAt);
  const end = Date.parse(session.endsAt);
  const date = localDateOf(start, timeZone);
  const [, month = 1, day = 1] = date.split("-").map(Number);
  const weekday = new Date(`${date}T12:00:00.000Z`).getUTCDay();
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const minute = (instant: number) =>
    Math.round(
      (instant -
        wallTimeToInstant(localDateOf(instant, timeZone), 0, timeZone)) /
        60_000,
    );
  return `${weekdayLong[weekday]!.slice(0, 3)} ${day} ${months[month - 1]}, ${windowLabel(timeOf(minute(start)), timeOf(minute(end)))}`;
}
