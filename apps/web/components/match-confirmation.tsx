"use client";

import { Badge } from "@duna/ui";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { confirmMatchAction } from "@/app/app/score/actions";

export function MatchConfirmation({
  confirmationRequired,
  matchId,
  status,
}: {
  readonly confirmationRequired: boolean;
  readonly matchId: string;
  readonly status:
    "pending-verification" | "verified" | "disputed" | "complete";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [disputing, setDisputing] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  const submit = (decision: "confirmed" | "disputed") => {
    setError(undefined);
    setNotice(undefined);
    startTransition(async () => {
      const response = await confirmMatchAction({
        matchId,
        decision,
        reason: decision === "disputed" ? reason : undefined,
      });
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setNotice(
        response.result.status === "verified"
          ? "Both sides confirmed. The deterministic Sand Rating update is applied."
          : response.result.status === "disputed"
            ? "The result is held for review. No rating changed."
            : "Your confirmation is recorded. Duna is waiting for the other side.",
      );
      setDisputing(false);
      router.refresh();
    });
  };

  if (status === "verified") {
    return (
      <article className="match-confirmation match-confirmation--verified">
        <CheckCircle2 aria-hidden size={22} />
        <span>
          <strong>Both sides confirmed</strong>
          <small>The rating event is immutable and replayable.</small>
        </span>
        <Badge tone="positive">Verified</Badge>
      </article>
    );
  }
  if (status === "disputed") {
    return (
      <article className="match-confirmation match-confirmation--disputed">
        <AlertTriangle aria-hidden size={22} />
        <span>
          <strong>Result held for review</strong>
          <small>No Sand Rating change is applied while disputed.</small>
        </span>
        <Badge tone="warning">Disputed</Badge>
      </article>
    );
  }
  return (
    <article className="match-confirmation">
      <div>
        <span className="page-eyebrow">Participant verification</span>
        <h2>
          {confirmationRequired
            ? "Does this result look right?"
            : "Waiting for the other side."}
        </h2>
        <p>
          A result moves ratings only after one player from each side confirms.
        </p>
      </div>
      {(notice || error) && (
        <p className={error ? "form-error" : "form-notice"} aria-live="polite">
          {error ?? notice}
        </p>
      )}
      {confirmationRequired && !disputing && (
        <div>
          <button
            className="primary-action"
            disabled={isPending}
            onClick={() => submit("confirmed")}
            type="button"
          >
            <CheckCircle2 aria-hidden size={17} />
            {isPending ? "Recording…" : "Confirm score"}
          </button>
          <button
            className="secondary-action"
            disabled={isPending}
            onClick={() => setDisputing(true)}
            type="button"
          >
            Report a problem
          </button>
        </div>
      )}
      {confirmationRequired && disputing && (
        <div className="match-confirmation__dispute">
          <label>
            What is wrong?
            <textarea
              maxLength={1_000}
              minLength={5}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Wrong score, wrong players, or another issue"
              required
              rows={3}
              value={reason}
            />
          </label>
          <div>
            <button
              className="primary-action"
              disabled={isPending || reason.trim().length < 5}
              onClick={() => submit("disputed")}
              type="button"
            >
              Hold result for review
            </button>
            <button
              className="secondary-action"
              disabled={isPending}
              onClick={() => setDisputing(false)}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
