"use client";

import type { TeamClaimSummary } from "@duna/api";
import { Badge, Numeric } from "@duna/ui";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Gift,
  Mail,
  MapPin,
  Minus,
  PartyPopper,
  Plus,
  ReceiptText,
  ShieldCheck,
  UsersRound,
  XCircle,
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

function eventDateLabel(claim: TeamClaimSummary): string {
  const start = new Date(claim.eventStartsAt);
  const end = new Date(claim.eventEndsAt);
  const startDate = start.toLocaleDateString(undefined, {
    timeZone: claim.eventTimezone,
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const endDate = end.toLocaleDateString(undefined, {
    timeZone: claim.eventTimezone,
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const startTime = start.toLocaleTimeString(undefined, {
    timeZone: claim.eventTimezone,
    hour: "numeric",
    minute: "2-digit",
  });
  const endTime = end.toLocaleTimeString(undefined, {
    timeZone: claim.eventTimezone,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
  return startDate === endDate
    ? `${startDate} · ${startTime}–${endTime}`
    : `${startDate}, ${startTime} – ${endDate}, ${endTime}`;
}

function paymentMessage(status: TeamClaimSummary["paymentStatus"]): {
  readonly title: string;
  readonly detail: string;
} {
  if (status === "complimentary") {
    return {
      title: "Comped by the organizer",
      detail: "Your entry is covered. No payment is due.",
    };
  }
  if (status === "payment-required") {
    return {
      title: "Payment is still required",
      detail: "Your place is registered and held. Complete checkout next.",
    };
  }
  if (status === "free") {
    return {
      title: "Free entry",
      detail: "Your event entry has no charge.",
    };
  }
  return {
    title: "Entry paid",
    detail: "Your event payment is complete.",
  };
}

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
  const claimed = state.status === "success" || managedClaim.alreadyClaimed;
  const payment = paymentMessage(managedClaim.paymentStatus);

  return (
    <main className="team-claim-page">
      <section className="team-claim-card">
        <header className={claimed ? "team-claim-card__success-header" : ""}>
          <span>
            {claimed ? (
              <PartyPopper aria-hidden size={27} />
            ) : (
              <UsersRound aria-hidden size={27} />
            )}
          </span>
          <Badge tone={inactive ? "warning" : "positive"}>
            {claimed ? "Claimed" : managedClaim.status}
          </Badge>
        </header>
        {claimed && (
          <div className="team-claim-confetti" aria-hidden>
            {Array.from({ length: 12 }, (_, index) => (
              <i key={index} />
            ))}
          </div>
        )}
        <span className="page-eyebrow">
          {claimed ? "Registration connected" : "Duna team invitation"}
        </span>
        <h1>
          {claimed ? "You’re in." : `${claim.captainName} saved you a place.`}
        </h1>
        <p>
          {claimed ? (
            <>
              Your Duna profile is connected to{" "}
              <strong>{claim.divisionName}</strong> at{" "}
              <strong>{claim.eventTitle}</strong>.
            </>
          ) : (
            <>
              Join <strong>{claim.divisionName}</strong> for{" "}
              <strong>{claim.eventTitle}</strong>. Claiming connects your Duna
              profile to the roster; event agreements remain individual.
            </>
          )}
        </p>

        <div
          className={`team-claim-payment-callout team-claim-payment-callout--${managedClaim.paymentStatus}`}
        >
          {managedClaim.paymentStatus === "complimentary" ? (
            <Gift aria-hidden size={21} />
          ) : (
            <ReceiptText aria-hidden size={21} />
          )}
          <span>
            <strong>{payment.title}</strong>
            <small>{payment.detail}</small>
          </span>
        </div>

        {claimed && (
          <div className="team-claim-event-details">
            <span>
              <CalendarDays aria-hidden size={19} />
              <i>
                <small>When</small>
                <strong>{eventDateLabel(managedClaim)}</strong>
              </i>
            </span>
            <span>
              <UsersRound aria-hidden size={19} />
              <i>
                <small>Division</small>
                <strong>{managedClaim.divisionName}</strong>
              </i>
            </span>
            {managedClaim.venueName && (
              <span>
                <MapPin aria-hidden size={19} />
                <i>
                  <small>Venue</small>
                  <strong>{managedClaim.venueName}</strong>
                </i>
              </span>
            )}
          </div>
        )}

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
            {managedClaim.paymentStatus === "complimentary"
              ? "The organizer comped this entry."
              : managedClaim.paymentStatus === "free"
                ? "This division has free entry."
                : managedClaim.paymentMode === "team"
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

        {claimed ? (
          <div className="team-claim-success" role="status">
            <CheckCircle2 aria-hidden size={23} />
            <span>
              <strong>
                {paymentRequired
                  ? "Your spot is saved. Finish payment to complete your entry."
                  : state.message || "Your registration is confirmed."}
              </strong>
              <small>
                {paymentRequired
                  ? "You are registered but unpaid. Your checkout will retain this claimed spot."
                  : "Open the event for the schedule, updates, agreements, pools, and matches."}
              </small>
            </span>
            <div className="team-claim-success__actions">
              {paymentRequired && (
                <Link
                  href={`/app/checkout/${claim.eventSlug}?division=${claim.divisionId}&team=${claimToken}`}
                >
                  Pay for my entry <ArrowRight aria-hidden size={16} />
                </Link>
              )}
              <Link
                className={paymentRequired ? "secondary" : undefined}
                href={`/events/${claim.eventSlug}`}
              >
                View event <ArrowRight aria-hidden size={16} />
              </Link>
            </div>
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
            {state.status === "error" && (
              <div className="team-claim-failure" role="alert">
                <XCircle aria-hidden size={21} />
                <span>
                  <strong>We couldn’t claim your spot.</strong>
                  <small>{state.message}</small>
                </span>
              </div>
            )}
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
