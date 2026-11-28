import { hqHref } from "@duna/core/hq-routes";
import { Button, Chip } from "@duna/ui/tideline";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageSection } from "@/components/shell/page-header";
import {
  ActivateProgram,
  ConflictList,
} from "@/components/training/program-actions";
import {
  activationWords,
  exceptionKindLabels,
  exceptionWords,
  phaseLabels,
  sessionPlanWords,
  sessionWhen,
} from "@/components/training/program-model";
import { InsightsSection } from "@/components/training/insights-section";
import { programPage } from "@/components/training/program-page";
import {
  loadCoaches,
  loadConflicts,
  loadProgramSessions,
  loadTrainingInsights,
} from "@/components/training/training-data";
import {
  ProgramScreen,
  TrainingBlockState,
} from "@/components/training/training-screen";

export const metadata: Metadata = { title: "Program" };

/**
 * A program › Overview (TR-Program): the season at a glance (planned load
 * by week, an estimate), what's coming up, the conflicts that need a
 * decision, coaches and dates off. Activate sits behind a confirmation that
 * states what it creates.
 */
export default async function ProgramOverviewPage({
  params,
}: {
  readonly params: Promise<{ programId: string }>;
}) {
  const { programId } = await params;
  const found = await programPage(programId);
  if (found.kind === "missing") notFound();
  if (found.kind === "state") return found.node;
  const { program, context, canRun } = found.page;
  const [sessions, conflicts, coaches, insights] = await Promise.all([
    loadProgramSessions(program.id, program.startDate, program.endDate),
    loadConflicts(program.id),
    loadCoaches(),
    loadTrainingInsights(),
  ]);
  const upcoming =
    sessions.state === "ok"
      ? sessions.data.items
          .filter(
            (session) =>
              session.startsAt > context.now && session.status !== "cancelled",
          )
          .slice(0, 5)
      : [];
  const activation = activationWords({ program, now: context.now });
  const maxLoad = Math.max(1, ...program.weeks.map((week) => week.plannedLoad));
  const openConflicts =
    conflicts.state === "ok"
      ? conflicts.data.items.filter((item) => item.status === "open").length
      : 0;
  return (
    <ProgramScreen
      actions={
        program.status === "draft" && context.canManage ? (
          <ActivateProgram
            count={activation.count}
            programId={program.id}
            sentence={activation.sentence}
            title={program.title}
          />
        ) : canRun && program.status === "active" ? (
          <Button
            href={hqHref("trainingProgramCalendar", { programId: program.id })}
            size="sm"
            variant="secondary"
          >
            Open the calendar
          </Button>
        ) : undefined
      }
      askStarters={[
        `Which ${program.title} practices have no plan yet?`,
        "Plan Thursday's practice",
      ]}
      counts={{ calendar: program.counts.practices }}
      program={program}
      tab="overview"
    >
      {program.status === "cancelled" && program.cancellation ? (
        <p className="tr-note">{`Cancelled: ${program.cancellation.reason}`}</p>
      ) : null}
      <dl aria-label={`${program.title} at a glance`} className="tr-figures">
        <div className="tr-figure">
          <dt>Weeks</dt>
          <dd>{program.counts.weeks}</dd>
          <span className="tr-quiet">{`${program.counts.weeksOff} off`}</span>
        </div>
        <div className="tr-figure">
          <dt>Practices</dt>
          <dd>{program.counts.practices}</dd>
          <span className="tr-quiet">
            {program.status === "draft"
              ? `${activation.count} on activation`
              : "on the calendar"}
          </span>
        </div>
        <div className="tr-figure">
          <dt>Dates off</dt>
          <dd>{program.exceptions.length}</dd>
          <span className="tr-quiet">Breaks, tournaments, travel</span>
        </div>
        <div className="tr-figure">
          <dt>Plans attached</dt>
          <dd>{program.counts.plansAttached}</dd>
          <span className="tr-quiet">
            The rest: focus and load, or nothing yet
          </span>
        </div>
      </dl>

      {program.weeks.length > 0 ? (
        <PageSection
          aside={<span className="tr-quiet">Planned load is an estimate</span>}
          id="season"
          title="The season at a glance"
        >
          <ol
            aria-label="Planned load by week (estimates)"
            className="tr-weeks"
          >
            {program.weeks.map((week) => (
              <li className="tr-week" key={week.weekNumber}>
                <span
                  aria-hidden="true"
                  className="tr-week__bar"
                  data-phase={week.phase}
                  style={{
                    blockSize: `${Math.max(4, (week.plannedLoad / maxLoad) * 100)}%`,
                  }}
                />
                <span className="tr-week__load">
                  {week.plannedLoad > 0 ? week.plannedLoad : "–"}
                </span>
                <span className="tr-week__label">{`Week ${week.weekNumber}`}</span>
                <span className="tr-week__phase">
                  {phaseLabels[week.phase]}
                </span>
                <span className="tr-sr">
                  {`Week ${week.weekNumber}, ${phaseLabels[week.phase]}, planned load ${week.plannedLoad}`}
                </span>
              </li>
            ))}
          </ol>
        </PageSection>
      ) : null}

      <div className="tr-grid2">
        <PageSection
          aside={
            <Link
              className="tr-link"
              href={hqHref("trainingProgramCalendar", {
                programId: program.id,
              })}
            >
              Calendar
            </Link>
          }
          flush
          id="coming-up"
          title="Coming up"
        >
          {sessions.state !== "ok" ? (
            <TrainingBlockState
              loaded={sessions}
              organization={context.organization}
              what="the practices"
            />
          ) : upcoming.length === 0 ? (
            <p className="tr-quiet">
              {program.status === "draft"
                ? "Practices are created when the program is activated."
                : "Nothing coming up."}
            </p>
          ) : (
            <ul aria-label="Coming up" className="tr-rows">
              {upcoming.map((session) => (
                <li className="tr-row" key={session.id}>
                  <div className="tr-row__main">
                    <Link
                      className="tr-row__name"
                      href={hqHref("trainingPractice", { eventId: session.id })}
                    >
                      {sessionWhen(session)}
                    </Link>
                    <span className="tr-quiet">
                      {sessionPlanWords(session.plan)}
                    </span>
                  </div>
                  {session.needsCover ? (
                    <Chip tone="attention">Needs cover</Chip>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </PageSection>
        <PageSection flush id="coaches" title="Coaches">
          {program.coaches.length === 0 ? (
            <p className="tr-quiet">No coach yet. Add one in Settings.</p>
          ) : (
            <ul aria-label="Coaches" className="tr-rows">
              {program.coaches.map((coach) => (
                <li className="tr-row" key={coach.personId}>
                  <div className="tr-row__main">
                    <span className="tr-row__name">{coach.displayName}</span>
                    <span className="tr-quiet">
                      {coach.role === "lead" ? "Lead" : "Assistant"}
                      {coach.weekdays.length === 0
                        ? " · all practices"
                        : ` · ${coach.weekdays
                            .map(
                              (day) =>
                                [
                                  "Sun",
                                  "Mon",
                                  "Tue",
                                  "Wed",
                                  "Thu",
                                  "Fri",
                                  "Sat",
                                ][day],
                            )
                            .join(", ")}`}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </PageSection>
      </div>

      <PageSection
        aside={
          openConflicts > 0 ? (
            <Chip tone="attention">{`${openConflicts} to decide`}</Chip>
          ) : undefined
        }
        id="conflicts"
        title="Conflicts"
      >
        {conflicts.state !== "ok" ? (
          <TrainingBlockState
            loaded={conflicts}
            organization={context.organization}
            what="the conflicts"
          />
        ) : (
          <ConflictList
            canResolve={canRun}
            coaches={coaches}
            conflicts={conflicts.data.items}
            programId={program.id}
            sessions={sessions.state === "ok" ? sessions.data.items : []}
          />
        )}
      </PageSection>

      <PageSection flush id="dates-off" title="Dates off">
        {program.exceptions.length === 0 ? (
          <p className="tr-quiet">No breaks, tournaments or travel.</p>
        ) : (
          <ul aria-label="Dates off" className="tr-rows">
            {program.exceptions.map((exception) => (
              <li className="tr-row" key={exception.id}>
                <div className="tr-row__main">
                  <span className="tr-row__name">{exception.label}</span>
                  <span className="tr-quiet">{exceptionWords(exception)}</span>
                </div>
                <Chip kind="taxonomy">
                  {exceptionKindLabels[exception.kind]}
                </Chip>
              </li>
            ))}
          </ul>
        )}
      </PageSection>
      <PageSection
        aside={<span className="tr-quiet">Across the club</span>}
        id="insights"
        title="Insights"
      >
        {insights.state === "ok" ? (
          <InsightsSection insights={insights.data} />
        ) : (
          <TrainingBlockState
            loaded={insights}
            organization={context.organization}
            what="the training insights"
          />
        )}
      </PageSection>
    </ProgramScreen>
  );
}
