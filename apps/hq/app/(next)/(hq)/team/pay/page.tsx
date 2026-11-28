import { formatMoney } from "@duna/core";
import { hqHref } from "@duna/core/hq-routes";
import { localDateOf } from "@duna/scheduling";
import { Chip, NotConfigured } from "@duna/ui/tideline";
import type { Metadata } from "next";
import Link from "next/link";
import { PageSection } from "@/components/shell/page-header";
import { ComputeRunButton, NewPayPeriod } from "@/components/team/pay-periods";
import {
  loadCompensation,
  loadPayoutsReady,
  loadPayPeriods,
  loadPayRuns,
  loadTeamWorkspace,
  teamContext,
} from "@/components/team/team-data";
import {
  classificationLabel,
  compensationSentence,
  dateSpanWords,
  frequencyWords,
  payRunStatusCopy,
  roleLabel,
} from "@/components/team/team-model";
import { TeamBlockState, TeamScreen } from "@/components/team/team-screen";

export const metadata: Metadata = { title: "Team pay" };

/**
 * Team › Pay (TM-PayRun list, CO-14): how each person is paid in a
 * sentence, pay periods, and pay runs by period. Only for people who may
 * see everyone's pay; Duna works pay out and exports it, and pays nobody.
 */
export default async function TeamPayPage() {
  const context = await teamContext();
  const allowed = context.canSeeTeam && context.canSeePay;
  const [workspace, periods, runs, payouts] = allowed
    ? await Promise.all([
        loadTeamWorkspace(),
        loadPayPeriods(),
        loadPayRuns(),
        loadPayoutsReady(),
      ])
    : [undefined, undefined, undefined, undefined];
  const staff = workspace?.state === "ok" ? workspace.data.staff : [];
  const compensation = await Promise.all(
    staff.map(
      async (member) => [member, await loadCompensation(member.id)] as const,
    ),
  );
  const today = localDateOf(Date.parse(context.now), context.timeZone);
  return (
    <TeamScreen
      askLabel="Team pay"
      askStarters={[
        "What will the team cost this pay period?",
        "Who isn't set up for pay yet?",
        "Explain how revenue share is worked out",
      ]}
      description="How each person is paid, and pay runs for your own payroll. Duna doesn't pay anyone."
      needsPay
      tab="pay"
      title="Team pay"
    >
      <PageSection
        aside={context.canWritePay ? <NewPayPeriod today={today} /> : undefined}
        flush
        id="pay-periods"
        title="Pay periods"
      >
        {!periods ? null : periods.state !== "ok" ? (
          <TeamBlockState
            loaded={periods}
            organization={context.organization}
            what="pay periods"
          />
        ) : periods.data.periods.length === 0 ? (
          <p className="team-quiet">
            No pay periods yet. Add one to start working out pay.
          </p>
        ) : (
          <ul aria-label="Pay periods" className="team-list">
            {periods.data.periods.map((period) => {
              const periodRuns =
                runs?.state === "ok"
                  ? runs.data.runs
                      .filter((run) => run.payPeriod.id === period.id)
                      .sort((a, b) => b.revision - a.revision)
                  : [];
              const openRun = periodRuns.find(
                (run) => run.status === "ready-for-approval",
              );
              return (
                <li className="team-period" key={period.id}>
                  <div className="team-row__who">
                    <span className="team-row__name">
                      {dateSpanWords(period.startsOn, period.endsOn)}
                    </span>
                    <span className="team-quiet">
                      {frequencyWords(period.frequency)}
                      {period.approveBy
                        ? ` · approve by ${dateSpanWords(period.approveBy, period.approveBy)}`
                        : ""}
                      {period.status === "closed" ? " · closed" : ""}
                    </span>
                  </div>
                  <ul aria-label="Pay runs" className="team-period__runs">
                    {periodRuns.length === 0 ? (
                      <li className="team-quiet">No pay run yet</li>
                    ) : (
                      periodRuns.map((run) => {
                        const status = payRunStatusCopy(run.status);
                        return (
                          <li key={run.id}>
                            <Link
                              className="team-link"
                              href={hqHref("teamPayRun", { payRunId: run.id })}
                            >
                              {`Run ${run.revision}`}
                            </Link>
                            <Chip tone={status.tone}>{status.label}</Chip>
                            {run.lines.length > 0 ? (
                              <span className="team-quiet">
                                {`Contractors ${formatMoney(run.contractorTotal.amountMinor, run.contractorTotal.currency)} · employees ${formatMoney(run.employeeTotal.amountMinor, run.employeeTotal.currency)}`}
                              </span>
                            ) : null}
                          </li>
                        );
                      })
                    )}
                  </ul>
                  {context.canWritePay && period.status === "open" ? (
                    <ComputeRunButton
                      hasOpenRun={Boolean(openRun)}
                      period={period}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {runs && runs.state !== "ok" ? (
          <TeamBlockState
            loaded={runs}
            organization={context.organization}
            what="pay runs"
          />
        ) : null}
      </PageSection>

      <PageSection flush id="pay-people" title="How each person is paid">
        {workspace && workspace.state !== "ok" ? (
          <TeamBlockState
            loaded={workspace}
            organization={context.organization}
            what="the team"
          />
        ) : (
          <ul aria-label="How each person is paid" className="team-list">
            {compensation.map(([member, pay]) => (
              <li className="team-schedule" key={member.id}>
                <div className="team-row__who">
                  <Link
                    className="team-row__name"
                    href={hqHref("teamMemberPay", {
                      personId: member.personId,
                    })}
                  >
                    {member.displayName}
                  </Link>
                  <span className="team-quiet">
                    {roleLabel(member.role, member.isOwner)}
                  </span>
                </div>
                <span>
                  {pay.state === "ok"
                    ? pay.data.current
                      ? compensationSentence(pay.data.current)
                      : "Not set up for pay yet"
                    : pay.state === "denied"
                      ? "You can't see this"
                      : "Can't be read right now"}
                </span>
                {pay.state === "ok" && pay.data.current ? (
                  <Chip kind="taxonomy">
                    {classificationLabel(pay.data.current.classification)}
                  </Chip>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </PageSection>

      <PageSection id="pay-out" title="Paying people">
        <p className="team-body">
          Approve a pay run, then export the file for your payroll provider or
          accountant. Duna works out pay; it doesn&apos;t pay anyone, run
          payroll or work out tax.
        </p>
        {payouts?.state === "ok" && payouts.data.ready ? null : (
          <NotConfigured
            compact
            feature="Paying contractors through Duna Pay"
            needs="a review by the club owner and counsel"
            owner={`Duna, for ${context.organization}`}
          />
        )}
      </PageSection>
    </TeamScreen>
  );
}
