"use client";

import { formatMoney } from "@duna/core";
import { Icon } from "@duna/ui/icons";
import {
  Button,
  Chip,
  ConfirmSlot,
  Dialog,
  DialogActions,
  DialogClose,
  DialogContent,
  EmptyFirstUse,
  Field,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  NumberInput,
  RadioGroup,
  RadioOption,
  SearchField,
  Select,
  Textarea,
  successToast,
  useAsyncSearch,
  useConfirm,
} from "@duna/ui/tideline";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  addPlayerAction,
  recordAttendanceAction,
  searchPlayersAction,
  setTeamSelectionAction,
  type PlayerMatch,
} from "@/app/(next)/(hq)/events/actions";
import { unwrap } from "../money/money-action-result";
import { PageSection } from "../shell/page-header";
import { failed } from "./event-actions";
import {
  SELECTION_WORDS,
  entriesCsv,
  type AttendeeView,
  type DivisionView,
  type EventPermissions,
  type EventView,
  type TeamView,
} from "./events-model";

type SelectionChange = "confirmed" | "waitlisted" | "withdrawn";

/**
 * Divisions and entries: each division's field (seeded, then pending, then
 * the waitlist in the order people joined), payment readiness in words, and
 * moving a team between the field and the waitlist with a note for the
 * record. Sessions without divisions show their roster with check-in.
 */
export function EventEntries({
  view,
  permissions,
}: {
  readonly view: EventView;
  readonly permissions: EventPermissions;
}) {
  const [selection, setSelection] = useState<{
    team: TeamView;
    division: DivisionView;
    to: SelectionChange;
  } | null>(null);
  const editable =
    permissions.change &&
    view.segment !== "past" &&
    view.status !== "cancelled";
  const download = () => {
    const blob = new Blob([entriesCsv(view)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${view.slug || "event"}-entries.csv`;
    link.click();
    URL.revokeObjectURL(url);
    successToast("Entries downloaded");
  };
  const toolbar = (
    <div className="ev-actions">
      {editable && view.divisions.length > 0 ? (
        <AddPlayer
          currency={view.currency}
          divisions={view.divisions}
          eventId={view.id}
          money={permissions.money}
        />
      ) : null}
      {view.entries + view.waitlist > 0 ? (
        <Button onClick={download} size="sm" variant="ghost">
          Download CSV
        </Button>
      ) : null}
    </div>
  );

  if (view.competition) {
    return (
      <div className="ev-stack">
        {toolbar}
        {view.divisions.length === 0 ? (
          <EmptyFirstUse
            action={
              <Button
                href={`/events/create?draft=${view.id}`}
                variant="primary"
              >
                Add divisions in the event studio
              </Button>
            }
            description="Divisions set who can enter, the team size and the fee."
            icon="tournament"
            title="No divisions yet"
          />
        ) : null}
        {view.divisions.map((division) => (
          <DivisionEntries
            division={division}
            editable={editable}
            eventId={view.id}
            key={division.id}
            currency={view.currency}
            money={permissions.money}
            onChange={(team, to) => setSelection({ team, division, to })}
          />
        ))}
        <SelectionDialog
          change={selection}
          eventId={view.id}
          onClose={() => setSelection(null)}
        />
      </div>
    );
  }
  return (
    <div className="ev-stack">
      {toolbar}
      <Roster
        attendees={view.attendees}
        canCheckIn={
          permissions.checkIn &&
          view.status !== "cancelled" &&
          view.segment !== "drafts" &&
          (view.eventDay || view.segment === "past" || view.live)
        }
        eventId={view.id}
      />
    </div>
  );
}

function DivisionEntries({
  division,
  editable,
  money,
  currency,
  eventId,
  onChange,
}: {
  readonly division: DivisionView;
  readonly editable: boolean;
  readonly money: boolean;
  readonly currency: string;
  readonly eventId: string;
  readonly onChange: (team: TeamView, to: SelectionChange) => void;
}) {
  const field = division.teams.filter(
    (team) => team.selection === "confirmed" || team.selection === "pending",
  );
  const waiting = division.teams.filter(
    (team) => team.selection === "waitlisted",
  );
  const withdrawn = division.teams.filter(
    (team) => team.selection === "withdrawn",
  );
  const row = (team: TeamView) => (
    <li
      className="ev-item"
      data-dim={team.selection === "withdrawn" || undefined}
      key={team.id}
    >
      <span className="ev-item__main">
        <span className="ev-item__title">
          {team.seed && team.selection === "confirmed" ? (
            <span aria-label={`Seed ${team.seed}`} className="ev-seed">
              {team.seed}
            </span>
          ) : null}
          {team.name}
        </span>
        <span className="ev-quiet">
          {team.players.join(", ")}
          {team.payment ? ` · ${team.payment}` : ""}
          {team.attention ? ` · ${team.attention}` : ""}
        </span>
      </span>
      <span className="ev-item__side">
        {team.needsAttention && team.selection !== "withdrawn" ? (
          <Chip tone="attention">Needs a look</Chip>
        ) : null}
        <Chip tone={SELECTION_WORDS[team.selection].tone}>
          {SELECTION_WORDS[team.selection].label}
        </Chip>
        {editable && !team.locked && team.selection !== "withdrawn" ? (
          <Menu onAction={(value) => onChange(team, value as SelectionChange)}>
            <MenuTrigger
              aria-label={`Change ${team.name}`}
              iconOnly
              size="sm"
              variant="ghost"
            >
              <Icon name="more" size="control" />
            </MenuTrigger>
            <MenuContent>
              {team.selection !== "confirmed" ? (
                <MenuItem value="confirmed">Move into the field</MenuItem>
              ) : (
                <MenuItem value="waitlisted">Move to the waitlist</MenuItem>
              )}
              <MenuItem value="withdrawn">Withdraw</MenuItem>
            </MenuContent>
          </Menu>
        ) : null}
      </span>
    </li>
  );
  return (
    <PageSection
      aside={
        <span className="ev-actions">
          {money ? (
            <Chip
              kind="metric"
              value={
                division.entryFeeMinor
                  ? formatMoney(division.entryFeeMinor, currency)
                  : "Free"
              }
            >
              Fee
            </Chip>
          ) : null}
          <a
            className="ev-link"
            href={`/events/${eventId}/divisions/${division.id}`}
          >
            Division controls
          </a>
        </span>
      }
      flush
      id={`division-${division.id}`}
      title={`${division.name} · ${division.fieldWords}`}
    >
      {division.teams.length === 0 ? (
        <p className="ev-quiet ev-pad">No teams have entered yet.</p>
      ) : (
        <>
          <ul aria-label={`${division.name}: the field`} className="ev-list">
            {field.map(row)}
          </ul>
          {waiting.length ? (
            <>
              <h3 className="ev-subhead">Waitlist · {waiting.length}</h3>
              <ol
                aria-label={`${division.name}: the waitlist`}
                className="ev-list"
              >
                {waiting.map(row)}
              </ol>
            </>
          ) : null}
          {withdrawn.length ? (
            <>
              <h3 className="ev-subhead">Withdrawn · {withdrawn.length}</h3>
              <ul className="ev-list">{withdrawn.map(row)}</ul>
            </>
          ) : null}
        </>
      )}
    </PageSection>
  );
}

const changeWords: Readonly<
  Record<
    SelectionChange,
    { verb: string; title: (team: string) => string; description: string }
  >
> = {
  confirmed: {
    verb: "Move into the field",
    title: (team) => `Move ${team} into the field?`,
    description:
      "They take a place in the draw. The team's entry shows it in Duna.",
  },
  waitlisted: {
    verb: "Move to the waitlist",
    title: (team) => `Move ${team} to the waitlist?`,
    description:
      "Their place opens for the next team. The team's entry shows it in Duna.",
  },
  withdrawn: {
    verb: "Withdraw team",
    title: (team) => `Withdraw ${team}?`,
    description:
      "They leave the division. Refund them from Money if they paid: withdrawing returns nothing by itself.",
  },
};

function SelectionDialog({
  change,
  eventId,
  onClose,
}: {
  readonly change: {
    team: TeamView;
    division: DivisionView;
    to: SelectionChange;
  } | null;
  readonly eventId: string;
  readonly onClose: () => void;
}) {
  const router = useRouter();
  const inline = useConfirm({ presentation: "inline" });
  const [reason, setReason] = useState("");
  const [seed, setSeed] = useState<number | null>(null);
  const words = change ? changeWords[change.to] : undefined;
  return (
    <Dialog
      {...inline.hostProps}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
          setReason("");
          setSeed(null);
        }
      }}
      open={change !== null}
    >
      {change && words ? (
        <DialogContent
          description={`${change.division.name} · ${change.team.players.join(" and ")}`}
          title={words.verb}
        >
          <ConfirmSlot confirm={inline}>
            <div className="ev-form">
              {change.to === "confirmed" ? (
                <Field
                  hint="Leave empty to seed them last."
                  label="Seed"
                  optional
                >
                  <NumberInput
                    max={1_000}
                    min={1}
                    onValueChange={(value) => setSeed(value ?? null)}
                    value={seed}
                  />
                </Field>
              ) : null}
              <Field
                error={
                  reason.length > 0 && reason.trim().length < 3
                    ? "At least 3 characters."
                    : undefined
                }
                hint="Kept with the event's history. The team doesn't see it."
                label="Why"
              >
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
                disabled={reason.trim().length < 3}
                onClick={() =>
                  void inline
                    .run({
                      tier: "confirm",
                      destructive: change.to === "withdrawn",
                      title: words.title(change.team.name),
                      description: words.description,
                      affected: `${change.team.players.join(" and ")}.`,
                      verb: words.verb,
                      cancelLabel: "Keep as is",
                      agentConfirm: `${words.verb}: ${change.team.name} in ${change.division.name}`,
                      perform: async ({ idempotencyKey }) =>
                        unwrap(
                          await setTeamSelectionAction({
                            sessionId: eventId,
                            teamEntryId: change.team.id,
                            status: change.to,
                            ...(seed ? { seed } : {}),
                            reason,
                            idempotencyKey,
                          }),
                        ),
                      success: `${change.team.name}: ${SELECTION_WORDS[change.to].label.toLowerCase()}`,
                      report: failed("hq.events.selection_failed"),
                    })
                    .then((outcome) => {
                      if (outcome.status === "done") {
                        onClose();
                        setReason("");
                        setSeed(null);
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

const attendanceWords: Readonly<
  Record<
    AttendeeView["attendance"],
    { label: string; tone: "positive" | "neutral" | "warning" | "danger" }
  >
> = {
  attended: { label: "Checked in", tone: "positive" },
  "no-show": { label: "No-show", tone: "warning" },
  scheduled: { label: "Expected", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

/** The roster of a session without divisions, with check-in and no-show (Undo for 6 s). */
function Roster({
  attendees,
  canCheckIn,
  eventId,
}: {
  readonly attendees: readonly AttendeeView[];
  readonly canCheckIn: boolean;
  readonly eventId: string;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [marks, setMarks] = useState<
    Readonly<Record<string, AttendeeView["attendance"]>>
  >({});
  if (attendees.length === 0) {
    return (
      <EmptyFirstUse
        action={
          <Button href={`/schedule`} variant="secondary">
            Open the schedule
          </Button>
        }
        description="People who book appear here, with their payment and check-in."
        icon="users"
        title="Nobody has entered yet"
      />
    );
  }
  const mark = (attendee: AttendeeView, status: "attended" | "no-show") => {
    const before = marks[attendee.registrationId] ?? attendee.attendance;
    void confirm.run({
      tier: "undo",
      title:
        status === "attended"
          ? `${attendee.name} checked in`
          : `${attendee.name} marked no-show`,
      undoneMessage: `${attendee.name} is back to expected`,
      optimistic: () => {
        setMarks((current) => ({
          ...current,
          [attendee.registrationId]: status,
        }));
        return () =>
          setMarks((current) => ({
            ...current,
            [attendee.registrationId]: before,
          }));
      },
      perform: async ({ idempotencyKey }) =>
        unwrap(
          await recordAttendanceAction({
            sessionId: eventId,
            registrationId: attendee.registrationId,
            status,
            idempotencyKey,
          }),
        ),
      reverse: async () =>
        unwrap(
          await recordAttendanceAction({
            sessionId: eventId,
            registrationId: attendee.registrationId,
            status: "scheduled",
            idempotencyKey: crypto.randomUUID(),
          }),
        ),
      onUndone: () => router.refresh(),
      report: failed("hq.events.attendance_failed"),
    });
  };
  return (
    <PageSection
      flush
      id="roster"
      title={`Roster · ${attendees.filter((a) => a.status !== "cancelled" && a.status !== "refunded").length}`}
    >
      <ul className="ev-list">
        {attendees.map((attendee) => {
          const gone =
            attendee.status === "cancelled" || attendee.status === "refunded";
          const attendance =
            marks[attendee.registrationId] ?? attendee.attendance;
          const words = attendanceWords[attendance];
          return (
            <li
              className="ev-item"
              data-dim={gone || undefined}
              key={attendee.registrationId}
            >
              <span className="ev-item__main">
                <span className="ev-item__title">
                  {attendee.name}
                  {attendee.guest ? <Chip kind="taxonomy">Guest</Chip> : null}
                </span>
                <span className="ev-quiet">
                  {gone
                    ? attendee.status === "refunded"
                      ? "Refunded"
                      : "Cancelled"
                    : attendee.payment}
                  {attendee.status === "waitlisted" ? " · Waitlist" : ""}
                </span>
              </span>
              <span className="ev-item__side">
                {!gone ? <Chip tone={words.tone}>{words.label}</Chip> : null}
                {attendee.claimUrl ? (
                  <Button
                    onClick={() =>
                      void navigator.clipboard
                        .writeText(attendee.claimUrl!)
                        .then(() => successToast("Invitation link copied"))
                    }
                    size="sm"
                    variant="ghost"
                  >
                    Copy invitation
                  </Button>
                ) : null}
                {canCheckIn && !gone && attendance === "scheduled" ? (
                  <>
                    <Button
                      onClick={() => mark(attendee, "attended")}
                      size="sm"
                      variant="secondary"
                    >
                      Check in
                    </Button>
                    <Button
                      onClick={() => mark(attendee, "no-show")}
                      size="sm"
                      variant="ghost"
                    >
                      No-show
                    </Button>
                  </>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
      {confirm.dialog}
    </PageSection>
  );
}

/**
 * Add a player to a division by hand: someone on Duna (search) or a guest
 * who gets an invitation. Letting them in free waives the entry fee, so that
 * is said with the amount before it happens.
 */
function AddPlayer({
  eventId,
  divisions,
  money,
  currency,
}: {
  readonly currency: string;
  readonly eventId: string;
  readonly divisions: readonly DivisionView[];
  readonly money: boolean;
}) {
  const router = useRouter();
  const inline = useConfirm({ presentation: "inline" });
  const [open, setOpen] = useState(false);
  const [divisionId, setDivisionId] = useState(divisions[0]?.id ?? "");
  const [who, setWho] = useState<"duna" | "guest">("duna");
  const [picked, setPicked] = useState<PlayerMatch | null>(null);
  const [guest, setGuest] = useState({
    givenName: "",
    familyName: "",
    email: "",
  });
  const [payment, setPayment] = useState<"to-be-paid" | "complimentary">(
    "to-be-paid",
  );
  const [reason, setReason] = useState("");
  const search = useAsyncSearch<PlayerMatch>({
    minLength: 2,
    search: async (query) =>
      unwrap(
        await searchPlayersAction({ sessionId: eventId, query }),
      ) as PlayerMatch[],
  });
  const division = divisions.find((entry) => entry.id === divisionId);
  const name =
    who === "duna"
      ? picked?.name
      : `${guest.givenName} ${guest.familyName}`.trim();
  const ready =
    Boolean(division) &&
    reason.trim().length >= 3 &&
    (who === "duna"
      ? Boolean(picked)
      : guest.givenName.trim() && guest.familyName.trim());
  const fee = division?.entryFeeMinor
    ? formatMoney(division.entryFeeMinor, currency)
    : undefined;
  const reset = () => {
    setPicked(null);
    setGuest({ givenName: "", familyName: "", email: "" });
    setReason("");
    setPayment("to-be-paid");
    search.setQuery("");
  };
  return (
    <>
      <Button
        icon={<Icon name="user-plus" size="control" />}
        onClick={() => setOpen(true)}
        size="sm"
        variant="secondary"
      >
        Add a player
      </Button>
      <Dialog
        {...inline.hostProps}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
        open={open}
      >
        <DialogContent
          description="Someone on Duna, or a guest who gets an invitation to claim their place."
          title="Add a player"
        >
          <ConfirmSlot confirm={inline}>
            <div className="ev-form">
              <Field label="Division">
                <Select
                  onValueChange={(value) => setDivisionId(value ?? "")}
                  options={divisions.map((entry) => ({
                    value: entry.id,
                    label: entry.name,
                  }))}
                  value={divisionId}
                />
              </Field>
              <RadioGroup
                aria-label="Who"
                inline
                onValueChange={(value) => setWho(value as "duna" | "guest")}
                value={who}
              >
                <RadioOption label="On Duna" value="duna" />
                <RadioOption label="A guest" value="guest" />
              </RadioGroup>
              {who === "duna" ? (
                <SearchField
                  label="Find a player"
                  onSubmit={search.submit}
                  onValueChange={search.setQuery}
                  placeholder="Name or handle"
                  resultCount={search.results.length}
                  stale={search.stale}
                  status={search.status}
                  value={search.query}
                >
                  <ul aria-label="Players" className="ev-results">
                    {search.results.map((player) => (
                      <li key={player.id}>
                        <button
                          aria-pressed={picked?.id === player.id}
                          onClick={() => setPicked(player)}
                          type="button"
                        >
                          {player.name}{" "}
                          <span className="ev-quiet">{player.handle}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </SearchField>
              ) : (
                <div className="ev-form__row">
                  <Field label="First name">
                    <Input
                      onChange={(event) =>
                        setGuest({ ...guest, givenName: event.target.value })
                      }
                      value={guest.givenName}
                    />
                  </Field>
                  <Field label="Last name">
                    <Input
                      onChange={(event) =>
                        setGuest({ ...guest, familyName: event.target.value })
                      }
                      value={guest.familyName}
                    />
                  </Field>
                  <Field
                    hint="Their invitation goes here."
                    label="Email"
                    optional
                  >
                    <Input
                      onChange={(event) =>
                        setGuest({ ...guest, email: event.target.value })
                      }
                      type="email"
                      value={guest.email}
                    />
                  </Field>
                </div>
              )}
              <RadioGroup
                aria-label="Entry fee"
                onValueChange={(value) => setPayment(value as typeof payment)}
                value={payment}
              >
                <RadioOption
                  description={
                    money && fee
                      ? `They owe ${fee}, paid in Duna.`
                      : "They pay the entry fee in Duna."
                  }
                  label="They pay the fee"
                  value="to-be-paid"
                />
                <RadioOption
                  description={
                    money && fee
                      ? `The ${fee} fee is waived.`
                      : "The entry fee is waived."
                  }
                  label="Free entry"
                  value="complimentary"
                />
              </RadioGroup>
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
                disabled={!ready}
                onClick={() =>
                  void inline
                    .run(
                      payment === "complimentary"
                        ? {
                            tier: "strong",
                            title: `Add ${name} free of charge?`,
                            description: `${name} enters ${division?.name} without paying.`,
                            amount: fee
                              ? `${fee} entry fee waived`
                              : "Entry fee waived",
                            recipients: `${name}${who === "guest" ? ", invited by email" : ""}`,
                            consequence:
                              "The club collects nothing for this entry.",
                            verb: "Add free of charge",
                            cancelLabel: "Go back",
                            agentConfirm: `Adds ${name} to ${division?.name} with the entry fee waived`,
                            perform: async ({ idempotencyKey }) =>
                              unwrap(
                                await addPlayerAction({
                                  sessionId: eventId,
                                  divisionId,
                                  identity:
                                    who === "duna"
                                      ? { kind: "duna", personId: picked!.id }
                                      : { kind: "guest", ...guest },
                                  payment,
                                  reason,
                                  idempotencyKey,
                                }),
                              ),
                            success: `${name} is in`,
                            report: failed("hq.events.add_player_failed"),
                          }
                        : {
                            tier: "confirm",
                            title: `Add ${name} to ${division?.name}?`,
                            description:
                              fee && money
                                ? `They owe the ${fee} entry fee and pay it in Duna.`
                                : "They pay the entry fee in Duna.",
                            affected:
                              who === "guest"
                                ? `${name} is invited to claim their place.`
                                : `${name} sees the entry in Duna.`,
                            verb: "Add player",
                            agentConfirm: `Adds ${name} to ${division?.name}`,
                            perform: async ({ idempotencyKey }) =>
                              unwrap(
                                await addPlayerAction({
                                  sessionId: eventId,
                                  divisionId,
                                  identity:
                                    who === "duna"
                                      ? { kind: "duna", personId: picked!.id }
                                      : { kind: "guest", ...guest },
                                  payment,
                                  reason,
                                  idempotencyKey,
                                }),
                              ),
                            success: `${name} is in`,
                            report: failed("hq.events.add_player_failed"),
                          },
                    )
                    .then((outcome) => {
                      if (outcome.status === "done") {
                        setOpen(false);
                        reset();
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
      </Dialog>
    </>
  );
}
