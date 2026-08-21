import { notFound } from "next/navigation";
import { OperatorShell } from "@/components/operator-shell";
import { TrainingProgramDetail } from "@/components/training-detail-workspaces";
import { getServerCaller } from "@/lib/api";

export const metadata = { title: "Training program" };

export default async function TrainingProgramPage({
  params,
}: {
  readonly params: Promise<{ programId: string }>;
}) {
  const { programId } = await params;
  const caller = await getServerCaller();
  const [dashboard, operatorWorkspace, trainingWorkspace, discovery] =
    await Promise.all([
      caller.operator.dashboard(),
      caller.operator.workspace(),
      caller.operator.trainingWorkspace(),
      caller.public.discoveryMap().catch(() => ({
        generatedAt: new Date().toISOString(),
        items: [],
      })),
    ]);
  const program = trainingWorkspace.programs.find(
    (candidate) => candidate.id === programId,
  );
  if (!program) notFound();
  const [events, versions] = await Promise.all([
    caller.operator.trainingProgramEvents({ programId }),
    caller.operator.trainingProgramVersions({ programId }),
  ]);
  return (
    <OperatorShell
      active="training"
      immersive
      immersiveScrollable
      messageDraftCount={operatorWorkspace.messageDrafts.length}
      organization={dashboard.organization}
    >
      <TrainingProgramDetail
        events={events}
        program={program}
        tournamentCandidates={discovery.items
          .filter(
            (item) =>
              (item.entityType === "event" && item.kind === "tournament") ||
              item.entityType === "pro-tour",
          )
          .map((item) => ({
            id: item.id,
            title: item.title,
            subtitle: item.subtitle,
            href: item.href,
            startsAt: item.startsAt,
            endsAt: item.endsAt,
            professional: item.entityType === "pro-tour",
          }))}
        versions={versions}
        workspace={trainingWorkspace}
      />
    </OperatorShell>
  );
}
