"use client";

import { localDateOf } from "@duna/scheduling";
import {
  Button,
  Checkbox,
  ConfirmSlot,
  Field,
  Input,
  Notice,
  Select,
  Sheet,
  SheetContent,
  Switch,
  useConfirm,
} from "@duna/ui/tideline";
import { useMemo, useState } from "react";
import { closeCourtsAction } from "@/app/(next)/(hq)/schedule/actions";
import {
  affectedBy,
  clock,
  clockRange,
  longDate,
  MINUTE_MS,
  minuteOfPlaceDay,
  namesWords,
  placeDay,
  plural,
  type CourtFacts,
  type ScheduleItem,
} from "./schedule-model";
import { act, reportError, useSheetSide } from "./schedule-parts";

export interface ClosureDraft {
  readonly date: string;
  readonly weather: boolean;
  readonly reason?: string;
}

/**
 * Close courts or hold play for weather: which courts, from when to when,
 * and why. The sessions and bookings it touches are listed as you choose;
 * confirming is the strong tier, restating the courts, the time and
 * everyone who is told, because it changes other people's plans.
 */
export function ClosureSheet({
  draft,
  courts,
  items,
  timeZone,
  nowMs,
  onClose,
  onDone,
}: {
  readonly draft: ClosureDraft | null;
  readonly courts: readonly CourtFacts[];
  readonly items: readonly ScheduleItem[];
  readonly timeZone: string;
  readonly nowMs: number;
  readonly onClose: () => void;
  readonly onDone: () => void;
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
      open={draft !== null}
    >
      {draft ? (
        <SheetContent
          description={longDate(draft.date)}
          title={draft.weather ? "Stop play for weather" : "Close courts"}
        >
          <ConfirmSlot confirm={confirm}>
            <ClosureForm
              confirm={confirm}
              courts={courts}
              draft={draft}
              items={items}
              key={`${draft.date}:${draft.weather}`}
              nowMs={nowMs}
              onDone={onDone}
              timeZone={timeZone}
            />
          </ConfirmSlot>
        </SheetContent>
      ) : null}
    </Sheet>
  );
}

function ClosureForm({
  draft,
  courts,
  items,
  timeZone,
  nowMs,
  confirm,
  onDone,
}: {
  readonly draft: ClosureDraft;
  readonly courts: readonly CourtFacts[];
  readonly items: readonly ScheduleItem[];
  readonly timeZone: string;
  readonly nowMs: number;
  readonly confirm: ReturnType<typeof useConfirm>;
  readonly onDone: () => void;
}) {
  const day = useMemo(
    () => placeDay(draft.date, timeZone),
    [draft.date, timeZone],
  );
  const isToday = localDateOf(nowMs, timeZone) === draft.date;
  const firstMinute = isToday
    ? Math.min(
        day.minutes - 60,
        Math.max(0, Math.floor(minuteOfPlaceDay(nowMs, day) / 15) * 15),
      )
    : (day.hours.find((hour) => hour.hour >= 8)?.minute ?? 0);
  const [selected, setSelected] = useState<readonly string[]>(
    courts.map((court) => court.id),
  );
  const [from, setFrom] = useState(firstMinute);
  const [to, setTo] = useState(
    Math.min(day.minutes, draft.weather ? firstMinute + 120 : day.minutes),
  );
  const [reason, setReason] = useState(
    draft.reason ?? (draft.weather ? "Weather hold" : ""),
  );
  const [cancelAffected, setCancelAffected] = useState(true);

  const options = useMemo(() => {
    const result: { value: string; label: string }[] = [];
    for (let minute = 0; minute <= day.minutes; minute += 15) {
      result.push({
        value: String(minute),
        label:
          minute === day.minutes
            ? "End of day"
            : clock(day.startMs + minute * MINUTE_MS, timeZone),
      });
    }
    return result;
  }, [day, timeZone]);

  const startsAt = new Date(day.startMs + from * MINUTE_MS).toISOString();
  const endsAt = new Date(day.startMs + to * MINUTE_MS).toISOString();
  const affected = affectedBy(items, { courtIds: selected, startsAt, endsAt });
  const people = [
    ...new Map(
      affected.flatMap((item) =>
        item.people.map(
          (person) => [person.personId ?? person.id, person.name] as const,
        ),
      ),
    ).values(),
  ];
  const courtNames = courts
    .filter((court) => selected.includes(court.id))
    .map((court) => court.name);
  const valid = selected.length > 0 && to > from && reason.trim().length >= 3;

  return (
    <form
      aria-label={draft.weather ? "Stop play for weather" : "Close courts"}
      className="sch-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return;
        const when = `${clockRange(startsAt, endsAt, timeZone)} on ${longDate(draft.date)}`;
        void confirm
          .run({
            tier: "strong",
            destructive: true,
            title: draft.weather
              ? `Stop play on ${plural(selected.length, "court")}?`
              : `Close ${plural(selected.length, "court")}?`,
            description: `${namesWords(courtNames, 4)} can't be booked ${when}.`,
            scope: `${namesWords(courtNames, 4)}, ${when}`,
            recipients:
              cancelAffected && people.length > 0
                ? `${plural(people.length, "person", "people")} in ${plural(affected.length, "session or booking", "sessions and bookings")} ${people.length === 1 ? "is" : "are"} told it is off: ${namesWords(people)}`
                : "Nobody is told: nothing booked is cancelled.",
            consequence:
              cancelAffected && affected.length > 0
                ? "Cancelled sessions can't be restored; refunds are made in Money."
                : "You can reopen the courts by removing the block.",
            verb: draft.weather
              ? `Stop play on ${plural(selected.length, "court")}`
              : `Close ${plural(selected.length, "court")}`,
            cancelLabel: "Keep courts open",
            agentConfirm: `Blocks ${courtNames.join(", ")} ${when} and cancels ${cancelAffected ? affected.length : 0} sessions`,
            perform: ({ idempotencyKey }) =>
              act(
                closeCourtsAction({
                  courtIds: selected,
                  startsAt,
                  endsAt,
                  timeZone,
                  reason: reason.trim(),
                  weather: draft.weather,
                  cancel: cancelAffected
                    ? affected.map((item) => ({
                        id: item.id,
                        source: item.source,
                      }))
                    : [],
                  idempotencyKey,
                }),
              ),
            success: (result) =>
              `${plural(result.closed, "court")} closed${result.cancelled > 0 ? `, ${plural(result.cancelled, "session")} cancelled` : ""}`,
            report: reportError,
          })
          .then((outcome) => {
            if (outcome.status === "done") onDone();
          });
      }}
    >
      <fieldset className="sch-courts">
        <legend className="td-field__label">Courts</legend>
        {courts.map((court) => (
          <Checkbox
            checked={selected.includes(court.id)}
            key={court.id}
            label={court.name}
            onCheckedChange={(checked) =>
              setSelected((current) =>
                checked === true
                  ? [...current, court.id]
                  : current.filter((id) => id !== court.id),
              )
            }
          />
        ))}
      </fieldset>
      <div className="sch-form__row">
        <Field label="From">
          <Select
            onValueChange={(value) => value && setFrom(Number(value))}
            options={options.slice(0, -1)}
            value={String(from)}
          />
        </Field>
        <Field
          error={to <= from ? "The end must be after the start." : undefined}
          label="Until"
        >
          <Select
            onValueChange={(value) => value && setTo(Number(value))}
            options={options.slice(1)}
            value={String(to)}
          />
        </Field>
      </div>
      <Field label="Reason, shown on the calendar and to the people told">
        <Input
          onChange={(event) => setReason(event.currentTarget.value)}
          value={reason}
        />
      </Field>
      <section aria-label="What this affects">
        {affected.length === 0 ? (
          <p className="sch-quiet" role="status">
            Nothing is booked on these courts then.
          </p>
        ) : (
          <Notice
            role="status"
            title={`${plural(affected.length, "session or booking", "sessions and bookings")} affected`}
            tone="warning"
          >
            <ul className="sch-affected">
              {affected.map((item) => (
                <li key={item.id}>
                  {clockRange(item.startsAt, item.endsAt, timeZone)} ·{" "}
                  {item.courtName} · {item.title}
                  {item.people.length > 0
                    ? ` (${plural(item.people.length, "person", "people")})`
                    : ""}
                </li>
              ))}
            </ul>
          </Notice>
        )}
      </section>
      {affected.length > 0 ? (
        <Switch
          checked={cancelAffected}
          description="Each person booked is told, with your reason."
          label="Cancel what's affected and tell the people booked"
          onCheckedChange={(checked: boolean) => setCancelAffected(checked)}
        />
      ) : null}
      <Button disabled={!valid} type="submit" variant="danger">
        {draft.weather ? "Review the stop" : "Review the closure"}
      </Button>
    </form>
  );
}
