"use client";

import {
  Button,
  Field,
  IconButton,
  Input,
  Notice,
  RadioGroup,
  RadioOption,
  Select,
  Switch,
} from "@duna/ui/tideline";
import { Icon } from "@duna/ui/icons";
import { useState } from "react";
import { saveOfferingAction } from "@/app/(next)/(hq)/offerings/actions";
import { SectionFooter, useSectionSave } from "./section-save";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const DURATIONS = [30, 45, 60, 75, 90, 120] as const;
const LEAD_HOURS = [0, 2, 6, 12, 24, 48] as const;
const BUFFERS = [0, 10, 15, 20, 30, 45, 60] as const;

type Mode = "flexible" | "one-off" | "recurring";

interface OneOff {
  date: string;
  startsAt: string;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function oneOffs(schedule: Record<string, unknown>): OneOff[] {
  const raw = Array.isArray(schedule.oneOffSessions)
    ? schedule.oneOffSessions
    : Array.isArray(schedule.oneOff)
      ? schedule.oneOff
      : [];
  return raw
    .map((entry) => record(entry))
    .filter((entry) => typeof entry.date === "string")
    .map((entry) => ({
      date: String(entry.date),
      startsAt: typeof entry.startsAt === "string" ? entry.startsAt : "18:00",
    }));
}

/**
 * Schedule and sessions › When it runs: from coaches' availability, on set
 * dates, or every week; how long; how far ahead people book; where (a venue
 * or online, with recording and notes for online sessions). A group rule
 * needs set dates, and the form says so in place.
 */
export function ScheduleForm({
  itemId,
  title,
  live,
  configuration,
  isProgram,
  needsDates,
  venues,
  timeZone,
  canWrite,
}: {
  readonly itemId: string;
  readonly title: string;
  readonly live: boolean;
  readonly configuration: Record<string, unknown>;
  readonly isProgram: boolean;
  /** The offering has a group rule, which needs set dates. */
  readonly needsDates: boolean;
  readonly venues: readonly { readonly id: string; readonly name: string }[];
  readonly timeZone: string;
  readonly canWrite: boolean;
}) {
  const service = record(configuration.service);
  const schedule = record(
    configuration.sessionSchedule ?? service.sessionSchedule,
  );
  const virtual = record(configuration.virtualDelivery);
  const initialMode: Mode =
    schedule.mode === "one-off" || schedule.mode === "recurring"
      ? schedule.mode
      : isProgram
        ? "recurring"
        : "flexible";
  const [mode, setMode] = useState<Mode>(initialMode);
  const [style, setStyle] = useState(
    String(service.schedulingStyle ?? "coach-availability"),
  );
  const [startsOn, setStartsOn] = useState(String(schedule.startsOn ?? ""));
  const [endsOn, setEndsOn] = useState(String(schedule.endsOn ?? ""));
  const [weekdays, setWeekdays] = useState<number[]>(
    Array.isArray(schedule.weekdays)
      ? schedule.weekdays.filter(
          (day): day is number => typeof day === "number",
        )
      : [],
  );
  const [startTime, setStartTime] = useState(
    String(schedule.startTime ?? "18:00"),
  );
  const [dates, setDates] = useState<OneOff[]>(oneOffs(schedule));
  const [duration, setDuration] = useState(
    String(configuration.durationMinutes ?? service.durationMinutes ?? 60),
  );
  const [lead, setLead] = useState(String(service.bookingLeadHours ?? 12));
  const [buffer, setBuffer] = useState(
    String(service.bookingBufferMinutes ?? 15),
  );
  const [delivery, setDelivery] = useState(
    configuration.deliveryMode === "online" ? "online" : "venue",
  );
  const [venueId, setVenueId] = useState(
    typeof configuration.venueId === "string"
      ? configuration.venueId
      : (venues[0]?.id ?? ""),
  );
  const [record_, setRecord] = useState(virtual.autoRecord !== false);
  const [transcribe, setTranscribe] = useState(
    virtual.autoTranscribe !== false,
  );
  const [summary, setSummary] = useState(virtual.generateAiSummary !== false);

  const problems: string[] = [];
  if (mode === "flexible" && needsDates) {
    problems.push(
      "A group rule needs set dates. Choose set dates or every week.",
    );
  }
  if (mode === "recurring") {
    if (!startsOn || !endsOn) problems.push("Choose the first and last week.");
    else if (startsOn > endsOn)
      problems.push("The last week must be after the first.");
    if (weekdays.length === 0)
      problems.push("Choose at least one day of the week.");
  }
  if (mode === "one-off" && dates.length === 0)
    problems.push("Add at least one date.");
  if (delivery === "venue" && venues.length > 0 && !venueId)
    problems.push("Choose where it happens.");

  const sessionSchedule =
    mode === "recurring"
      ? {
          mode,
          timezone: timeZone,
          startsOn,
          endsOn,
          weekdays: [...weekdays].sort(),
          startTime,
          weekly: [...weekdays]
            .sort()
            .map((weekday) => ({ weekday, startsAt: startTime })),
          blackoutDates: Array.isArray(schedule.blackoutDates)
            ? schedule.blackoutDates
            : [],
        }
      : mode === "one-off"
        ? {
            mode,
            timezone: timeZone,
            oneOffSessions: [...dates].sort((a, b) =>
              `${a.date}${a.startsAt}`.localeCompare(`${b.date}${b.startsAt}`),
            ),
            oneOff: [...dates],
            blackoutDates: Array.isArray(schedule.blackoutDates)
              ? schedule.blackoutDates
              : [],
          }
        : { mode: "flexible", timezone: timeZone };
  const minutes = Number(duration);
  const next = {
    sessionSchedule,
    durationMinutes: minutes,
    deliveryMode: delivery,
    ...(delivery === "venue" && venueId ? { venueId } : {}),
    service: {
      ...service,
      durationMinutes: minutes,
      bookingLeadHours: Number(lead),
      bookingBufferMinutes: Number(buffer),
      schedulingStyle: isProgram ? "coach-availability" : style,
      sessionSchedule,
    },
    ...(delivery === "online"
      ? {
          virtualDelivery: {
            ...virtual,
            provider: "google-meet",
            createMeetingOnPurchase: true,
            inviteCoach: true,
            invitePlayer: true,
            autoRecord: record_,
            autoTranscribe: transcribe,
            generateAiSummary: summary && transcribe,
            recordingConsentRequired: record_,
          },
        }
      : {}),
  };
  const before = JSON.stringify({
    mode: initialMode,
    style: String(service.schedulingStyle ?? "coach-availability"),
    startsOn: String(schedule.startsOn ?? ""),
    endsOn: String(schedule.endsOn ?? ""),
    weekdays: Array.isArray(schedule.weekdays) ? schedule.weekdays : [],
    startTime: String(schedule.startTime ?? "18:00"),
    dates: oneOffs(schedule),
    duration: String(
      configuration.durationMinutes ?? service.durationMinutes ?? 60,
    ),
    lead: String(service.bookingLeadHours ?? 12),
    buffer: String(service.bookingBufferMinutes ?? 15),
    delivery: configuration.deliveryMode === "online" ? "online" : "venue",
    venueId:
      typeof configuration.venueId === "string"
        ? configuration.venueId
        : (venues[0]?.id ?? ""),
    record: virtual.autoRecord !== false,
    transcribe: virtual.autoTranscribe !== false,
    summary: virtual.generateAiSummary !== false,
  });
  const now = JSON.stringify({
    mode,
    style,
    startsOn,
    endsOn,
    weekdays,
    startTime,
    dates,
    duration,
    lead,
    buffer,
    delivery,
    venueId,
    record: record_,
    transcribe,
    summary,
  });
  const dirty = before !== now;
  const { button, online, dialog } = useSectionSave({
    what: "The schedule",
    dirty: dirty && problems.length === 0,
    live,
    title,
    perform: (idempotencyKey) =>
      saveOfferingAction({ itemId, configuration: next, idempotencyKey }),
  });
  const disabled = !canWrite;

  return (
    <form className="of-form" onSubmit={(event) => event.preventDefault()}>
      <RadioGroup
        aria-label="How players book it"
        disabled={disabled}
        onValueChange={(value) => setMode(value as Mode)}
        value={mode}
      >
        {!isProgram ? (
          <RadioOption
            description="Players pick a time your coaches are free."
            label="From your coaches' availability"
            value="flexible"
          />
        ) : null}
        <RadioOption
          description="The same time each week, between two dates."
          label="Every week"
          value="recurring"
        />
        <RadioOption
          description="A list of dates you choose."
          label="On set dates"
          value="one-off"
        />
      </RadioGroup>
      {mode === "flexible" && !isProgram ? (
        <Field label="Booking">
          <Select
            disabled={disabled}
            onValueChange={(value) => setStyle(String(value))}
            options={[
              {
                value: "coach-availability",
                label: "Players book an open time straight away",
              },
              {
                value: "request-to-book",
                label: "Players ask, and a coach confirms",
              },
            ]}
            value={style}
          />
        </Field>
      ) : null}
      {mode === "recurring" ? (
        <div className="of-grid">
          <Field label="First week">
            <Input
              disabled={disabled}
              onValueChange={(value) => setStartsOn(String(value ?? ""))}
              type="date"
              value={startsOn}
            />
          </Field>
          <Field label="Last week">
            <Input
              disabled={disabled}
              onValueChange={(value) => setEndsOn(String(value ?? ""))}
              type="date"
              value={endsOn}
            />
          </Field>
          <Field label="Starts at">
            <Input
              disabled={disabled}
              onValueChange={(value) => setStartTime(String(value ?? ""))}
              type="time"
              value={startTime}
            />
          </Field>
          <fieldset className="of-fieldset of-weekdays">
            <legend className="pt-label">On</legend>
            {WEEKDAYS.map((label, day) => (
              <button
                aria-pressed={weekdays.includes(day)}
                className="of-day"
                disabled={disabled}
                key={label}
                onClick={() =>
                  setWeekdays((current) =>
                    current.includes(day)
                      ? current.filter((entry) => entry !== day)
                      : [...current, day],
                  )
                }
                type="button"
              >
                {label}
              </button>
            ))}
          </fieldset>
        </div>
      ) : null}
      {mode === "one-off" ? (
        <div className="of-form">
          <ul className="of-dates">
            {dates.map((entry, index) => (
              <li key={index}>
                <Input
                  aria-label={`Date ${index + 1}`}
                  disabled={disabled}
                  onValueChange={(value) =>
                    setDates((list) =>
                      list.map((d, at) =>
                        at === index ? { ...d, date: String(value ?? "") } : d,
                      ),
                    )
                  }
                  type="date"
                  value={entry.date}
                />
                <Input
                  aria-label={`Time ${index + 1}`}
                  disabled={disabled}
                  onValueChange={(value) =>
                    setDates((list) =>
                      list.map((d, at) =>
                        at === index
                          ? { ...d, startsAt: String(value ?? "") }
                          : d,
                      ),
                    )
                  }
                  type="time"
                  value={entry.startsAt}
                />
                <IconButton
                  disabled={disabled}
                  label={`Remove date ${index + 1}`}
                  onClick={() =>
                    setDates((list) => list.filter((_, at) => at !== index))
                  }
                  size="sm"
                >
                  <Icon name="close" size="inline" />
                </IconButton>
              </li>
            ))}
          </ul>
          <Button
            disabled={disabled}
            onClick={() =>
              setDates((list) => [...list, { date: "", startsAt: "18:00" }])
            }
            size="sm"
            variant="secondary"
          >
            Add a date
          </Button>
        </div>
      ) : null}
      <div className="of-grid">
        <Field label="Each session lasts">
          <Select
            disabled={disabled}
            onValueChange={(value) => setDuration(String(value))}
            options={DURATIONS.map((value) => ({
              value: String(value),
              label: `${value} minutes`,
            }))}
            value={duration}
          />
        </Field>
        <Field label="Book at least">
          <Select
            disabled={disabled}
            onValueChange={(value) => setLead(String(value))}
            options={LEAD_HOURS.map((value) => ({
              value: String(value),
              label:
                value === 0
                  ? "Any time before it starts"
                  : `${value} hours ahead`,
            }))}
            value={lead}
          />
        </Field>
        <Field label="Gap between bookings">
          <Select
            disabled={disabled}
            onValueChange={(value) => setBuffer(String(value))}
            options={BUFFERS.map((value) => ({
              value: String(value),
              label: value === 0 ? "No gap" : `${value} minutes`,
            }))}
            value={buffer}
          />
        </Field>
        <Field label="Where">
          <Select
            disabled={disabled}
            onValueChange={(value) =>
              setDelivery(value === "online" ? "online" : "venue")
            }
            options={[
              { value: "venue", label: "At a venue" },
              { value: "online", label: "Online video call" },
            ]}
            value={delivery}
          />
        </Field>
        {delivery === "venue" ? (
          venues.length > 0 ? (
            <Field label="Venue">
              <Select
                disabled={disabled}
                onValueChange={(value) => setVenueId(String(value ?? ""))}
                options={venues.map((venue) => ({
                  value: venue.id,
                  label: venue.name,
                }))}
                value={venueId}
              />
            </Field>
          ) : (
            <p className="pt-quiet">
              No venue yet.{" "}
              <a className="of-inline-link" href="/setup/places/create">
                Add a place
              </a>
            </p>
          )
        ) : null}
      </div>
      {delivery === "online" ? (
        <div className="of-form">
          <Switch
            checked={record_}
            disabled={disabled}
            label="Record each call (players are asked first)"
            onCheckedChange={setRecord}
          />
          <Switch
            checked={transcribe}
            disabled={disabled}
            label="Keep a transcript"
            onCheckedChange={setTranscribe}
          />
          <Switch
            checked={summary && transcribe}
            disabled={disabled || !transcribe}
            label="Write session notes from the transcript"
            onCheckedChange={setSummary}
          />
        </div>
      ) : null}
      {problems.length > 0 && dirty ? (
        <Notice role="alert" title="Before you save" tone="warning">
          <ul className="of-issues">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </Notice>
      ) : null}
      {canWrite ? (
        <SectionFooter online={online}>{button("Save schedule")}</SectionFooter>
      ) : null}
      {dialog}
    </form>
  );
}
