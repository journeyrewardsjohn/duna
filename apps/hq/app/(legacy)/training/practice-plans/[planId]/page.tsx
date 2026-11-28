import { notFound } from "next/navigation";
import { OperatorShell } from "@/components/operator-shell";
import { TrainingPracticePlanDetail } from "@/components/training-detail-workspaces";
import { getServerCaller } from "@/lib/api";

export const metadata = { title: "Practice plan" };

export default async function PracticePlanPage({
  params,
}: {
  readonly params: Promise<{ planId: string }>;
}) {
  const { planId } = await params;
  const caller = await getServerCaller();
  const [dashboard, operatorWorkspace, trainingWorkspace] = await Promise.all([
    caller.operator.dashboard(),
    caller.operator.workspace(),
    caller.operator.trainingWorkspace(),
  ]);
  const plan = trainingWorkspace.practicePlans.find(
    (candidate) => candidate.id === planId,
  );
  if (!plan) notFound();
  const versions = await caller.operator.trainingPracticePlanVersions({
    practicePlanId: planId,
  });
  return (
    <OperatorShell
      active="training"
      immersive
      messageDraftCount={operatorWorkspace.messageDrafts.length}
      organization={dashboard.organization}
    >
      <TrainingPracticePlanDetail plan={plan} versions={versions} />
    </OperatorShell>
  );
}
