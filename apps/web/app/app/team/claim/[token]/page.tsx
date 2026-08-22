import { AlertTriangle, ArrowRight, LifeBuoy } from "lucide-react";
import Link from "next/link";
import { TeamClaimPanel } from "@/components/team-claim-panel";
import { getServerCaller } from "@/lib/api";

export const metadata = {
  title: "Join team",
  description: "Claim your place on a Duna event team.",
};

export default async function TeamClaimPage({
  params,
}: {
  readonly params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const caller = await getServerCaller();
  const claim = await caller.player
    .teamClaim({ claimToken: token })
    .catch(() => undefined);
  if (!claim) {
    return (
      <main className="team-claim-page">
        <section className="team-claim-card team-claim-card--failure">
          <header>
            <span>
              <AlertTriangle aria-hidden size={27} />
            </span>
          </header>
          <span className="page-eyebrow">Claim could not be completed</span>
          <h1>We couldn’t open this spot.</h1>
          <p>
            The link may be invalid, expired, or connected to a different Duna
            account. Your existing registration has not been removed.
          </p>
          <div className="team-claim-recovery" role="alert">
            <LifeBuoy aria-hidden size={22} />
            <span>
              <strong>You are not stranded.</strong>
              <small>
                Open Events to find your registration, or ask the tournament
                organizer to resend the invitation.
              </small>
            </span>
          </div>
          <div className="team-claim-recovery__actions">
            <Link href="/events">
              Browse events <ArrowRight aria-hidden size={16} />
            </Link>
            <Link className="secondary" href="/app">
              Open Duna Player
            </Link>
          </div>
        </section>
      </main>
    );
  }
  return <TeamClaimPanel claim={claim} claimToken={token} />;
}
