"use client";

import type { z } from "zod";
import type { teamPayPeriodSchema } from "@duna/api";
import { hqHref } from "@duna/core/hq-routes";
import {
  Button,
  Field,
  Input,
  Notice,
  Rise,
  Select,
  useConfirm,
} from "@duna/ui/tideline";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  computePayRunAction,
  createPayPeriodAction,
} from "@/app/(next)/(hq)/team/actions";
import { unwrap } from "../money/money-action-result";
import {
  dateSpanWords,
  frequencyWords,
  type PayFrequency,
  payFrequencies,
} from "./team-model";

type Period = z.infer<typeof teamPayPeriodSchema>;

/** "Work out pay" for a period: computes a run (not final) and opens it. */
export function ComputeRunButton({
  period,
  hasOpenRun,
}: {
  readonly period: Period;
  readonly hasOpenRun: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const span = dateSpanWords(period.startsOn, period.endsOn);
  return (
    <>
      <Button
        onClick={() =>
          void confirm
            .run({
              tier: "confirm",
              title: `Work out pay for ${span}?`,
              description:
                "Duna adds up the sessions each person delivered in the period and their pay model. Nothing is approved or paid.",
              affected: hasOpenRun
                ? "The run waiting for approval for this period is replaced by the new one."
                : "You review every line before anything is approved.",
              verb: "Work out pay",
              cancelLabel: "Not now",
              agentConfirm: `Works out team pay for ${span}`,
              perform: async ({ idempotencyKey }) =>
                unwrap(
                  await computePayRunAction({
                    payPeriodId: period.id,
                    idempotencyKey,
                  }),
                ),
              success: "Pay worked out. Review each line.",
            })
            .then((outcome) => {
              if (outcome.status === "done") {
                const run = outcome.result as { id: string };
                router.push(hqHref("teamPayRun", { payRunId: run.id }));
              }
            })
        }
        size="sm"
        variant="primary"
      >
        Work out pay
      </Button>
      {confirm.dialog}
    </>
  );
}

/** Adds a pay period: how often, and the first day. */
export function NewPayPeriod({ today }: { readonly today: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [frequency, setFrequency] = useState<PayFrequency>("every-2-weeks");
  const [startsOn, setStartsOn] = useState(today);
  const [approveBy, setApproveBy] = useState("");
  const [touched, setTouched] = useState(false);
  const day = Number(startsOn.slice(8, 10));
  const problem = !/^\d{4}-\d{2}-\d{2}$/.test(startsOn)
    ? "Choose the first day."
    : frequency === "twice-monthly" && day !== 1 && day !== 16
      ? "Twice-a-month periods start on the 1st or the 16th."
      : approveBy && approveBy < startsOn
        ? "Approve-by is before the period starts."
        : undefined;
  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} size="sm" variant="secondary">
        Add a pay period
      </Button>
    );
  }
  return (
    <Rise from="top">
      <form
        aria-label="New pay period"
        className="team-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          setTouched(true);
          if (problem) return;
          void confirm
            .run({
              tier: "confirm",
              title: `Add a pay period from ${dateSpanWords(startsOn, startsOn)}?`,
              description: `${frequencyWords(frequency)}. Duna works out the last day.`,
              verb: "Add the pay period",
              cancelLabel: "Not now",
              agentConfirm: `Adds a ${frequency} pay period from ${startsOn}`,
              perform: async () =>
                unwrap(
                  await createPayPeriodAction({
                    frequency,
                    startsOn,
                    ...(approveBy ? { approveBy } : {}),
                  }),
                ),
              success: (period) => {
                const row = period as Period;
                return `Pay period ${dateSpanWords(row.startsOn, row.endsOn)} added`;
              },
            })
            .then((outcome) => {
              if (outcome.status === "done") {
                setOpen(false);
                router.refresh();
              }
            });
        }}
      >
        <div className="team-week__meta">
          <Field label="How often">
            <Select
              onValueChange={(value) =>
                value && setFrequency(value as PayFrequency)
              }
              options={payFrequencies.map((item) => ({
                value: item.value,
                label: item.label,
              }))}
              value={frequency}
            />
          </Field>
          <Field label="First day">
            <Input
              onChange={(event) => setStartsOn(event.currentTarget.value)}
              type="date"
              value={startsOn}
            />
          </Field>
          <Field
            hint="When you mean to approve it."
            label="Approve by"
            optional
          >
            <Input
              min={startsOn}
              onChange={(event) => setApproveBy(event.currentTarget.value)}
              type="date"
              value={approveBy}
            />
          </Field>
        </div>
        {touched && problem ? (
          <Notice role="alert" tone="attention">
            {problem}
          </Notice>
        ) : null}
        <div className="team-form__actions">
          <Button onClick={() => setOpen(false)} variant="ghost">
            Cancel
          </Button>
          <Button type="submit" variant="primary">
            Add the pay period
          </Button>
        </div>
      </form>
      {confirm.dialog}
    </Rise>
  );
}
