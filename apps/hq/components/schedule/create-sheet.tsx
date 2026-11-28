"use client";

import { addCalendarDays, localDateOf } from "@duna/scheduling";
import {
  Button,
  Combobox,
  DatePicker,
  Field,
  Input,
  MoneyInput,
  Notice,
  RadioGroup,
  RadioOption,
  Select,
  Sheet,
  SheetContent,
  successToast,
  useAction,
} from "@duna/ui/tideline";
import { useMemo, useState } from "react";
import { createItemAction } from "@/app/(next)/(hq)/schedule/actions";
import {
  clock,
  durationWords,
  explainConflicts,
  longDate,
  minuteOfPlaceDay,
  MINUTE_MS,
  nearestAlternatives,
  placeDay,
  type CoachFacts,
  type CourtFacts,
  type ScheduleItem,
} from "./schedule-model";
import { act, reportError, useSheetSide } from "./schedule-parts";

export interface CreateDraft {
  readonly startsAt: string;
  readonly endsAt: string;
  readonly courtId?: string;
  readonly coachId?: string;
  readonly kind?: CreateKind;
}

type CreateKind = "booking" | "lesson" | "block";

const lengths = [30, 45, 60, 90, 120, 180, 240];

/**
 * Create in place: a short sheet opened from an empty slot (or "New
 * booking"). What, who, how long, and the price where it matters. Every
 * change re-asks the shared availability rule, so a conflict is explained
 * in words ("Community Court is booked until 11:00 AM", "Theo is off that
 * day") with the nearest free alternative one tap away. The button is
 * single-flight: a double click books once.
 */
export function CreateSheet({
  draft,
  onClose,
  onCreated,
  courts,
  coaches,
  people,
  items,
  timeZone,
  nowMs,
  canBook,
}: {
  /** Bookings and lessons can be created (capability switch); else blocks only. */
  readonly canBook: boolean;
  readonly draft: CreateDraft | null;
  readonly onClose: () => void;
  readonly onCreated: () => void;
  readonly courts: readonly CourtFacts[];
  readonly coaches: readonly CoachFacts[];
  readonly people: readonly { readonly id: string; readonly name: string }[];
  readonly items: readonly ScheduleItem[];
  readonly timeZone: string;
  readonly nowMs: number;
}) {
  const side = useSheetSide();
  return (
    <Sheet
      side={side}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      open={draft !== null}
    >
      {draft ? (
        <SheetContent
          description={longDate(
            localDateOf(Date.parse(draft.startsAt), timeZone),
          )}
          title="Add to the schedule"
        >
          <CreateForm
            coaches={coaches}
            courts={courts}
            draft={draft}
            items={items}
            key={`${draft.startsAt}:${draft.courtId ?? ""}:${draft.coachId ?? ""}`}
            canBook={canBook}
            nowMs={nowMs}
            onCreated={onCreated}
            people={people}
            timeZone={timeZone}
          />
        </SheetContent>
      ) : null}
    </Sheet>
  );
}

function CreateForm({
  draft,
  courts,
  coaches,
  people,
  items,
  timeZone,
  nowMs,
  onCreated,
  canBook,
}: {
  readonly canBook: boolean;
  readonly draft: CreateDraft;
  readonly courts: readonly CourtFacts[];
  readonly coaches: readonly CoachFacts[];
  readonly people: readonly { readonly id: string; readonly name: string }[];
  readonly items: readonly ScheduleItem[];
  readonly timeZone: string;
  readonly nowMs: number;
  readonly onCreated: () => void;
}) {
  const date = localDateOf(Date.parse(draft.startsAt), timeZone);
  const day = useMemo(() => placeDay(date, timeZone), [date, timeZone]);
  const [kind, setKind] = useState<CreateKind>(
    !canBook ? "block" : (draft.kind ?? (draft.coachId ? "lesson" : "booking")),
  );
  const [courtId, setCourtId] = useState(draft.courtId ?? courts[0]?.id ?? "");
  const [coachId, setCoachId] = useState(draft.coachId ?? "");
  const [start, setStart] = useState(minuteOfPlaceDay(draft.startsAt, day));
  const [length, setLength] = useState(
    Math.max(
      15,
      (Date.parse(draft.endsAt) - Date.parse(draft.startsAt)) / MINUTE_MS,
    ),
  );
  const [whoMode, setWhoMode] = useState<"member" | "walk-in">("member");
  const [personId, setPersonId] = useState<string | null>(null);
  const [walkIn, setWalkIn] = useState("");
  const [price, setPrice] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState<"blocked" | "maintenance">("blocked");
  const [repeatUntil, setRepeatUntil] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const startsAt = new Date(day.startMs + start * MINUTE_MS).toISOString();
  const endsAt = new Date(
    day.startMs + (start + length) * MINUTE_MS,
  ).toISOString();
  const court = courts.find((candidate) => candidate.id === courtId);
  const coach =
    kind === "lesson"
      ? coaches.find((candidate) => candidate.id === coachId)
      : undefined;
  const request = {
    startsAt,
    endsAt,
    timeZone,
    ...(court ? { court } : {}),
    ...(coach ? { coach } : {}),
  };
  const conflicts = explainConflicts(request, items);
  const alternatives =
    conflicts.length > 0
      ? nearestAlternatives(request, items, courts, 15, nowMs)
      : [];
  const personName = people.find((person) => person.id === personId)?.name;
  const who = whoMode === "member" ? personName : walkIn.trim() || undefined;

  const timeOptions = useMemo(() => {
    const options: { value: string; label: string }[] = [];
    for (let minute = 0; minute < day.minutes; minute += 15) {
      options.push({
        value: String(minute),
        label: clock(day.startMs + minute * MINUTE_MS, timeZone),
      });
    }
    return options;
  }, [day, timeZone]);

  const create = useAction(
    async ({ idempotencyKey }) =>
      act(
        createItemAction({
          kind,
          title:
            kind === "block"
              ? mode === "maintenance"
                ? "Maintenance"
                : "Blocked"
              : kind === "lesson"
                ? "Private lesson"
                : "Court hire",
          startsAt,
          endsAt,
          timeZone,
          ...(courtId ? { courtId } : {}),
          ...(kind === "lesson" && coachId ? { coachId } : {}),
          ...(kind === "block"
            ? {
                who: reason.trim() || undefined,
                reason: reason.trim() || undefined,
                mode,
                ...(repeatUntil ? { repeatUntil } : {}),
              }
            : {
                ...(who ? { who } : {}),
                ...(whoMode === "member" && personId ? { personId } : {}),
                ...(kind === "booking" && price ? { priceMinor: price } : {}),
              }),
          idempotencyKey,
        }),
      ),
    {
      report: reportError,
      onSuccess: () => {
        successToast(
          kind === "block"
            ? `${court?.name ?? "Time"} blocked ${clock(startsAt, timeZone)}–${clock(endsAt, timeZone)}${repeatUntil ? " every week" : ""}`
            : `${kind === "lesson" ? "Lesson" : "Booking"} added: ${court?.name ?? ""} ${clock(startsAt, timeZone)}`,
        );
        onCreated();
      },
    },
  );

  const submit = () => {
    if (conflicts.length > 0) {
      setProblem("Choose a free time or court first.");
      return;
    }
    if (kind !== "block" && !who) {
      setProblem(
        whoMode === "member"
          ? "Choose who the booking is for."
          : "Type the walk-in's name.",
      );
      return;
    }
    if (kind === "lesson" && !coachId) {
      setProblem("Choose the coach.");
      return;
    }
    if (Date.parse(startsAt) < nowMs - 15 * MINUTE_MS && kind !== "block") {
      setProblem("That time has passed. Choose a later time.");
      return;
    }
    setProblem(null);
    void create.run();
  };

  return (
    <form
      aria-label="Add to the schedule"
      className="sch-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <RadioGroup
        aria-label="What"
        inline
        onValueChange={(value: unknown) => setKind(value as CreateKind)}
        value={kind}
      >
        {canBook ? (
          <>
            <RadioOption label="Court booking" value="booking" />
            <RadioOption label="Lesson" value="lesson" />
          </>
        ) : null}
        <RadioOption label="Block time" value="block" />
      </RadioGroup>

      <div className="sch-form__row">
        <Field label="Court">
          <Select
            onValueChange={(value) => setCourtId(value ?? "")}
            options={courts.map((option) => ({
              value: option.id,
              label: option.name,
            }))}
            value={courtId}
          />
        </Field>
        {kind === "lesson" ? (
          <Field label="Coach">
            <Select
              onValueChange={(value) => setCoachId(value ?? "")}
              options={coaches.map((option) => ({
                value: option.id,
                label: option.name,
              }))}
              value={coachId || null}
            />
          </Field>
        ) : null}
      </div>

      <div className="sch-form__row">
        <Field label="Starts">
          <Select
            onValueChange={(value) => value && setStart(Number(value))}
            options={timeOptions}
            value={String(start)}
          />
        </Field>
        <Field label="How long">
          <Select
            onValueChange={(value) => value && setLength(Number(value))}
            options={[...new Set([...lengths, length])]
              .sort((left, right) => left - right)
              .map((minutes) => ({
                value: String(minutes),
                label: durationWords(minutes),
              }))}
            value={String(length)}
          />
        </Field>
      </div>

      {kind === "block" ? (
        <>
          <Field
            label="Why"
            hint="Shown on the calendar, for example “Sand grooming”"
          >
            <Input
              onChange={(event) => setReason(event.currentTarget.value)}
              value={reason}
            />
          </Field>
          <RadioGroup
            aria-label="Block type"
            inline
            onValueChange={(value: unknown) =>
              setMode(value as "blocked" | "maintenance")
            }
            value={mode}
          >
            <RadioOption label="Unavailable" value="blocked" />
            <RadioOption label="Maintenance" value="maintenance" />
          </RadioGroup>
          <Field
            hint="Leave empty for this day only"
            label="Repeat every week until"
            optional
          >
            <DatePicker
              min={addCalendarDays(date, 7)}
              onValueChange={(value) => setRepeatUntil(value)}
              value={repeatUntil}
            />
          </Field>
        </>
      ) : (
        <>
          <RadioGroup
            aria-label="Who"
            inline
            onValueChange={(value: unknown) =>
              setWhoMode(value as "member" | "walk-in")
            }
            value={whoMode}
          >
            <RadioOption label="A member" value="member" />
            <RadioOption label="A walk-in" value="walk-in" />
          </RadioGroup>
          {whoMode === "member" ? (
            <Field label={kind === "lesson" ? "Player" : "Booked for"}>
              <Combobox
                emptyText="Nobody by that name. Add them as a walk-in."
                onValueChange={(value) => setPersonId(value)}
                options={people.map((person) => ({
                  value: person.id,
                  label: person.name,
                }))}
                placeholder="Search members"
                value={personId}
              />
            </Field>
          ) : (
            <Field label="Walk-in's name">
              <Input
                autoComplete="off"
                onChange={(event) => setWalkIn(event.currentTarget.value)}
                value={walkIn}
              />
            </Field>
          )}
          {kind === "booking" ? (
            <Field
              hint="Collected at the desk or in the app"
              label="Price"
              optional
            >
              <MoneyInput onValueChange={setPrice} value={price} />
            </Field>
          ) : null}
        </>
      )}

      {conflicts.length > 0 ? (
        <Notice role="status" title="That time isn't free" tone="warning">
          <ul className="sch-conflicts">
            {conflicts.map((conflict) => (
              <li key={conflict.subject}>{conflict.sentence}.</li>
            ))}
          </ul>
          {alternatives.length > 0 ? (
            <div className="sch-actions">
              {alternatives.map((alternative) => (
                <Button
                  key={alternative.label}
                  onClick={() => {
                    if (alternative.court) setCourtId(alternative.court.id);
                    setStart(minuteOfPlaceDay(alternative.startsAt, day));
                  }}
                  size="sm"
                  variant="secondary"
                >
                  Use {alternative.label}
                </Button>
              ))}
            </div>
          ) : (
            <p className="sch-quiet">
              Nothing nearby is free; try another day.
            </p>
          )}
        </Notice>
      ) : (
        <p className="sch-quiet" role="status">
          {court?.name ?? "The court"} is free {clock(startsAt, timeZone)}–
          {clock(endsAt, timeZone)}
          {coach ? ` and ${coach.name.split(" ")[0]} is available` : ""}.
        </p>
      )}

      {problem ? (
        <Notice role="alert" tone="danger">
          {problem}
        </Notice>
      ) : null}

      <Button loading={create.showPending} type="submit" variant="primary">
        {kind === "block"
          ? "Block this time"
          : kind === "lesson"
            ? "Book the lesson"
            : "Book the court"}
      </Button>
    </form>
  );
}
