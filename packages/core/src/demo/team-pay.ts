/**
 * Demo fixtures: team-pay (owner: B3b). The demo coaches (the same staff
 * profiles as team-availability) with every compensation model, both
 * classifications, an income goal, pay periods of every frequency and
 * status, pay runs in every status, lines in every status and method, and
 * exports in every format. Shaped by `contracts/team-pay.ts`; parsed in
 * packages/api/src/contracts/team-pay.test.ts. Amounts are placeholders.
 */
import { demoPeople } from "../demo";
import { demoId } from "./ids";
import {
  teamAvailabilityDemoIds,
  teamAvailabilityDemoStaff,
} from "./team-availability";

const id = (n: number) => demoId("team-pay", n);
const usd = (amountMinor: number) => ({
  amountMinor,
  currency: "USD" as const,
});
const elena = demoPeople[3]!;

export const teamPayDemoStaff = {
  ...teamAvailabilityDemoStaff,
  /** A W-2 front-desk lead, tracked and exported only. */
  elena: {
    staffProfileId: id(1),
    personId: elena.id,
    displayName: elena.displayName,
    initials: elena.initials,
  },
};

const { theo, noa, sam } = teamPayDemoStaff;

export const teamPayDemoCompensation = [
  {
    id: id(10),
    staffProfileId: teamAvailabilityDemoIds.theo,
    model: "hourly-plus-share" as const,
    classification: "1099-contractor" as const,
    effectiveFrom: "2026-09-01",
    hourlyRate: usd(4000),
    revenueShareBps: 2000,
    revenueShareScope: ["private-lesson"],
  },
  {
    id: id(11),
    staffProfileId: teamAvailabilityDemoIds.theo,
    model: "hourly" as const,
    classification: "1099-contractor" as const,
    effectiveFrom: "2026-03-01",
    effectiveTo: "2026-08-31",
    hourlyRate: usd(3500),
    revenueShareScope: [],
  },
  {
    id: id(12),
    staffProfileId: teamAvailabilityDemoIds.noa,
    model: "per-session" as const,
    classification: "1099-contractor" as const,
    effectiveFrom: "2026-09-01",
    perSessionRate: usd(6000),
    revenueShareScope: [],
  },
  {
    id: id(13),
    staffProfileId: teamAvailabilityDemoIds.sam,
    model: "revenue-share" as const,
    classification: "1099-contractor" as const,
    effectiveFrom: "2026-10-01",
    revenueShareBps: 3500,
    revenueShareScope: ["group-lesson", "clinic"],
  },
  {
    id: id(14),
    staffProfileId: id(1),
    model: "salary" as const,
    classification: "w2-employee" as const,
    effectiveFrom: "2026-01-01",
    annualSalary: usd(4_800_000),
    revenueShareScope: [],
  },
];

export const teamPayDemoStaffCompensation = {
  staff: theo,
  current: teamPayDemoCompensation[0]!,
  history: [teamPayDemoCompensation[0]!, teamPayDemoCompensation[1]!],
  goal: {
    id: id(20),
    target: usd(120_000),
    period: "week" as const,
    periodStartsAt: "2026-11-23T08:00:00.000Z",
    periodEndsAt: "2026-11-30T08:00:00.000Z",
    earned: usd(72_000),
    progressPercent: 60,
  },
};

const period = (
  n: number,
  frequency: "weekly" | "every-2-weeks" | "twice-monthly" | "monthly",
  startsOn: string,
  endsOn: string,
  status: "open" | "closed",
  approveBy?: string,
) => ({
  id: id(30 + n),
  frequency,
  startsOn,
  endsOn,
  ...(approveBy ? { approveBy } : {}),
  status,
});

export const teamPayDemoPeriods = [
  period(1, "every-2-weeks", "2026-11-16", "2026-11-29", "open", "2026-12-01"),
  period(
    2,
    "every-2-weeks",
    "2026-11-02",
    "2026-11-15",
    "closed",
    "2026-11-17",
  ),
  period(3, "weekly", "2026-10-26", "2026-11-01", "closed"),
  period(4, "twice-monthly", "2026-10-16", "2026-10-31", "closed"),
  period(5, "monthly", "2026-09-01", "2026-09-30", "closed"),
];

type LineStatus =
  | "computed"
  | "adjusted"
  | "approved"
  | "exported"
  | "paying"
  | "paid"
  | "failed"
  | "excluded";

const line = (
  n: number,
  staff: typeof theo,
  classification: "1099-contractor" | "w2-employee",
  model:
    "per-session" | "hourly" | "salary" | "revenue-share" | "hourly-plus-share",
  method: "duna-pay" | "export" | "none",
  status: LineStatus,
  earningsMinor: number,
  adjustments: { label: string; amountMinor: number }[] = [],
) => {
  const adjustmentsMinor = adjustments.reduce(
    (sum, a) => sum + a.amountMinor,
    0,
  );
  return {
    id: id(100 + n),
    staff,
    classification,
    compensationModel: model,
    method,
    status,
    sessionsCount: model === "salary" ? 0 : 9,
    minutesWorked: model === "salary" ? 0 : 1080,
    earnings: usd(earningsMinor),
    adjustments: adjustments.map((a) => ({
      label: a.label,
      amount: usd(a.amountMinor),
    })),
    total: usd(earningsMinor + adjustmentsMinor),
    payoutReady: classification === "1099-contractor" && method === "duna-pay",
  };
};

const linesFor = (n: number, status: LineStatus, alt: LineStatus = status) => [
  line(
    n,
    theo,
    "1099-contractor",
    "hourly-plus-share",
    "duna-pay",
    status,
    72_000,
    [{ label: "Share of private lessons", amountMinor: 18_000 }],
  ),
  line(n + 1, noa, "1099-contractor", "per-session", "export", alt, 54_000),
  line(
    n + 2,
    teamPayDemoStaff.elena,
    "w2-employee",
    "salary",
    "export",
    status === "paid" || status === "paying" || status === "failed"
      ? "exported"
      : status,
    184_615,
  ),
];

const approver = {
  personId: demoPeople[3]!.id,
  displayName: demoPeople[3]!.displayName,
  initials: demoPeople[3]!.initials,
};

const totals = (lines: ReturnType<typeof linesFor>) => ({
  contractorTotal: usd(
    lines
      .filter((l) => l.classification === "1099-contractor")
      .reduce((sum, l) => sum + l.total.amountMinor, 0),
  ),
  employeeTotal: usd(
    lines
      .filter((l) => l.classification === "w2-employee")
      .reduce((sum, l) => sum + l.total.amountMinor, 0),
  ),
});

type RunStatus =
  | "draft"
  | "computing"
  | "ready-for-approval"
  | "approved"
  | "exported"
  | "paying"
  | "paid"
  | "partially-paid"
  | "cancelled";

const exportRow = (
  n: number,
  format: "csv" | "gusto" | "adp" | "quickbooks",
) => ({
  id: id(300 + n),
  format,
  rowCount: 3,
  sha256: String(n).padStart(2, "0").repeat(32),
  createdAt: "2026-11-18T18:00:00.000Z",
  createdBy: approver,
});

const run = (
  n: number,
  periodIndex: number,
  revision: number,
  status: RunStatus,
  lines: ReturnType<typeof linesFor>,
  exports: ReturnType<typeof exportRow>[] = [],
) => ({
  id: id(200 + n),
  payPeriod: teamPayDemoPeriods[periodIndex]!,
  revision,
  status,
  ...totals(lines),
  ...(status !== "draft" && status !== "computing"
    ? { computedAt: "2026-11-30T09:00:00.000Z" }
    : {}),
  ...(["approved", "exported", "paying", "paid", "partially-paid"].includes(
    status,
  )
    ? { approvedAt: "2026-11-30T18:00:00.000Z", approvedBy: approver }
    : {}),
  lines,
  exports,
});

export const teamPayDemoRuns = [
  run(1, 0, 2, "ready-for-approval", linesFor(10, "computed", "adjusted")),
  run(2, 0, 1, "cancelled", linesFor(20, "excluded")),
  run(3, 0, 3, "draft", []),
  run(4, 0, 4, "computing", []),
  run(5, 1, 1, "paid", linesFor(30, "paid"), [exportRow(1, "csv")]),
  run(6, 2, 1, "partially-paid", linesFor(40, "failed", "exported"), [
    exportRow(2, "gusto"),
  ]),
  run(7, 3, 1, "paying", linesFor(50, "paying"), [exportRow(3, "adp")]),
  run(8, 4, 1, "exported", linesFor(60, "exported"), [
    exportRow(4, "quickbooks"),
  ]),
  run(9, 4, 2, "approved", linesFor(70, "approved")),
];

/** A line no method applies to (a coach with no sessions). */
export const teamPayDemoNoneLine = line(
  90,
  sam,
  "1099-contractor",
  "revenue-share",
  "none",
  "excluded",
  0,
);

export const teamPayDemo = {
  domain: "team-pay",
  compensation: teamPayDemoCompensation,
  staffCompensation: teamPayDemoStaffCompensation,
  periods: teamPayDemoPeriods,
  runs: teamPayDemoRuns,
  noneLine: teamPayDemoNoneLine,
} as const;
