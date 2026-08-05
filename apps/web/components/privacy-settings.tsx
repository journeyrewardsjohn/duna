"use client";

import type { AccountDeletionReadiness, PlayerSettings } from "@duna/api";
import { Badge } from "@duna/ui";
import {
  AlertTriangle,
  ChevronRight,
  Download,
  ShieldAlert,
  WalletCards,
} from "lucide-react";
import { useState, useTransition } from "react";
import {
  cancelAccountDeletionAction,
  requestAccountDeletionAction,
} from "@/app/app/settings/actions";

type Request = PlayerSettings["privacyRequests"][number];

export function PrivacySettings({
  readiness,
  requests,
}: {
  readonly readiness: AccountDeletionReadiness;
  readonly requests: readonly Request[];
}) {
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [forfeitOrganizationCredits, setForfeitOrganizationCredits] =
    useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const active = requests.find((request) =>
    ["queued", "identity-review", "legal-hold"].includes(request.status),
  );
  const scheduledDeletion = active
    ? new Date(
        new Date(active.requestedAt).getTime() + 7 * 24 * 60 * 60 * 1_000,
      )
    : undefined;

  const requestDeletion = () => {
    setError(undefined);
    if (confirmation !== "DELETE") {
      setError('Type "DELETE" to confirm this account-deletion request.');
      return;
    }
    if (readiness.totalOrganizationCredits > 0 && !forfeitOrganizationCredits) {
      setError(
        "Confirm that eligible organization credits may be forfeited before continuing.",
      );
      return;
    }
    startTransition(async () => {
      const response = await requestAccountDeletionAction({
        reason,
        forfeitOrganizationCredits,
      });
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setConfirming(false);
      setNotice(
        "Deletion is scheduled in seven days. Health sharing, remote controls, public video visibility, share links, and live updates have been revoked now.",
      );
    });
  };

  const cancelDeletion = () => {
    setError(undefined);
    startTransition(async () => {
      const response = await cancelAccountDeletionAction();
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setNotice(
        "The account-deletion request was cancelled. Previously revoked sharing and public access stay off until you choose to enable them again.",
      );
    });
  };

  return (
    <section id="privacy">
      <div className="settings-section__heading">
        <div>
          <span className="page-eyebrow">Your data</span>
          <h2>Privacy + ownership</h2>
        </div>
        {active && <Badge tone="warning">{active.status}</Badge>}
      </div>

      {(notice || error) && (
        <p className={error ? "form-error" : "form-notice"} aria-live="polite">
          {error ?? notice}
        </p>
      )}

      <a className="settings-row" href="/app/settings/export">
        <Download aria-hidden size={20} />
        <span>
          <strong>Export your Duna data</strong>
          <small>
            Download a private JSON bundle of profile, ratings, registrations,
            orders, wallet entries, forms, consent history, and your audit
            actions.
          </small>
        </span>
        <ChevronRight size={17} />
      </a>

      {active ? (
        <article className="settings-row">
          <ShieldAlert aria-hidden size={20} />
          <span>
            <strong>Account-deletion request: {active.status}</strong>
            <small>
              Requested{" "}
              {new Intl.DateTimeFormat("en-US", {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(active.requestedAt))}
              .{" "}
              {active.status === "queued" && scheduledDeletion
                ? `Permanent deletion is scheduled for ${new Intl.DateTimeFormat(
                    "en-US",
                    { dateStyle: "medium", timeStyle: "short" },
                  ).format(scheduledDeletion)}.`
                : "A blocker or required legal hold must be resolved before permanent deletion."}{" "}
              Public sharing and connected remote access are already off.
            </small>
          </span>
          {active.status !== "legal-hold" && (
            <button disabled={isPending} onClick={cancelDeletion} type="button">
              {isPending ? "Cancelling…" : "Cancel request"}
            </button>
          )}
        </article>
      ) : confirming ? (
        <article className="membership-confirm deletion-confirm">
          <div className="deletion-confirm__heading">
            <ShieldAlert aria-hidden size={21} />
            <div>
              <strong>Request permanent account deletion?</strong>
              <p>
                Duna rechecks balances and account obligations, immediately
                turns off sharing and remote access, and gives you seven days to
                cancel before permanent deletion.
              </p>
            </div>
          </div>

          {readiness.blockingReasons.length > 0 && (
            <div className="deletion-blockers" role="alert">
              <strong>Resolve these items first</strong>
              {readiness.blockingReasons.includes("cash-balance") && (
                <p>
                  Withdraw or resolve{" "}
                  {new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: readiness.cash.currency,
                  }).format(readiness.cash.availableMinor / 100)}{" "}
                  in available cash. Duna does not silently forfeit withdrawable
                  money.
                </p>
              )}
              {readiness.blockingReasons.includes("pending-cash") && (
                <p>
                  Wait for pending or held wallet activity to settle before
                  deleting the account.
                </p>
              )}
              {readiness.blockingReasons.includes("active-subscription") && (
                <p>
                  Cancel active memberships or subscriptions first. Already paid
                  access remains available through the stated end date.
                </p>
              )}
              {readiness.blockingReasons.includes("owned-organization") && (
                <p>
                  Transfer ownership or close{" "}
                  {readiness.ownedOrganizations
                    .map((organization) => organization.organizationName)
                    .join(", ")}{" "}
                  before deleting the owner account.
                </p>
              )}
              {readiness.blockingReasons.includes(
                "account-data-unavailable",
              ) && (
                <p>
                  Balance and ownership checks are temporarily unavailable.
                  Reload or try again later; deletion stays disabled until those
                  checks complete.
                </p>
              )}
              <a href="/app/wallet">
                <WalletCards aria-hidden size={16} /> Review wallet
              </a>
            </div>
          )}

          {readiness.organizationCredits.length > 0 && (
            <div className="credit-forfeiture">
              <strong>
                {readiness.totalOrganizationCredits.toLocaleString()} unused
                organization credits
              </strong>
              <ul>
                {readiness.organizationCredits.map((wallet) => (
                  <li key={wallet.organizationId}>
                    {wallet.organizationName}: {wallet.credits.toLocaleString()}{" "}
                    {wallet.unit}
                  </li>
                ))}
              </ul>
              <label className="settings-checkbox">
                <input
                  checked={forfeitOrganizationCredits}
                  disabled={!readiness.canRequestDeletion}
                  onChange={(event) =>
                    setForfeitOrganizationCredits(event.target.checked)
                  }
                  type="checkbox"
                />
                <span>
                  I understand that eligible, non-cash organization credits may
                  be permanently forfeited when my deletion is completed,
                  subject to the issuing plan terms and applicable law.
                </span>
              </label>
            </div>
          )}

          <p>
            After seven days, Duna deletes your sign-in identity, imported
            Health records, videos and provider copies, posts, messages, forms,
            connected accounts, and other sensitive service data. Required
            financial, tax, fraud-prevention, safety, dispute, consent, and
            security records are retained only in restricted, de-identified form
            for their applicable period. Cancelling does not automatically
            restore links or grants that were revoked for safety. See the{" "}
            <a href="/legal/privacy">Privacy Policy</a> and{" "}
            <a href="/legal/terms">Terms of Service</a>.
          </p>
          <label>
            Optional context
            <textarea
              maxLength={1_000}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Anything the privacy reviewer should know"
              value={reason}
            />
          </label>
          <label>
            Type DELETE to confirm
            <input
              autoComplete="off"
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder="DELETE"
              value={confirmation}
            />
          </label>
          <div>
            <button
              className="primary-action"
              disabled={
                isPending ||
                !readiness.canRequestDeletion ||
                confirmation !== "DELETE" ||
                (readiness.totalOrganizationCredits > 0 &&
                  !forfeitOrganizationCredits)
              }
              onClick={requestDeletion}
              type="button"
            >
              {isPending ? "Scheduling…" : "Delete account"}
            </button>
            <button
              disabled={isPending}
              onClick={() => setConfirming(false)}
              type="button"
            >
              Keep account
            </button>
          </div>
        </article>
      ) : (
        <button
          className="settings-row"
          onClick={() => setConfirming(true)}
          type="button"
        >
          <ShieldAlert aria-hidden size={20} />
          <span>
            <strong>Delete your account</strong>
            <small>
              Check balances, subscriptions, organization ownership, and
              retained records before irreversible action.
            </small>
          </span>
          {readiness.blockingReasons.length > 0 ? (
            <Badge tone="warning">
              <AlertTriangle aria-hidden size={13} /> Action needed
            </Badge>
          ) : null}
          <ChevronRight size={17} />
        </button>
      )}
    </section>
  );
}
