import { TrainingWorkspace } from "@/components/training-workspace";
import { OperatorShell } from "@/components/operator-shell";
import { getServerCaller } from "@/lib/api";

export const metadata = {
  title: "Training",
  description:
    "Design programs, run practices, and connect coaching work to athlete development.",
};

export default async function TrainingPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    view?: string;
    saved?: string;
    purchase?: string;
  }>;
}) {
  const params = await searchParams;
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
        initialView={params.view === "drills" ? "drills" : undefined}
        organizationName={dashboard.organization.name}
        purchaseStatus={
          params.purchase === "success" || params.purchase === "cancelled"
            ? params.purchase
            : undefined
        }
        savedDrillId={params.saved}
        workspace={trainingWorkspace}
      />
    </OperatorShell>
  );
}
