import { ModulePanel } from "@/components/module-panels";
import { OperatorShell } from "@/components/operator-shell";
import { getServerCaller } from "@/lib/api";

export const metadata = { title: "Places and courts" };

/** Club setup › Places and courts: the venue list (was the /locations module). */
export default async function PlacesPage() {
  const caller = await getServerCaller();
  const [dashboard, workspace] = await Promise.all([
    caller.operator.dashboard(),
    caller.operator.workspace(),
  ]);
  return (
    <OperatorShell
      active="setup"
      messageDraftCount={workspace.messageDrafts.length}
      organization={dashboard.organization}
    >
      <ModulePanel
        dashboard={dashboard}
        matches={[]}
        module="places"
        ticketApprovals={[]}
        workspace={workspace}
      />
    </OperatorShell>
  );
}
