"use client";

import {
  TRAINING_FOCUS_AREAS,
  type TrainingEvent,
  type TrainingFocusArea,
} from "@duna/api/training-contracts";
import {
  CalendarDays,
  CalendarPlus,
  Check,
  CircleAlert,
  ClipboardCheck,
  Clock3,
  ExternalLink,
  Gauge,
  MapPin,
  Pencil,
  Plane,
  Plus,
  Search,
  Save,
  Sparkles,
  Trash2,
  Trophy,
  UsersRound,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import {
  createTrainingProgramEventAction,
  importTrainingTournamentAction,
  removeTrainingProgramEventAction,
  updateTrainingProgramEventAction,
} from "@/app/training/actions";
import { PlaceSearch, type PlaceDetails } from "./place-search";

export type ProgramTournamentCandidate = {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly href: string;
  readonly startsAt?: string;
  readonly endsAt?: string;
  readonly professional: boolean;
};

type CalendarItemKind =
  "practice" | "tournament" | "travel" | "assessment" | "rest";

type CalendarItemDraft = {
  readonly kind: CalendarItemKind;
  readonly title: string;
  readonly startsOn: string;
  readonly startsAt: string;
  readonly endsOn: string;
  readonly endsAt: string;
  readonly plannedLoad: number;
  readonly focusArea?: TrainingFocusArea;
  readonly notes: string;
  readonly tournamentSource: "duna" | "manual";
  readonly tournamentType:
    "national" | "qualifying" | "pro" | "local" | "other";
  readonly tournamentQuery: string;
  readonly dunaTournamentId?: string;
  readonly dunaTournamentHref?: string;
  readonly websiteUrl: string;
  readonly venueName: string;
  readonly address: string;
  readonly place?: PlaceDetails;
};

const itemKinds = [
  {
    kind: "practice",
    label: "Session",
    detail: "Add another coached practice",
    icon: UsersRound,
  },
  {
    kind: "tournament",
    label: "Tournament",
    detail: "Competition and taper context",
    icon: Trophy,
  },
  {
    kind: "travel",
    label: "Travel",
    detail: "Protect arrival and recovery time",
    icon: Plane,
  },
  {
    kind: "assessment",
    label: "Assessment",
    detail: "Baseline or progress checkpoint",
    icon: ClipboardCheck,
  },
  {
    kind: "rest",
    label: "Break",
    detail: "Pause training or protect recovery",
    icon: CalendarDays,
  },
] as const;

const tournamentTypes = [
  ["national", "National"],
  ["qualifying", "Qualifying"],
  ["pro", "Pro"],
  ["local", "Local"],
  ["other", "Other"],
] as const;

function defaultCalendarItem(
  kind: CalendarItemKind,
  date: string,
): CalendarItemDraft {
  const defaults = {
    practice: {
      title: "Additional practice",
      startsAt: "17:00",
      endsAt: "18:30",
      load: 55,
    },
    tournament: { title: "", startsAt: "08:00", endsAt: "18:00", load: 90 },
    travel: {
      title: "Travel day",
      startsAt: "09:00",
      endsAt: "15:00",
      load: 15,
    },
    assessment: {
      title: "Athlete assessment",
      startsAt: "16:00",
      endsAt: "17:00",
      load: 35,
    },
    rest: {
      title: "Program break",
      startsAt: "08:00",
      endsAt: "17:00",
      load: 0,
    },
  }[kind];
  return {
    kind,
    title: defaults.title,
    startsOn: date,
    startsAt: defaults.startsAt,
    endsOn: date,
    endsAt: defaults.endsAt,
    plannedLoad: defaults.load,
    notes: "",
    tournamentSource: "duna",
    tournamentType: kind === "tournament" ? "local" : "other",
    tournamentQuery: "",
    websiteUrl: "",
    venueName: "",
    address: "",
  };
}

function dateInsideWindow(start: string, end: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return today < start ? start : today > end ? end : today;
}

function validWebsiteUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function candidateDate(
  value: string | undefined,
  timezone: string,
): string | undefined {
  if (!value) return undefined;
  const parts = zonedParts(value, timezone);
  return parts.year && parts.month && parts.day
    ? `${parts.year}-${parts.month}-${parts.day}`
    : undefined;
}

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
  programId,
  programEndDate,
  programStartDate,
  programTimezone,
  readOnly = false,
  tournamentCandidates = [],
}: {
  readonly events: readonly TrainingEvent[];
  readonly programId: string;
  readonly programEndDate: string;
  readonly programStartDate: string;
  readonly programTimezone: string;
  readonly readOnly?: boolean;
  readonly tournamentCandidates?: readonly ProgramTournamentCandidate[];
}) {
  const router = useRouter();
  const initialDate = dateInsideWindow(programStartDate, programEndDate);
  const [editingEventId, setEditingEventId] = useState<string>();
  const [adding, setAdding] = useState(false);
  const [calendarDraft, setCalendarDraft] = useState<CalendarItemDraft>(() =>
    defaultCalendarItem("practice", initialDate),
  );
  const [drafts, setDrafts] = useState<Readonly<Record<string, EventDraft>>>(
    {},
  );
  const [notice, setNotice] = useState<
    | { readonly status: "success" | "error"; readonly message: string }
    | undefined
  >();
  const [saving, startSaving] = useTransition();
  const [importing, startImporting] = useTransition();
  const idempotencyKeys = useRef(new Map<string, string>());

  const updateCalendarDraft = (patch: Partial<CalendarItemDraft>) => {
    setCalendarDraft((current) => ({ ...current, ...patch }));
    setNotice(undefined);
  };

  const chooseKind = (kind: CalendarItemKind) => {
    setCalendarDraft(defaultCalendarItem(kind, initialDate));
    setNotice(undefined);
  };

  const matchingTournaments = tournamentCandidates
    .filter((candidate) => {
      const query = calendarDraft.tournamentQuery.trim().toLowerCase();
      return (
        !query ||
        candidate.title.toLowerCase().includes(query) ||
        candidate.subtitle.toLowerCase().includes(query)
      );
    })
    .slice(0, 6);

  const chooseTournament = (candidate: ProgramTournamentCandidate) => {
    const startsOn = candidateDate(candidate.startsAt, programTimezone);
    const endsOn = candidateDate(candidate.endsAt, programTimezone);
    updateCalendarDraft({
      title: candidate.title,
      venueName: candidate.subtitle,
      tournamentQuery: candidate.title,
      dunaTournamentId: candidate.id,
      dunaTournamentHref: candidate.href,
      tournamentSource: "duna",
      tournamentType: candidate.professional ? "pro" : "local",
      ...(startsOn && startsOn >= programStartDate && startsOn <= programEndDate
        ? { startsOn }
        : {}),
      ...(endsOn && endsOn >= programStartDate && endsOn <= programEndDate
        ? { endsOn }
        : startsOn
          ? { endsOn: startsOn }
          : {}),
    });
  };

  const resolvePlace = (details: PlaceDetails) => {
    updateCalendarDraft({
      place: details,
      venueName: details.name ?? calendarDraft.venueName,
      address: details.address ?? calendarDraft.address,
    });
    return true;
  };

  const importTournament = () => {
    if (
      !calendarDraft.title.trim() ||
      !validWebsiteUrl(calendarDraft.websiteUrl)
    ) {
      setNotice({
        status: "error",
        message:
          "Add the tournament name and a complete website address first.",
      });
      return;
    }
    startImporting(async () => {
      const result = await importTrainingTournamentAction({
        name: calendarDraft.title,
        websiteUrl: calendarDraft.websiteUrl,
        currentLocation:
          calendarDraft.address || calendarDraft.venueName || undefined,
      });
      setNotice(result);
      if (result.status === "success" && result.value.providerAvailable) {
        const imported = result.value;
        updateCalendarDraft({
          title: imported.title ?? calendarDraft.title,
          startsOn: imported.startsOn ?? calendarDraft.startsOn,
          endsOn: imported.endsOn ?? imported.startsOn ?? calendarDraft.endsOn,
          venueName: imported.venueName ?? calendarDraft.venueName,
          address: imported.address ?? calendarDraft.address,
          notes: imported.summary ?? calendarDraft.notes,
          tournamentType:
            imported.tournamentType ?? calendarDraft.tournamentType,
        });
        setNotice(result);
      }
    });
  };

  const addCalendarItem = () => {
    startSaving(async () => {
      const result = await createTrainingProgramEventAction({
        programId,
        kind: calendarDraft.kind,
        title: calendarDraft.title,
        startsOn: calendarDraft.startsOn,
        startsAt: calendarDraft.startsAt,
        endsOn: calendarDraft.endsOn,
        endsAt: calendarDraft.endsAt,
        plannedLoad: calendarDraft.plannedLoad,
        focusArea: calendarDraft.focusArea || undefined,
        notes: calendarDraft.notes || undefined,
        ...(calendarDraft.kind === "tournament"
          ? {
              calendarDetails: {
                source: calendarDraft.tournamentSource,
                tournamentType: calendarDraft.tournamentType,
                dunaTournamentId: calendarDraft.dunaTournamentId,
                dunaTournamentHref: calendarDraft.dunaTournamentHref,
                websiteUrl: calendarDraft.websiteUrl || undefined,
                venueName: calendarDraft.venueName || undefined,
                address: calendarDraft.address || undefined,
                googlePlaceId: calendarDraft.place?.placeId,
                googleMapsUri: calendarDraft.place?.googleMapsUri,
                latitude: calendarDraft.place?.latitude,
                longitude: calendarDraft.place?.longitude,
                summary: calendarDraft.notes || undefined,
              },
            }
          : {}),
      });
      setNotice(result);
      if (result.status === "success") {
        setAdding(false);
        setCalendarDraft(defaultCalendarItem("practice", initialDate));
        router.refresh();
      }
    });
  };

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

  const removeEvent = (event: TrainingEvent) => {
    if (
      !window.confirm(
        `Remove “${event.title}” from this program? The current schedule will be preserved in version history.`,
      )
    ) {
      return;
    }
    setNotice(undefined);
    startSaving(async () => {
      const result = await removeTrainingProgramEventAction(event.id);
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
        <div className="training-program-schedule-editor__header-actions">
          <span>
            <CalendarDays aria-hidden size={17} /> {events.length} calendar
            items
          </span>
          {!readOnly && (
            <button
              aria-expanded={adding}
              className="hq-button hq-button--primary"
              onClick={() => setAdding((current) => !current)}
              type="button"
            >
              {adding ? (
                <X aria-hidden size={16} />
              ) : (
                <Plus aria-hidden size={16} />
              )}
              {adding ? "Close" : "Add calendar item"}
            </button>
          )}
        </div>
      </header>
      {adding && (
        <form
          className="training-calendar-composer"
          onSubmit={(event) => {
            event.preventDefault();
            addCalendarItem();
          }}
        >
          <header>
            <div>
              <span className="hq-eyebrow">Add to program</span>
              <h3>What belongs on the calendar?</h3>
              <p>
                Add the real-world context around training. Each change becomes
                a restorable Program version.
              </p>
            </div>
            <CalendarPlus aria-hidden size={24} />
          </header>

          <fieldset className="training-calendar-composer__kinds">
            <legend>Choose an item</legend>
            <div>
              {itemKinds.map((choice) => {
                const Icon = choice.icon;
                return (
                  <button
                    aria-pressed={calendarDraft.kind === choice.kind}
                    className={
                      calendarDraft.kind === choice.kind ? "active" : undefined
                    }
                    key={choice.kind}
                    onClick={() => chooseKind(choice.kind)}
                    type="button"
                  >
                    <Icon aria-hidden size={19} />
                    <span>
                      <strong>{choice.label}</strong>
                      <small>{choice.detail}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {calendarDraft.kind === "tournament" && (
            <section className="training-calendar-composer__tournament">
              <header>
                <div>
                  <span className="hq-eyebrow">Tournament details</span>
                  <h4>Find it on Duna or add it yourself.</h4>
                </div>
                <div
                  className="training-calendar-composer__source-toggle"
                  role="group"
                  aria-label="Tournament source"
                >
                  <button
                    aria-pressed={calendarDraft.tournamentSource === "duna"}
                    onClick={() =>
                      updateCalendarDraft({ tournamentSource: "duna" })
                    }
                    type="button"
                  >
                    On Duna
                  </button>
                  <button
                    aria-pressed={calendarDraft.tournamentSource === "manual"}
                    onClick={() =>
                      updateCalendarDraft({
                        tournamentSource: "manual",
                        dunaTournamentId: undefined,
                        dunaTournamentHref: undefined,
                      })
                    }
                    type="button"
                  >
                    Enter manually
                  </button>
                </div>
              </header>

              {calendarDraft.tournamentSource === "duna" ? (
                <div className="training-tournament-search">
                  <label>
                    <span>Search Duna tournaments</span>
                    <div>
                      <Search aria-hidden size={16} />
                      <input
                        onChange={(event) =>
                          updateCalendarDraft({
                            tournamentQuery: event.target.value,
                          })
                        }
                        placeholder="Tournament name or location"
                        value={calendarDraft.tournamentQuery}
                      />
                    </div>
                  </label>
                  <div className="training-tournament-search__results">
                    {matchingTournaments.map((candidate) => (
                      <button
                        aria-pressed={
                          calendarDraft.dunaTournamentId === candidate.id
                        }
                        key={candidate.id}
                        onClick={() => chooseTournament(candidate)}
                        type="button"
                      >
                        <span>
                          <strong>{candidate.title}</strong>
                          <small>{candidate.subtitle}</small>
                        </span>
                        <span>{candidate.professional ? "Pro" : "Duna"}</span>
                      </button>
                    ))}
                    {matchingTournaments.length === 0 && (
                      <div>
                        <Trophy aria-hidden size={18} />
                        <span>
                          <strong>No matching Duna tournaments.</strong>
                          <small>
                            Switch to manual entry to add this competition.
                          </small>
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="training-tournament-manual">
                  <label className="wide">
                    <span>Tournament name</span>
                    <input
                      onChange={(event) =>
                        updateCalendarDraft({ title: event.target.value })
                      }
                      placeholder="Example: 18U National Championships"
                      required
                      value={calendarDraft.title}
                    />
                  </label>
                  <PlaceSearch
                    helper="Choose a Google result so travel and timezone context stays accurate."
                    label="Tournament location"
                    onAddress={(address) => updateCalendarDraft({ address })}
                    onPlace={resolvePlace}
                    onVenueName={(venueName) =>
                      updateCalendarDraft({ venueName })
                    }
                    placeholder="Search venue, city, or address"
                    value={calendarDraft.address}
                  />
                  <label className="wide">
                    <span>Tournament website</span>
                    <div className="training-tournament-manual__url">
                      <input
                        aria-invalid={
                          Boolean(calendarDraft.websiteUrl) &&
                          !validWebsiteUrl(calendarDraft.websiteUrl)
                        }
                        onChange={(event) =>
                          updateCalendarDraft({
                            websiteUrl: event.target.value,
                          })
                        }
                        placeholder="https://…"
                        type="url"
                        value={calendarDraft.websiteUrl}
                      />
                      <button
                        className="hq-button hq-button--secondary"
                        disabled={
                          importing ||
                          !calendarDraft.title.trim() ||
                          !validWebsiteUrl(calendarDraft.websiteUrl)
                        }
                        onClick={importTournament}
                        type="button"
                      >
                        <Sparkles aria-hidden size={16} />
                        {importing
                          ? "Reading website…"
                          : "Import details with AI"}
                      </button>
                    </div>
                    {calendarDraft.websiteUrl &&
                      !validWebsiteUrl(calendarDraft.websiteUrl) && (
                        <small>
                          Enter a complete public http or https address.
                        </small>
                      )}
                  </label>
                </div>
              )}

              <fieldset className="training-tournament-types">
                <legend>What level is it?</legend>
                <div>
                  {tournamentTypes.map(([value, label]) => (
                    <button
                      aria-pressed={calendarDraft.tournamentType === value}
                      className={
                        calendarDraft.tournamentType === value
                          ? "active"
                          : undefined
                      }
                      key={value}
                      onClick={() =>
                        updateCalendarDraft({ tournamentType: value })
                      }
                      type="button"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>
            </section>
          )}

          <div className="training-calendar-composer__fields">
            <label className="wide">
              <span>
                {calendarDraft.kind === "tournament"
                  ? "Calendar title"
                  : "Name"}
              </span>
              <input
                minLength={2}
                onChange={(event) =>
                  updateCalendarDraft({ title: event.target.value })
                }
                placeholder="Name this calendar item"
                required
                value={calendarDraft.title}
              />
            </label>
            <label>
              <span>Starts</span>
              <input
                max={programEndDate}
                min={programStartDate}
                onChange={(event) =>
                  updateCalendarDraft({ startsOn: event.target.value })
                }
                required
                type="date"
                value={calendarDraft.startsOn}
              />
            </label>
            <label>
              <span>At</span>
              <input
                onChange={(event) =>
                  updateCalendarDraft({ startsAt: event.target.value })
                }
                required
                type="time"
                value={calendarDraft.startsAt}
              />
            </label>
            <label>
              <span>Ends</span>
              <input
                max={programEndDate}
                min={calendarDraft.startsOn}
                onChange={(event) =>
                  updateCalendarDraft({ endsOn: event.target.value })
                }
                required
                type="date"
                value={calendarDraft.endsOn}
              />
            </label>
            <label>
              <span>At</span>
              <input
                onChange={(event) =>
                  updateCalendarDraft({ endsAt: event.target.value })
                }
                required
                type="time"
                value={calendarDraft.endsAt}
              />
            </label>
            <label className="training-calendar-composer__load">
              <span>Estimated load · {calendarDraft.plannedLoad}</span>
              <input
                max="100"
                min="0"
                onChange={(event) =>
                  updateCalendarDraft({
                    plannedLoad: Number(event.target.value),
                  })
                }
                type="range"
                value={calendarDraft.plannedLoad}
              />
            </label>
            <label className="wide">
              <span>Coach notes · optional</span>
              <textarea
                maxLength={2_000}
                onChange={(event) =>
                  updateCalendarDraft({ notes: event.target.value })
                }
                placeholder="Arrival windows, preparation, objectives, recovery guidance, or what the team should know…"
                rows={3}
                value={calendarDraft.notes}
              />
            </label>
          </div>
          <footer>
            <span>
              <Clock3 aria-hidden size={16} /> All times use {programTimezone}
            </span>
            <button
              className="hq-button hq-button--primary"
              disabled={saving}
              type="submit"
            >
              <Plus aria-hidden size={16} />
              {saving
                ? "Adding…"
                : `Add ${itemKinds.find((item) => item.kind === calendarDraft.kind)?.label ?? "item"}`}
            </button>
          </footer>
        </form>
      )}
      <div className="training-program-schedule-editor__events">
        {events.length === 0 && (
          <div className="training-program-schedule-editor__empty">
            <CalendarPlus aria-hidden size={20} />
            <span>
              <strong>No calendar items yet.</strong>
              <small>
                Add the first session, tournament, travel day, assessment, or
                break.
              </small>
            </span>
          </div>
        )}
        {events.map((event) => {
          const draft = draftFor(event);
          const isEditing = editingEventId === event.id;
          const canEdit = !readOnly && event.status !== "completed";
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
                <span>
                  {event.kind === "rest"
                    ? "break"
                    : event.kind.replace("-", " ")}
                  {event.calendarDetails?.tournamentType
                    ? ` · ${event.calendarDetails.tournamentType}`
                    : ""}
                </span>
                <h3>{event.title}</h3>
                <p>
                  {formatEventDate(event)} ·{" "}
                  {new Date(event.startsAt).toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                    timeZone: event.timezone,
                  })}
                </p>
                {(event.calendarDetails?.venueName ||
                  event.calendarDetails?.address) && (
                  <p className="training-program-schedule-editor__location">
                    <MapPin aria-hidden size={13} />
                    {[
                      event.calendarDetails.venueName,
                      event.calendarDetails.address,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
                {event.calendarDetails?.summary && (
                  <p className="training-program-schedule-editor__summary">
                    {event.calendarDetails.summary}
                  </p>
                )}
                {(event.calendarDetails?.dunaTournamentHref ||
                  event.calendarDetails?.websiteUrl) && (
                  <a
                    href={
                      event.calendarDetails.dunaTournamentHref ??
                      event.calendarDetails.websiteUrl
                    }
                    rel={
                      event.calendarDetails.websiteUrl
                        ? "noreferrer"
                        : undefined
                    }
                    target={
                      event.calendarDetails.websiteUrl ? "_blank" : undefined
                    }
                  >
                    Tournament details <ExternalLink aria-hidden size={12} />
                  </a>
                )}
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
                {isEditing
                  ? "Done"
                  : canEdit
                    ? "Edit"
                    : readOnly
                      ? "Archived"
                      : "Recorded"}
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
                      max="20160"
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
                    <button
                      className="hq-button hq-button--secondary training-program-schedule-editor__remove"
                      disabled={saving}
                      onClick={() => removeEvent(event)}
                      type="button"
                    >
                      <Trash2 aria-hidden size={16} /> Remove item
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
