import { hqHref } from "@duna/core/hq-routes";
import { ObjectHeader } from "@duna/ui/tideline";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { renderLink } from "@/components/money/money-link";
import { PayRunView } from "@/components/team/pay-run-view";
import { loadPayRun, teamContext } from "@/components/team/team-data";
import { dateSpanWords, frequencyWords } from "@/components/team/team-model";
import { TeamBlockState, TeamScreen } from "@/components/team/team-screen";

export const metadata: Metadata = { title: "Pay run" };

/**
 * One pay run as an open object (TM-PayRun, CO-14.1): review every line,
 * adjust with a reason, approve, export for the club's own payroll.
 */
export default async function TeamPayRunPage({
  params,
}: {
  readonly params: Promise<{ payRunId: string }>;
}) {
  const { payRunId } = await params;
  const context = await teamContext();
  const run = context.canSeePay ? await loadPayRun(payRunId) : undefined;
  if (run?.state === "not-found") notFound();
  const span =
    run?.state === "ok"
      ? dateSpanWords(run.data.payPeriod.startsOn, run.data.payPeriod.endsOn)
      : undefined;
  return (
    <TeamScreen
      askLabel={
        span ? `Team pay run for ${span} (${payRunId})` : "Team pay run"
      }
      askStarters={[
        "Why is this line higher than last period?",
        "Which sessions are in this pay run?",
      ]}
      crumb={span ? `Pay run, ${span}` : "Pay run"}
      header={
        run?.state === "ok" ? (
          <ObjectHeader
            back={{ href: hqHref("teamPay"), label: "Team pay" }}
            description={`${span} · ${frequencyWords(run.data.payPeriod.frequency).toLocaleLowerCase()} · run ${run.data.revision}. Duna works pay out for your payroll; it doesn't pay anyone.`}
            facts={[
              { label: "Period", value: span ?? "" },
              ...(run.data.payPeriod.approveBy
                ? [
                    {
                      label: "Approve by",
                      value: dateSpanWords(
                        run.data.payPeriod.approveBy,
                        run.data.payPeriod.approveBy,
                      ),
                    },
                  ]
                : []),
            ]}
            renderLink={renderLink}
            title="Pay run"
          />
        ) : undefined
      }
      needsPay
      parentHref={hqHref("teamPay")}
      tab="pay"
      title="Pay run"
    >
      {!run ? null : run.state !== "ok" ? (
        <TeamBlockState
          loaded={run}
          organization={context.organization}
          what="this pay run"
        />
      ) : (
        <PayRunView
          canWrite={context.canWritePay}
          initial={run.data}
          timeZone={context.timeZone}
          viewerName={context.session.person?.displayName ?? "you"}
        />
      )}
    </TeamScreen>
  );
}
