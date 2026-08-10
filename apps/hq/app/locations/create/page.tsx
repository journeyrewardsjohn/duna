import { OperatorShell } from "@/components/operator-shell";
import { VenueCreateWorkspace } from "@/components/venue-create-workspace";
import { getServerCaller } from "@/lib/api";

export const metadata = { title: "Add a venue" };

export default async function CreateLocationPage() {
  const caller = await getServerCaller();
  const [dashboard, workspace] = await Promise.all([
    caller.operator.dashboard(),
    caller.operator.workspace(),
  ]);
  return (
    <OperatorShell
      active="locations"
      messageDraftCount={workspace.messageDrafts.length}
      organization={dashboard.organization}
    >
      <VenueCreateWorkspace workspace={workspace} />
    </OperatorShell>
  );
}
