import { EventOverview } from "@/components/events/event-overview";
import { EventScreen, eventPage } from "@/components/events/event-screen";

/** An event › Overview: the launch steps, the numbers, and on the day what is happening now. */
export default async function EventOverviewPage({
  params,
}: {
  readonly params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const found = await eventPage(sessionId);
  if (found.kind === "state") return found.node;
  const { loaded } = found;
  return (
    <EventScreen
      askStarters={[
        "What's left before we can go live?",
        "Which teams haven't paid?",
        "Draft a reminder to the field",
      ]}
      loaded={loaded}
      tab="overview"
    >
      <EventOverview
        permissions={loaded.context.permissions}
        view={loaded.view}
      />
    </EventScreen>
  );
}
