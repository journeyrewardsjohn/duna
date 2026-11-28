import { hqHref } from "@duna/core/hq-routes";
import { Button } from "@duna/ui/tideline";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageSection } from "@/components/shell/page-header";
import {
  ProgramList,
  type ProgramRow,
  ProgramsFirstUse,
} from "@/components/training/program-list";
import {
  dateRangeWords,
  patternSentence,
  programStateCopy,
  sessionWhen,
  weekWords,
} from "@/components/training/program-model";
import {
  loadConflicts,
  loadProgram,
  loadPrograms,
  loadSessionsBetween,
  trainingContext,
} from "@/components/training/training-data";
import {
  TrainingBlockState,
  TrainingScreen,
} from "@/components/training/training-screen";

export const metadata: Metadata = { title: "Training" };

/** Programs whose detail the list reads (the rest show their summary). */
const DETAIL_LIMIT = 12;

/**
 * Training › Programs (H-TRAIN): every program as an object row, legacy
 * ones included (the backend reads them through its compatibility layer).
 * The old `?view=drills` address opens the Drill library.
 */
export default async function TrainingPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ view?: string; saved?: string }>;
}) {
  const { view, saved } = await searchParams;
  if (view === "drills") {
    redirect(
      saved
        ? hqHref("trainingDrill", { drillId: saved })
        : hqHref("trainingDrills"),
    );
  }
  const context = await trainingContext();
  const programs = context.canRead ? await loadPrograms() : undefined;
  const rows: ProgramRow[] = [];
  if (programs?.state === "ok") {
    const live = programs.data.items.filter(
      (item) => item.status === "active" || item.status === "draft",
    );
    const now = context.now;
    const soon = new Date(Date.parse(now) + 45 * 86_400_000).toISOString();
    const [details, conflicts, sessions] = await Promise.all([
      Promise.all(
        live.slice(0, DETAIL_LIMIT).map((item) => loadProgram(item.id)),
      ),
      Promise.all(
        live
          .filter((item) => item.status === "active")
          .slice(0, DETAIL_LIMIT)
          .map(
            async (item) => [item.id, await loadConflicts(item.id)] as const,
          ),
      ),
      loadSessionsBetween(now, soon),
    ]);
    const detailById = new Map(
      details.flatMap((detail) =>
        detail.state === "ok" ? [[detail.data.id, detail.data] as const] : [],
      ),
    );
    const openById = new Map(
      conflicts.map(([id, loaded]) => [
        id,
        loaded.state === "ok"
          ? loaded.data.items.filter((item) => item.status === "open").length
          : 0,
      ]),
    );
    const order = {
      active: 0,
      draft: 1,
      completed: 2,
      archived: 3,
      cancelled: 4,
    };
    for (const item of [...programs.data.items].sort(
      (a, b) =>
        order[a.status] - order[b.status] ||
        a.startDate.localeCompare(b.startDate),
    )) {
      const detail = detailById.get(item.id);
      const next =
        sessions.state === "ok"
          ? sessions.data.items.find(
              (session) =>
                session.programId === item.id &&
                session.status !== "cancelled" &&
                session.startsAt > now,
            )
          : undefined;
      rows.push({
        id: item.id,
        title: item.title,
        status: item.status,
        state: programStateCopy(item.status),
        ...(detail?.targetAudience ? { who: detail.targetAudience } : {}),
        dates: dateRangeWords(item.startDate, item.endDate),
        ...(detail ? { pattern: patternSentence(detail.weeklySlots) } : {}),
        ...(detail && detail.coaches.length > 0
          ? {
              coaches: detail.coaches
                .map((coach) =>
                  coach.role === "lead"
                    ? `${coach.displayName} (lead)`
                    : coach.displayName,
                )
                .join(", "),
            }
          : item.leadCoach
            ? { coaches: `${item.leadCoach.displayName} (lead)` }
            : {}),
        week: weekWords(item),
        ...(next ? { nextPractice: sessionWhen(next) } : {}),
        openConflicts: openById.get(item.id) ?? 0,
        legacy: false,
      });
    }
  }
  return (
    <TrainingScreen
      actions={
        context.canManage ? (
          <Button
            href={hqHref("trainingProgramCreate")}
            size="sm"
            variant="primary"
          >
            New program
          </Button>
        ) : undefined
      }
      askLabel="Training programs"
      askStarters={[
        "Which practices this week have no plan yet?",
        "Start a U14 program on Tuesdays and Thursdays",
      ]}
      description="Seasons and blocks your club runs: the weekly pattern, dates off, coaches and every practice."
      tab="programs"
      title="Training"
    >
      <PageSection flush id="programs" title="Programs">
        {programs === undefined ? null : programs.state !== "ok" ? (
          <TrainingBlockState
            loaded={programs}
            organization={context.organization}
            what="the programs"
          />
        ) : rows.length === 0 ? (
          <ProgramsFirstUse canManage={context.canManage} />
        ) : (
          <ProgramList rows={rows} />
        )}
      </PageSection>
    </TrainingScreen>
  );
}
