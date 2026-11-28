"use client";

import { localDateOf } from "@duna/scheduling";
import {
  Avatar,
  Button,
  Checkbox,
  Field,
  LoadingState,
  Notice,
  RadioGroup,
  RadioOption,
  ReferenceLine,
  Textarea,
  type useConfirm,
} from "@duna/ui/tideline";
import { useState } from "react";
import {
  cancelItemAction,
  markPaidAction,
  previewCancelAction,
  previewRemoveBlockAction,
  removeBlockAction,
} from "@/app/(next)/(hq)/schedule/actions";
import {
  cancelLineAmount,
  cancelLineWords,
  deskMethodWords,
  handoffFor,
  policyWords,
  recipientsWords,
  type BlockPreview,
  type BlockScope,
  type CancelCause,
  type CancelPreview,
  type DeskMethod,
  type DraftHandoff,
  type RefundChoice,
} from "./schedule-desk";
import {
  clock,
  clockRange,
  longDate,
  money,
  plural,
  type ScheduleItem,
} from "./schedule-model";
import { act, reportError } from "./schedule-parts";
import {
  previewData,
  previewIsCurrent,
  usePreview,
  type Preview,
} from "./use-preview";

type Confirm = ReturnType<typeof useConfirm>;

/** A preview that failed: its words and reference, never a dead end. */
function PreviewProblem({
  preview,
  onBack,
}: {
  readonly preview: Extract<Preview<unknown>, { state: "error" }>;
  readonly onBack: () => void;
}) {
  return (
    <Notice
      action={
        <Button onClick={onBack} size="sm" variant="secondary">
          Back
        </Button>
      }
      role="alert"
      title={
        preview.denied ? "Your role can't do this" : "This couldn't be checked"
      }
      tone={preview.denied ? "warning" : "danger"}
    >
      <p>{preview.message}</p>
      {preview.reference ? (
        <ReferenceLine reference={preview.reference} />
      ) : null}
    </Notice>
  );
}

/* ------------------------------------------------------------- cancel */

/**
 * Cancelling a court booking: the refund choice and the cause, then every
 * payer's line exactly as the API plans it (who gets what back, by which
 * method), the policy in its own words, and a strong confirmation. Money
 * lines show only to people with a money permission; returning money needs
 * the owner's. Nothing is sent: the message for the people booked opens in
 * Inbox as a draft.
 */
export function BookingCancelForm({
  item,
  confirm,
  money: seesMoney,
  refund: canRefund,
  onBack,
  onDone,
}: {
  readonly item: ScheduleItem;
  readonly confirm: Confirm;
  readonly money: boolean;
  readonly refund: boolean;
  readonly onBack: () => void;
  readonly onDone: (handoff: DraftHandoff | null) => void;
}) {
  const zone = item.timeZone;
  const [choice, setChoice] = useState<RefundChoice>("by-policy");
  const [cause, setCause] = useState<CancelCause>("player-asked");
  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState(true);
  const target = {
    id: item.id,
    source: item.source,
    kind: item.kind,
    refund: choice,
    cause,
  };
  const targetKey = JSON.stringify(target);
  const preview = usePreview<CancelPreview>(targetKey, () =>
    previewCancelAction(target),
  );
  const plan = previewData(preview);
  const currency = plan?.currency ?? item.currency;
  const refundTotal = plan?.totalRefundMinor;
  const blockedByMoney = Boolean(plan?.needsMoneyPermission && !canRefund);
  const reasonOk = reason.trim().length >= 3;
  const when = `${longDate(localDateOf(Date.parse(item.startsAt), zone))}, ${clockRange(item.startsAt, item.endsAt, zone)}`;

  // Money is restated exactly as planned for the choices on screen: never
  // from an answer for earlier choices.
  const settled = previewIsCurrent(preview, targetKey);
  const submit = () => {
    if (!plan || !settled || !reasonOk || blockedByMoney) return;
    const returning = (refundTotal ?? 0) > 0;
    const recipients = recipientsWords(plan.draft);
    void confirm
      .run({
        tier: "strong",
        destructive: true,
        title: `Cancel ${item.title}${item.who ? ` for ${item.who}` : ""}?`,
        description: `${when}${item.courtName ? ` on ${item.courtName}` : ""} comes off the schedule and the court opens again. A player match linked to this booking is cancelled with it.`,
        ...(seesMoney && refundTotal !== undefined
          ? { amount: money(refundTotal, currency) }
          : {}),
        recipients: (
          <ul className="sch-affected">
            {plan.lines.map((line) => (
              <li key={`${line.name}:${line.participantId ?? line.orderId}`}>
                {line.name}: {cancelLineWords(line).toLowerCase()}
                {seesMoney && cancelLineAmount(line, currency)
                  ? ` (${cancelLineAmount(line, currency)})`
                  : ""}
              </li>
            ))}
          </ul>
        ),
        consequence: `${returning ? "A refund cannot be undone. " : ""}${
          notify && plan.draft.recipients.length > 0
            ? `Nothing is sent: a message for ${recipients} opens in Inbox for you to review.`
            : "Nobody is told from here."
        }`,
        reference: `Booking ${item.id.slice(0, 8)}`,
        verb:
          returning && seesMoney && refundTotal !== undefined
            ? `Cancel and refund ${money(refundTotal, currency)}`
            : "Cancel the booking",
        cancelLabel: "Keep the booking",
        agentConfirm: `Cancels ${item.title} at ${clock(item.startsAt, zone)}${returning ? " and refunds the payers" : ""}`,
        perform: ({ idempotencyKey }) =>
          act(
            cancelItemAction({
              id: item.id,
              source: item.source,
              kind: item.kind,
              reason: reason.trim(),
              refund: choice,
              cause,
              previewToken: plan.previewToken,
              notify,
              idempotencyKey,
            }),
          ),
        success: (result) =>
          result.lines?.some((line) => line.outcome === "refund-failed")
            ? `${item.title} cancelled. A refund didn't go through: see Money.`
            : `${item.title} cancelled`,
        report: reportError,
      })
      .then((outcome) => {
        if (outcome.status !== "done") return;
        onDone(
          notify
            ? handoffFor(
                `${item.title} cancelled`,
                outcome.result.draft,
                outcome.result.conciergeDraft,
              )
            : null,
        );
      });
  };

  return (
    <form
      aria-label={`Cancel ${item.title}`}
      className="sch-form"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <RadioGroup
        aria-label="Why it is cancelled"
        onValueChange={(value: unknown) => setCause(value as CancelCause)}
        value={cause}
      >
        <RadioOption
          description="The reservation policy decides what comes back."
          label="The player asked"
          value="player-asked"
        />
        <RadioOption
          description="Weather, a closure or our mistake: every payer gets their money back in full."
          label="The club is cancelling"
          value="club"
        />
      </RadioGroup>
      {cause === "player-asked" ? (
        <RadioGroup
          aria-label="Refund"
          onValueChange={(value: unknown) => setChoice(value as RefundChoice)}
          value={choice}
        >
          <RadioOption label="By the policy" value="by-policy" />
          <RadioOption label="Full refund" value="full" />
          <RadioOption label="No refund" value="none" />
        </RadioGroup>
      ) : null}

      <section aria-label="Who gets what back" aria-live="polite">
        <h3>Who gets what back</h3>
        {preview.state === "error" ? (
          <PreviewProblem onBack={onBack} preview={preview} />
        ) : !plan ? (
          <LoadingState
            count={2}
            label="Working out each payer's refund…"
            layout="list"
          />
        ) : (
          <>
            <p className="sch-quiet">{policyWords(plan)}</p>
            <ul className="sch-roster" data-testid="cancel-lines">
              {plan.lines.map((line) => {
                const amount = seesMoney
                  ? cancelLineAmount(line, currency)
                  : undefined;
                return (
                  <li
                    key={`${line.name}:${line.participantId ?? line.orderId}`}
                  >
                    <Avatar decorative name={line.name} size="sm" />
                    <span className="sch-roster__who">
                      <span className="sch-roster__name">{line.name}</span>
                      <small>{cancelLineWords(line)}</small>
                    </span>
                    {amount ? (
                      <span className="sch-time sch-roster__amount">
                        {amount}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {seesMoney && refundTotal !== undefined ? (
              <p className="sch-price">
                <span className="sch-price__label">Total back</span>
                <span className="sch-time">{money(refundTotal, currency)}</span>
              </p>
            ) : null}
            {blockedByMoney ? (
              <Notice tone="warning" title="Returning money needs the owner">
                Choose “No refund”, or ask someone with the money permission to
                cancel it.
              </Notice>
            ) : null}
          </>
        )}
      </section>

      <Field
        error={
          reason.length > 0 && !reasonOk ? "Say why in a few words." : undefined
        }
        label="Reason, for the record and the message draft"
      >
        <Textarea
          onChange={(event) => setReason(event.currentTarget.value)}
          rows={2}
          value={reason}
        />
      </Field>
      {plan && plan.draft.recipients.length > 0 ? (
        <Checkbox
          checked={notify}
          description="It opens in Inbox for you to review and send. Nothing is sent from here."
          label={`Prepare a message for ${recipientsWords(plan.draft)}`}
          onCheckedChange={(checked) => setNotify(checked === true)}
        />
      ) : null}
      <div className="sch-actions">
        <Button onClick={onBack} variant="secondary">
          Back
        </Button>
        <Button
          disabled={!plan || !settled || !reasonOk || blockedByMoney}
          type="submit"
          variant="danger"
        >
          Review the cancellation
        </Button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------- desk payment */

const methods: readonly DeskMethod[] = [
  "cash",
  "card-at-desk-external",
  "other",
];

/**
 * Recording money taken at the desk: the whole amount due, how it was
 * paid, and a strong confirmation saying plainly what it does (marks the
 * booking paid at the desk) and does not (no card is charged; Money shows
 * it paid with no processor payment).
 */
export function DeskPaymentForm({
  item,
  dueMinor,
  confirm,
  onBack,
  onDone,
}: {
  readonly item: ScheduleItem;
  readonly dueMinor: number;
  readonly confirm: Confirm;
  readonly onBack: () => void;
  readonly onDone: () => void;
}) {
  const [method, setMethod] = useState<DeskMethod>("cash");
  const [note, setNote] = useState("");
  const amount = money(dueMinor, item.currency);
  const who = item.who ?? item.people[0]?.name ?? item.title;
  return (
    <form
      aria-label="Record a desk payment"
      className="sch-form"
      onSubmit={(event) => {
        event.preventDefault();
        void confirm
          .run({
            tier: "strong",
            title: `Record ${amount} paid at the desk?`,
            description: `Marks ${who}'s booking paid at the desk (${deskMethodWords[method].toLowerCase()}).`,
            amount,
            recipients: who,
            consequence:
              "No card is charged and no money moves in Duna Pay. Money shows the booking as paid with no processor payment.",
            reference: `Booking ${item.id.slice(0, 8)}`,
            verb: `Record ${amount} paid`,
            cancelLabel: "Not yet",
            agentConfirm: `Records ${amount} paid at the desk for ${who}`,
            perform: ({ idempotencyKey }) =>
              act(
                markPaidAction({
                  id: item.id,
                  source: item.source,
                  kind: item.kind,
                  amountMinor: dueMinor,
                  method,
                  ...(note.trim() ? { note: note.trim() } : {}),
                  idempotencyKey,
                }),
              ),
            success: `${amount} recorded as paid at the desk`,
            report: reportError,
          })
          .then((outcome) => {
            if (outcome.status === "done") onDone();
          });
      }}
    >
      <p className="sch-price">
        <span className="sch-price__label">Amount due</span>
        <span className="sch-time">{amount}</span>
      </p>
      <p className="sch-quiet">
        Only the whole amount due can be recorded. Part payments aren't recorded
        here.
      </p>
      <RadioGroup
        aria-label="How it was paid"
        onValueChange={(value: unknown) => setMethod(value as DeskMethod)}
        value={method}
      >
        {methods.map((value) => (
          <RadioOption
            key={value}
            label={deskMethodWords[value]}
            value={value}
          />
        ))}
      </RadioGroup>
      <Field label="Note" optional>
        <Textarea
          onChange={(event) => setNote(event.currentTarget.value)}
          rows={2}
          value={note}
        />
      </Field>
      <div className="sch-actions">
        <Button onClick={onBack} variant="secondary">
          Back
        </Button>
        <Button type="submit" variant="primary">
          Review the payment
        </Button>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------- blocks */

/**
 * Removing a block: a weekly block for this date, this and later dates, or
 * every week; and when sessions or bookings were cancelled under a closure,
 * the acknowledgement the API requires, in its words: removing the block
 * does not bring them back.
 */
export function RemoveBlockForm({
  item,
  date,
  confirm,
  onBack,
  onDone,
}: {
  readonly item: ScheduleItem;
  readonly date: string;
  readonly confirm: Confirm;
  readonly onBack: () => void;
  readonly onDone: () => void;
}) {
  const zone = item.timeZone;
  const preview = usePreview<BlockPreview>(`${item.id}:${date}`, () =>
    previewRemoveBlockAction({ id: item.id, date }),
  );
  const block = previewData(preview);
  const weekly = block?.kind === "weekly";
  const [scope, setScope] = useState<BlockScope>("this-occurrence");
  const [reason, setReason] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const cancelled = block?.cancelledUnder ?? [];
  const needsAck = cancelled.length > 0;
  const reasonOk = reason.trim().length >= 3;
  const where = item.courtName ?? "the schedule";
  const scopeWords: Record<BlockScope, string> = {
    this: `${clockRange(item.startsAt, item.endsAt, zone)} on ${longDate(date)}`,
    "this-occurrence": `${longDate(date)} only`,
    "this-and-following": `${longDate(date)} and every week after`,
    all: "every week",
  };
  const chosen: BlockScope = weekly ? scope : "this";

  return (
    <form
      aria-label="Remove the block"
      className="sch-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!block || !reasonOk || (needsAck && !acknowledged)) return;
        void confirm
          .run({
            tier: "confirm",
            destructive: true,
            title: `Remove the block on ${where}?`,
            description: `${scopeWords[chosen]} opens again for bookings.`,
            ...(needsAck
              ? {
                  affected: `${plural(cancelled.length, "session or booking", "sessions or bookings")} cancelled under it stay${cancelled.length === 1 ? "s" : ""} cancelled.`,
                }
              : {}),
            verb: "Remove block",
            cancelLabel: "Keep block",
            agentConfirm: `Removes the block on ${where} (${scopeWords[chosen]})`,
            perform: ({ idempotencyKey }) =>
              act(
                removeBlockAction({
                  id: item.id,
                  scope: chosen,
                  date,
                  reason: reason.trim(),
                  ...(needsAck ? { acknowledgeCancelled: true } : {}),
                  idempotencyKey,
                }),
              ),
            success: "Block removed",
            report: reportError,
          })
          .then((outcome) => {
            if (outcome.status === "done") onDone();
          });
      }}
    >
      {preview.state === "error" ? (
        <PreviewProblem onBack={onBack} preview={preview} />
      ) : !block ? (
        <LoadingState count={1} label="Checking the block…" layout="list" />
      ) : (
        <>
          {weekly ? (
            <RadioGroup
              aria-label="Which dates"
              onValueChange={(value: unknown) => setScope(value as BlockScope)}
              value={scope}
            >
              <RadioOption
                label={`This date only (${longDate(date)})`}
                value="this-occurrence"
              />
              <RadioOption
                label="This date and every week after"
                value="this-and-following"
              />
              <RadioOption label="Every week" value="all" />
            </RadioGroup>
          ) : (
            <p className="sch-quiet">
              {clockRange(item.startsAt, item.endsAt, zone)} on {where} opens
              again for bookings.
            </p>
          )}
          {needsAck ? (
            <Notice
              tone="warning"
              title={`Cancelled under this ${item.blockMode === "weather" ? "weather hold" : "closure"}`}
            >
              <ul className="sch-affected">
                {cancelled.map((entry) => (
                  <li key={entry.id}>
                    {entry.title} ·{" "}
                    <span className="sch-time">
                      {clock(entry.startsAt, zone)}
                    </span>
                  </li>
                ))}
              </ul>
              <Checkbox
                checked={acknowledged}
                label="Removing it does not bring them back. I understand they stay cancelled."
                onCheckedChange={(checked) => setAcknowledged(checked === true)}
              />
            </Notice>
          ) : null}
        </>
      )}
      <Field
        error={
          reason.length > 0 && !reasonOk ? "Say why in a few words." : undefined
        }
        label="Why it is removed"
      >
        <Textarea
          onChange={(event) => setReason(event.currentTarget.value)}
          rows={2}
          value={reason}
        />
      </Field>
      <div className="sch-actions">
        <Button onClick={onBack} variant="secondary">
          Back
        </Button>
        <Button
          disabled={!block || !reasonOk || (needsAck && !acknowledged)}
          type="submit"
          variant="danger"
        >
          Review the removal
        </Button>
      </div>
    </form>
  );
}
