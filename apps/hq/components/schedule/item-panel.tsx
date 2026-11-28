"use client";

import { hqHref } from "@duna/core/hq-routes";
import { Icon } from "@duna/ui/icons";
import {
  Button,
  Combobox,
  ConfirmSlot,
  Field,
  Notice,
  Select,
  Sheet,
  SheetContent,
  Textarea,
  useConfirm,
} from "@duna/ui/tideline";
import { localDateOf } from "@duna/scheduling";
import { useMemo, useState } from "react";
import {
  cancelItemAction,
  equipmentAction,
  markPaidAction,
  rosterAction,
} from "@/app/(next)/(hq)/schedule/actions";
import {
  clock,
  clockRange,
  longDate,
  MINUTE_MS,
  minuteOfPlaceDay,
  money,
  namesWords,
  placeDay,
  plural,
  type CourtFacts,
  type ItemPerson,
  type ScheduleItem,
} from "./schedule-model";
import {
  act,
  GroupChip,
  KindIcon,
  kindWords,
  reportError,
  useSheetSide,
} from "./schedule-parts";

export interface PanelPermissions {
  readonly change: boolean;
  readonly checkIn: boolean;
  readonly refund: boolean;
}

/**
 * Anything on the calendar, opened in a side panel: what and when, the
 * people with their payment and check-in, and what can be done, each at
 * its confirmation tier. Cancelling tells the people booked and is
 * confirmed first; a payment recorded at the desk is confirmed; check-in is
 * immediate with Undo. Messages are never sent from here: "Message" opens
 * Inbox with the person, where a person reviews and sends.
 */
export function ItemPanel({
  item,
  courts,
  members,
  inventory,
  permissions,
  nowMs,
  onClose,
  onCheckIn,
  onMove,
  onChanged,
}: {
  readonly item: ScheduleItem | null;
  readonly courts: readonly CourtFacts[];
  readonly members: readonly { readonly id: string; readonly name: string }[];
  readonly inventory: readonly {
    readonly id: string;
    readonly label: string;
    readonly available: number;
  }[];
  readonly permissions: PanelPermissions;
  readonly nowMs: number;
  readonly onClose: () => void;
  readonly onCheckIn: (item: ScheduleItem, person: ItemPerson) => void;
  readonly onMove: (
    item: ScheduleItem,
    next: { startsAt: string; endsAt: string; courtId?: string },
  ) => void;
  readonly onChanged: () => void;
}) {
  const side = useSheetSide();
  const confirm = useConfirm({ presentation: "inline" });
  return (
    <Sheet
      side={side}
      {...confirm.hostProps}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      open={item !== null}
    >
      {item ? (
        <SheetContent
          description={`${kindWords(item)} · ${longDate(localDateOf(Date.parse(item.startsAt), item.timeZone))}`}
          title={item.title}
        >
          <ConfirmSlot confirm={confirm}>
            <PanelBody
              confirm={confirm}
              courts={courts}
              inventory={inventory}
              item={item}
              key={`${item.source}:${item.id}`}
              members={members}
              nowMs={nowMs}
              onChanged={onChanged}
              onCheckIn={onCheckIn}
              onClose={onClose}
              onMove={onMove}
              permissions={permissions}
            />
          </ConfirmSlot>
        </SheetContent>
      ) : null}
    </Sheet>
  );
}

function PanelBody({
  item,
  courts,
  members,
  inventory,
  permissions,
  nowMs,
  confirm,
  onCheckIn,
  onMove,
  onChanged,
  onClose,
}: {
  readonly item: ScheduleItem;
  readonly courts: readonly CourtFacts[];
  readonly members: readonly { readonly id: string; readonly name: string }[];
  readonly inventory: readonly {
    readonly id: string;
    readonly label: string;
    readonly available: number;
  }[];
  readonly permissions: PanelPermissions;
  readonly nowMs: number;
  readonly confirm: ReturnType<typeof useConfirm>;
  readonly onCheckIn: (item: ScheduleItem, person: ItemPerson) => void;
  readonly onMove: (
    item: ScheduleItem,
    next: { startsAt: string; endsAt: string; courtId?: string },
  ) => void;
  readonly onChanged: () => void;
  readonly onClose: () => void;
}) {
  const [panel, setPanel] = useState<"home" | "move" | "cancel">("home");
  const [reason, setReason] = useState("");
  const [adding, setAdding] = useState<string | null>(null);
  const [gear, setGear] = useState<string | null>(null);
  const zone = item.timeZone;
  const rosterEditable =
    permissions.change &&
    !item.cancelled &&
    !ended(item, nowMs) &&
    (item.kind === "session" || item.kind === "lesson") &&
    (item.source === "calendar-session" || item.source === "demo");
  const takeOff = (person: ItemPerson) => {
    void confirm
      .run({
        tier: "confirm",
        destructive: true,
        title: `Take ${person.name} off ${item.title}?`,
        description: `Their place opens again. Refunds, if any, are made in Money.`,
        affected: `${person.name} is told they are no longer booked.`,
        verb: `Take ${person.name.split(" ")[0]} off`,
        cancelLabel: "Keep them",
        agentConfirm: `Removes ${person.name} from ${item.title}`,
        perform: ({ idempotencyKey }) =>
          act(
            rosterAction({
              itemId: item.id,
              source: item.source,
              op: "remove",
              rowId: person.id,
              idempotencyKey,
            }),
          ),
        success: `${person.name} taken off ${item.title}`,
        report: reportError,
      })
      .then((outcome) => {
        if (outcome.status === "done") onChanged();
      });
  };
  const addPerson = () => {
    const member = members.find((candidate) => candidate.id === adding);
    if (!member) return;
    void confirm
      .run({
        tier: "confirm",
        title: `Add ${member.name} to ${item.title}?`,
        description: `${clockRange(item.startsAt, item.endsAt, zone)}${item.courtName ? ` on ${item.courtName}` : ""}.`,
        affected: `${member.name} is told they are booked.`,
        verb: `Add ${member.name.split(" ")[0]}`,
        agentConfirm: `Adds ${member.name} to ${item.title}`,
        perform: ({ idempotencyKey }) =>
          act(
            rosterAction({
              itemId: item.id,
              source: item.source,
              op: "add",
              personId: member.id,
              name: member.name,
              idempotencyKey,
            }),
          ),
        success: `${member.name} added to ${item.title}`,
        report: reportError,
      })
      .then((outcome) => {
        if (outcome.status === "done") {
          setAdding(null);
          onChanged();
        }
      });
  };
  const due = (item.amountMinor ?? 0) - (item.paidMinor ?? 0);
  const people = item.people;
  const isOver = ended(item, nowMs);

  if (panel === "move") {
    return (
      <MoveForm
        courts={courts.filter(
          (court) => !item.placeId || court.placeId === item.placeId,
        )}
        item={item}
        onBack={() => setPanel("home")}
        onMove={(next) => onMove(item, next)}
      />
    );
  }

  if (panel === "cancel") {
    const names = people.map((person) => person.name);
    return (
      <form
        aria-label={`Cancel ${item.title}`}
        className="sch-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (reason.trim().length < 3) return;
          void confirm
            .run({
              tier: "confirm",
              destructive: true,
              title: `Cancel ${item.title}?`,
              description: `${item.title} on ${longDate(localDateOf(Date.parse(item.startsAt), zone))}, ${clockRange(item.startsAt, item.endsAt, zone)}, comes off the schedule and ${item.courtName ?? "the court"} opens again.`,
              affected:
                names.length > 0
                  ? `${plural(names.length, "person", "people")} booked ${names.length === 1 ? "is" : "are"} told it is off, with your reason: ${namesWords(names)}.`
                  : "Nobody is booked yet.",
              verb:
                names.length > 0
                  ? `Cancel and tell ${plural(names.length, "person", "people")}`
                  : `Cancel ${item.title}`,
              cancelLabel: "Keep it",
              agentConfirm: `Cancels ${item.title} at ${clock(item.startsAt, zone)} and tells ${names.length} people`,
              perform: ({ idempotencyKey }) =>
                act(
                  cancelItemAction({
                    id: item.id,
                    source: item.source,
                    reason: reason.trim(),
                    idempotencyKey,
                  }),
                ),
              success: `${item.title} cancelled`,
              report: reportError,
            })
            .then((outcome) => {
              if (outcome.status === "done") {
                onChanged();
                onClose();
              }
            });
        }}
      >
        <Field
          error={
            reason.length > 0 && reason.trim().length < 3
              ? "Say why in a few words."
              : undefined
          }
          label="Reason, shown to the people booked"
        >
          <Textarea
            onChange={(event) => setReason(event.currentTarget.value)}
            rows={3}
            value={reason}
          />
        </Field>
        {people.some((person) => person.payment === "paid") ? (
          <Notice tone="info">
            Refunds are made in Money, where each sale shows what was paid and
            how it goes back.
          </Notice>
        ) : null}
        <div className="sch-actions">
          <Button onClick={() => setPanel("home")} variant="secondary">
            Back
          </Button>
          <Button
            disabled={reason.trim().length < 3}
            type="submit"
            variant="danger"
          >
            Cancel{" "}
            {item.kind === "booking"
              ? "booking"
              : item.kind === "lesson"
                ? "lesson"
                : "session"}
            …
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="sch-panel" data-testid="schedule-panel">
      <dl className="sch-panel__facts">
        <dt>When</dt>
        <dd>
          <span className="sch-time">
            {clockRange(item.startsAt, item.endsAt, zone)}
          </span>
        </dd>
        {item.courtName ? (
          <>
            <dt>Where</dt>
            <dd>
              {item.courtName}
              {item.placeName ? ` · ${item.placeName}` : ""}
            </dd>
          </>
        ) : null}
        {item.coachName ? (
          <>
            <dt>Coach</dt>
            <dd>{item.coachName}</dd>
          </>
        ) : null}
        <dt>What</dt>
        <dd>
          <KindIcon kind={item.kind} /> {kindWords(item)}
          {item.cancelled ? " · Cancelled" : ""}
        </dd>
        {item.reason && item.kind === "block" ? (
          <>
            <dt>Why</dt>
            <dd>{item.reason}</dd>
          </>
        ) : null}
        {item.amountMinor !== undefined ? (
          <>
            <dt>Payment</dt>
            <dd>
              {due > 0
                ? `${money(due, item.currency)} due of ${money(item.amountMinor, item.currency)}`
                : `Paid · ${money(item.amountMinor, item.currency)}`}
            </dd>
          </>
        ) : null}
      </dl>

      {item.groupStatus ? (
        <div>
          <GroupChip item={item} />
          {item.groupLine ? (
            <p className="sch-quiet">{item.groupLine}</p>
          ) : null}
        </div>
      ) : null}

      {people.length > 0 ? (
        <section aria-label="People">
          <h3>
            People · <span className="sch-time">{people.length}</span>
          </h3>
          <ul className="sch-roster">
            {people.map((person) => (
              <li key={person.id}>
                <span className="sch-roster__who">
                  <span>{person.name}</span>
                  <small>
                    {[
                      person.checkedIn
                        ? "Checked in"
                        : person.noShow
                          ? "No-show"
                          : "Not checked in",
                      person.payment === "due"
                        ? "Payment due"
                        : person.payment === "paid"
                          ? "Paid"
                          : undefined,
                      person.minor ? "Junior" : undefined,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                </span>
                <span className="sch-actions">
                  {permissions.checkIn &&
                  !item.cancelled &&
                  !person.checkedIn ? (
                    <Button
                      aria-label={`Check in ${person.name}`}
                      onClick={() => onCheckIn(item, person)}
                      size="sm"
                      variant="secondary"
                    >
                      Check in
                    </Button>
                  ) : null}
                  {rosterEditable ? (
                    <Button
                      aria-label={`Take ${person.name} off`}
                      onClick={() => takeOff(person)}
                      size="sm"
                      title="Take off"
                      variant="ghost"
                    >
                      <Icon name="minus" size="inline" />
                    </Button>
                  ) : null}
                  {person.personId ? (
                    <Button
                      aria-label={`Message ${person.name} in Inbox`}
                      href={`${hqHref("inboxCreate")}?recipient=${encodeURIComponent(person.personId)}`}
                      size="sm"
                      title="Message in Inbox"
                      variant="ghost"
                    >
                      <Icon name="message" size="inline" />
                    </Button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
          <p className="sch-quiet">
            Messages open in Inbox, where you review them before anything is
            sent.
          </p>
        </section>
      ) : item.kind !== "block" && item.kind !== "event" ? (
        <p className="sch-quiet">Nobody is booked yet.</p>
      ) : null}

      {rosterEditable && members.length > 0 ? (
        <div className="sch-add">
          <Field label="Add a member">
            <Combobox
              emptyText="Nobody by that name."
              onValueChange={setAdding}
              options={members
                .filter(
                  (member) =>
                    !people.some((person) => person.personId === member.id),
                )
                .map((member) => ({ value: member.id, label: member.name }))}
              placeholder="Search members"
              value={adding}
            />
          </Field>
          <Button disabled={!adding} onClick={addPerson} variant="secondary">
            Add to {item.kind === "lesson" ? "lesson" : "session"}
          </Button>
        </div>
      ) : null}

      {item.source === "calendar-session" &&
      (item.equipment?.length ||
        (permissions.change && inventory.length > 0)) ? (
        <section aria-label="Equipment">
          <h3>Equipment</h3>
          {item.equipment && item.equipment.length > 0 ? (
            <ul className="sch-roster">
              {item.equipment.map((row) => (
                <li key={row.id}>
                  <span>
                    {row.label}{" "}
                    <span className="sch-time">× {row.quantity}</span>
                  </span>
                  {permissions.change ? (
                    <Button
                      aria-label={`Release ${row.label}`}
                      onClick={() => {
                        void confirm
                          .run({
                            tier: "confirm",
                            title: `Release ${row.label}?`,
                            description:
                              "It goes back to the club's stock for others to reserve.",
                            verb: `Release ${row.label}`,
                            agentConfirm: `Releases ${row.label} from ${item.title}`,
                            perform: ({ idempotencyKey }) =>
                              act(
                                equipmentAction({
                                  itemId: item.id,
                                  op: "remove",
                                  reservationId: row.id,
                                  idempotencyKey,
                                }),
                              ),
                            success: `${row.label} released`,
                            report: reportError,
                          })
                          .then((outcome) => {
                            if (outcome.status === "done") onChanged();
                          });
                      }}
                      size="sm"
                      variant="ghost"
                    >
                      Release
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="sch-quiet">No equipment reserved.</p>
          )}
          {permissions.change && inventory.length > 0 && !item.cancelled ? (
            <div className="sch-form__row">
              <Field label="Reserve equipment">
                <Select
                  onValueChange={setGear}
                  options={inventory.map((row) => ({
                    value: row.id,
                    label: `${row.label} (${row.available} free)`,
                  }))}
                  value={gear}
                />
              </Field>
              <Button
                disabled={!gear}
                onClick={() => {
                  const row = inventory.find(
                    (candidate) => candidate.id === gear,
                  );
                  if (!row) return;
                  void confirm
                    .run({
                      tier: "confirm",
                      title: `Reserve ${row.label} for ${item.title}?`,
                      description:
                        "One is held for this session until it ends.",
                      verb: `Reserve ${row.label}`,
                      agentConfirm: `Reserves ${row.label} for ${item.title}`,
                      perform: ({ idempotencyKey }) =>
                        act(
                          equipmentAction({
                            itemId: item.id,
                            op: "add",
                            inventoryId: row.id,
                            quantity: 1,
                            idempotencyKey,
                          }),
                        ),
                      success: `${row.label} reserved`,
                      report: reportError,
                    })
                    .then((outcome) => {
                      if (outcome.status === "done") {
                        setGear(null);
                        onChanged();
                      }
                    });
                }}
                variant="secondary"
              >
                Reserve
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="sch-actions">
        {item.href ? (
          <Button href={item.href} variant="secondary">
            {item.kind === "event" ? "Open the event" : "Open in Offerings"}
          </Button>
        ) : null}
        {permissions.change && due > 0 && !item.cancelled ? (
          <Button
            onClick={() => {
              void confirm
                .run({
                  tier: "confirm",
                  title: `Record ${money(due, item.currency)} paid at the desk?`,
                  description: `The booking for ${item.who ?? item.title} shows as paid. Use this only when the money was taken in person.`,
                  verb: `Record ${money(due, item.currency)} paid`,
                  agentConfirm: `Records ${money(due, item.currency)} paid at the desk for ${item.who ?? item.title}`,
                  perform: ({ idempotencyKey }) =>
                    act(markPaidAction({ id: item.id, idempotencyKey })),
                  success: `${money(due, item.currency)} recorded as paid`,
                  report: reportError,
                })
                .then((outcome) => {
                  if (outcome.status === "done") onChanged();
                });
            }}
            variant="secondary"
          >
            Record payment
          </Button>
        ) : null}
        {permissions.change && item.movable && !item.cancelled && !isOver ? (
          <Button onClick={() => setPanel("move")} variant="secondary">
            Move…
          </Button>
        ) : null}
        {permissions.change &&
        item.kind !== "event" &&
        item.kind !== "block" &&
        !item.cancelled &&
        !isOver ? (
          <Button onClick={() => setPanel("cancel")} variant="ghost">
            Cancel…
          </Button>
        ) : null}
      </div>
      {!permissions.change ? (
        <p className="sch-quiet">
          You can see this; changing it is for the club's owner or front desk.
        </p>
      ) : null}
    </div>
  );
}

function ended(item: ScheduleItem, nowMs: number) {
  return Date.parse(item.endsAt) <= nowMs;
}

function MoveForm({
  item,
  courts,
  onBack,
  onMove,
}: {
  readonly item: ScheduleItem;
  readonly courts: readonly CourtFacts[];
  readonly onBack: () => void;
  readonly onMove: (next: {
    startsAt: string;
    endsAt: string;
    courtId?: string;
  }) => void;
}) {
  const zone = item.timeZone;
  const day = useMemo(
    () => placeDay(localDateOf(Date.parse(item.startsAt), zone), zone),
    [item.startsAt, zone],
  );
  const length =
    (Date.parse(item.endsAt) - Date.parse(item.startsAt)) / MINUTE_MS;
  const [start, setStart] = useState(minuteOfPlaceDay(item.startsAt, day));
  const [courtId, setCourtId] = useState(item.courtId ?? "");
  const options = useMemo(() => {
    const result: { value: string; label: string }[] = [];
    for (let minute = 0; minute + length <= day.minutes; minute += 15) {
      result.push({
        value: String(minute),
        label: clock(day.startMs + minute * MINUTE_MS, zone),
      });
    }
    return result;
  }, [day, length, zone]);
  return (
    <form
      aria-label={`Move ${item.title}`}
      className="sch-form"
      onSubmit={(event) => {
        event.preventDefault();
        const startsAt = new Date(
          day.startMs + start * MINUTE_MS,
        ).toISOString();
        onMove({
          startsAt,
          endsAt: new Date(
            Date.parse(startsAt) + length * MINUTE_MS,
          ).toISOString(),
          ...(courtId ? { courtId } : {}),
        });
      }}
    >
      <div className="sch-form__row">
        <Field label="New start">
          <Select
            onValueChange={(value) => value && setStart(Number(value))}
            options={options}
            value={String(start)}
          />
        </Field>
        {courts.length > 1 && item.courtId ? (
          <Field label="Court">
            <Select
              onValueChange={(value) => value && setCourtId(value)}
              options={courts.map((court) => ({
                value: court.id,
                label: court.name,
              }))}
              value={courtId}
            />
          </Field>
        ) : null}
      </div>
      <p className="sch-quiet">
        Same length ({clockRange(item.startsAt, item.endsAt, zone)} now). You
        can also drag it on the calendar.
      </p>
      <div className="sch-actions">
        <Button onClick={onBack} variant="secondary">
          Back
        </Button>
        <Button type="submit" variant="primary">
          Review the move
        </Button>
      </div>
    </form>
  );
}
