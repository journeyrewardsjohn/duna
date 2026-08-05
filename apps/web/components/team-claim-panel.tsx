"use client";

import type { TeamClaimSummary } from "@duna/api";
import { Badge, Numeric } from "@duna/ui";
import {
  ArrowRight,
  Check,
  Clock3,
  Mail,
  Minus,
  Plus,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import {
  claimTeamAction,
  type TeamClaimActionState,
  updateTeamRosterAction,
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
  const [managedClaim, setManagedClaim] = useState(claim);
  const [draftRoster, setDraftRoster] = useState(
    claim.roster.slice(1).map((member) => ({
      personId: member.personId,
      inviteTarget: member.inviteTarget,
      displayName: member.displayName,
      editable: member.editable,
    })),
  );
  const [newInvite, setNewInvite] = useState("");
  const [rosterError, setRosterError] = useState<string>();
  const [savingRoster, startRosterTransition] = useTransition();
  const inactive = claim.status === "cancelled" || claim.status === "expired";
  const paymentRequired = state.paymentRequired || managedClaim.paymentRequired;

  return (
    <main className="team-claim-page">
      <section className="team-claim-card">
        <header>
          <span>
            <UsersRound aria-hidden size={27} />
          </span>
          <Badge tone={inactive ? "warning" : "positive"}>
            {managedClaim.status}
          </Badge>
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
              <Numeric>{managedClaim.claimedPlayers}</Numeric> of{" "}
              <Numeric>{managedClaim.expectedTeamSize}</Numeric> claimed
            </strong>
          </span>
          <div>
            <i
              style={{
                width: `${(managedClaim.claimedPlayers / managedClaim.expectedTeamSize) * 100}%`,
              }}
            />
          </div>
        </div>

        <div className="team-claim-progress team-claim-progress--payment">
          <span>
            <small>Payment</small>
            <strong>
              <Numeric>{managedClaim.paidPlayers}</Numeric> of{" "}
              <Numeric>{managedClaim.expectedTeamSize}</Numeric> covered
            </strong>
          </span>
          <div>
            <i
              style={{
                width: `${(managedClaim.paidPlayers / managedClaim.expectedTeamSize) * 100}%`,
              }}
            />
          </div>
        </div>

        <div className="team-claim-roster">
          {managedClaim.roster.map((member, index) => (
            <article key={`${member.displayName}-${index}`}>
              <span>{member.displayName.slice(0, 2).toUpperCase()}</span>
              <span>
                <strong>{member.displayName}</strong>
                <small>
                  {member.deliveryStatus
                    ? `Invite ${member.deliveryStatus} · `
                    : ""}
                  {member.paid ? "Paid" : "Payment pending"}
                </small>
              </span>
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

        {managedClaim.isOrganizer && managedClaim.canManageRoster && (
          <section className="team-claim-editor">
            <header>
              <span>
                <strong>Edit invitations</strong>
                <small>
                  {managedClaim.paymentMode === "team"
                    ? "You can change the roster until registration closes."
                    : "Paid players are locked; pending players can still be changed."}
                </small>
              </span>
              <Badge>
                {draftRoster.length + 1}/{managedClaim.expectedTeamSize}
              </Badge>
            </header>
            <div>
              {draftRoster.map((member, index) => (
                <article
                  key={`${member.personId ?? member.inviteTarget}:${index}`}
                >
                  <span>
                    <strong>{member.displayName}</strong>
                    <small>
                      {member.personId ? "Duna player" : member.inviteTarget}
                    </small>
                  </span>
                  <button
                    aria-label={`Remove ${member.displayName}`}
                    disabled={!member.editable}
                    onClick={() =>
                      setDraftRoster((current) =>
                        current.filter(
                          (_, memberIndex) => memberIndex !== index,
                        ),
                      )
                    }
                    type="button"
                  >
                    <Minus aria-hidden size={15} />
                  </button>
                </article>
              ))}
            </div>
            {draftRoster.length < managedClaim.expectedTeamSize - 1 && (
              <label>
                <Mail aria-hidden size={17} />
                <input
                  onChange={(entry) => setNewInvite(entry.target.value)}
                  placeholder="Email or mobile number"
                  value={newInvite}
                />
                <button
                  disabled={newInvite.trim().length < 3}
                  onClick={() => {
                    const value = newInvite.trim();
                    if (!value) return;
                    setDraftRoster((current) => [
                      ...current,
                      {
                        personId: undefined,
                        inviteTarget: value,
                        displayName: value,
                        editable: true,
                      },
                    ]);
                    setNewInvite("");
                  }}
                  type="button"
                >
                  <Plus aria-hidden size={15} /> Add
                </button>
              </label>
            )}
            {rosterError && <p role="alert">{rosterError}</p>}
            <button
              disabled={savingRoster}
              onClick={() => {
                setRosterError(undefined);
                startRosterTransition(async () => {
                  const result = await updateTeamRosterAction({
                    claimToken,
                    roster: draftRoster.map((member) => ({
                      personId: member.personId,
                      inviteTarget: member.inviteTarget,
                      displayName: member.displayName,
                    })),
                  });
                  if (!result.ok) {
                    setRosterError(result.error);
                    return;
                  }
                  setManagedClaim(result.claim);
                  setDraftRoster(
                    result.claim.roster.slice(1).map((member) => ({
                      personId: member.personId,
                      inviteTarget: member.inviteTarget,
                      displayName: member.displayName,
                      editable: member.editable,
                    })),
                  );
                });
              }}
              type="button"
            >
              {savingRoster
                ? "Saving invitations…"
                : "Save roster + send new invites"}
            </button>
          </section>
        )}

        <div className="team-claim-meta">
          <span>
            <ShieldCheck aria-hidden size={17} />
            {managedClaim.paymentMode === "team"
              ? "The captain selected whole-team payment."
              : "Each invited player pays their own entry."}
          </span>
          <span>
            <Clock3 aria-hidden size={17} />
            Invite expires{" "}
            {new Date(managedClaim.expiresAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </span>
        </div>

        {state.status === "success" || managedClaim.alreadyClaimed ? (
          <div className="team-claim-success">
            <Check aria-hidden size={19} />
            <span>
              <strong>{state.message || "Your place is claimed."}</strong>
              <small>
                {paymentRequired
                  ? "Complete your own entry payment and event agreements next."
                  : "Open the event to review required agreements and your plans."}
              </small>
            </span>
            <Link
              href={
                paymentRequired
                  ? `/app/checkout/${claim.eventSlug}?division=${claim.divisionId}&team=${claimToken}`
                  : `/events/${claim.eventSlug}`
              }
            >
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
