import type {
  OperatorWorkspace,
  TeamAvailabilityStaff,
  TeamPayCompensation,
} from "@duna/api";
import { formatMoney } from "@duna/core";
import {
  addCalendarDays,
  localDateOf,
  scheduleInForce,
  type StaffAvailabilitySchedule,
} from "@duna/scheduling";
import type { TidelineTone } from "@duna/ui/tideline";

/**
 * Team's words (H-TEAM). Pure: no React, no clock, no network. Every amount
 * is formatted from what the backend returned (`formatMoney` from
 * @duna/core); nothing here computes pay. The worked example uses the
 * backend's own pay function (team-pay-example.ts).
 */

export type StaffMember = OperatorWorkspace["staff"][number];
export type StaffInvitation = OperatorWorkspace["staffInvitations"][number];
export type StaffRole = StaffMember["role"];
export type Classification = StaffMember["workerClassification"];
export type Tone = TidelineTone | "neutral";
export type Currency = StaffMember["currency"];

export interface StateCopy {
  readonly label: string;
  readonly tone: Tone;
}

/* ---------------------------------------------------------------- roles */

export const staffRoles: readonly StaffRole[] = [
  "coach",
  "manager",
  "front-desk",
  "accountant",
  "director",
];

const roleWords: Record<StaffRole, string> = {
  coach: "Coach",
  director: "Director",
  manager: "Manager",
  "front-desk": "Front desk",
  accountant: "Accountant",
};

/** "Coach", "Owner and director". */
export function roleLabel(role: StaffRole, isOwner = false): string {
  return isOwner ? "Owner and director" : roleWords[role];
}

/** One line under each role preset in the invite form and on Access. */
export const roleSummaries: Record<StaffRole, string> = {
  coach: "Runs sessions, sees the team and the schedule, scores matches.",
  manager: "Runs the club day to day: people, the schedule and the team.",
  "front-desk": "Checks people in, books courts and takes payments.",
  accountant: "Sees money and reports. No members or schedule.",
  director: "Leads the club with the owner. Can be made the owner.",
};

/**
 * What a permission scope lets someone do, as a sentence. Scopes come from
 * the backend's role table (`scopesForRoles`); a scope with no sentence is
 * left to the advanced list.
 */
const scopeSentences: Readonly<Record<string, string>> = {
  "members:read":
    "See players, members and the team, with everyone's availability.",
  "members:write":
    "Add and change members and the team, decide time off and arrange cover.",
  "sessions:read": "See the schedule and every session.",
  "sessions:write": "Create and change sessions and events.",
  "bookings:write": "Book courts and sessions for people.",
  "training:read": "See programs, practice plans and drills.",
  "training:write": "Write practice plans and drills.",
  "matches:score": "Score matches.",
  "tickets:scan": "Check people in.",
  "payments:collect": "Take payments at the desk.",
  "payments:read": "See money: sales, payouts and everyone's pay.",
  "payments:write": "Refund sales, change pay and approve pay runs.",
  "messages:write": "Message players and parents.",
  "reports:read": "See reports.",
  "audiences:write": "Build audiences for updates.",
};

/** The key things a role cannot do, said plainly. */
const withheld: readonly { scope: string; sentence: string }[] = [
  { scope: "members:read", sentence: "Can't see members or the team." },
  {
    scope: "members:write",
    sentence: "Can't change the team, decide time off or reassign sessions.",
  },
  {
    scope: "payments:read",
    sentence: "Can't see money or anyone else's pay (their own pay, yes).",
  },
  {
    scope: "payments:write",
    sentence: "Can't refund, change pay or approve pay runs.",
  },
];

export interface AccessSentences {
  readonly can: readonly string[];
  readonly cannot: readonly string[];
}

/** What a set of scopes allows, in sentences. `*` is everything. */
export function accessSentences(scopes: readonly string[]): AccessSentences {
  if (scopes.includes("*")) {
    return {
      can: [
        "Everything in Duna HQ for this club, including money, pay and the team.",
      ],
      cannot: [],
    };
  }
  return {
    can: Object.entries(scopeSentences)
      .filter(([scope]) => scopes.includes(scope))
      .map(([, sentence]) => sentence),
    cannot: withheld
      .filter((item) => !scopes.includes(item.scope))
      .map((item) => item.sentence),
  };
}

/** True when moving from one scope set to another takes anything away. */
export function removesAccess(
  from: readonly string[],
  to: readonly string[],
): boolean {
  if (to.includes("*")) return false;
  if (from.includes("*")) return true;
  return from.some((scope) => !to.includes(scope));
}

/* ------------------------------------------------------- classification */

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

/** Said wherever a classification is chosen. Not legal or tax advice. */
export const classificationNote =
  "You decide whether someone is an employee or a contractor, with your own adviser. Duna records your choice; this isn't legal or tax advice.";

/* ------------------------------------------------------------- members */

export type MemberState = "invited" | "active" | "paused";

export function memberStateCopy(state: MemberState): StateCopy {
  switch (state) {
    case "invited":
      return { label: "Invited", tone: "info" };
    case "active":
      return { label: "Active", tone: "positive" };
    case "paused":
      return { label: "Paused", tone: "neutral" };
  }
}

/** What a member still needs before they are fully set up, in words. */
export function missingForMember(
  member: Pick<
    StaffMember,
    | "email"
    | "phoneE164"
    | "workerClassification"
    | "compensationModel"
    | "addressComplete"
  >,
  availability?: { readonly hasSchedule: boolean },
): string[] {
  const missing: string[] = [];
  if (!member.email && !member.phoneE164) missing.push("Contact details");
  if (member.workerClassification === "not-set") missing.push("Classification");
  if (member.compensationModel === "not-set") missing.push("Pay");
  if (availability && !availability.hasSchedule) missing.push("Availability");
  if (!member.addressComplete) missing.push("Home address");
  return missing;
}

/** "Theo" from "Theo Park", for short sentences. */
export function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] ?? displayName;
}

/** "Theo's" / "James'" for headings. */
export function possessive(name: string): string {
  return name.endsWith("s") ? `${name}'` : `${name}'s`;
}

/* ----------------------------------------------------------- invitation */

export type InviteContact =
  | { readonly kind: "none" }
  | { readonly kind: "email"; readonly email: string }
  | { readonly kind: "phone"; readonly phoneE164: string }
  | { readonly kind: "invalid"; readonly problem: string };

/**
 * Reads the one "email or mobile" field. A mobile number is accepted with
 * its country code (+44…) or as a ten-digit US number.
 */
export function parseInviteContact(value: string): InviteContact {
  const text = value.trim();
  if (!text) return { kind: "none" };
  if (text.includes("@")) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)
      ? { kind: "email", email: text.toLowerCase() }
      : {
          kind: "invalid",
          problem: "That email address doesn't look complete.",
        };
  }
  const digits = text.replace(/[^\d+]/g, "");
  const e164 = digits.startsWith("+")
    ? digits
    : digits.length === 10
      ? `+1${digits}`
      : digits.length === 11 && digits.startsWith("1")
        ? `+${digits}`
        : digits;
  return /^\+[1-9]\d{7,14}$/.test(e164)
    ? { kind: "phone", phoneE164: e164 }
    : {
        kind: "invalid",
        problem:
          "Enter an email address, or a mobile number with its country code.",
      };
}

export function invitationStatusCopy(
  status: StaffInvitation["status"],
): StateCopy {
  switch (status) {
    case "pending":
      return { label: "Invited", tone: "info" };
    case "claimed":
      return { label: "Joined", tone: "positive" };
    case "expired":
      return { label: "Expired", tone: "neutral" };
    case "cancelled":
      return { label: "Withdrawn", tone: "neutral" };
  }
}

export function deliveryCopy(
  invitation: Pick<StaffInvitation, "deliveryChannel" | "deliveryStatus">,
): string {
  const channel = invitation.deliveryChannel === "sms" ? "text" : "email";
  switch (invitation.deliveryStatus) {
    case "sent":
      return `Sent by ${channel}`;
    case "queued":
      return `Sending by ${channel}`;
    case "failed":
      return `The ${channel} didn't go through`;
    default:
      return invitation.deliveryChannel
        ? `Sending by ${channel} isn't set up yet: share the link`
        : "Private link";
  }
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

export type ScheduleRow = TeamAvailabilityStaff["schedules"][number];
export type WindowRow = ScheduleRow["windows"][number];

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

export function scheduleStatusCopy(status: ScheduleRow["status"]): StateCopy {
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

export const windowKindLabels: Record<WindowRow["kind"], string> = {
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

export type CompensationModel = TeamPayCompensation["model"];
type Amount = { readonly amountMinor: number; readonly currency: string };

export const compensationModels: readonly {
  readonly value: CompensationModel;
  readonly label: string;
}[] = [
  { value: "per-session", label: "Per session" },
  { value: "hourly", label: "Hourly" },
  { value: "revenue-share", label: "Share of revenue" },
  { value: "hourly-plus-share", label: "Hourly plus share" },
  { value: "salary", label: "Salary" },
];

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

/** The form's values for a pay model (major units are never stored here). */
export interface CompensationForm {
  readonly model: CompensationModel;
  readonly classification: "1099-contractor" | "w2-employee";
  readonly effectiveFrom: string;
  readonly hourlyRateMinor: number | null;
  readonly perSessionRateMinor: number | null;
  readonly annualSalaryMinor: number | null;
  /** Basis points: 30% is 3000. */
  readonly revenueShareBps: number | null;
  readonly revenueShareScope: readonly string[];
}

const needs: Record<CompensationModel, readonly (keyof CompensationForm)[]> = {
  "per-session": ["perSessionRateMinor"],
  hourly: ["hourlyRateMinor"],
  salary: ["annualSalaryMinor"],
  "revenue-share": ["revenueShareBps"],
  "hourly-plus-share": ["hourlyRateMinor", "revenueShareBps"],
};

/** The first thing the form is missing, in words, or undefined. */
export function compensationFormProblem(
  form: CompensationForm,
): string | undefined {
  if (form.model === "salary" && form.classification !== "w2-employee") {
    return "Salary is for employees (W-2) only.";
  }
  for (const key of needs[form.model]) {
    const value = form[key];
    if (value === null || value === undefined) {
      return key === "revenueShareBps"
        ? "Enter the share, as a percentage."
        : key === "annualSalaryMinor"
          ? "Enter the yearly salary."
          : key === "perSessionRateMinor"
            ? "Enter the amount per session."
            : "Enter the hourly rate.";
    }
  }
  if (
    form.revenueShareBps !== null &&
    (form.revenueShareBps < 0 || form.revenueShareBps > 10_000)
  ) {
    return "A share is between 0% and 100%.";
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.effectiveFrom)) {
    return "Choose the day this pay starts.";
  }
  return undefined;
}

/** The `setCompensation` input for a form: only the fields its model uses. */
export function compensationInput(
  staffProfileId: string,
  form: CompensationForm,
  currency: Currency,
) {
  const amount = (minor: number | null) =>
    minor === null ? undefined : { amountMinor: minor, currency };
  const uses = new Set(needs[form.model]);
  return {
    staffProfileId,
    model: form.model,
    classification: form.classification,
    effectiveFrom: form.effectiveFrom,
    ...(uses.has("hourlyRateMinor")
      ? { hourlyRate: amount(form.hourlyRateMinor) }
      : {}),
    ...(uses.has("perSessionRateMinor")
      ? { perSessionRate: amount(form.perSessionRateMinor) }
      : {}),
    ...(uses.has("annualSalaryMinor")
      ? { annualSalary: amount(form.annualSalaryMinor) }
      : {}),
    ...(uses.has("revenueShareBps")
      ? { revenueShareBps: form.revenueShareBps ?? undefined }
      : {}),
    revenueShareScope: uses.has("revenueShareBps")
      ? [...form.revenueShareScope]
      : [],
  };
}

/** A form filled from someone's current model (or a fresh one). */
export function formFromCompensation(
  current: TeamPayCompensation | undefined,
  effectiveFrom: string,
): CompensationForm {
  return {
    model: current?.model ?? "per-session",
    classification: current?.classification ?? "1099-contractor",
    effectiveFrom,
    hourlyRateMinor: current?.hourlyRate?.amountMinor ?? null,
    perSessionRateMinor: current?.perSessionRate?.amountMinor ?? null,
    annualSalaryMinor: current?.annualSalary?.amountMinor ?? null,
    revenueShareBps: current?.revenueShareBps ?? null,
    revenueShareScope: current?.revenueShareScope ?? [],
  };
}

/** The form as the shape the sentence reads. */
export function compensationShapeOf(
  form: CompensationForm,
  currency: Currency,
): CompensationShape {
  const input = compensationInput("preview", form, currency);
  return {
    model: input.model,
    hourlyRate: input.hourlyRate,
    perSessionRate: input.perSessionRate,
    annualSalary: input.annualSalary,
    revenueShareBps: input.revenueShareBps,
    revenueShareScope: input.revenueShareScope,
  };
}

export const goalPeriods = [
  { value: "week", label: "a week" },
  { value: "month", label: "a month" },
  { value: "quarter", label: "a quarter" },
  { value: "year", label: "a year" },
] as const;
export type GoalPeriod = (typeof goalPeriods)[number]["value"];

export const payFrequencies = [
  { value: "weekly", label: "Every week" },
  { value: "every-2-weeks", label: "Every two weeks" },
  { value: "twice-monthly", label: "Twice a month (1st and 16th)" },
  { value: "monthly", label: "Every month" },
] as const;
export type PayFrequency = (typeof payFrequencies)[number]["value"];

export function frequencyWords(frequency: string): string {
  return (
    payFrequencies.find((item) => item.value === frequency)?.label ?? frequency
  );
}

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

/** Whether a run can still be changed (adjust, cancel, approve). */
export function runIsOpen(status: string): boolean {
  return status === "ready-for-approval";
}

/** Whether a run can be exported for payroll. */
export function runCanExport(status: string): boolean {
  return status === "approved" || status === "exported";
}

/** Sunday on or before a local date: the coverage grid's week. */
export function weekStartOf(date: string): string {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return addCalendarDays(date, -weekday);
}
