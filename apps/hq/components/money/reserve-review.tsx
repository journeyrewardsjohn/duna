"use client";

import { Button, Field, Rise, Textarea, useAction } from "@duna/ui/tideline";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { requestReserveReviewAction } from "@/app/(next)/(hq)/money/actions";
import { unwrap } from "./money-action-result";
import { actionError } from "./money-client";

/**
 * "Ask for a review" of a reserve: the club may ask at any time; a Duna
 * person replies. It sends a note, moves no money and activates nothing.
 */
export function ReserveReview({ reserveId }: { readonly reserveId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const problem =
    note.trim().length < 5 ? "Say why, in a sentence or two." : undefined;
  const send = useAction(
    async () => {
      setTouched(true);
      if (problem) {
        throw Object.assign(new Error(problem), { userMessage: problem });
      }
      return unwrap(
        await requestReserveReviewAction({ reserveId, note: note.trim() }),
      );
    },
    {
      messages: {
        success: "Review requested. A Duna person will reply.",
        error: (error) => actionError(error, "The review request wasn't sent."),
      },
      onSuccess: () => {
        setOpen(false);
        router.refresh();
      },
    },
  );
  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} size="sm" variant="secondary">
        Ask for a review
      </Button>
    );
  }
  return (
    <Rise className="money-inline-form" from="top">
      <Field
        error={touched ? problem : undefined}
        label="Why should Duna review this reserve?"
      >
        <Textarea
          maxLength={2000}
          onChange={(event) => setNote(event.currentTarget.value)}
          rows={3}
          value={note}
        />
      </Field>
      <div className="money-form-actions">
        <Button onClick={() => setOpen(false)} size="sm" variant="ghost">
          Cancel
        </Button>
        <Button {...send.buttonProps} size="sm" variant="primary">
          Send review request
        </Button>
      </div>
    </Rise>
  );
}
