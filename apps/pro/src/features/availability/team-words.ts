/**
 * Team's words on the phone (M-R5). Pure: no React Native, no clock, no
 * network.
 *
 * The phone must say what Duna HQ says, in the same words. HQ's Team
 * screens (H-TEAM, `apps/hq/components/team/team-model.ts`) hold these
 * sentences today and no shared package does, so this file is a WORD FOR
 * WORD copy of the parts the phone uses, and `team-words.test.ts` pins every
 * sentence to the same expectations HQ's tests use. Needs core: move these
 * functions to a shared package (for example `@duna/scheduling/words` and a
 * pay-words module in `@duna/core`) so HQ and Pro import one copy; until
 * then a change to one must be made to both.
 *
 * Every amount is formatted from what the backend returned
 * (`formatMoney` from @duna/core); nothing here computes pay.
 */
import { formatMoney } from "@duna/core";
import {
  addCalendarDays,
  localDateOf,
  scheduleInForce,
  type StaffAvailabilitySchedule,
} from "@duna/scheduling";

export type Tone = "positive" | "attention" | "info" | "danger" | "neutral";

export interface StateCopy {
  readonly label: string;
  readonly tone: Tone;
}

/* ------------------------------------------------------------ contract */

/** The contract's window (`operator.teamAvailability`). */
export interface WindowRow {
  readonly id: string;
  readonly weekday: number;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly kind: WindowKind;
  readonly label?: string;
  readonly venueId?: string;
}

export type WindowKind = "coaching" | "early" | "juniors" | "office" | "other";

export type ScheduleStatus = "draft" | "active" | "fallback" | "archived";

/** The contract's schedule. */
export interface ScheduleRow {
  readonly id: string;
  readonly staffProfileId: string;
  readonly name: string;
  readonly status: ScheduleStatus;
  readonly effectiveFrom: string;
  readonly effectiveTo?: string;
  readonly timezone: string;
  readonly sourceText?: string;
  readonly windows: readonly WindowRow[];
  readonly updatedAt: string;
}

/* --------------------------------------------------------- availability */

export const weekdayShort = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;
export const weekdayLong = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
/** Monday first: how a club reads its week. */
export const weekOrder = [1, 2, 3, 4, 5, 6, 0] as const;

/** "15:00" → 900. */
export function minuteOf(time: string): number {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/** 900 → "15:00". */
export function timeOf(minute: number): string {
  const value = ((minute % 1440) + 1440) % 1440;
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

/** "3:00 PM" from "15:00". */
export function clockLabel(time: string): string {
  const minute = minuteOf(time);
  const hours = Math.floor(minute / 60) % 24;
  const minutes = minute % 60;
  const suffix = hours < 12 ? "AM" : "PM";
  const twelve = hours % 12 === 0 ? 12 : hours % 12;
  return `${twelve}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

/** "3:00–8:00 PM", "7:00 AM–12:00 PM". */
export function windowLabel(startsAt: string, endsAt: string): string {
  const start = clockLabel(startsAt);
  const end = clockLabel(endsAt);
  const [startTime, startSuffix] = start.split(" ");
  const [, endSuffix] = end.split(" ");
  return startSuffix === endSuffix ? `${startTime}–${end}` : `${start}–${end}`;
}

/** The contract's schedule as the shared rule reads it. */
export function toRuleSchedule(
  schedule: ScheduleRow,
): StaffAvailabilitySchedule {
  return {
    id: schedule.id,
    status: schedule.status,
    effectiveFrom: schedule.effectiveFrom,
    ...(schedule.effectiveTo ? { effectiveTo: schedule.effectiveTo } : {}),
    timezone: schedule.timezone,
    windows: schedule.windows.map((window) => ({
      weekday: window.weekday,
      startMinute: minuteOf(window.startsAt),
      endMinute: minuteOf(window.endsAt),
      kind: window.kind,
      ...(window.label ? { label: window.label } : {}),
    })),
  };
}

type Daypart = "morning" | "afternoon" | "evening";
const dayparts: readonly { part: Daypart; from: number; to: number }[] = [
  { part: "morning", from: 0, to: 12 * 60 },
  { part: "afternoon", from: 12 * 60, to: 17 * 60 },
  { part: "evening", from: 17 * 60, to: 24 * 60 },
];

/** The parts of the day a window covers for at least an hour (or its only part). */
function windowDayparts(startMinute: number, endMinute: number): Daypart[] {
  const end = endMinute <= startMinute ? 24 * 60 : Math.min(endMinute, 1440);
  const overlaps = dayparts.map((daypart) => ({
    part: daypart.part,
    minutes: Math.max(
      0,
      Math.min(end, daypart.to) - Math.max(startMinute, daypart.from),
    ),
  }));
  const long = overlaps.filter((item) => item.minutes >= 60);
  if (long.length > 0) return long.map((item) => item.part);
  const best = overlaps.reduce((a, b) => (b.minutes > a.minutes ? b : a));
  return best.minutes > 0 ? [best.part] : [];
}

/** "Mon", "Mon and Wed", "Mon, Wed and Sat". */
export function listWords(words: readonly string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** "12 December" from "2026-12-12". */
export function dayMonth(date: string): string {
  const [, month = 1, day = 1] = date.split("-").map(Number);
  return `${day} ${monthNames[month - 1]}`;
}

/** "12 to 19 December", "30 November to 2 December", "12 December". */
export function dateSpanWords(from: string, to: string): string {
  if (from === to) return dayMonth(from);
  const [fromYear, fromMonth, fromDay] = from.split("-").map(Number);
  const [toYear, toMonth] = to.split("-").map(Number);
  if (fromYear === toYear && fromMonth === toMonth) {
    return `${fromDay} to ${dayMonth(to)}`;
  }
  return `${dayMonth(from)} to ${dayMonth(to)}`;
}

/** The local dates an instant span covers (the end is exclusive). */
export function localSpan(
  startsAt: string,
  endsAt: string,
  timeZone: string,
): { readonly from: string; readonly to: string } {
  const start = Date.parse(startsAt);
  const end = Math.max(start, Date.parse(endsAt) - 1);
  return {
    from: localDateOf(start, timeZone),
    to: localDateOf(end, timeZone),
  };
}

export interface AvailabilitySummaryInput {
  readonly schedules: readonly ScheduleRow[];
  readonly blackouts: readonly { startsAt: string; endsAt: string }[];
  readonly timeOff: readonly {
    startsAt: string;
    endsAt: string;
    status: string;
  }[];
  /** Now, as an ISO instant (an argument, never read from a clock here). */
  readonly now: string;
  readonly timeZone: string;
  /** How far ahead time away is mentioned. Default 60 days. */
  readonly lookaheadDays?: number;
}

/**
 * The shared rule's verdict in words, for the member's header, the roster
 * and Ask Duna: "Available Mon and Wed afternoons and evenings, Sat
 * mornings; off 12 to 13 December". The schedule is the one the rule puts
 * in force today (`scheduleInForce`, so drafts and archived schedules never
 * count); time away is approved time off and blackouts that have not ended.
 */
export function availabilitySummary(input: AvailabilitySummaryInput): string {
  const today = localDateOf(Date.parse(input.now), input.timeZone);
  const inForce = scheduleInForce(input.schedules.map(toRuleSchedule), today);
  let week: string;
  if (!inForce) {
    week =
      input.schedules.length === 0
        ? "No availability set"
        : "No schedule in force today";
  } else {
    const partsByDay = new Map<number, Set<Daypart>>();
    for (const window of inForce.windows) {
      const set = partsByDay.get(window.weekday) ?? new Set<Daypart>();
      for (const part of windowDayparts(window.startMinute, window.endMinute)) {
        set.add(part);
      }
      partsByDay.set(window.weekday, set);
    }
    const groups = new Map<string, number[]>();
    for (const weekday of weekOrder) {
      const parts = partsByDay.get(weekday);
      if (!parts || parts.size === 0) continue;
      const key = dayparts
        .map((daypart) => daypart.part)
        .filter((part) => parts.has(part))
        .join("|");
      groups.set(key, [...(groups.get(key) ?? []), weekday]);
    }
    const phrases = [...groups.entries()].map(([key, days]) => {
      const parts = key.split("|").map((part) => `${part}s`);
      return `${listWords(days.map((day) => weekdayShort[day]!))} ${listWords(parts)}`;
    });
    week =
      phrases.length === 0
        ? "Not available on any day this week"
        : `Available ${phrases.join(", ")}`;
  }
  const horizon = addCalendarDays(today, input.lookaheadDays ?? 60);
  const away = [
    ...input.blackouts,
    ...input.timeOff.filter((row) => row.status === "approved"),
  ]
    .map((row) => localSpan(row.startsAt, row.endsAt, input.timeZone))
    .filter((span) => span.to >= today && span.from <= horizon)
    .sort((a, b) => a.from.localeCompare(b.from));
  if (away.length === 0) return week;
  const first = away[0]!;
  const more = away.length - 1;
  return `${week}; off ${dateSpanWords(first.from, first.to)}${more > 0 ? ` (and ${more} more ${more === 1 ? "time" : "times"} away)` : ""}`;
}

export function scheduleStatusCopy(status: ScheduleStatus): StateCopy {
  switch (status) {
    case "active":
      return { label: "In use", tone: "positive" };
    case "fallback":
      return { label: "Fallback", tone: "neutral" };
    case "draft":
      return { label: "Draft", tone: "info" };
    case "archived":
      return { label: "Archived", tone: "neutral" };
  }
}

export const windowKindLabels: Record<WindowKind, string> = {
  coaching: "Coaching",
  early: "Early",
  juniors: "Juniors",
  office: "Office",
  other: "Other",
};

export function timeOffStatusCopy(status: string): StateCopy {
  switch (status) {
    case "requested":
      return { label: "Asked for", tone: "attention" };
    case "approved":
      return { label: "Approved", tone: "positive" };
    case "declined":
      return { label: "Declined", tone: "neutral" };
    default:
      return { label: "Cancelled", tone: "neutral" };
  }
}

/* ------------------------------------------------------------- coverage */

export function coverageReasonWords(reason: string, who?: string): string {
  const name = who ?? "The coach";
  switch (reason) {
    case "time-off":
      return `${name} has time off`;
    case "blackout":
      return `${name} can't work then`;
    case "schedule-change":
      return `${name}'s hours changed`;
    case "no-coach-assigned":
      return "No coach is assigned";
    default:
      return "Marked as needing cover";
  }
}

export function coverageStatusCopy(status: string): StateCopy {
  switch (status) {
    case "open":
      return { label: "Needs cover", tone: "attention" };
    case "asking":
      return { label: "Asked", tone: "info" };
    case "covered":
      return { label: "Covered", tone: "positive" };
    case "nobody-free":
      return { label: "Nobody free", tone: "danger" };
    default:
      return { label: "Cancelled", tone: "neutral" };
  }
}

export function offerStatusWords(status: string): string {
  switch (status) {
    case "asked":
      return "Asked";
    case "accepted":
      return "Said yes";
    case "declined":
      return "Said no";
    case "assigned":
      return "Assigned";
    case "withdrawn":
      return "No longer needed";
    default:
      return "Suggested";
  }
}

/* ------------------------------------------------------------------ pay */

export type Classification = "1099-contractor" | "w2-employee" | "not-set";

export function classificationLabel(value: Classification): string {
  switch (value) {
    case "1099-contractor":
      return "Contractor (1099)";
    case "w2-employee":
      return "Employee (W-2)";
    default:
      return "Not set";
  }
}

export type CompensationModel =
  "per-session" | "hourly" | "salary" | "revenue-share" | "hourly-plus-share";
type Amount = { readonly amountMinor: number; readonly currency: string };

const offeringWords: Readonly<Record<string, string>> = {
  "private-lesson": "private lessons",
  "group-lesson": "group lessons",
  clinic: "clinics",
  camp: "camps",
  "open-play": "open play",
  league: "leagues",
  tournament: "tournaments",
};

/** "private lessons and clinics" for a revenue-share scope; empty = everything. */
export function scopeWords(scope: readonly string[]): string {
  if (scope.length === 0) return "every offering";
  return listWords(
    scope.map(
      (subtype) =>
        offeringWords[subtype] ?? subtype.replaceAll("-", " ").toLowerCase(),
    ),
  );
}

function money(value: Amount | undefined): string {
  return value ? formatMoney(value.amountMinor, value.currency) : "[rate]";
}

/** "30%" or "12.5%" from basis points (a display of the stored figure). */
export function percentWords(bps: number): string {
  const whole = bps % 100 === 0;
  return `${whole ? bps / 100 : (bps / 100).toFixed(2).replace(/0$/, "")}%`;
}

export interface CompensationShape {
  readonly model: CompensationModel;
  readonly hourlyRate?: Amount;
  readonly perSessionRate?: Amount;
  readonly annualSalary?: Amount;
  readonly revenueShareBps?: number;
  readonly revenueShareScope: readonly string[];
}

/**
 * How someone is paid, as one sentence: "$40.00 per session", "$28.00 an
 * hour for scheduled time", "30% of net proceeds from clinics".
 */
export function compensationSentence(value: CompensationShape): string {
  const share = `${percentWords(value.revenueShareBps ?? 0)} of net proceeds from ${scopeWords(value.revenueShareScope)}`;
  switch (value.model) {
    case "per-session":
      return `${money(value.perSessionRate)} per session`;
    case "hourly":
      return `${money(value.hourlyRate)} an hour for scheduled time`;
    case "salary":
      return `${money(value.annualSalary)} a year in salary`;
    case "revenue-share":
      return share;
    case "hourly-plus-share":
      return `${money(value.hourlyRate)} an hour for scheduled time, plus ${share}`;
  }
}

export const goalPeriods = [
  { value: "week", label: "a week" },
  { value: "month", label: "a month" },
  { value: "quarter", label: "a quarter" },
  { value: "year", label: "a year" },
] as const;
export type GoalPeriod = (typeof goalPeriods)[number]["value"];

export function payRunStatusCopy(status: string): StateCopy {
  switch (status) {
    case "draft":
      return { label: "Draft", tone: "neutral" };
    case "computing":
      return { label: "Working it out", tone: "info" };
    case "ready-for-approval":
      return { label: "Ready to approve", tone: "attention" };
    case "approved":
      return { label: "Approved", tone: "positive" };
    case "exported":
      return { label: "Exported", tone: "positive" };
    case "paying":
      return { label: "Paying", tone: "info" };
    case "paid":
      return { label: "Paid", tone: "positive" };
    case "partially-paid":
      return { label: "Partly paid", tone: "attention" };
    default:
      return { label: "Cancelled", tone: "neutral" };
  }
}

export function lineMethodWords(method: string): string {
  switch (method) {
    case "duna-pay":
      return "Duna Pay (not configured yet)";
    case "none":
      return "Not paid";
    default:
      return "Your payroll (export)";
  }
}

/** "18 hours", "1.5 hours" from minutes worked (a display of the stored count). */
export function hoursWords(minutes: number): string {
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${hours} ${hours === 1 ? "hour" : "hours"}`;
}
