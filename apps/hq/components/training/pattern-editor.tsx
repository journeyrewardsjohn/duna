"use client";

import { Icon } from "@duna/ui/icons";
import { Button, Field, IconButton, Input, Select } from "@duna/ui/tideline";
import {
  type DraftException,
  type DraftSlot,
  exceptionKindLabels,
  WEEK_ORDER,
  WEEKDAYS,
} from "./program-model";

const weekdayOptions = WEEK_ORDER.map((day) => ({
  value: String(day),
  label: WEEKDAYS[day]!,
}));

const intervalOptions = [
  { value: "1", label: "Every week" },
  { value: "2", label: "Every 2 weeks" },
  { value: "3", label: "Every 3 weeks" },
  { value: "4", label: "Every 4 weeks" },
];

/**
 * Practice days, each with its own start and end time (TR-New): one row
 * per weekday slot. Times are the club's wall clock.
 */
export function SlotRows({
  slots,
  onChange,
  disabled = false,
}: {
  readonly slots: readonly DraftSlot[];
  readonly onChange: (slots: DraftSlot[]) => void;
  readonly disabled?: boolean;
}) {
  const set = (index: number, change: Partial<DraftSlot>) =>
    onChange(
      slots.map((slot, i) => (i === index ? { ...slot, ...change } : slot)),
    );
  return (
    <div className="tr-editor">
      <ul aria-label="Practice days" className="tr-slots">
        {slots.map((slot, index) => {
          const day = WEEKDAYS[slot.weekday];
          return (
            <li className="tr-slot" key={index}>
              <Field className="tr-slot__day" label="Day">
                <Select
                  aria-label={`Day for practice ${index + 1}`}
                  disabled={disabled}
                  onValueChange={(value) =>
                    value !== null && set(index, { weekday: Number(value) })
                  }
                  options={weekdayOptions}
                  value={String(slot.weekday)}
                />
              </Field>
              <Field label={`${day} starts`}>
                <Input
                  disabled={disabled}
                  onChange={(event) =>
                    set(index, { startsAt: event.currentTarget.value })
                  }
                  step={300}
                  type="time"
                  value={slot.startsAt.slice(0, 5)}
                />
              </Field>
              <Field label={`${day} ends`}>
                <Input
                  disabled={disabled}
                  onChange={(event) =>
                    set(index, { endsAt: event.currentTarget.value })
                  }
                  step={300}
                  type="time"
                  value={slot.endsAt.slice(0, 5)}
                />
              </Field>
              <Field label="How often">
                <Select
                  aria-label={`How often on ${day}`}
                  disabled={disabled}
                  onValueChange={(value) =>
                    value !== null &&
                    set(index, { intervalWeeks: Number(value) })
                  }
                  options={intervalOptions}
                  value={String(slot.intervalWeeks)}
                />
              </Field>
              <IconButton
                label={`Remove ${day} ${slot.startsAt.slice(0, 5)}`}
                className="tr-slot__remove"
                disabled={disabled}
                onClick={() => onChange(slots.filter((_, i) => i !== index))}
                variant="ghost"
              >
                <Icon name="close" />
              </IconButton>
            </li>
          );
        })}
      </ul>
      <Button
        disabled={disabled}
        icon={<Icon name="plus" />}
        onClick={() =>
          onChange([
            ...slots,
            {
              weekday: 6,
              startsAt: "09:00",
              endsAt: "11:00",
              intervalWeeks: 1,
              courtIds: [],
              ...(slots[0]?.venueId ? { venueId: slots[0].venueId } : {}),
            },
          ])
        }
        size="sm"
        variant="secondary"
      >
        Add a practice day
      </Button>
    </div>
  );
}

const kindOptions = (
  Object.keys(exceptionKindLabels) as DraftException["kind"][]
).map((kind) => ({ value: kind, label: exceptionKindLabels[kind] }));

/** Blackout, break, tournament and travel dates (no practice on them). */
export function ExceptionRows({
  exceptions,
  onChange,
  fallbackDate,
  disabled = false,
}: {
  readonly exceptions: readonly DraftException[];
  readonly onChange: (exceptions: DraftException[]) => void;
  /** Where a new row starts. */
  readonly fallbackDate: string;
  readonly disabled?: boolean;
}) {
  const set = (index: number, change: Partial<DraftException>) =>
    onChange(
      exceptions.map((row, i) => (i === index ? { ...row, ...change } : row)),
    );
  return (
    <div className="tr-editor">
      {exceptions.length === 0 ? (
        <p className="tr-quiet">No dates off yet.</p>
      ) : (
        <ul aria-label="Dates off" className="tr-slots">
          {exceptions.map((row, index) => (
            <li className="tr-slot tr-slot--exception" key={index}>
              <Field label="Kind">
                <Select
                  aria-label={`Kind of date off ${index + 1}`}
                  disabled={disabled}
                  onValueChange={(value) =>
                    value !== null &&
                    set(index, { kind: value as DraftException["kind"] })
                  }
                  options={kindOptions}
                  value={row.kind}
                />
              </Field>
              <Field label="Name">
                <Input
                  disabled={disabled}
                  maxLength={120}
                  onChange={(event) =>
                    set(index, { label: event.currentTarget.value })
                  }
                  value={row.label}
                />
              </Field>
              <Field label="From">
                <Input
                  disabled={disabled}
                  onChange={(event) =>
                    set(index, { startsOn: event.currentTarget.value })
                  }
                  type="date"
                  value={row.startsOn}
                />
              </Field>
              <Field label="To">
                <Input
                  disabled={disabled}
                  onChange={(event) =>
                    set(index, { endsOn: event.currentTarget.value })
                  }
                  type="date"
                  value={row.endsOn}
                />
              </Field>
              <IconButton
                label={`Remove ${row.label || "these dates"}`}
                className="tr-slot__remove"
                disabled={disabled}
                onClick={() =>
                  onChange(exceptions.filter((_, i) => i !== index))
                }
                variant="ghost"
              >
                <Icon name="close" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      <Button
        disabled={disabled}
        icon={<Icon name="plus" />}
        onClick={() =>
          onChange([
            ...exceptions,
            {
              kind: "blackout",
              label: "No practice",
              startsOn: fallbackDate,
              endsOn: fallbackDate,
            },
          ])
        }
        size="sm"
        variant="secondary"
      >
        Add dates off
      </Button>
    </div>
  );
}

export interface CoachChoice {
  readonly personId: string;
  readonly displayName: string;
}

/** Coaches on the program: one lead, assistants optionally on some days. */
export function CoachRows({
  coaches,
  options,
  onChange,
  disabled = false,
}: {
  readonly coaches: readonly {
    personId: string;
    role: "lead" | "assistant";
    weekdays: number[];
  }[];
  readonly options: readonly CoachChoice[];
  readonly onChange: (
    coaches: {
      personId: string;
      role: "lead" | "assistant";
      weekdays: number[];
    }[],
  ) => void;
  readonly disabled?: boolean;
}) {
  const nameOf = (personId: string) =>
    options.find((option) => option.personId === personId)?.displayName ??
    "A coach";
  const unused = options.filter(
    (option) => !coaches.some((coach) => coach.personId === option.personId),
  );
  return (
    <div className="tr-editor">
      {coaches.length === 0 ? (
        <p className="tr-quiet">No coaches yet.</p>
      ) : (
        <ul aria-label="Coaches" className="tr-slots">
          {coaches.map((coach, index) => (
            <li className="tr-slot tr-slot--coach" key={coach.personId}>
              <span className="tr-row__name">{nameOf(coach.personId)}</span>
              <Field label="Role">
                <Select
                  aria-label={`${nameOf(coach.personId)}'s role`}
                  disabled={disabled}
                  onValueChange={(value) =>
                    value !== null &&
                    onChange(
                      coaches.map((row, i) =>
                        i === index
                          ? { ...row, role: value as "lead" | "assistant" }
                          : value === "lead" && row.role === "lead"
                            ? { ...row, role: "assistant" }
                            : row,
                      ),
                    )
                  }
                  options={[
                    { value: "lead", label: "Lead coach" },
                    { value: "assistant", label: "Assistant" },
                  ]}
                  value={coach.role}
                />
              </Field>
              <IconButton
                label={`Take ${nameOf(coach.personId)} off the program`}
                className="tr-slot__remove"
                disabled={disabled}
                onClick={() => onChange(coaches.filter((_, i) => i !== index))}
                variant="ghost"
              >
                <Icon name="close" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      {unused.length > 0 ? (
        <div aria-label="Add a coach" className="tr-chips" role="group">
          {unused.map((option) => (
            <Button
              disabled={disabled}
              icon={<Icon name="plus" />}
              key={option.personId}
              onClick={() =>
                onChange([
                  ...coaches,
                  {
                    personId: option.personId,
                    role: coaches.some((row) => row.role === "lead")
                      ? "assistant"
                      : "lead",
                    weekdays: [],
                  },
                ])
              }
              size="sm"
              variant="ghost"
            >
              {`Add ${option.displayName}`}
            </Button>
          ))}
        </div>
      ) : options.length === 0 ? (
        <p className="tr-quiet">
          Nobody on the team can coach yet. Invite coaches in Team first.
        </p>
      ) : null}
    </div>
  );
}
