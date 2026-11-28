/**
 * What I have earned (M-R5, the Earnings tab; persona CH-6.n). Pure;
 * `earnings-model.test.ts`.
 *
 * Every amount comes from the backend: the pay sentence formats the model
 * `operator.teamPay.staffCompensation` returned; "so far" is the goal's
 * `earned`, which the backend computes from delivered sessions; past pay is
 * my own line of each pay run. Nothing here computes pay. The backend's pay
 * function (`@duna/api/team-pay-compute`) is not exported on main yet, so
 * the phone does not estimate a period's pay of its own.
 *
 * Only the signed-in member's own pay is ever shown.
 */
import type { TeamPayLine, TeamPayRun } from "@duna/api";
import { formatMoney } from "@duna/core";
import {
  classificationLabel,
  compensationSentence,
  dateSpanWords,
  dayMonth,
  goalPeriods,
  hoursWords,
  lineMethodWords,
  payRunStatusCopy,
  type Classification,
  type CompensationShape,
  type GoalPeriod,
  type StateCopy,
} from "../availability/team-words";

type Amount = { readonly amountMinor: number; readonly currency: string };

/** The statement under every Earnings screen (owner direction, B3b). */
export const PAYROLL_STATEMENT =
  "Duna works out pay for your club's payroll. Duna doesn't pay anyone: your club pays you.";

/**
 * What the phone says while contractor payouts are switched off: B3c's
 * `teamPayouts` answers "not configured" (PRECONDITION_FAILED) until the
 * owner and counsel turn it on (docs/money/contractor-payouts.md).
 */
export const DUNA_PAY_PAYOUTS = "Duna Pay payouts: not configured yet";

export interface PayHeadline {
  /** "$40.00 per session", or undefined when the club has not set pay. */
  readonly sentence?: string;
  /** "Contractor (1099)", as the club set it; no commentary. */
  readonly classification: string;
  /** "Since 1 September". */
  readonly since?: string;
}

export function payHeadline(
  current:
    | (CompensationShape & {
        readonly classification: Classification;
        readonly effectiveFrom: string;
      })
    | undefined,
): PayHeadline {
  if (!current) return { classification: classificationLabel("not-set") };
  return {
    sentence: compensationSentence(current),
    classification: classificationLabel(current.classification),
    since: `Since ${dayMonth(current.effectiveFrom)}`,
  };
}

export interface GoalView {
  readonly target: string;
  readonly earned: string;
  readonly period: string;
  /** 0–100 for the bar (the backend's figure may pass 100). */
  readonly barPercent: number;
  /** "60% of your goal", "Goal reached: 112%". */
  readonly progress: string;
  /** "$720.00 of $1,200.00 a week". */
  readonly line: string;
  readonly spoken: string;
}

export function goalView(goal: {
  readonly target: Amount;
  readonly earned: Amount;
  readonly period: GoalPeriod;
  readonly progressPercent: number;
}): GoalView {
  const target = formatMoney(goal.target.amountMinor, goal.target.currency);
  const earned = formatMoney(goal.earned.amountMinor, goal.earned.currency);
  const period =
    goalPeriods.find((item) => item.value === goal.period)?.label ??
    goal.period;
  const percent = Math.round(goal.progressPercent * 10) / 10;
  const progress =
    percent >= 100 ? `Goal reached: ${percent}%` : `${percent}% of your goal`;
  return {
    target,
    earned,
    period,
    barPercent: Math.max(0, Math.min(100, percent)),
    progress,
    line: `${earned} of ${target} ${period}`,
    spoken: `${earned} earned of your ${target} goal ${period}, ${percent} percent`,
  };
}

/** Which part of the goal's period is "so far" ("this week so far"). */
export function soFarLabel(period: GoalPeriod): string {
  return `This ${period} so far`;
}

export interface MyPayLine {
  readonly runId: string;
  readonly period: string;
  readonly periodEndsOn: string;
  readonly revision: number;
  readonly status: StateCopy;
  readonly total: string;
  readonly earnings: string;
  readonly adjustments: readonly { label: string; amount: string }[];
  readonly sessions: string;
  readonly hours: string;
  readonly method: string;
  readonly spoken: string;
}

/**
 * My line of each pay run, newest period first. Cancelled runs and runs
 * without a line for me are left out; when a period has several revisions
 * only the newest is shown (a correction pays only what was not paid, so
 * a later revision is a separate run the backend lists on its own).
 */
export function myPayLines(
  runs: readonly TeamPayRun[],
  staffProfileId: string,
): MyPayLine[] {
  const rows: MyPayLine[] = [];
  for (const run of runs) {
    if (run.status === "cancelled") continue;
    const line = run.lines.find(
      (candidate: TeamPayLine) =>
        candidate.staff.staffProfileId === staffProfileId &&
        candidate.status !== "excluded",
    );
    if (!line) continue;
    const money = (amount: Amount) =>
      formatMoney(amount.amountMinor, amount.currency);
    const period = dateSpanWords(run.payPeriod.startsOn, run.payPeriod.endsOn);
    const status = payRunStatusCopy(run.status);
    const sessions = `${line.sessionsCount} ${line.sessionsCount === 1 ? "session" : "sessions"}`;
    rows.push({
      runId: run.id,
      period,
      periodEndsOn: run.payPeriod.endsOn,
      revision: run.revision,
      status,
      total: money(line.total),
      earnings: money(line.earnings),
      adjustments: line.adjustments.map((adjustment) => ({
        label: adjustment.label,
        amount: money(adjustment.amount),
      })),
      sessions,
      hours: hoursWords(line.minutesWorked),
      method: lineMethodWords(line.method),
      spoken: `${period}: ${money(line.total)}, ${sessions}, ${status.label}`,
    });
  }
  return rows.sort(
    (left, right) =>
      right.periodEndsOn.localeCompare(left.periodEndsOn) ||
      right.revision - left.revision,
  );
}
