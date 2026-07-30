import { OperatorOverview } from "@/components/operator-overview";
import { OperatorShell } from "@/components/operator-shell";
import { getServerCaller } from "@/lib/api";

export default async function HqPage() {
  const caller = await getServerCaller();
  const [dashboard, members, workspace] = await Promise.all([
    caller.operator.dashboard(),
    caller.operator.members(),
    caller.operator.workspace(),
  ]);
  return (
    <OperatorShell
      active="overview"
      messageDraftCount={workspace.messageDrafts.length}
      organization={dashboard.organization}
    >
      <OperatorOverview dashboard={dashboard} members={members} />
    </OperatorShell>
  );
}
