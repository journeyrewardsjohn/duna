import { hqHref } from "@duna/core/hq-routes";
import { Chip, EmptyState } from "@duna/ui/tideline";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageSection } from "@/components/shell/page-header";
import { AddSession } from "@/components/training/program-actions";
import {
  dateWords,
  sessionKindLabels,
  sessionPlanWords,
  sessionsByWeek,
  sessionStateCopy,
  sessionWhen,
} from "@/components/training/program-model";
import { programPage } from "@/components/training/program-page";
import { loadProgramSessions } from "@/components/training/training-data";
import {
  ProgramScreen,
  TrainingBlockState,
} from "@/components/training/training-screen";

export const metadata: Metadata = { title: "Program calendar" };

/**
 * A program › Calendar (TR-Schedule): every practice and event of the
 * season by week, with its focus and estimated load at a glance. A
 * practice opens to change its coaches, attach a plan, cancel it or record
 * what happened.
 */
export default async function ProgramCalendarPage({
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
  const weeks =
    sessions.state === "ok" ? sessionsByWeek(sessions.data.items) : [];
  const editable =
    canRun && (program.status === "active" || program.status === "draft");
  return (
    <ProgramScreen
      askStarters={[
        "Which practices need cover?",
        "Move Saturday's practice to Sunday",
      ]}
      counts={{
        calendar:
          sessions.state === "ok" ? sessions.data.items.length : undefined,
      }}
      program={program}
      tab="calendar"
    >
      {editable ? (
        <div className="tr-toolbar">
          <AddSession program={program} />
        </div>
      ) : null}
      {sessions.state !== "ok" ? (
        <TrainingBlockState
          loaded={sessions}
          organization={context.organization}
          what="the practices"
        />
      ) : weeks.length === 0 ? (
        <EmptyState
          description={
            program.status === "draft"
              ? "Activate the program to put its practices on the calendar."
              : "Add a practice, tournament or travel day."
          }
          icon="calendar"
          title="Nothing on the calendar yet"
        />
      ) : (
        weeks.map((week) => (
          <PageSection
            flush
            id={`week-${week.weekOf}`}
            key={week.weekOf}
            title={`Week of ${dateWords(week.weekOf)}`}
          >
            <ul
              aria-label={`Week of ${dateWords(week.weekOf)}`}
              className="tr-rows"
            >
              {week.sessions.map((session) => {
                const state = sessionStateCopy(session.status);
                return (
                  <li
                    className="tr-row"
                    data-cancelled={session.status === "cancelled" || undefined}
                    key={session.id}
                  >
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
                        {session.status === "cancelled"
                          ? `Cancelled${session.cancellation ? `: ${session.cancellation.reason}` : ""}`
                          : sessionPlanWords(session.plan)}
                      </span>
                      <span className="tr-quiet">
                        {session.coaches.length === 0
                          ? "No coach yet"
                          : session.coaches
                              .map((coach) => coach.displayName)
                              .join(", ")}
                      </span>
                    </div>
                    <span className="tr-row__chips">
                      {session.kind !== "practice" ? (
                        <Chip kind="taxonomy">
                          {sessionKindLabels[session.kind]}
                        </Chip>
                      ) : null}
                      {session.needsCover ? (
                        <Chip tone="attention">Needs cover</Chip>
                      ) : null}
                      <Chip tone={state.tone}>{state.label}</Chip>
                    </span>
                  </li>
                );
              })}
            </ul>
          </PageSection>
        ))
      )}
    </ProgramScreen>
  );
}
