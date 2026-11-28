"use client";

import {
  Button,
  ConfirmSlot,
  Dialog,
  DialogActions,
  DialogClose,
  DialogContent,
  EmptyFirstUse,
  Field,
  Input,
  NumberInput,
  Select,
  Textarea,
  rallyStyle,
  riseClassName,
  useConfirm,
} from "@duna/ui/tideline";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  moveMatchAction,
  recordResultAction,
} from "@/app/(next)/(hq)/events/actions";
import { unwrap } from "../money/money-action-result";
import { PageSection } from "../shell/page-header";
import { failed } from "./event-actions";
import { MatchCard } from "./event-match";
import type { EventCapabilities } from "./events-capabilities";
import {
  instantToLocalInput,
  scheduleGroups,
  timeWords,
  type EventPermissions,
  type EventView,
  type MatchView,
} from "./events-model";

/**
 * Schedule and courts: what is on court now, every match by start time and
 * the ones still to schedule, with each court's now and next. A director
 * moves a match to another court or time with a note; the players see the
 * new court and time in Duna.
 */
export function EventSchedule({
  view,
  permissions,
  capabilities,
}: {
  readonly view: EventView;
  readonly permissions: EventPermissions;
  readonly capabilities: EventCapabilities;
}) {
  const [moving, setMoving] = useState<MatchView | null>(null);
  const [scoring, setScoring] = useState<MatchView | null>(null);
  const groups = useMemo(
    () => scheduleGroups(view.matches, view.timeZone),
    [view.matches, view.timeZone],
  );
  const editable =
    permissions.change &&
    view.status !== "cancelled" &&
    view.segment !== "past";
  const courts = useMemo(
    () =>
      view.courts.map((court) => {
        const mine = view.matches.filter(
          (match) =>
            match.courtId === court.id || match.courtName === court.name,
        );
        return {
          ...court,
          now: mine.find((match) => match.live),
          next: mine
            .filter((match) => !match.live && !match.done && match.scheduledAt)
            .sort(
              (left, right) =>
                Date.parse(left.scheduledAt!) - Date.parse(right.scheduledAt!),
            )[0],
          count: mine.length,
        };
      }),
    [view.courts, view.matches],
  );
  if (view.matches.length === 0) {
    return (
      <EmptyFirstUse
        action={
          view.divisions[0] ? (
            <Button
              href={`/events/${view.id}/divisions/${view.divisions[0].id}`}
              variant="primary"
            >
              Make the draw
            </Button>
          ) : (
            <Button href={`/events/create?draft=${view.id}`} variant="primary">
              Add divisions
            </Button>
          )
        }
        description="Matches appear here once a division's draw is made. Then give each a court and a time."
        icon="court"
        title="No matches yet"
      />
    );
  }
  return (
    <div className="ev-stack">
      {courts.length > 0 ? (
        <PageSection flush id="courts" title="Courts">
          <ul className="ev-list">
            {courts.map((court) => (
              <li className="ev-item" key={court.id}>
                <span className="ev-item__main">
                  <span className="ev-item__title">{court.name}</span>
                  <span className="ev-quiet">
                    {court.now
                      ? `Now: ${court.now.teamA ?? "TBD"} v ${court.now.teamB ?? "TBD"}`
                      : court.next
                        ? `Next: ${court.next.label} at ${timeWords(court.next.scheduledAt!, view.timeZone)}`
                        : court.count
                          ? "Done for the day"
                          : "No matches here"}
                  </span>
                </span>
                <span className="ev-item__side ev-quiet">
                  {court.count} {court.count === 1 ? "match" : "matches"}
                </span>
              </li>
            ))}
          </ul>
        </PageSection>
      ) : null}
      {groups.map((group, index) => (
        <section
          aria-label={group.label}
          className={`ev-slot ${riseClassName()}`}
          key={group.key}
          style={rallyStyle(index)}
        >
          <h2 className="ev-slot__time">{group.label}</h2>
          <ul className="ev-matches">
            {group.matches.map((match) => (
              <li key={match.id}>
                <MatchCard
                  footer={
                    editable ? (
                      <>
                        {!match.done && !match.live ? (
                          <Button
                            onClick={() => setMoving(match)}
                            size="sm"
                            variant="secondary"
                          >
                            {match.scheduledAt
                              ? "Change court or time"
                              : "Schedule"}
                          </Button>
                        ) : null}
                        {capabilities.recordResult &&
                        match.teamA &&
                        match.teamB &&
                        (match.live || match.done || match.scheduledAt) ? (
                          <Button
                            onClick={() => setScoring(match)}
                            size="sm"
                            variant="ghost"
                          >
                            {match.done ? "Correct result" : "Enter result"}
                          </Button>
                        ) : null}
                      </>
                    ) : undefined
                  }
                  match={match}
                  timeZone={view.timeZone}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
      <MoveMatch
        courts={view.courts}
        eventId={view.id}
        match={moving}
        onClose={() => setMoving(null)}
        timeZone={view.timeZone}
      />
      <RecordResult
        eventId={view.id}
        match={scoring}
        onClose={() => setScoring(null)}
      />
    </div>
  );
}

function MoveMatch({
  match,
  courts,
  eventId,
  timeZone,
  onClose,
}: {
  readonly match: MatchView | null;
  readonly courts: readonly { id: string; name: string }[];
  readonly eventId: string;
  readonly timeZone: string;
  readonly onClose: () => void;
}) {
  const router = useRouter();
  const inline = useConfirm({ presentation: "inline" });
  const [courtId, setCourtId] = useState<string | null>(null);
  const [at, setAt] = useState("");
  const [reason, setReason] = useState("");
  const [seeded, setSeeded] = useState<string | null>(null);
  if (match && seeded !== match.id) {
    setSeeded(match.id);
    setCourtId(match.courtId ?? courts[0]?.id ?? null);
    setAt(
      match.scheduledAt ? instantToLocalInput(match.scheduledAt, timeZone) : "",
    );
    setReason("");
  }
  const court = courts.find((entry) => entry.id === courtId);
  const close = () => {
    setSeeded(null);
    onClose();
  };
  return (
    <Dialog
      {...inline.hostProps}
      onOpenChange={(open) => (open ? undefined : close())}
      open={match !== null}
    >
      {match ? (
        <DialogContent
          description={`${match.divisionName} · ${match.label} · ${match.teamA ?? "TBD"} v ${match.teamB ?? "TBD"}`}
          title={match.scheduledAt ? "Change court or time" : "Schedule match"}
        >
          <ConfirmSlot confirm={inline}>
            <div className="ev-form">
              <div className="ev-form__row">
                <Field label="Court">
                  <Select
                    onValueChange={setCourtId}
                    options={courts.map((entry) => ({
                      value: entry.id,
                      label: entry.name,
                    }))}
                    value={courtId}
                  />
                </Field>
                <Field
                  hint={`In the place's time (${timeZone.replaceAll("_", " ")}).`}
                  label="Starts"
                >
                  <Input
                    onChange={(event) => setAt(event.target.value)}
                    type="datetime-local"
                    value={at}
                  />
                </Field>
              </div>
              <Field hint="Kept with the event's history." label="Why">
                <Textarea
                  maxLength={500}
                  onChange={(event) => setReason(event.target.value)}
                  rows={2}
                  value={reason}
                />
              </Field>
            </div>
            <DialogActions>
              <DialogClose>Cancel</DialogClose>
              <Button
                disabled={reason.trim().length < 3 || (!at && !courtId)}
                onClick={() =>
                  void inline
                    .run({
                      tier: "confirm",
                      title: `Move ${match.label}?`,
                      description: `${court ? court.name : "Same court"}${at ? `, ${at.replace("T", " at ")}` : ""}.`,
                      affected: `${[match.teamA, match.teamB].filter(Boolean).join(" and ") || "The teams"} see the new court and time in Duna.`,
                      verb: "Move match",
                      cancelLabel: "Keep it",
                      agentConfirm: `Moves ${match.divisionName} ${match.label} to ${court?.name ?? "its court"}${at ? ` at ${at}` : ""}`,
                      perform: async ({ idempotencyKey }) =>
                        unwrap(
                          await moveMatchAction({
                            sessionId: eventId,
                            matchId: match.id,
                            ...(courtId ? { courtId } : {}),
                            ...(at ? { localStartsAt: at } : {}),
                            timeZone,
                            reason,
                            idempotencyKey,
                          }),
                        ),
                      success: `${match.label} moved`,
                      report: failed("hq.events.move_match_failed"),
                    })
                    .then((outcome) => {
                      if (outcome.status === "done") {
                        close();
                        router.refresh();
                      }
                    })
                }
                variant="primary"
              >
                Review
              </Button>
            </DialogActions>
          </ConfirmSlot>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

/** Enter or correct a result by hand (a switch: courtside scoring sends results today). */
function RecordResult({
  match,
  eventId,
  onClose,
}: {
  readonly match: MatchView | null;
  readonly eventId: string;
  readonly onClose: () => void;
}) {
  const router = useRouter();
  const inline = useConfirm({ presentation: "inline" });
  const [sets, setSets] = useState<(readonly [number | null, number | null])[]>(
    [
      [null, null],
      [null, null],
      [null, null],
    ],
  );
  const [seeded, setSeeded] = useState<string | null>(null);
  if (match && seeded !== match.id) {
    setSeeded(match.id);
    setSets(
      [0, 1, 2].map((index) =>
        match.sets[index]
          ? [match.sets[index]![0], match.sets[index]![1]]
          : [null, null],
      ),
    );
  }
  const played = sets.filter(
    ([a, b]) => a !== null && b !== null && a !== b,
  ) as [number, number][];
  const close = () => {
    setSeeded(null);
    onClose();
  };
  return (
    <Dialog
      {...inline.hostProps}
      onOpenChange={(open) => (open ? undefined : close())}
      open={match !== null}
    >
      {match ? (
        <DialogContent
          description={`${match.divisionName} · ${match.label}`}
          title={match.done ? "Correct result" : "Enter result"}
        >
          <ConfirmSlot confirm={inline}>
            <div className="ev-sets">
              {sets.map(([home, away], index) => (
                <div className="ev-sets__row" key={index}>
                  <span className="ev-label">Set {index + 1}</span>
                  <Field label={match.teamA ?? "Home"}>
                    <NumberInput
                      max={99}
                      min={0}
                      onValueChange={(value) =>
                        setSets(
                          sets.map((set, i) =>
                            i === index ? [value ?? null, set[1]] : set,
                          ),
                        )
                      }
                      value={home}
                    />
                  </Field>
                  <Field label={match.teamB ?? "Away"}>
                    <NumberInput
                      max={99}
                      min={0}
                      onValueChange={(value) =>
                        setSets(
                          sets.map((set, i) =>
                            i === index ? [set[0], value ?? null] : set,
                          ),
                        )
                      }
                      value={away}
                    />
                  </Field>
                </div>
              ))}
            </div>
            <DialogActions>
              <DialogClose>Cancel</DialogClose>
              <Button
                disabled={played.length === 0}
                onClick={() =>
                  void inline
                    .run({
                      tier: "confirm",
                      title: `Record ${played.map(([a, b]) => `${a}–${b}`).join(", ")}?`,
                      description: `${match.teamA} v ${match.teamB}. The result updates the standings and the bracket.`,
                      affected:
                        "Both teams and everyone following the event see it.",
                      verb: "Record result",
                      agentConfirm: `Records ${played.map(([a, b]) => `${a}-${b}`).join(", ")} for ${match.label}`,
                      perform: async ({ idempotencyKey }) =>
                        unwrap(
                          await recordResultAction({
                            sessionId: eventId,
                            matchId: match.id,
                            sets: played,
                            idempotencyKey,
                          }),
                        ),
                      success: "Result recorded",
                      report: failed("hq.events.record_result_failed"),
                    })
                    .then((outcome) => {
                      if (outcome.status === "done") {
                        close();
                        router.refresh();
                      }
                    })
                }
                variant="primary"
              >
                Review
              </Button>
            </DialogActions>
          </ConfirmSlot>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
