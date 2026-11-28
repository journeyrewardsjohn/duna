import { notFound } from "next/navigation";
import { OperatorShell } from "@/components/operator-shell";
import { VenueManagementWorkspace } from "@/components/venue-management-workspace";
import { getServerCaller } from "@/lib/api";

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ venueId: string }>;
}) {
  const { venueId } = await params;
  const caller = await getServerCaller();
  const workspace = await caller.operator.workspace();
  const venue = workspace.venues.find((item) => item.id === venueId);
  return { title: venue ? `${venue.name} details` : "Place details" };
}

/**
 * A place's details editor (name, story, address and map pin, arrival
 * features, photo) and its court rate plans. Still the legacy editor: the
 * place's Overview moved to the new shell (H-SETUP); this opens from its
 * "Details and pricing" tab until the address and photo fields are rebuilt.
 */
export default async function PlaceDetailsPage({
  params,
}: {
  readonly params: Promise<{ venueId: string }>;
}) {
  const { venueId } = await params;
  const caller = await getServerCaller();
  const [dashboard, workspace] = await Promise.all([
    caller.operator.dashboard(),
    caller.operator.workspace(),
  ]);
  const venue = workspace.venues.find((item) => item.id === venueId);
  if (!venue) notFound();
  return (
    <OperatorShell
      active="setup"
      messageDraftCount={workspace.messageDrafts.length}
      organization={dashboard.organization}
    >
      <VenueManagementWorkspace
        initialSection="details"
        venue={venue}
        workspace={workspace}
      />
    </OperatorShell>
  );
}
