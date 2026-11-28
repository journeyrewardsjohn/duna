import { hqHref } from "@duna/core/hq-routes";
import { redirect } from "next/navigation";

/**
 * The old court reservation page. A booking now opens in Schedule's side
 * panel (people, payment, check-in), so the address keeps working and lands
 * there. Its day is found by Schedule from the booking itself.
 */
export default async function CourtBookingPage({
  params,
}: {
  readonly params: Promise<{ activityId: string }>;
}) {
  const { activityId } = await params;
  redirect(
    `${hqHref("schedule")}?open=${encodeURIComponent(`court-booking:${activityId}`)}`,
  );
}
