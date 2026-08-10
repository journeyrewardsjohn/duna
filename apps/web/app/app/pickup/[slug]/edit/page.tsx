import { notFound } from "next/navigation";
import { PickupEditForm } from "@/components/pickup-edit-form";
import { getServerCaller } from "@/lib/api";

export const metadata = { title: "Edit pickup" };

export default async function EditPickupPage({
  params,
}: {
  readonly params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const caller = await getServerCaller();
  const event = await caller.public
    .eventBySlug({ slug })
    .catch(() => undefined);
  if (!event || event.kind !== "pickup") notFound();
  const management = await caller.player
    .pickupManagement({ pickupSessionId: event.id })
    .catch(() => undefined);
  if (!management?.canEdit) notFound();
  return (
    <PickupEditForm
      confirmedParticipantCount={management.confirmedParticipantCount}
      event={event}
      initialWaitlistEnabled={management.waitlistEnabled}
    />
  );
}
