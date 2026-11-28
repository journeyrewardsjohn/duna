import {
  type CompensationInput,
  type PayFrequency,
  salaryPay,
  sessionPay,
} from "@duna/api/team-pay-compute";
import { formatMoney } from "@duna/core";
import type { CompensationForm } from "./team-model";

/**
 * The worked example under the pay form. Every amount here comes from the
 * backend's own pay functions (`sessionPay`, `salaryPay` in
 * packages/api/src/services/team-pay/compute.ts, the same ones a pay run
 * uses), never from arithmetic in HQ. The inputs are a sample session the
 * sentence names (90 minutes, $100.00 kept by the club after refunds) and
 * the club's pay period length.
 */
export const EXAMPLE_SESSION_MINUTES = 90;
export const EXAMPLE_REVENUE_MINOR = 10_000;

export interface PayExample {
  /** "For a 90-minute session that brings in $100.00 after refunds:" */
  readonly lead: string;
  /** One line per part of the pay, then the total. */
  readonly lines: readonly {
    readonly label: string;
    readonly amount: string;
  }[];
}

function modelFor(form: CompensationForm): CompensationInput {
  return {
    id: "example",
    staffProfileId: "example",
    model: form.model,
    classification: form.classification,
    effectiveFrom: "2000-01-01",
    hourlyRateMinor: form.hourlyRateMinor ?? undefined,
    perSessionRateMinor: form.perSessionRateMinor ?? undefined,
    annualSalaryMinor: form.annualSalaryMinor ?? undefined,
    revenueShareBps: form.revenueShareBps ?? undefined,
    // The example session counts as in scope, so the share always shows.
    revenueShareScope: [],
  };
}

const periodDays: Record<PayFrequency, [string, string]> = {
  weekly: ["2027-01-04", "2027-01-10"],
  "every-2-weeks": ["2027-01-04", "2027-01-17"],
  "twice-monthly": ["2027-01-01", "2027-01-15"],
  monthly: ["2027-01-01", "2027-01-31"],
};

const frequencyWords: Record<PayFrequency, string> = {
  weekly: "a week",
  "every-2-weeks": "every two weeks",
  "twice-monthly": "twice a month",
  monthly: "a month",
};

/** The worked example for a form, or undefined while it is incomplete. */
export function payExample(
  form: CompensationForm,
  currency: string,
  frequency: PayFrequency = "every-2-weeks",
): PayExample | undefined {
  const model = modelFor(form);
  const money = (minor: number) => formatMoney(minor, currency);
  if (form.model === "salary") {
    if (form.annualSalaryMinor === null) return undefined;
    const [startsOn, endsOn] = periodDays[frequency];
    const [pay] = salaryPay({ frequency, startsOn, endsOn, currency }, [model]);
    if (!pay) return undefined;
    return {
      lead: `Paid ${frequencyWords[frequency]}, a full pay period is:`,
      lines: [
        { label: "Salary for the period", amount: money(pay.amountMinor) },
      ],
    };
  }
  if (
    (form.model === "per-session" && form.perSessionRateMinor === null) ||
    ((form.model === "hourly" || form.model === "hourly-plus-share") &&
      form.hourlyRateMinor === null) ||
    ((form.model === "revenue-share" || form.model === "hourly-plus-share") &&
      form.revenueShareBps === null)
  ) {
    return undefined;
  }
  const start = "2027-01-06T17:00:00.000Z";
  const end = new Date(
    Date.parse(start) + EXAMPLE_SESSION_MINUTES * 60_000,
  ).toISOString();
  const pay = sessionPay(
    {
      key: "session:example",
      kind: "session",
      staffProfileId: "example",
      startsAt: start,
      endsAt: end,
      localDate: "2027-01-06",
      minutes: EXAMPLE_SESSION_MINUTES,
      attended: true,
      revenueMinor: EXAMPLE_REVENUE_MINOR,
    },
    model,
  );
  const lines: { label: string; amount: string }[] = [];
  if (form.model === "per-session") {
    lines.push({ label: "Per session", amount: money(pay.perSessionMinor) });
  }
  if (form.model === "hourly" || form.model === "hourly-plus-share") {
    lines.push({
      label: `${EXAMPLE_SESSION_MINUTES} minutes at the hourly rate`,
      amount: money(pay.hourlyMinor),
    });
  }
  if (form.model === "revenue-share" || form.model === "hourly-plus-share") {
    lines.push({ label: "Share of revenue", amount: money(pay.shareMinor) });
  }
  if (lines.length > 1) {
    lines.push({ label: "For this session", amount: money(pay.amountMinor) });
  }
  return {
    lead:
      form.model === "per-session"
        ? "For each session they deliver:"
        : `For a ${EXAMPLE_SESSION_MINUTES}-minute session that brings in ${money(EXAMPLE_REVENUE_MINOR)} after refunds:`,
    lines,
  };
}
