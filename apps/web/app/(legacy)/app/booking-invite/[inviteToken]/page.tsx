import { notFound } from "next/navigation";
import { BookingInvitePanel } from "@/components/booking-invite-panel";
import { getServerCaller } from "@/lib/api";

export const metadata = { title: "Court invitation" };

export default async function BookingInvitePage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ inviteToken: string }>;
  readonly searchParams: Promise<{
    checkout?: string;
    session_id?: string;
  }>;
}) {
  const { inviteToken } = await params;
  const query = await searchParams;
  const caller = await getServerCaller();
  const invite = await caller.public
    .courtBookingInvite({ inviteToken })
    .catch(() => undefined);
  if (!invite) notFound();
  return (
    <main className="standard-page booking-invite-page">
      <BookingInvitePanel
        invite={invite}
        initialCheckoutSessionId={
          query.checkout === "success" ? query.session_id : undefined
        }
        initialNotice={
          query.checkout === "cancelled"
            ? "Checkout was cancelled. Your share is still open while the court hold remains active."
            : undefined
        }
      />
    </main>
  );
}
