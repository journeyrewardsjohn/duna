import { TrainingWorkspace } from "@/components/training-workspace";
import { OperatorShell } from "@/components/operator-shell";
import { getServerCaller } from "@/lib/api";

export const metadata = {
  title: "Training",
  description:
    "Design programs, run practices, and connect coaching work to athlete development.",
};

export default async function TrainingPage() {
  const caller = await getServerCaller();
  const [dashboard, operatorWorkspace, trainingWorkspace] = await Promise.all([
    caller.operator.dashboard(),
    caller.operator.workspace(),
    caller.operator.trainingWorkspace(),
  ]);

  return (
    <OperatorShell
      active="training"
      messageDraftCount={operatorWorkspace.messageDrafts.length}
      organization={dashboard.organization}
    >
      <TrainingWorkspace
        organizationName={dashboard.organization.name}
        workspace={trainingWorkspace}
      />
    </OperatorShell>
  );
}
