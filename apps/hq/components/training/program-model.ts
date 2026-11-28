import type {
  TrainingProgramsConflict,
  TrainingProgramsProgram,
  TrainingProgramsSession,
  trainingProgramsDraftSchema,
  trainingProgramsProposalSchema,
} from "@duna/api";
import {
  addCalendarDays,
  localDateOf,
  localMinuteOf,
  minuteOfDayFromTime,
  wallTimeToInstant,
  weekdayOfDate,
} from "@duna/scheduling";
import type { z } from "zod";

/**
 * Training programs in words (H-TRAIN). Pure: no I/O and no clock (now is
 * always an argument), so every sentence a screen shows is unit-tested.
 * Shapes are the frozen contract's (`contracts/training-programs.ts`).
 */

export type ProgramDraft = z.infer<typeof trainingProgramsDraftSchema>;
export type ProgramProposal = z.infer<typeof trainingProgramsProposalSchema>;
export type DraftSlot = ProgramDraft["weeklySlots"][number];
export type DraftException = ProgramDraft["exceptions"][number];
export type ProgramStatus = TrainingProgramsProgram["status"];
export type Tone =
  "info" | "positive" | "warning" | "danger" | "attention" | "neutral";

export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
export const WEEKDAYS_SHORT = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;
/** Monday first, as clubs read a week. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

const MONTHS = [
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
] as const;

/* ------------------------------------------------------------ words */

/** "4:00 PM" from "16:00". */
export function timeWords(time: string): string {
  const minutes = minuteOfDayFromTime(time.slice(0, 5));
  const hour = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  const suffix = hour < 12 ? "AM" : "PM";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${String(minute).padStart(2, "0")} ${suffix}`;
}

/** "4:00–6:00 PM", "9:00 AM–1:00 PM". */
export function timeRangeWords(startsAt: string, endsAt: string): string {
  const start = timeWords(startsAt);
  const end = timeWords(endsAt);
  const [startClock, startSuffix] = start.split(" ");
  const [, endSuffix] = end.split(" ");
  return startSuffix === endSuffix ? `${startClock}–${end}` : `${start}–${end}`;
}

/** "Nov 23" from "2026-11-23"; with the year when asked. */
export function dateWords(date: string, withYear = false): string {
  const [year, month = 1, day = 1] = date.split("-").map(Number);
  return `${MONTHS[month - 1]} ${day}${withYear ? `, ${year}` : ""}`;
}

/** "Nov 23 – Feb 14, 2027", "Dec 21 – 24", "Jan 22". */
export function dateRangeWords(from: string, to: string): string {
  if (from === to) return dateWords(from);
  const [fromYear, fromMonth] = from.split("-").map(Number);
  const [toYear, toMonth, toDay] = to.split("-").map(Number);
  if (fromYear === toYear && fromMonth === toMonth) {
    return `${dateWords(from)} – ${toDay}`;
  }
  return fromYear === toYear
    ? `${dateWords(from)} – ${dateWords(to)}`
    : `${dateWords(from)} – ${dateWords(to, true)}`;
}

/** Whole weeks the program spans, counting a partial last week. */
export function weekCount(startDate: string, endDate: string): number {
  const days = daysBetween(startDate, endDate);
  return days < 0 ? 0 : Math.floor(days / 7) + 1;
}

export function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) /
      86_400_000,
  );
}

function listWords(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * The weekly pattern in one sentence: days that share times are grouped,
 * each group keeps its own times. "Mon and Wed 4:00–6:00 PM, Sat
 * 9:00–11:00 AM". Every-other-week slots say so.
 */
export function patternSentence(
  slots: readonly Pick<
    DraftSlot,
    "weekday" | "startsAt" | "endsAt" | "intervalWeeks"
  >[],
): string {
  if (slots.length === 0) return "No practice days yet";
  const groups = new Map<string, number[]>();
  for (const weekday of WEEK_ORDER) {
    for (const slot of slots.filter((row) => row.weekday === weekday)) {
      const key = `${slot.startsAt.slice(0, 5)}|${slot.endsAt.slice(0, 5)}|${slot.intervalWeeks}`;
      groups.set(key, [...(groups.get(key) ?? []), weekday]);
    }
  }
  return [...groups.entries()]
    .map(([key, days]) => {
      const [startsAt = "", endsAt = "", interval = "1"] = key.split("|");
      const every = Number(interval) > 1 ? ` every ${interval} weeks` : "";
      return `${listWords(days.map((day) => WEEKDAYS_SHORT[day]!))} ${timeRangeWords(startsAt, endsAt)}${every}`;
    })
    .join(", ");
}

export interface StateCopy {
  readonly label: string;
  readonly tone: Tone;
}

export function programStateCopy(status: ProgramStatus): StateCopy {
  switch (status) {
    case "draft":
      return { label: "Draft", tone: "info" };
    case "active":
      return { label: "Active", tone: "positive" };
    case "completed":
      return { label: "Completed", tone: "neutral" };
    case "cancelled":
      return { label: "Cancelled", tone: "neutral" };
    case "archived":
      return { label: "Archived", tone: "neutral" };
  }
}

export const exceptionKindLabels: Record<DraftException["kind"], string> = {
  blackout: "No practice",
  break: "Break",
  tournament: "Tournament",
  travel: "Travel",
};

/** "Dec 21 – Jan 3 · no practices" */
export function exceptionWords(
  exception: Pick<DraftException, "kind" | "startsOn" | "endsOn">,
): string {
  const when = dateRangeWords(exception.startsOn, exception.endsOn);
  switch (exception.kind) {
    case "blackout":
    case "break":
      return `${when} · no practices`;
    case "tournament":
      return `${when} · no practices; the tournament is on the calendar`;
    case "travel":
      return `${when} · travel day, no practices`;
  }
}

/* ------------------------------------------------ proposal summary */

export interface SummaryPill {
  readonly label: string;
  readonly value: string;
}

/**
 * What Duna read from the sentence, as the pills above the editable
 * summary ("Dates Nov 23 – Feb 14, 2027 · 13 weeks", "Mon · Wed 4:00–6:00
 * PM", "Off Dec 21 – Jan 3"). It only restates the draft: every value is
 * also a field the person corrects below.
 */
export function proposalPills(draft: ProgramDraft): SummaryPill[] {
  const pills: SummaryPill[] = [
    {
      label: "Dates",
      value: `${dateRangeWords(draft.startDate, draft.endDate)} · ${plural(weekCount(draft.startDate, draft.endDate), "week")}`,
    },
  ];
  const groups = new Map<string, number[]>();
  for (const weekday of WEEK_ORDER) {
    for (const slot of draft.weeklySlots.filter(
      (row) => row.weekday === weekday,
    )) {
      const key = `${slot.startsAt.slice(0, 5)}|${slot.endsAt.slice(0, 5)}`;
      groups.set(key, [...(groups.get(key) ?? []), weekday]);
    }
  }
  for (const [key, days] of groups) {
    const [startsAt = "", endsAt = ""] = key.split("|");
    pills.push({
      label: days.map((day) => WEEKDAYS_SHORT[day]!).join(" · "),
      value: timeRangeWords(startsAt, endsAt),
    });
  }
  for (const exception of draft.exceptions) {
    pills.push({
      label:
        exception.kind === "blackout" || exception.kind === "break"
          ? "Off"
          : exceptionKindLabels[exception.kind],
      value: dateRangeWords(exception.startsOn, exception.endsOn),
    });
  }
  return pills;
}

/** "U16 girls, 13 weeks, 3 practices a week, 1 date off". */
export function draftSentence(draft: ProgramDraft): string {
  const off = draft.exceptions.length;
  return [
    draft.title,
    plural(weekCount(draft.startDate, draft.endDate), "week"),
    `${plural(draft.weeklySlots.length, "practice")} a week`,
    off > 0 ? plural(off, "date off", "dates off") : undefined,
  ]
    .filter(Boolean)
    .join(", ");
}

/** What blocks saving a draft (errors) and what deserves a look (warnings). */
export function draftProblems(draft: ProgramDraft): {
  readonly errors: string[];
  readonly warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!draft.title.trim()) errors.push("Give the program a name.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.startDate)) {
    errors.push("Choose the first day.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.endDate)) {
    errors.push("Choose the last day.");
  }
  if (draft.endDate < draft.startDate) {
    errors.push("The last day is before the first day.");
  }
  draft.weeklySlots.forEach((slot) => {
    if (slot.endsAt.slice(0, 5) <= slot.startsAt.slice(0, 5)) {
      errors.push(
        `${WEEKDAYS[slot.weekday]}: the practice ends before it starts.`,
      );
    }
  });
  draft.exceptions.forEach((exception) => {
    if (!exception.label.trim()) {
      errors.push(`Name the ${exceptionKindLabels[exception.kind]} dates.`);
    }
    if (exception.endsOn < exception.startsOn) {
      errors.push(`${exception.label || "A date off"} ends before it starts.`);
    } else if (
      exception.endsOn < draft.startDate ||
      exception.startsOn > draft.endDate
    ) {
      warnings.push(`${exception.label} is outside the program's dates.`);
    }
  });
  const leads = draft.coaches.filter((coach) => coach.role === "lead");
  if (draft.coaches.length > 0 && leads.length !== 1) {
    errors.push("Choose exactly one lead coach.");
  }
  if (draft.coaches.length === 0) {
    warnings.push("No coach yet: practices are not ready until one is set.");
  }
  if (draft.weeklySlots.length === 0) {
    warnings.push("No practice days: nothing will be scheduled.");
  }
  return { errors, warnings };
}

/* ------------------------------------------------- pattern preview */

export interface PreviewPractice {
  readonly key: string;
  readonly localDate: string;
  readonly startMinute: number;
  readonly endMinute: number;
}

function minuteWords(minutes: number): string {
  const hours = String(Math.floor(minutes / 60)).padStart(2, "0");
  return timeWords(`${hours}:${String(minutes % 60).padStart(2, "0")}`);
}

/** "Mon, Dec 7 · 4:00 PM" */
export function practiceKeyWords(practice: PreviewPractice): string {
  return `${WEEKDAYS_SHORT[weekdayOfDate(practice.localDate)]}, ${dateWords(practice.localDate)} · ${minuteWords(practice.startMinute)}`;
}

/**
 * The practices a pattern produces, as the backend's schedule does it:
 * wall-clock times in the program's zone, exception dates skipped,
 * every-N-weeks counted from the Sunday-started week of the first day, one
 * practice per day and start time.
 */
export function patternPractices(input: {
  readonly startDate: string;
  readonly endDate: string;
  readonly timezone: string;
  readonly slots: readonly Pick<
    DraftSlot,
    "weekday" | "startsAt" | "endsAt" | "intervalWeeks"
  >[];
  readonly exceptions: readonly Pick<DraftException, "startsOn" | "endsOn">[];
}): PreviewPractice[] {
  const span = daysBetween(input.startDate, input.endDate);
  if (span < 0 || span > 731) return [];
  const anchor = addCalendarDays(
    input.startDate,
    -weekdayOfDate(input.startDate),
  );
  const seen = new Set<string>();
  const out: PreviewPractice[] = [];
  for (let offset = 0; offset <= span; offset += 1) {
    const date = addCalendarDays(input.startDate, offset);
    if (input.exceptions.some((e) => date >= e.startsOn && date <= e.endsOn)) {
      continue;
    }
    const weekday = weekdayOfDate(date);
    const week = Math.floor(daysBetween(anchor, date) / 7);
    for (const slot of input.slots) {
      if (slot.weekday !== weekday) continue;
      if (week % Math.max(1, slot.intervalWeeks) !== 0) continue;
      const startMinute = minuteOfDayFromTime(slot.startsAt.slice(0, 5));
      const endMinute = minuteOfDayFromTime(slot.endsAt.slice(0, 5));
      if (endMinute <= startMinute) continue;
      const key = `${date}|${slot.startsAt.slice(0, 5)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ key, localDate: date, startMinute, endMinute });
    }
  }
  return out.sort(
    (a, b) =>
      a.localDate.localeCompare(b.localDate) || a.startMinute - b.startMinute,
  );
}

/** A session's day and start time in the program's zone (how it is matched). */
export function sessionKey(
  session: Pick<TrainingProgramsSession, "startsAt">,
  timezone: string,
): string {
  const at = Date.parse(session.startsAt);
  const minute = localMinuteOf(at, timezone);
  return `${localDateOf(at, timezone)}|${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

/**
 * Someone relied on it: a plan or focus, a coach looking for cover, any
 * state past "planned". The backend never moves or removes these; it also
 * counts athlete responses and hand-assigned coaches, which this screen
 * can't see, so the saved result can only leave more practices alone.
 */
export function reliedOn(session: TrainingProgramsSession): boolean {
  return (
    session.status !== "planned" ||
    session.plan.mode !== "none" ||
    session.needsCover
  );
}

export interface PatternChangePreview {
  /** New practices the changed pattern adds. */
  readonly added: readonly PreviewPractice[];
  /** Untouched future practices that no longer fit and are removed. */
  readonly removed: readonly TrainingProgramsSession[];
  /** Practices someone relied on that no longer fit: kept, for a person to review. */
  readonly needsReview: readonly TrainingProgramsSession[];
  /** Future practices that stay exactly as they are. */
  readonly unchanged: number;
}

/**
 * Exactly what saving a new pattern does to the season, before it is saved:
 * which practices are added, which untouched ones go, and which ones
 * someone relied on stay for review. Past, manual, imported and cancelled
 * sessions are never candidates. A draft program has no sessions yet, so
 * everything is "added" (on activation).
 */
export function patternChangePreview(input: {
  readonly program: Pick<
    TrainingProgramsProgram,
    "startDate" | "endDate" | "timezone"
  >;
  readonly sessions: readonly TrainingProgramsSession[];
  readonly next: {
    readonly startDate: string;
    readonly endDate: string;
    readonly slots: readonly Pick<
      DraftSlot,
      "weekday" | "startsAt" | "endsAt" | "intervalWeeks"
    >[];
    readonly exceptions: readonly Pick<DraftException, "startsOn" | "endsOn">[];
  };
  readonly now: string;
}): PatternChangePreview {
  const timezone = input.program.timezone;
  const nowMs = Date.parse(input.now);
  const desired = patternPractices({
    startDate: input.next.startDate,
    endDate: input.next.endDate,
    timezone,
    slots: input.next.slots,
    exceptions: input.next.exceptions,
  }).filter(
    (practice) =>
      wallTimeToInstant(practice.localDate, practice.startMinute, timezone) >
      nowMs,
  );
  const desiredKeys = new Set(desired.map((practice) => practice.key));
  const existingKeys = new Set(
    input.sessions.map((session) => sessionKey(session, timezone)),
  );
  const removed: TrainingProgramsSession[] = [];
  const needsReview: TrainingProgramsSession[] = [];
  let unchanged = 0;
  for (const session of input.sessions) {
    const future = Date.parse(session.startsAt) > nowMs;
    const candidate =
      session.source === "program" && future && session.status !== "cancelled";
    if (!candidate) continue;
    if (desiredKeys.has(sessionKey(session, timezone))) {
      unchanged += 1;
    } else if (reliedOn(session)) {
      needsReview.push(session);
    } else {
      removed.push(session);
    }
  }
  return {
    added: desired.filter((practice) => !existingKeys.has(practice.key)),
    removed,
    needsReview,
    unchanged,
  };
}

/** "Adds 4 practices, removes 2, leaves 1 for you to review, 20 unchanged." */
export function previewSentence(preview: PatternChangePreview): string {
  const parts = [
    preview.added.length > 0
      ? `adds ${plural(preview.added.length, "practice")}`
      : undefined,
    preview.removed.length > 0
      ? `removes ${plural(preview.removed.length, "untouched practice")}`
      : undefined,
    preview.needsReview.length > 0
      ? `leaves ${plural(preview.needsReview.length, "practice")} someone relied on for you to review`
      : undefined,
  ].filter(Boolean);
  if (parts.length === 0) {
    return `Nothing changes: ${plural(preview.unchanged, "practice")} stay as they are.`;
  }
  const sentence = parts.join(", ");
  return `This ${sentence}; ${plural(preview.unchanged, "practice")} stay as they are.`;
}

/* ------------------------------------------------------- sessions */

export const sessionKindLabels: Record<
  TrainingProgramsSession["kind"],
  string
> = {
  practice: "Practice",
  tournament: "Tournament",
  travel: "Travel",
  recovery: "Recovery",
  strength: "Strength",
  conditioning: "Conditioning",
  plyometrics: "Plyometrics",
  film: "Film",
  meeting: "Meeting",
  assessment: "Assessment",
  rest: "Rest",
};

export function sessionStateCopy(
  status: TrainingProgramsSession["status"],
): StateCopy {
  switch (status) {
    case "planned":
      return { label: "Planned", tone: "neutral" };
    case "ready":
      return { label: "Ready", tone: "positive" };
    case "completed":
      return { label: "Done", tone: "neutral" };
    case "cancelled":
      return { label: "Cancelled", tone: "neutral" };
  }
}

/** "Serve-receive under pressure · load 55 (estimate) · plan attached". */
export function sessionPlanWords(
  plan: TrainingProgramsSession["plan"],
): string {
  switch (plan.mode) {
    case "plan":
      return `${plan.title} · load ${plan.plannedLoad} (estimate) · plan attached`;
    case "focus":
      return `${plan.focus} · load ${plan.plannedLoad} (estimate) · focus and load only`;
    case "none":
      return "No plan or focus yet";
  }
}

/** "Tue, Dec 1 · 4:00–6:00 PM" in the session's own zone. */
export function sessionWhen(
  session: Pick<TrainingProgramsSession, "startsAt" | "endsAt" | "timezone">,
): string {
  const start = Date.parse(session.startsAt);
  const end = Date.parse(session.endsAt);
  const date = localDateOf(start, session.timezone);
  const clock = (ms: number) => {
    const minute = localMinuteOf(ms, session.timezone);
    return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
  };
  return `${WEEKDAYS_SHORT[weekdayOfDate(date)]}, ${dateWords(date)} · ${timeRangeWords(clock(start), clock(end))}`;
}

export function sessionMinutes(
  session: Pick<TrainingProgramsSession, "startsAt" | "endsAt">,
): number {
  return Math.max(
    1,
    Math.round(
      (Date.parse(session.endsAt) - Date.parse(session.startsAt)) / 60_000,
    ),
  );
}

/** Sessions grouped by the Monday of their week, in order. */
export function sessionsByWeek(
  sessions: readonly TrainingProgramsSession[],
): { readonly weekOf: string; readonly sessions: TrainingProgramsSession[] }[] {
  const weeks = new Map<string, TrainingProgramsSession[]>();
  for (const session of [...sessions].sort((a, b) =>
    a.startsAt.localeCompare(b.startsAt),
  )) {
    const date = localDateOf(Date.parse(session.startsAt), session.timezone);
    const monday = addCalendarDays(date, -((weekdayOfDate(date) + 6) % 7));
    weeks.set(monday, [...(weeks.get(monday) ?? []), session]);
  }
  return [...weeks.entries()].map(([weekOf, rows]) => ({
    weekOf,
    sessions: rows,
  }));
}

/* ------------------------------------------------------- conflicts */

export const conflictKindLabels: Record<
  TrainingProgramsConflict["kind"],
  string
> = {
  "milestone-overlaps-practice": "On a date off",
  "coach-blackout": "Coach unavailable",
  "coach-time-off": "Coach on time off",
  "court-unavailable": "Court closed",
};

export type ConflictResolution = NonNullable<
  TrainingProgramsConflict["resolution"]
>;

/** Each resolution the backend offers, what it does, before anyone presses it. */
export const resolutionCopy: Record<
  ConflictResolution,
  { readonly verb: string; readonly explains: string; readonly done: string }
> = {
  "drop-practice": {
    verb: "Drop the practice",
    explains:
      "The practice is cancelled and stays on the calendar as cancelled, with this conflict as the reason.",
    done: "Practice dropped",
  },
  "keep-both": {
    verb: "Keep both",
    explains:
      "Nothing moves. Duna records that you chose to keep the practice as it is.",
    done: "Kept as it is",
  },
  "ask-cover": {
    verb: "Ask for cover",
    explains:
      "Opens a coverage request for this practice. Duna suggests who is free; any message is drafted for a person to send.",
    done: "Coverage request opened",
  },
  "move-practice": {
    verb: "Move the practice",
    explains:
      "Moves it to the day after the blocking period, at the same local time, inside the program's dates.",
    done: "Practice moved",
  },
};

/* ------------------------------------------------------ load chart */

export const phaseLabels: Record<
  TrainingProgramsProgram["weeks"][number]["phase"],
  string
> = {
  build: "Build",
  maintain: "Maintain",
  taper: "Taper",
  recover: "Recover",
  break: "Break",
};

/** "Week 3 of 12", or the state when it isn't running. */
export function weekWords(
  program: Pick<
    TrainingProgramsProgram,
    "currentWeek" | "startDate" | "endDate" | "status"
  >,
): string {
  const total = weekCount(program.startDate, program.endDate);
  if (program.status === "active" && program.currentWeek) {
    return `Week ${program.currentWeek} of ${total}`;
  }
  if (program.status === "draft")
    return `${plural(total, "week")}, not started`;
  return plural(total, "week");
}

/** The activation confirmation: exactly what Activate creates. */
export function activationWords(input: {
  readonly program: Pick<
    TrainingProgramsProgram,
    | "title"
    | "startDate"
    | "endDate"
    | "timezone"
    | "weeklySlots"
    | "exceptions"
  >;
  readonly now: string;
}): { readonly count: number; readonly sentence: string } {
  const practices = patternPractices({
    startDate: input.program.startDate,
    endDate: input.program.endDate,
    timezone: input.program.timezone,
    slots: input.program.weeklySlots,
    exceptions: input.program.exceptions,
  }).filter(
    (practice) =>
      wallTimeToInstant(
        practice.localDate,
        practice.startMinute,
        input.program.timezone,
      ) > Date.parse(input.now),
  );
  const first = practices[0];
  return {
    count: practices.length,
    sentence:
      practices.length === 0
        ? "No practices are created: the pattern has no future dates."
        : `Creates ${plural(practices.length, "practice")} (${patternSentence(input.program.weeklySlots)}), the first on ${practiceKeyWords(first!)}. Dates off are skipped. Athletes are not notified automatically.`,
  };
}
