import type { Metadata } from "next";
import { EventBuilder } from "@/components/event-builder";
import { OperatorShell } from "@/components/operator-shell";
import { getServerCaller } from "@/lib/api";

export const metadata: Metadata = {
  title: "Event studio",
  description: "Create or edit a tournament or league in one guided Duna flow.",
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
    draft?: string;
  }>;
}) {
  const { type, title, summary, venue, starts, draft } = await searchParams;
  const caller = await getServerCaller();
  const draftId =
    draft &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      draft,
    )
      ? draft
      : undefined;
  const [dashboard, workspace, eventDraft] = await Promise.all([
    caller.operator.dashboard(),
    caller.operator.workspace(),
    draftId
      ? caller.operator.eventDraft({ sessionId: draftId })
      : Promise.resolve(undefined),
  ]);

  return (
    <OperatorShell
      active={(eventDraft?.kind ?? type) === "league" ? "leagues" : "events"}
      messageDraftCount={workspace.messageDrafts.length}
      organization={dashboard.organization}
    >
      <EventBuilder
        initialDraft={eventDraft}
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
