import { hqHref } from "@duna/core/hq-routes";
import { Button, Chip, EmptyState } from "@duna/ui/tideline";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageSection } from "@/components/shell/page-header";
import {
  sessionPlanWords,
  sessionWhen,
} from "@/components/training/program-model";
import { programPage } from "@/components/training/program-page";
import { loadProgramSessions } from "@/components/training/training-data";
import {
  ProgramScreen,
  TrainingBlockState,
} from "@/components/training/training-screen";

export const metadata: Metadata = { title: "Program plans" };

/**
 * A program › Plans: which practices carry a full practice plan, which
 * only a focus and estimated load, and which nothing yet, with the way to
 * plan each one.
 */
export default async function ProgramPlansPage({
  params,
}: {
  readonly params: Promise<{ programId: string }>;
}) {
  const { programId } = await params;
  const found = await programPage(programId);
  if (found.kind === "missing") notFound();
  if (found.kind === "state") return found.node;
  const { program, context, canRun } = found.page;
  const sessions = await loadProgramSessions(
    program.id,
    program.startDate,
    program.endDate,
  );
  const future =
    sessions.state === "ok"
      ? sessions.data.items.filter(
          (session) =>
            session.status !== "cancelled" && session.endsAt > context.now,
        )
      : [];
  const groups = [
    {
      id: "plan",
      title: "With a practice plan",
      rows: future.filter((session) => session.plan.mode === "plan"),
    },
    {
      id: "focus",
      title: "Focus and load only",
      rows: future.filter((session) => session.plan.mode === "focus"),
    },
    {
      id: "none",
      title: "Nothing planned yet",
      rows: future.filter((session) => session.plan.mode === "none"),
    },
  ];
  return (
    <ProgramScreen
      actions={
        context.canWrite ? (
          <Button
            href={hqHref("trainingPracticePlans")}
            size="sm"
            variant="secondary"
          >
            All practice plans
          </Button>
        ) : undefined
      }
      askStarters={[
        "Plan Thursday's practice",
        "Which practices have no plan?",
      ]}
      program={program}
      tab="plans"
    >
      {sessions.state !== "ok" ? (
        <TrainingBlockState
          loaded={sessions}
          organization={context.organization}
          what="the practices"
        />
      ) : future.length === 0 ? (
        <EmptyState
          description="Practices still to come show here with their plan or focus."
          icon="session"
          title="No practices to plan"
        />
      ) : (
        groups.map((group) =>
          group.rows.length === 0 ? null : (
            <PageSection
              aside={<Chip kind="metric">{group.rows.length}</Chip>}
              flush
              id={`plans-${group.id}`}
              key={group.id}
              title={group.title}
            >
              <ul aria-label={group.title} className="tr-rows">
                {group.rows.slice(0, 40).map((session) => (
                  <li className="tr-row" key={session.id}>
                    <div className="tr-row__main">
                      <Link
                        className="tr-row__name"
                        href={hqHref("trainingPractice", {
                          eventId: session.id,
                        })}
                      >
                        {`${sessionWhen(session)} · ${session.title}`}
                      </Link>
                      <span className="tr-quiet">
                        {sessionPlanWords(session.plan)}
                      </span>
                    </div>
                    {session.plan.mode === "plan" ? (
                      <Link
                        className="tr-link"
                        href={hqHref("trainingPracticePlan", {
                          planId: session.plan.practicePlanId,
                        })}
                      >
                        Open the plan
                      </Link>
                    ) : canRun ? (
                      <Link
                        className="tr-link"
                        href={`${hqHref("trainingPracticePlanCreate")}?session=${session.id}`}
                      >
                        Plan it
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            </PageSection>
          ),
        )
      )}
    </ProgramScreen>
  );
}
