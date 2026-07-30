"use client";

import type { GuardianReviewItem } from "@duna/api";
import { Badge } from "@duna/ui";
import { Check, ShieldCheck, X } from "lucide-react";
import { useActionState } from "react";
import {
  reviewGuardianshipAction,
  type GuardianReviewActionState,
} from "@/app/admin/actions";

const initialState: GuardianReviewActionState = {
  status: "idle",
  message: "",
};

export function GuardianReviewCard({
  review,
}: {
  readonly review: GuardianReviewItem;
}) {
  const [state, action, pending] = useActionState(
    reviewGuardianshipAction,
    initialState,
  );
  const consentReady = review.consent?.granted === true;

  return (
    <article className="guardian-review-card">
      <header>
        <span>
          <ShieldCheck size={18} />
        </span>
        <div>
          <strong>
            {review.guardianName} → {review.minorName}
          </strong>
          <small>
            {review.relationship} ·{" "}
            {review.minorAgeBand === "under-13" ? "Under 13" : "Age 13–17"}
          </small>
        </div>
        <Badge tone={consentReady ? "positive" : "danger"}>
          {consentReady ? "Consent recorded" : "Consent missing"}
        </Badge>
      </header>

      <dl>
        <div>
          <dt>Guardian permissions</dt>
          <dd>
            {review.emergencyContact ? "Emergency contact" : "Not emergency"} ·{" "}
            {review.canApproveSpending
              ? "May approve spending"
              : "No spending approval"}
          </dd>
        </div>
        <div>
          <dt>Consent evidence</dt>
          <dd>
            {review.consent
              ? `${review.consent.method.replaceAll("-", " ")} · ${review.consent.disclosureVersion} · ${new Intl.DateTimeFormat(
                  "en-US",
                  {
                    dateStyle: "medium",
                    timeStyle: "short",
                  },
                ).format(new Date(review.consent.occurredAt))}`
              : "No affirmative consent record"}
          </dd>
        </div>
      </dl>

      <form action={action}>
        <input type="hidden" name="guardianId" value={review.guardianId} />
        <input type="hidden" name="minorId" value={review.minorId} />
        <label>
          <span>Review rationale</span>
          <textarea
            name="reason"
            minLength={10}
            maxLength={500}
            placeholder="Describe the evidence checked and the decision."
            required
          />
        </label>
        <div>
          <button
            className="hq-button hq-button--secondary"
            type="submit"
            name="decision"
            value="rejected"
            disabled={pending}
          >
            <X size={15} /> Reject
          </button>
          <button
            className="hq-button"
            type="submit"
            name="decision"
            value="verified"
            disabled={pending || !consentReady}
          >
            <Check size={15} /> Verify relationship
          </button>
        </div>
        {state.message && (
          <p
            className={`guardian-review-status guardian-review-status--${state.status}`}
            role="status"
            aria-live="polite"
          >
            {state.message}
          </p>
        )}
      </form>
    </article>
  );
}
