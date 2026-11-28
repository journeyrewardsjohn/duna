"use client";

import type { SetupProposal } from "@duna/api";
import {
  Button,
  Chip,
  Icon,
  RadioGroup,
  RadioOption,
  riseClassName,
  rallyStyle,
} from "@duna/ui/tideline";
import Link from "next/link";
import { useState } from "react";
import { BrandPreview } from "./brand-preview";
import { FactEditor } from "./fact-editor";
import {
  appliedEntityLink,
  decisionLabel,
  type MarkForm,
  pageName,
  proposalConfidence,
  proposalQuotes,
  proposalValue,
  valueText,
} from "./setup-model";

export type Decide = (
  proposal: SetupProposal,
  decision: "kept" | "skipped" | "edited",
  editedPayload?: Record<string, unknown>,
) => Promise<{ ok: true } | { ok: false; message: string }>;

function beforeText(fieldKey: string, before: unknown, label: string): string {
  if (before === null || before === undefined) return "Nothing yet";
  if (typeof before === "string") return before;
  if (typeof before === "object") {
    return (
      valueText(fieldKey, before as Record<string, unknown>, label) || "Set"
    );
  }
  return String(before);
}

/**
 * One proposal: the value (editable in place with the same form a person
 * fills), where it came from (the page and the quoted words), stated or
 * inferred said honestly, and Keep / Edit / Skip. On a re-read it shows
 * the current value before the proposed one. Brand proposals preview the
 * club mark on its colour, light and dark, with the contrast result.
 */
export function FactCard({
  proposal,
  index,
  currency,
  clubName,
  brand,
  onDecide,
  held,
}: {
  readonly proposal: SetupProposal;
  readonly index: number;
  readonly currency: string;
  readonly clubName: string;
  /** The brand as it would be with this run's kept values (for the preview). */
  readonly brand?: {
    readonly color: string;
    readonly logo?: string | null;
    readonly tile?: string | null;
    readonly form: MarkForm;
    readonly onFormChange: (form: MarkForm) => void;
  };
  readonly onDecide: Decide;
  /** Why "Keep all" left this one for the person. */
  readonly held?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<"kept" | "skipped" | "edited" | null>(null);
  const [error, setError] = useState<string>();
  const [choice, setChoice] = useState<string>("");
  const value = proposalValue(proposal);
  const quotes = proposalQuotes(proposal);
  const confidence = proposalConfidence(proposal);
  const status = decisionLabel(proposal.decision);
  const before = proposal.payload.before;
  const conflict =
    proposal.candidates.length > 1 && proposal.decision === "pending";
  const final =
    proposal.decision === "applied" || proposal.decision === "superseded";
  const link = appliedEntityLink(proposal.appliedEntity);
  const id = `fact-${proposal.id}`;

  const decide = async (
    decision: "kept" | "skipped" | "edited",
    payload?: Record<string, unknown>,
  ) => {
    if (busy) return;
    setBusy(decision);
    setError(undefined);
    const result = await onDecide(proposal, decision, payload);
    setBusy(null);
    if (result.ok) setEditing(false);
    else setError(result.message);
  };

  return (
    <article
      aria-labelledby={`${id}-label`}
      className={`setup-fact ${riseClassName()}`}
      data-decision={proposal.decision}
      style={rallyStyle(index)}
    >
      <header className="setup-fact__head">
        <h3 className="setup-fact__label" id={`${id}-label`}>
          {proposal.label}
        </h3>
        <div className="setup-fact__chips">
          <Chip
            kind="status"
            tone={confidence === "inferred" ? "attention" : undefined}
          >
            {confidence === "inferred" ? "Inferred" : "Stated on your site"}
          </Chip>
          <Chip kind="status" tone={status.tone}>
            {status.text}
          </Chip>
        </div>
      </header>

      {editing ? (
        <FactEditor
          currency={currency}
          error={error}
          fieldKey={proposal.fieldKey}
          idPrefix={id}
          initial={value}
          onCancel={() => {
            setEditing(false);
            setError(undefined);
          }}
          onSave={(payload) => decide("edited", payload)}
          pending={busy === "edited"}
        />
      ) : (
        <>
          {before !== undefined ? (
            <dl className="setup-fact__diff">
              <div>
                <dt>Now</dt>
                <dd>{beforeText(proposal.fieldKey, before, proposal.label)}</dd>
              </div>
              <div>
                <dt>Your website says</dt>
                <dd>{valueText(proposal.fieldKey, value, proposal.label)}</dd>
              </div>
            </dl>
          ) : (
            <p className="setup-fact__value">
              {valueText(proposal.fieldKey, value, proposal.label) || "—"}
            </p>
          )}
          {brand &&
          (proposal.fieldKey === "identity.colors" ||
            proposal.fieldKey === "identity.logo") ? (
            <BrandPreview
              color={brand.color}
              form={brand.form}
              idPrefix={id}
              logo={brand.logo}
              name={clubName}
              onFormChange={final ? undefined : brand.onFormChange}
              tile={brand.tile}
            />
          ) : null}
        </>
      )}

      {proposal.needsCheck && proposal.checkNote ? (
        <p className="setup-fact__check">
          <Icon name="alert" size="inline" />
          {proposal.checkNote}
        </p>
      ) : null}
      {held ? (
        <p className="setup-fact__check" data-held>
          <Icon name="info" size="inline" />
          {held}
        </p>
      ) : null}

      {conflict && !editing ? (
        <RadioGroup
          aria-label={`Which ${proposal.label.toLowerCase()} is right?`}
          className="setup-fact__choices"
          onValueChange={(next) => setChoice(String(next))}
          value={choice}
        >
          {proposal.candidates.map((candidate, position) => (
            <RadioOption
              key={position}
              label={valueText(proposal.fieldKey, candidate, proposal.label)}
              value={String(position)}
            />
          ))}
          <RadioOption label="Neither: skip it" value="neither" />
        </RadioGroup>
      ) : null}

      <footer className="setup-fact__foot">
        <div className="setup-fact__source">
          {quotes.length > 0 ? (
            quotes.map((quote) => (
              <figure
                className="setup-quote"
                key={`${quote.page}-${quote.text}`}
              >
                <blockquote>“{quote.text}”</blockquote>
                <figcaption>{pageName(quote.page)}</figcaption>
              </figure>
            ))
          ) : (
            <p className="setup-quiet">
              From {proposal.sourcePages.map(pageName).join(", ")}
            </p>
          )}
        </div>
        {final ? (
          link && proposal.decision === "applied" ? (
            <Link className="setup-link" href={link.href}>
              {link.label}
            </Link>
          ) : null
        ) : editing ? null : (
          <div
            className="setup-fact__actions"
            role="group"
            aria-label={`Decide on ${proposal.label}`}
          >
            <Button
              disabled={Boolean(busy) || proposal.decision === "skipped"}
              loading={busy === "skipped"}
              onClick={() => decide("skipped")}
              size="sm"
              variant="ghost"
            >
              Skip
            </Button>
            <Button
              disabled={Boolean(busy)}
              onClick={() => setEditing(true)}
              size="sm"
              variant="ghost"
            >
              Edit
            </Button>
            {conflict ? (
              <Button
                disabled={!choice || Boolean(busy)}
                loading={busy === "edited" || busy === "skipped"}
                onClick={() =>
                  choice === "neither"
                    ? decide("skipped")
                    : decide(
                        "edited",
                        proposal.candidates[Number(choice)] ?? {},
                      )
                }
                size="sm"
                variant="secondary"
              >
                Keep my choice
              </Button>
            ) : (
              <Button
                disabled={
                  Boolean(busy) ||
                  proposal.decision === "kept" ||
                  proposal.decision === "edited"
                }
                loading={busy === "kept"}
                onClick={() => decide("kept")}
                size="sm"
                variant="secondary"
              >
                {proposal.decision === "kept" || proposal.decision === "edited"
                  ? "Kept"
                  : "Keep"}
              </Button>
            )}
          </div>
        )}
      </footer>
      {error && !editing ? (
        <p className="setup-editor__error" role="alert">
          {error}
        </p>
      ) : null}
    </article>
  );
}
