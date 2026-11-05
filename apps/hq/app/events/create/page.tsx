import { HqCreationFlow } from "@duna/ui";
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
  const [dashboard, workspace, eventDraft, waivers] = await Promise.all([
    caller.operator.dashboard(),
    caller.operator.workspace(),
    draftId
      ? caller.operator.eventDraft({ sessionId: draftId })
      : Promise.resolve(undefined),
    caller.operator.waiverWorkspace(),
  ]);

  return (
    <OperatorShell
      active={(eventDraft?.kind ?? type) === "league" ? "leagues" : "events"}
      messageDraftCount={workspace.messageDrafts.length}
      organization={dashboard.organization}
    >
      <HqCreationFlow
        key={JSON.stringify([
          dashboard.organization.id,
          draftId,
          type,
          title,
          summary,
          venue,
          starts,
        ])}
        title={type === "league" ? "Create league" : "Create event"}
        noun={type === "league" ? "league" : "event"}
        backHref={type === "league" ? "/leagues" : "/events"}
        backLabel={type === "league" ? "Leagues" : "Events"}
        initialManual={Boolean(
          eventDraft || title || summary || venue || starts,
        )}
        examples={[
          "Plan a doubles tournament with two divisions and a waitlist.",
          "Set up a weekly league using our available courts.",
        ]}
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
          waivers={waivers}
          workspace={workspace}
        />
      </HqCreationFlow>
    </OperatorShell>
  );
}
