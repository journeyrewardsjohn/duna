"use client";

/**
 * A team invitation (`/app/team/claim/[token]`): the event, the division,
 * who saved the place, the roster and what is paid; "Claim my place" after a
 * confirmation; then what to pay, if anything. The captain can change who is
 * invited (the new people are sent the link only when the captain confirms).
 */
import { report } from "@duna/observability";
import {
  Button,
  Card,
  Checkbox,
  Chip,
  Field,
  Input,
  Notice,
  Rise,
  useConfirm,
} from "@duna/ui/tideline";
import { useState } from "react";
import {
  claimTeamAction,
  updateTeamRosterAction,
} from "@/app/(next)/(app)/app/team/claim/[token]/actions";
import { unwrap } from "../action-result";
import type { TeamClaim } from "../api-types";
import { OfflineNotice } from "../states";

function payment(
  status: TeamClaim["paymentStatus"],
  mode: TeamClaim["paymentMode"],
): string {
  switch (status) {
    case "complimentary":
      return "The organiser covers this entry. Nothing to pay.";
    case "free":
      return "This division has free entry.";
    case "paid":
      return "Your entry is paid.";
    case "payment-required":
      return mode === "team"
        ? "The captain pays for the whole team."
        : "Each player pays their own entry, after claiming.";
  }
}

interface Draft {
  readonly personId?: string;
  readonly inviteTarget?: string;
  readonly displayName: string;
  readonly editable: boolean;
}

export function TeamClaimView({
  claim: initial,
  claimToken,
}: {
  readonly claim: TeamClaim;
  readonly claimToken: string;
}) {
  const confirm = useConfirm();
  const [claim, setClaim] = useState(initial);
  const [agreed, setAgreed] = useState(false);
  const [claimed, setClaimed] = useState<{
    message: string;
    paymentRequired: boolean;
  } | null>(
    initial.alreadyClaimed
      ? {
          message: "You’re on this team.",
          paymentRequired: initial.paymentRequired,
        }
      : null,
  );
  const [roster, setRoster] = useState<Draft[]>(() =>
    initial.roster.slice(1).map((member) => ({
      ...(member.personId ? { personId: member.personId } : {}),
      ...(member.inviteTarget ? { inviteTarget: member.inviteTarget } : {}),
      displayName: member.displayName,
      editable: member.editable,
    })),
  );
  const [invite, setInvite] = useState("");
  const inactive = claim.status === "cancelled" || claim.status === "expired";
  const when = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: claim.eventTimezone,
  }).format(new Date(claim.eventStartsAt));

  const join = () =>
    void confirm
      .run({
        tier: "confirm",
        title: `Join ${claim.captainName}’s team?`,
        description: `${claim.divisionName} at ${claim.eventTitle}, ${when}. Your Duna profile is added to the roster. It doesn’t sign a waiver or charge anything.`,
        verb: "Claim my place",
        cancelLabel: "Not now",
        agentConfirm: `Joins ${claim.captainName}'s team in ${claim.divisionName}`,
        perform: async ({ idempotencyKey }) =>
          unwrap(await claimTeamAction({ claimToken, idempotencyKey })),
        success: (result) => result.message,
        report: (error) =>
          report(error, { event: "web.team_claim.claim_failed" }),
      })
      .then((outcome) => {
        if (outcome.status === "done") setClaimed(outcome.result);
      });

  const newInvites = roster.filter(
    (member) =>
      member.inviteTarget &&
      !claim.roster.some(
        (existing) => existing.inviteTarget === member.inviteTarget,
      ),
  );
  const saveRoster = () =>
    void confirm
      .run({
        tier: "confirm",
        title:
          newInvites.length > 0
            ? `Save the roster and invite ${newInvites.length}?`
            : "Save the roster?",
        description:
          newInvites.length > 0
            ? `Duna sends the team link to ${newInvites.map((member) => member.inviteTarget).join(", ")}.`
            : "People you removed lose their place on the team.",
        verb:
          newInvites.length > 0
            ? `Save and invite ${newInvites.length}`
            : "Save roster",
        cancelLabel: "Keep editing",
        agentConfirm: `Saves the team roster${newInvites.length ? ` and invites ${newInvites.length} people` : ""}`,
        perform: async ({ idempotencyKey }) =>
          unwrap(
            await updateTeamRosterAction({
              claimToken,
              roster: roster.map((member) => ({
                ...(member.personId ? { personId: member.personId } : {}),
                ...(member.inviteTarget
                  ? { inviteTarget: member.inviteTarget }
                  : {}),
                displayName: member.displayName,
              })),
              idempotencyKey,
            }),
          ),
        success: "Roster saved",
        report: (error) =>
          report(error, { event: "web.team_claim.roster_failed" }),
      })
      .then((outcome) => {
        if (outcome.status !== "done") return;
        setClaim(outcome.result);
        setRoster(
          outcome.result.roster.slice(1).map((member) => ({
            ...(member.personId ? { personId: member.personId } : {}),
            ...(member.inviteTarget
              ? { inviteTarget: member.inviteTarget }
              : {}),
            displayName: member.displayName,
            editable: member.editable,
          })),
        );
      });

  const paymentRequired = claimed?.paymentRequired ?? claim.paymentRequired;
  return (
    <div className="pp-form">
      <OfflineNotice />
      <Card className="pp-plan">
        <div className="pp-plan__top">
          <Chip
            kind="status"
            tone={inactive ? "warning" : claimed ? "positive" : "info"}
          >
            {inactive
              ? "No longer open"
              : claimed
                ? "Claimed"
                : "A place for you"}
          </Chip>
          <span className="pp-plan__kind">{claim.divisionName}</span>
        </div>
        <p className="pp-plan__title">{claim.eventTitle}</p>
        <p className="pp-plan__when">
          {when}
          {claim.venueName ? ` · ${claim.venueName}` : ""}
        </p>
        <p className="td-meta td-num">
          {claim.claimedPlayers} of {claim.expectedTeamSize} players in ·{" "}
          {claim.paidPlayers} paid
        </p>
        <dl className="pp-plan__terms">
          <div>
            <dt>Price</dt>
            <dd>{payment(claim.paymentStatus, claim.paymentMode)}</dd>
          </div>
        </dl>
        <ul className="pp-team">
          {claim.roster.map((member) => (
            <li className="pp-team__row" key={`${member.slot}`}>
              <span>
                {member.displayName}
                <span className="td-meta">
                  {" "}
                  ·{" "}
                  {member.status === "captain"
                    ? "Captain"
                    : member.status === "claimed"
                      ? "In"
                      : "Invited"}
                </span>
              </span>
              <Chip kind="status" tone={member.paid ? "positive" : "neutral"}>
                {member.paid ? "Paid" : "Not paid"}
              </Chip>
            </li>
          ))}
        </ul>
      </Card>

      {inactive ? (
        <Notice title="This team link isn’t open any more" tone="warning">
          The registration has closed or the entry was cancelled. Your other
          registrations are untouched. Ask the organiser if you think this is
          wrong.
        </Notice>
      ) : claimed ? (
        <Rise>
          <Notice
            title={paymentRequired ? "Your place is saved" : "You’re in"}
            tone="positive"
          >
            {paymentRequired
              ? "Finish paying for your entry to complete it. Checkout keeps this place."
              : "Open the event for the schedule, updates, pools and matches."}
            <div className="pp-row-actions">
              {paymentRequired ? (
                <Button
                  href={`/app/checkout/${claim.eventSlug}?division=${claim.divisionId}&team=${claimToken}`}
                  size="sm"
                  variant="primary"
                >
                  Pay for my entry
                </Button>
              ) : null}
              <Button
                href={`/events/${claim.eventSlug}`}
                size="sm"
                variant="secondary"
              >
                View the event
              </Button>
            </div>
          </Notice>
        </Rise>
      ) : (
        <div className="pp-stack">
          <Checkbox
            checked={agreed}
            description="It doesn’t sign a waiver or charge anything."
            label="Join this team with my Duna profile"
            onCheckedChange={(checked) => setAgreed(checked === true)}
          />
          <div className="pp-submit">
            <Button
              disabled={!agreed}
              onClick={join}
              size="lg"
              variant="primary"
            >
              Claim my place
            </Button>
          </div>
        </div>
      )}

      {claim.canManageRoster && !inactive ? (
        <section aria-labelledby="pp-roster" className="pp-step">
          <h2 className="pp-h2" id="pp-roster">
            Change who’s invited
          </h2>
          <p className="td-meta">
            You can change the roster until registration closes. Paid players
            stay; people still to claim can be swapped.
          </p>
          <ul className="pp-team">
            {roster.map((member, index) => (
              <li
                className="pp-team__row"
                key={`${member.personId ?? member.inviteTarget}:${index}`}
              >
                <span>
                  {member.displayName}
                  <span className="td-meta">
                    {" "}
                    · {member.personId ? "Duna player" : member.inviteTarget}
                  </span>
                </span>
                <Button
                  aria-label={`Remove ${member.displayName}`}
                  disabled={!member.editable}
                  onClick={() =>
                    setRoster((current) =>
                      current.filter((_, at) => at !== index),
                    )
                  }
                  size="sm"
                  variant="ghost"
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
          {roster.length < claim.expectedTeamSize - 1 ? (
            <div className="pp-fieldrow">
              <Field label="Email or mobile number">
                <Input
                  onValueChange={(value) => setInvite(String(value ?? ""))}
                  value={invite}
                />
              </Field>
              <div className="pp-row-actions pp-row-actions--end">
                <Button
                  disabled={invite.trim().length < 3}
                  onClick={() => {
                    const value = invite.trim();
                    setRoster((current) => [
                      ...current,
                      {
                        inviteTarget: value,
                        displayName: value,
                        editable: true,
                      },
                    ]);
                    setInvite("");
                  }}
                  size="sm"
                  variant="secondary"
                >
                  Add
                </Button>
              </div>
            </div>
          ) : null}
          <div>
            <Button onClick={saveRoster} variant="secondary">
              Save roster
            </Button>
          </div>
        </section>
      ) : null}
      {confirm.dialog}
    </div>
  );
}
