"use client";

import { BriefcaseBusiness, Check, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { claimTeamInvitationAction } from "@/app/join/team/[inviteToken]/actions";

interface TeamInvitation {
  readonly organizationName: string;
  readonly invitedName: string;
  readonly role: "coach" | "director" | "manager" | "front-desk" | "accountant";
  readonly workerClassification: "1099-contractor" | "w2-employee";
  readonly status: "pending" | "claimed" | "expired" | "cancelled";
}

export function TeamInvitationPanel({
  invitation,
  inviteToken,
  signedIn,
}: {
  readonly invitation: TeamInvitation;
  readonly inviteToken: string;
  readonly signedIn: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string>();
  const [complete, setComplete] = useState(invitation.status === "claimed");
  const returnPath = `/join/team/${encodeURIComponent(inviteToken)}`;

  function claim() {
    setNotice(undefined);
    startTransition(async () => {
      const response = await claimTeamInvitationAction({
        inviteToken,
        idempotencyKey: crypto.randomUUID(),
      });
      if (!response.ok) {
        setNotice(response.error);
        return;
      }
      setComplete(true);
      setNotice(
        "You’re connected. Complete your own address, availability, and goals in Team settings.",
      );
    });
  }

  return (
    <section className="organization-invite-card">
      <span className="organization-invite-card__icon">
        {complete ? <Check aria-hidden /> : <BriefcaseBusiness aria-hidden />}
      </span>
      <span className="page-eyebrow">{invitation.organizationName}</span>
      <h1>
        {complete
          ? "Welcome to the team."
          : `Join as ${invitation.invitedName}.`}
      </h1>
      <p>
        Accept to connect your Duna identity as{" "}
        {invitation.role.replaceAll("-", " ")}. The organization can assign
        sessions and measure your performance without taking ownership of your
        login.
      </p>
      <div className="organization-invite-card__safety">
        <ShieldCheck aria-hidden size={19} />
        <span>
          <strong>
            {invitation.workerClassification === "w2-employee"
              ? "W-2 employee"
              : "1099 contractor"}
          </strong>
          <small>
            This classification is controlled by the organization. You provide
            and maintain your own personal details after accepting.
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
            {pending ? "Connecting…" : "Accept team invitation"}
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
        <Link className="duna-button duna-button--primary" href="/app">
          Open Duna
        </Link>
      )}
    </section>
  );
}
