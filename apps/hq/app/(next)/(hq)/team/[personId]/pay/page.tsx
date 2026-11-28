import { formatMoney } from "@duna/core";
import { localDateOf } from "@duna/scheduling";
import { Chip, Progress } from "@duna/ui/tideline";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageSection } from "@/components/shell/page-header";
import { CompensationEditor, GoalEditor } from "@/components/team/member-pay";
import {
  loadCompensation,
  loadPayPeriods,
  loadTeamWorkspace,
} from "@/components/team/team-data";
import {
  classificationLabel,
  compensationSentence,
  dateSpanWords,
  firstName,
  frequencyWords,
  type GoalPeriod,
  goalPeriods,
  type PayFrequency,
  possessive,
} from "@/components/team/team-model";
import {
  MemberScreen,
  memberPage,
  TeamBlockState,
} from "@/components/team/team-screen";
import { AccessDeniedState } from "@/lib/access-state";

export const metadata: Metadata = { title: "Pay" };

/**
 * A team member › Pay (TM-Compensation, CH-6.1): how they are paid as a
 * sentence, the history, their income goal with what delivered sessions
 * have earned toward it, and the current pay period. The member sees their
 * own; managers see everyone's; the owner changes it.
 */
export default async function TeamMemberPayPage({
  params,
}: {
  readonly params: Promise<{ personId: string }>;
}) {
  const { personId } = await params;
  const found = await memberPage(personId);
  if (found.kind === "missing") notFound();
  if (found.kind === "state") return found.node;
  const { page } = found;
  const { member, context, isSelf } = page;
  const first = firstName(member.displayName);
  const mayRead = isSelf || context.canSeePay;
  if (!mayRead) {
    return (
      <MemberScreen askStarters={[]} page={page} tab="pay">
        <div className="hqs-state">
          <AccessDeniedState
            area={`${possessive(first)} pay`}
            grantedBy={`${first}, a manager or the owner of ${context.organization}`}
          />
        </div>
      </MemberScreen>
    );
  }
  const [pay, periods, workspace] = await Promise.all([
    loadCompensation(member.id),
    loadPayPeriods(),
    loadTeamWorkspace(),
  ]);
  const today = localDateOf(Date.parse(context.now), context.timeZone);
  const openPeriod =
    periods.state === "ok"
      ? (periods.data.periods.find(
          (period) => period.startsOn <= today && period.endsOn >= today,
        ) ?? periods.data.periods.find((period) => period.status === "open"))
      : undefined;
  const latestFrequency =
    periods.state === "ok"
      ? (periods.data.periods[0]?.frequency as PayFrequency | undefined)
      : undefined;
  const currency =
    pay.state === "ok"
      ? (pay.data.current?.hourlyRate?.currency ??
        pay.data.current?.perSessionRate?.currency ??
        pay.data.current?.annualSalary?.currency ??
        pay.data.goal?.target.currency ??
        page.currency)
      : page.currency;
  const who = isSelf ? "You are" : `${first} is`;
  return (
    <MemberScreen
      askStarters={
        isSelf
          ? ["How much have I earned this period?", "When is the next pay run?"]
          : [
              `How much has ${first} earned this month?`,
              `What would ${first} earn at $45 an hour?`,
            ]
      }
      page={page}
      tab="pay"
    >
      {pay.state !== "ok" ? (
        <TeamBlockState
          loaded={pay}
          organization={context.organization}
          what={`${possessive(first)} pay`}
        />
      ) : (
        <>
          <PageSection
            id="pay-now"
            title={isSelf ? "How you are paid" : `How ${first} is paid`}
          >
            {pay.data.current ? (
              <div className="team-paid">
                <p className="team-lead">
                  <strong>{compensationSentence(pay.data.current)}</strong>
                </p>
                <p className="team-quiet">
                  {`${classificationLabel(pay.data.current.classification)} · since ${dateSpanWords(pay.data.current.effectiveFrom, pay.data.current.effectiveFrom)}`}
                </p>
              </div>
            ) : (
              <p className="team-quiet">{`${who} not set up for pay yet.`}</p>
            )}
            {context.canWritePay ? (
              <CompensationEditor
                currency={currency}
                current={pay.data.current}
                displayName={member.displayName}
                frequency={latestFrequency}
                offeringKinds={
                  workspace.state === "ok" ? workspace.data.offeringKinds : []
                }
                staffProfileId={member.id}
                today={today}
              />
            ) : null}
            <p className="team-note">
              Duna works out pay and exports it for the club&apos;s own payroll.
              It doesn&apos;t pay anyone or work out tax.
            </p>
          </PageSection>

          <PageSection id="pay-goal" title="Income goal">
            {pay.data.goal ? (
              <div className="team-goal">
                <p className="team-lead">
                  <span className="team-num">
                    {formatMoney(
                      pay.data.goal.earned.amountMinor,
                      pay.data.goal.earned.currency,
                    )}
                  </span>
                  <span className="team-quiet">
                    {` earned of ${formatMoney(pay.data.goal.target.amountMinor, pay.data.goal.target.currency)} ${goalPeriods.find((item) => item.value === pay.data.goal?.period)?.label ?? ""}, from delivered sessions`}
                  </span>
                </p>
                <Progress
                  label={`${Math.round(pay.data.goal.progressPercent)}% of the goal`}
                  max={100}
                  value={Math.min(100, pay.data.goal.progressPercent)}
                />
              </div>
            ) : (
              <p className="team-quiet">No goal set.</p>
            )}
            {context.canWritePay ? (
              <GoalEditor
                currency={currency}
                displayName={member.displayName}
                period={pay.data.goal?.period as GoalPeriod | undefined}
                staffProfileId={member.id}
                target={pay.data.goal?.target.amountMinor}
              />
            ) : null}
          </PageSection>

          <PageSection id="pay-period" title="Pay period">
            {periods.state !== "ok" ? (
              <TeamBlockState
                loaded={periods}
                organization={context.organization}
                what="pay periods"
              />
            ) : openPeriod ? (
              <p className="team-lead">
                {`${dateSpanWords(openPeriod.startsOn, openPeriod.endsOn)} · ${frequencyWords(openPeriod.frequency)}`}
                {openPeriod.approveBy
                  ? ` · approve by ${dateSpanWords(openPeriod.approveBy, openPeriod.approveBy)}`
                  : ""}
              </p>
            ) : (
              <p className="team-quiet">
                The club hasn&apos;t set up pay periods yet.
              </p>
            )}
          </PageSection>

          {pay.data.history.length > 1 ? (
            <PageSection flush id="pay-history" title="Earlier pay">
              <ul className="team-list" aria-label="Earlier pay">
                {pay.data.history
                  .filter((row) => row.id !== pay.data.current?.id)
                  .map((row) => (
                    <li className="team-schedule" key={row.id}>
                      <div className="team-row__who">
                        <span className="team-row__name">
                          {compensationSentence(row)}
                        </span>
                        <span className="team-quiet">
                          {row.effectiveTo
                            ? dateSpanWords(row.effectiveFrom, row.effectiveTo)
                            : `From ${dateSpanWords(row.effectiveFrom, row.effectiveFrom)}`}
                        </span>
                      </div>
                      <Chip kind="taxonomy">
                        {classificationLabel(row.classification)}
                      </Chip>
                    </li>
                  ))}
              </ul>
            </PageSection>
          ) : null}
        </>
      )}
    </MemberScreen>
  );
}
