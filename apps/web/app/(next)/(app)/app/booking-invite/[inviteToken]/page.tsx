import "@/components/player/player.css";

import { Button, EmptyState } from "@duna/ui/tideline";
import type { Metadata } from "next";
import { getAppSession } from "@/components/app-shell/session";
import {
  demoCourtInvite,
  demoPlansScope,
  demoWithoutDatabase,
} from "@/components/player/demo";
import { BookingInviteView } from "@/components/player/invite/booking-invite-view";
import { ReadFailed } from "@/components/player/states";
import { getServerCaller } from "@/lib/api";
import { settleServerRead } from "@/lib/server-read";

export const metadata: Metadata = { title: "Court invitation" };

/**
 * A court invitation (`/app/booking-invite/[inviteToken]`, P-WEB-1). An
 * expired, used or unknown link says so and how to get a new one; checkout
 * comes back here with `?checkout=success|cancelled`.
 */
export default async function BookingInvitePage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly inviteToken: string }>;
  readonly searchParams: Promise<{
    readonly checkout?: string;
    readonly session_id?: string;
  }>;
}) {
  const [{ inviteToken }, query, session] = await Promise.all([
    params,
    searchParams,
    getAppSession(),
  ]);
  const demo = demoWithoutDatabase(session.demo)
    ? demoCourtInvite(inviteToken, await demoPlansScope())
    : undefined;
  const loaded = demo
    ? ({ ok: true, value: demo } as const)
    : await settleServerRead(async () => {
        const caller = await getServerCaller();
        return caller.public
          .courtBookingInvite({ inviteToken })
          .catch((error: unknown) => {
            const code = (error as { code?: unknown })?.code;
            if (
              code === "NOT_FOUND" ||
              code === "BAD_REQUEST" ||
              code === "FORBIDDEN"
            )
              return null;
            throw error;
          });
      }, "web.booking_invite.read_failed");
  if (!loaded.ok) {
    return (
      <div className="pp pp--narrow">
        <h1 className="td-display pp-title">Court invitation</h1>
        <ReadFailed
          busy={loaded.busy}
          reference={loaded.reference}
          what="This invitation"
        />
      </div>
    );
  }
  const invite = loaded.value;
  if (!invite) {
    return (
      <div className="pp pp--narrow">
        <h1 className="td-display pp-title">This invitation isn’t open</h1>
        <EmptyState
          actions={
            <>
              <Button href="/app/play" variant="primary">
                Your plans
              </Button>
              <Button href="/app/discover" variant="secondary">
                Find a game
              </Button>
            </>
          }
          description={`The link may have expired, been used already, or belong to a different account than ${session.person?.displayName ?? "this one"}. Ask the person who invited you to send a new one.`}
          icon="court"
          title="We couldn’t open this invitation"
        />
      </div>
    );
  }
  return (
    <div className="pp pp--narrow">
      <header className="pp-head">
        <div className="pp-head__text">
          <h1 className="td-display pp-title">
            {invite.organizerName} invited you to play
          </h1>
          <p className="td-lead">
            {invite.participant.shareAmountMinor === 0
              ? "The court is booked and paid. Accept so they know you’re in."
              : "Your place is held while every player accepts and pays their share."}
          </p>
        </div>
      </header>
      <BookingInviteView
        cancelled={query.checkout === "cancelled"}
        {...(query.checkout === "success" && query.session_id
          ? { checkoutSessionId: query.session_id }
          : {})}
        invite={invite}
      />
    </div>
  );
}
