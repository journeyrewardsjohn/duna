"use client";

import { annualPrepayPriceMinor } from "@duna/core";
import {
  Field,
  MoneyInput,
  Notice,
  NumberInput,
  Select,
  Switch,
} from "@duna/ui/tideline";
import { useState } from "react";
import { savePriceAction } from "@/app/(next)/(hq)/offerings/actions";
import { SectionFooter, useSectionSave } from "./section-save";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export interface PriceValues {
  readonly type: "service" | "plan" | "good";
  readonly subtype: string;
  readonly allowCard: boolean;
  readonly allowCash: boolean;
  readonly allowCredits: boolean;
  readonly taxable: boolean;
  readonly priceMinor?: number;
  readonly annualPriceMinor?: number;
  readonly creditCost?: number;
  readonly configuration: Record<string, unknown>;
}

/**
 * Price: how players pay (card, at the desk, credits), the price, credits,
 * a membership's billing and what it includes, a pack's credits, payment in
 * instalments and tax. Saved as a new version; a live offering is published
 * again once the person confirms. The fee lines are Money's (shown beside).
 */
export function PriceForm({
  itemId,
  title,
  live,
  values,
  currency,
  canWrite,
  hasLadder,
}: {
  readonly itemId: string;
  readonly title: string;
  readonly live: boolean;
  readonly values: PriceValues;
  readonly currency: string;
  readonly canWrite: boolean;
  /** Group size has a credit ladder: the credit price follows its top rung. */
  readonly hasLadder: boolean;
}) {
  const c = values.configuration;
  const membership = record(c.membership);
  const plan = record(c.paymentPlan);
  const isMembership =
    values.type === "plan" && values.subtype === "membership";
  const isPack = values.type === "plan" && values.subtype === "credit-pack";
  const creditsAllowed = values.type === "service";
  const [card, setCard] = useState(values.allowCard);
  const [cash, setCash] = useState(values.allowCash);
  const [credits, setCredits] = useState(values.allowCredits);
  const [price, setPrice] = useState<number | null>(values.priceMinor ?? null);
  const [creditCost, setCreditCost] = useState<number | null>(
    values.creditCost ?? null,
  );
  const [taxable, setTaxable] = useState(values.taxable);
  const [billing, setBilling] = useState(
    membership.billingMode === "annual" ? "annual" : "monthly",
  );
  const [annual, setAnnual] = useState(values.annualPriceMinor !== undefined);
  const [discount, setDiscount] = useState<number | null>(
    typeof membership.annualDiscountPercent === "number"
      ? membership.annualDiscountPercent
      : 10,
  );
  const [perCycle, setPerCycle] = useState<number | null>(
    typeof membership.includedCreditsPerCycle === "number"
      ? membership.includedCreditsPerCycle
      : 0,
  );
  const [limit, setLimit] = useState<number | null>(
    typeof membership.bookingLimitPerCycle === "number"
      ? membership.bookingLimitPerCycle
      : 0,
  );
  const [granted, setGranted] = useState<number | null>(
    typeof c.creditsGranted === "number" ? c.creditsGranted : 10,
  );
  const [instalments, setInstalments] = useState(plan.enabled === true);
  const [count, setCount] = useState(String(plan.installmentCount ?? 3));
  const [increase, setIncrease] = useState<number | null>(
    typeof plan.priceIncreasePercent === "number"
      ? plan.priceIncreasePercent
      : 0,
  );

  const problems: string[] = [];
  if (!card && !cash && !credits)
    problems.push("Choose at least one way players can pay.");
  if ((card || cash) && price === null)
    problems.push("Set the price for card or desk payments.");
  if (credits && (!creditCost || creditCost < 1))
    problems.push("Set how many credits it costs.");
  if (isPack && (!granted || granted < 1))
    problems.push("Set how many credits the pack gives.");

  const annualMinor =
    isMembership && annual && price !== null
      ? annualPrepayPriceMinor(price, discount ?? 0)
      : null;
  const configuration: Record<string, unknown> = {
    ...(isMembership
      ? {
          membership: {
            ...membership,
            billingMode: annual ? "monthly-and-annual" : billing,
            annualDiscountPercent: discount ?? 0,
            annualPrepay: {
              enabled: annual,
              monthsPaidUpfront: 12,
              discountPercent: discount ?? 0,
              creditsIssuedUpfront: (perCycle ?? 0) * 12,
              bookingAllowanceUpfront: (limit ?? 0) * 12,
            },
            includedCreditsPerCycle: perCycle ?? 0,
            bookingLimitPerCycle: limit ?? 0,
          },
        }
      : {}),
    ...(isPack ? { creditsGranted: granted ?? 0 } : {}),
    ...(values.type !== "good" && !isMembership
      ? {
          paymentPlan: {
            enabled: instalments && card,
            installmentCount: Number(count),
            priceIncreasePercent: increase ?? 0,
            interval: "month",
            customerAcknowledgementRequired: true,
            collectionMethod: "automatic",
          },
        }
      : {}),
  };
  const state = JSON.stringify({
    card,
    cash,
    credits,
    price,
    creditCost,
    taxable,
    billing,
    annual,
    discount,
    perCycle,
    limit,
    granted,
    instalments,
    count,
    increase,
  });
  const [initial] = useState(state);
  const dirty = state !== initial;
  const { button, online, dialog } = useSectionSave({
    what: "The price",
    dirty: dirty && problems.length === 0,
    live,
    title,
    republishes: true,
    perform: (idempotencyKey) =>
      savePriceAction({
        itemId,
        change: {
          allowCard: card,
          allowCash: cash,
          allowCredits: credits && creditsAllowed,
          priceMinor: card || cash ? price : null,
          annualPriceMinor: annualMinor,
          creditCost: credits ? creditCost : null,
          taxable,
          configuration,
        },
        idempotencyKey,
      }),
  });
  const disabled = !canWrite;

  return (
    <form className="of-form" onSubmit={(event) => event.preventDefault()}>
      <fieldset className="of-fieldset">
        <legend className="pt-label">Players pay</legend>
        <Switch
          checked={card}
          disabled={disabled}
          label="By card"
          onCheckedChange={setCard}
        />
        <Switch
          checked={cash}
          disabled={disabled}
          label="At the desk"
          onCheckedChange={setCash}
        />
        {creditsAllowed ? (
          <Switch
            checked={credits}
            disabled={disabled}
            label="With credits"
            onCheckedChange={setCredits}
          />
        ) : null}
      </fieldset>
      {card || cash ? (
        <Field
          hint={
            isMembership
              ? billing === "annual"
                ? "Charged every year."
                : "Charged every month."
              : "Players see Duna's service fee added at checkout."
          }
          label={
            isMembership
              ? billing === "annual"
                ? "Price per year"
                : "Price per month"
              : "Price"
          }
        >
          <MoneyInput
            currency={currency}
            disabled={disabled}
            onValueChange={setPrice}
            value={price}
          />
        </Field>
      ) : null}
      {credits && creditsAllowed ? (
        <Field
          hint={
            hasLadder
              ? "With price by group size, this is the top of the ladder: what players reserve."
              : undefined
          }
          label="Credits per booking"
        >
          <NumberInput
            disabled={disabled}
            min={1}
            onValueChange={(value) =>
              setCreditCost(value === null ? null : Math.trunc(value))
            }
            value={creditCost}
          />
        </Field>
      ) : null}
      {isMembership ? (
        <>
          <Field label="Billing">
            <Select
              disabled={disabled}
              onValueChange={(value) =>
                setBilling(value === "annual" ? "annual" : "monthly")
              }
              options={[
                { value: "monthly", label: "Every month" },
                { value: "annual", label: "Every year" },
              ]}
              value={billing}
            />
          </Field>
          {billing === "monthly" ? (
            <>
              <Switch
                checked={annual}
                description="Members can pay for a year up front."
                disabled={disabled}
                label="Offer a yearly price"
                onCheckedChange={setAnnual}
              />
              {annual ? (
                <Field
                  hint={
                    annualMinor !== null
                      ? `A year costs ${new Intl.NumberFormat("en-US", { style: "currency", currency }).format(annualMinor / 100)}.`
                      : undefined
                  }
                  label="Discount for paying yearly (%)"
                >
                  <NumberInput
                    disabled={disabled}
                    max={100}
                    min={0}
                    onValueChange={(value) => setDiscount(value)}
                    value={discount}
                  />
                </Field>
              ) : null}
            </>
          ) : null}
          <Field hint="0 for none." label="Credits included each period">
            <NumberInput
              disabled={disabled}
              min={0}
              onValueChange={(value) =>
                setPerCycle(value === null ? null : Math.trunc(value))
              }
              value={perCycle}
            />
          </Field>
          <Field hint="0 for no limit." label="Bookings allowed each period">
            <NumberInput
              disabled={disabled}
              min={0}
              onValueChange={(value) =>
                setLimit(value === null ? null : Math.trunc(value))
              }
              value={limit}
            />
          </Field>
        </>
      ) : null}
      {isPack ? (
        <Field label="Credits in the pack">
          <NumberInput
            disabled={disabled}
            min={1}
            onValueChange={(value) =>
              setGranted(value === null ? null : Math.trunc(value))
            }
            value={granted}
          />
        </Field>
      ) : null}
      {values.type !== "good" && !isMembership && card ? (
        <>
          <Switch
            checked={instalments}
            disabled={disabled}
            label="Let players pay in instalments"
            onCheckedChange={setInstalments}
          />
          {instalments ? (
            <div className="of-grid">
              <Field label="Instalments">
                <Select
                  disabled={disabled}
                  onValueChange={(value) => setCount(String(value))}
                  options={["2", "3", "4", "6"].map((value) => ({
                    value,
                    label: `${value} monthly payments`,
                  }))}
                  value={count}
                />
              </Field>
              <Field
                hint="0 if paying over time costs the same."
                label="Extra for paying over time (%)"
              >
                <NumberInput
                  disabled={disabled}
                  max={100}
                  min={0}
                  onValueChange={(value) => setIncrease(value)}
                  value={increase}
                />
              </Field>
            </div>
          ) : null}
        </>
      ) : null}
      <Switch
        checked={taxable}
        description="Sales tax is added where your club collects it."
        disabled={disabled}
        label="Charge sales tax"
        onCheckedChange={setTaxable}
      />
      {problems.length > 0 && dirty ? (
        <Notice role="alert" title="Before you save" tone="warning">
          <ul className="of-issues">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </Notice>
      ) : null}
      {canWrite ? (
        <SectionFooter online={online}>{button("Save price")}</SectionFooter>
      ) : null}
      {dialog}
    </form>
  );
}
