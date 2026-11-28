"use client";

import {
  Button,
  CharacterCounter,
  Field,
  Textarea,
  useConfirm,
} from "@duna/ui/tideline";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { submitDisputeResponseAction } from "@/app/(next)/(hq)/money/actions";
import { unwrap } from "./money-action-result";

const MAX = 10_000;

/**
 * The club's written response to a dispute. Duna sends the words to the
 * buyer's bank; files can't be attached from here yet, so the club names
 * what it has (a booking record, a message) in the text. A person confirms
 * the send: it can't be changed afterwards.
 */
export function DisputeResponse({
  disputeCaseId,
  amount,
  buyer,
  deadline,
}: {
  readonly disputeCaseId: string;
  readonly amount: string;
  readonly buyer: string;
  readonly deadline?: string;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [text, setText] = useState("");
  const [touched, setTouched] = useState(false);
  const problem =
    text.trim().length < 20
      ? "Explain what happened in a few sentences (at least 20 characters)."
      : undefined;
  return (
    <form
      aria-label="Your response"
      className="money-dispute-form"
      onSubmit={(event) => {
        event.preventDefault();
        setTouched(true);
        if (problem) return;
        void confirm
          .run({
            tier: "strong",
            title: "Send your response?",
            description: `Duna sends your explanation to ${buyer}'s bank, which decides who keeps the ${amount}.`,
            amount,
            recipients: `${buyer}'s bank`,
            consequence:
              "You can send one response. It can't be changed or added to after it's sent.",
            verb: "Send response to the bank",
            cancelLabel: "Keep editing",
            agentConfirm: `Sends the club's written response on the ${amount} dispute to the buyer's bank`,
            perform: async ({ idempotencyKey }) =>
              unwrap(
                await submitDisputeResponseAction({
                  disputeCaseId,
                  explanation: text.trim(),
                  idempotencyKey,
                }),
              ),
            success:
              "Response sent. The bank usually decides within a few weeks.",
          })
          .then((outcome) => {
            if (outcome.status === "done") router.refresh();
          });
      }}
    >
      <Field
        error={touched ? problem : undefined}
        hint={
          <>
            {deadline ? `Send it by ${deadline}. ` : ""}
            Say what was bought, when it was delivered or used, and anything the
            buyer said. Files can't be attached here yet: describe them (for
            example, the booking record or a message) and keep them in case Duna
            asks. <CharacterCounter max={MAX} value={text} />
          </>
        }
        label="Your explanation"
      >
        <Textarea
          maxLength={MAX}
          onChange={(event) => setText(event.currentTarget.value)}
          rows={6}
          value={text}
        />
      </Field>
      <div className="money-form-actions">
        <Button type="submit" variant="primary">
          Review and send
        </Button>
      </div>
      {confirm.dialog}
    </form>
  );
}
