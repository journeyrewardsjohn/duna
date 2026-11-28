"use client";

import { hqHref } from "@duna/core/hq-routes";
import { Icon } from "@duna/ui/icons";
import {
  Button,
  Field,
  Input,
  Notice,
  PaneTransition,
  RallyLoader,
  Select,
  Textarea,
  useAction,
} from "@duna/ui/tideline";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  createProgramAction,
  proposeProgramAction,
} from "@/app/(next)/(hq)/training/actions";
import { unwrap } from "../money/money-action-result";
import { reportFailure } from "../team/team-report";
import {
  CoachRows,
  type CoachChoice,
  ExceptionRows,
  SlotRows,
} from "./pattern-editor";
import {
  dateRangeWords,
  draftProblems,
  type ProgramDraft,
  type ProgramProposal,
  patternPractices,
  patternSentence,
  proposalPills,
} from "./program-model";

export const EXAMPLE_SENTENCE =
  "U16 girls, Tuesdays and Thursdays 5 to 7 and Saturdays 9 to 11, 6 January to 28 March, no practice 14 February";

/**
 * New program (TR-New): ONE sentence, read by Duna into a summary the
 * owner corrects in place (each practice day with its own times, dates
 * off, coaches, place), saved as a draft. Nothing is scheduled until the
 * program is activated, behind its own confirmation.
 */
export function NewProgram({
  coaches,
  venues,
}: {
  readonly coaches: readonly CoachChoice[];
  readonly venues: readonly { readonly id: string; readonly name: string }[];
}) {
  const router = useRouter();
  const [sentence, setSentence] = useState("");
  const [proposal, setProposal] = useState<ProgramProposal>();
  const [draft, setDraft] = useState<ProgramDraft>();
  const [touched, setTouched] = useState(false);

  const read = useAction(
    async () => unwrap(await proposeProgramAction(sentence.trim())),
    {
      report: reportFailure("hq.training.propose_failed"),
      onSuccess: (result) => {
        setProposal(result);
        setDraft(result.draft);
        setTouched(false);
      },
    },
  );

  const save = useAction(
    async ({ idempotencyKey }) => {
      if (!draft) throw new Error("No draft");
      return unwrap(
        await createProgramAction({
          ...draft,
          sourceText: proposal?.sourceText,
          idempotencyKey,
        }),
      );
    },
    {
      report: reportFailure("hq.training.create_failed"),
      messages: { success: (program) => `${program.title} saved as a draft` },
      onSuccess: (program) =>
        router.push(hqHref("trainingProgram", { programId: program.id })),
    },
  );

  const problems = draft ? draftProblems(draft) : undefined;
  const practices = useMemo(
    () =>
      draft
        ? patternPractices({
            startDate: draft.startDate,
            endDate: draft.endDate,
            timezone: draft.timezone,
            slots: draft.weeklySlots,
            exceptions: draft.exceptions,
          })
        : [],
    [draft],
  );
  const update = (change: Partial<ProgramDraft>) =>
    setDraft((current) => (current ? { ...current, ...change } : current));
  const venueId = draft?.weeklySlots[0]?.venueId;
  const tooShort = sentence.trim().length < 10;

  return (
    <PaneTransition
      direction="forward"
      transitionKey={draft ? "draft" : "sentence"}
    >
      {!draft ? (
        <form
          aria-label="Describe the program"
          className="tr-card tr-sentence"
          onSubmit={(event) => {
            event.preventDefault();
            if (!tooShort) void read.run();
          }}
        >
          <Field
            hint="Who it's for, the days and times (each day can have its own), the first and last day, and any days off, tournaments or travel."
            label="Describe the season in one sentence"
          >
            <Textarea
              autoResize
              maxLength={4000}
              name="sentence"
              onChange={(event) => setSentence(event.currentTarget.value)}
              placeholder={EXAMPLE_SENTENCE}
              rows={3}
              value={sentence}
            />
          </Field>
          <div className="tr-actions">
            <Button
              disabled={tooShort}
              loading={read.showPending}
              type="submit"
              variant="primary"
            >
              Read it
            </Button>
            <Button
              onClick={() => setSentence(EXAMPLE_SENTENCE)}
              type="button"
              variant="ghost"
            >
              Use the example
            </Button>
          </div>
          {read.showPending ? (
            <RallyLoader label="Reading the sentence" />
          ) : null}
          {read.status === "error" ? (
            <Notice title="Duna couldn't read that" tone="attention">
              {read.error instanceof Error ? read.error.message : null}
            </Notice>
          ) : null}
          <p className="tr-quiet">
            Nothing is saved or scheduled from here until you look it over.
          </p>
        </form>
      ) : (
        <form
          aria-label="Check the program"
          className="tr-stack"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            setTouched(true);
            if (problems && problems.errors.length === 0) void save.run();
          }}
        >
          <section aria-label="What Duna read" className="tr-card tr-read">
            <p className="tr-read__title">
              <Icon name="check" size="inline" />
              What Duna read
            </p>
            <blockquote className="tr-read__quote">
              {proposal?.sourceText}
            </blockquote>
            <ul aria-label="Read from the sentence" className="tr-pills">
              {proposalPills(draft).map((pill) => (
                <li className="tr-pill" key={`${pill.label}-${pill.value}`}>
                  <span>{pill.label}</span>
                  <b>{pill.value}</b>
                </li>
              ))}
            </ul>
            {proposal && proposal.assumptions.length > 0 ? (
              <p className="tr-quiet">
                {`Assumed: ${proposal.assumptions.join("; ")}.`}
              </p>
            ) : null}
            {proposal && proposal.needsCheck.length > 0 ? (
              <Notice title="Check these" tone="info">
                <ul className="tr-list">
                  {proposal.needsCheck.map((item) => (
                    <li key={`${item.field}-${item.note}`}>{item.note}</li>
                  ))}
                </ul>
              </Notice>
            ) : null}
            <Button
              onClick={() => {
                setDraft(undefined);
                setProposal(undefined);
              }}
              size="sm"
              variant="ghost"
            >
              Change the sentence
            </Button>
          </section>

          <section aria-labelledby="np-program" className="tr-card">
            <h2 className="tr-h2" id="np-program">
              Program
            </h2>
            <div className="tr-grid2">
              <Field
                error={
                  touched && !draft.title.trim() ? "Give it a name." : undefined
                }
                label="Name"
              >
                <Input
                  maxLength={160}
                  onChange={(event) =>
                    update({ title: event.currentTarget.value })
                  }
                  value={draft.title}
                />
              </Field>
              <Field label="Who it's for" optional>
                <Input
                  maxLength={500}
                  onChange={(event) =>
                    update({ targetAudience: event.currentTarget.value })
                  }
                  value={draft.targetAudience}
                />
              </Field>
              <Field label="First day">
                <Input
                  onChange={(event) =>
                    update({ startDate: event.currentTarget.value })
                  }
                  type="date"
                  value={draft.startDate}
                />
              </Field>
              <Field label="Last day">
                <Input
                  onChange={(event) =>
                    update({ endDate: event.currentTarget.value })
                  }
                  type="date"
                  value={draft.endDate}
                />
              </Field>
              {venues.length > 0 ? (
                <Field label="Place">
                  <Select
                    onValueChange={(value) =>
                      value !== null &&
                      update({
                        weeklySlots: draft.weeklySlots.map((slot) => ({
                          ...slot,
                          venueId: value,
                        })),
                      })
                    }
                    options={venues.map((venue) => ({
                      value: venue.id,
                      label: venue.name,
                    }))}
                    value={
                      venues.some((venue) => venue.id === venueId)
                        ? (venueId ?? null)
                        : null
                    }
                  />
                </Field>
              ) : null}
            </div>
          </section>

          <section aria-labelledby="np-days" className="tr-card">
            <h2 className="tr-h2" id="np-days">
              Practice days, each with its own times
            </h2>
            <SlotRows
              onChange={(weeklySlots) => update({ weeklySlots })}
              slots={draft.weeklySlots}
            />
          </section>

          <section aria-labelledby="np-off" className="tr-card">
            <h2 className="tr-h2" id="np-off">
              Breaks, tournaments and travel
            </h2>
            <ExceptionRows
              exceptions={draft.exceptions}
              fallbackDate={draft.startDate}
              onChange={(exceptions) => update({ exceptions })}
            />
          </section>

          <section aria-labelledby="np-coaches" className="tr-card">
            <h2 className="tr-h2" id="np-coaches">
              Coaches
            </h2>
            <CoachRows
              coaches={draft.coaches}
              onChange={(next) => update({ coaches: next })}
              options={coaches}
            />
          </section>

          <section aria-label="In short" className="tr-card tr-summary">
            <p className="tr-body">
              <b>{draft.title || "This program"}</b>
              {` runs ${dateRangeWords(draft.startDate, draft.endDate)}: ${patternSentence(draft.weeklySlots)}. That makes ${practices.length} ${practices.length === 1 ? "practice" : "practices"} once it is activated.`}
            </p>
            {problems && (touched || problems.errors.length === 0)
              ? problems.errors.map((error) => (
                  <p className="tr-problem" key={error} role="alert">
                    <Icon name="alert" size="inline" />
                    {error}
                  </p>
                ))
              : null}
            {problems?.warnings.map((warning) => (
              <p className="tr-quiet" key={warning}>
                {warning}
              </p>
            ))}
            <div className="tr-actions">
              <Button
                loading={save.showPending}
                type="submit"
                variant="primary"
              >
                Save as a draft
              </Button>
              <Button href={hqHref("training")} variant="ghost">
                Cancel
              </Button>
            </div>
            <p className="tr-quiet">
              Saving creates a draft only. No practice is scheduled and nobody
              is told until you activate it.
            </p>
            {save.status === "error" ? (
              <Notice title="Not saved" tone="attention">
                {save.error instanceof Error ? save.error.message : null}
                {save.reference ? ` Reference: ${save.reference}` : null}
              </Notice>
            ) : null}
          </section>
        </form>
      )}
    </PaneTransition>
  );
}
