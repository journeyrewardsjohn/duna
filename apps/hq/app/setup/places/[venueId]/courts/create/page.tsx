import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CourtComposer } from "@/components/operator-controls";
import { OperatorShell } from "@/components/operator-shell";
import { getServerCaller } from "@/lib/api";

export const metadata = { title: "Add a court" };

export default async function CreateCourtPage({
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
      active="locations"
      messageDraftCount={workspace.messageDrafts.length}
      organization={dashboard.organization}
    >
      <main className="hq-page court-create-page">
        <header className="court-create-page__header">
          <Link
            aria-label={`Back to ${venue.name}`}
            className="venue-workspace-back"
            href={`/locations/${venue.id}?section=courts`}
          >
            <ArrowLeft aria-hidden size={19} />
          </Link>
          <div>
            <span className="hq-eyebrow">{venue.name} · court setup</span>
            <h1>Add a court.</h1>
            <p>
              Create one playable resource at a time. After saving, its full
              details, weekly availability, pricing, and cancellation rules live
              in a dedicated workspace.
            </p>
          </div>
        </header>
        <CourtComposer
          redirectVenueId={venue.id}
          workspace={{ ...workspace, venues: [venue] }}
        />
      </main>
    </OperatorShell>
  );
}
