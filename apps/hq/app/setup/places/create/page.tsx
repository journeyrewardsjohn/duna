import { HqCreationFlow } from "@duna/ui";
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
      <HqCreationFlow
        key={dashboard.organization.id}
        title="Add venue"
        noun="venue"
        backHref="/locations"
        backLabel="Venues"
        examples={[
          "Help me add a venue with two outdoor sand courts.",
          "Set up a temporary location for a weekend tournament.",
        ]}
      >
        <VenueCreateWorkspace workspace={workspace} />
      </HqCreationFlow>
    </OperatorShell>
  );
}
