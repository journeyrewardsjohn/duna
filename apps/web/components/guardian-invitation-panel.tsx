"use client";

import type { AppRouter } from "@duna/api";
import type { inferRouterOutputs } from "@trpc/server";
import { Check, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { claimGuardianInvitationAction } from "@/app/join/guardian/[token]/actions";

type Invitation = NonNullable<
  inferRouterOutputs<AppRouter>["public"]["guardianInvitation"]
>;

export function GuardianInvitationPanel({
  consentDisclosure,
  invitation,
  signedIn,
  token,
}: {
  readonly consentDisclosure: string;
  readonly invitation: Invitation;
  readonly signedIn: boolean;
  readonly token: string;
}) {
  const [pending, startTransition] = useTransition();
  const [confirmed, setConfirmed] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [complete, setComplete] = useState(invitation.status === "claimed");
  const returnPath = `/join/guardian/${encodeURIComponent(token)}`;

  function claim() {
    if (!confirmed) {
      setNotice("Confirm the parent or legal-guardian disclosure to continue.");
      return;
    }
    setNotice(undefined);
    startTransition(async () => {
      const response = await claimGuardianInvitationAction({
        token,
        consentConfirmed: true,
        idempotencyKey: crypto.randomUUID(),
      });
      if (!response.ok) {
        setNotice(response.error);
        return;
      }
      setComplete(true);
      setNotice(
        `You are connected to ${invitation.childDisplayName}. Protected payments, waivers, and wallet controls unlock after Duna verifies the guardian relationship.`,
      );
    });
  }

  return (
    <section className="organization-invite-card guardian-invite-card">
      <span className="organization-invite-card__icon">
        {complete ? <Check aria-hidden /> : <Users aria-hidden />}
      </span>
      <span className="page-eyebrow">Duna family</span>
      <h1>
        {complete
          ? "Guardian request received."
          : `Connect with ${invitation.childDisplayName}.`}
      </h1>
      <p>
        A child started this account and asked a parent or legal guardian to
        complete the protected family connection.
      </p>
      <div className="organization-invite-card__safety">
        <ShieldCheck aria-hidden size={19} />
        <span>
          <strong>Review before access</strong>
          <small>
            Accepting records your consent and creates a pending relationship.
            It does not immediately unlock spending, payouts, or waiver
            authority.
          </small>
        </span>
      </div>

      {!complete && invitation.status === "pending" && signedIn && (
        <label className="guardian-invite-card__consent">
          <input
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            type="checkbox"
          />
          <span>{consentDisclosure}</span>
        </label>
      )}

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
            disabled={pending || !confirmed}
            onClick={claim}
            type="button"
          >
            {pending ? "Recording consent…" : "Accept as parent or guardian"}
          </button>
        ) : (
          <Link
            className="duna-button duna-button--primary"
            href={`/sign-in?returnTo=${encodeURIComponent(returnPath)}`}
          >
            Sign in or create an adult account
          </Link>
        ))}

      {invitation.status === "expired" && (
        <p className="organization-invite-card__notice" role="alert">
          This invitation expired. Ask the child to create a new link.
        </p>
      )}
      {invitation.status === "cancelled" && (
        <p className="organization-invite-card__notice" role="alert">
          This invitation was cancelled.
        </p>
      )}
      {complete && (
        <Link className="duna-button duna-button--primary" href="/app/settings">
          Review household
        </Link>
      )}
    </section>
  );
}
