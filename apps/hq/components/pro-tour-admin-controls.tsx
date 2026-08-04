"use client";

import type { SandDataOverview } from "@duna/api";
import type { PersonSummary } from "@duna/core";
import { Badge, Numeric } from "@duna/ui";
import {
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  LoaderCircle,
  MapPin,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Trophy,
  Tv,
  UsersRound,
} from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import {
  linkSandPlayerAction,
  refreshAvpLeagueAction,
  refreshFivbIndexAction,
  removeProfessionalWatchOptionAction,
  saveAvpRosterAssignmentAction,
  saveProfessionalWatchOptionAction,
  type SandActionState,
} from "@/app/admin/sand-actions";
import { PlayerCombobox, type PlayerComboboxOption } from "./player-combobox";
import {
  eventBroadcastCoverage,
  filterProfessionalEvents,
  professionalEventTour,
  type ProfessionalEvent,
  type ProfessionalStatusFilter,
  type ProfessionalTourFilter,
} from "./pro-tour-admin-helpers";

const initialState: SandActionState = { status: "idle", message: "" };
const webOrigin =
  process.env.NEXT_PUBLIC_DUNA_WEB_URL?.replace(/\/$/, "") ??
  "https://duna.coach";

type AvpTeam = SandDataOverview["avpTeams"][number];
type WatchOption = ProfessionalEvent["watchOptions"][number];

function playerOptions(
  players: readonly PersonSummary[],
): readonly PlayerComboboxOption[] {
  return players.map((player) => ({
    id: player.id,
    displayName: player.displayName,
    handle: player.handle,
    isProfessional: player.isProfessional,
    profileClaimStatus: player.profileClaimStatus,
    rating: player.rating.display,
  }));
}

function ActionFeedback({ state }: { readonly state: SandActionState }) {
  if (state.status === "idle") return null;
  return (
    <p className={`sand-action-feedback sand-action-feedback--${state.status}`}>
      {state.status === "success" ? (
        <CheckCircle2 aria-hidden size={15} />
      ) : (
        <CircleAlert aria-hidden size={15} />
      )}
      {state.message}
    </p>
  );
}

function dateLabel(value?: string) {
  if (!value) return "Date pending";
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

function dateRange(event: ProfessionalEvent) {
  if (!event.startsOn) return "Date pending";
  if (!event.endsOn || event.endsOn === event.startsOn) {
    return dateLabel(event.startsOn);
  }
  return `${dateLabel(event.startsOn)} – ${dateLabel(event.endsOn)}`;
}

function syncedLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function eventTone(
  event: ProfessionalEvent,
): "neutral" | "positive" | "warning" {
  if (event.live || event.status === "live") return "positive";
  if (event.status === "upcoming") return "warning";
  return "neutral";
}

function eventTourLabel(event: ProfessionalEvent) {
  return professionalEventTour(event) === "avp" ? "AVP" : "FIVB";
}

function FivbRefreshForm() {
  const [state, action, pending] = useActionState(
    refreshFivbIndexAction,
    initialState,
  );
  return (
    <form action={action} className="pro-admin-sync-form">
      <label>
        <span>FIVB season</span>
        <input
          defaultValue={new Date().getUTCFullYear()}
          name="season"
          type="number"
        />
      </label>
      <button className="hq-button hq-button--primary" disabled={pending}>
        {pending ? (
          <LoaderCircle className="spin" size={16} />
        ) : (
          <RefreshCw size={16} />
        )}
        Refresh schedule + event details
      </button>
      <ActionFeedback state={state} />
    </form>
  );
}

function AvpRefreshForm({ season }: { readonly season: number }) {
  const [state, action, pending] = useActionState(
    refreshAvpLeagueAction,
    initialState,
  );
  return (
    <form action={action} className="pro-admin-sync-form">
      <label>
        <span>AVP League season</span>
        <input defaultValue={season} name="season" type="number" />
      </label>
      <button className="hq-button hq-button--primary" disabled={pending}>
        {pending ? (
          <LoaderCircle className="spin" size={16} />
        ) : (
          <RefreshCw size={16} />
        )}
        Refresh teams, standings + matches
      </button>
      <ActionFeedback state={state} />
    </form>
  );
}

function ProfessionalSyncControls({
  currentAvpSeason,
  data,
}: {
  readonly currentAvpSeason: number;
  readonly data: SandDataOverview;
}) {
  const fivbSource = data.sources.find(
    (source) => source.slug === "fivb-12ndr",
  );
  const avpSource = data.sources.find((source) => source.slug === "avp-league");
  return (
    <section className="hq-card pro-admin-sync" id="source-sync">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Source control</span>
          <h2>Refresh professional data</h2>
        </div>
        <RefreshCw aria-hidden size={20} />
      </header>
      <p>
        Pull the official source first. Duna preserves reviewed player mappings,
        substitutions, and broadcast guidance across later syncs.
      </p>
      <div className="pro-admin-sync__grid">
        <article>
          <span className="pro-admin-source-mark">VW</span>
          <div>
            <strong>Volleyball World Beach Pro Tour</strong>
            <small>
              {fivbSource?.latestImportedAt
                ? `Last import ${syncedLabel(fivbSource.latestImportedAt)}`
                : "No completed import"}
            </small>
          </div>
          <FivbRefreshForm />
        </article>
        <article>
          <span className="pro-admin-source-mark pro-admin-source-mark--avp">
            AVP
          </span>
          <div>
            <strong>AVP League</strong>
            <small>
              {avpSource?.latestImportedAt
                ? `Last import ${syncedLabel(avpSource.latestImportedAt)}`
                : "No completed import"}
            </small>
          </div>
          <AvpRefreshForm season={currentAvpSeason} />
        </article>
      </div>
    </section>
  );
}

function EventFilters({
  query,
  setQuery,
  setStatus,
  setTour,
  status,
  tour,
}: {
  readonly query: string;
  readonly setQuery: (value: string) => void;
  readonly setStatus: (value: ProfessionalStatusFilter) => void;
  readonly setTour: (value: ProfessionalTourFilter) => void;
  readonly status: ProfessionalStatusFilter;
  readonly tour: ProfessionalTourFilter;
}) {
  return (
    <div className="pro-admin-event-filters">
      <label className="pro-admin-event-search">
        <Search aria-hidden size={16} />
        <input
          aria-label="Find a professional event"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find by event, location, tcode, or source…"
          type="search"
          value={query}
        />
      </label>
      <label>
        <span>Tour</span>
        <select
          onChange={(event) =>
            setTour(event.target.value as ProfessionalTourFilter)
          }
          value={tour}
        >
          <option value="all">All tours</option>
          <option value="fivb">FIVB</option>
          <option value="avp">AVP League</option>
        </select>
      </label>
      <label>
        <span>Status</span>
        <select
          onChange={(event) =>
            setStatus(event.target.value as ProfessionalStatusFilter)
          }
          value={status}
        >
          <option value="active">Live + upcoming</option>
          <option value="live">Live</option>
          <option value="upcoming">Upcoming</option>
          <option value="completed">Completed</option>
          <option value="all">All statuses</option>
        </select>
      </label>
    </div>
  );
}

function SyncedEventCard({
  event,
  onManageBroadcast,
}: {
  readonly event: ProfessionalEvent;
  readonly onManageBroadcast: (eventId: string) => void;
}) {
  const coverage = eventBroadcastCoverage(event);
  return (
    <article className="pro-admin-event-card">
      <header>
        <span>
          <Badge tone={eventTone(event)}>
            {event.live ? "live" : event.status}
          </Badge>
          <Badge>{eventTourLabel(event)}</Badge>
        </span>
        <small>{event.externalEventId}</small>
      </header>
      <div className="pro-admin-event-card__body">
        <div>
          <h3>{event.name}</h3>
          <p>
            <CalendarDays aria-hidden size={14} /> {dateRange(event)}
          </p>
          <p>
            <MapPin aria-hidden size={14} />{" "}
            {event.location ?? "Location pending"}
          </p>
        </div>
        <dl>
          <div>
            <dt>Teams</dt>
            <dd>{event.teamCount}</dd>
          </div>
          <div>
            <dt>Matches</dt>
            <dd>{event.matchCount}</dd>
          </div>
          <div>
            <dt>Watch</dt>
            <dd>{coverage.configured ? "Set" : "—"}</dd>
          </div>
        </dl>
      </div>
      <div className="pro-admin-event-card__coverage">
        <span>
          <Tv aria-hidden size={15} />
          <strong>
            {coverage.defaults} event default
            {coverage.defaults === 1 ? "" : "s"}
          </strong>
          <small>
            {coverage.matchOverrides} match override
            {coverage.matchOverrides === 1 ? "" : "s"}
          </small>
        </span>
        <small>Synced {syncedLabel(event.lastSyncedAt)}</small>
      </div>
      <footer>
        <button
          className="hq-button hq-button--primary"
          onClick={() => onManageBroadcast(event.id)}
          type="button"
        >
          <Tv aria-hidden size={15} /> Manage How to Watch
        </button>
        <a
          className="hq-button hq-button--secondary"
          href={`${webOrigin}${event.publicPath}`}
          rel="noreferrer"
          target="_blank"
        >
          Public page <ArrowUpRight aria-hidden size={14} />
        </a>
        <a href={event.sourceUrl} rel="noreferrer" target="_blank">
          Source <ExternalLink aria-hidden size={13} />
        </a>
      </footer>
    </article>
  );
}

function SyncedEvents({
  events,
  onManageBroadcast,
}: {
  readonly events: SandDataOverview["events"];
  readonly onManageBroadcast: (eventId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [tour, setTour] = useState<ProfessionalTourFilter>("all");
  const [status, setStatus] = useState<ProfessionalStatusFilter>("active");
  const filtered = useMemo(
    () => filterProfessionalEvents(events, { query, status, tour }),
    [events, query, status, tour],
  );
  return (
    <section className="hq-card pro-admin-events" id="synced-events">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Published inventory</span>
          <h2>Synced professional events</h2>
        </div>
        <Badge>{filtered.length}</Badge>
      </header>
      <p>
        Review what Duna received, open the public event, or jump directly into
        its event-level and match-level broadcast settings.
      </p>
      <EventFilters
        query={query}
        setQuery={setQuery}
        setStatus={setStatus}
        setTour={setTour}
        status={status}
        tour={tour}
      />
      <div className="pro-admin-event-grid">
        {filtered.slice(0, 40).map((event) => (
          <SyncedEventCard
            event={event}
            key={event.id}
            onManageBroadcast={onManageBroadcast}
          />
        ))}
      </div>
      {filtered.length === 0 && (
        <p className="hq-empty">No synced events match these filters.</p>
      )}
      {filtered.length > 40 && (
        <small className="pro-admin-more">
          Showing 40 events. Narrow the search to find an older event.
        </small>
      )}
    </section>
  );
}

function WatchOptionRow({
  eventId,
  importedMatchId,
  option,
}: {
  readonly eventId: string;
  readonly importedMatchId?: string;
  readonly option: WatchOption;
}) {
  const [state, action, pending] = useActionState(
    removeProfessionalWatchOptionAction,
    initialState,
  );
  return (
    <article className="pro-admin-watch-option">
      <span className="pro-admin-watch-option__icon">
        <Tv aria-hidden size={16} />
      </span>
      <span>
        <strong>{option.label}</strong>
        <small>{option.channelName ?? option.kind}</small>
      </span>
      {option.url && (
        <a href={option.url} rel="noreferrer" target="_blank">
          Open <ExternalLink aria-hidden size={13} />
        </a>
      )}
      <details>
        <summary aria-label={`Remove ${option.label}`}>
          <Trash2 aria-hidden size={14} />
        </summary>
        <form action={action}>
          <input name="professionalEventId" type="hidden" value={eventId} />
          {importedMatchId && (
            <input
              name="importedMatchId"
              type="hidden"
              value={importedMatchId}
            />
          )}
          <input name="optionId" type="hidden" value={option.id} />
          <input
            aria-label="Removal reason"
            name="reason"
            placeholder="Why is this being removed?"
            required
          />
          <button disabled={pending}>Remove</button>
        </form>
      </details>
      <ActionFeedback state={state} />
    </article>
  );
}

function BroadcastWorkspace({
  events,
  selectedEventId,
  setSelectedEventId,
}: {
  readonly events: SandDataOverview["events"];
  readonly selectedEventId: string;
  readonly setSelectedEventId: (value: string) => void;
}) {
  const [state, action, pending] = useActionState(
    saveProfessionalWatchOptionAction,
    initialState,
  );
  const [kind, setKind] = useState<"live-tv" | "vbtv" | "youtube">("vbtv");
  const selectedEvent =
    events.find((event) => event.id === selectedEventId) ?? events[0];
  const orderedEvents = useMemo(
    () =>
      filterProfessionalEvents(events, {
        query: "",
        status: "all",
        tour: "all",
      }),
    [events],
  );
  return (
    <section className="hq-card pro-admin-broadcast" id="broadcast-guide">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Published broadcast guide</span>
          <h2>How to Watch</h2>
        </div>
        <Radio aria-hidden size={20} />
      </header>
      <p>
        Event defaults appear on every match. Choose a match only when that
        court has its own YouTube link or television channel.
      </p>
      <label className="pro-admin-event-picker">
        <span>Professional event</span>
        <select
          onChange={(event) => setSelectedEventId(event.target.value)}
          value={selectedEvent?.id ?? ""}
        >
          {orderedEvents.map((event) => (
            <option key={event.id} value={event.id}>
              {eventTourLabel(event)} · {event.name} ·{" "}
              {dateLabel(event.startsOn)}
            </option>
          ))}
        </select>
      </label>
      {selectedEvent ? (
        <div className="pro-admin-broadcast__workspace">
          <aside>
            <Badge tone={eventTone(selectedEvent)}>
              {selectedEvent.status}
            </Badge>
            <span className="hq-eyebrow">Selected event</span>
            <h3>{selectedEvent.name}</h3>
            <p>{dateRange(selectedEvent)}</p>
            <p>{selectedEvent.location ?? "Location pending"}</p>
            <dl>
              <div>
                <dt>Event defaults</dt>
                <dd>{selectedEvent.watchOptions.length}</dd>
              </div>
              <div>
                <dt>Match overrides</dt>
                <dd>
                  {
                    selectedEvent.matches.filter(
                      (match) => match.watchOptions.length > 0,
                    ).length
                  }
                </dd>
              </div>
            </dl>
          </aside>
          <div>
            <form action={action} className="pro-admin-watch-form">
              <input
                name="professionalEventId"
                type="hidden"
                value={selectedEvent.id}
              />
              <label>
                <span>Coverage applies to</span>
                <select name="importedMatchId">
                  <option value="">Entire event (default)</option>
                  {selectedEvent.matches.map((match) => (
                    <option key={match.id} value={match.id}>
                      {match.roundLabel ?? match.label} · {match.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Destination</span>
                <select
                  name="kind"
                  onChange={(event) =>
                    setKind(
                      event.target.value as "live-tv" | "vbtv" | "youtube",
                    )
                  }
                  value={kind}
                >
                  <option value="vbtv">VBTV</option>
                  <option value="youtube">YouTube</option>
                  <option value="live-tv">Live TV</option>
                </select>
              </label>
              <label>
                <span>Display label</span>
                <input
                  name="label"
                  placeholder={
                    kind === "live-tv"
                      ? "e.g. Center Court on ESPN2"
                      : kind === "youtube"
                        ? "e.g. Court 2 live stream"
                        : "e.g. Watch live on VBTV"
                  }
                />
              </label>
              <label>
                <span>
                  {kind === "youtube" ? "YouTube link" : "Watch link"}
                </span>
                <input
                  name="url"
                  placeholder="https://…"
                  required={kind === "youtube"}
                  type="url"
                />
              </label>
              <label>
                <span>TV channel</span>
                <input
                  disabled={kind !== "live-tv"}
                  name="channelName"
                  placeholder="e.g. ESPN2"
                  required={kind === "live-tv"}
                />
              </label>
              <label className="pro-admin-watch-form__reason">
                <span>Review note</span>
                <input
                  name="reason"
                  placeholder="Source and reason for this broadcast update"
                  required
                />
              </label>
              <button
                className="hq-button hq-button--primary"
                disabled={pending}
              >
                {pending ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  <Tv size={16} />
                )}
                Publish watch option
              </button>
              <ActionFeedback state={state} />
            </form>

            <div className="pro-admin-watch-list">
              <section>
                <header>
                  <strong>Event defaults</strong>
                  <Badge>{selectedEvent.watchOptions.length}</Badge>
                </header>
                {selectedEvent.watchOptions.map((option) => (
                  <WatchOptionRow
                    eventId={selectedEvent.id}
                    key={option.id}
                    option={option}
                  />
                ))}
                {selectedEvent.watchOptions.length === 0 && (
                  <p className="hq-empty">
                    No event-level destination configured.
                  </p>
                )}
              </section>
              {selectedEvent.matches
                .filter((match) => match.watchOptions.length > 0)
                .map((match) => (
                  <section key={match.id}>
                    <header>
                      <span>
                        <small>Match override</small>
                        <strong>{match.roundLabel ?? match.label}</strong>
                      </span>
                      <Badge>{match.watchOptions.length}</Badge>
                    </header>
                    {match.watchOptions.map((option) => (
                      <WatchOptionRow
                        eventId={selectedEvent.id}
                        importedMatchId={match.id}
                        key={option.id}
                        option={option}
                      />
                    ))}
                  </section>
                ))}
            </div>
          </div>
        </div>
      ) : (
        <p className="hq-empty">Sync a professional event to begin.</p>
      )}
    </section>
  );
}

function AvpRosterEditor({
  players,
  team,
}: {
  readonly players: readonly PersonSummary[];
  readonly team: AvpTeam;
}) {
  const firstUnmapped =
    team.players.find((player) => !player.mappedPlayer) ?? team.players[0];
  const [selectedExternalPersonId, setSelectedExternalPersonId] = useState(
    firstUnmapped?.externalPersonId ?? "",
  );
  const selectedRosterPlayer =
    team.players.find(
      (player) => player.externalPersonId === selectedExternalPersonId,
    ) ?? team.players[0];
  const [displayName, setDisplayName] = useState(
    selectedRosterPlayer?.displayName ?? "",
  );
  const [role, setRole] = useState<"starter" | "substitute">("starter");
  const [state, action, pending] = useActionState(
    saveAvpRosterAssignmentAction,
    initialState,
  );
  const chooseRosterPlayer = (externalPersonId: string) => {
    const player = team.players.find(
      (candidate) => candidate.externalPersonId === externalPersonId,
    );
    setSelectedExternalPersonId(externalPersonId);
    setDisplayName(player?.displayName ?? "");
    setRole("starter");
  };
  return (
    <section className="pro-admin-roster-editor">
      <header>
        <div>
          <span className="hq-eyebrow">Roster identity editor</span>
          <h3>
            {team.teamName} · {team.gender}
          </h3>
        </div>
        <Badge>{team.season}</Badge>
      </header>
      <div className="pro-admin-roster-editor__players">
        {team.players.map((player) => (
          <button
            className={
              player.externalPersonId === selectedRosterPlayer?.externalPersonId
                ? "active"
                : undefined
            }
            key={player.externalPersonId}
            onClick={() => chooseRosterPlayer(player.externalPersonId)}
            type="button"
          >
            <span>
              <strong>{player.displayName}</strong>
              <small>
                {player.mappedPlayer
                  ? `Mapped to ${player.mappedPlayer.displayName}`
                  : "Needs a Duna player"}
              </small>
            </span>
            {player.mappedPlayer ? (
              <CheckCircle2 aria-label="Mapped" size={16} />
            ) : (
              <CircleAlert aria-label="Needs mapping" size={16} />
            )}
          </button>
        ))}
      </div>
      <form action={action}>
        <input
          name="team"
          type="hidden"
          value={`${team.season}|${team.gender}|${team.teamName}`}
        />
        <label>
          <span>AVP source roster name</span>
          <input
            name="displayName"
            onChange={(event) => setDisplayName(event.target.value)}
            required
            value={displayName}
          />
        </label>
        <PlayerCombobox
          autoOpenOnSearchHint={false}
          currentOption={
            role === "starter" ? selectedRosterPlayer?.mappedPlayer : undefined
          }
          initialOptions={playerOptions(players)}
          key={`${team.key}:${selectedRosterPlayer?.externalPersonId ?? "new"}:${role}`}
          label="Canonical Duna player"
          searchHint={displayName}
        />
        <label>
          <span>Assignment</span>
          <select
            name="role"
            onChange={(event) =>
              setRole(event.target.value as "starter" | "substitute")
            }
            value={role}
          >
            <option value="starter">Season roster</option>
            <option value="substitute">Date-bounded substitute</option>
          </select>
        </label>
        <label>
          <span>Replaces</span>
          <select
            disabled={role !== "substitute"}
            name="replacesExternalPersonId"
            required={role === "substitute"}
          >
            <option value="">Choose roster slot</option>
            {team.players.map((player) => (
              <option
                key={player.externalPersonId}
                value={player.externalPersonId}
              >
                {player.displayName}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Starts</span>
          <input name="effectiveFrom" type="date" />
        </label>
        <label>
          <span>Ends</span>
          <input name="effectiveTo" type="date" />
        </label>
        <label className="pro-admin-roster-editor__reason">
          <span>Review note</span>
          <input
            name="reason"
            placeholder="Evidence for this season mapping or substitution"
            required
          />
        </label>
        <button className="hq-button hq-button--primary" disabled={pending}>
          {pending ? (
            <LoaderCircle className="spin" size={16} />
          ) : (
            <ShieldCheck size={16} />
          )}
          {selectedRosterPlayer?.mappedPlayer
            ? "Save mapping change"
            : "Save player mapping"}
        </button>
        <ActionFeedback state={state} />
      </form>
    </section>
  );
}

function AvpTeamCard({
  active,
  onSelect,
  team,
}: {
  readonly active: boolean;
  readonly onSelect: () => void;
  readonly team: AvpTeam;
}) {
  const mapped = team.players.filter((player) => player.mappedPlayer).length;
  return (
    <button
      className={`pro-admin-team-card${active ? " active" : ""}`}
      onClick={onSelect}
      type="button"
    >
      <header>
        <span>
          <Badge>{team.gender}</Badge>
          {team.standing.rank && <Badge>#{team.standing.rank}</Badge>}
        </span>
        <strong>
          {mapped}/{team.players.length} mapped
        </strong>
      </header>
      <h3>{team.teamName}</h3>
      <p>{team.players.map((player) => player.displayName).join(" / ")}</p>
      <dl>
        <div>
          <dt>W–L</dt>
          <dd>
            {team.standing.wins ?? 0}–{team.standing.losses ?? 0}
          </dd>
        </div>
        <div>
          <dt>Points</dt>
          <dd>{team.standing.matchPoints ?? 0}</dd>
        </div>
        <div>
          <dt>Win %</dt>
          <dd>
            {team.standing.winPercentage !== undefined
              ? `${team.standing.winPercentage.toFixed(1)}%`
              : "—"}
          </dd>
        </div>
      </dl>
    </button>
  );
}

function AvpLeagueWorkspace({
  data,
  players,
}: {
  readonly data: SandDataOverview;
  readonly players: readonly PersonSummary[];
}) {
  const seasons = useMemo(
    () =>
      [...new Set(data.avpTeams.map((team) => team.season))].sort(
        (a, b) => b - a,
      ),
    [data.avpTeams],
  );
  const [season, setSeason] = useState(
    seasons[0] ?? new Date().getUTCFullYear(),
  );
  const [gender, setGender] = useState<"all" | "men" | "women">("all");
  const [selectedTeamKey, setSelectedTeamKey] = useState(
    data.avpTeams.find((team) => team.season === season)?.key ?? "",
  );
  const visibleTeams = data.avpTeams.filter(
    (team) =>
      team.season === season && (gender === "all" || team.gender === gender),
  );
  const selectedTeam =
    visibleTeams.find((team) => team.key === selectedTeamKey) ??
    visibleTeams[0];
  return (
    <section className="hq-card pro-admin-avp" id="avp-league">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Seasonal league control</span>
          <h2>AVP teams + player assignments</h2>
        </div>
        <UsersRound aria-hidden size={20} />
      </header>
      <p>
        Choose a season and team, then map every AVP roster name to one Duna
        player. Saving an existing row edits that season’s mapping;
        substitutions can be limited to an exact date range and roster slot.
      </p>
      {seasons.length > 0 ? (
        <>
          <div className="pro-admin-avp__filters">
            <label>
              <span>Season</span>
              <select
                onChange={(event) => setSeason(Number(event.target.value))}
                value={season}
              >
                {seasons.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>
            <div aria-label="Filter AVP teams by gender" role="group">
              {(["all", "women", "men"] as const).map((value) => (
                <button
                  className={gender === value ? "active" : undefined}
                  key={value}
                  onClick={() => setGender(value)}
                  type="button"
                >
                  {value === "all" ? "All teams" : value}
                </button>
              ))}
            </div>
            <Badge>{visibleTeams.length} team rosters</Badge>
          </div>
          <div className="pro-admin-avp__workspace">
            <div className="pro-admin-team-grid">
              {visibleTeams.map((team) => (
                <AvpTeamCard
                  active={team.key === selectedTeam?.key}
                  key={team.key}
                  onSelect={() => setSelectedTeamKey(team.key)}
                  team={team}
                />
              ))}
            </div>
            {selectedTeam && (
              <AvpRosterEditor
                key={selectedTeam.key}
                players={players}
                team={selectedTeam}
              />
            )}
          </div>
        </>
      ) : (
        <p className="hq-empty">
          No AVP season has been synced. Use “Refresh teams, standings +
          matches” above first.
        </p>
      )}
    </section>
  );
}

function AvpIdentityQueue({
  data,
  players,
}: {
  readonly data: SandDataOverview;
  readonly players: readonly PersonSummary[];
}) {
  const mappings = data.mappings.filter(
    (mapping) =>
      mapping.source.toLowerCase().includes("avp") ||
      Boolean(mapping.sourceContext.teamName),
  );
  return (
    <section className="hq-card pro-admin-identity-queue" id="avp-identities">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Substitutions + source names</span>
          <h2>AVP identities needing review</h2>
        </div>
        <Badge tone={mappings.length ? "warning" : "positive"}>
          {mappings.length}
        </Badge>
      </header>
      <p>
        These AVP names could not be inferred safely from prior seasons. Map
        them here; high-confidence identities are linked automatically.
      </p>
      <div>
        {mappings.map((mapping) => (
          <AvpIdentityForm
            key={mapping.id}
            mapping={mapping}
            players={players}
          />
        ))}
      </div>
      {mappings.length === 0 && (
        <p className="hq-empty">Every AVP source identity is resolved.</p>
      )}
    </section>
  );
}

function AvpIdentityForm({
  mapping,
  players,
}: {
  readonly mapping: SandDataOverview["mappings"][number];
  readonly players: readonly PersonSummary[];
}) {
  const [state, action, pending] = useActionState(
    linkSandPlayerAction,
    initialState,
  );
  return (
    <article className="pro-admin-identity-row">
      <span>
        <strong>{mapping.displayName}</strong>
        <small>
          {mapping.sourceContext.season ?? "Season pending"} ·{" "}
          {mapping.sourceContext.teamName ?? mapping.source} ·{" "}
          {mapping.sourceContext.gender ?? "AVP"}
        </small>
      </span>
      <form action={action}>
        <input name="externalProfileId" type="hidden" value={mapping.id} />
        <PlayerCombobox
          autoOpenOnSearchHint={false}
          initialOptions={playerOptions(players)}
          label="Duna player"
          searchHint={mapping.displayName}
        />
        <input
          name="reason"
          placeholder="Evidence reviewed for this AVP identity"
          required
        />
        <button className="hq-button hq-button--primary" disabled={pending}>
          {pending ? (
            <LoaderCircle className="spin" size={15} />
          ) : (
            <ShieldCheck size={15} />
          )}
          Confirm mapping
        </button>
        <ActionFeedback state={state} />
      </form>
    </article>
  );
}

export function ProfessionalTourAdminPanel({
  data,
  players,
}: {
  readonly data: SandDataOverview;
  readonly players: readonly PersonSummary[];
}) {
  const initialEvent =
    data.events.find((event) => event.live) ??
    data.events.find((event) => event.status === "upcoming") ??
    data.events[0];
  const [selectedEventId, setSelectedEventId] = useState(
    initialEvent?.id ?? "",
  );
  const currentAvpSeason =
    Math.max(
      new Date().getUTCFullYear(),
      ...data.avpTeams.map((team) => team.season),
    ) || new Date().getUTCFullYear();
  const watchConfigured = data.events.filter(
    (event) => eventBroadcastCoverage(event).configured,
  ).length;
  const mappedAvpPlayers = new Set(
    data.avpTeams.flatMap((team) =>
      team.players.flatMap((player) =>
        player.mappedPlayer ? [player.externalPersonId] : [],
      ),
    ),
  ).size;
  const allAvpPlayers = new Set(
    data.avpTeams.flatMap((team) =>
      team.players.map((player) => player.externalPersonId),
    ),
  ).size;

  const manageBroadcast = (eventId: string) => {
    setSelectedEventId(eventId);
    window.requestAnimationFrame(() =>
      document
        .getElementById("broadcast-guide")
        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };

  return (
    <div className="pro-admin-layout">
      <nav aria-label="Professional operations" className="pro-admin-jump-nav">
        <a href="#synced-events">
          <CalendarDays aria-hidden size={16} /> Events
        </a>
        <a href="#broadcast-guide">
          <Tv aria-hidden size={16} /> How to Watch
        </a>
        <a href="#avp-league">
          <Trophy aria-hidden size={16} /> AVP League
        </a>
        <a href="#avp-identities">
          <UsersRound aria-hidden size={16} /> Player mappings
        </a>
      </nav>

      <section className="pro-admin-metrics">
        <article>
          <small>Synced events</small>
          <Numeric>{data.events.length}</Numeric>
          <span>{data.events.filter((event) => event.live).length} live</span>
        </article>
        <article>
          <small>How to Watch</small>
          <Numeric>{watchConfigured}</Numeric>
          <span>events configured</span>
        </article>
        <article>
          <small>AVP roster teams</small>
          <Numeric>{data.avpTeams.length}</Numeric>
          <span>
            across {new Set(data.avpTeams.map((team) => team.season)).size}{" "}
            seasons
          </span>
        </article>
        <article>
          <small>AVP identities</small>
          <Numeric>
            {mappedAvpPlayers}/{allAvpPlayers}
          </Numeric>
          <span>mapped to Duna</span>
        </article>
      </section>

      <ProfessionalSyncControls
        currentAvpSeason={currentAvpSeason}
        data={data}
      />
      <SyncedEvents events={data.events} onManageBroadcast={manageBroadcast} />
      <BroadcastWorkspace
        events={data.events}
        selectedEventId={selectedEventId}
        setSelectedEventId={setSelectedEventId}
      />
      <AvpLeagueWorkspace data={data} players={players} />
      <AvpIdentityQueue data={data} players={players} />
    </div>
  );
}
