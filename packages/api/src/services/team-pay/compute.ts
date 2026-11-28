/**
 * Pay run computation (B3b): one pure function.
 *
 *   computePayRun(period, members, sessions, models, options) → lines
 *
 * Rules (stated in docs/product/team.md and tested):
 * - Money is integer minor units in the period's currency. Every division
 *   rounds half up to the nearest minor unit, once per session for hourly
 *   pay and revenue share, once per model segment for salary. Line earnings
 *   are the sum of their session amounts plus salary; run totals are the sum
 *   of line totals. Nothing is rounded twice.
 * - The model in force for a session is the staff member's compensation
 *   whose [effectiveFrom, effectiveTo] covers the session's local date.
 * - per-session: the flat rate for each delivered session.
 *   hourly: rate × minutes ÷ 60 per session; minutes are the scheduled
 *   minutes, or only sessions with attendance recorded when the model's
 *   basis is "attended".
 *   salary: annual ÷ periods per year (weekly 52, every two weeks 26, twice
 *   a month 24, monthly 12), prorated by the days of the period the model
 *   covers.
 *   revenue-share: basis points of the net revenue attributed to the session
 *   (what the club kept after refunds), when the session's offering is in
 *   the model's scope (empty scope = every offering).
 *   hourly-plus-share: both.
 * - A session already on a line of an approved (or later) run is never paid
 *   again; salary for a period already approved is never paid again. That is
 *   how an adjustment run pays only what is new.
 * - Every line lists the sessions it pays, with each session's amount.
 */

export type PayFrequency =
  "weekly" | "every-2-weeks" | "twice-monthly" | "monthly";
export type CompensationModelKind =
  "per-session" | "hourly" | "salary" | "revenue-share" | "hourly-plus-share";
export type Classification = "1099-contractor" | "w2-employee";

export interface PayPeriodInput {
  readonly frequency: PayFrequency;
  /** Local calendar dates, inclusive. */
  readonly startsOn: string;
  readonly endsOn: string;
  readonly currency: string;
}

export interface CompensationInput {
  readonly id: string;
  readonly staffProfileId: string;
  readonly model: CompensationModelKind;
  readonly classification: Classification;
  readonly effectiveFrom: string;
  readonly effectiveTo?: string;
  readonly hourlyRateMinor?: number;
  readonly perSessionRateMinor?: number;
  readonly annualSalaryMinor?: number;
  readonly revenueShareBps?: number;
  readonly revenueShareScope: readonly string[];
  /** Hourly time from scheduled minutes (default) or attended sessions only. */
  readonly hourlyBasis?: "scheduled" | "attended";
}

export interface PayMemberInput {
  readonly staffProfileId: string;
  /** A contractor's connected account can receive payouts (B3c). */
  readonly payoutReady: boolean;
}

export interface DeliveredSessionInput {
  /** Unique across kinds, e.g. "session:<uuid>". */
  readonly key: string;
  readonly kind: "session" | "training-event" | "lesson";
  readonly staffProfileId: string;
  readonly startsAt: string;
  readonly endsAt: string;
  /** Local date of the start in the club's time zone. */
  readonly localDate: string;
  readonly minutes: number;
  /** Attendance was recorded for this session. */
  readonly attended: boolean;
  /** Catalog subtype ("private-lesson") for revenue-share scope. */
  readonly offering?: string;
  /** Net revenue attributed to this coach for this session. */
  readonly revenueMinor: number;
}

export interface SessionPay {
  readonly key: string;
  readonly kind: DeliveredSessionInput["kind"];
  readonly startsAt: string;
  readonly endsAt: string;
  readonly minutes: number;
  readonly compensationId: string;
  readonly model: CompensationModelKind;
  readonly perSessionMinor: number;
  readonly hourlyMinor: number;
  readonly shareMinor: number;
  readonly amountMinor: number;
}

export interface SalaryPay {
  readonly compensationId: string;
  readonly days: number;
  readonly periodDays: number;
  readonly amountMinor: number;
}

export interface PayRunLineDraft {
  readonly staffProfileId: string;
  /** The model in force at the end of the period (or the last one used). */
  readonly compensationId: string;
  readonly compensationModel: CompensationModelKind;
  readonly classification: Classification;
  readonly method: "duna-pay" | "export" | "none";
  readonly payoutReady: boolean;
  readonly sessionsCount: number;
  readonly minutesWorked: number;
  readonly earningsMinor: number;
  readonly sessions: readonly SessionPay[];
  readonly salary: readonly SalaryPay[];
}

export interface PayRunComputation {
  readonly lines: readonly PayRunLineDraft[];
  readonly contractorTotalMinor: number;
  readonly employeeTotalMinor: number;
  /** Delivered sessions with no compensation in force (shown, not paid). */
  readonly unpaidSessions: readonly { staffProfileId: string; key: string }[];
}

export const PERIODS_PER_YEAR: Readonly<Record<PayFrequency, number>> = {
  weekly: 52,
  "every-2-weeks": 26,
  "twice-monthly": 24,
  monthly: 12,
};

/** round(numerator ÷ denominator), half up, for non-negative integers. */
export function roundHalfUp(numerator: number, denominator: number): number {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)) {
    throw new Error("Pay amounts must be safe integers.");
  }
  if (denominator <= 0 || numerator < 0) {
    throw new Error("Pay amounts must be non-negative.");
  }
  const n = BigInt(numerator);
  const d = BigInt(denominator);
  return Number((2n * n + d) / (2n * d));
}

function dayNumber(date: string): number {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

function covers(model: CompensationInput, date: string): boolean {
  return (
    model.effectiveFrom <= date &&
    (model.effectiveTo === undefined || model.effectiveTo >= date)
  );
}

function modelFor(
  models: readonly CompensationInput[],
  staffProfileId: string,
  date: string,
): CompensationInput | undefined {
  return models
    .filter(
      (model) => model.staffProfileId === staffProfileId && covers(model, date),
    )
    .sort((left, right) =>
      right.effectiveFrom.localeCompare(left.effectiveFrom),
    )[0];
}

function hasHourly(model: CompensationModelKind): boolean {
  return model === "hourly" || model === "hourly-plus-share";
}

function hasShare(model: CompensationModelKind): boolean {
  return model === "revenue-share" || model === "hourly-plus-share";
}

export function sessionPay(
  session: DeliveredSessionInput,
  model: CompensationInput,
): SessionPay {
  const perSessionMinor =
    model.model === "per-session" ? (model.perSessionRateMinor ?? 0) : 0;
  const countsHours =
    hasHourly(model.model) &&
    (model.hourlyBasis !== "attended" || session.attended);
  const hourlyMinor = countsHours
    ? roundHalfUp((model.hourlyRateMinor ?? 0) * session.minutes, 60)
    : 0;
  const inScope =
    model.revenueShareScope.length === 0 ||
    (session.offering !== undefined &&
      model.revenueShareScope.includes(session.offering));
  const shareMinor =
    hasShare(model.model) && inScope
      ? roundHalfUp(
          Math.max(0, session.revenueMinor) * (model.revenueShareBps ?? 0),
          10_000,
        )
      : 0;
  return {
    key: session.key,
    kind: session.kind,
    startsAt: session.startsAt,
    endsAt: session.endsAt,
    minutes: session.minutes,
    compensationId: model.id,
    model: model.model,
    perSessionMinor,
    hourlyMinor,
    shareMinor,
    amountMinor: perSessionMinor + hourlyMinor + shareMinor,
  };
}

export function salaryPay(
  period: PayPeriodInput,
  models: readonly CompensationInput[],
): SalaryPay[] {
  const periodDays = dayNumber(period.endsOn) - dayNumber(period.startsOn) + 1;
  const pays: SalaryPay[] = [];
  for (const model of models) {
    if (model.model !== "salary") continue;
    const from = Math.max(
      dayNumber(period.startsOn),
      dayNumber(model.effectiveFrom),
    );
    const to = Math.min(
      dayNumber(period.endsOn),
      model.effectiveTo
        ? dayNumber(model.effectiveTo)
        : Number.POSITIVE_INFINITY,
    );
    const days = to - from + 1;
    if (days <= 0) continue;
    const perPeriod = roundHalfUp(
      model.annualSalaryMinor ?? 0,
      PERIODS_PER_YEAR[period.frequency],
    );
    pays.push({
      compensationId: model.id,
      days,
      periodDays,
      amountMinor:
        days >= periodDays
          ? perPeriod
          : roundHalfUp(perPeriod * days, periodDays),
    });
  }
  return pays;
}

/** The identity of "this member was paid for this session". */
export function paidKey(staffProfileId: string, sessionKey: string): string {
  return `${staffProfileId}|${sessionKey}`;
}

export function computePayRun(
  period: PayPeriodInput,
  members: readonly PayMemberInput[],
  sessions: readonly DeliveredSessionInput[],
  models: readonly CompensationInput[],
  options: {
    /** `paidKey(staffProfileId, sessionKey)` of every session already paid. */
    readonly alreadyPaidSessionKeys?: ReadonlySet<string>;
    readonly salaryAlreadyPaidStaffIds?: ReadonlySet<string>;
  } = {},
): PayRunComputation {
  const paid = options.alreadyPaidSessionKeys ?? new Set<string>();
  const salaryPaid = options.salaryAlreadyPaidStaffIds ?? new Set<string>();
  const lines: PayRunLineDraft[] = [];
  const unpaidSessions: { staffProfileId: string; key: string }[] = [];
  const seen = new Set<string>();
  for (const member of [...members].sort((left, right) =>
    left.staffProfileId.localeCompare(right.staffProfileId),
  )) {
    const own = models.filter(
      (model) => model.staffProfileId === member.staffProfileId,
    );
    const inPeriod = own.filter(
      (model) =>
        model.effectiveFrom <= period.endsOn &&
        (model.effectiveTo === undefined ||
          model.effectiveTo >= period.startsOn),
    );
    const sessionPays: SessionPay[] = [];
    for (const session of [...sessions]
      .filter((candidate) => candidate.staffProfileId === member.staffProfileId)
      .sort(
        (left, right) =>
          left.startsAt.localeCompare(right.startsAt) ||
          left.key.localeCompare(right.key),
      )) {
      if (
        session.localDate < period.startsOn ||
        session.localDate > period.endsOn ||
        paid.has(paidKey(member.staffProfileId, session.key)) ||
        seen.has(`${member.staffProfileId}|${session.key}`)
      ) {
        continue;
      }
      seen.add(`${member.staffProfileId}|${session.key}`);
      const model = modelFor(own, member.staffProfileId, session.localDate);
      if (!model) {
        unpaidSessions.push({
          staffProfileId: member.staffProfileId,
          key: session.key,
        });
        continue;
      }
      if (model.model === "salary") continue; // salary covers the time
      sessionPays.push(sessionPay(session, model));
    }
    const salary = salaryPaid.has(member.staffProfileId)
      ? []
      : salaryPay(period, inPeriod);
    if (sessionPays.length === 0 && salary.length === 0) continue;
    const current =
      modelFor(own, member.staffProfileId, period.endsOn) ??
      [...inPeriod].sort((left, right) =>
        right.effectiveFrom.localeCompare(left.effectiveFrom),
      )[0]!;
    const earningsMinor =
      sessionPays.reduce((total, pay) => total + pay.amountMinor, 0) +
      salary.reduce((total, pay) => total + pay.amountMinor, 0);
    lines.push({
      staffProfileId: member.staffProfileId,
      compensationId: current.id,
      compensationModel: current.model,
      classification: current.classification,
      // Duna pays nobody until B3c; W-2 can never be paid through Duna Pay.
      method: "export",
      payoutReady: member.payoutReady,
      sessionsCount: sessionPays.length,
      minutesWorked: sessionPays.reduce((total, pay) => total + pay.minutes, 0),
      earningsMinor,
      sessions: sessionPays,
      salary,
    });
  }
  return {
    lines,
    contractorTotalMinor: lines
      .filter((line) => line.classification === "1099-contractor")
      .reduce((total, line) => total + line.earningsMinor, 0),
    employeeTotalMinor: lines
      .filter((line) => line.classification === "w2-employee")
      .reduce((total, line) => total + line.earningsMinor, 0),
    unpaidSessions,
  };
}

/** The last day of a period that starts on `startsOn` (local dates). */
export function periodEndsOn(
  frequency: PayFrequency,
  startsOn: string,
): string {
  const [year = 0, month = 1, day = 1] = startsOn.split("-").map(Number);
  const iso = (value: number) => new Date(value).toISOString().slice(0, 10);
  switch (frequency) {
    case "weekly":
      return iso(Date.UTC(year, month - 1, day + 6));
    case "every-2-weeks":
      return iso(Date.UTC(year, month - 1, day + 13));
    case "twice-monthly":
      if (day === 1) return iso(Date.UTC(year, month - 1, 15));
      if (day === 16) return iso(Date.UTC(year, month, 0));
      throw new Error("Twice-monthly periods start on the 1st or the 16th.");
    case "monthly": {
      // Same day next month, minus one day (clamped to the month's end).
      const lastOfNext = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      return iso(Date.UTC(year, month, Math.min(day, lastOfNext) - 1));
    }
  }
}
