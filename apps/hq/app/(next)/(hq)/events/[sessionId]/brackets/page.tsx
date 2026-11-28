import { redirect } from "next/navigation";
import { EventBrackets } from "@/components/events/event-brackets";
import { EventScreen, eventPage } from "@/components/events/event-screen";

/** An event › Brackets and results: pools, standings and the bracket. */
export default async function EventBracketsPage({
  params,
}: {
  readonly params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const found = await eventPage(sessionId);
  if (found.kind === "state") return found.node;
  const { loaded } = found;
  if (!loaded.view.competition) redirect(`/events/${sessionId}`);
  return (
    <EventScreen
      askStarters={["Who is leading each pool?", "Who plays in the final?"]}
      loaded={loaded}
      tab="brackets"
    >
      <EventBrackets
        permissions={loaded.context.permissions}
        view={loaded.view}
      />
    </EventScreen>
  );
}
