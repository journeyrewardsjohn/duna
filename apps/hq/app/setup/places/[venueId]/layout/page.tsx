import { notFound } from "next/navigation";
import { OperatorShell } from "@/components/operator-shell";
import { VenueLayoutStudio } from "@/components/venue-layout-studio";
import { getServerCaller } from "@/lib/api";

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ venueId: string }>;
}) {
  const { venueId } = await params;
  const caller = await getServerCaller();
  const workspace = await caller.operator.venueLayoutWorkspace({ venueId });
  return { title: `${workspace.venue.name} layout` };
}

export default async function VenueLayoutPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ venueId: string }>;
  readonly searchParams: Promise<{ layout?: string }>;
}) {
  const { venueId } = await params;
  const query = await searchParams;
  const caller = await getServerCaller();
  const [dashboard, operatorWorkspace, layoutWorkspace] = await Promise.all([
    caller.operator.dashboard(),
    caller.operator.workspace(),
    caller.operator.venueLayoutWorkspace({ venueId }),
  ]);
  if (layoutWorkspace.venue.id !== venueId) notFound();
  return (
    <OperatorShell
      active="locations"
      immersive={layoutWorkspace.layouts.length > 0}
      messageDraftCount={operatorWorkspace.messageDrafts.length}
      organization={dashboard.organization}
    >
      <VenueLayoutStudio
        initialLayoutId={query.layout}
        organizationId={operatorWorkspace.organization.id}
        workspace={layoutWorkspace}
      />
    </OperatorShell>
  );
}
