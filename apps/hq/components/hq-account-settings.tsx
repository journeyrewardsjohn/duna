"use client";

import type { AccountDeletionReadiness, PlayerSettings } from "@duna/api";
import { Badge } from "@duna/ui";
import {
  AlertTriangle,
  ArrowUpRight,
  ShieldAlert,
  UserRound,
  WalletCards,
} from "lucide-react";
import { useState, useTransition } from "react";
import {
  cancelHqAccountDeletionAction,
  requestHqAccountDeletionAction,
} from "@/app/account/actions";

export function HqAccountSettings({
  deletionReadiness,
  settings,
  webUrl,
}: {
  readonly deletionReadiness: AccountDeletionReadiness;
  readonly settings: PlayerSettings;
  readonly webUrl: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [reason, setReason] = useState("");
  const [forfeitCredits, setForfeitCredits] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const activeRequest = settings.privacyRequests.find((request) =>
    ["queued", "identity-review", "legal-hold"].includes(request.status),
  );

  function requestDeletion() {
    setError(undefined);
    if (confirmation !== "DELETE") {
      setError('Type "DELETE" to confirm.');
      return;
    }
    startTransition(async () => {
      const response = await requestHqAccountDeletionAction({
        reason,
        forfeitOrganizationCredits: forfeitCredits,
      });
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setNotice("Your account-deletion request is now under review.");
      setConfirming(false);
    });
  }

  function cancelDeletion() {
    setError(undefined);
    startTransition(async () => {
      const response = await cancelHqAccountDeletionAction();
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setNotice("The account-deletion request was cancelled.");
    });
  }

  return (
    <div className="hq-account-page">
      <header className="hq-page-header">
        <div>
          <span className="hq-eyebrow">Personal account</span>
          <h1>Your Duna identity.</h1>
          <p>
            Your personal profile can belong to several organizations without
            mixing their members, money, or settings.
          </p>
        </div>
      </header>

      {(notice || error) && (
        <p
          className={
            error ? "hq-account-feedback error" : "hq-account-feedback"
          }
          role="status"
        >
          {error ?? notice}
        </p>
      )}

      <div className="hq-account-grid">
        <section className="hq-card hq-account-profile">
          <UserRound aria-hidden size={24} />
          <span className="hq-eyebrow">Profile</span>
          <h2>{settings.profile.person.displayName}</h2>
          <p>
            {settings.profile.email ?? "No email shown"} · @
            {settings.profile.person.handle}
          </p>
          <a
            className="hq-button hq-button--secondary"
            href={`${webUrl}/app/settings#profile`}
          >
            Edit personal + player details
            <ArrowUpRight aria-hidden size={15} />
          </a>
        </section>

        <section className="hq-card hq-account-legal">
          <ShieldAlert aria-hidden size={24} />
          <span className="hq-eyebrow">Agreements + privacy</span>
          <h2>Clear controls, one place.</h2>
          <p>
            Review the organization agreement, consumer terms, privacy policy,
            and mobile license that apply across Duna.
          </p>
          <div>
            <a href={`${webUrl}/legal/hq-terms`}>HQ Terms</a>
            <a href={`${webUrl}/legal/privacy`}>Privacy</a>
            <a href={`${webUrl}/legal/terms`}>Consumer Terms</a>
          </div>
        </section>
      </div>

      <section className="hq-card hq-danger-zone">
        <div>
          <span className="hq-eyebrow">Danger zone</span>
          <h2>Delete my account</h2>
          <p>
            Deletion checks cash, credits, subscriptions, and organization
            ownership before anything irreversible happens.
          </p>
        </div>
        {activeRequest ? (
          <div className="hq-deletion-request">
            <Badge tone="warning">{activeRequest.status}</Badge>
            <p>
              Requested{" "}
              {new Intl.DateTimeFormat("en-US", {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(activeRequest.requestedAt))}
              .
            </p>
            {activeRequest.status !== "legal-hold" && (
              <button
                className="hq-button hq-button--secondary"
                disabled={pending}
                onClick={cancelDeletion}
                type="button"
              >
                Cancel request
              </button>
            )}
          </div>
        ) : confirming ? (
          <div className="hq-deletion-confirm">
            {deletionReadiness.blockingReasons.length > 0 && (
              <div className="hq-deletion-blockers">
                <AlertTriangle aria-hidden size={19} />
                <span>
                  <strong>Resolve these items first</strong>
                  {deletionReadiness.blockingReasons.includes(
                    "owned-organization",
                  ) && (
                    <p>
                      Transfer or close:{" "}
                      {deletionReadiness.ownedOrganizations
                        .map((organization) => organization.organizationName)
                        .join(", ")}
                      .
                    </p>
                  )}
                  {deletionReadiness.blockingReasons.includes(
                    "cash-balance",
                  ) && <p>Withdraw or resolve the available cash balance.</p>}
                  {deletionReadiness.blockingReasons.includes(
                    "pending-cash",
                  ) && <p>Wait for pending or held money to settle.</p>}
                  {deletionReadiness.blockingReasons.includes(
                    "active-subscription",
                  ) && <p>Cancel active subscriptions and memberships.</p>}
                  {deletionReadiness.blockingReasons.includes(
                    "account-data-unavailable",
                  ) && (
                    <p>
                      Balance and ownership checks are temporarily unavailable.
                      Try again later.
                    </p>
                  )}
                </span>
              </div>
            )}

            {deletionReadiness.totalOrganizationCredits > 0 && (
              <label className="hq-deletion-check">
                <input
                  checked={forfeitCredits}
                  disabled={!deletionReadiness.canRequestDeletion}
                  onChange={(event) => setForfeitCredits(event.target.checked)}
                  type="checkbox"
                />
                <span>
                  I understand that{" "}
                  {deletionReadiness.totalOrganizationCredits.toLocaleString()}{" "}
                  eligible non-cash organization credits may be forfeited,
                  subject to plan terms and applicable law.
                </span>
              </label>
            )}

            <label>
              Optional context
              <textarea
                maxLength={1_000}
                onChange={(event) => setReason(event.target.value)}
                value={reason}
              />
            </label>
            <label>
              Type DELETE to confirm
              <input
                autoComplete="off"
                onChange={(event) => setConfirmation(event.target.value)}
                value={confirmation}
              />
            </label>
            <div>
              <button
                className="hq-button hq-button--danger"
                disabled={
                  pending ||
                  !deletionReadiness.canRequestDeletion ||
                  confirmation !== "DELETE" ||
                  (deletionReadiness.totalOrganizationCredits > 0 &&
                    !forfeitCredits)
                }
                onClick={requestDeletion}
                type="button"
              >
                Request permanent deletion
              </button>
              <button
                className="hq-button hq-button--secondary"
                onClick={() => setConfirming(false)}
                type="button"
              >
                Keep account
              </button>
            </div>
          </div>
        ) : (
          <button
            className="hq-button hq-button--danger"
            onClick={() => setConfirming(true)}
            type="button"
          >
            <WalletCards aria-hidden size={16} />
            Review deletion requirements
          </button>
        )}
      </section>
    </div>
  );
}
