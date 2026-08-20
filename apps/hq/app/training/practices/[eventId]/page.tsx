import { notFound } from "next/navigation";
import { OperatorShell } from "@/components/operator-shell";
import { TrainingCoachMode } from "@/components/training-coach-mode";
import { getServerCaller } from "@/lib/api";

export const metadata = { title: "Coach mode" };

export default async function TrainingPracticePage({
  params,
}: {
  readonly params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const caller = await getServerCaller();
  const [dashboard, operatorWorkspace, trainingWorkspace] = await Promise.all([
    caller.operator.dashboard(),
    caller.operator.workspace(),
    caller.operator.trainingWorkspace(),
  ]);
  const event = trainingWorkspace.upcomingEvents.find(
    (candidate) => candidate.id === eventId,
  );
  const plan = event?.practicePlanId
    ? trainingWorkspace.practicePlans.find(
        (candidate) => candidate.id === event.practicePlanId,
      )
    : undefined;
  if (!event || !plan) notFound();

  return (
    <OperatorShell
      active="training"
      immersive
      messageDraftCount={operatorWorkspace.messageDrafts.length}
      organization={dashboard.organization}
    >
      <TrainingCoachMode
        drills={trainingWorkspace.drills}
        event={event}
        plan={plan}
      />
    </OperatorShell>
  );
}
