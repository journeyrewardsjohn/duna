"use client";

import { formatMoney } from "@duna/core";
import {
  Button,
  Field,
  MoneyInput,
  NumberInput,
  RadioGroup,
  RadioOption,
  Rise,
  Textarea,
  useConfirm,
} from "@duna/ui/tideline";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { refundOrderAction } from "@/app/(next)/(hq)/money/actions";
import { unwrap } from "./money-action-result";
import {
  refundAmountProblem,
  refundConsequence,
  type RefundMethod,
} from "./money-model";

/**
 * Refund a sale (H10, CO-9.3): to the card or as credits, in full or in
 * part, with a reason. "Review refund" opens the strong confirmation that
 * restates the amount and currency, who gets it and how, what it does to
 * the club's balance and to Duna's fees, and that it can't be undone. The
 * confirming button is single flight with one idempotency key per attempt,
 * so a double click sends one refund.
 */
export function RefundPanel({
  orderId,
  reference,
  buyerName,
  title,
  currency,
  paidMinor,
  refundableMinor,
  cardAllowed = true,
}: {
  readonly orderId: string;
  /** What the sale is called in support's tools: "Order 1a2b3c4d". */
  readonly reference: string;
  readonly buyerName: string;
  readonly title: string;
  readonly currency: string;
  /** What the buyer paid, as the backend returned it. */
  readonly paidMinor: number;
  /** What is left to refund, from the backend's paid and refunded figures. */
  readonly refundableMinor: number;
  readonly cardAllowed?: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<RefundMethod>(
    cardAllowed ? "card" : "credits",
  );
  const [amount, setAmount] = useState<number | null>(refundableMinor);
  const [credits, setCredits] = useState<number | null>(1);
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const amountProblem = refundAmountProblem({
    amountMinor: amount,
    refundableMinor,
    method,
  });
  const reasonProblem =
    reason.trim().length < 5
      ? "Say why, in a few words (at least 5 characters)."
      : undefined;
  const creditsProblem =
    method === "credits" && (!credits || credits < 1)
      ? "Enter how many credits to give back."
      : undefined;
  const money = (minor: number) => formatMoney(minor, currency);

  if (!open) {
    return (
      <div className="money-refund-start">
        <Button onClick={() => setOpen(true)} variant="secondary">
          Refund this sale
        </Button>
        <span className="money-quiet">
          {`${money(refundableMinor)} of ${money(paidMinor)} can still be refunded.`}
        </span>
      </div>
    );
  }

  const review = () => {
    setTouched(true);
    if (amountProblem || reasonProblem || creditsProblem) return;
    const full = method === "card" && amount === refundableMinor;
    const refundText =
      method === "card"
        ? money(amount ?? 0)
        : `${credits} ${credits === 1 ? "credit" : "credits"}`;
    void confirm
      .run({
        tier: "strong",
        destructive: true,
        title: `Refund ${title}?`,
        description:
          method === "card"
            ? `${buyerName} gets ${refundText} back on the card they paid with.`
            : `${buyerName} gets ${refundText} back to use at your club. No money moves.`,
        amount: method === "card" ? `${refundText} (${currency})` : refundText,
        recipients:
          method === "card"
            ? `${buyerName}, to the card they paid with`
            : `${buyerName}, as club credits`,
        consequence: refundConsequence({ method, full, buyerName }),
        reference,
        verb: `Refund ${refundText}`,
        cancelLabel: "Don't refund",
        agentConfirm: `Refunds ${refundText} to ${buyerName} for ${title} (${reference})`,
        perform: async ({ idempotencyKey }) =>
          unwrap(
            await refundOrderAction({
              orderId,
              amountMinor: method === "card" ? (amount ?? 0) : 0,
              method,
              credits:
                method === "credits" ? (credits ?? undefined) : undefined,
              reason: reason.trim(),
              idempotencyKey,
            }),
          ),
        success: `Refund of ${refundText} sent to ${buyerName}`,
      })
      .then((outcome) => {
        if (outcome.status === "done") {
          setOpen(false);
          router.refresh();
        }
      });
  };

  return (
    <Rise className="money-refund" from="top">
      <form
        aria-label="Refund"
        onSubmit={(event) => {
          event.preventDefault();
          review();
        }}
      >
        <RadioGroup
          aria-label="How to refund"
          onValueChange={(value) => setMethod(value as RefundMethod)}
          value={method}
        >
          <RadioOption
            description="The money goes back to the card they paid with."
            disabled={!cardAllowed}
            label="To the card"
            value="card"
          />
          <RadioOption
            description="For a sale paid with credits, or when the player prefers credit at your club. No money moves."
            label="As club credits"
            value="credits"
          />
        </RadioGroup>
        {method === "card" ? (
          <Field
            error={touched ? amountProblem : undefined}
            hint={`Up to ${money(refundableMinor)}. Refund less for a partial refund.`}
            label="Amount to refund"
          >
            <MoneyInput
              currency={currency}
              onValueChange={setAmount}
              value={amount}
            />
          </Field>
        ) : (
          <Field
            error={touched ? creditsProblem : undefined}
            label="Credits to give back"
          >
            <NumberInput
              min={1}
              onValueChange={(value) => setCredits(value ?? null)}
              value={credits}
            />
          </Field>
        )}
        <Field
          error={touched ? reasonProblem : undefined}
          hint="Kept with the sale. The player doesn't see it."
          label="Reason"
        >
          <Textarea
            maxLength={1000}
            onChange={(event) => setReason(event.currentTarget.value)}
            placeholder="Session cancelled because of the weather"
            rows={2}
            value={reason}
          />
        </Field>
        <div className="money-form-actions">
          <Button onClick={() => setOpen(false)} type="button" variant="ghost">
            Cancel
          </Button>
          <Button type="submit" variant="primary">
            Review refund
          </Button>
        </div>
      </form>
      {confirm.dialog}
    </Rise>
  );
}
