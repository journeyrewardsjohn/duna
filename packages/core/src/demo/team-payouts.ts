/**
 * Demo fixtures: team-payouts (owner: B3c). Contractors with connected
 * accounts in each of the six statuses plus one not yet invited, and
 * contractor payouts in every status for approved pay-run lines. Shaped by
 * `contracts/team-payouts.ts`; parsed in
 * packages/api/src/contracts/team-payouts.test.ts.
 */
import { demoPeople, demoPlayer } from "../demo";
import { demoId } from "./ids";
import { teamAvailabilityDemoStaff } from "./team-availability";
import { teamPayDemoRuns } from "./team-pay";

const id = (n: number) => demoId("team-payouts", n);
const usd = (amountMinor: number) => ({
  amountMinor,
  currency: "USD" as const,
});

const ref = (
  staffProfileId: string,
  person: { id: string; displayName: string; initials?: string },
) => ({
  staffProfileId,
  personId: person.id,
  displayName: person.displayName,
  ...(person.initials ? { initials: person.initials } : {}),
});

const { theo, noa, sam } = teamAvailabilityDemoStaff;
const mara = ref(id(1), demoPlayer);
/** Fictional contractors that exist only in demo data. */
const riley = ref(id(2), {
  id: id(3),
  displayName: "Riley Shore",
  initials: "RS",
});
const casey = ref(id(4), {
  id: id(5),
  displayName: "Casey Dune",
  initials: "CD",
});
const elena = ref(id(6), demoPeople[3]!);

type AccountStatus =
  | "not-started"
  | "in-progress"
  | "verifying"
  | "action-needed"
  | "restricted"
  | "ready";

const account = (n: number, status: AccountStatus) => ({
  id: id(100 + n),
  status,
  payoutsEnabled: status === "ready",
  requirementsDue:
    status === "action-needed" || status === "restricted"
      ? [{ code: "individual.dob", label: "Date of birth" }]
      : [],
  ...(status === "ready" ? { bankLast4: "4321" } : {}),
  ...(status === "not-started" ? {} : { syncedAt: "2026-11-27T17:00:00.000Z" }),
});

export const teamPayoutsDemoContractors = [
  { staff: theo, account: account(1, "ready") },
  { staff: noa, account: account(2, "verifying") },
  { staff: sam, account: account(3, "action-needed") },
  { staff: mara, account: account(4, "in-progress") },
  { staff: riley, account: account(5, "restricted") },
  { staff: casey, account: account(6, "not-started") },
  { staff: elena },
];

const approvedRun = teamPayDemoRuns.find((run) => run.status === "approved")!;
const paidRun = teamPayDemoRuns.find((run) => run.status === "paid")!;
const partialRun = teamPayDemoRuns.find(
  (run) => run.status === "partially-paid",
)!;
const payingRun = teamPayDemoRuns.find((run) => run.status === "paying")!;

const initiatedBy = {
  personId: demoPeople[3]!.id,
  displayName: demoPeople[3]!.displayName,
  initials: demoPeople[3]!.initials,
};

const payout = (
  n: number,
  run: (typeof teamPayDemoRuns)[number],
  status: "pending" | "processing" | "paid" | "failed" | "cancelled",
  extra: { failureCode?: string; note?: string } = {},
) => {
  const line = run.lines[0]!;
  return {
    id: id(200 + n),
    staff: line.staff,
    payRunLineId: line.id,
    payRunId: run.id,
    status,
    amount: usd(line.total.amountMinor),
    initiatedBy,
    initiatedAt: "2026-11-30T19:00:00.000Z",
    ...(status === "paid" ? { paidAt: "2026-12-02T16:00:00.000Z" } : {}),
    ...extra,
  };
};

export const teamPayoutsDemoPayouts = [
  payout(1, approvedRun, "pending"),
  payout(2, payingRun, "processing"),
  payout(3, paidRun, "paid"),
  payout(4, partialRun, "failed", { failureCode: "account_closed" }),
  payout(5, approvedRun, "cancelled", { note: "Paid by cheque instead" }),
];

export const teamPayoutsDemo = {
  domain: "team-payouts",
  contractors: teamPayoutsDemoContractors,
  payouts: teamPayoutsDemoPayouts,
  /** What invite-to-connect answers while the processor has no credentials. */
  invite: { state: "provider-not-configured" as const },
} as const;
