import { hqHref } from "@duna/core/hq-routes";
import { localMinuteOf } from "@duna/scheduling";
import { Button, Chip } from "@duna/ui/tideline";
import { notFound } from "next/navigation";
import { PageSection } from "@/components/shell/page-header";
import {
  AfterPractice,
  CancelPractice,
  RunPlan,
  SessionCoaches,
  SessionPlan,
} from "@/components/training/practice-actions";
import {
  sessionKindLabels,
  sessionStateCopy,
  sessionWhen,
} from "@/components/training/program-model";
import {
  canRunProgram,
  coachVerdicts,
  loadCoaches,
  loadConflicts,
  loadOutcome,
  loadPracticePlan,
  loadPracticePlans,
  loadProgram,
  loadSessionsBetween,
  trainingContext,
} from "@/components/training/training-data";
import {
  deniedScreen,
  TrainingBlockState,
  TrainingScreen,
} from "@/components/training/training-screen";

const DAY = 86_400_000;

/**
 * One practice or event: when, who coaches it (with the availability
 * rule's verdict), what it runs (a plan, a focus and load, or nothing),
 * coach mode for the plan, cancelling it honestly, and the after-practice
 * record. Front desk reads; the program's coaches and managers act.
 */
export default async function PracticePage({
  params,
}: {
  readonly params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const context = await trainingContext();
  if (context.session.access !== "operator") return null;
  if (!context.canRead) return deniedScreen(context, "Training", "Practice");
  const now = Date.parse(context.now);
  const sessions = await loadSessionsBetween(
    new Date(now - 199 * DAY).toISOString(),
    new Date(now + 199 * DAY).toISOString(),
  );
  if (sessions.state !== "ok") {
    return (
      <TrainingScreen
        askLabel="Practice"
        askStarters={[]}
        tab="programs"
        title="Practice"
      >
        <TrainingBlockState
          loaded={sessions}
          organization={context.organization}
          what="this practice"
        />
      </TrainingScreen>
    );
  }
  const session = sessions.data.items.find((row) => row.id === eventId);
  if (!session) notFound();
  const [program, conflicts, coaches, plans, outcome, plan] = await Promise.all(
    [
      session.programId ? loadProgram(session.programId) : undefined,
      session.programId ? loadConflicts(session.programId) : undefined,
      loadCoaches(),
      context.canWrite ? loadPracticePlans() : undefined,
      session.startsAt <= context.now || session.status === "completed"
        ? loadOutcome(session.id)
        : undefined,
      session.plan.mode === "plan" && context.canWrite
        ? loadPracticePlan(session.plan.practicePlanId)
        : undefined,
    ],
  );
  const canRun =
    program?.state === "ok"
      ? canRunProgram(context, program.data)
      : context.canManage;
  const verdicts = canRun ? await coachVerdicts(session, coaches) : [];
  const conflict =
    conflicts?.state === "ok"
      ? conflicts.data.items.find(
          (item) => item.sessionId === session.id && item.status === "open",
        )
      : undefined;
  const state = sessionStateCopy(session.status);
  const minute = localMinuteOf(Date.parse(session.startsAt), session.timezone);
  const clock = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
  const backHref = session.programId
    ? hqHref("trainingProgramCalendar", { programId: session.programId })
    : hqHref("training");
  const programTitle =
    program?.state === "ok" ? program.data.title : "Programs";
  return (
    <TrainingScreen
      actions={
        plan?.state === "ok" ? (
          <Button
            href={hqHref("trainingPracticePlanPrint", { planId: plan.data.id })}
            size="sm"
            variant="secondary"
          >
            Print the plan
          </Button>
        ) : undefined
      }
      askLabel={`${session.title}, ${sessionWhen(session)} (practice)`}
      askStarters={["Plan this practice", "Who can cover this practice?"]}
      back={{ href: backHref, label: programTitle }}
      crumb={session.title}
      description={`${sessionWhen(session)} · ${sessionKindLabels[session.kind]} · ${session.athleteCount} athletes`}
      parentHref={backHref}
      tab="programs"
      title={session.title}
    >
      <p className="tr-chips">
        <Chip tone={state.tone}>{state.label}</Chip>
        {conflict ? <Chip tone="attention">{conflict.description}</Chip> : null}
      </p>
      {session.status === "cancelled" && session.cancellation ? (
        <p className="tr-note">{`Cancelled: ${session.cancellation.reason}`}</p>
      ) : null}
      <div className="tr-grid2">
        <PageSection id="coaches" title="Coaches">
          <SessionCoaches
            canEdit={canRun}
            conflict={conflict}
            programId={session.programId}
            session={session}
            verdicts={verdicts}
          />
        </PageSection>
        <PageSection id="plan" title="What it runs">
          <SessionPlan
            canEdit={canRun}
            plans={
              plans?.state === "ok"
                ? plans.data.items
                    .filter((item) => item.status !== "archived")
                    .map((item) => ({
                      id: item.id,
                      title: item.title,
                      status: item.status,
                    }))
                : []
            }
            session={session}
          />
        </PageSection>
      </div>
      {plan?.state === "ok" && session.status !== "cancelled" ? (
        <PageSection id="coach-mode" title="Coach mode">
          <RunPlan plan={plan.data} startsAt={clock} />
        </PageSection>
      ) : null}
      {outcome ? (
        <PageSection id="after" title="After practice">
          {outcome.state === "ok" ? (
            <AfterPractice canRecord={canRun} outcome={outcome.data} />
          ) : (
            <TrainingBlockState
              loaded={outcome}
              organization={context.organization}
              what="the after-practice record"
            />
          )}
        </PageSection>
      ) : null}
      {canRun &&
      (session.status === "planned" || session.status === "ready") ? (
        <PageSection id="cancel" title="Cancel">
          <CancelPractice session={session} />
        </PageSection>
      ) : null}
    </TrainingScreen>
  );
}
