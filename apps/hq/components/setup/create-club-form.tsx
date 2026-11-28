"use client";

import {
  Button,
  Checkbox,
  Field,
  Input,
  Notice,
  RadioGroup,
  RadioOption,
  Segmented,
} from "@duna/ui/tideline";
import { useState } from "react";
import { useFormStatus } from "react-dom";

export interface PlanChoice {
  readonly id: string;
  readonly name: string;
  readonly tagline: string;
  readonly monthly: string;
  readonly annualPerMonth: string;
  readonly annualTotal: string;
  readonly feePercent: string;
  readonly free: boolean;
}

function CreateButton() {
  const { pending } = useFormStatus();
  return (
    <Button loading={pending} type="submit" variant="primary">
      Create my club
    </Button>
  );
}

/**
 * Creating the club: its name, the website if it has one (Duna reads it
 * straight after), where it plays, the plan, and the terms. Everything
 * else Duna proposes in the first run.
 */
export function CreateClubForm({
  action,
  plans,
  error,
  initialPlan,
  initialInterval,
  termsUrl,
  privacyUrl,
  termsVersion,
}: {
  readonly action: (formData: FormData) => Promise<void>;
  readonly plans: readonly PlanChoice[];
  readonly error?: string;
  readonly initialPlan: string;
  readonly initialInterval: "month" | "year";
  readonly termsUrl: string;
  readonly privacyUrl: string;
  readonly termsVersion: string;
}) {
  const [interval, setInterval] = useState<"month" | "year">(initialInterval);
  return (
    <form action={action} className="setup-create">
      {error ? (
        <Notice role="alert" title="Check one thing" tone="warning">
          {error}
        </Notice>
      ) : null}
      <Field label="Your club's name">
        <Input
          autoComplete="organization"
          minLength={2}
          name="name"
          placeholder="Sunset Beach Volleyball"
          required
        />
      </Field>
      <Field
        hint="If you have one, Duna reads it next and proposes your places, hours and prices. You can skip this."
        label="Your club's website"
        optional
      >
        <Input
          autoComplete="url"
          inputMode="url"
          name="website"
          placeholder="yourclub.com"
        />
      </Field>
      <fieldset className="setup-create__group">
        <legend className="setup-create__legend">Where do you play?</legend>
        <RadioGroup
          aria-label="Where do you play?"
          inline
          name="volleyballType"
          required
        >
          <RadioOption label="Beach" value="beach" />
          <RadioOption label="Indoor" value="indoor" />
          <RadioOption label="Both" value="both" />
        </RadioGroup>
      </fieldset>
      <fieldset className="setup-create__group">
        <legend className="setup-create__legend">Choose a plan</legend>
        <p className="setup-quiet">
          Every plan has all of Duna HQ. A paid plan lowers the fee on each
          sale.
        </p>
        <Segmented
          aria-label="Billing"
          onValueChange={(next) =>
            setInterval(next === "year" ? "year" : "month")
          }
          options={[
            { value: "month", label: "Monthly" },
            { value: "year", label: "Yearly" },
          ]}
          value={interval}
        />
        <input name="interval" type="hidden" value={interval} />
        <RadioGroup
          aria-label="Plan"
          className="setup-plans"
          defaultValue={initialPlan}
          name="plan"
        >
          {plans.map((plan) => (
            <RadioOption
              description={
                <span className="setup-plan">
                  <span className="td-num">
                    {plan.free
                      ? "No monthly fee"
                      : interval === "year"
                        ? `${plan.annualPerMonth} a month, ${plan.annualTotal} a year`
                        : `${plan.monthly} a month`}
                  </span>
                  <span>{plan.tagline}</span>
                  <span>
                    {plan.feePercent} Duna fee on each sale, plus card
                    processing
                  </span>
                </span>
              }
              key={plan.id}
              label={plan.name}
              value={plan.id}
            />
          ))}
        </RadioGroup>
      </fieldset>
      <Checkbox
        label={
          <>
            I can sign for this club and agree to the{" "}
            <a
              className="setup-link"
              href={termsUrl}
              rel="noreferrer"
              target="_blank"
            >
              Duna HQ Terms
            </a>{" "}
            (version {termsVersion}) and the{" "}
            <a
              className="setup-link"
              href={privacyUrl}
              rel="noreferrer"
              target="_blank"
            >
              Privacy Policy
            </a>
            .
          </>
        }
        name="termsAccepted"
        required
        value="on"
      />
      <CreateButton />
    </form>
  );
}
