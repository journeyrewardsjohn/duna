import "@/components/player/player.css";

import { Button, EmptyState } from "@duna/ui/tideline";
import type { Metadata } from "next";
import { getServerCaller } from "@/lib/api";
import { settleServerRead } from "@/lib/server-read";
import { PickupForm } from "@/components/player/pickup/pickup-form";
import { ReadFailed } from "@/components/player/states";

export const metadata: Metadata = { title: "Edit pickup" };

function local(instant: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((value) => value.type === type)?.value ?? "";
  return {
    day: `${part("year")}-${part("month")}-${part("day")}`,
    time: `${part("hour")}:${part("minute")}`,
  };
}

/**
 * Change a pickup the person hosts (`/app/pickup/[slug]/edit`, P-WEB-1).
 * Only its host, and only before it starts (`pickupManagement.canEdit`).
 */
export default async function EditPickupPage({
  params,
}: {
  readonly params: Promise<{ readonly slug: string }>;
}) {
  const { slug } = await params;
  const caller = await getServerCaller();
  const loaded = await settleServerRead(async () => {
    const event = await caller.public
      .eventBySlug({ slug })
      .catch(() => undefined);
    if (!event || event.kind !== "pickup") return null;
    const management = await caller.player
      .pickupManagement({ pickupSessionId: event.id })
      .catch(() => undefined);
    return management?.canEdit ? { event, management } : null;
  }, "web.pickup.edit_read_failed");
  const head = (
    <header className="pp-head">
      <div className="pp-head__text">
        <h1 className="td-display pp-title">Edit pickup</h1>
      </div>
    </header>
  );
  if (!loaded.ok) {
    return (
      <div className="pp">
        {head}
        <ReadFailed
          busy={loaded.busy}
          reference={loaded.reference}
          what="This pickup"
        />
      </div>
    );
  }
  if (!loaded.value) {
    return (
      <div className="pp">
        {head}
        <EmptyState
          actions={
            <Button href="/app/play" variant="primary">
              Your plans
            </Button>
          }
          description="Only the host can change a pickup, and only before it starts."
          icon="users"
          title="This pickup can’t be changed here"
        />
      </div>
    );
  }
  const { event, management } = loaded.value;
  const start = local(event.startsAt);
  return (
    <div className="pp pp--narrow">
      {head}
      <PickupForm
        confirmedCount={management.confirmedParticipantCount}
        initial={{
          title: event.title,
          day: start.day,
          time: start.time,
          durationMinutes: Math.max(
            30,
            Math.round(
              (Date.parse(event.endsAt) - Date.parse(event.startsAt)) / 60_000,
            ),
          ),
          place: {
            label: event.venueName,
            ...(event.location?.address
              ? { address: event.location.address }
              : {}),
            ...(event.location?.googlePlaceId
              ? { placeId: event.location.googlePlaceId }
              : {}),
            ...(event.location?.latitude !== undefined
              ? { latitude: event.location.latitude }
              : {}),
            ...(event.location?.longitude !== undefined
              ? { longitude: event.location.longitude }
              : {}),
            confidence: event.location?.confidence ?? "approximate",
          },
          capacity: event.capacity,
          note: event.description ?? event.shortSummary ?? "",
          visibility: event.visibility ?? "public",
          approvalRequired: event.approvalRequired ?? false,
          waitlistEnabled: management.waitlistEnabled,
        }}
        mode="edit"
        pickupSessionId={event.id}
        slug={slug}
      />
    </div>
  );
}
