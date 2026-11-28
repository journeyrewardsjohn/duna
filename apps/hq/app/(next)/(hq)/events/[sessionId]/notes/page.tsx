import type { Metadata } from "next";
import { EventNotes } from "@/components/events/event-notes";
import { EventScreen, eventPage } from "@/components/events/event-screen";

export const metadata: Metadata = { title: "Event notes" };

/** An event › Notes: what coaches and staff wrote or said, and its video. */
export default async function EventNotesPage({
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
      askStarters={["Summarise the notes from this event"]}
      loaded={loaded}
      tab="notes"
    >
      <EventNotes
        permissions={loaded.context.permissions}
        view={loaded.view}
        voiceConfigured={Boolean(
          process.env.LIVEKIT_URL &&
          process.env.LIVEKIT_API_KEY &&
          process.env.LIVEKIT_API_SECRET,
        )}
      />
    </EventScreen>
  );
}
