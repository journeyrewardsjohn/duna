"use client";

import type { OrganizationPlanId } from "@duna/core";
import { Field, MoneyInput, Segmented, Select } from "@duna/ui/tideline";
import { useMemo, useState } from "react";
import {
  calculateBooking,
  calculatorPlans,
  type CalculatorInput,
  type CalculatorTender,
  DEFAULT_CALCULATOR_INPUT,
  money,
  processingTerms,
} from "./pricing-data";

/** The largest booking price the calculator takes ($10,000). */
const MAX_PRICE_MINOR = 1_000_000;

function Row({
  label,
  value,
  sub = false,
  total = false,
  testId,
}: {
  readonly label: string;
  readonly value: string;
  readonly sub?: boolean;
  readonly total?: boolean;
  readonly testId: string;
}) {
  return (
    <div
      className="site-calc__row"
      data-sub={sub ? "" : undefined}
      data-total={total ? "" : undefined}
    >
      <dt>{label}</dt>
      <dd className="td-num" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}

/**
 * "Where every dollar of a booking goes" (spec 2.8). Driven by the real fee
 * composition (`quoteCheckoutFees`, through `calculateBooking`): the player
 * pays the price plus the service fee (none with Premium); the club is paid
 * the price less Duna's fee on its plan and the processing estimate. The
 * server renders the default example, so it reads without script.
 */
export function FeeCalculator() {
  const [input, setInput] = useState<CalculatorInput>(DEFAULT_CALCULATOR_INPUT);
  const result = useMemo(() => calculateBooking(input), [input]);
  const terms = processingTerms();
  const update = (patch: Partial<CalculatorInput>) =>
    setInput((current) => ({ ...current, ...patch }));
  return (
    <div className="site-calc">
      <form
        aria-label="Booking example"
        className="site-calc__inputs"
        onSubmit={(event) => event.preventDefault()}
      >
        <Field hint="Up to $10,000" label="Booking price">
          <MoneyInput
            name="price"
            onValueChange={(minor) =>
              update({
                priceMinor: Math.min(MAX_PRICE_MINOR, Math.max(0, minor ?? 0)),
              })
            }
            value={input.priceMinor}
          />
        </Field>
        <Field label="Club plan">
          <Select
            onValueChange={(value) =>
              value && update({ planId: value as OrganizationPlanId })
            }
            options={calculatorPlans.map((plan) => ({
              value: plan.id,
              label: plan.label,
            }))}
            value={input.planId}
          />
        </Field>
        <div className="site-calc__switch">
          <span className="site-calc__label" id="calc-premium">
            Player has Duna Premium
          </span>
          <Segmented
            aria-labelledby="calc-premium"
            onValueChange={(value) => update({ premium: value === "yes" })}
            options={[
              { value: "no", label: "No" },
              { value: "yes", label: "Yes" },
            ]}
            value={input.premium ? "yes" : "no"}
          />
        </div>
        <div className="site-calc__switch">
          <span className="site-calc__label" id="calc-tender">
            Payment
          </span>
          <Segmented
            aria-labelledby="calc-tender"
            onValueChange={(value) =>
              update({ tender: value as CalculatorTender })
            }
            options={[
              { value: "online-card", label: "Card" },
              { value: "ach", label: "Bank" },
            ]}
            value={input.tender}
          />
        </div>
        <p className="site-meta">
          Processing is an estimate: card {terms.card}; bank {terms.bank}. It
          comes out of the club’s share, not on top of the player’s price.
        </p>
      </form>
      <div aria-live="polite" className="site-calc__out">
        <dl>
          <Row
            label="Player pays"
            testId="calc-pays"
            value={money(result.playerPaysMinor)}
          />
          <Row
            label="Booking"
            sub
            testId="calc-booking"
            value={money(result.bookingMinor)}
          />
          <Row
            label="Duna service fee"
            sub
            testId="calc-service"
            value={money(result.serviceFeeMinor)}
          />
        </dl>
        <dl>
          <Row
            label="Club’s booking"
            testId="calc-club"
            value={money(result.bookingMinor)}
          />
          <Row
            label="Duna fee on the club’s plan"
            sub
            testId="calc-org"
            value={`−${money(result.organizationFeeMinor)}`}
          />
          <Row
            label="Card or bank processing (estimate)"
            sub
            testId="calc-processing"
            value={`−${money(result.processingMinor)}`}
          />
          <Row
            label="Paid out to the club"
            testId="calc-paid-out"
            total
            value={money(result.paidOutMinor)}
          />
        </dl>
      </div>
    </div>
  );
}
