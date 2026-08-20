"use client";

import {
  TRAINING_FOCUS_AREAS,
  type TrainingEvent,
} from "@duna/api/training-contracts";
import {
  CalendarDays,
  Check,
  CircleAlert,
  Clock3,
  Gauge,
  Pencil,
  Save,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { updateTrainingProgramEventAction } from "@/app/training/actions";

type EventDraft = {
  readonly localDate: string;
  readonly startsAt: string;
  readonly durationMinutes: number;
  readonly title: string;
  readonly plannedLoad: number;
  readonly focusArea?: string;
};

function zonedParts(value: string, timezone: string): Record<string, string> {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
      month: "2-digit",
      timeZone: timezone,
      year: "numeric",
    })
      .formatToParts(new Date(value))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
}

function eventDraft(event: TrainingEvent): EventDraft {
  const parts = zonedParts(event.startsAt, event.timezone);
  const durationMinutes = Math.max(
    15,
    Math.round(
      (new Date(event.endsAt).getTime() - new Date(event.startsAt).getTime()) /
        60_000,
    ),
  );
  return {
    localDate: `${parts.year}-${parts.month}-${parts.day}`,
    startsAt: `${parts.hour}:${parts.minute}`,
    durationMinutes,
    title: event.title,
    plannedLoad: event.plannedLoad,
    ...(event.focusArea ? { focusArea: event.focusArea } : {}),
  };
}

function formatEventDate(event: TrainingEvent): string {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: event.timezone,
    year: "numeric",
  }).format(new Date(event.startsAt));
}

function eventTone(kind: TrainingEvent["kind"]): string {
  return ["tournament", "travel", "assessment"].includes(kind)
    ? "milestone"
    : ["rest", "recovery"].includes(kind)
      ? "recovery"
      : "practice";
}

export function TrainingProgramScheduleEditor({
  events,
  programEndDate,
  programStartDate,
}: {
  readonly events: readonly TrainingEvent[];
  readonly programEndDate: string;
  readonly programStartDate: string;
}) {
  const router = useRouter();
  const [editingEventId, setEditingEventId] = useState<string>();
  const [drafts, setDrafts] = useState<Readonly<Record<string, EventDraft>>>(
    {},
  );
  const [notice, setNotice] = useState<
    | { readonly status: "success" | "error"; readonly message: string }
    | undefined
  >();
  const [saving, startSaving] = useTransition();
  const idempotencyKeys = useRef(new Map<string, string>());

  const draftFor = (event: TrainingEvent): EventDraft =>
    drafts[event.id] ?? eventDraft(event);

  const updateDraft = (event: TrainingEvent, patch: Partial<EventDraft>) => {
    setDrafts((current) => ({
      ...current,
      [event.id]: { ...draftFor(event), ...patch },
    }));
    idempotencyKeys.current.delete(event.id);
    setNotice(undefined);
  };

  const editEvent = (event: TrainingEvent) => {
    setEditingEventId((current) =>
      current === event.id ? undefined : event.id,
    );
    if (!drafts[event.id]) {
      setDrafts((current) => ({ ...current, [event.id]: eventDraft(event) }));
    }
  };

  const saveEvent = (event: TrainingEvent) => {
    const draft = draftFor(event);
    const idempotencyKey =
      idempotencyKeys.current.get(event.id) ?? crypto.randomUUID();
    idempotencyKeys.current.set(event.id, idempotencyKey);
    setNotice(undefined);
    startSaving(async () => {
      const result = await updateTrainingProgramEventAction({
        trainingEventId: event.id,
        ...draft,
        idempotencyKey,
      });
      setNotice(result);
      if (result.status === "success") {
        setEditingEventId(undefined);
        router.refresh();
      }
    });
  };

  return (
    <section className="training-program-schedule-editor">
      <header>
        <div>
          <span className="hq-eyebrow">Operational calendar</span>
          <h2>Adjust the program as the season changes.</h2>
          <p>
            Every practice, tournament, and travel day can be edited here. The
            customer offer stays separate from this coaching calendar.
          </p>
        </div>
        <span>
          <CalendarDays aria-hidden size={17} /> {events.length} calendar items
        </span>
      </header>
      <div className="training-program-schedule-editor__events">
        {events.map((event) => {
          const draft = draftFor(event);
          const isEditing = editingEventId === event.id;
          const canEdit = event.status !== "completed";
          return (
            <article className={eventTone(event.kind)} key={event.id}>
              <time>
                <strong>
                  {new Date(event.startsAt).toLocaleDateString("en-US", {
                    day: "2-digit",
                    timeZone: event.timezone,
                  })}
                </strong>
                <span>
                  {new Date(event.startsAt).toLocaleDateString("en-US", {
                    month: "short",
                    timeZone: event.timezone,
                  })}
                </span>
              </time>
              <i />
              <div>
                <span>{event.kind.replace("-", " ")}</span>
                <h3>{event.title}</h3>
                <p>
                  {formatEventDate(event)} ·{" "}
                  {new Date(event.startsAt).toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                    timeZone: event.timezone,
                  })}
                </p>
              </div>
              <aside>
                <Gauge aria-hidden size={15} />
                <strong>{event.plannedLoad}</strong>
                <small>load</small>
              </aside>
              <button
                aria-expanded={isEditing}
                className="hq-button hq-button--secondary"
                disabled={!canEdit}
                onClick={() => editEvent(event)}
                type="button"
              >
                {isEditing || !canEdit ? (
                  <Check aria-hidden size={16} />
                ) : (
                  <Pencil aria-hidden size={16} />
                )}
                {isEditing ? "Done" : canEdit ? "Edit" : "Recorded"}
              </button>
              {isEditing && (
                <form
                  className="training-program-schedule-editor__form"
                  onSubmit={(submitEvent) => {
                    submitEvent.preventDefault();
                    saveEvent(event);
                  }}
                >
                  <label className="wide">
                    <span>Title</span>
                    <input
                      minLength={2}
                      onChange={(changeEvent) =>
                        updateDraft(event, { title: changeEvent.target.value })
                      }
                      required
                      value={draft.title}
                    />
                  </label>
                  <label>
                    <span>Date</span>
                    <input
                      max={programEndDate}
                      min={programStartDate}
                      onChange={(changeEvent) =>
                        updateDraft(event, {
                          localDate: changeEvent.target.value,
                        })
                      }
                      required
                      type="date"
                      value={draft.localDate}
                    />
                  </label>
                  <label>
                    <span>Start time</span>
                    <input
                      onChange={(changeEvent) =>
                        updateDraft(event, {
                          startsAt: changeEvent.target.value,
                        })
                      }
                      required
                      type="time"
                      value={draft.startsAt}
                    />
                  </label>
                  <label>
                    <span>Length (minutes)</span>
                    <input
                      max="720"
                      min="15"
                      onChange={(changeEvent) =>
                        updateDraft(event, {
                          durationMinutes: Number(changeEvent.target.value),
                        })
                      }
                      required
                      type="number"
                      value={draft.durationMinutes}
                    />
                  </label>
                  <label>
                    <span>Focus area</span>
                    <select
                      onChange={(changeEvent) =>
                        updateDraft(event, {
                          focusArea: changeEvent.target.value || undefined,
                        })
                      }
                      value={draft.focusArea ?? ""}
                    >
                      <option value="">No focus area</option>
                      {TRAINING_FOCUS_AREAS.map((focusArea) => (
                        <option key={focusArea} value={focusArea}>
                          {focusArea}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="training-program-schedule-editor__load">
                    <span>Estimated load · {draft.plannedLoad}</span>
                    <input
                      max="100"
                      min="0"
                      onChange={(changeEvent) =>
                        updateDraft(event, {
                          plannedLoad: Number(changeEvent.target.value),
                        })
                      }
                      type="range"
                      value={draft.plannedLoad}
                    />
                  </label>
                  <footer>
                    <span>
                      <Clock3 aria-hidden size={16} /> {event.timezone}
                    </span>
                    <button
                      className="hq-button hq-button--primary"
                      disabled={saving}
                      type="submit"
                    >
                      <Save aria-hidden size={16} />
                      {saving ? "Saving…" : "Save calendar change"}
                    </button>
                  </footer>
                </form>
              )}
            </article>
          );
        })}
      </div>
      {notice && (
        <p
          className={`training-studio-notice training-studio-notice--${notice.status}`}
          role={notice.status === "error" ? "alert" : "status"}
        >
          {notice.status === "success" ? (
            <Check aria-hidden size={15} />
          ) : (
            <CircleAlert aria-hidden size={15} />
          )}
          {notice.message}
        </p>
      )}
    </section>
  );
}
