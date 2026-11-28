"use client";

import {
  Button,
  Checkbox,
  Field,
  Input,
  NumberInput,
  RadioGroup,
  RadioOption,
  Rise,
  Textarea,
  useConfirm,
} from "@duna/ui/tideline";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createRefundPolicyAction } from "@/app/(next)/(hq)/money/actions";
import { unwrap } from "./money-action-result";

/** Until the club writes its own words, the terms are a marked placeholder. */
export const POLICY_PLACEHOLDER = "[club policy]";

/**
 * A new refund policy as a sentence: refundable until N hours before the
 * start, or not refundable, with the terms players read. New purchases use
 * it once it's the default; existing purchases keep the version they were
 * sold under. A person confirms before it applies.
 */
export function RefundPolicyForm({
  organization,
}: {
  readonly organization: string;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"refundable" | "non-refundable">(
    "refundable",
  );
  const [hours, setHours] = useState<number | null>(24);
  const [terms, setTerms] = useState(POLICY_PLACEHOLDER);
  const [makeDefault, setMakeDefault] = useState(false);
  const [touched, setTouched] = useState(false);
  const problems = {
    name:
      name.trim().length < 2
        ? "Give the policy a name players will recognise."
        : undefined,
    hours:
      mode === "refundable" && (hours === null || hours < 0)
        ? "Say how many hours before the start a refund is allowed."
        : undefined,
    terms:
      !terms.trim() || terms.trim() === POLICY_PLACEHOLDER
        ? "Write the terms players read before they pay."
        : undefined,
  };
  const invalid = Object.values(problems).some(Boolean);
  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} variant="secondary">
        Add a refund policy
      </Button>
    );
  }
  const summary =
    mode === "refundable"
      ? `Refundable until ${hours} ${hours === 1 ? "hour" : "hours"} before the start`
      : "Not refundable";
  return (
    <Rise className="money-inline-form" from="top">
      <form
        aria-label="New refund policy"
        onSubmit={(event) => {
          event.preventDefault();
          setTouched(true);
          if (invalid) return;
          void confirm
            .run({
              tier: "confirm",
              title: `Add “${name.trim()}”?`,
              description: `${summary}.${makeDefault ? " It becomes the default for new purchases at " + organization + "." : " Choose it on an offering to use it."}`,
              affected:
                "Players see these terms before they pay. Purchases already made keep the policy they were sold under.",
              verb: makeDefault ? "Add and make default" : "Add policy",
              cancelLabel: "Keep editing",
              agentConfirm: `Adds the refund policy “${name.trim()}”: ${summary.toLowerCase()}`,
              perform: async ({ idempotencyKey }) =>
                unwrap(
                  await createRefundPolicyAction({
                    name: name.trim(),
                    mode,
                    refundBeforeHours:
                      mode === "refundable" ? (hours ?? 0) : undefined,
                    terms: terms.trim(),
                    makeDefault,
                    idempotencyKey,
                  }),
                ),
              success: `Refund policy “${name.trim()}” added`,
            })
            .then((outcome) => {
              if (outcome.status === "done") {
                setOpen(false);
                router.refresh();
              }
            });
        }}
      >
        <Field error={touched ? problems.name : undefined} label="Policy name">
          <Input
            maxLength={120}
            onValueChange={(value) => setName(String(value ?? ""))}
            placeholder="Flexible, 24 hours"
            value={name}
          />
        </Field>
        <RadioGroup
          aria-label="Can players get a refund?"
          onValueChange={(value) => setMode(value as typeof mode)}
          value={mode}
        >
          <RadioOption label="Refundable before the start" value="refundable" />
          <RadioOption label="Not refundable" value="non-refundable" />
        </RadioGroup>
        {mode === "refundable" ? (
          <Field
            error={touched ? problems.hours : undefined}
            label="Hours before the start"
          >
            <NumberInput
              max={8760}
              min={0}
              onValueChange={(value) => setHours(value ?? null)}
              value={hours}
            />
          </Field>
        ) : null}
        <Field
          error={touched ? problems.terms : undefined}
          hint={`Replace ${POLICY_PLACEHOLDER} with your own words. Players read this before they pay.`}
          label="Terms"
        >
          <Textarea
            maxLength={10_000}
            onChange={(event) => setTerms(event.currentTarget.value)}
            rows={4}
            value={terms}
          />
        </Field>
        <Checkbox
          checked={makeDefault}
          label="Use for new purchases by default"
          onCheckedChange={(checked) => setMakeDefault(Boolean(checked))}
        />
        <div className="money-form-actions">
          <Button onClick={() => setOpen(false)} type="button" variant="ghost">
            Cancel
          </Button>
          <Button type="submit" variant="primary">
            Review policy
          </Button>
        </div>
        {confirm.dialog}
      </form>
    </Rise>
  );
}
