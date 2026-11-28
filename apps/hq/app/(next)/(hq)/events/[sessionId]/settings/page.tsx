import type { Metadata } from "next";
import { EventSettings } from "@/components/events/event-settings";
import { EventScreen, eventPage } from "@/components/events/event-screen";

export const metadata: Metadata = { title: "Event settings" };

/** An event › Settings: details, registration, and cancelling with refunds. */
export default async function EventSettingsPage({
  params,
}: {
  readonly params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const found = await eventPage(sessionId);
  if (found.kind === "state") return found.node;
  const { loaded } = found;
  return (
    <EventScreen askStarters={[]} loaded={loaded} tab="settings">
      <EventSettings
        permissions={loaded.context.permissions}
        publicUrl={
          loaded.view.publicPath
            ? `${loaded.context.publicBase}${loaded.view.publicPath}`
            : undefined
        }
        view={loaded.view}
      />
    </EventScreen>
  );
}
