"use client";

import type { TeamClaimSummary } from "@duna/api";
import { Badge, Numeric } from "@duna/ui";
import {
  ArrowRight,
  Check,
  Clock3,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import {
  claimTeamAction,
  type TeamClaimActionState,
} from "@/app/app/team/claim/[token]/actions";

const initialState: TeamClaimActionState = {
  status: "idle",
  message: "",
};

export function TeamClaimPanel({
  claim,
  claimToken,
}: {
  readonly claim: TeamClaimSummary;
  readonly claimToken: string;
}) {
  const [state, action, pending] = useActionState(
    claimTeamAction,
    initialState,
  );
  const inactive = claim.status === "cancelled" || claim.status === "expired";

  return (
    <main className="team-claim-page">
      <section className="team-claim-card">
        <header>
          <span>
            <UsersRound aria-hidden size={27} />
          </span>
          <Badge tone={inactive ? "warning" : "positive"}>{claim.status}</Badge>
        </header>
        <span className="page-eyebrow">Duna team invitation</span>
        <h1>{claim.captainName} saved you a place.</h1>
        <p>
          Join <strong>{claim.divisionName}</strong> for{" "}
          <strong>{claim.eventTitle}</strong>. Claiming connects your Duna
          profile to the roster; event agreements remain individual.
        </p>

        <div className="team-claim-progress">
          <span>
            <small>Roster</small>
            <strong>
              <Numeric>{claim.claimedPlayers}</Numeric> of{" "}
              <Numeric>{claim.expectedTeamSize}</Numeric> claimed
            </strong>
          </span>
          <div>
            <i
              style={{
                width: `${(claim.claimedPlayers / claim.expectedTeamSize) * 100}%`,
              }}
            />
          </div>
        </div>

        <div className="team-claim-roster">
          {claim.roster.map((member, index) => (
            <article key={`${member.displayName}-${index}`}>
              <span>{member.displayName.slice(0, 2).toUpperCase()}</span>
              <strong>{member.displayName}</strong>
              <Badge
                tone={
                  member.status === "claimed" || member.status === "captain"
                    ? "positive"
                    : "neutral"
                }
              >
                {member.status}
              </Badge>
            </article>
          ))}
        </div>

        <div className="team-claim-meta">
          <span>
            <ShieldCheck aria-hidden size={17} />
            {claim.paymentMode === "team"
              ? "The captain selected whole-team payment."
              : "Each invited player pays their own entry."}
          </span>
          <span>
            <Clock3 aria-hidden size={17} />
            Invite expires{" "}
            {new Date(claim.expiresAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </span>
        </div>

        {state.status === "success" || claim.alreadyClaimed ? (
          <div className="team-claim-success">
            <Check aria-hidden size={19} />
            <span>
              <strong>{state.message || "Your place is claimed."}</strong>
              <small>
                {state.paymentRequired || claim.paymentRequired
                  ? "Complete your own entry payment and event agreements next."
                  : "Open the event to review required agreements and your plans."}
              </small>
            </span>
            <Link href={`/app/checkout/${claim.eventSlug}`}>
              Continue <ArrowRight aria-hidden size={16} />
            </Link>
          </div>
        ) : (
          <form action={action}>
            <input name="claimToken" type="hidden" value={claimToken} />
            <label>
              <input
                disabled={inactive}
                name="confirmed"
                required
                type="checkbox"
                value="true"
              />
              <span>
                <strong>Join this team with my Duna profile.</strong>
                This does not accept a waiver or charge a payment.
              </span>
            </label>
            {state.status === "error" && <p role="alert">{state.message}</p>}
            <button disabled={inactive || pending} type="submit">
              {pending ? "Claiming place…" : "Claim my place"}
              <ArrowRight aria-hidden size={16} />
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
