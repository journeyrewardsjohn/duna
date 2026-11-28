import { EventEntries } from "@/components/events/event-entries";
import { EventScreen, eventPage } from "@/components/events/event-screen";

/** An event › Divisions and entries: the field, the waitlist and check-in. */
export default async function EventEntriesPage({
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
        "Who is on the waitlist?",
        "Which teams still owe money?",
        "Who hasn't checked in?",
      ]}
      loaded={loaded}
      tab="entries"
    >
      <EventEntries
        permissions={loaded.context.permissions}
        view={loaded.view}
      />
    </EventScreen>
  );
}
