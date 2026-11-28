import { redirect } from "next/navigation";
import { EventSchedule } from "@/components/events/event-schedule";
import { EventScreen, eventPage } from "@/components/events/event-screen";

/** An event › Schedule and courts: every match by court and time. */
export default async function EventSchedulePage({
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
      askStarters={[
        "Which court is free next?",
        "Which matches aren't scheduled yet?",
        "Move Pool A's next match to Court 2",
      ]}
      loaded={loaded}
      tab="schedule"
    >
      <EventSchedule
        capabilities={loaded.context.capabilities}
        permissions={loaded.context.permissions}
        view={loaded.view}
      />
    </EventScreen>
  );
}
