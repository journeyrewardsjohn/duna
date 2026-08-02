"use client";

import type { OperatorWorkspace } from "@duna/api";
import { Badge } from "@duna/ui";
import {
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Clock3,
  GripVertical,
  Rows3,
  UsersRound,
} from "lucide-react";
import {
  startTransition,
  useActionState,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import {
  confirmCalendarChangeAction,
  proposeCalendarChangeAction,
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

export function ScheduleCalendar({
  workspace,
}: {
  readonly workspace: OperatorWorkspace;
}) {
  const [view, setView] = useState<CalendarView>("week");
  const [resourceView, setResourceView] = useState<ResourceView>("court");
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [draggedId, setDraggedId] = useState<string>();
  const [proposal, proposeAction, proposalPending] = useActionState(
    proposeCalendarChangeAction,
    initialActionState,
  );
  const [confirmation, confirmAction, confirmationPending] = useActionState(
    confirmCalendarChangeAction,
    initialActionState,
  );
  const days = useMemo(() => calendarDays(anchor, view), [anchor, view]);
  const entriesByDay = useMemo(() => {
    const result = new Map<string, CalendarEntry[]>();
    for (const entry of workspace.calendar.entries) {
      const key = dateKey(new Date(entry.startsAt));
      result.set(key, [...(result.get(key) ?? []), entry]);
    }
    return result;
  }, [workspace.calendar.entries]);
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

  const navigate = (direction: -1 | 1) => {
    const amount =
      view === "day" ? 1 : view === "week" ? 7 : view === "month" ? 1 : 3;
    setAnchor((current) =>
      view === "day" || view === "week"
        ? addDays(current, amount * direction)
        : addMonths(current, amount * direction),
    );
  };

  const proposeMove = (day: Date) => {
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
    if (entry.courtId) formData.set("courtId", entry.courtId);
    if (entry.coachPersonId) formData.set("coachPersonId", entry.coachPersonId);
    startTransition(() => proposeAction(formData));
  };

  const renderEntry = (entry: CalendarEntry) =>
    (() => {
      const venue = workspace.venues.find(
        (candidate) => candidate.name === entry.venueName,
      );
      const point = venue?.weather?.hourly
        .slice()
        .sort(
          (left, right) =>
            Math.abs(Date.parse(left.startsAt) - Date.parse(entry.startsAt)) -
            Math.abs(Date.parse(right.startsAt) - Date.parse(entry.startsAt)),
        )[0];
      return (
        <article
          className={`schedule-event schedule-event--${entry.sourceType}`}
          draggable={entry.draggable}
          key={entry.id}
          onDragStart={() => setDraggedId(entry.id)}
          style={{ "--event-color": entry.color } as CSSProperties}
          title={entry.draggable ? "Drag to preview a new day" : undefined}
        >
          {entry.draggable && <GripVertical aria-hidden size={13} />}
          <span>
            <strong>{entry.title}</strong>
            <small>
              {formatTime(entry.startsAt, workspace.organization.timezone)} ·{" "}
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
          <Badge>{entry.participantCount}</Badge>
        </article>
      );
    })();

  return (
    <section className="hq-card schedule-calendar">
      <header className="schedule-calendar__toolbar">
        <div>
          <span className="hq-eyebrow">Organization schedule</span>
          <h2>{formatRange(anchor, view)}</h2>
          <p>
            {workspace.calendar.resourceConflicts
              ? `${workspace.calendar.resourceConflicts} proposed resource conflicts need review.`
              : "Courts, coaches, bookings, and external busy blocks in one calendar."}
          </p>
        </div>
        <div className="schedule-calendar__toolbar-actions">
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

      {view === "day" || view === "week" ? (
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
                      ? ` · ◐ ${formatTime(
                          forecastDay.sunsetAt,
                          workspace.organization.timezone,
                        )}`
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
                      : (entry.coachPersonId ?? "unassigned-coach") === lane.id,
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
                    onDrop={() => proposeMove(day)}
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
                    {entries.map(renderEntry)}
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
                          .find((candidate) => candidate.date === dateKey(day))
                          ?.icon,
                      )}
                    </small>
                  )}
                </span>
                {entries.slice(0, view === "quarter" ? 2 : 4).map(renderEntry)}
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
          {workspace.calendar.connections.length} external calendar connections
        </span>
        <span>
          <Clock3 aria-hidden size={17} />
          Times shown in {workspace.organization.timezone}
        </span>
        {workspace.venues.find((venue) => venue.weather)?.weather && (
          <span>
            {workspace.venues.find((venue) => venue.weather)?.weather
              ?.source === "tomorrow.io"
              ? "Tomorrow.io forecast"
              : "Calculated daylight"}
            {" · "}updated{" "}
            {formatTime(
              workspace.venues.find((venue) => venue.weather)!.weather!
                .updatedAt,
              workspace.organization.timezone,
            )}
          </span>
        )}
        <span>Drag a scheduled session to preview a move.</span>
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
              Nothing moves until this review is confirmed. Player notifications
              are calculated with the proposal.
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
  );
}
