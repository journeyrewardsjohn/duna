"use client";

import type { PlayerInvitation } from "@duna/api";
import {
  CalendarDays,
  Check,
  Gift,
  ShieldCheck,
  UserRoundPlus,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { claimOrganizationInvitationAction } from "@/app/join/organization/[inviteToken]/actions";

export function OrganizationInvitationPanel({
  invitation,
  inviteToken,
  signedIn,
}: {
  readonly invitation: PlayerInvitation;
  readonly inviteToken: string;
  readonly signedIn: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string>();
  const [complete, setComplete] = useState(invitation.status === "claimed");
  const [nextPath, setNextPath] = useState<string | undefined>(
    invitation.event?.claimPath,
  );
  const returnPath = `/join/organization/${encodeURIComponent(inviteToken)}`;

  function claim() {
    setNotice(undefined);
    startTransition(async () => {
      const response = await claimOrganizationInvitationAction({
        inviteToken,
        idempotencyKey: crypto.randomUUID(),
      });
      if (!response.ok) {
        setNotice(response.error);
        return;
      }
      setComplete(true);
      setNextPath(response.result.nextPath);
      setNotice(
        response.result.guardianReviewRequired
          ? "The player has been added privately. The guardian relationship is now queued for review."
          : "You are connected to the organization.",
      );
    });
  }

  return (
    <section className="organization-invite-card">
      <span className="organization-invite-card__icon">
        {complete ? <Check aria-hidden /> : <UserRoundPlus aria-hidden />}
      </span>
      <span className="page-eyebrow">{invitation.organizationName}</span>
      <h1>
        {complete
          ? invitation.event
            ? "Your tournament spot is connected."
            : "You’re connected."
          : invitation.isMinor
            ? `Connect ${invitation.invitedName}.`
            : invitation.event
              ? `${invitation.invitedName}, your spot is waiting.`
              : `Join as ${invitation.invitedName}.`}
      </h1>
      <p>
        {invitation.isMinor
          ? "A parent or guardian accepts this invitation. The child’s profile stays private and no spending authority is granted until Duna completes its guardian review."
          : invitation.event
            ? `Accept to connect your Duna identity to ${invitation.event.divisionName} at ${invitation.event.title}.`
            : "Accept to add your Duna identity to this organization’s player roster."}
      </p>
      {invitation.event && (
        <div className="organization-invite-card__event">
          <span>
            <CalendarDays aria-hidden size={20} />
            <i>
              <strong>{invitation.event.title}</strong>
              <small>
                {new Date(invitation.event.startsAt).toLocaleString(undefined, {
                  timeZone: invitation.event.timezone,
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </small>
            </i>
          </span>
          <span>
            {invitation.event.paymentTreatment === "complimentary" ? (
              <Gift aria-hidden size={20} />
            ) : (
              <WalletCards aria-hidden size={20} />
            )}
            <i>
              <strong>
                {invitation.event.paymentTreatment === "complimentary"
                  ? "Complimentary entry"
                  : "Payment due after claim"}
              </strong>
              <small>
                {invitation.event.paymentTreatment === "complimentary"
                  ? "The organizer covered your entry."
                  : "Your place is registered and held. Checkout is next."}
              </small>
            </i>
          </span>
        </div>
      )}
      <div className="organization-invite-card__safety">
        <ShieldCheck aria-hidden size={19} />
        <span>
          <strong>
            {invitation.isMinor ? "Protected minor profile" : "Your identity"}
          </strong>
          <small>
            {invitation.isMinor
              ? `Guardian recipient: ${invitation.guardianName ?? "parent or guardian"}`
              : "The operator cannot create or take over your Duna login."}
          </small>
        </span>
      </div>
      {notice && (
        <p className="organization-invite-card__notice" role="status">
          {notice}
        </p>
      )}
      {!complete &&
        invitation.status === "pending" &&
        (signedIn ? (
          <button
            className="duna-button duna-button--primary"
            disabled={pending}
            onClick={claim}
            type="button"
          >
            {pending
              ? "Connecting…"
              : invitation.isMinor
                ? "Accept as parent or guardian"
                : "Accept invitation"}
          </button>
        ) : (
          <Link
            className="duna-button duna-button--primary"
            href={`/sign-in?returnTo=${encodeURIComponent(returnPath)}`}
          >
            Sign in to accept
          </Link>
        ))}
      {invitation.status === "expired" && (
        <p className="organization-invite-card__notice" role="alert">
          This invitation expired. Ask the organization to send a new one.
        </p>
      )}
      {invitation.status === "cancelled" && (
        <p className="organization-invite-card__notice" role="alert">
          This invitation was cancelled.
        </p>
      )}
      {complete && (
        <Link
          className="duna-button duna-button--primary"
          href={nextPath ?? "/app"}
        >
          {invitation.event ? "Continue to my entry" : "Open Duna"}
        </Link>
      )}
    </section>
  );
}
