import "@/components/player/player.css";

import { Button, EmptyState } from "@duna/ui/tideline";
import type { Metadata } from "next";
import { getAppSession } from "@/components/app-shell/session";
import { TeamClaimView } from "@/components/player/invite/team-claim-view";
import { ReadFailed } from "@/components/player/states";
import { getServerCaller } from "@/lib/api";
import { settleServerRead } from "@/lib/server-read";

export const metadata: Metadata = {
  title: "Join a team",
  description: "Claim your place on a Duna event team.",
};

/**
 * A team invitation (`/app/team/claim/[token]`, P-WEB-1). An invalid,
 * expired or other-account link says so without touching any registration.
 */
export default async function TeamClaimPage({
  params,
}: {
  readonly params: Promise<{ readonly token: string }>;
}) {
  const [{ token }, session] = await Promise.all([params, getAppSession()]);
  const loaded = await settleServerRead(async () => {
    const caller = await getServerCaller();
    return caller.player
      .teamClaim({ claimToken: token })
      .catch((error: unknown) => {
        const code = (error as { code?: unknown })?.code;
        if (
          code === "NOT_FOUND" ||
          code === "BAD_REQUEST" ||
          code === "FORBIDDEN" ||
          code === "PRECONDITION_FAILED"
        )
          return null;
        if (!process.env.DATABASE_URL) return null;
        throw error;
      });
  }, "web.team_claim.read_failed");
  if (!loaded.ok) {
    return (
      <div className="pp pp--narrow">
        <h1 className="td-display pp-title">Join a team</h1>
        <ReadFailed
          busy={loaded.busy}
          reference={loaded.reference}
          what="This team link"
        />
      </div>
    );
  }
  const claim = loaded.value;
  if (!claim) {
    return (
      <div className="pp pp--narrow">
        <h1 className="td-display pp-title">We couldn’t open this team link</h1>
        <EmptyState
          actions={
            <>
              <Button href="/events" variant="primary">
                Browse events
              </Button>
              <Button href="/app/play" variant="secondary">
                Your plans
              </Button>
            </>
          }
          description={`It may be invalid, expired or meant for a different account than ${session.person?.displayName ?? "this one"}. Your registrations are untouched. Ask the organiser or your captain to send it again.`}
          icon="users"
          title="This team link isn’t open"
        />
      </div>
    );
  }
  return (
    <div className="pp pp--narrow">
      <header className="pp-head">
        <div className="pp-head__text">
          <h1 className="td-display pp-title">
            {claim.alreadyClaimed
              ? "You’re on the team"
              : `${claim.captainName} saved you a place`}
          </h1>
          <p className="td-lead">
            {claim.divisionName} at {claim.eventTitle}. Claiming adds your Duna
            profile to the roster; event agreements stay your own.
          </p>
        </div>
      </header>
      <TeamClaimView claim={claim} claimToken={token} />
    </div>
  );
}
