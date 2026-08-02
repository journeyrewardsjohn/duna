"use client";

import type { MatchSummary } from "@duna/core";
import { AlertTriangle, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  flagMatchHistoryAction,
  removeSelfReportedMatchAction,
} from "@/app/app/score/actions";

export function MatchHistoryControls({
  match,
}: {
  readonly match: MatchSummary;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [reasonCode, setReasonCode] = useState<
    "not-me" | "wrong-score" | "wrong-opponents" | "duplicate" | "other"
  >("wrong-score");
  const [details, setDetails] = useState("");
  const [feedback, setFeedback] = useState<string>();

  function flag() {
    setFeedback(undefined);
    startTransition(async () => {
      const response = await flagMatchHistoryAction({
        matchId: match.id,
        reasonCode,
        details: details.trim() || undefined,
      });
      if (!response.ok) {
        setFeedback(response.error);
        return;
      }
      setFeedback(
        "This match is publicly marked under review and held out of future Sand Rating calculations until an administrator resolves it.",
      );
      setOpen(false);
      router.refresh();
    });
  }

  function remove() {
    if (
      !window.confirm(
        "Remove this unrated self-reported match from your history?",
      )
    ) {
      return;
    }
    startTransition(async () => {
      const response = await removeSelfReportedMatchAction(match.id);
      if (!response.ok) {
        setFeedback(response.error);
        return;
      }
      router.push("/app/matches");
      router.refresh();
    });
  }

  return (
    <section className="match-history-controls">
      <div>
        <span>
          <AlertTriangle aria-hidden size={19} />
          <strong>Something wrong with this history?</strong>
        </span>
        {match.dispute ? (
          <small>
            Review pending · {match.dispute.reasonCode.replaceAll("-", " ")}
          </small>
        ) : (
          <small>
            Imported evidence stays visible while Duna validates disputes.
          </small>
        )}
      </div>
      {feedback && <p aria-live="polite">{feedback}</p>}
      {!match.dispute && !open && (
        <div>
          <button
            disabled={isPending}
            onClick={() => setOpen(true)}
            type="button"
          >
            Mark inaccurate
          </button>
          {match.canRemove && (
            <button disabled={isPending} onClick={remove} type="button">
              <Trash2 aria-hidden size={15} /> Remove match
            </button>
          )}
        </div>
      )}
      {open && (
        <div className="match-history-controls__form">
          <label>
            What is inaccurate?
            <select
              onChange={(event) =>
                setReasonCode(event.target.value as typeof reasonCode)
              }
              value={reasonCode}
            >
              <option value="not-me">I did not play this match</option>
              <option value="wrong-score">The score is wrong</option>
              <option value="wrong-opponents">Players are wrong</option>
              <option value="duplicate">This is a duplicate</option>
              <option value="other">Something else</option>
            </select>
          </label>
          <label>
            Helpful details <small>Optional</small>
            <textarea
              maxLength={1_000}
              onChange={(event) => setDetails(event.target.value)}
              rows={3}
              value={details}
            />
          </label>
          <span>
            <button disabled={isPending} onClick={flag} type="button">
              {isPending ? "Submitting…" : "Submit for review"}
            </button>
            <button
              disabled={isPending}
              onClick={() => setOpen(false)}
              type="button"
            >
              Cancel
            </button>
          </span>
        </div>
      )}
    </section>
  );
}
