import { notFound } from "next/navigation";
import { ActivityOperationsWorkspace } from "@/components/activity-operations-workspace";
import { OperatorShell } from "@/components/operator-shell";
import { getServerCaller } from "@/lib/api";

export const metadata = { title: "Match operations" };

export default async function MatchOperationsPage({
  params,
}: {
  readonly params: Promise<{ activityId: string }>;
}) {
  const { activityId } = await params;
  const caller = await getServerCaller();
  try {
    const [dashboard, workspace, detail] = await Promise.all([
      caller.operator.dashboard(),
      caller.operator.workspace(),
      caller.operator.activityDetail({ activityType: "pickup", activityId }),
    ]);
    return (
      <OperatorShell
        active="events"
        messageDraftCount={workspace.messageDrafts.length}
        organization={dashboard.organization}
      >
        <ActivityOperationsWorkspace detail={detail} />
      </OperatorShell>
    );
  } catch {
    notFound();
  }
}
