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

type CalendarEntry = OperatorWorkspace["calendar"]["entries"][number];
type CalendarView = "day" | "week" | "month" | "quarter";
type ResourceView = "court" | "coach";

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
    const values = new Map<string, string>();
    for (const entry of workspace.calendar.entries) {
      const id =
        resourceView === "court"
          ? (entry.courtId ?? "unassigned-court")
          : (entry.coachPersonId ?? "unassigned-coach");
      const label =
        resourceView === "court"
          ? (entry.courtName ?? "No court")
          : (entry.coachName ?? "No coach");
      values.set(id, label);
    }
    if (values.size === 0) values.set("unassigned", "Unassigned");
    return [...values.entries()].map(([id, label]) => ({ id, label }));
  }, [resourceView, workspace.calendar.entries]);

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

  const renderEntry = (entry: CalendarEntry) => (
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
      </span>
      <Badge>{entry.participantCount}</Badge>
    </article>
  );

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
          {days.map((day) => (
            <header key={dateKey(day)}>
              <small>
                {day.toLocaleDateString("en-US", { weekday: "short" })}
              </small>
              <strong>{day.getDate()}</strong>
            </header>
          ))}
          {lanes.map((lane) => (
            <div className="schedule-resource-row" key={lane.id}>
              <div className="schedule-resource-row__label">
                <strong>{lane.label}</strong>
                <small>
                  {resourceView === "court"
                    ? "Bookable resource"
                    : "Coach time"}
                </small>
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
