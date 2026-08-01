"use client";

import type { PlayerInvitation } from "@duna/api";
import { Check, ShieldCheck, UserRoundPlus } from "lucide-react";
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
          ? "You’re connected."
          : invitation.isMinor
            ? `Connect ${invitation.invitedName}.`
            : `Join as ${invitation.invitedName}.`}
      </h1>
      <p>
        {invitation.isMinor
          ? "A parent or guardian accepts this invitation. The child’s profile stays private and no spending authority is granted until Duna completes its guardian review."
          : "Accept to add your Duna identity to this organization’s player roster."}
      </p>
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
            href={`/sign-in?redirect_url=${encodeURIComponent(returnPath)}`}
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
        <Link className="duna-button duna-button--primary" href="/app">
          Open Duna
        </Link>
      )}
    </section>
  );
}
