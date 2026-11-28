"use client";

import type {
  TrainingProgramsConflict,
  TrainingProgramsProgram,
  TrainingProgramsSession,
} from "@duna/api";
import { hqHref } from "@duna/core/hq-routes";
import { Icon } from "@duna/ui/icons";
import {
  Button,
  Checkbox,
  Chip,
  EmptyState,
  Field,
  Input,
  Notice,
  RallyOnChange,
  rallyStyle,
  riseClassName,
  Select,
  Textarea,
  useAction,
  useConfirm,
} from "@duna/ui/tideline";
import { minuteOfDayFromTime, wallTimeToInstant } from "@duna/scheduling";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  activateProgramAction,
  addSessionAction,
  cancelProgramAction,
  importTournamentAction,
  resolveConflictAction,
  updateProgramAction,
} from "@/app/(next)/(hq)/training/actions";
import { unwrap } from "../money/money-action-result";
import { reportFailure } from "../team/team-report";
import { MessageDraft } from "./message-draft";
import type { TournamentCandidate } from "./training-data";
import {
  CoachRows,
  type CoachChoice,
  ExceptionRows,
  SlotRows,
} from "./pattern-editor";
import {
  conflictKindLabels,
  type DraftException,
  type DraftSlot,
  draftProblems,
  type ProgramDraft,
  patternChangePreview,
  practiceKeyWords,
  previewSentence,
  resolutionCopy,
  sessionKindLabels,
  sessionWhen,
} from "./program-model";

/* -------------------------------------------------------------- activate */

/**
 * draft → active behind a confirmation that says exactly what Activate
 * creates. Single flight: a double click sends one request.
 */
export function ActivateProgram({
  programId,
  title,
  sentence,
  count,
}: {
  readonly programId: string;
  readonly title: string;
  /** What will be created, from `activationWords`. */
  readonly sentence: string;
  readonly count: number;
}) {
  const confirm = useConfirm();
  const router = useRouter();
  return (
    <>
      <Button
        onClick={() =>
          void confirm
            .run({
              tier: "confirm",
              title: `Activate ${title}?`,
              description: sentence,
              affected:
                "Coaches see the practices on their schedules. Athletes are not notified automatically.",
              verb: `Activate and create ${count} ${count === 1 ? "practice" : "practices"}`,
              cancelLabel: "Not yet",
              agentConfirm: `Activates the program ${title} and creates ${count} practices`,
              perform: async () =>
                unwrap(await activateProgramAction(programId)),
              success: `${title} is active`,
              report: reportFailure("hq.training.activate_failed"),
            })
            .then((outcome) => {
              if (outcome.status === "done") router.refresh();
            })
        }
        size="sm"
        variant="primary"
      >
        Activate
      </Button>
      {confirm.dialog}
    </>
  );
}

/* ------------------------------------------------------------- conflicts */

/**
 * Conflicts needing a decision (computed by the backend on every read):
 * each of the resolutions it offers, explained before anyone presses it.
 */
export function ConflictList({
  programId,
  conflicts: initial,
  sessions,
  canResolve,
  coaches,
}: {
  readonly programId: string;
  readonly conflicts: readonly TrainingProgramsConflict[];
  readonly sessions: readonly TrainingProgramsSession[];
  readonly canResolve: boolean;
  readonly coaches: readonly CoachChoice[];
}) {
  const confirm = useConfirm();
  const [conflicts, setConflicts] = useState(initial);
  const [substitute, setSubstitute] = useState<Record<string, string>>({});
  const open = conflicts.filter((conflict) => conflict.status === "open");
  const resolved = conflicts.filter(
    (conflict) => conflict.status === "resolved",
  );
  const sessionOf = (id: string) => sessions.find((row) => row.id === id);

  const resolve = (
    conflict: TrainingProgramsConflict,
    resolution: NonNullable<TrainingProgramsConflict["resolution"]>,
  ) => {
    const copy = resolutionCopy[resolution];
    const session = sessionOf(conflict.sessionId);
    const when = session ? sessionWhen(session) : "this practice";
    const sub = substitute[conflict.id];
    void confirm
      .run({
        tier: "confirm",
        destructive: resolution === "drop-practice",
        title: `${copy.verb}: ${when}?`,
        description: copy.explains,
        affected:
          resolution === "drop-practice"
            ? "Athletes are not notified automatically yet. You can send a message yourself afterwards."
            : resolution === "ask-cover"
              ? "Nothing is sent from here: the ask is recorded and the message waits for a person in Team › Coverage."
              : undefined,
        verb: copy.verb,
        cancelLabel: "Not now",
        agentConfirm: `${copy.verb} for ${when} (${conflict.description})`,
        perform: async () =>
          unwrap(
            await resolveConflictAction({
              programId,
              conflictId: conflict.id,
              resolution,
              ...(resolution === "ask-cover" && sub
                ? { substitutePersonId: sub }
                : {}),
            }),
          ),
        success: copy.done,
        report: reportFailure("hq.training.resolve_failed"),
      })
      .then((outcome) => {
        if (outcome.status === "done") {
          const next = outcome.result as TrainingProgramsConflict;
          setConflicts((current) =>
            current.map((row) => (row.id === next.id ? next : row)),
          );
        }
      });
  };

  if (conflicts.length === 0) {
    return (
      <EmptyState
        description="No practice falls on a date off, a coach's time away or a closed court."
        icon="success"
        title="Nothing to decide"
      />
    );
  }
  return (
    <>
      {open.length === 0 ? (
        <p className="tr-quiet">Every conflict has a decision.</p>
      ) : (
        <ul aria-label="Conflicts to decide" className="tr-rows">
          {open.map((conflict, index) => {
            const session = sessionOf(conflict.sessionId);
            return (
              <li
                className={`tr-conflict ${riseClassName()}`}
                key={conflict.id}
                style={rallyStyle(index)}
              >
                <div className="tr-row__main">
                  <span className="tr-row__name">{conflict.description}</span>
                  <span className="tr-quiet">
                    {[
                      conflictKindLabels[conflict.kind],
                      session ? sessionWhen(session) : undefined,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                {canResolve ? (
                  <ul
                    aria-label="Ways to resolve it"
                    className="tr-resolutions"
                  >
                    {conflict.suggestedResolutions.map((resolution) => (
                      <li className="tr-resolution" key={resolution}>
                        <div>
                          <b>{resolutionCopy[resolution].verb}</b>
                          <p className="tr-quiet">
                            {resolutionCopy[resolution].explains}
                          </p>
                          {resolution === "ask-cover" && coaches.length > 0 ? (
                            <Field label="Who to ask" optional>
                              <Select
                                onValueChange={(value) =>
                                  setSubstitute((current) => ({
                                    ...current,
                                    [conflict.id]: value ?? "",
                                  }))
                                }
                                options={[
                                  { value: "", label: "Let Duna suggest" },
                                  ...coaches.map((coach) => ({
                                    value: coach.personId,
                                    label: coach.displayName,
                                  })),
                                ]}
                                value={substitute[conflict.id] ?? ""}
                              />
                            </Field>
                          ) : null}
                        </div>
                        <Button
                          onClick={() => resolve(conflict, resolution)}
                          size="sm"
                          variant={
                            resolution === "drop-practice"
                              ? "ghost"
                              : "secondary"
                          }
                        >
                          {resolutionCopy[resolution].verb}
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="tr-quiet">
                    A manager or this program&apos;s coach decides.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {resolved.length > 0 ? (
        <details className="tr-details">
          <summary>{`${resolved.length} decided`}</summary>
          <ul className="tr-list">
            {resolved.map((conflict) => (
              <li key={conflict.id}>
                <RallyOnChange value={conflict.resolution ?? ""}>
                  <span>
                    {`${conflict.description}: ${conflict.resolution ? resolutionCopy[conflict.resolution].done.toLowerCase() : "decided"}`}
                  </span>
                </RallyOnChange>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {confirm.dialog}
    </>
  );
}

/* ----------------------------------------------------------- add session */

const addKinds = [
  "practice",
  "tournament",
  "travel",
  "film",
  "meeting",
  "assessment",
  "recovery",
] as const;

/** Add a practice, tournament, travel day or other event inside the program. */
export function AddSession({
  program,
  candidates = [],
}: {
  readonly program: Pick<
    TrainingProgramsProgram,
    "id" | "timezone" | "startDate"
  >;
  /** Tournaments on Duna (club events and the pro tour) to pick from. */
  readonly candidates?: readonly TournamentCandidate[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<(typeof addKinds)[number]>("practice");
  const [title, setTitle] = useState("Extra practice");
  const [date, setDate] = useState(program.startDate);
  const [from, setFrom] = useState("17:00");
  const [to, setTo] = useState("19:00");
  const add = useAction(
    async ({ idempotencyKey }) => {
      const startsAt = new Date(
        wallTimeToInstant(date, minuteOfDayFromTime(from), program.timezone),
      ).toISOString();
      const endsAt = new Date(
        wallTimeToInstant(date, minuteOfDayFromTime(to), program.timezone),
      ).toISOString();
      return unwrap(
        await addSessionAction({
          programId: program.id,
          kind,
          title: title.trim() || sessionKindLabels[kind],
          startsAt,
          endsAt,
          timezone: program.timezone,
          idempotencyKey,
        }),
      );
    },
    {
      report: reportFailure("hq.training.add_session_failed"),
      messages: {
        success: (session) => `${session.title} added to the calendar`,
      },
      onSuccess: () => {
        setOpen(false);
        router.refresh();
      },
    },
  );
  if (!open) {
    return (
      <Button
        icon={<Icon name="plus" />}
        onClick={() => setOpen(true)}
        size="sm"
        variant="secondary"
      >
        Add to the calendar
      </Button>
    );
  }
  const invalid = to <= from;
  return (
    <form
      aria-label="Add to the calendar"
      className="tr-card tr-inline-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!invalid) void add.run();
      }}
    >
      <div className="tr-grid3">
        <Field label="What">
          <Select
            onValueChange={(value) => {
              if (!value) return;
              const next = value as (typeof addKinds)[number];
              setKind(next);
              setTitle(
                next === "practice"
                  ? "Extra practice"
                  : sessionKindLabels[next],
              );
            }}
            options={addKinds.map((value) => ({
              value,
              label: sessionKindLabels[value],
            }))}
            value={kind}
          />
        </Field>
        <Field label="Name">
          <Input
            maxLength={160}
            onChange={(event) => setTitle(event.currentTarget.value)}
            value={title}
          />
        </Field>
        <Field label="Day">
          <Input
            onChange={(event) => setDate(event.currentTarget.value)}
            type="date"
            value={date}
          />
        </Field>
        <Field label="Starts">
          <Input
            onChange={(event) => setFrom(event.currentTarget.value)}
            type="time"
            value={from}
          />
        </Field>
        <Field
          error={invalid ? "It ends before it starts." : undefined}
          label="Ends"
        >
          <Input
            onChange={(event) => setTo(event.currentTarget.value)}
            type="time"
            value={to}
          />
        </Field>
      </div>
      {kind === "tournament" ? (
        <TournamentSource
          candidates={candidates}
          onPick={(pick) => {
            setTitle(pick.title.slice(0, 160));
            if (pick.date) setDate(pick.date);
          }}
        />
      ) : null}
      <p className="tr-quiet">
        It is added to this program only; the weekly pattern doesn&apos;t
        change. Athletes are not notified automatically.
      </p>
      <div className="tr-actions">
        <Button loading={add.showPending} type="submit" variant="primary">
          Add it
        </Button>
        <Button onClick={() => setOpen(false)} variant="ghost">
          Cancel
        </Button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------ pattern settings */

function draftOf(program: TrainingProgramsProgram): ProgramDraft {
  return {
    title: program.title,
    purpose: program.purpose,
    targetAudience: program.targetAudience,
    objectives: program.objectives,
    startDate: program.startDate,
    endDate: program.endDate,
    timezone: program.timezone,
    defaultPracticeMinutes: program.defaultPracticeMinutes,
    coaches: program.coaches.map((coach) => ({
      personId: coach.personId,
      role: coach.role,
      weekdays: coach.weekdays,
    })),
    weeklySlots: program.weeklySlots.map((slot): DraftSlot => ({
      weekday: slot.weekday,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      intervalWeeks: slot.intervalWeeks,
      courtIds: slot.courtIds,
      ...(slot.venueId ? { venueId: slot.venueId } : {}),
    })),
    exceptions: program.exceptions.map((row): DraftException => ({
      kind: row.kind,
      startsOn: row.startsOn,
      endsOn: row.endsOn,
      label: row.label,
      ...(row.sessionId ? { sessionId: row.sessionId } : {}),
      ...(row.sourceUrl ? { sourceUrl: row.sourceUrl } : {}),
    })),
    athletePersonIds: [],
  };
}

/**
 * Change the pattern with a preview of exactly which practices are added,
 * removed or left alone. The backend never moves a practice someone relied
 * on: those are listed as "kept for you to review".
 */
export function PatternSettings({
  program,
  sessions,
  coaches,
  canEdit,
  now,
}: {
  readonly program: TrainingProgramsProgram;
  readonly sessions: readonly TrainingProgramsSession[];
  readonly coaches: readonly CoachChoice[];
  readonly canEdit: boolean;
  readonly now: string;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const original = useMemo(() => draftOf(program), [program]);
  const [draft, setDraft] = useState<ProgramDraft>(original);
  const editable =
    canEdit && (program.status === "draft" || program.status === "active");
  const update = (change: Partial<ProgramDraft>) =>
    setDraft((current) => ({ ...current, ...change }));
  const changed = JSON.stringify(draft) !== JSON.stringify(original);
  const problems = draftProblems(draft);
  const preview = useMemo(
    () =>
      patternChangePreview({
        program,
        sessions,
        next: {
          startDate: draft.startDate,
          endDate: draft.endDate,
          slots: draft.weeklySlots,
          exceptions: draft.exceptions,
        },
        now,
      }),
    [program, sessions, draft, now],
  );
  const active = program.status === "active";

  const save = () =>
    void confirm
      .run({
        tier: "confirm",
        title: `Save the changes to ${program.title}?`,
        description: active
          ? previewSentence(preview)
          : "The draft is updated. Nothing is scheduled until it is activated.",
        affected: active
          ? "Practices someone relied on are never moved or removed. Athletes are not notified automatically."
          : undefined,
        verb: "Save the changes",
        cancelLabel: "Keep editing",
        agentConfirm: `Saves the schedule changes to ${program.title}`,
        perform: async () =>
          unwrap(
            await updateProgramAction({
              programId: program.id,
              title: draft.title,
              targetAudience: draft.targetAudience,
              purpose: draft.purpose,
              startDate: draft.startDate,
              endDate: draft.endDate,
              timezone: draft.timezone,
              coaches: draft.coaches,
              weeklySlots: draft.weeklySlots,
              exceptions: draft.exceptions,
            }),
          ),
        success: "Changes saved",
        report: reportFailure("hq.training.update_failed"),
      })
      .then((outcome) => {
        if (outcome.status === "done") router.refresh();
      });

  return (
    <div className="tr-stack">
      {!editable ? (
        <Notice tone="info">
          {canEdit
            ? "This program has ended or was cancelled, so its schedule can't change."
            : "Owners and managers change a program's schedule. You can read it here."}
        </Notice>
      ) : null}
      <section aria-labelledby="ps-details" className="tr-card">
        <h2 className="tr-h2" id="ps-details">
          Details
        </h2>
        <div className="tr-grid2">
          <Field label="Name">
            <Input
              disabled={!editable}
              maxLength={160}
              onChange={(event) => update({ title: event.currentTarget.value })}
              value={draft.title}
            />
          </Field>
          <Field label="Who it's for" optional>
            <Input
              disabled={!editable}
              maxLength={500}
              onChange={(event) =>
                update({ targetAudience: event.currentTarget.value })
              }
              value={draft.targetAudience}
            />
          </Field>
          <Field label="First day">
            <Input
              disabled={!editable}
              onChange={(event) =>
                update({ startDate: event.currentTarget.value })
              }
              type="date"
              value={draft.startDate}
            />
          </Field>
          <Field label="Last day">
            <Input
              disabled={!editable}
              onChange={(event) =>
                update({ endDate: event.currentTarget.value })
              }
              type="date"
              value={draft.endDate}
            />
          </Field>
        </div>
        <Field label="Purpose" optional>
          <Textarea
            autoResize
            disabled={!editable}
            maxLength={2000}
            onChange={(event) => update({ purpose: event.currentTarget.value })}
            rows={2}
            value={draft.purpose}
          />
        </Field>
      </section>
      <section aria-labelledby="ps-days" className="tr-card">
        <h2 className="tr-h2" id="ps-days">
          Practice days
        </h2>
        <SlotRows
          disabled={!editable}
          onChange={(weeklySlots) => update({ weeklySlots })}
          slots={draft.weeklySlots}
        />
      </section>
      <section aria-labelledby="ps-off" className="tr-card">
        <h2 className="tr-h2" id="ps-off">
          Breaks, tournaments and travel
        </h2>
        <ExceptionRows
          disabled={!editable}
          exceptions={draft.exceptions}
          fallbackDate={draft.startDate}
          onChange={(exceptions) => update({ exceptions })}
        />
      </section>
      <section aria-labelledby="ps-coaches" className="tr-card">
        <h2 className="tr-h2" id="ps-coaches">
          Coaches
        </h2>
        <CoachRows
          coaches={draft.coaches}
          disabled={!editable}
          onChange={(next) => update({ coaches: next })}
          options={coaches}
        />
      </section>
      {editable && changed ? (
        <section
          aria-label="What saving changes"
          aria-live="polite"
          className={`tr-card tr-preview ${riseClassName({ from: "bottom" })}`}
        >
          <h2 className="tr-h2">What saving changes</h2>
          <p className="tr-body">
            {active
              ? previewSentence(preview)
              : "It's a draft: practices are created when you activate it."}
          </p>
          {active ? <PreviewLists preview={preview} /> : null}
          {problems.errors.map((error) => (
            <p className="tr-problem" key={error} role="alert">
              <Icon name="alert" size="inline" />
              {error}
            </p>
          ))}
          <div className="tr-actions">
            <Button
              disabled={problems.errors.length > 0}
              onClick={save}
              variant="primary"
            >
              Save the changes
            </Button>
            <Button onClick={() => setDraft(original)} variant="ghost">
              Undo my changes
            </Button>
          </div>
        </section>
      ) : null}
      {confirm.dialog}
    </div>
  );
}

function PreviewLists({
  preview,
}: {
  readonly preview: ReturnType<typeof patternChangePreview>;
}) {
  const cap = 8;
  return (
    <div className="tr-preview__lists">
      <div>
        <h3 className="tr-h3">{`Added (${preview.added.length})`}</h3>
        <ul className="tr-list">
          {preview.added.slice(0, cap).map((practice) => (
            <li key={practice.key}>{practiceKeyWords(practice)}</li>
          ))}
          {preview.added.length > cap ? (
            <li className="tr-quiet">{`and ${preview.added.length - cap} more`}</li>
          ) : null}
        </ul>
      </div>
      <div>
        <h3 className="tr-h3">{`Removed (${preview.removed.length})`}</h3>
        <ul className="tr-list">
          {preview.removed.slice(0, cap).map((session) => (
            <li key={session.id}>{sessionWhen(session)}</li>
          ))}
          {preview.removed.length > cap ? (
            <li className="tr-quiet">{`and ${preview.removed.length - cap} more`}</li>
          ) : null}
        </ul>
        <p className="tr-quiet">Only practices nobody has touched.</p>
      </div>
      <div>
        <h3 className="tr-h3">{`Kept for you to review (${preview.needsReview.length})`}</h3>
        <ul className="tr-list">
          {preview.needsReview.slice(0, cap).map((session) => (
            <li key={session.id}>
              <Link href={hqHref("trainingPractice", { eventId: session.id })}>
                {sessionWhen(session)}
              </Link>
              <Chip tone="attention">Needs review</Chip>
            </li>
          ))}
        </ul>
        <p className="tr-quiet">
          Someone relied on these (a plan, a focus, cover or responses). They
          stay; decide each one yourself.
        </p>
      </div>
    </div>
  );
}

/* --------------------------------------------------------- cancel program */

export function CancelProgram({
  program,
  athleteCount,
}: {
  readonly program: Pick<TrainingProgramsProgram, "id" | "title">;
  readonly athleteCount: number;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState(true);
  const [done, setDone] = useState(false);
  const [draft, setDraft] = useState<{ conversationId: string }>();
  if (done) {
    return (
      <MessageDraft
        body={`${program.title} is cancelled: ${reason.trim()}. Future practices are off. We're sorry for the change.`}
        conciergeDraft={draft}
        title="Tell the athletes"
      />
    );
  }
  return (
    <form
      aria-label="Cancel the program"
      className="tr-stack"
      onSubmit={(event) => {
        event.preventDefault();
        if (!reason.trim()) return;
        void confirm
          .run({
            tier: "strong",
            destructive: true,
            title: `Cancel ${program.title}?`,
            description:
              "Every future practice is cancelled with this reason. Past practices and their records stay.",
            scope: `${program.title} and its future practices`,
            consequence: notify
              ? "This can't be undone. A message draft is prepared for you to review and send in Inbox; nothing is sent automatically."
              : "This can't be undone. Nobody is told unless you send a message yourself.",
            verb: "Cancel the program",
            cancelLabel: "Keep the program",
            agentConfirm: `Cancels the program ${program.title}`,
            perform: async () =>
              unwrap(
                await cancelProgramAction({
                  programId: program.id,
                  reason: reason.trim(),
                  notifyAthletes: notify,
                }),
              ),
            success: `${program.title} cancelled`,
            report: reportFailure("hq.training.cancel_program_failed"),
          })
          .then((outcome) => {
            if (outcome.status === "done") {
              const result = outcome.result as {
                conciergeDraft?: { conversationId: string };
              };
              setDraft(result.conciergeDraft);
              setDone(true);
              router.refresh();
            }
          });
      }}
    >
      <Field
        hint={`Kept with each cancelled practice. ${athleteCount} athletes are on the program.`}
        label="Why it's cancelled"
      >
        <Input
          maxLength={500}
          onChange={(event) => setReason(event.currentTarget.value)}
          value={reason}
        />
      </Field>
      <Checkbox
        checked={notify}
        description="Nothing is sent automatically: you review and send it in Inbox."
        label="Draft a message to the athletes"
        onCheckedChange={(checked) => setNotify(checked === true)}
      />
      <Button disabled={!reason.trim()} type="submit" variant="danger">
        Cancel the program
      </Button>
      {confirm.dialog}
    </form>
  );
}

/**
 * Where a tournament comes from: one already on Duna (club events and the
 * pro tour), or read from its website by the training service (the same
 * import the old program page used). Either only fills the form.
 */
function TournamentSource({
  candidates,
  onPick,
}: {
  readonly candidates: readonly TournamentCandidate[];
  readonly onPick: (pick: { title: string; date?: string }) => void;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const read = useAction(
    async () =>
      unwrap(
        await importTournamentAction({
          name: name.trim() || "Tournament",
          websiteUrl: url.trim(),
        }),
      ),
    {
      report: reportFailure("hq.training.tournament_import_failed"),
      onSuccess: (result) => {
        if (result.title || result.startsOn) {
          onPick({
            title: result.title ?? (name.trim() || "Tournament"),
            ...(result.startsOn ? { date: result.startsOn } : {}),
          });
        }
      },
    },
  );
  const result = read.result;
  return (
    <div className="tr-stack">
      {candidates.length > 0 ? (
        <Field label="A tournament on Duna" optional>
          <Select
            onValueChange={(value) => {
              const pick = candidates.find((row) => row.id === value);
              if (pick) {
                onPick({
                  title: pick.title,
                  ...(pick.startsAt
                    ? { date: pick.startsAt.slice(0, 10) }
                    : {}),
                });
              }
            }}
            options={candidates.map((row) => ({
              value: row.id,
              label: row.subtitle
                ? `${row.title} · ${row.subtitle}`
                : row.title,
            }))}
            value={null}
          />
        </Field>
      ) : (
        <p className="tr-quiet">
          No tournaments on Duna to pick from right now.
        </p>
      )}
      <div className="tr-grid2">
        <Field label="Tournament name" optional>
          <Input
            maxLength={180}
            onChange={(event) => setName(event.currentTarget.value)}
            value={name}
          />
        </Field>
        <Field label="Its website" optional>
          <Input
            inputMode="url"
            maxLength={500}
            onChange={(event) => setUrl(event.currentTarget.value)}
            placeholder="https://"
            type="url"
            value={url}
          />
        </Field>
      </div>
      <div className="tr-actions">
        <Button
          disabled={!/^https?:\/\/\S+\.\S+/.test(url.trim())}
          loading={read.showPending}
          onClick={() => void read.run()}
          size="sm"
          type="button"
          variant="secondary"
        >
          Read the dates from the website
        </Button>
      </div>
      {result && !result.providerAvailable ? (
        <p className="tr-quiet">
          Reading tournament websites isn&apos;t set up yet. Fill in the name
          and dates yourself.
        </p>
      ) : result && !result.title && !result.startsOn ? (
        <p className="tr-quiet">
          Duna couldn&apos;t find the dates on that page. Fill them in yourself.
        </p>
      ) : result ? (
        <p className="tr-quiet">
          Filled in from the website. Check it before you add it.
        </p>
      ) : null}
      {read.status === "error" ? (
        <p className="tr-problem" role="alert">
          {read.error instanceof Error
            ? read.error.message
            : "Couldn't read that page."}
        </p>
      ) : null}
    </div>
  );
}
