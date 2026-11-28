"use client";

import {
  formatMoney,
  formatParticipationTime,
  renderParticipationCopy,
  validateLockExtension,
} from "@duna/core";
import { report } from "@duna/observability";
import {
  Button,
  ConfirmSlot,
  Field,
  Notice,
  RadioGroup,
  RadioOption,
  Select,
  Sheet,
  SheetContent,
  Textarea,
  useConfirm,
} from "@duna/ui/tideline";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  cancelSessionAction,
  extendLockAction,
  mergeSessionsAction,
  requestCancelAction,
  runAnywayAction,
} from "@/app/(next)/(hq)/offerings/actions";
import { unwrap } from "../money/money-action-result";
import { AttendanceList } from "./attendance-list";
import { GroupStatus } from "./group-status";
import {
  attendanceOpen,
  cancelRefunds,
  mergeOptions,
  sessionHasStarted,
  sessionIsOpen,
  type SessionView,
} from "./session-model";

export interface SessionPermissions {
  /** See money at stake and cancel with refunds, merge (owner). */
  readonly money: boolean;
  /** Extend, run anyway (director, owner). */
  readonly sessions: boolean;
}

type Panel = "home" | "extend" | "cancel" | "merge" | "message" | "request";

const reasons = [
  { value: "coach", label: "The coach can't make it" },
  { value: "weather", label: "Weather" },
  { value: "venue", label: "The venue isn't available" },
  { value: "other", label: "Another reason" },
] as const;

type Reason = (typeof reasons)[number]["value"];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * One session as a side panel (participation.md §7.1 "session sheet"): its
 * state in the shared words, who is booked, money at stake (for people who
 * may see money), the decision time, and the actions as the owner thinks of
 * them. Every action confirms inside the panel (never two dialogs deep);
 * cancelling, refunding and merging are the strong tier and restate exactly
 * who gets what back. Messages are never sent from here: "Message the
 * group" hands a draft to Inbox, where a person reviews and sends it.
 */
export function SessionSheet({
  session,
  sameOffering,
  open,
  onOpenChange,
  permissions,
  now: nowIso,
  currency,
  shareUrl,
}: {
  readonly session: SessionView | null;
  /** Other sessions of the same offering, for Merge. */
  readonly sameOffering: readonly SessionView[];
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly permissions: SessionPermissions;
  readonly now: string;
  readonly currency: string;
  /** The offering's public booking page (the session is added), when it is live. */
  readonly shareUrl?: string;
}) {
  const confirm = useConfirm({ presentation: "inline" });
  return (
    <Sheet
      {...confirm.hostProps}
      onOpenChange={onOpenChange}
      open={open}
      side="right"
    >
      {session ? (
        <SheetContent
          className="pt-sheet"
          description={`${session.startLabel}${session.coachNames.length > 0 ? ` · ${session.coachNames.join(", ")}` : ""}`}
          title={session.title}
        >
          <ConfirmSlot confirm={confirm}>
            <SessionBody
              confirm={confirm}
              currency={currency}
              key={session.id}
              now={nowIso}
              onDone={() => onOpenChange(false)}
              permissions={permissions}
              sameOffering={sameOffering}
              session={session}
              shareUrl={
                shareUrl ? `${shareUrl}?session=${session.id}` : undefined
              }
            />
          </ConfirmSlot>
        </SheetContent>
      ) : null}
    </Sheet>
  );
}

function SessionBody({
  session,
  sameOffering,
  permissions,
  now: nowIso,
  currency,
  shareUrl,
  confirm,
  onDone,
}: {
  readonly session: SessionView;
  readonly sameOffering: readonly SessionView[];
  readonly permissions: SessionPermissions;
  readonly now: string;
  readonly currency: string;
  readonly shareUrl?: string;
  readonly confirm: ReturnType<typeof useConfirm>;
  readonly onDone: () => void;
}) {
  const router = useRouter();
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const [panel, setPanel] = useState<Panel>("home");
  const [reason, setReason] = useState<Reason>("coach");
  const [extendBy, setExtendBy] = useState("720");
  const [mergeInto, setMergeInto] = useState<string | null>(null);
  const display = session.display;
  const started = sessionHasStarted(session, now);
  const openForActions = sessionIsOpen(session) && !started;
  const running =
    started &&
    new Date(session.endsAt).getTime() > now.getTime() &&
    session.state !== "cancelled-club" &&
    session.state !== "cancelled-low";
  const refunds = cancelRefunds(session);
  const people = session.bookings?.length ?? 0;
  const reference = `Session ${session.id.slice(0, 8)}`;
  const failed = (error: unknown) =>
    void report(error, { event: "hq.offerings.session_action_failed" });
  const finish = (outcome: { status: string }) => {
    if (outcome.status === "done") {
      setPanel("home");
      router.refresh();
    }
  };

  const reminder =
    session.state === "needs-players"
      ? renderParticipationCopy({
          key: "notice.needs-players-reminder.body",
          params: { n: display.numbers.needed, lock: session.lockLabel ?? "" },
        })
      : renderParticipationCopy({
          key: "notice.confirmed.title",
          params: { title: session.title },
        });
  const [message, setMessage] = useState(
    `${reminder}${shareUrl ? `\n${shareUrl}` : ""}`,
  );

  const lockAt = session.lockAt ? new Date(session.lockAt) : undefined;
  const extendOptions = [360, 720, 1_440].map((minutes) => {
    const at = lockAt
      ? new Date(lockAt.getTime() + minutes * 60_000)
      : undefined;
    const problem =
      at && lockAt
        ? validateLockExtension({
            currentLockAt: lockAt,
            requestedLockAt: at,
            startsAt: new Date(session.startsAt),
            now,
          })
        : "Choose a valid time.";
    return {
      value: String(minutes),
      at,
      problem,
      label: at
        ? formatParticipationTime({ at, now, timeZone: session.timeZone }).label
        : "",
    };
  });
  const chosenExtend = extendOptions.find(
    (option) => option.value === extendBy,
  );

  const money = [
    refunds.credits > 0
      ? `${plural(refunds.credits, "credit")} back to wallets`
      : undefined,
    refunds.cardRefunds > 0
      ? `${plural(refunds.cardRefunds, "card refund")}${session.atStakeMinor ? ` (${formatMoney(session.atStakeMinor, currency)} in total)` : ""}`
      : undefined,
  ].filter(Boolean);

  return (
    <div className="pt-sheet__body">
      <section aria-label="Where it stands" className="pt-sheet__state">
        <GroupStatus
          line={session.line}
          running={running}
          status={session.status}
          tone={display.tone}
        />
        <p className="pt-sheet__staff">{session.staff}</p>
        <dl className="pt-facts">
          <div>
            <dt>Booked</dt>
            <dd className="pt-num">{`${session.booked} of ${session.capacity}`}</dd>
          </div>
          {display.hasGroupRule ? (
            <div>
              <dt>Needs</dt>
              <dd className="pt-num">{`${session.minimum} to run`}</dd>
            </div>
          ) : null}
          {session.lockLabel ? (
            <div>
              <dt>Decides</dt>
              <dd>{session.lockLabel}</dd>
            </div>
          ) : null}
          {session.waiting > 0 ? (
            <div>
              <dt>Waiting</dt>
              <dd className="pt-num">{session.waiting}</dd>
            </div>
          ) : null}
          {permissions.money && session.atStakeCredits !== undefined ? (
            <div>
              <dt>At stake</dt>
              <dd className="pt-num">
                {[
                  session.atStakeCredits > 0
                    ? plural(session.atStakeCredits, "credit")
                    : undefined,
                  session.atStakeMinor
                    ? formatMoney(session.atStakeMinor, currency)
                    : undefined,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Nothing"}
              </dd>
            </div>
          ) : null}
        </dl>
        {display.cancellation.line ? (
          <p className="pt-quiet">
            {renderParticipationCopy(display.cancellation.line)}
          </p>
        ) : null}
      </section>

      {panel === "home" ? (
        <>
          <section aria-label="Who's booked" className="pt-sheet__section">
            <h3 className="pt-sheet__heading">Who&apos;s booked</h3>
            {session.bookings === null ? (
              <p className="pt-quiet">
                The roster opens from the offering's sessions.
              </p>
            ) : session.bookings.length === 0 ? (
              <p className="pt-quiet">Nobody yet.</p>
            ) : attendanceOpen(session, now) ? (
              <AttendanceList session={session} />
            ) : (
              <ul className="pt-roster">
                {session.bookings.map((booking) => (
                  <li key={booking.id}>
                    <span>{booking.name}</span>
                    <span className="pt-quiet">
                      {[
                        booking.quantity > 1
                          ? `${booking.quantity} places`
                          : undefined,
                        booking.method === "credit"
                          ? permissions.money
                            ? `${plural(booking.reservedCredits, "credit")} reserved`
                            : "Credits"
                          : booking.method === "card"
                            ? "Card"
                            : booking.method === "cash"
                              ? "Pays at the desk"
                              : undefined,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {openForActions ? (
            <section aria-label="What you can do" className="pt-sheet__section">
              <h3 className="pt-sheet__heading">What you can do</h3>
              <div className="pt-sheet__actions">
                <Button onClick={() => setPanel("message")} variant="secondary">
                  Message the group
                </Button>
                {permissions.sessions &&
                display.hasGroupRule &&
                session.lockAt ? (
                  <Button
                    onClick={() => setPanel("extend")}
                    variant="secondary"
                  >
                    Extend the deadline
                  </Button>
                ) : null}
                {permissions.sessions && session.state === "needs-players" ? (
                  <Button
                    onClick={() =>
                      void confirm
                        .run({
                          tier: "confirm",
                          title: `Run ${session.title} even if it stays small?`,
                          description:
                            "It runs at the decision time with whoever is booked. The price for the group at that time still applies.",
                          affected: `${plural(people, "booking")} keep their place.`,
                          verb: "Run it anyway",
                          cancelLabel: "Not now",
                          agentConfirm: `Pre-decides that ${session.title} runs even under its minimum`,
                          perform: async ({ idempotencyKey }) =>
                            unwrap(
                              await runAnywayAction({
                                subjectType: session.subjectType,
                                subjectId: session.id,
                                idempotencyKey,
                              }),
                            ),
                          success: `${session.title} will run whatever the numbers`,
                          report: failed,
                        })
                        .then(finish)
                    }
                    variant="secondary"
                  >
                    Run it anyway
                  </Button>
                ) : null}
                {permissions.money ? (
                  <Button onClick={() => setPanel("merge")} variant="secondary">
                    Merge with another session
                  </Button>
                ) : null}
                {permissions.money ? (
                  <Button onClick={() => setPanel("cancel")} variant="danger">
                    Cancel and refund
                  </Button>
                ) : (
                  <Button
                    onClick={() => setPanel("request")}
                    variant="secondary"
                  >
                    Ask the club to cancel
                  </Button>
                )}
              </div>
            </section>
          ) : null}
        </>
      ) : null}

      {panel === "message" ? (
        <section aria-label="Message the group" className="pt-sheet__section">
          <h3 className="pt-sheet__heading">Message the group</h3>
          <p className="pt-quiet">
            {`To ${people === 0 ? "nobody yet" : (session.bookings ?? []).map((booking) => booking.name).join(", ")}.`}
          </p>
          <Field label="Message">
            <Textarea
              maxLength={600}
              onChange={(event) => setMessage(event.currentTarget.value)}
              rows={4}
              value={message}
            />
          </Field>
          {shareUrl ? (
            <div className="pt-actions">
              <CopyText label="Copy the booking link" value={shareUrl} />
            </div>
          ) : null}
          <Notice tone="info" title="Nothing is sent from here">
            Inbox opens with the group so you can review the message and send it
            there.
          </Notice>
          <div className="pt-actions">
            <Button onClick={() => setPanel("home")} variant="ghost">
              Back
            </Button>
            <Button
              disabled={people === 0}
              href={`/inbox?compose=new${(session.bookings ?? [])[0] ? `&recipient=${encodeURIComponent(session.bookings![0]!.personId)}` : ""}`}
              variant="primary"
            >
              Review in Inbox
            </Button>
          </div>
        </section>
      ) : null}

      {panel === "extend" ? (
        <section aria-label="Extend the deadline" className="pt-sheet__section">
          <h3 className="pt-sheet__heading">Extend the deadline</h3>
          <p className="pt-quiet">
            Free cancellation moves with it, and the people booked are told.
          </p>
          <RadioGroup
            aria-label="New decision time"
            onValueChange={(value) => setExtendBy(String(value))}
            value={extendBy}
          >
            {extendOptions.map((option) => (
              <RadioOption
                description={option.problem}
                disabled={Boolean(option.problem)}
                key={option.value}
                label={
                  option.label ? `Decide ${option.label}` : "Not available"
                }
                value={option.value}
              />
            ))}
          </RadioGroup>
          <div className="pt-actions">
            <Button onClick={() => setPanel("home")} variant="ghost">
              Back
            </Button>
            <Button
              disabled={!chosenExtend?.at || Boolean(chosenExtend.problem)}
              onClick={() => {
                if (!chosenExtend?.at) return;
                const at = chosenExtend.at;
                void confirm
                  .run({
                    tier: "confirm",
                    title: `Move ${session.title}'s decision to ${chosenExtend.label}?`,
                    description: "Free cancellation moves to the same time.",
                    affected: `${plural(people, "booked player")} will be told.`,
                    verb: `Move decision to ${chosenExtend.label}`,
                    cancelLabel: "Keep the current time",
                    agentConfirm: `Moves the decision for ${session.title} to ${chosenExtend.label} and tells booked players`,
                    perform: async ({ idempotencyKey }) =>
                      unwrap(
                        await extendLockAction({
                          subjectType: session.subjectType,
                          subjectId: session.id,
                          lockAt: at.toISOString(),
                          idempotencyKey,
                        }),
                      ),
                    success: `Decision moved to ${chosenExtend.label}`,
                    report: failed,
                  })
                  .then(finish);
              }}
              variant="primary"
            >
              Review the new time
            </Button>
          </div>
        </section>
      ) : null}

      {panel === "cancel" ? (
        <section aria-label="Cancel and refund" className="pt-sheet__section">
          <h3 className="pt-sheet__heading">Cancel and refund</h3>
          <Field label="Why">
            <Select
              onValueChange={(value) => setReason((value ?? "other") as Reason)}
              options={reasons}
              value={reason}
            />
          </Field>
          <ul aria-label="Who gets what back" className="pt-roster">
            {refunds.lines.map((line) => (
              <li key={line.bookingId}>
                <span>{line.name}</span>
                <span className="pt-quiet">{line.what}</span>
              </li>
            ))}
          </ul>
          <div className="pt-actions">
            <Button onClick={() => setPanel("home")} variant="ghost">
              Back
            </Button>
            <Button
              onClick={() =>
                void confirm
                  .run({
                    tier: "strong",
                    destructive: true,
                    title: `Cancel ${session.title}?`,
                    description:
                      "Everyone booked gets everything back, the service fee included, and is told it's cancelled.",
                    amount:
                      money.length > 0
                        ? money.join(" · ")
                        : "Nothing to refund",
                    recipients:
                      refunds.lines.length > 0
                        ? refunds.lines.map((line) => line.name).join(", ")
                        : "Nobody is booked",
                    consequence: "A cancellation can't be undone.",
                    reference,
                    verb: `Cancel and refund ${plural(people, "person")}`.replace(
                      "persons",
                      "people",
                    ),
                    cancelLabel: "Keep the session",
                    agentConfirm: `Cancels ${session.title} and refunds ${plural(people, "booking")} in full`,
                    perform: async ({ idempotencyKey }) =>
                      unwrap(
                        await cancelSessionAction({
                          subjectType: session.subjectType,
                          subjectId: session.id,
                          reason,
                          idempotencyKey,
                        }),
                      ),
                    success: `${session.title} cancelled. Everyone booked gets it all back.`,
                    report: failed,
                  })
                  .then((outcome) => {
                    if (outcome.status === "done") {
                      onDone();
                      router.refresh();
                    }
                  })
              }
              variant="danger"
            >
              Review the cancellation
            </Button>
          </div>
        </section>
      ) : null}

      {panel === "merge" ? (
        <MergePanel
          confirm={confirm}
          failed={failed}
          from={session}
          into={mergeInto}
          now={now}
          onBack={() => setPanel("home")}
          onDone={() => {
            onDone();
            router.refresh();
          }}
          onPick={setMergeInto}
          sameOffering={sameOffering}
        />
      ) : null}

      {panel === "request" ? (
        <section
          aria-label="Ask the club to cancel"
          className="pt-sheet__section"
        >
          <h3 className="pt-sheet__heading">Ask the club to cancel</h3>
          <p className="pt-quiet">
            An owner decides and refunds. Nobody booked is told until they do.
          </p>
          <Field label="Why">
            <Select
              onValueChange={(value) => setReason((value ?? "other") as Reason)}
              options={reasons}
              value={reason}
            />
          </Field>
          <div className="pt-actions">
            <Button onClick={() => setPanel("home")} variant="ghost">
              Back
            </Button>
            <Button
              onClick={() =>
                void confirm
                  .run({
                    tier: "confirm",
                    title: `Ask the club to cancel ${session.title}?`,
                    description: "Your request goes to the club's owners.",
                    verb: "Send the request",
                    cancelLabel: "Don't ask",
                    agentConfirm: `Asks the club's owners to cancel ${session.title}`,
                    perform: async ({ idempotencyKey }) =>
                      unwrap(
                        await requestCancelAction({
                          subjectType: session.subjectType,
                          subjectId: session.id,
                          reason,
                          idempotencyKey,
                        }),
                      ),
                    success: "Request sent to the club",
                    report: failed,
                  })
                  .then(finish)
              }
              variant="primary"
            >
              Review the request
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function MergePanel({
  from,
  sameOffering,
  into,
  onPick,
  onBack,
  onDone,
  now,
  confirm,
  failed,
}: {
  readonly from: SessionView;
  readonly sameOffering: readonly SessionView[];
  readonly into: string | null;
  readonly onPick: (id: string) => void;
  readonly onBack: () => void;
  readonly onDone: () => void;
  readonly now: Date;
  readonly confirm: ReturnType<typeof useConfirm>;
  readonly failed: (error: unknown) => void;
}) {
  const options = mergeOptions(from, sameOffering, now);
  const chosen = options.find(
    (option) => option.into.id === into && !option.refusal,
  );
  return (
    <section
      aria-label="Merge with another session"
      className="pt-sheet__section"
    >
      <h3 className="pt-sheet__heading">Merge with another session</h3>
      {options.length === 0 ? (
        <p className="pt-quiet">
          This offering has no other session to merge into.
        </p>
      ) : (
        <RadioGroup
          aria-label="Merge into"
          onValueChange={(value) => onPick(String(value))}
          value={into ?? ""}
        >
          {options.map((option) => (
            <RadioOption
              description={
                option.refusal ??
                `${option.into.status} · ${option.into.booked} of ${option.into.capacity} booked`
              }
              disabled={Boolean(option.refusal)}
              key={option.into.id}
              label={`${option.into.title}, ${option.into.startLabel}`}
              value={option.into.id}
            />
          ))}
        </RadioGroup>
      )}
      {chosen ? (
        <Notice
          tone="info"
          title={`${plural(chosen.moving.length, "booking")} move`}
        >
          {`${chosen.moving.map((booking) => booking.name).join(", ")}. Nobody pays more; anyone who can't make the new time can cancel for a full refund.`}
        </Notice>
      ) : null}
      <div className="pt-actions">
        <Button onClick={onBack} variant="ghost">
          Back
        </Button>
        <Button
          disabled={!chosen}
          onClick={() => {
            if (!chosen) return;
            void confirm
              .run({
                tier: "strong",
                destructive: true,
                title: `Merge ${from.title} into ${chosen.into.title}?`,
                description: `${plural(chosen.moving.length, "booking")} move to ${chosen.into.startLabel} with what they paid. Nobody pays more, and anyone who can't make the new time can cancel for a full refund.`,
                scope: chosen.moving.map((booking) => booking.name).join(", "),
                recipients: "Everyone who moves is told.",
                consequence: `${from.title} is then cancelled. A merge can't be undone.`,
                reference: `Session ${from.id.slice(0, 8)} into ${chosen.into.id.slice(0, 8)}`,
                verb: `Merge and move ${plural(chosen.moving.length, "booking")}`,
                cancelLabel: "Don't merge",
                agentConfirm: `Moves ${plural(chosen.moving.length, "booking")} from ${from.title} into ${chosen.into.title} and cancels ${from.title}`,
                perform: async ({ idempotencyKey }) =>
                  unwrap(
                    await mergeSessionsAction({
                      fromOccurrenceId: from.id,
                      intoOccurrenceId: chosen.into.id,
                      idempotencyKey,
                    }),
                  ),
                success: (result) =>
                  `${plural(result.moved, "booking")} moved to ${chosen.into.title}`,
                report: failed,
              })
              .then((outcome) => {
                if (outcome.status === "done") onDone();
              });
          }}
          variant="primary"
        >
          Review the merge
        </Button>
      </div>
    </section>
  );
}

/** Copies text and says so in a polite live region; shows it when the clipboard is blocked. */
function CopyText({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "blocked">("idle");
  return (
    <>
      <Button
        onClick={() =>
          void navigator.clipboard
            .writeText(value)
            .then(() => setState("copied"))
            .catch(() => setState("blocked"))
        }
        size="sm"
        variant="secondary"
      >
        {label}
      </Button>
      <span aria-live="polite" className="pt-quiet">
        {state === "copied" ? "Copied" : state === "blocked" ? value : ""}
      </span>
    </>
  );
}
