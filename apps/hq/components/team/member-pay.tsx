"use client";

import type { TeamPayCompensation } from "@duna/api";
import { formatMoney } from "@duna/core";
import {
  Button,
  Field,
  FilterChip,
  Input,
  MoneyInput,
  Notice,
  NumberInput,
  RadioGroup,
  RadioOption,
  Rise,
  Select,
  useConfirm,
} from "@duna/ui/tideline";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  setCompensationAction,
  setIncomeGoalAction,
} from "@/app/(next)/(hq)/team/actions";
import { unwrap } from "../money/money-action-result";
import {
  classificationLabel,
  classificationNote,
  type CompensationForm,
  compensationFormProblem,
  compensationInput,
  compensationModels,
  compensationSentence,
  compensationShapeOf,
  type Currency,
  dateSpanWords,
  firstName,
  formFromCompensation,
  type GoalPeriod,
  goalPeriods,
  type PayFrequency,
  scopeWords,
} from "./team-model";
import { payExample } from "./team-pay-example";

/**
 * "Change how … is paid" (owner): a short form, the sentence it makes, and
 * a worked example from the backend's own pay function. Starting a new
 * model ends the current one the day before; the confirmation says so.
 */
export function CompensationEditor({
  staffProfileId,
  displayName,
  current,
  currency,
  today,
  offeringKinds,
  frequency,
}: {
  readonly staffProfileId: string;
  readonly displayName: string;
  readonly current?: TeamPayCompensation;
  readonly currency: Currency;
  readonly today: string;
  readonly offeringKinds: readonly string[];
  readonly frequency?: PayFrequency;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CompensationForm>(() =>
    formFromCompensation(current, today),
  );
  const [touched, setTouched] = useState(false);
  const first = firstName(displayName);
  const problem = compensationFormProblem(form);
  const sentence = compensationSentence(compensationShapeOf(form, currency));
  const example = useMemo(
    () => payExample(form, currency, frequency),
    [currency, form, frequency],
  );
  const set = (patch: Partial<CompensationForm>) =>
    setForm((value) => ({ ...value, ...patch }));
  const usesHourly =
    form.model === "hourly" || form.model === "hourly-plus-share";
  const usesShare =
    form.model === "revenue-share" || form.model === "hourly-plus-share";
  const kinds = [...new Set([...offeringKinds, ...form.revenueShareScope])];

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} variant="secondary">
        {current ? `Change how ${first} is paid` : `Set how ${first} is paid`}
      </Button>
    );
  }

  const review = () => {
    setTouched(true);
    if (problem) return;
    void confirm
      .run({
        tier: "strong",
        title: `Pay ${first} ${sentence}?`,
        description: `From ${dateSpanWords(form.effectiveFrom, form.effectiveFrom)}, pay runs pay ${first} ${sentence}, as ${classificationLabel(form.classification)}.`,
        amount: sentence,
        recipients: displayName,
        consequence: current
          ? `${first}'s current pay (${compensationSentence(current)}) ends the day before. Pay runs already approved don't change.`
          : "Pay runs from that day use it. Nothing is paid until you approve a pay run.",
        verb: "Save the new pay",
        cancelLabel: "Don't change",
        agentConfirm: `Sets ${displayName}'s pay to ${sentence} from ${form.effectiveFrom}`,
        perform: async () =>
          unwrap(
            await setCompensationAction(
              compensationInput(staffProfileId, form, currency),
            ),
          ),
        success: `${first}'s pay is saved`,
      })
      .then((outcome) => {
        if (outcome.status === "done") {
          setOpen(false);
          router.refresh();
        }
      });
  };

  return (
    <Rise from="top">
      <form
        aria-label={`How ${first} is paid`}
        className="team-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          review();
        }}
      >
        <Field label="How they are paid">
          <RadioGroup
            className="team-presets"
            onValueChange={(value) =>
              set({ model: value as CompensationForm["model"] })
            }
            value={form.model}
          >
            {compensationModels.map((item) => (
              <RadioOption
                key={item.value}
                label={item.label}
                value={item.value}
              />
            ))}
          </RadioGroup>
        </Field>
        <div className="team-week__meta">
          {form.model === "per-session" ? (
            <Field label="Amount per session">
              <MoneyInput
                currency={currency}
                onValueChange={(value) => set({ perSessionRateMinor: value })}
                value={form.perSessionRateMinor}
              />
            </Field>
          ) : null}
          {usesHourly ? (
            <Field
              hint="Paid for the scheduled length of each session they run."
              label="Hourly rate"
            >
              <MoneyInput
                currency={currency}
                onValueChange={(value) => set({ hourlyRateMinor: value })}
                value={form.hourlyRateMinor}
              />
            </Field>
          ) : null}
          {form.model === "salary" ? (
            <Field hint="Divided over your pay periods." label="Yearly salary">
              <MoneyInput
                currency={currency}
                onValueChange={(value) => set({ annualSalaryMinor: value })}
                value={form.annualSalaryMinor}
              />
            </Field>
          ) : null}
          {usesShare ? (
            <Field
              hint="Of what the club keeps after refunds."
              label="Share (%)"
            >
              <NumberInput
                max={100}
                min={0}
                onValueChange={(value) =>
                  set({
                    revenueShareBps:
                      value === null || value === undefined
                        ? null
                        : Math.round(value * 100),
                  })
                }
                step={0.5}
                value={
                  form.revenueShareBps === null
                    ? null
                    : form.revenueShareBps / 100
                }
              />
            </Field>
          ) : null}
          <Field label="Starts on">
            <Input
              onChange={(event) =>
                set({ effectiveFrom: event.currentTarget.value })
              }
              type="date"
              value={form.effectiveFrom}
            />
          </Field>
        </div>
        {usesShare && kinds.length > 0 ? (
          <div className="team-scope">
            <span className="team-quiet">{`From: ${scopeWords(form.revenueShareScope)}`}</span>
            <div
              aria-label="Which offerings the share comes from"
              className="team-chips"
              role="group"
            >
              {kinds.map((kind) => (
                <FilterChip
                  key={kind}
                  onPressedChange={(pressed) =>
                    set({
                      revenueShareScope: pressed
                        ? [...form.revenueShareScope, kind]
                        : form.revenueShareScope.filter(
                            (item) => item !== kind,
                          ),
                    })
                  }
                  pressed={form.revenueShareScope.includes(kind)}
                >
                  {scopeWords([kind])}
                </FilterChip>
              ))}
            </div>
          </div>
        ) : null}
        <Field label="Worker classification">
          <RadioGroup
            inline
            onValueChange={(value) =>
              set({
                classification: value as CompensationForm["classification"],
              })
            }
            value={form.classification}
          >
            <RadioOption label="Contractor (1099)" value="1099-contractor" />
            <RadioOption label="Employee (W-2)" value="w2-employee" />
          </RadioGroup>
        </Field>
        <p className="team-note">{classificationNote}</p>

        <section aria-label="In words" className="team-example">
          <p className="team-example__sentence">
            <strong>{`${first}: ${sentence}`}</strong>
          </p>
          {example ? (
            <>
              <p className="team-quiet">{example.lead}</p>
              <dl className="team-example__lines">
                {example.lines.map((line) => (
                  <div key={line.label}>
                    <dt>{line.label}</dt>
                    <dd className="team-num">{line.amount}</dd>
                  </div>
                ))}
              </dl>
              <p className="team-quiet">
                Worked out the same way a pay run does. An example, not a
                promise of pay.
              </p>
            </>
          ) : (
            <p className="team-quiet">Fill in the amount to see an example.</p>
          )}
        </section>

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
            Review the new pay
          </Button>
        </div>
      </form>
      {confirm.dialog}
    </Rise>
  );
}

/** The income goal (owner): an amount and a period. */
export function GoalEditor({
  staffProfileId,
  displayName,
  currency,
  target,
  period,
}: {
  readonly staffProfileId: string;
  readonly displayName: string;
  readonly currency: Currency;
  readonly target?: number;
  readonly period?: GoalPeriod;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [amount, setAmount] = useState<number | null>(target ?? null);
  const [every, setEvery] = useState<GoalPeriod>(period ?? "month");
  const first = firstName(displayName);
  const words =
    goalPeriods.find((item) => item.value === every)?.label ?? every;
  return (
    <form
      aria-label="Income goal"
      className="team-inline-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (amount === null || amount <= 0) return;
        const goal = `${formatMoney(amount, currency)} ${words}`;
        void confirm
          .run({
            tier: "confirm",
            title: `Set ${first}'s goal to ${goal}?`,
            description: `${first} sees how much of it their delivered sessions have earned.`,
            verb: "Set the goal",
            cancelLabel: "Not now",
            agentConfirm: `Sets ${displayName}'s income goal to ${goal}`,
            perform: async () =>
              unwrap(
                await setIncomeGoalAction({
                  staffProfileId,
                  target: { amountMinor: amount, currency },
                  period: every,
                }),
              ),
            success: "Goal saved",
          })
          .then((outcome) => {
            if (outcome.status === "done") router.refresh();
          });
      }}
    >
      <Field label="Goal">
        <MoneyInput
          currency={currency}
          onValueChange={setAmount}
          value={amount}
        />
      </Field>
      <Field label="Every">
        <Select
          onValueChange={(value) => value && setEvery(value as GoalPeriod)}
          options={goalPeriods.map((item) => ({
            value: item.value,
            label: item.label.replace(/^a /, ""),
          }))}
          value={every}
        />
      </Field>
      <Button
        disabled={amount === null || amount <= 0}
        type="submit"
        variant="secondary"
      >
        Save goal
      </Button>
      {confirm.dialog}
    </form>
  );
}
