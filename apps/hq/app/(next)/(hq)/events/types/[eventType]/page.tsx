import { redirect } from "next/navigation";

/**
 * The old event type pages. Types are filters inside the Events list now,
 * so the addresses keep working and land on the filtered list.
 */
export default async function EventTypePage({
  params,
}: {
  readonly params: Promise<{ eventType: string }>;
}) {
  const { eventType } = await params;
  redirect(`/events?type=${encodeURIComponent(eventType)}`);
}
