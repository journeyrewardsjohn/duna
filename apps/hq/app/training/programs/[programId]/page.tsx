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
  const [dashboard, operatorWorkspace, trainingWorkspace] = await Promise.all([
    caller.operator.dashboard(),
    caller.operator.workspace(),
    caller.operator.trainingWorkspace(),
  ]);
  const program = trainingWorkspace.programs.find(
    (candidate) => candidate.id === programId,
  );
  if (!program) notFound();
  const events = trainingWorkspace.upcomingEvents.filter(
    (event) => event.programId === program.id,
  );
  return (
    <OperatorShell
      active="training"
      immersive
      messageDraftCount={operatorWorkspace.messageDrafts.length}
      organization={dashboard.organization}
    >
      <TrainingProgramDetail
        events={events}
        program={program}
        workspace={trainingWorkspace}
      />
    </OperatorShell>
  );
}
