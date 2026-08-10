import { notFound } from "next/navigation";
import { CourtManagementWorkspace } from "@/components/court-management-workspace";
import { OperatorShell } from "@/components/operator-shell";
import { getServerCaller } from "@/lib/api";

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ venueId: string; courtId: string }>;
}) {
  const { venueId, courtId } = await params;
  const caller = await getServerCaller();
  const workspace = await caller.operator.workspace();
  const court = workspace.venues
    .find((venue) => venue.id === venueId)
    ?.courts.find((item) => item.id === courtId);
  return { title: court?.name ?? "Court" };
}

export default async function CourtManagementPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ venueId: string; courtId: string }>;
  readonly searchParams: Promise<{ created?: string }>;
}) {
  const { venueId, courtId } = await params;
  const query = await searchParams;
  const caller = await getServerCaller();
  const [dashboard, workspace] = await Promise.all([
    caller.operator.dashboard(),
    caller.operator.workspace(),
  ]);
  const venue = workspace.venues.find((item) => item.id === venueId);
  const court = venue?.courts.find((item) => item.id === courtId);
  if (!venue || !court) notFound();
  return (
    <OperatorShell
      active="locations"
      messageDraftCount={workspace.messageDrafts.length}
      organization={dashboard.organization}
    >
      <CourtManagementWorkspace
        court={court}
        created={query.created === "true"}
        venue={venue}
        workspace={workspace}
      />
    </OperatorShell>
  );
}
