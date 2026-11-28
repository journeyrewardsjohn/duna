"use client";

import {
  Button,
  Checkbox,
  Field,
  IconButton,
  Input,
  NumberInput,
  Textarea,
} from "@duna/ui/tideline";
import { Icon } from "@duna/ui/icons";
import { useState } from "react";
import { saveOfferingAction } from "@/app/(next)/(hq)/offerings/actions";
import {
  cleanLines,
  LineList,
  SectionFooter,
  strings,
  useSectionSave,
} from "./section-save";

interface Faq {
  question: string;
  answer: string;
}
interface Testimonial {
  quote: string;
  author: string;
  context: string;
  rating: number;
}

function faqs(value: unknown): Faq[] {
  return Array.isArray(value)
    ? value
        .filter(
          (entry): entry is Record<string, unknown> =>
            Boolean(entry) && typeof entry === "object",
        )
        .map((entry) => ({
          question: String(entry.question ?? ""),
          answer: String(entry.answer ?? ""),
        }))
    : [];
}

function testimonials(value: unknown): Testimonial[] {
  return Array.isArray(value)
    ? value
        .filter(
          (entry): entry is Record<string, unknown> =>
            Boolean(entry) && typeof entry === "object",
        )
        .map((entry) => ({
          quote: String(entry.quote ?? ""),
          author: String(entry.author ?? ""),
          context: String(entry.context ?? ""),
          rating: typeof entry.rating === "number" ? entry.rating : 5,
        }))
    : [];
}

export interface DetailsValues {
  readonly title: string;
  readonly shortSummary?: string;
  readonly description?: string;
  readonly configuration: Record<string, unknown>;
}

/**
 * Overview › Details: the words players read. Everything the old builder's
 * story step held (best for, what they get, the outcome, how it works,
 * validity and redemption notes, recommendations, FAQs, testimonials) in
 * one short form that saves in place and keeps a live offering live.
 */
export function DetailsForm({
  itemId,
  live,
  values,
  canWrite,
  others,
  isPlan,
}: {
  readonly itemId: string;
  readonly live: boolean;
  readonly values: DetailsValues;
  readonly canWrite: boolean;
  /** Other offerings it can recommend. */
  readonly others: readonly { readonly id: string; readonly title: string }[];
  readonly isPlan: boolean;
}) {
  const c = values.configuration;
  const [title, setTitle] = useState(values.title);
  const [summary, setSummary] = useState(values.shortSummary ?? "");
  const [description, setDescription] = useState(values.description ?? "");
  const [bestFor, setBestFor] = useState(String(c.bestFor ?? ""));
  const [highlights, setHighlights] = useState(strings(c.highlights));
  const [outcomeHeadline, setOutcomeHeadline] = useState(
    String(c.outcomeHeadline ?? ""),
  );
  const [outcomeBody, setOutcomeBody] = useState(String(c.outcomeBody ?? ""));
  const [howItWorks, setHowItWorks] = useState(strings(c.howItWorks));
  const [validityDays, setValidityDays] = useState<number | null>(
    typeof c.validityDays === "number" && c.validityDays > 0
      ? c.validityDays
      : null,
  );
  const [redemptionNotes, setRedemptionNotes] = useState(
    String(c.redemptionNotes ?? ""),
  );
  const [recommended, setRecommended] = useState(
    strings(c.recommendedCatalogItemIds),
  );
  const [faqList, setFaqList] = useState(faqs(c.faqs));
  const [quotes, setQuotes] = useState(testimonials(c.testimonials));

  const next = {
    title: title.trim(),
    shortSummary: summary.trim(),
    description: description.trim(),
    configuration: {
      bestFor: bestFor.trim(),
      highlights: cleanLines(highlights),
      outcomeHeadline: outcomeHeadline.trim(),
      outcomeBody: outcomeBody.trim(),
      howItWorks: cleanLines(howItWorks),
      validityDays: validityDays ?? 0,
      redemptionNotes: redemptionNotes.trim(),
      recommendedCatalogItemIds: recommended.slice(0, 4),
      faqs: faqList
        .filter((faq) => faq.question.trim() && faq.answer.trim())
        .map((faq) => ({
          question: faq.question.trim(),
          answer: faq.answer.trim(),
        })),
      testimonials: quotes
        .filter((quote) => quote.quote.trim())
        .map((quote) => ({ ...quote, quote: quote.quote.trim() })),
    },
  };
  const before = {
    title: values.title,
    shortSummary: values.shortSummary ?? "",
    description: values.description ?? "",
    configuration: {
      bestFor: String(c.bestFor ?? ""),
      highlights: strings(c.highlights),
      outcomeHeadline: String(c.outcomeHeadline ?? ""),
      outcomeBody: String(c.outcomeBody ?? ""),
      howItWorks: strings(c.howItWorks),
      validityDays: typeof c.validityDays === "number" ? c.validityDays : 0,
      redemptionNotes: String(c.redemptionNotes ?? ""),
      recommendedCatalogItemIds: strings(c.recommendedCatalogItemIds),
      faqs: faqs(c.faqs),
      testimonials: testimonials(c.testimonials),
    },
  };
  const dirty = JSON.stringify(next) !== JSON.stringify(before);
  const titleProblem =
    title.trim().length < 2
      ? "Give it a name of at least 2 characters."
      : undefined;
  const { button, online, dialog } = useSectionSave({
    what: "Details",
    dirty: dirty && !titleProblem,
    live,
    title: values.title,
    perform: (idempotencyKey) =>
      saveOfferingAction({ itemId, ...next, idempotencyKey }),
  });
  const disabled = !canWrite;

  return (
    <form className="of-form" onSubmit={(event) => event.preventDefault()}>
      <Field error={titleProblem} label="Name">
        <Input
          disabled={disabled}
          maxLength={140}
          onValueChange={(value) => setTitle(String(value ?? ""))}
          value={title}
        />
      </Field>
      <Field hint="One line on the card players see." label="Summary" optional>
        <Input
          disabled={disabled}
          maxLength={240}
          onValueChange={(value) => setSummary(String(value ?? ""))}
          value={summary}
        />
      </Field>
      <Field label="Description" optional>
        <Textarea
          disabled={disabled}
          maxLength={20_000}
          onChange={(event) => setDescription(event.currentTarget.value)}
          rows={5}
          value={description}
        />
      </Field>
      <Field label="Best for" optional>
        <Input
          disabled={disabled}
          maxLength={220}
          onValueChange={(value) => setBestFor(String(value ?? ""))}
          value={bestFor}
        />
      </Field>
      <LineList
        addLabel="Add a line"
        disabled={disabled}
        label="What they get"
        onChange={setHighlights}
        values={highlights}
      />
      <Field label="The outcome, in a headline" optional>
        <Input
          disabled={disabled}
          maxLength={180}
          onValueChange={(value) => setOutcomeHeadline(String(value ?? ""))}
          value={outcomeHeadline}
        />
      </Field>
      <Field label="The outcome, explained" optional>
        <Textarea
          disabled={disabled}
          maxLength={900}
          onChange={(event) => setOutcomeBody(event.currentTarget.value)}
          rows={3}
          value={outcomeBody}
        />
      </Field>
      <LineList
        addLabel="Add a step"
        disabled={disabled}
        label="How it works"
        maxLength={280}
        onChange={setHowItWorks}
        values={howItWorks}
      />
      {isPlan ? (
        <>
          <Field
            hint="Leave empty for no expiry."
            label="Valid for (days)"
            optional
          >
            <NumberInput
              disabled={disabled}
              min={1}
              onValueChange={(value) =>
                setValidityDays(value === null ? null : Math.trunc(value))
              }
              value={validityDays}
            />
          </Field>
          <Field label="How to use it" optional>
            <Input
              disabled={disabled}
              maxLength={280}
              onValueChange={(value) => setRedemptionNotes(String(value ?? ""))}
              value={redemptionNotes}
            />
          </Field>
        </>
      ) : null}
      {others.length > 0 ? (
        <fieldset className="of-fieldset">
          <legend className="pt-label">Recommend with it (up to 4)</legend>
          {others.map((other) => (
            <Checkbox
              checked={recommended.includes(other.id)}
              disabled={
                disabled ||
                (!recommended.includes(other.id) && recommended.length >= 4)
              }
              key={other.id}
              label={other.title}
              onCheckedChange={(checked) =>
                setRecommended((current) =>
                  checked
                    ? [...current, other.id]
                    : current.filter((id) => id !== other.id),
                )
              }
            />
          ))}
        </fieldset>
      ) : null}
      <fieldset className="of-fieldset">
        <legend className="pt-label">Questions players ask</legend>
        {faqList.map((faq, index) => (
          <div className="of-pair" key={index}>
            <Input
              aria-label={`Question ${index + 1}`}
              disabled={disabled}
              maxLength={180}
              onValueChange={(value) =>
                setFaqList((list) =>
                  list.map((entry, at) =>
                    at === index
                      ? { ...entry, question: String(value ?? "") }
                      : entry,
                  ),
                )
              }
              placeholder="Question"
              value={faq.question}
            />
            <Textarea
              aria-label={`Answer ${index + 1}`}
              disabled={disabled}
              maxLength={600}
              onChange={(event) => {
                const text = event.currentTarget.value;
                setFaqList((list) =>
                  list.map((entry, at) =>
                    at === index ? { ...entry, answer: text } : entry,
                  ),
                );
              }}
              placeholder="Answer"
              rows={2}
              value={faq.answer}
            />
            <IconButton
              disabled={disabled}
              label={`Remove question ${index + 1}`}
              onClick={() =>
                setFaqList((list) => list.filter((_, at) => at !== index))
              }
              size="sm"
            >
              <Icon name="close" size="inline" />
            </IconButton>
          </div>
        ))}
        <Button
          disabled={disabled || faqList.length >= 12}
          onClick={() =>
            setFaqList((list) => [...list, { question: "", answer: "" }])
          }
          size="sm"
          variant="secondary"
        >
          Add a question
        </Button>
      </fieldset>
      <fieldset className="of-fieldset">
        <legend className="pt-label">What players have said</legend>
        <p className="pt-quiet">
          Only real words from real players, with their permission.
        </p>
        {quotes.map((quote, index) => (
          <div className="of-pair" key={index}>
            <Textarea
              aria-label={`Quote ${index + 1}`}
              disabled={disabled}
              maxLength={500}
              onChange={(event) => {
                const text = event.currentTarget.value;
                setQuotes((list) =>
                  list.map((entry, at) =>
                    at === index ? { ...entry, quote: text } : entry,
                  ),
                );
              }}
              rows={2}
              value={quote.quote}
            />
            <Input
              aria-label={`Who said it ${index + 1}`}
              disabled={disabled}
              maxLength={100}
              onValueChange={(value) =>
                setQuotes((list) =>
                  list.map((entry, at) =>
                    at === index
                      ? { ...entry, author: String(value ?? "") }
                      : entry,
                  ),
                )
              }
              placeholder="Who said it"
              value={quote.author}
            />
            <IconButton
              disabled={disabled}
              label={`Remove quote ${index + 1}`}
              onClick={() =>
                setQuotes((list) => list.filter((_, at) => at !== index))
              }
              size="sm"
            >
              <Icon name="close" size="inline" />
            </IconButton>
          </div>
        ))}
        <Button
          disabled={disabled || quotes.length >= 6}
          onClick={() =>
            setQuotes((list) => [
              ...list,
              { quote: "", author: "", context: "", rating: 5 },
            ])
          }
          size="sm"
          variant="secondary"
        >
          Add a quote
        </Button>
      </fieldset>
      {canWrite ? (
        <SectionFooter online={online}>{button("Save details")}</SectionFooter>
      ) : null}
      {dialog}
    </form>
  );
}
