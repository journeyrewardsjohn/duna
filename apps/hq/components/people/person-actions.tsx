"use client";

import {
  Button,
  Field,
  Input,
  Notice,
  useAction,
  useConfirm,
} from "@duna/ui/tideline";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  changeMembershipAction,
  grantCreditsAction,
  saveDraftAction,
} from "@/app/(next)/(hq)/people/actions";
import type { NextAction } from "./people-model";
import { reportFailure, unwrap } from "./people-result";

function messageOf(error: unknown, fallback: string): string {
  return (error as { userMessage?: string } | null)?.userMessage ?? fallback;
}

/**
 * The next best action on Overview. A message is a draft handed to Inbox
 * (reviewed and sent there); a junior's goes through Inbox to the guardian.
 */
export function NextActionPanel({
  action,
  personId,
}: {
  readonly action: NextAction;
  readonly personId: string;
}) {
  const [saved, setSaved] = useState(false);
  const draft = useAction(
    async ({ idempotencyKey }) => {
      if (action.kind !== "draft") return { drafted: 0 } as const;
      return unwrap(
        await saveDraftAction({
          personId,
          subject: action.draft.subject,
          body: action.draft.body,
          channel: action.draft.channel,
          idempotencyKey,
        }),
      );
    },
    {
      messages: {
        success: "The draft is waiting in Inbox",
        error: "The draft wasn't saved. Nothing was sent.",
      },
      report: reportFailure("hq.people.draft_failed"),
      onSuccess: () => setSaved(true),
    },
  );
  return (
    <section
      aria-labelledby="next-action-title"
      className="people-next"
      data-kind={action.kind}
    >
      <p className="people-eyebrow">Next best action</p>
      <h2 className="people-next__title" id="next-action-title">
        {action.title}
      </h2>
      <p className="people-next__detail">{action.detail}</p>
      {action.kind === "draft" ? (
        <>
          <details className="people-next__draft">
            <summary>See the draft</summary>
            <p className="people-next__subject">{action.draft.subject}</p>
            <p>{action.draft.body}</p>
          </details>
          <div className="people-actions">
            {saved ? (
              <Button href="/inbox" variant="secondary">
                Open Inbox to review and send
              </Button>
            ) : (
              <Button {...draft.buttonProps} variant="primary">
                {action.verb}
              </Button>
            )}
          </div>
          {draft.error ? (
            <Notice role="alert" title="Not saved" tone="danger">
              {messageOf(
                draft.error,
                "The draft wasn't saved. Nothing was sent.",
              )}
            </Notice>
          ) : null}
        </>
      ) : action.kind === "link" ? (
        <div className="people-actions">
          <Button href={action.href} variant="secondary">
            {action.verb}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

export interface PlanRow {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly endsOn?: string;
}

/**
 * Pause, resume or cancel a plan for the member: a strong confirmation,
 * because access (and possibly money) changes. The backend states the
 * effect and any amount; until its operator procedure lands, the honest
 * "not switched on yet" comes back in the dialog and nothing changes.
 */
export function MembershipControls({
  personId,
  name,
  plan,
}: {
  readonly personId: string;
  readonly name: string;
  readonly plan: PlanRow;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const paused = plan.status === "paused";
  const ask = (action: "pause" | "resume" | "cancel") => {
    const words = {
      pause: {
        title: `Pause ${name}'s ${plan.name}?`,
        description:
          "Billing stops while the plan is paused and the member can't book with it. Duna confirms the dates and any change in amount before anything happens.",
        verb: `Pause ${plan.name}`,
        consequence:
          "The member is told by the club's own message once you send it from Inbox.",
      },
      resume: {
        title: `Resume ${name}'s ${plan.name}?`,
        description:
          "Billing starts again on the plan's next date and the member can book with it.",
        verb: `Resume ${plan.name}`,
        consequence: "The next charge follows the plan's own schedule.",
      },
      cancel: {
        title: `Cancel ${name}'s ${plan.name}?`,
        description:
          "The plan stops renewing. Access ends when the current period ends; Duna states that date and any refund before it happens.",
        verb: `Cancel ${plan.name}`,
        consequence: "A cancelled plan can't be restarted from here.",
      },
    }[action];
    void confirm
      .run({
        tier: "strong",
        destructive: action !== "resume",
        title: words.title,
        description: words.description,
        scope: `${plan.name} for ${name}`,
        recipients: name,
        consequence: words.consequence,
        reference: plan.id,
        verb: words.verb,
        cancelLabel: "Keep it as it is",
        agentConfirm: `${words.verb} for ${name}`,
        perform: async ({ idempotencyKey }) =>
          unwrap(
            await changeMembershipAction({
              personId,
              planId: plan.id,
              action,
              idempotencyKey,
            }),
          ),
        errorMessage: "Nothing was changed.",
        report: reportFailure("hq.people.membership_change_failed"),
      })
      .then((outcome) => {
        if (outcome.status === "done") router.refresh();
      });
  };
  const ended = ["cancelled", "canceled", "expired", "inactive"].includes(
    plan.status,
  );
  return (
    <div className="people-actions">
      {ended ? null : paused ? (
        <Button onClick={() => ask("resume")} size="sm" variant="secondary">
          Resume
        </Button>
      ) : (
        <Button onClick={() => ask("pause")} size="sm" variant="secondary">
          Pause
        </Button>
      )}
      {ended ? null : (
        <Button onClick={() => ask("cancel")} size="sm" variant="ghost">
          Cancel plan
        </Button>
      )}
      {confirm.dialog}
    </div>
  );
}

/** Grants club credits: money changes, so a strong confirmation that restates it. */
export function GrantCredits({
  personId,
  name,
}: {
  readonly personId: string;
  readonly name: string;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [credits, setCredits] = useState("");
  const [reason, setReason] = useState("");
  const [expires, setExpires] = useState("");
  const count = Number.parseInt(credits, 10);
  const valid =
    Number.isInteger(count) && count > 0 && reason.trim().length >= 5;
  const submit = () =>
    void confirm
      .run({
        tier: "strong",
        title: `Give ${name} ${count} ${count === 1 ? "credit" : "credits"}?`,
        description:
          "The credits are added to their club wallet and recorded in the club's ledger.",
        amount: `${count} ${count === 1 ? "credit" : "credits"}`,
        recipients: name,
        consequence: `${expires ? `They expire on ${expires}. ` : ""}Credits can't be taken back from People once granted.`,
        verb: `Give ${count} ${count === 1 ? "credit" : "credits"}`,
        cancelLabel: "Don't give credits",
        agentConfirm: `Gives ${name} ${count} club credits`,
        perform: async ({ idempotencyKey }) =>
          unwrap(
            await grantCreditsAction({
              personId,
              credits: count,
              expiresAt: expires || undefined,
              reason,
              idempotencyKey,
            }),
          ),
        success: `${count} ${count === 1 ? "credit" : "credits"} given to ${name}`,
        report: reportFailure("hq.people.credits_failed"),
      })
      .then((outcome) => {
        if (outcome.status === "done") {
          setCredits("");
          setReason("");
          setExpires("");
          router.refresh();
        }
      });
  return (
    <form
      aria-label="Give credits"
      className="people-form people-form--inline"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) submit();
      }}
    >
      <Field label="Credits">
        <Input
          inputMode="numeric"
          min={1}
          onChange={(event) => setCredits(event.currentTarget.value)}
          type="number"
          value={credits}
        />
      </Field>
      <Field label="Expires" optional>
        <Input
          onChange={(event) => setExpires(event.currentTarget.value)}
          type="date"
          value={expires}
        />
      </Field>
      <Field hint="Kept with the ledger entry." label="Why">
        <Input
          maxLength={1000}
          onChange={(event) => setReason(event.currentTarget.value)}
          placeholder="Rained-out clinic on Saturday"
          value={reason}
        />
      </Field>
      <div className="people-actions">
        <Button disabled={!valid} type="submit" variant="secondary">
          Review credits
        </Button>
      </div>
      {confirm.dialog}
    </form>
  );
}
