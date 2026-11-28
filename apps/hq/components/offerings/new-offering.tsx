"use client";

import { hqHref } from "@duna/core/hq-routes";
import { report } from "@duna/observability";
import {
  Button,
  Field,
  FormStatus,
  Input,
  MoneyInput,
  RadioGroup,
  RadioOption,
  Rise,
  useFormBehaviour,
  useOnline,
} from "@duna/ui/tideline";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { createOfferingAction } from "@/app/(next)/(hq)/offerings/actions";
import { unwrap } from "../money/money-action-result";
import {
  OFFERING_KINDS,
  templateFor,
  templatesFor,
  type OfferingKindId,
} from "./offering-model";

/**
 * "New offering" (ia-hq.md: objects instead of wizards): a kind, a
 * template, a name and a price, then the draft opens as an object where
 * every other setting has a sensible default and its own short section.
 * The old builder asked for the same thing over five steps.
 */
export function NewOffering({
  initialKind,
  initialTemplate,
  currency,
}: {
  readonly initialKind?: OfferingKindId;
  readonly initialTemplate?: string;
  readonly currency: string;
}) {
  const router = useRouter();
  const online = useOnline();
  const kindLabel = useId();
  const templateLabel = useId();
  const [kind, setKind] = useState<OfferingKindId>(initialKind ?? "services");
  const type = OFFERING_KINDS.find((entry) => entry.id === kind)!.type;
  const [templateId, setTemplateId] = useState(
    initialTemplate && templateFor(initialTemplate)?.type === type
      ? initialTemplate
      : templatesFor(type)[0]!.id,
  );
  const template = templateFor(templateId) ?? templatesFor(type)[0]!;
  const [title, setTitle] = useState(template.title);
  const [titleEdited, setTitleEdited] = useState(false);
  const [price, setPrice] = useState<number | null>(null);

  const pick = (id: string) => {
    setTemplateId(id);
    const next = templateFor(id);
    if (next && !titleEdited) setTitle(next.title);
  };

  const form = useFormBehaviour({
    validate: () => ({
      ...(title.trim().length < 2
        ? { title: "Give it a name players recognise." }
        : {}),
      ...(price === null
        ? { price: "Set a price. You can change it later." }
        : {}),
    }),
    submit: async (_values, { idempotencyKey }) => {
      const created = unwrap(
        await createOfferingAction({
          templateId: template.id,
          title: title.trim(),
          priceMinor: price ?? 0,
          idempotencyKey,
        }),
      );
      router.push(`${hqHref("offering", { itemId: created.id })}?created=1`);
      return created;
    },
    report: (error) =>
      void report(error, { event: "hq.offerings.create_failed" }),
  });

  return (
    <form {...form.formProps} className="of-new">
      <FormStatus form={form} />
      <section aria-labelledby={kindLabel} className="hqs-section">
        <div className="hqs-section__head">
          <h2 className="hqs-section__title" id={kindLabel}>
            What are you offering?
          </h2>
        </div>
        <div className="hqs-section__body">
          <RadioGroup
            aria-labelledby={kindLabel}
            className="of-choices"
            onValueChange={(value) => {
              const next = value as OfferingKindId;
              setKind(next);
              const nextType = OFFERING_KINDS.find(
                (entry) => entry.id === next,
              )!.type;
              pick(templatesFor(nextType)[0]!.id);
            }}
            value={kind}
          >
            {OFFERING_KINDS.map((entry) => (
              <RadioOption
                description={entry.description}
                key={entry.id}
                label={entry.label}
                value={entry.id}
              />
            ))}
          </RadioGroup>
        </div>
      </section>
      <section aria-labelledby={templateLabel} className="hqs-section">
        <div className="hqs-section__head">
          <h2 className="hqs-section__title" id={templateLabel}>
            Start from
          </h2>
        </div>
        <div className="hqs-section__body">
          <RadioGroup
            aria-labelledby={templateLabel}
            className="of-choices of-choices--templates"
            key={kind}
            onValueChange={(value) => pick(String(value))}
            value={template.id}
          >
            {templatesFor(type).map((entry) => (
              <RadioOption
                description={entry.summary}
                key={entry.id}
                label={entry.label}
                value={entry.id}
              />
            ))}
          </RadioGroup>
        </div>
      </section>
      <Rise from="bottom" key={template.id}>
        <section aria-label="Name and price" className="hqs-section">
          <div className="hqs-section__body of-new__fields">
            <Field error={form.errors.title} label="Name">
              <Input
                maxLength={140}
                name="title"
                onValueChange={(value) => {
                  setTitle(String(value ?? ""));
                  setTitleEdited(true);
                }}
                value={title}
              />
            </Field>
            <Field
              error={form.errors.price}
              hint="Players see Duna's service fee added at checkout."
              label={template.priceLabel}
            >
              <MoneyInput
                currency={currency}
                name="price"
                onValueChange={setPrice}
                value={price}
              />
            </Field>
            <p className="pt-quiet">
              It's saved as a private draft. Schedule, group size, photos and
              everything else have defaults you can change before you publish.
            </p>
            <div className="pt-actions">
              <Button href={hqHref("offerings")} variant="ghost">
                Cancel
              </Button>
              <Button
                disabled={!online}
                loading={form.showPending}
                type="submit"
                variant="primary"
              >
                Create draft
              </Button>
            </div>
          </div>
        </section>
      </Rise>
    </form>
  );
}
