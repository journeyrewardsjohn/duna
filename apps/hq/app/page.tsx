import { OperatorOverview } from "@/components/operator-overview";
import { OperatorShell } from "@/components/operator-shell";
import { getServerCaller } from "@/lib/api";

export default async function HqPage() {
  const caller = await getServerCaller();
  const [dashboard, members, workspace, matches] = await Promise.all([
    caller.operator.dashboard(),
    caller.operator.members(),
    caller.operator.workspace(),
    process.env.DATABASE_URL
      ? caller.operator.scorableMatches()
      : Promise.resolve([]),
  ]);
  return (
    <OperatorShell
      active="overview"
      messageDraftCount={workspace.messageDrafts.length}
      organization={dashboard.organization}
    >
      <OperatorOverview
        dashboard={dashboard}
        matches={matches}
        members={members}
      />
    </OperatorShell>
  );
}
