"use client";

import type {
  TrainingProgramsConflict,
  TrainingProgramsPracticePlan,
  TrainingProgramsSession,
} from "@duna/api";
import { hqHref } from "@duna/core/hq-routes";
import { Icon } from "@duna/ui/icons";
import {
  Button,
  Checkbox,
  Chip,
  Field,
  Input,
  Notice,
  NumberInput,
  PaneTransition,
  RallyOnChange,
  Segmented,
  Select,
  Textarea,
  useAction,
  useConfirm,
} from "@duna/ui/tideline";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  assignCoachesAction,
  attachPlanAction,
  cancelSessionAction,
  recordOutcomeAction,
  resolveConflictAction,
  setSessionPlanAction,
} from "@/app/(next)/(hq)/training/actions";
import { unwrap } from "../money/money-action-result";
import { reportFailure } from "../team/team-report";
import { MessageDraft } from "./message-draft";
import { blockKindLabels, minuteLabel } from "./plan-model";
import { sessionPlanWords, sessionWhen } from "./program-model";
import type { CoachVerdict } from "./training-data";

type Session = TrainingProgramsSession;

/* --------------------------------------------------------------- coaches */

/**
 * Coaches for this one practice, each with the team's shared availability
 * rule's verdict in words. "Ask for cover" opens a coverage request (it
 * goes through the practice's conflict when there is one).
 */
export function SessionCoaches({
  session: initial,
  verdicts,
  conflict,
  programId,
  canEdit,
}: {
  readonly session: Session;
  readonly verdicts: readonly CoachVerdict[];
  readonly conflict?: TrainingProgramsConflict;
  readonly programId?: string;
  readonly canEdit: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [session, setSession] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [chosen, setChosen] = useState<
    Record<string, "lead" | "assistant" | "substitute">
  >(() =>
    Object.fromEntries(
      initial.coaches.map((coach) => [coach.personId, coach.role]),
    ),
  );
  const save = useAction(
    async () =>
      unwrap(
        await assignCoachesAction({
          sessionId: session.id,
          coaches: Object.entries(chosen).map(([personId, role]) => ({
            personId,
            role,
          })),
        }),
      ),
    {
      report: reportFailure("hq.training.assign_failed"),
      messages: { success: "Coaches saved for this practice" },
      onSuccess: (next) => {
        setSession(next);
        setEditing(false);
      },
    },
  );
  const askCover = () => {
    if (!conflict || !programId) return;
    void confirm
      .run({
        tier: "confirm",
        title: `Ask for cover for ${sessionWhen(session)}?`,
        description:
          "Opens a coverage request: Duna suggests who is free for the whole practice.",
        affected:
          "Nothing is sent from here: any message waits in Team › Coverage for a person to send.",
        verb: "Ask for cover",
        cancelLabel: "Not now",
        agentConfirm: `Opens a coverage request for ${session.title}`,
        perform: async () =>
          unwrap(
            await resolveConflictAction({
              programId,
              conflictId: conflict.id,
              resolution: "ask-cover",
            }),
          ),
        success: "Coverage request opened",
        report: reportFailure("hq.training.ask_cover_failed"),
      })
      .then((outcome) => {
        if (outcome.status === "done") router.refresh();
      });
  };

  return (
    <div className="tr-stack">
      {session.coaches.length === 0 ? (
        <p className="tr-quiet">No coach yet: the practice isn&apos;t ready.</p>
      ) : (
        <ul aria-label="Coaches on this practice" className="tr-rows">
          {session.coaches.map((coach) => {
            const verdict = verdicts.find(
              (row) => row.personId === coach.personId,
            );
            return (
              <li className="tr-row" key={coach.personId}>
                <div className="tr-row__main">
                  <span className="tr-row__name">{coach.displayName}</span>
                  <span className="tr-quiet">
                    {[
                      coach.role === "lead"
                        ? "Lead"
                        : coach.role === "assistant"
                          ? "Assistant"
                          : "Substitute",
                      verdict
                        ? `${verdict.displayName.split(" ")[0]} is ${verdict.words}`
                        : undefined,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                {verdict && !verdict.free ? (
                  <Chip tone="attention">Not free</Chip>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {session.needsCover ? (
        <Notice tone="info" title="Looking for cover">
          A coverage request is open for this practice.
        </Notice>
      ) : null}
      {canEdit &&
      session.status !== "cancelled" &&
      session.status !== "completed" ? (
        <div className="tr-actions">
          <Button
            onClick={() => setEditing((value) => !value)}
            size="sm"
            variant="secondary"
          >
            {editing ? "Close" : "Change coaches"}
          </Button>
          {conflict && programId && !session.needsCover ? (
            <Button onClick={askCover} size="sm" variant="ghost">
              Ask for cover
            </Button>
          ) : !session.needsCover ? (
            <Button href={hqHref("teamCoverage")} size="sm" variant="ghost">
              Find cover in Team
            </Button>
          ) : null}
        </div>
      ) : null}
      {editing ? (
        <form
          aria-label="Choose coaches"
          className="tr-card tr-inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            void save.run();
          }}
        >
          {verdicts.length === 0 ? (
            <p className="tr-quiet">Nobody on the team can coach yet.</p>
          ) : (
            <ul aria-label="Who can coach it" className="tr-rows">
              {verdicts.map((verdict) => {
                const role = chosen[verdict.personId];
                return (
                  <li className="tr-row" key={verdict.personId}>
                    <Checkbox
                      checked={Boolean(role)}
                      description={`${verdict.free ? "Free" : "Not free"}: ${verdict.words}`}
                      label={verdict.displayName}
                      onCheckedChange={(checked) =>
                        setChosen((current) => {
                          const next = { ...current };
                          if (checked) {
                            next[verdict.personId] = Object.values(
                              current,
                            ).includes("lead")
                              ? "assistant"
                              : "lead";
                          } else {
                            delete next[verdict.personId];
                          }
                          return next;
                        })
                      }
                    />
                    {role ? (
                      <Select
                        aria-label={`${verdict.displayName}'s role`}
                        onValueChange={(value) =>
                          value &&
                          setChosen((current) => ({
                            ...current,
                            [verdict.personId]: value as
                              "lead" | "assistant" | "substitute",
                          }))
                        }
                        options={[
                          { value: "lead", label: "Lead" },
                          { value: "assistant", label: "Assistant" },
                          { value: "substitute", label: "Substitute" },
                        ]}
                        value={role}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          <div className="tr-actions">
            <Button loading={save.showPending} type="submit" variant="primary">
              Save coaches
            </Button>
          </div>
        </form>
      ) : null}
      {confirm.dialog}
    </div>
  );
}

/* ------------------------------------------------------------------ plan */

type Mode = "plan" | "focus" | "none";

/**
 * What the practice runs: a full practice plan (a version is pinned), just
 * a focus and an estimated load, or nothing yet.
 */
export function SessionPlan({
  session: initial,
  plans,
  canEdit,
}: {
  readonly session: Session;
  readonly plans: readonly {
    readonly id: string;
    readonly title: string;
    readonly status: string;
  }[];
  readonly canEdit: boolean;
}) {
  const [session, setSession] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<Mode>(initial.plan.mode);
  const [planId, setPlanId] = useState(
    initial.plan.mode === "plan"
      ? initial.plan.practicePlanId
      : (plans[0]?.id ?? ""),
  );
  const [focus, setFocus] = useState(
    initial.plan.mode === "focus" ? initial.plan.focus : "",
  );
  const [load, setLoad] = useState<number | null>(
    initial.plan.mode === "focus" ? initial.plan.plannedLoad : 50,
  );
  const [touches, setTouches] = useState<number | null>(
    initial.plan.mode === "focus"
      ? (initial.plan.estimatedTouches ?? null)
      : null,
  );
  const [jumps, setJumps] = useState<number | null>(
    initial.plan.mode === "focus"
      ? (initial.plan.estimatedJumps ?? null)
      : null,
  );
  const save = useAction(
    async () => {
      if (mode === "plan") {
        return unwrap(
          await attachPlanAction({
            sessionId: session.id,
            practicePlanId: planId,
          }),
        );
      }
      return unwrap(
        await setSessionPlanAction({
          sessionId: session.id,
          plan:
            mode === "focus"
              ? {
                  mode: "focus",
                  focus: focus.trim(),
                  plannedLoad: Math.min(100, Math.max(0, load ?? 0)),
                  ...(touches !== null ? { estimatedTouches: touches } : {}),
                  ...(jumps !== null ? { estimatedJumps: jumps } : {}),
                }
              : { mode: "none" },
        }),
      );
    },
    {
      report: reportFailure("hq.training.session_plan_failed"),
      messages: {
        success: () =>
          mode === "plan"
            ? "Plan attached to this practice"
            : mode === "focus"
              ? "Focus and load saved"
              : "Plan taken off this practice",
      },
      onSuccess: (next) => {
        setSession(next);
        setEditing(false);
      },
    },
  );
  const invalid =
    (mode === "focus" && !focus.trim()) || (mode === "plan" && !planId);
  return (
    <div className="tr-stack">
      <RallyOnChange value={sessionPlanWords(session.plan)}>
        <p className="tr-body">{sessionPlanWords(session.plan)}</p>
      </RallyOnChange>
      <p className="tr-quiet">
        Load, contacts and jumps are estimates for planning, not medical or
        injury advice.
      </p>
      {canEdit && session.status !== "cancelled" ? (
        <div className="tr-actions">
          <Button
            onClick={() => setEditing((value) => !value)}
            size="sm"
            variant="secondary"
          >
            {editing ? "Close" : "Change"}
          </Button>
          <Button
            href={`${hqHref("trainingPracticePlanCreate")}?session=${session.id}`}
            size="sm"
            variant="ghost"
          >
            Build a plan for this practice
          </Button>
        </div>
      ) : null}
      {editing ? (
        <form
          aria-label="What this practice runs"
          className="tr-card tr-inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!invalid) void save.run();
          }}
        >
          <Segmented
            aria-label="What this practice runs"
            onValueChange={(value) => setMode(value as Mode)}
            options={[
              { value: "plan", label: "A practice plan" },
              { value: "focus", label: "Focus and load only" },
              { value: "none", label: "Nothing yet" },
            ]}
            value={mode}
          />
          <PaneTransition direction="forward" transitionKey={mode}>
            {mode === "plan" ? (
              plans.length === 0 ? (
                <p className="tr-quiet">
                  No practice plans yet. Build one first.
                </p>
              ) : (
                <Field
                  hint="The practice keeps the version it is given."
                  label="Plan"
                >
                  <Select
                    onValueChange={(value) => value && setPlanId(value)}
                    options={plans.map((plan) => ({
                      value: plan.id,
                      label: plan.title,
                    }))}
                    value={planId || null}
                  />
                </Field>
              )
            ) : mode === "focus" ? (
              <div className="tr-grid2">
                <Field label="Focus">
                  <Input
                    maxLength={200}
                    onChange={(event) => setFocus(event.currentTarget.value)}
                    placeholder="Serve-receive"
                    value={focus}
                  />
                </Field>
                <Field hint="0 to 100, an estimate" label="Planned load">
                  <NumberInput
                    max={100}
                    min={0}
                    onValueChange={setLoad}
                    value={load}
                  />
                </Field>
                <Field label="Contacts per player (estimate)" optional>
                  <NumberInput
                    min={0}
                    onValueChange={setTouches}
                    value={touches}
                  />
                </Field>
                <Field label="Jumps per player (estimate)" optional>
                  <NumberInput min={0} onValueChange={setJumps} value={jumps} />
                </Field>
              </div>
            ) : (
              <p className="tr-quiet">The practice keeps no plan or focus.</p>
            )}
          </PaneTransition>
          <div className="tr-actions">
            <Button
              disabled={invalid}
              loading={save.showPending}
              type="submit"
              variant="primary"
            >
              Save
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------- cancel */

/** Cancel one practice: the reason is kept; athletes hear only from a person. */
export function CancelPractice({ session }: { readonly session: Session }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState(true);
  const [done, setDone] = useState(false);
  const [draft, setDraft] = useState<{ conversationId: string }>();
  if (done) {
    return (
      <MessageDraft
        body={`${session.title} on ${sessionWhen(session)} is cancelled: ${reason.trim()}. See you at the next one.`}
        conciergeDraft={draft}
        title="Tell the athletes"
      />
    );
  }
  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} size="sm" variant="ghost">
        Cancel this practice
      </Button>
    );
  }
  return (
    <form
      aria-label="Cancel this practice"
      className="tr-card tr-inline-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!reason.trim()) return;
        void confirm
          .run({
            tier: "confirm",
            destructive: true,
            title: `Cancel ${session.title} on ${sessionWhen(session)}?`,
            description:
              "The practice stays on the calendar as cancelled, with your reason.",
            affected: notify
              ? `${session.athleteCount} athletes are on it. A message draft is prepared for you to review and send in Inbox; nothing is sent automatically.`
              : `${session.athleteCount} athletes are on it. Nobody is told unless you send a message yourself.`,
            verb: "Cancel the practice",
            cancelLabel: "Keep the practice",
            agentConfirm: `Cancels ${session.title} on ${sessionWhen(session)}`,
            perform: async () =>
              unwrap(
                await cancelSessionAction({
                  sessionId: session.id,
                  reason: reason.trim(),
                  notifyAthletes: notify,
                }),
              ),
            success: "Practice cancelled",
            report: reportFailure("hq.training.cancel_session_failed"),
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
      <Field label="Why it's cancelled">
        <Input
          maxLength={500}
          onChange={(event) => setReason(event.currentTarget.value)}
          placeholder="Rain"
          value={reason}
        />
      </Field>
      <Checkbox
        checked={notify}
        description="Nothing is sent automatically: you review and send it in Inbox."
        label="Draft a message to the athletes"
        onCheckedChange={(checked) => setNotify(checked === true)}
      />
      <div className="tr-actions">
        <Button disabled={!reason.trim()} type="submit" variant="danger">
          Cancel the practice
        </Button>
        <Button onClick={() => setOpen(false)} variant="ghost">
          Keep it
        </Button>
      </div>
      {confirm.dialog}
    </form>
  );
}

/* ------------------------------------------------------------- coach mode */

/**
 * Run the plan on court: one block at a time, its minutes, focus and
 * instructions, with a block timer. Nothing here is saved; the record
 * comes after practice.
 */
export function RunPlan({
  plan,
  startsAt,
}: {
  readonly plan: TrainingProgramsPracticePlan;
  readonly startsAt?: string;
}) {
  const blocks = [...plan.blocks].sort(
    (a, b) =>
      a.startsAtMinute - b.startsAtMinute || a.lane.localeCompare(b.lane),
  );
  const [index, setIndex] = useState(0);
  const [running, setRunning] = useState(false);
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(
      () => setSeconds((value) => value + 1),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [running]);
  const block = blocks[index];
  if (!block) return <p className="tr-quiet">This plan has no blocks.</p>;
  const go = (next: number) => {
    setIndex(Math.max(0, Math.min(blocks.length - 1, next)));
    setSeconds(0);
  };
  const planned = block.durationMinutes * 60;
  return (
    <section aria-label="Run the plan" className="tr-card tr-run">
      <p className="tr-quiet">{`Block ${index + 1} of ${blocks.length} · ${minuteLabel(block.startsAtMinute, startsAt)}${block.lane !== "all" ? ` · ${block.lane}` : ""}`}</p>
      <PaneTransition direction="forward" transitionKey={block.id}>
        <div className="tr-run__block">
          <h3 className="tr-run__title">{block.title}</h3>
          <p className="tr-body">
            {[
              blockKindLabels[block.kind],
              `${block.durationMinutes} min`,
              block.focus,
              `load ${block.plannedLoad} (estimate)`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {block.instructionsMarkdown ? (
            <p className="tr-body">{block.instructionsMarkdown}</p>
          ) : null}
        </div>
      </PaneTransition>
      <p aria-live="off" className="tr-run__timer">
        <span className="tr-num">{`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`}</span>
        <span className="tr-quiet">{` of ${block.durationMinutes}:00`}</span>
        {seconds > planned ? <Chip tone="attention">Over time</Chip> : null}
      </p>
      <div className="tr-actions">
        <Button
          disabled={index === 0}
          onClick={() => go(index - 1)}
          size="sm"
          variant="ghost"
        >
          Previous
        </Button>
        <Button
          onClick={() => setRunning((value) => !value)}
          size="sm"
          variant="secondary"
        >
          {running ? "Pause" : seconds > 0 ? "Resume" : "Start"}
        </Button>
        <Button
          disabled={index === blocks.length - 1}
          onClick={() => go(index + 1)}
          size="sm"
          variant="primary"
        >
          Next block
        </Button>
      </div>
    </section>
  );
}

/* --------------------------------------------------------- after practice */

type Outcome = {
  readonly sessionId: string;
  readonly plannedLoad: number;
  readonly coachRpe?: number;
  readonly actualLoad?: number;
  readonly attendance: readonly {
    readonly personId: string;
    readonly displayName: string;
    readonly present: boolean;
    readonly proposed: boolean;
  }[];
  readonly blocks: readonly {
    readonly blockId: string;
    readonly title: string;
    readonly plannedMinutes: number;
    readonly actualMinutes?: number;
    readonly outcome?: string;
  }[];
  readonly notes?: string;
  readonly recordedAt?: string;
};

/**
 * After practice (TR-After): who came (proposed from check-ins until a
 * coach confirms), how each block went, the coach's effort rating, notes.
 * Saving completes the practice.
 */
export function AfterPractice({
  outcome,
  canRecord,
}: {
  readonly outcome: Outcome;
  readonly canRecord: boolean;
}) {
  const router = useRouter();
  const [attendance, setAttendance] = useState(outcome.attendance);
  const [blocks, setBlocks] = useState(outcome.blocks);
  const [rpe, setRpe] = useState<number | null>(outcome.coachRpe ?? null);
  const [notes, setNotes] = useState(outcome.notes ?? "");
  const [recordedAt, setRecordedAt] = useState(outcome.recordedAt);
  const save = useAction(
    async () =>
      unwrap(
        await recordOutcomeAction({
          sessionId: outcome.sessionId,
          ...(rpe !== null ? { coachRpe: rpe } : {}),
          attendance: attendance.map((row) => ({ ...row, proposed: false })),
          blocks: blocks.map((row) => ({ ...row })),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        }),
      ),
    {
      report: reportFailure("hq.training.outcome_failed"),
      messages: { success: "After-practice record saved" },
      onSuccess: (saved) => {
        setRecordedAt(saved.recordedAt);
        setAttendance(saved.attendance);
        router.refresh();
      },
    },
  );
  const disabled = !canRecord;
  return (
    <form
      aria-label="After practice"
      className="tr-stack"
      onSubmit={(event) => {
        event.preventDefault();
        void save.run();
      }}
    >
      {recordedAt ? (
        <p className="tr-quiet">
          <Icon name="success" size="inline" /> Recorded. You can still correct
          it.
        </p>
      ) : null}
      <fieldset className="tr-fieldset">
        <legend className="tr-h3">Who came</legend>
        {attendance.length === 0 ? (
          <p className="tr-quiet">No athletes responded to this practice.</p>
        ) : (
          <ul aria-label="Attendance" className="tr-rows">
            {attendance.map((row) => (
              <li className="tr-row" key={row.personId}>
                <Checkbox
                  checked={row.present}
                  description={
                    row.proposed
                      ? "Proposed from check-ins: confirm it"
                      : undefined
                  }
                  disabled={disabled}
                  label={row.displayName}
                  onCheckedChange={(checked) =>
                    setAttendance((current) =>
                      current.map((item) =>
                        item.personId === row.personId
                          ? {
                              ...item,
                              present: checked === true,
                              proposed: false,
                            }
                          : item,
                      ),
                    )
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </fieldset>
      {blocks.length > 0 ? (
        <fieldset className="tr-fieldset">
          <legend className="tr-h3">How each block went</legend>
          <ul aria-label="Blocks" className="tr-rows">
            {blocks.map((row) => (
              <li className="tr-row tr-row--form" key={row.blockId}>
                <span className="tr-row__name">{`${row.title} · ${row.plannedMinutes} min planned`}</span>
                <div className="tr-grid2">
                  <Field label="Minutes it took" optional>
                    <NumberInput
                      disabled={disabled}
                      min={0}
                      onValueChange={(value) =>
                        setBlocks((current) =>
                          current.map((item) =>
                            item.blockId === row.blockId
                              ? {
                                  ...item,
                                  ...(value === null
                                    ? { actualMinutes: undefined }
                                    : { actualMinutes: Math.trunc(value) }),
                                }
                              : item,
                          ),
                        )
                      }
                      value={row.actualMinutes ?? null}
                    />
                  </Field>
                  <Field label="How it went" optional>
                    <Input
                      disabled={disabled}
                      maxLength={500}
                      onChange={(event) => {
                        const text = event.currentTarget.value;
                        setBlocks((current) =>
                          current.map((item) =>
                            item.blockId === row.blockId
                              ? { ...item, outcome: text }
                              : item,
                          ),
                        );
                      }}
                      value={row.outcome ?? ""}
                    />
                  </Field>
                </div>
              </li>
            ))}
          </ul>
        </fieldset>
      ) : null}
      <div className="tr-grid2">
        <Field
          hint="1 easy to 10 maximal; how hard it felt"
          label="Coach effort rating"
          optional
        >
          <NumberInput
            disabled={disabled}
            max={10}
            min={1}
            onValueChange={setRpe}
            value={rpe}
          />
        </Field>
        <Field label="Planned load (estimate)">
          <Input disabled readOnly value={String(outcome.plannedLoad)} />
        </Field>
      </div>
      <Field label="Notes for the program" optional>
        <Textarea
          autoResize
          disabled={disabled}
          maxLength={4000}
          onChange={(event) => setNotes(event.currentTarget.value)}
          rows={3}
          value={notes}
        />
      </Field>
      {canRecord ? (
        <div className="tr-actions">
          <Button loading={save.showPending} type="submit" variant="primary">
            {recordedAt ? "Save the corrections" : "Record the practice"}
          </Button>
        </div>
      ) : (
        <p className="tr-quiet">
          The program&apos;s coaches and managers record practices.
        </p>
      )}
    </form>
  );
}
