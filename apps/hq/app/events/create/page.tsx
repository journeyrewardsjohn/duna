import type { Metadata } from "next";
import { EventBuilder } from "@/components/event-builder";
import { OperatorShell } from "@/components/operator-shell";
import { getServerCaller } from "@/lib/api";

export const metadata: Metadata = {
  title: "Create event",
  description: "Build a tournament or league in one guided Duna flow.",
};

export default async function CreateEventPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    type?: string;
    title?: string;
    summary?: string;
    venue?: string;
    starts?: string;
  }>;
}) {
  const { type, title, summary, venue, starts } = await searchParams;
  const caller = await getServerCaller();
  const [dashboard, workspace] = await Promise.all([
    caller.operator.dashboard(),
    caller.operator.workspace(),
  ]);

  return (
    <OperatorShell
      active={type === "league" ? "leagues" : "events"}
      messageDraftCount={workspace.messageDrafts.length}
      organization={dashboard.organization}
    >
      <EventBuilder
        initialKind={type === "league" ? "league" : "tournament"}
        initialStartsAt={
          starts && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(starts)
            ? starts
            : undefined
        }
        initialSummary={summary?.slice(0, 180)}
        initialTitle={title?.slice(0, 140)}
        initialVenueName={venue?.slice(0, 180)}
        workspace={workspace}
      />
    </OperatorShell>
  );
}
