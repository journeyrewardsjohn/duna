"use client";

import { Check, MapPin, ShieldCheck, UsersRound } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { claimMatchParticipantInvitationAction } from "@/app/join/match/[inviteToken]/actions";

interface MatchParticipantInvitation {
  readonly matchId: string;
  readonly invitedName: string;
  readonly reporterName: string;
  readonly opponentNames: readonly string[];
  readonly playedAt: string;
  readonly venueName: string;
  readonly sets: readonly { readonly a: number; readonly b: number }[];
  readonly status: "pending" | "claimed" | "expired" | "cancelled";
  readonly expiresAt: string;
  readonly appDeepLink: string;
  readonly availablePlayers: readonly {
    readonly personId: string;
    readonly displayName: string;
    readonly side: "A" | "B";
  }[];
}

export function MatchParticipantInvitationPanel({
  invitation,
  inviteToken,
  signedIn,
}: {
  readonly invitation: MatchParticipantInvitation;
  readonly inviteToken: string;
  readonly signedIn: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string>();
  const [complete, setComplete] = useState(
    invitation.status === "claimed" && invitation.availablePlayers.length === 0,
  );
  const [selectedPersonId, setSelectedPersonId] = useState(
    invitation.availablePlayers[0]?.personId ?? "",
  );
  const selectedPlayer = invitation.availablePlayers.find(
    (player) => player.personId === selectedPersonId,
  );
  const [correctedDisplayName, setCorrectedDisplayName] = useState("");
  const returnPath = `/join/match/${encodeURIComponent(inviteToken)}`;
  const opponentLabel =
    invitation.opponentNames.join(" & ") || "your opponents";

  function claim() {
    setNotice(undefined);
    if (!selectedPersonId) {
      setNotice("Choose the guest place that belongs to you.");
      return;
    }
    startTransition(async () => {
      const response = await claimMatchParticipantInvitationAction({
        inviteToken,
        provisionalPersonId: selectedPersonId,
        correctedDisplayName: correctedDisplayName.trim() || undefined,
        idempotencyKey: crypto.randomUUID(),
      });
      if (!response.ok) {
        setNotice(response.error);
        return;
      }
      setComplete(true);
      setNotice(
        "Your Duna profile is now connected to this match. The result still needs player confirmation before any eligible rating update.",
      );
    });
  }

  return (
    <section className="organization-invite-card match-invite-card">
      <span className="organization-invite-card__icon match-invite-card__icon">
        {complete ? <Check aria-hidden /> : <UsersRound aria-hidden />}
      </span>
      <span className="page-eyebrow">
        MATCH REPORTED BY {invitation.reporterName}
      </span>
      <h1>
        {complete
          ? "This match is yours."
          : invitation.availablePlayers.length > 1
            ? "Choose your place in this match."
            : `${selectedPlayer?.displayName ?? invitation.invitedName}, your result is waiting.`}
      </h1>
      <p>
        Your match against {opponentLabel} has been reported in Duna. Join now
        to see your rating and track your progress for free.
      </p>

      <div className="match-invite-card__result" aria-label="Reported score">
        <div>
          <small>FINAL SCORE</small>
          <strong>
            {invitation.sets.length > 0
              ? invitation.sets.map((set) => `${set.a}–${set.b}`).join("  ")
              : "Result recorded"}
          </strong>
        </div>
        <time dateTime={invitation.playedAt}>
          {new Date(invitation.playedAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </time>
      </div>

      <div className="match-invite-card__location">
        <MapPin aria-hidden size={19} />
        <span>
          <strong>{invitation.venueName}</strong>
          <small>Reported match location</small>
        </span>
      </div>

      <div className="organization-invite-card__safety">
        <ShieldCheck aria-hidden size={19} />
        <span>
          <strong>Sand Rating stays protected</strong>
          <small>
            This match will not affect Sand Rating until every required player
            joins Duna and the result is confirmed.
          </small>
        </span>
      </div>

      {notice && (
        <p className="organization-invite-card__notice" role="status">
          {notice}
        </p>
      )}
      {!complete &&
        invitation.availablePlayers.length > 0 &&
        (signedIn ? (
          <div className="match-invite-card__claim-form">
            <label>
              <span>Which guest are you?</span>
              <select
                onChange={(event) => {
                  const personId = event.target.value;
                  setSelectedPersonId(personId);
                  setCorrectedDisplayName("");
                }}
                value={selectedPersonId}
              >
                {invitation.availablePlayers.map((player) => (
                  <option key={player.personId} value={player.personId}>
                    {player.displayName} · Team {player.side}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Correct your Duna profile name if needed</span>
              <input
                autoComplete="name"
                onChange={(event) =>
                  setCorrectedDisplayName(event.target.value)
                }
                placeholder={selectedPlayer?.displayName}
                value={correctedDisplayName}
              />
            </label>
            <button
              className="duna-button duna-button--primary"
              disabled={pending}
              onClick={claim}
              type="button"
            >
              {pending ? "Connecting match…" : "Claim my place in this match"}
            </button>
          </div>
        ) : (
          <Link
            className="duna-button duna-button--primary"
            href={`/sign-up?returnTo=${encodeURIComponent(returnPath)}`}
          >
            Join Duna to see the result
          </Link>
        ))}
      {invitation.status === "expired" && (
        <p className="organization-invite-card__notice" role="alert">
          This match invitation expired. Ask {invitation.reporterName} to send
          it again.
        </p>
      )}
      {invitation.status === "cancelled" && (
        <p className="organization-invite-card__notice" role="alert">
          This match invitation was cancelled.
        </p>
      )}
      {complete && (
        <Link
          className="duna-button duna-button--primary"
          href={`/app/matches/${invitation.matchId}`}
        >
          Open match in Duna
        </Link>
      )}
    </section>
  );
}
