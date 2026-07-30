"use client";

import type { PlayerSettings } from "@duna/api";
import { Badge } from "@duna/ui";
import { ChevronRight, Download, ShieldAlert } from "lucide-react";
import { useState, useTransition } from "react";
import {
  cancelAccountDeletionAction,
  requestAccountDeletionAction,
} from "@/app/app/settings/actions";

type Request = PlayerSettings["privacyRequests"][number];

export function PrivacySettings({
  requests,
}: {
  readonly requests: readonly Request[];
}) {
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const active = requests.find((request) =>
    ["queued", "identity-review", "legal-hold"].includes(request.status),
  );

  const requestDeletion = () => {
    setError(undefined);
    startTransition(async () => {
      const response = await requestAccountDeletionAction(reason);
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setConfirming(false);
      setNotice(
        "Deletion request queued for identity and retention review. No data has been deleted yet.",
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
      setNotice("The account-deletion request was cancelled.");
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
              . Identity, tax, safety, and audit retention are reviewed before
              irreversible deletion.
            </small>
          </span>
          {active.status !== "legal-hold" && (
            <button disabled={isPending} onClick={cancelDeletion} type="button">
              {isPending ? "Cancelling…" : "Cancel request"}
            </button>
          )}
        </article>
      ) : confirming ? (
        <article className="membership-confirm">
          <strong>Request account deletion?</strong>
          <p>
            This queues a human-reviewed request; it does not immediately erase
            financial, safety, or audit records that Duna may be required to
            retain.
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
          <div>
            <button
              className="primary-action"
              disabled={isPending}
              onClick={requestDeletion}
              type="button"
            >
              {isPending ? "Queuing…" : "Queue request"}
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
              Begin an identity and retention review before irreversible action.
            </small>
          </span>
          <ChevronRight size={17} />
        </button>
      )}
    </section>
  );
}
