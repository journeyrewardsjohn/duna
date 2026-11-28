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
  return { title: venue?.name ?? "Venue" };
}

export default async function VenueManagementPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ venueId: string }>;
  readonly searchParams: Promise<{ created?: string; section?: string }>;
}) {
  const { venueId } = await params;
  const query = await searchParams;
  const caller = await getServerCaller();
  const [dashboard, workspace] = await Promise.all([
    caller.operator.dashboard(),
    caller.operator.workspace(),
  ]);
  const venue = workspace.venues.find((item) => item.id === venueId);
  if (!venue) notFound();
  const initialSection =
    query.section === "details" || query.section === "courts"
      ? query.section
      : "overview";
  return (
    <OperatorShell
      active="locations"
      messageDraftCount={workspace.messageDrafts.length}
      organization={dashboard.organization}
    >
      <VenueManagementWorkspace
        created={query.created === "true"}
        initialSection={initialSection}
        venue={venue}
        workspace={workspace}
      />
    </OperatorShell>
  );
}
