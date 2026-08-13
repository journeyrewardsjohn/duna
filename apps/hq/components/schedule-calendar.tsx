"use client";

import type { OperatorWorkspace } from "@duna/api";
import {
  parseNaturalLanguageSchedule,
  type NaturalLanguageScheduleDraft,
} from "@duna/scheduling";
import { Badge, SmartDateRangePicker } from "@duna/ui";
import {
  AlertTriangle,
  Ban,
  CalendarPlus,
  CalendarRange,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CloudSun,
  ExternalLink,
  GripVertical,
  MapPin,
  PackageMinus,
  PackagePlus,
  Rows3,
  ShieldCheck,
  Sparkles,
  UserMinus,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  startTransition,
  useActionState,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import {
  addCalendarEquipmentAction,
  addCalendarParticipantAction,
  cancelCalendarSessionAction,
  confirmCalendarChangeAction,
  createCalendarBlockAction,
  createRecurringCalendarBlocksAction,
  proposeCalendarChangeAction,
  removeCalendarEquipmentAction,
  removeCalendarParticipantAction,
  type OperatorActionState,
} from "@/app/actions";
import { courtAvailabilityLabel } from "./schedule-calendar-helpers";

type CalendarEntry = OperatorWorkspace["calendar"]["entries"][number];
type Court = OperatorWorkspace["venues"][number]["courts"][number];
type CalendarView = "day" | "week" | "month" | "quarter";
type ResourceView = "court" | "coach";

interface CalendarLane {
  readonly id: string;
  readonly label: string;
  readonly sublabel: string;
  readonly imageUrl?: string;
  readonly status?: string;
  readonly schedule?: Court["schedule"];
  readonly overrides?: Court["overrides"];
}

const initialActionState: OperatorActionState = {
  status: "idle",
  message: "",
};

const timelineStartHour = 6;
const timelineEndHour = 22;
const timelineHourHeight = 72;

function startOfDay(value: Date): Date {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(value: Date, months: number): Date {
  const next = new Date(value);
  next.setMonth(next.getMonth() + months);
  return next;
}

function dateKey(value: Date): string {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0"),
  ].join("-");
}

function dateKeyInTimezone(iso: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function calendarDays(anchor: Date, view: CalendarView): Date[] {
  if (view === "day") return [startOfDay(anchor)];
  if (view === "week") {
    const start = startOfDay(anchor);
    start.setDate(start.getDate() - start.getDay());
    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
  }
  const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const gridStart = addDays(monthStart, -monthStart.getDay());
  const count = view === "quarter" ? 98 : 42;
  return Array.from({ length: count }, (_, index) => addDays(gridStart, index));
}

function formatTime(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formatDateTime(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formatRange(anchor: Date, view: CalendarView): string {
  if (view === "day") {
    return anchor.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }
  if (view === "week") {
    const days = calendarDays(anchor, "week");
    return `${days[0]!.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    })} – ${days[6]!.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })}`;
  }
  return anchor.toLocaleDateString("en-US", {
    month: view === "quarter" ? undefined : "long",
    year: "numeric",
  });
}

function weatherSymbol(icon: string | undefined): string {
  if (icon === "clear" || icon === "mostly-clear") return "☀";
  if (icon === "partly-cloudy") return "🌤";
  if (icon === "rain" || icon === "drizzle") return "🌦";
  if (icon === "storm") return "⛈";
  if (icon === "snow") return "❄";
  if (icon === "fog") return "≋";
  return "☁";
}

function fahrenheit(celsius: number): number {
  return Math.round((celsius * 9) / 5 + 32);
}

function moveEntryToDay(entry: CalendarEntry, day: Date) {
  const startsAt = new Date(entry.startsAt);
  const endsAt = new Date(entry.endsAt);
  const duration = endsAt.getTime() - startsAt.getTime();
  const nextStart = new Date(startsAt);
  nextStart.setFullYear(day.getFullYear(), day.getMonth(), day.getDate());
  return {
    startsAt: nextStart.toISOString(),
    endsAt: new Date(nextStart.getTime() + duration).toISOString(),
  };
}

function minutesInTimezone(iso: string, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(
    parts.find((part) => part.type === "minute")?.value ?? 0,
  );
  return hour * 60 + minute;
}

function timelinePosition(
  entry: CalendarEntry,
  timezone: string,
): CSSProperties {
  const startMinute = minutesInTimezone(entry.startsAt, timezone);
  const durationMinutes = Math.max(
    15,
    (Date.parse(entry.endsAt) - Date.parse(entry.startsAt)) / 60_000,
  );
  const visibleStart = Math.max(startMinute, timelineStartHour * 60);
  const visibleEnd = Math.min(
    startMinute + durationMinutes,
    timelineEndHour * 60,
  );
  return {
    top:
      ((visibleStart - timelineStartHour * 60) / 60) * timelineHourHeight + 4,
    height: Math.max(
      34,
      ((visibleEnd - visibleStart) / 60) * timelineHourHeight - 7,
    ),
  };
}

function toDateTimeLocal(value: Date): string {
  const offset = value.getTimezoneOffset();
  return new Date(value.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function entryKindLabel(entry: CalendarEntry): string {
  if (entry.sourceType === "operator-block") return "Blocked time";
  if (entry.sourceType === "busy-block") return "External busy block";
  if (entry.sourceType === "booking") return "Court booking";
  if (entry.sourceType === "pickup") return "Player-hosted match";
  return (entry.kind ?? "session").replaceAll("-", " ");
}

function entryDetailHref(entry: CalendarEntry): string {
  if (entry.sourceType === "session") return `/events/${entry.id}`;
  if (entry.sourceType === "booking")
    return `/events/court-bookings/${entry.id}`;
  if (entry.sourceType === "pickup") return `/events/matches/${entry.id}`;
  return "/calendar";
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function ScheduleCalendar({
  workspace,
}: {
  readonly workspace: OperatorWorkspace;
}) {
  const [view, setView] = useState<CalendarView>("day");
  const [resourceView, setResourceView] = useState<ResourceView>("court");
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [blockRange, setBlockRange] = useState(() => {
    const start = startOfDay(new Date());
    start.setHours(12, 0, 0, 0);
    return {
      start: toDateTimeLocal(start),
      end: toDateTimeLocal(new Date(start.getTime() + 60 * 60_000)),
    };
  });
  const [draggedId, setDraggedId] = useState<string>();
  const [selectedId, setSelectedId] = useState<string>();
  const [blockOpen, setBlockOpen] = useState(false);
  const [blockResourceType, setBlockResourceType] =
    useState<ResourceView>("court");
  const [blockCreationMode, setBlockCreationMode] = useState<"one-time" | "ai">(
    "one-time",
  );
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiDraft, setAiDraft] = useState<NaturalLanguageScheduleDraft>();
  const [aiEffectiveRange, setAiEffectiveRange] = useState(() => {
    const start = startOfDay(new Date());
    return {
      start: toDateTimeLocal(start).slice(0, 10),
      end: toDateTimeLocal(addMonths(start, 3)).slice(0, 10),
    };
  });
  const [proposal, proposeAction, proposalPending] = useActionState(
    proposeCalendarChangeAction,
    initialActionState,
  );
  const [confirmation, confirmAction, confirmationPending] = useActionState(
    confirmCalendarChangeAction,
    initialActionState,
  );
  const [participantAdd, addParticipantAction, participantAddPending] =
    useActionState(addCalendarParticipantAction, initialActionState);
  const [participantRemove, removeParticipantAction, participantRemovePending] =
    useActionState(removeCalendarParticipantAction, initialActionState);
  const [sessionCancellation, cancelSessionAction, cancellationPending] =
    useActionState(cancelCalendarSessionAction, initialActionState);
  const [calendarBlock, blockTimeAction, blockPending] = useActionState(
    createCalendarBlockAction,
    initialActionState,
  );
  const [recurringBlock, recurringBlockAction, recurringBlockPending] =
    useActionState(createRecurringCalendarBlocksAction, initialActionState);
  const [equipmentAdd, addEquipmentAction, equipmentAddPending] =
    useActionState(addCalendarEquipmentAction, initialActionState);
  const [equipmentRemove, removeEquipmentAction, equipmentRemovePending] =
    useActionState(removeCalendarEquipmentAction, initialActionState);

  const timezone = workspace.organization.timezone;
  const days = useMemo(() => calendarDays(anchor, view), [anchor, view]);
  const selectedEntry = workspace.calendar.entries.find(
    (entry) => entry.id === selectedId,
  );
  const entriesByDay = useMemo(() => {
    const result = new Map<string, CalendarEntry[]>();
    for (const entry of workspace.calendar.entries) {
      const key = dateKeyInTimezone(entry.startsAt, timezone);
      result.set(key, [...(result.get(key) ?? []), entry]);
    }
    return result;
  }, [timezone, workspace.calendar.entries]);
  const lanes = useMemo(() => {
    const values: CalendarLane[] =
      resourceView === "court"
        ? workspace.venues.flatMap((venue) =>
            venue.courts.map((court) => ({
              id: court.id,
              label: court.name,
              sublabel: `${venue.name} · ${court.surface.replace("-", " ")}`,
              imageUrl:
                court.imageUrl ??
                venue.heroImageTreatmentUrl ??
                venue.heroImageUrl,
              status: court.status,
              schedule: court.schedule,
              overrides: court.overrides,
            })),
          )
        : workspace.staff.map((coach) => ({
            id: coach.personId,
            label: coach.displayName,
            sublabel: `${coach.role.replace("-", " ")} · ${
              coach.upcomingSessions
            } upcoming`,
            imageUrl: coach.avatarUrl,
            status: coach.active ? "active" : "inactive",
          }));
    const needsUnassigned = workspace.calendar.entries.some((entry) =>
      resourceView === "court" ? !entry.courtId : !entry.coachPersonId,
    );
    if (needsUnassigned) {
      values.push({
        id: resourceView === "court" ? "unassigned-court" : "unassigned-coach",
        label: resourceView === "court" ? "No court" : "No coach",
        sublabel: "Needs assignment",
        status: "unassigned",
      });
    }
    if (values.length === 0) {
      values.push({
        id: "unassigned",
        label: resourceView === "court" ? "No courts yet" : "No coaches yet",
        sublabel:
          resourceView === "court"
            ? "Add courts in Facilities"
            : "Invite coaches in Team",
        status: "empty",
      });
    }
    return values;
  }, [
    resourceView,
    workspace.calendar.entries,
    workspace.staff,
    workspace.venues,
  ]);
  const participantCandidates = useMemo(() => {
    const connected = new Set(
      selectedEntry?.attendees.map((attendee) => attendee.personId) ?? [],
    );
    return workspace.people.filter(
      (person) =>
        person.status === "active" &&
        person.roles.includes("player") &&
        !connected.has(person.personId),
    );
  }, [selectedEntry, workspace.people]);
  const equipmentCandidates = useMemo(() => {
    const reserved = new Set(
      selectedEntry?.equipment.map((item) => item.inventoryStockItemId) ?? [],
    );
    return workspace.inventory.filter(
      (item) =>
        item.purpose !== "sale" &&
        item.quantityOnHand > item.quantityReserved &&
        !reserved.has(item.id),
    );
  }, [selectedEntry, workspace.inventory]);
  const actionFeedback = [
    participantAdd,
    participantRemove,
    equipmentAdd,
    equipmentRemove,
    sessionCancellation,
  ].find((state) => state.status !== "idle");

  useEffect(() => {
    if (sessionCancellation.status === "success") setSelectedId(undefined);
  }, [sessionCancellation.status]);

  useEffect(() => {
    if (calendarBlock.status === "success") setBlockOpen(false);
  }, [calendarBlock.status]);

  useEffect(() => {
    if (recurringBlock.status === "success") setBlockOpen(false);
  }, [recurringBlock.status]);

  const navigate = (direction: -1 | 1) => {
    const amount =
      view === "day" ? 1 : view === "week" ? 7 : view === "month" ? 1 : 3;
    setAnchor((current) =>
      view === "day" || view === "week"
        ? addDays(current, amount * direction)
        : addMonths(current, amount * direction),
    );
  };

  const proposeMove = (day: Date, lane?: CalendarLane) => {
    const entry = workspace.calendar.entries.find(
      (candidate) => candidate.id === draggedId,
    );
    setDraggedId(undefined);
    if (!entry || !entry.draggable || entry.sourceType !== "session") return;
    const move = moveEntryToDay(entry, day);
    const formData = new FormData();
    formData.set("sessionId", entry.id);
    formData.set("startsAt", move.startsAt);
    formData.set("endsAt", move.endsAt);
    const courtId =
      resourceView === "court" && lane && !lane.id.startsWith("unassigned")
        ? lane.id
        : entry.courtId;
    const coachPersonId =
      resourceView === "coach" && lane && !lane.id.startsWith("unassigned")
        ? lane.id
        : entry.coachPersonId;
    if (courtId) formData.set("courtId", courtId);
    if (coachPersonId) formData.set("coachPersonId", coachPersonId);
    startTransition(() => proposeAction(formData));
  };

  const selectEntry = (entry: CalendarEntry) => {
    setSelectedId(entry.id);
  };

  const handleEntryKey = (
    event: KeyboardEvent<HTMLElement>,
    entry: CalendarEntry,
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectEntry(entry);
    }
  };

  const weatherForEntry = (entry: CalendarEntry) => {
    const venue = workspace.venues.find(
      (candidate) =>
        candidate.id === entry.venueId || candidate.name === entry.venueName,
    );
    return venue?.weather?.hourly
      .slice()
      .sort(
        (left, right) =>
          Math.abs(Date.parse(left.startsAt) - Date.parse(entry.startsAt)) -
          Math.abs(Date.parse(right.startsAt) - Date.parse(entry.startsAt)),
      )[0];
  };

  const renderEntry = (entry: CalendarEntry, position?: CSSProperties) => {
    const point = weatherForEntry(entry);
    return (
      <article
        aria-label={`Open ${entry.title}`}
        className={`schedule-event schedule-event--${entry.sourceType} ${
          selectedId === entry.id ? "schedule-event--selected" : ""
        }`}
        draggable={entry.draggable}
        key={entry.id}
        onClick={() => selectEntry(entry)}
        onDragStart={() => setDraggedId(entry.id)}
        onKeyDown={(event) => handleEntryKey(event, entry)}
        role="button"
        style={
          {
            "--event-color": entry.color,
            ...position,
          } as CSSProperties
        }
        tabIndex={0}
        title={
          entry.draggable
            ? "Open for details, or drag to preview a move"
            : "Open details"
        }
      >
        {entry.draggable && <GripVertical aria-hidden size={13} />}
        <span>
          <small className="schedule-event__kind">
            {entryKindLabel(entry)}
          </small>
          <strong>{entry.title}</strong>
          <small>
            {formatTime(entry.startsAt, timezone)} –{" "}
            {formatTime(entry.endsAt, timezone)}
          </small>
          <small>
            {resourceView === "court"
              ? (entry.courtName ?? "No court")
              : (entry.coachName ?? "No coach")}
          </small>
          {point && (
            <small className="schedule-event__weather">
              {weatherSymbol(point.icon)}{" "}
              {point.temperatureC !== undefined
                ? `${fahrenheit(point.temperatureC)}°`
                : point.condition}
              {point.precipitationProbability !== undefined
                ? ` · ${Math.round(point.precipitationProbability)}% rain`
                : ""}
            </small>
          )}
        </span>
        <Badge>
          {entry.participantCount}/{entry.capacity || "∞"}
        </Badge>
      </article>
    );
  };

  const blockResources =
    blockResourceType === "court"
      ? workspace.venues.flatMap((venue) =>
          venue.courts.map((court) => ({
            id: court.id,
            label: `${venue.name} · ${court.name}`,
          })),
        )
      : workspace.staff.map((coach) => ({
          id: coach.personId,
          label: coach.displayName,
        }));

  return (
    <>
      <section className="hq-card schedule-calendar">
        <header className="schedule-calendar__toolbar">
          <div>
            <span className="hq-eyebrow">Organization schedule</span>
            <h2>{formatRange(anchor, view)}</h2>
            <p>
              {workspace.calendar.resourceConflicts
                ? `${workspace.calendar.resourceConflicts} proposed resource conflicts need review.`
                : "Run the day across courts or coaches. Every confirmed change keeps resources and people in sync."}
            </p>
          </div>
          <div className="schedule-calendar__toolbar-actions">
            <button
              className="hq-button hq-button--secondary"
              onClick={() => {
                const start = new Date(anchor);
                start.setHours(12, 0, 0, 0);
                setBlockResourceType(resourceView);
                setBlockCreationMode("one-time");
                setAiPrompt("");
                setAiDraft(undefined);
                setBlockRange({
                  start: toDateTimeLocal(start),
                  end: toDateTimeLocal(new Date(start.getTime() + 60 * 60_000)),
                });
                setAiEffectiveRange({
                  start: toDateTimeLocal(start).slice(0, 10),
                  end: toDateTimeLocal(addMonths(start, 3)).slice(0, 10),
                });
                setBlockOpen(true);
              }}
              type="button"
            >
              <Ban size={15} /> Block time
            </button>
            <Link
              className="hq-button hq-button--primary"
              href="/events/create"
            >
              <CalendarPlus size={15} /> New session
            </Link>
            <span className="segmented-control">
              <button
                aria-label="Previous period"
                onClick={() => navigate(-1)}
                type="button"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setAnchor(startOfDay(new Date()))}
                type="button"
              >
                Today
              </button>
              <button
                aria-label="Next period"
                onClick={() => navigate(1)}
                type="button"
              >
                <ChevronRight size={16} />
              </button>
            </span>
            <span className="segmented-control">
              {(["day", "week", "month", "quarter"] as const).map((option) => (
                <button
                  className={view === option ? "active" : ""}
                  key={option}
                  onClick={() => setView(option)}
                  type="button"
                >
                  {option === "quarter" ? "3 months" : option}
                </button>
              ))}
            </span>
            <span className="segmented-control">
              <button
                className={resourceView === "court" ? "active" : ""}
                onClick={() => setResourceView("court")}
                type="button"
              >
                <Rows3 size={14} /> Courts
              </button>
              <button
                className={resourceView === "coach" ? "active" : ""}
                onClick={() => setResourceView("coach")}
                type="button"
              >
                <UsersRound size={14} /> Coaches
              </button>
            </span>
          </div>
        </header>

        {view === "day" ? (
          <div className="schedule-day-board">
            <div
              className="schedule-day-board__headers"
              style={{ "--calendar-resources": lanes.length } as CSSProperties}
            >
              <span className="schedule-day-board__corner">Time</span>
              {lanes.map((lane) => (
                <header key={lane.id}>
                  <span
                    className={`schedule-resource-avatar ${
                      lane.imageUrl ? "schedule-resource-avatar--image" : ""
                    }`}
                    style={
                      lane.imageUrl
                        ? { backgroundImage: `url("${lane.imageUrl}")` }
                        : undefined
                    }
                  >
                    {!lane.imageUrl &&
                      (resourceView === "court" ? (
                        <Rows3 aria-hidden size={17} />
                      ) : (
                        <UsersRound aria-hidden size={17} />
                      ))}
                  </span>
                  <span>
                    <strong>{lane.label}</strong>
                    <small>{lane.sublabel}</small>
                  </span>
                </header>
              ))}
            </div>
            <div
              className="schedule-day-board__timeline"
              style={
                {
                  "--calendar-resources": lanes.length,
                  "--timeline-height":
                    (timelineEndHour - timelineStartHour) * timelineHourHeight,
                } as CSSProperties
              }
            >
              <div className="schedule-time-axis">
                {Array.from(
                  { length: timelineEndHour - timelineStartHour + 1 },
                  (_, index) => timelineStartHour + index,
                ).map((hour) => (
                  <span
                    key={hour}
                    style={{
                      top: (hour - timelineStartHour) * timelineHourHeight,
                    }}
                  >
                    {new Date(2026, 0, 1, hour).toLocaleTimeString("en-US", {
                      hour: "numeric",
                    })}
                  </span>
                ))}
              </div>
              {lanes.map((lane) => {
                const entries = (
                  entriesByDay.get(dateKey(anchor)) ?? []
                ).filter((entry) =>
                  resourceView === "court"
                    ? (entry.courtId ?? "unassigned-court") === lane.id
                    : (entry.coachPersonId ?? "unassigned-coach") === lane.id,
                );
                return (
                  <div
                    className={`schedule-timeline-lane ${
                      draggedId ? "schedule-timeline-lane--active" : ""
                    }`}
                    key={lane.id}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => proposeMove(anchor, lane)}
                  >
                    {resourceView === "court" && lane.schedule && (
                      <span className="schedule-timeline-lane__availability">
                        <Clock3 aria-hidden size={12} />
                        {courtAvailabilityLabel(lane.schedule, anchor)}
                      </span>
                    )}
                    {entries.map((entry) =>
                      renderEntry(entry, timelinePosition(entry, timezone)),
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : view === "week" ? (
          <div
            className="schedule-resource-grid"
            style={{ "--calendar-days": days.length } as CSSProperties}
          >
            <div className="schedule-resource-grid__corner">{resourceView}</div>
            {days.map((day) => {
              const forecastDay = workspace.venues
                .flatMap((venue) => venue.weather?.days ?? [])
                .find((candidate) => candidate.date === dateKey(day));
              return (
                <header key={dateKey(day)}>
                  <small>
                    {day.toLocaleDateString("en-US", { weekday: "short" })}
                  </small>
                  <strong>{day.getDate()}</strong>
                  {forecastDay && (
                    <span className="schedule-day-weather">
                      {weatherSymbol(forecastDay.icon)}
                      {forecastDay.temperatureHighC !== undefined
                        ? ` ${fahrenheit(forecastDay.temperatureHighC)}°`
                        : ""}
                      {forecastDay.sunsetAt
                        ? ` · ◐ ${formatTime(forecastDay.sunsetAt, timezone)}`
                        : ""}
                    </span>
                  )}
                </header>
              );
            })}
            {lanes.map((lane) => (
              <div className="schedule-resource-row" key={lane.id}>
                <div className="schedule-resource-row__label">
                  <span
                    className={`schedule-resource-avatar ${
                      lane.imageUrl ? "schedule-resource-avatar--image" : ""
                    }`}
                    style={
                      lane.imageUrl
                        ? { backgroundImage: `url("${lane.imageUrl}")` }
                        : undefined
                    }
                  >
                    {!lane.imageUrl &&
                      (resourceView === "court" ? (
                        <Rows3 aria-hidden size={17} />
                      ) : (
                        <UsersRound aria-hidden size={17} />
                      ))}
                  </span>
                  <span>
                    <strong>{lane.label}</strong>
                    <small>{lane.sublabel}</small>
                    {lane.status && (
                      <em
                        className={`schedule-resource-status schedule-resource-status--${lane.status}`}
                      >
                        {lane.status}
                      </em>
                    )}
                  </span>
                </div>
                {days.map((day) => {
                  const entries = (entriesByDay.get(dateKey(day)) ?? []).filter(
                    (entry) =>
                      resourceView === "court"
                        ? (entry.courtId ?? "unassigned-court") === lane.id
                        : (entry.coachPersonId ?? "unassigned-coach") ===
                          lane.id,
                  );
                  return (
                    <div
                      className={
                        draggedId
                          ? "schedule-dropzone active"
                          : "schedule-dropzone"
                      }
                      key={dateKey(day)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => proposeMove(day, lane)}
                    >
                      {resourceView === "court" && lane.schedule && (
                        <span
                          className={`schedule-cell-availability ${
                            courtAvailabilityLabel(lane.schedule, day) ===
                            "Closed"
                              ? "schedule-cell-availability--closed"
                              : ""
                          }`}
                        >
                          <Clock3 aria-hidden size={12} />
                          {courtAvailabilityLabel(lane.schedule, day)}
                          {lane.overrides?.some((override) => {
                            const starts = new Date(override.startsAt);
                            const ends = new Date(override.endsAt);
                            const dayStart = startOfDay(day);
                            const dayEnd = addDays(dayStart, 1);
                            return starts < dayEnd && ends > dayStart;
                          })
                            ? " · override"
                            : ""}
                        </span>
                      )}
                      {entries.map((entry) => renderEntry(entry))}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        ) : (
          <div
            className={`schedule-month-grid ${
              view === "quarter" ? "schedule-month-grid--quarter" : ""
            }`}
          >
            {days.map((day) => {
              const entries = entriesByDay.get(dateKey(day)) ?? [];
              return (
                <div
                  className="schedule-month-day"
                  key={dateKey(day)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => proposeMove(day)}
                >
                  <span>
                    <small>
                      {day.getDate() === 1
                        ? day.toLocaleDateString("en-US", { month: "short" })
                        : ""}
                    </small>
                    <strong>{day.getDate()}</strong>
                    {workspace.venues
                      .flatMap((venue) => venue.weather?.days ?? [])
                      .find((candidate) => candidate.date === dateKey(day)) && (
                      <small className="schedule-month-weather">
                        {weatherSymbol(
                          workspace.venues
                            .flatMap((venue) => venue.weather?.days ?? [])
                            .find(
                              (candidate) => candidate.date === dateKey(day),
                            )?.icon,
                        )}
                      </small>
                    )}
                  </span>
                  {entries
                    .slice(0, view === "quarter" ? 2 : 4)
                    .map((entry) => renderEntry(entry))}
                  {entries.length > (view === "quarter" ? 2 : 4) && (
                    <small>
                      +{entries.length - (view === "quarter" ? 2 : 4)} more
                    </small>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <footer className="schedule-calendar__footer">
          <span>
            <CalendarRange aria-hidden size={17} />
            {workspace.calendar.connections.length} external calendar
            connections
          </span>
          <span>
            <Clock3 aria-hidden size={17} />
            Times shown in {timezone}
          </span>
          {workspace.venues.find((venue) => venue.weather)?.weather && (
            <span>
              <CloudSun aria-hidden size={17} />
              {workspace.venues.find((venue) => venue.weather)?.weather
                ?.source === "tomorrow.io"
                ? "Tomorrow.io forecast"
                : "Calculated daylight"}
              {" · "}updated{" "}
              {formatTime(
                workspace.venues.find((venue) => venue.weather)!.weather!
                  .updatedAt,
                timezone,
              )}
            </span>
          )}
          <span>Select for actions. Drag to preview a safe move.</span>
        </footer>

        {(proposal.status !== "idle" || confirmation.status !== "idle") && (
          <aside className="schedule-change-review" aria-live="polite">
            <div>
              <span className="hq-eyebrow">Review before changing</span>
              <strong>
                {confirmation.status === "success"
                  ? confirmation.message
                  : proposal.message}
              </strong>
              <small>
                Nothing moves until this review is confirmed. Player
                notifications are calculated with the proposal.
              </small>
            </div>
            {proposal.status === "success" &&
              proposal.entityId &&
              confirmation.status !== "success" && (
                <form action={confirmAction}>
                  <input
                    name="proposalId"
                    type="hidden"
                    value={proposal.entityId}
                  />
                  <label>
                    <input
                      name="confirmed"
                      required
                      type="checkbox"
                      value="true"
                    />
                    Confirm time, court/coach reservations, and notifications
                  </label>
                  <button
                    className="hq-button hq-button--primary"
                    disabled={confirmationPending}
                    type="submit"
                  >
                    {confirmationPending ? "Moving…" : "Confirm move"}
                  </button>
                </form>
              )}
            {proposalPending && <small>Checking conflicts…</small>}
          </aside>
        )}
      </section>

      {selectedEntry && (
        <div
          aria-label="Schedule details"
          aria-modal="true"
          className="schedule-drawer-backdrop"
          onClick={() => setSelectedId(undefined)}
          role="dialog"
        >
          <aside
            className="schedule-detail-drawer"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="schedule-detail-drawer__header">
              <button
                aria-label="Close schedule details"
                className="schedule-icon-button"
                onClick={() => setSelectedId(undefined)}
                type="button"
              >
                <X size={20} />
              </button>
              <span>
                <small>{entryKindLabel(selectedEntry)}</small>
                <strong>{selectedEntry.title}</strong>
              </span>
              <Badge>{selectedEntry.status}</Badge>
            </header>

            <section
              className="schedule-detail-hero"
              style={
                {
                  "--event-color": selectedEntry.color,
                } as CSSProperties
              }
            >
              <div>
                <Clock3 aria-hidden size={18} />
                <span>
                  <small>When</small>
                  <strong>
                    {formatDateTime(selectedEntry.startsAt, timezone)}
                  </strong>
                  <small>
                    until {formatTime(selectedEntry.endsAt, timezone)}
                  </small>
                </span>
              </div>
              <div>
                <MapPin aria-hidden size={18} />
                <span>
                  <small>Where</small>
                  <strong>
                    {selectedEntry.venueName ?? "Location not assigned"}
                  </strong>
                  <small>
                    {selectedEntry.courtName ?? "Court not assigned"}
                  </small>
                </span>
              </div>
              <div>
                <UsersRound aria-hidden size={18} />
                <span>
                  <small>Attendance</small>
                  <strong>
                    {selectedEntry.participantCount}/
                    {selectedEntry.capacity || "open"} confirmed
                  </strong>
                  <small>
                    {selectedEntry.coachName ?? "Coach not assigned"}
                  </small>
                </span>
              </div>
              {weatherForEntry(selectedEntry) && (
                <div>
                  <CloudSun aria-hidden size={18} />
                  <span>
                    <small>Expected weather</small>
                    <strong>
                      {weatherSymbol(weatherForEntry(selectedEntry)?.icon)}{" "}
                      {weatherForEntry(selectedEntry)?.temperatureC !==
                      undefined
                        ? `${fahrenheit(
                            weatherForEntry(selectedEntry)!.temperatureC!,
                          )}°`
                        : weatherForEntry(selectedEntry)?.condition}
                    </strong>
                    <small>Forecast shown at session time</small>
                  </span>
                </div>
              )}
            </section>

            {actionFeedback && (
              <p
                className={`schedule-action-feedback schedule-action-feedback--${actionFeedback.status}`}
                role="status"
              >
                {actionFeedback.status === "success" ? (
                  <CheckCircle2 aria-hidden size={16} />
                ) : (
                  <AlertTriangle aria-hidden size={16} />
                )}
                {actionFeedback.message}
              </p>
            )}

            {(selectedEntry.sourceType === "booking" ||
              selectedEntry.sourceType === "pickup") && (
              <section className="schedule-drawer-section">
                <header>
                  <span>
                    <small>
                      {selectedEntry.sourceType === "pickup"
                        ? "Match players"
                        : "Reservation players"}
                    </small>
                    <strong>
                      {selectedEntry.attendees.length === 0
                        ? "No players added yet"
                        : `${selectedEntry.attendees.length} people connected`}
                    </strong>
                  </span>
                  <Badge>
                    {Math.max(
                      0,
                      selectedEntry.capacity - selectedEntry.participantCount,
                    )}{" "}
                    spots
                  </Badge>
                </header>
                <div className="schedule-attendee-list">
                  {selectedEntry.attendees.length === 0 ? (
                    <p>
                      This reservation only has its booking details. Open the
                      full record to add or review players.
                    </p>
                  ) : (
                    selectedEntry.attendees.map((attendee) => (
                      <article
                        key={
                          attendee.participationId ??
                          attendee.personId ??
                          attendee.displayName
                        }
                      >
                        <span
                          className={`schedule-person-avatar ${
                            attendee.avatarUrl
                              ? "schedule-person-avatar--image"
                              : ""
                          }`}
                          style={
                            attendee.avatarUrl
                              ? {
                                  backgroundImage: `url("${attendee.avatarUrl}")`,
                                }
                              : undefined
                          }
                        >
                          {!attendee.avatarUrl &&
                            initials(attendee.displayName)}
                        </span>
                        <span>
                          <strong>{attendee.displayName}</strong>
                          <small>
                            {[attendee.role, attendee.status]
                              .filter(Boolean)
                              .join(" · ")}
                            {attendee.isMinor ? " · guardian gets updates" : ""}
                          </small>
                        </span>
                        <Badge
                          tone={
                            attendee.attendanceStatus === "attended"
                              ? "positive"
                              : attendee.attendanceStatus === "no-show"
                                ? "warning"
                                : "neutral"
                          }
                        >
                          {(attendee.attendanceStatus ?? "expected").replaceAll(
                            "-",
                            " ",
                          )}
                        </Badge>
                      </article>
                    ))
                  )}
                </div>
                <p className="schedule-drawer-section__hint">
                  Open the full record to check players in, record a no-show,
                  and review linked match or court details.
                </p>
              </section>
            )}

            {selectedEntry.sourceType === "session" && (
              <>
                <section className="schedule-drawer-section">
                  <header>
                    <span>
                      <small>Roster</small>
                      <strong>
                        {selectedEntry.attendees.length} people coming
                      </strong>
                    </span>
                    <Badge>
                      {Math.max(
                        0,
                        selectedEntry.capacity - selectedEntry.participantCount,
                      )}{" "}
                      spots
                    </Badge>
                  </header>
                  <div className="schedule-attendee-list">
                    {selectedEntry.attendees.length === 0 ? (
                      <p>No confirmed players yet.</p>
                    ) : (
                      selectedEntry.attendees.map((attendee) => (
                        <article key={attendee.registrationId}>
                          <span
                            className={`schedule-person-avatar ${
                              attendee.avatarUrl
                                ? "schedule-person-avatar--image"
                                : ""
                            }`}
                            style={
                              attendee.avatarUrl
                                ? {
                                    backgroundImage: `url("${attendee.avatarUrl}")`,
                                  }
                                : undefined
                            }
                          >
                            {!attendee.avatarUrl &&
                              initials(attendee.displayName)}
                          </span>
                          <span>
                            <strong>{attendee.displayName}</strong>
                            <small>
                              {attendee.status}
                              {attendee.isMinor
                                ? " · guardian gets updates"
                                : ""}
                            </small>
                          </span>
                          <form action={removeParticipantAction}>
                            <input
                              name="registrationId"
                              type="hidden"
                              value={attendee.registrationId}
                            />
                            <input
                              name="reason"
                              type="hidden"
                              value="Removed from the session by an organization operator."
                            />
                            <button
                              aria-label={`Remove ${attendee.displayName}`}
                              className="schedule-icon-button schedule-icon-button--danger"
                              disabled={participantRemovePending}
                              type="submit"
                            >
                              <UserMinus size={16} />
                            </button>
                          </form>
                        </article>
                      ))
                    )}
                  </div>
                  {participantCandidates.length > 0 ? (
                    <form
                      action={addParticipantAction}
                      className="operator-form schedule-inline-form"
                    >
                      <input
                        name="sessionId"
                        type="hidden"
                        value={selectedEntry.id}
                      />
                      <label>
                        <span>Add a connected player</span>
                        <select name="personId" required>
                          <option value="">Search or choose a player</option>
                          {participantCandidates.map((person) => (
                            <option
                              key={person.personId}
                              value={person.personId}
                            >
                              {person.displayName}
                              {person.membershipName
                                ? ` · ${person.membershipName}`
                                : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        className="hq-button hq-button--secondary"
                        disabled={participantAddPending}
                        type="submit"
                      >
                        <UserPlus size={15} />
                        {participantAddPending ? "Adding…" : "Add player"}
                      </button>
                    </form>
                  ) : (
                    <Link className="schedule-text-link" href="/members/invite">
                      Invite another player <ExternalLink size={14} />
                    </Link>
                  )}
                </section>

                <section className="schedule-drawer-section">
                  <header>
                    <span>
                      <small>Equipment</small>
                      <strong>Reserved for this session</strong>
                    </span>
                    <PackagePlus aria-hidden size={18} />
                  </header>
                  <div className="schedule-equipment-list">
                    {selectedEntry.equipment.length === 0 ? (
                      <p>No equipment reserved.</p>
                    ) : (
                      selectedEntry.equipment.map((item) => (
                        <article key={item.reservationId}>
                          <span>
                            <strong>{item.label}</strong>
                            <small>{item.quantity} reserved</small>
                          </span>
                          <form action={removeEquipmentAction}>
                            <input
                              name="reservationId"
                              type="hidden"
                              value={item.reservationId}
                            />
                            <button
                              aria-label={`Remove ${item.label}`}
                              className="schedule-icon-button"
                              disabled={equipmentRemovePending}
                              type="submit"
                            >
                              <PackageMinus size={16} />
                            </button>
                          </form>
                        </article>
                      ))
                    )}
                  </div>
                  {equipmentCandidates.length > 0 && (
                    <form
                      action={addEquipmentAction}
                      className="operator-form schedule-inline-form schedule-inline-form--equipment"
                    >
                      <input
                        name="sessionId"
                        type="hidden"
                        value={selectedEntry.id}
                      />
                      <label>
                        <span>Add equipment</span>
                        <select name="inventoryStockItemId" required>
                          <option value="">Choose available inventory</option>
                          {equipmentCandidates.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.itemTitle} ·{" "}
                              {item.quantityOnHand - item.quantityReserved}{" "}
                              available
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Quantity</span>
                        <input
                          defaultValue="1"
                          min="1"
                          name="quantity"
                          type="number"
                        />
                      </label>
                      <button
                        className="hq-button hq-button--secondary"
                        disabled={equipmentAddPending}
                        type="submit"
                      >
                        <PackagePlus size={15} />
                        {equipmentAddPending ? "Reserving…" : "Reserve"}
                      </button>
                    </form>
                  )}
                </section>

                <section className="schedule-notification-note">
                  <ShieldCheck aria-hidden size={19} />
                  <span>
                    <strong>Connected updates are automatic</strong>
                    <small>
                      Schedule, roster, equipment, and cancellation changes
                      queue in-app and push notifications. Verified guardians
                      receive copies for minors.
                    </small>
                  </span>
                </section>

                <section className="schedule-drawer-section schedule-drawer-section--danger">
                  <header>
                    <span>
                      <small>Cancel session</small>
                      <strong>Release resources and notify everyone</strong>
                    </span>
                  </header>
                  <form action={cancelSessionAction} className="operator-form">
                    <label>
                      <span>Reason shown in the update</span>
                      <textarea
                        name="reason"
                        placeholder="Weather, coach unavailable, venue closure…"
                        required
                      />
                    </label>
                    <label className="operator-confirmation">
                      <input
                        name="confirmed"
                        required
                        type="checkbox"
                        value="true"
                      />
                      <span>
                        <strong>Confirm cancellation</strong>
                        Court and equipment holds are released immediately.
                      </span>
                    </label>
                    <input
                      name="sessionId"
                      type="hidden"
                      value={selectedEntry.id}
                    />
                    <button
                      className="hq-button hq-button--danger"
                      disabled={cancellationPending}
                      type="submit"
                    >
                      <Ban size={15} />
                      {cancellationPending
                        ? "Cancelling…"
                        : "Cancel and notify"}
                    </button>
                  </form>
                </section>
              </>
            )}

            <footer className="schedule-detail-drawer__footer">
              <Link
                className="hq-button hq-button--primary"
                href={entryDetailHref(selectedEntry)}
              >
                Open full {entryKindLabel(selectedEntry)}
                <ExternalLink size={15} />
              </Link>
            </footer>
          </aside>
        </div>
      )}

      {blockOpen && (
        <div
          aria-label="Block calendar time"
          aria-modal="true"
          className="schedule-drawer-backdrop"
          onClick={() => setBlockOpen(false)}
          role="dialog"
        >
          <aside
            className="schedule-detail-drawer schedule-detail-drawer--calendar"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="schedule-detail-drawer__header">
              <button
                aria-label="Close block time"
                className="schedule-icon-button"
                onClick={() => setBlockOpen(false)}
                type="button"
              >
                <X size={20} />
              </button>
              <span>
                <small>Protect the schedule</small>
                <strong>Block time</strong>
              </span>
            </header>
            <div
              aria-label="Schedule creation method"
              className="schedule-block-mode"
              role="tablist"
            >
              <button
                aria-selected={blockCreationMode === "one-time"}
                className={
                  blockCreationMode === "one-time" ? "is-active" : undefined
                }
                onClick={() => setBlockCreationMode("one-time")}
                role="tab"
                type="button"
              >
                <Ban size={16} /> One-time block
              </button>
              <button
                aria-selected={blockCreationMode === "ai"}
                className={blockCreationMode === "ai" ? "is-active" : undefined}
                onClick={() => setBlockCreationMode("ai")}
                role="tab"
                type="button"
              >
                <Sparkles size={16} /> Create schedule with Duna AI
              </button>
            </div>
            {blockCreationMode === "one-time" ? (
              <form action={blockTimeAction} className="operator-form">
                <div className="operator-form-grid operator-form-grid--two">
                  <label>
                    <span>Resource type</span>
                    <select
                      name="resourceType"
                      onChange={(event) =>
                        setBlockResourceType(event.target.value as ResourceView)
                      }
                      value={blockResourceType}
                    >
                      <option value="court">Court</option>
                      <option value="coach">Coach</option>
                    </select>
                  </label>
                  <label>
                    <span>Block type</span>
                    <select name="mode">
                      <option value="blocked">Unavailable</option>
                      <option value="maintenance">Maintenance</option>
                    </select>
                  </label>
                </div>
                <label>
                  <span>
                    {blockResourceType === "court" ? "Court" : "Coach"}
                  </span>
                  <select name="resourceId" required>
                    <option value="">Choose a resource</option>
                    {blockResources.map((resource) => (
                      <option key={resource.id} value={resource.id}>
                        {resource.label}
                      </option>
                    ))}
                  </select>
                </label>
                <input name="startsAt" type="hidden" value={blockRange.start} />
                <input name="endsAt" type="hidden" value={blockRange.end} />
                <SmartDateRangePicker
                  applyLabel="Use this block"
                  label="Unavailable window"
                  onChange={setBlockRange}
                  timeMode="required"
                  value={blockRange}
                />
                <label>
                  <span>Reason</span>
                  <textarea
                    name="reason"
                    placeholder="Private hold, lunch, maintenance, travel…"
                    required
                  />
                </label>
                {calendarBlock.status === "error" && (
                  <p className="schedule-action-feedback schedule-action-feedback--error">
                    <AlertTriangle aria-hidden size={16} />
                    {calendarBlock.message}
                  </p>
                )}
                <button
                  className="hq-button hq-button--primary"
                  disabled={blockPending || blockResources.length === 0}
                  type="submit"
                >
                  <Ban size={15} />
                  {blockPending ? "Checking conflicts…" : "Block this time"}
                </button>
              </form>
            ) : (
              <form action={recurringBlockAction} className="operator-form">
                <div className="schedule-ai-intro">
                  <Sparkles aria-hidden size={18} />
                  <span>
                    <strong>Describe the real constraint.</strong>
                    <small>
                      Duna creates a reviewable draft. Nothing is saved until
                      you confirm it.
                    </small>
                  </span>
                </div>
                <div className="operator-form-grid operator-form-grid--two">
                  <label>
                    <span>Resource type</span>
                    <select
                      name="resourceType"
                      onChange={(event) =>
                        setBlockResourceType(event.target.value as ResourceView)
                      }
                      value={blockResourceType}
                    >
                      <option value="coach">Coach</option>
                      <option value="court">Court</option>
                    </select>
                  </label>
                  <label>
                    <span>
                      {blockResourceType === "court" ? "Court" : "Coach"}
                    </span>
                    <select name="resourceId" required>
                      <option value="">Choose a resource</option>
                      {blockResources.map((resource) => (
                        <option key={resource.id} value={resource.id}>
                          {resource.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label>
                  <span>Tell Duna what is unavailable</span>
                  <textarea
                    onChange={(event) => {
                      setAiPrompt(event.target.value);
                      setAiDraft(undefined);
                    }}
                    placeholder="I can’t work on Mon, Weds, Fri from noon–3 PM for school."
                    value={aiPrompt}
                  />
                </label>
                <button
                  className="hq-button hq-button--secondary"
                  disabled={aiPrompt.trim().length < 8}
                  onClick={() =>
                    setAiDraft(parseNaturalLanguageSchedule(aiPrompt))
                  }
                  type="button"
                >
                  <Sparkles size={15} /> Build review draft
                </button>
                {aiDraft && (
                  <section
                    className="schedule-ai-draft"
                    data-status={aiDraft.status}
                  >
                    <header>
                      <span>
                        <small>Proposed weekly blocks</small>
                        <strong>{aiDraft.summary}</strong>
                      </span>
                      <Badge
                        tone={
                          aiDraft.status === "ready" ? "positive" : "warning"
                        }
                      >
                        {aiDraft.status === "ready"
                          ? "Ready to review"
                          : "Needs detail"}
                      </Badge>
                    </header>
                    {aiDraft.warnings.map((warning) => (
                      <p key={warning}>
                        <AlertTriangle aria-hidden size={15} /> {warning}
                      </p>
                    ))}
                    {aiDraft.blocks.length > 0 && (
                      <div>
                        {aiDraft.blocks.map((block) => (
                          <span key={block.weekday}>
                            <strong>{block.day}</strong>
                            <small>
                              {String(
                                Math.floor(block.startsAtMinute / 60),
                              ).padStart(2, "0")}
                              :
                              {String(block.startsAtMinute % 60).padStart(
                                2,
                                "0",
                              )}{" "}
                              –{" "}
                              {String(
                                Math.floor(block.endsAtMinute / 60),
                              ).padStart(2, "0")}
                              :
                              {String(block.endsAtMinute % 60).padStart(2, "0")}
                            </small>
                          </span>
                        ))}
                      </div>
                    )}
                  </section>
                )}
                <SmartDateRangePicker
                  applyLabel="Use these dates"
                  label="Schedule applies during"
                  onChange={setAiEffectiveRange}
                  timeMode="hidden"
                  value={aiEffectiveRange}
                />
                <input
                  name="blocks"
                  type="hidden"
                  value={JSON.stringify(aiDraft?.blocks ?? [])}
                />
                <input
                  name="effectiveFrom"
                  type="hidden"
                  value={aiEffectiveRange.start.slice(0, 10)}
                />
                <input
                  name="effectiveTo"
                  type="hidden"
                  value={aiEffectiveRange.end.slice(0, 10)}
                />
                <input
                  name="reason"
                  type="hidden"
                  value={aiDraft?.reason ?? aiPrompt}
                />
                {aiDraft?.status === "ready" && (
                  <label className="operator-confirmation">
                    <input
                      name="confirmed"
                      required
                      type="checkbox"
                      value="true"
                    />
                    <span>
                      <strong>Confirm this recurring schedule</strong>
                      Existing bookings stay intact; future availability will
                      honor these blocks.
                    </span>
                  </label>
                )}
                {recurringBlock.status === "error" && (
                  <p className="schedule-action-feedback schedule-action-feedback--error">
                    <AlertTriangle aria-hidden size={16} />
                    {recurringBlock.message}
                  </p>
                )}
                <button
                  className="hq-button hq-button--primary"
                  disabled={
                    recurringBlockPending ||
                    blockResources.length === 0 ||
                    aiDraft?.status !== "ready"
                  }
                  type="submit"
                >
                  <Sparkles size={15} />
                  {recurringBlockPending
                    ? "Saving reviewed schedule…"
                    : "Confirm recurring blocks"}
                </button>
              </form>
            )}
          </aside>
        </div>
      )}
    </>
  );
}
