/**
 * My pay from the backend (M-R5): `operator.teamPay.staffCompensation` for
 * me (my model, history and income goal with the backend's `earned`), and
 * `payRuns` for my own line of each run. Members may read their own
 * compensation; pay runs are readable by managers and payments readers only
 * today, so for a coach that read is "denied" and the screen says so
 * (Needs API: a member's own pay-run lines, `teamPay.myPayLines`). Both are
 * kept on the device for reading without signal.
 */
import type { TeamPayRun } from "@duna/api";
import {
  teamPayDemoRuns,
  teamPayDemoStaffCompensation,
} from "@duna/core/demo/team-pay";
import { log } from "@duna/observability";
import { useCallback } from "react";
import { useProRuntime } from "../../../runtime";
import {
  keptKey,
  useCachedLoad,
  type CachedLoad,
  type MyTeam,
} from "../availability/use-my-team";
import type { GoalPeriod } from "../availability/team-words";

type DunaClient = NonNullable<ReturnType<typeof useProRuntime>["client"]>;
export type StaffCompensation = Awaited<
  ReturnType<DunaClient["operator"]["teamPay"]["staffCompensation"]["query"]>
>;

type GoalCurrency = Parameters<
  DunaClient["operator"]["teamPay"]["setIncomeGoal"]["mutate"]
>[0]["target"]["currency"];

export interface EarningsData {
  readonly compensation: CachedLoad<StaffCompensation>;
  readonly runs: CachedLoad<{ readonly runs: readonly TeamPayRun[] }>;
  readonly setGoal: (input: {
    readonly amountMinor: number;
    readonly currency: string;
    readonly period: GoalPeriod;
  }) => Promise<void>;
}

export function useEarnings(team: MyTeam | null): EarningsData {
  const runtime = useProRuntime();
  const client = runtime.client;
  const preview = team?.preview ?? false;
  const staffProfileId = team?.me.staffProfileId;

  const compensationFetcher = useCallback(async () => {
    if (preview || !client || !staffProfileId) {
      return teamPayDemoStaffCompensation as unknown as StaffCompensation;
    }
    return client.operator.teamPay.staffCompensation.query({ staffProfileId });
  }, [client, preview, staffProfileId]);
  const runsFetcher = useCallback(async () => {
    if (preview || !client) {
      return { runs: teamPayDemoRuns as unknown as readonly TeamPayRun[] };
    }
    return client.operator.teamPay.payRuns.query({});
  }, [client, preview]);

  const compensation = useCachedLoad<StaffCompensation>(
    team ? keptKey(team, preview ? "pay-preview" : "pay") : null,
    compensationFetcher,
    "pro.earnings.load_failed",
  );
  const runs = useCachedLoad<{ readonly runs: readonly TeamPayRun[] }>(
    team ? keptKey(team, preview ? "pay-runs-preview" : "pay-runs") : null,
    runsFetcher,
    "pro.earnings.runs_failed",
  );

  const setGoal = useCallback<EarningsData["setGoal"]>(
    async (input) => {
      if (!staffProfileId) return;
      if (preview || !client) {
        const page = compensation.data;
        if (page?.goal) {
          compensation.replace({
            ...page,
            goal: {
              ...page.goal,
              target: {
                amountMinor: input.amountMinor,
                currency: input.currency,
              },
              period: input.period,
              progressPercent:
                Math.round(
                  (page.goal.earned.amountMinor / input.amountMinor) * 1000,
                ) / 10,
            },
          } as StaffCompensation);
        }
        log.info("pro.earnings.goal_set", { preview: true });
        return;
      }
      const next = await client.operator.teamPay.setIncomeGoal.mutate({
        staffProfileId,
        target: {
          amountMinor: input.amountMinor,
          currency: input.currency as GoalCurrency,
        },
        period: input.period,
      });
      compensation.replace(next);
      log.info("pro.earnings.goal_set", { preview: false });
    },
    [client, compensation, preview, staffProfileId],
  );

  return { compensation, runs, setGoal };
}
