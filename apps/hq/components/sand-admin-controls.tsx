"use client";

import type { SandDataOverview } from "@duna/api";
import type { PersonSummary } from "@duna/core";
import { Badge, Numeric } from "@duna/ui";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Database,
  GitMerge,
  History,
  Link2,
  LoaderCircle,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  TriangleAlert,
  Trash2,
  Tv,
  UsersRound,
  Waves,
} from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import {
  approveSandMatchAction,
  evaluateRatingAction,
  importSandSourceAction,
  linkSandPlayerAction,
  mergeSandProfilesAction,
  refreshFivbIndexAction,
  refreshWorldRankingsAction,
  removeProfessionalWatchOptionAction,
  reviewMatchHistoryDisputeAction,
  reviewSandMatchAction,
  saveAvpRosterAssignmentAction,
  saveRatingConfigurationAction,
  saveProfessionalWatchOptionAction,
  type SandActionState,
} from "@/app/admin/sand-actions";
import { PlayerCombobox, type PlayerComboboxOption } from "./player-combobox";

const initialState: SandActionState = { status: "idle", message: "" };

function playerComboboxOptions(
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
        <TriangleAlert aria-hidden size={15} />
      )}
      {state.message}
    </p>
  );
}

function SourceImportForm() {
  const [state, action, pending] = useActionState(
    importSandSourceAction,
    initialState,
  );
  return (
    <form action={action} className="sand-import-form">
      <label>
        <span>Source</span>
        <select defaultValue="volleyball-life" name="source">
          <option value="volleyball-life">VolleyballLife player</option>
          <option value="bvbinfo">BVBInfo player</option>
          <option value="fivb-12ndr">FIVB event</option>
          <option value="avp-league">AVP League season</option>
        </select>
      </label>
      <label>
        <span>Player ID, event tcode, or source URL</span>
        <input
          name="externalId"
          placeholder="e.g. 653, MHAM2026, or 2026"
          required
        />
      </label>
      <button className="hq-button hq-button--primary" disabled={pending}>
        {pending ? (
          <LoaderCircle className="spin" size={16} />
        ) : (
          <Play size={16} />
        )}
        Run staged import
      </button>
      <ActionFeedback state={state} />
    </form>
  );
}

function RefreshFivbForm() {
  const [state, action, pending] = useActionState(
    refreshFivbIndexAction,
    initialState,
  );
  return (
    <form action={action} className="sand-mini-action">
      <input
        aria-label="FIVB season"
        defaultValue={new Date().getFullYear()}
        name="season"
        type="number"
      />
      <button disabled={pending}>
        <RefreshCw className={pending ? "spin" : undefined} size={15} />
        FIVB schedule + details
      </button>
      <ActionFeedback state={state} />
    </form>
  );
}

function RefreshRankingsForm() {
  const [state, action, pending] = useActionState(
    refreshWorldRankingsAction,
    initialState,
  );
  return (
    <form action={action} className="sand-mini-action">
      <button disabled={pending}>
        <RefreshCw className={pending ? "spin" : undefined} size={15} />
        World rankings
      </button>
      <ActionFeedback state={state} />
    </form>
  );
}

function MatchReview({
  match,
}: {
  readonly match: SandDataOverview["matches"][number];
}) {
  const [approval, approve, approving] = useActionState(
    approveSandMatchAction,
    initialState,
  );
  const [review, decide, deciding] = useActionState(
    reviewSandMatchAction,
    initialState,
  );
  const side = (name: "A" | "B") =>
    match.participants
      .filter((participant) => participant.side === name)
      .map((participant) => participant.name)
      .join(" / ");
  return (
    <article className="sand-match-row">
      <header>
        <div>
          <Badge
            tone={
              match.importState === "ready"
                ? "positive"
                : match.importState === "duplicate"
                  ? "warning"
                  : "neutral"
            }
          >
            {match.importState}
          </Badge>
          <small>{match.source}</small>
        </div>
        <time>
          {match.playedAt
            ? new Intl.DateTimeFormat("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              }).format(new Date(match.playedAt))
            : "Scheduled"}
        </time>
      </header>
      <h3>{match.title}</h3>
      <div className="sand-match-teams">
        <strong>{side("A")}</strong>
        <span>
          {match.sets.map((set) => `${set.a}–${set.b}`).join(" · ") || "TBD"}
        </span>
        <strong>{side("B")}</strong>
      </div>
      <div className="sand-match-actions">
        {match.importState === "ready" && (
          <form action={approve}>
            <input name="importedMatchId" type="hidden" value={match.id} />
            <input name="reason" placeholder="Approval reason" required />
            <button disabled={approving}>
              <ShieldCheck size={15} /> Approve + rate
            </button>
          </form>
        )}
        <form action={decide}>
          <input name="importedMatchId" type="hidden" value={match.id} />
          <select defaultValue="excluded" name="decision">
            <option value="excluded">Exclude</option>
            <option value="duplicate">Duplicate</option>
            <option value="rejected">Reject</option>
          </select>
          <input name="reason" placeholder="Review reason" required />
          <button disabled={deciding}>Save review</button>
        </form>
      </div>
      <ActionFeedback state={approval} />
      <ActionFeedback state={review} />
    </article>
  );
}

function BroadcastOption({
  eventId,
  importedMatchId,
  option,
}: {
  readonly eventId: string;
  readonly importedMatchId?: string;
  readonly option: SandDataOverview["events"][number]["watchOptions"][number];
}) {
  const [state, action, pending] = useActionState(
    removeProfessionalWatchOptionAction,
    initialState,
  );
  return (
    <article className="sand-watch-option">
      <Tv aria-hidden size={16} />
      <span>
        <strong>{option.label}</strong>
        <small>{option.channelName ?? option.kind}</small>
      </span>
      <form action={action}>
        <input name="professionalEventId" type="hidden" value={eventId} />
        {importedMatchId && (
          <input name="importedMatchId" type="hidden" value={importedMatchId} />
        )}
        <input name="optionId" type="hidden" value={option.id} />
        <input
          aria-label="Removal reason"
          name="reason"
          placeholder="Removal reason"
          required
        />
        <button aria-label={`Remove ${option.label}`} disabled={pending}>
          <Trash2 aria-hidden size={14} />
        </button>
      </form>
      <ActionFeedback state={state} />
    </article>
  );
}

function BroadcastConfiguration({
  events,
}: {
  readonly events: SandDataOverview["events"];
}) {
  const [state, action, pending] = useActionState(
    saveProfessionalWatchOptionAction,
    initialState,
  );
  const currentEvents = events
    .filter((event) => event.status !== "completed")
    .sort((a, b) =>
      (a.startsOn ?? "9999-12-31").localeCompare(b.startsOn ?? "9999-12-31"),
    )
    .slice(0, 20);
  return (
    <section className="hq-card sand-watch-config">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Super-admin broadcast guide</span>
          <h2>Where to watch</h2>
        </div>
        <Tv size={20} />
      </header>
      <p>
        Set an event default, or choose one match to replace the event guide
        with its own link or TV channel.
      </p>
      <form action={action} className="sand-watch-form">
        <label>
          <span>Event</span>
          <select name="professionalEventId" required>
            <option value="">Choose an upcoming event</option>
            {currentEvents.map((event) => (
              <option key={event.id} value={event.id}>
                {event.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Match override</span>
          <select name="importedMatchId">
            <option value="">Use as event default</option>
            {currentEvents.flatMap((event) =>
              event.matches.map((match) => (
                <option key={match.id} value={`${event.id}:${match.id}`}>
                  {event.name} · {match.roundLabel ?? match.label}
                </option>
              )),
            )}
          </select>
        </label>
        <label>
          <span>Destination</span>
          <select defaultValue="vbtv" name="kind">
            <option value="vbtv">VBTV</option>
            <option value="youtube">YouTube</option>
            <option value="live-tv">Live TV</option>
          </select>
        </label>
        <label>
          <span>Display label</span>
          <input name="label" placeholder="e.g. Center Court on VBTV" />
        </label>
        <label>
          <span>Link</span>
          <input name="url" placeholder="https://…" type="url" />
        </label>
        <label>
          <span>TV channel</span>
          <input name="channelName" placeholder="e.g. ESPN2" />
        </label>
        <label className="sand-watch-form__reason">
          <span>Review note</span>
          <input
            name="reason"
            placeholder="Source and reason for this broadcast update"
            required
          />
        </label>
        <button className="hq-button hq-button--primary" disabled={pending}>
          Add watch option
        </button>
        <ActionFeedback state={state} />
      </form>
      <div className="sand-watch-events">
        {currentEvents
          .filter(
            (event) =>
              event.watchOptions.length > 0 ||
              event.matches.some((match) => match.watchOptions.length > 0),
          )
          .map((event) => (
            <section key={event.id}>
              <header>
                <strong>{event.name}</strong>
                <small>
                  {event.watchOptions.length} default ·{" "}
                  {
                    event.matches.filter(
                      (match) => match.watchOptions.length > 0,
                    ).length
                  }{" "}
                  match overrides
                </small>
              </header>
              {event.watchOptions.map((option) => (
                <BroadcastOption
                  eventId={event.id}
                  key={option.id}
                  option={option}
                />
              ))}
              {event.matches.flatMap((match) =>
                match.watchOptions.map((option) => (
                  <div className="sand-watch-match" key={option.id}>
                    <small>{match.roundLabel ?? match.label}</small>
                    <BroadcastOption
                      eventId={event.id}
                      importedMatchId={match.id}
                      option={option}
                    />
                  </div>
                )),
              )}
            </section>
          ))}
      </div>
    </section>
  );
}

function HistoryDisputeReview({
  dispute,
}: {
  readonly dispute: SandDataOverview["historyDisputes"][number];
}) {
  const [state, action, pending] = useActionState(
    reviewMatchHistoryDisputeAction,
    initialState,
  );
  return (
    <article className="sand-history-dispute">
      <header>
        <span>
          <Badge tone="warning">
            {dispute.reasonCode.replaceAll("-", " ")}
          </Badge>
          <small>
            Reported by {dispute.reporterName} ·{" "}
            {new Intl.DateTimeFormat("en-US", {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(dispute.createdAt))}
          </small>
        </span>
        <Badge>{dispute.matchStatus}</Badge>
      </header>
      <h3>{dispute.title}</h3>
      <p>{dispute.details ?? "No additional player note was provided."}</p>
      <form action={action}>
        <input name="disputeId" type="hidden" value={dispute.id} />
        <select defaultValue="upheld" name="decision">
          <option value="upheld">Confirm inaccurate · keep excluded</option>
          <option value="rejected">Evidence is accurate · restore</option>
        </select>
        <input
          name="resolutionNotes"
          placeholder="Evidence reviewed and why"
          required
        />
        <button disabled={pending}>
          <ShieldCheck size={15} /> Resolve + rebuild ratings
        </button>
      </form>
      <ActionFeedback state={state} />
    </article>
  );
}

export function SandDataPanel({ data }: { readonly data: SandDataOverview }) {
  const ready = data.matches.filter((match) => match.importState === "ready");
  const mapping = data.matches.filter(
    (match) => match.importState === "needs-mapping",
  );
  return (
    <div className="sand-admin-layout">
      <section className="hq-card sand-command-card">
        <header className="hq-card-heading">
          <div>
            <span className="hq-eyebrow">Evidence intake</span>
            <h2>Run a source import</h2>
          </div>
          <Database size={20} />
        </header>
        <p>
          Imports are staged first. Identity, score, and duplicate gates must
          clear before a result can enter Sand Rating.
        </p>
        <SourceImportForm />
        <div className="sand-refresh-row">
          <RefreshFivbForm />
          <RefreshRankingsForm />
        </div>
      </section>

      <BroadcastConfiguration events={data.events} />

      <section className="sand-summary-grid">
        <article>
          <small>Ready to review</small>
          <Numeric>{ready.length}</Numeric>
          <span>complete + mapped</span>
        </article>
        <article>
          <small>Needs mapping</small>
          <Numeric>{mapping.length}</Numeric>
          <span>identity gate open</span>
        </article>
        <article>
          <small>Mapping queue</small>
          <Numeric>{data.mappings.length}</Numeric>
          <span>player decisions</span>
        </article>
        <article>
          <small>Pro events</small>
          <Numeric>{data.events.length}</Numeric>
          <span>{data.events.filter((event) => event.live).length} live</span>
        </article>
        <article>
          <small>History reviews</small>
          <Numeric>{data.historyDisputes.length}</Numeric>
          <span>held out of ratings</span>
        </article>
      </section>

      <section className="hq-card sand-source-grid">
        <header className="hq-card-heading">
          <div>
            <span className="hq-eyebrow">Connected sources</span>
            <h2>Freshness + provenance</h2>
          </div>
          <Badge>{data.sources.length}</Badge>
        </header>
        <div>
          {data.sources.map((source) => (
            <article key={source.id}>
              <span>
                <Waves size={18} />
              </span>
              <div>
                <strong>{source.name}</strong>
                <small>
                  {source.latestImportedAt
                    ? `Last import ${new Intl.DateTimeFormat("en-US", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(source.latestImportedAt))}`
                    : "No completed import"}
                </small>
              </div>
              <Badge>{source.licenseStatus}</Badge>
            </article>
          ))}
        </div>
      </section>

      <section className="hq-card sand-runs">
        <header className="hq-card-heading">
          <div>
            <span className="hq-eyebrow">Scraper health</span>
            <h2>Recent runs</h2>
          </div>
          <Badge>{data.runs.length}</Badge>
        </header>
        {data.runs.map((run) => (
          <article key={run.id}>
            <span
              className={`sand-run-dot sand-run-dot--${run.status}`}
              title={run.status}
            />
            <div>
              <strong>
                {run.source} · {run.mode}
              </strong>
              <small>
                {run.engine} ·{" "}
                {new Intl.DateTimeFormat("en-US", {
                  dateStyle: "short",
                  timeStyle: "short",
                }).format(new Date(run.startedAt))}
              </small>
            </div>
            <Badge
              tone={
                run.status === "succeeded"
                  ? "positive"
                  : run.status === "running"
                    ? "neutral"
                    : "warning"
              }
            >
              {run.status}
            </Badge>
          </article>
        ))}
        {data.runs.length === 0 && (
          <p className="hq-empty">No imports have run yet.</p>
        )}
      </section>

      <section className="hq-card sand-match-queue">
        <header className="hq-card-heading">
          <div>
            <span className="hq-eyebrow">Human approval gate</span>
            <h2>Imported match queue</h2>
          </div>
          <Badge>{data.matches.length}</Badge>
        </header>
        <div>
          {data.matches.map((match) => (
            <MatchReview key={match.id} match={match} />
          ))}
        </div>
        {data.matches.length === 0 && (
          <p className="hq-empty">The staged match queue is clear.</p>
        )}
      </section>

      <section className="hq-card sand-match-queue">
        <header className="hq-card-heading">
          <div>
            <span className="hq-eyebrow">Player evidence appeals</span>
            <h2>Match accuracy reviews</h2>
          </div>
          <Badge tone={data.historyDisputes.length ? "warning" : "positive"}>
            {data.historyDisputes.length}
          </Badge>
        </header>
        <p>
          A flagged match remains public with an accuracy notice, but its
          evidence is held out of Sand Rating until this review is resolved.
        </p>
        <div>
          {data.historyDisputes.map((dispute) => (
            <HistoryDisputeReview dispute={dispute} key={dispute.id} />
          ))}
        </div>
        {data.historyDisputes.length === 0 && (
          <p className="hq-empty">No player accuracy reviews are waiting.</p>
        )}
      </section>
    </div>
  );
}

function MappingReview({
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
  const evidence =
    mapping.mappingEvidence &&
    typeof mapping.mappingEvidence === "object" &&
    !Array.isArray(mapping.mappingEvidence)
      ? mapping.mappingEvidence
      : {};
  const suggestedPersonId =
    typeof evidence.candidatePersonId === "string"
      ? evidence.candidatePersonId
      : "";
  const suggestedName =
    typeof evidence.candidateDisplayName === "string"
      ? evidence.candidateDisplayName
      : undefined;
  const suggestedHandle =
    typeof evidence.candidateHandle === "string"
      ? evidence.candidateHandle
      : "suggested-player";
  const ambiguityCount = Array.isArray(evidence.candidates)
    ? evidence.candidates.length
    : 0;
  const suggestedOption =
    suggestedPersonId && suggestedName
      ? {
          id: suggestedPersonId,
          displayName: suggestedName,
          handle: suggestedHandle,
        }
      : undefined;
  return (
    <article className="mapping-review">
      <span className="mapping-review__avatar">
        {mapping.displayName
          .split(/\s+/)
          .map((part) => part[0])
          .join("")
          .slice(0, 2)}
      </span>
      <div className="mapping-review__identity">
        <small>{mapping.source}</small>
        <strong>{mapping.displayName}</strong>
        <span>
          {mapping.isProfessional ? "Professional" : "Player"} · source ID{" "}
          {mapping.externalPersonId}
        </span>
        {mapping.sourceContext.teamName && (
          <span>
            {mapping.sourceContext.season} · {mapping.sourceContext.teamName} ·{" "}
            {mapping.sourceContext.gender}
          </span>
        )}
      </div>
      <ArrowRight aria-hidden size={18} />
      <form action={action}>
        <input name="externalProfileId" type="hidden" value={mapping.id} />
        <PlayerCombobox
          initialOptions={playerComboboxOptions(players)}
          searchHint={mapping.displayName}
          suggestedConfidence={
            suggestedOption
              ? Math.round((mapping.mappingScoreBps ?? 0) / 100)
              : undefined
          }
          suggestedOption={suggestedOption}
        />
        {suggestedName && (
          <small className="mapping-review__suggestion">
            Suggested from matching source evidence:{" "}
            <strong>{suggestedName}</strong> ·{" "}
            {((mapping.mappingScoreBps ?? 0) / 100).toFixed(0)}% confidence
          </small>
        )}
        {!suggestedName && ambiguityCount > 1 && (
          <small className="mapping-review__suggestion">
            {ambiguityCount} possible name matches found. Search to choose the
            correct player.
          </small>
        )}
        <input
          name="reason"
          placeholder="Review note, e.g. confirmed name and source history"
          required
        />
        <button disabled={pending}>
          <Link2 size={15} /> Confirm mapping
        </button>
        <ActionFeedback state={state} />
      </form>
    </article>
  );
}

function AvpRosterAssignment({
  data,
  players,
}: {
  readonly data: SandDataOverview;
  readonly players: readonly PersonSummary[];
}) {
  const [state, action, pending] = useActionState(
    saveAvpRosterAssignmentAction,
    initialState,
  );
  const [selectedTeamKey, setSelectedTeamKey] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"starter" | "substitute">("starter");
  const selectedTeam = data.avpTeams.find(
    (team) =>
      `${team.season}|${team.gender}|${team.teamName}` === selectedTeamKey,
  );
  const rosterListId = "avp-source-roster-names";
  if (data.avpTeams.length === 0) return null;
  return (
    <section className="hq-card avp-roster-admin">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Seasonal AVP moderation</span>
          <h2>Team roster assignments</h2>
        </div>
        <UsersRound size={20} />
      </header>
      <p>
        Choose the season and source roster name, then search Duna directly.
        Existing source history is reused automatically when it identifies one
        player; ambiguous surnames remain here for review.
      </p>
      <form action={action}>
        <label>
          <span>Season team</span>
          <select
            name="team"
            onChange={(event) => {
              setSelectedTeamKey(event.target.value);
              setDisplayName("");
            }}
            required
            value={selectedTeamKey}
          >
            <option value="">Choose a team</option>
            {data.avpTeams.map((team) => (
              <option
                key={team.key}
                value={`${team.season}|${team.gender}|${team.teamName}`}
              >
                {team.season} · {team.teamName} · {team.gender}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Source roster name</span>
          <input
            disabled={!selectedTeam}
            list={rosterListId}
            name="displayName"
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder={
              selectedTeam
                ? "Choose or type the AVP roster name"
                : "Choose a season team first"
            }
            required
            value={displayName}
          />
          <datalist id={rosterListId}>
            {(selectedTeam?.players ?? []).map((player) => (
              <option
                key={player.externalPersonId}
                value={player.displayName}
              />
            ))}
          </datalist>
        </label>
        <PlayerCombobox
          initialOptions={playerComboboxOptions(players)}
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
            <option value="substitute">Substitute</option>
          </select>
        </label>
        <label>
          <span>Replaces</span>
          <select
            disabled={role !== "substitute" || !selectedTeam}
            name="replacesExternalPersonId"
            required={role === "substitute"}
          >
            <option value="">No replacement</option>
            {(selectedTeam?.players ?? []).map((player) => (
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
        <label className="avp-roster-admin__reason">
          <span>Review note</span>
          <input
            name="reason"
            placeholder="Why this season mapping is correct"
            required
          />
        </label>
        <button className="hq-button hq-button--primary" disabled={pending}>
          {pending ? <LoaderCircle className="spin" size={16} /> : null}
          Save season assignment
        </button>
        <ActionFeedback state={state} />
      </form>
    </section>
  );
}

function LinkedMappingEditor({
  mapping,
  players,
}: {
  readonly mapping: SandDataOverview["linkedMappings"][number];
  readonly players: readonly PersonSummary[];
}) {
  const [state, action, pending] = useActionState(
    linkSandPlayerAction,
    initialState,
  );
  const currentOption = mapping.currentPlayer
    ? {
        id: mapping.currentPlayer.id,
        displayName: mapping.currentPlayer.displayName,
        handle: mapping.currentPlayer.handle,
      }
    : undefined;
  return (
    <article className="linked-mapping-row">
      <div className="linked-mapping-row__source">
        <small>{mapping.source}</small>
        <strong>{mapping.displayName}</strong>
        <span>
          {mapping.sourceContext.season
            ? `${mapping.sourceContext.season} · `
            : ""}
          {mapping.sourceContext.teamName
            ? `${mapping.sourceContext.teamName} · `
            : ""}
          {mapping.sourceContext.gender ??
            `source ID ${mapping.externalPersonId}`}
        </span>
      </div>
      <ArrowRight aria-hidden size={18} />
      <form action={action}>
        <input name="externalProfileId" type="hidden" value={mapping.id} />
        <PlayerCombobox
          currentOption={currentOption}
          initialOptions={playerComboboxOptions(players)}
          label="Mapped Duna player"
          searchHint={mapping.displayName}
        />
        <input
          name="reason"
          placeholder="Reason for changing this mapping"
          required
        />
        <button disabled={pending}>
          {pending ? (
            <LoaderCircle className="spin" size={15} />
          ) : (
            <RefreshCw size={15} />
          )}
          Save change
        </button>
        <ActionFeedback state={state} />
      </form>
    </article>
  );
}

function LinkedMappingHistory({
  data,
  players,
}: {
  readonly data: SandDataOverview;
  readonly players: readonly PersonSummary[];
}) {
  const [query, setQuery] = useState("");
  const [season, setSeason] = useState("all");
  const seasons = useMemo(
    () =>
      [
        ...new Set(
          data.linkedMappings.flatMap((mapping) =>
            mapping.sourceContext.season ? [mapping.sourceContext.season] : [],
          ),
        ),
      ].sort((left, right) => right - left),
    [data.linkedMappings],
  );
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return data.linkedMappings.filter((mapping) => {
      const matchesSeason =
        season === "all" ||
        String(mapping.sourceContext.season ?? "") === season;
      const matchesQuery =
        !normalized ||
        mapping.displayName.toLowerCase().includes(normalized) ||
        mapping.currentPlayer?.displayName.toLowerCase().includes(normalized) ||
        mapping.currentPlayer?.handle.toLowerCase().includes(normalized) ||
        mapping.source.toLowerCase().includes(normalized) ||
        mapping.sourceContext.teamName?.toLowerCase().includes(normalized);
      return matchesSeason && matchesQuery;
    });
  }, [data.linkedMappings, query, season]);
  const visible = filtered.slice(0, 40);
  return (
    <section className="hq-card linked-mapping-history">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Editable identity history</span>
          <h2>Linked player mappings</h2>
        </div>
        <History size={20} />
      </header>
      <p>
        Review past source links by season and change the canonical Duna player
        at any time. Corrections update imported matches and future roster
        refreshes with an audit record.
      </p>
      <div className="linked-mapping-history__filters">
        <label>
          <span>Find a mapping</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Source name, Duna player, handle, or team…"
            type="search"
            value={query}
          />
        </label>
        <label>
          <span>Season</span>
          <select
            onChange={(event) => setSeason(event.target.value)}
            value={season}
          >
            <option value="all">All seasons</option>
            {seasons.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </label>
        <Badge>{filtered.length} mappings</Badge>
      </div>
      <div className="linked-mapping-history__list">
        {visible.map((mapping) => (
          <LinkedMappingEditor
            key={`${mapping.id}:${mapping.personId ?? "unlinked"}`}
            mapping={mapping}
            players={players}
          />
        ))}
      </div>
      {filtered.length === 0 && (
        <p className="hq-empty">No saved mappings match these filters.</p>
      )}
      {filtered.length > visible.length && (
        <small className="linked-mapping-history__more">
          Showing the 40 most recently updated matches. Narrow the search or
          season to find an older mapping.
        </small>
      )}
    </section>
  );
}

export function PlayerMappingPanel({
  data,
  players,
  query,
}: {
  readonly data: SandDataOverview;
  readonly players: readonly PersonSummary[];
  readonly query?: string;
}) {
  return (
    <div className="player-mapping-workspace">
      <section className="hq-card player-directory-search">
        <header className="hq-card-heading">
          <div>
            <span className="hq-eyebrow">Canonical player directory</span>
            <h2>Find the right Duna identity</h2>
          </div>
          <Badge>{players.length} results</Badge>
        </header>
        <form action="/admin/player-mapping" method="get">
          <Search aria-hidden size={18} />
          <input
            aria-label="Search Duna players"
            defaultValue={query}
            name="q"
            placeholder="Search name, handle, or email…"
            type="search"
          />
          <button className="hq-button hq-button--primary" type="submit">
            Search players
          </button>
        </form>
        <div className="player-directory-results">
          {players.map((player) => (
            <article key={player.id}>
              <span className="player-directory-results__avatar">
                {player.avatarUrl ? (
                  <img alt="" src={player.avatarUrl} />
                ) : (
                  player.initials
                )}
              </span>
              <div>
                <strong>{player.displayName}</strong>
                <small>
                  @{player.handle} · {player.homeMarket}
                </small>
              </div>
              <span>
                <strong>{player.rating.display.toFixed(2)}</strong>
                <small>{player.rating.confidence}</small>
              </span>
              <Badge tone={player.isProfessional ? "positive" : "neutral"}>
                {player.isProfessional
                  ? "pro"
                  : (player.profileClaimStatus ?? "player")}
              </Badge>
            </article>
          ))}
          {players.length === 0 && (
            <p className="hq-empty">
              No Duna players match “{query}”. Try a broader name or handle.
            </p>
          )}
        </div>
      </section>

      <AvpRosterAssignment data={data} players={players} />

      <LinkedMappingHistory data={data} players={players} />

      <section className="hq-card mapping-queue">
        <header className="hq-card-heading">
          <div>
            <span className="hq-eyebrow">One player, one identity</span>
            <h2>External player mapping</h2>
          </div>
          <Badge tone={data.mappings.length ? "warning" : "positive"}>
            {data.mappings.length}
          </Badge>
        </header>
        <p>
          Duna now reuses exact source IDs and unique historical name matches.
          This queue holds ambiguous or new identities that still need a human
          decision.
        </p>
        <div>
          {data.mappings.map((mapping) => (
            <MappingReview
              key={mapping.id}
              mapping={mapping}
              players={players}
            />
          ))}
        </div>
        {data.mappings.length === 0 && (
          <p className="hq-empty">Every discovered player is resolved.</p>
        )}
      </section>
    </div>
  );
}

function RatingEvaluationForm() {
  const [state, action, pending] = useActionState(
    evaluateRatingAction,
    initialState,
  );
  return (
    <form action={action}>
      <button className="hq-button hq-button--primary" disabled={pending}>
        <Activity size={16} /> Run evaluation
      </button>
      <ActionFeedback state={state} />
    </form>
  );
}

function RatingConfigurationForm() {
  const [state, action, pending] = useActionState(
    saveRatingConfigurationAction,
    initialState,
  );
  return (
    <form action={action} className="rating-config-form">
      <label>
        <span>Configuration name</span>
        <input defaultValue="Duna Sand Rating" name="name" required />
      </label>
      <label>
        <span>Parameters</span>
        <textarea
          defaultValue={JSON.stringify(
            {
              weakLinkAlpha: 0.62,
              baseK: 42,
              weeklyDisplayGainCap: 0.35,
              repeatOpponentWindowDays: 30,
              sparseThreshold: 12,
              externalBlendCap: 0.45,
            },
            null,
            2,
          )}
          name="parameters"
          rows={10}
        />
      </label>
      <label>
        <span>Lab notes</span>
        <textarea
          name="notes"
          placeholder="What changed and what the evaluation showed"
          rows={3}
        />
      </label>
      <label>
        <span>Review reason</span>
        <input name="reason" required />
      </label>
      <label className="sand-check">
        <input name="activate" type="checkbox" value="true" />
        <span>Activate after saving (super-admin only)</span>
      </label>
      <button className="hq-button hq-button--primary" disabled={pending}>
        Save immutable version
      </button>
      <ActionFeedback state={state} />
    </form>
  );
}

export function RatingsLabPanel({ data }: { readonly data: SandDataOverview }) {
  const latest = data.evaluations[0];
  return (
    <div className="ratings-lab">
      <section className="ratings-lab__metrics">
        <article>
          <small>Prediction accuracy</small>
          <Numeric>
            {latest ? `${(latest.predictionAccuracy * 100).toFixed(1)}%` : "—"}
          </Numeric>
          <span>{latest?.sampleSize ?? 0} outcomes</span>
        </article>
        <article>
          <small>Brier score</small>
          <Numeric>{latest ? latest.brierScore.toFixed(3) : "—"}</Numeric>
          <span>lower is better</span>
        </article>
        <article>
          <small>Configuration</small>
          <Numeric>
            {data.configurations.find((config) => config.active)?.version ??
              "—"}
          </Numeric>
          <span>active version</span>
        </article>
        <article>
          <small>Evidence events</small>
          <Numeric>{latest?.sampleSize ?? 0}</Numeric>
          <span>replayable history</span>
        </article>
        <article>
          <small>TruVolley correlation</small>
          <Numeric>
            {data.truVolleyBenchmark.correlation === undefined
              ? "—"
              : data.truVolleyBenchmark.correlation.toFixed(3)}
          </Numeric>
          <span>{data.truVolleyBenchmark.sampleSize} private comparisons</span>
        </article>
        <article>
          <small>Mean rating difference</small>
          <Numeric>
            {data.truVolleyBenchmark.meanAbsoluteDifference === undefined
              ? "—"
              : data.truVolleyBenchmark.meanAbsoluteDifference.toFixed(2)}
          </Numeric>
          <span>SandRating vs TruVolley</span>
        </article>
      </section>
      <section className="hq-card ratings-evaluation-card">
        <header className="hq-card-heading">
          <div>
            <span className="hq-eyebrow">Private benchmark</span>
            <h2>Where SandRating differs</h2>
          </div>
          <Badge>super-admin only</Badge>
        </header>
        <p>
          TruVolley is an evaluation signal only. It is never shown to players
          or used as a target label for a public rating.
        </p>
        <div className="sand-benchmark-table">
          {data.truVolleyBenchmark.players.map((player) => (
            <article key={player.personId}>
              <span>
                <strong>{player.playerName}</strong>
                <small>{player.matches ?? 0} source matches</small>
              </span>
              <span>Sand {player.sandRating.toFixed(2)}</span>
              <span>TruVolley {player.truVolleyRating.toFixed(2)}</span>
              <Badge
                tone={
                  Math.abs(player.sandRating - player.truVolleyRating) >= 0.75
                    ? "warning"
                    : "neutral"
                }
              >
                {(player.sandRating - player.truVolleyRating).toFixed(2)}
              </Badge>
            </article>
          ))}
          {data.truVolleyBenchmark.players.length === 0 && (
            <p>
              No linked VolleyballLife profiles have a comparable rating yet.
            </p>
          )}
        </div>
      </section>
      <section className="hq-card ratings-evaluation-card">
        <header className="hq-card-heading">
          <div>
            <span className="hq-eyebrow">Prediction quality</span>
            <h2>Evaluate the current model</h2>
          </div>
          <Activity size={20} />
        </header>
        <p>
          Accuracy, Brier score, and ten calibration buckets are calculated from
          immutable rating events.
        </p>
        <RatingEvaluationForm />
        {latest && (
          <div className="calibration-bars">
            {latest.calibration.map((bucket) => (
              <div key={`${bucket.lowerBound}-${bucket.upperBound}`}>
                <span>
                  {(bucket.lowerBound * 100).toFixed(0)}–
                  {(bucket.upperBound * 100).toFixed(0)}%
                </span>
                <i
                  style={{
                    width: `${Math.max(2, bucket.observedWinRate * 100)}%`,
                  }}
                />
                <small>{bucket.predictions}</small>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="hq-card ratings-config-card">
        <header className="hq-card-heading">
          <div>
            <span className="hq-eyebrow">Versioned controls</span>
            <h2>Rating configuration</h2>
          </div>
          <Badge>super-admin</Badge>
        </header>
        <RatingConfigurationForm />
      </section>
      <section className="hq-card ratings-version-list">
        <header className="hq-card-heading">
          <div>
            <span className="hq-eyebrow">Change history</span>
            <h2>Model versions</h2>
          </div>
          <Badge>{data.configurations.length}</Badge>
        </header>
        {data.configurations.map((configuration) => (
          <article key={configuration.id}>
            <span>
              <strong>
                {configuration.name} v{configuration.version}
              </strong>
              <small>{configuration.algorithmVersion}</small>
            </span>
            <Badge tone={configuration.active ? "positive" : "neutral"}>
              {configuration.active ? "active" : "archived"}
            </Badge>
          </article>
        ))}
      </section>
    </div>
  );
}

export function ProfileMergePanel() {
  const [state, action, pending] = useActionState(
    mergeSandProfilesAction,
    initialState,
  );
  return (
    <section className="hq-card profile-merge-card">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Identity repair</span>
          <h2>Merge an unclaimed profile</h2>
        </div>
        <GitMerge size={21} />
      </header>
      <div className="profile-merge-explainer">
        <UsersRound size={23} />
        <p>
          External links, match participation, rankings, and rating history move
          to the canonical player. Claimed profiles cannot be merged
          automatically.
        </p>
      </div>
      <form action={action}>
        <label>
          <span>Unclaimed source person ID</span>
          <input name="sourcePersonId" required />
        </label>
        <ArrowRight aria-hidden size={19} />
        <label>
          <span>Canonical target person ID</span>
          <input name="targetPersonId" required />
        </label>
        <label className="profile-merge-card__reason">
          <span>Merge reason</span>
          <textarea name="reason" required rows={3} />
        </label>
        <button className="hq-button hq-button--primary" disabled={pending}>
          <GitMerge size={16} /> Merge profiles
        </button>
      </form>
      <ActionFeedback state={state} />
      <p className="profile-merge-warning">
        If both profiles already have rating events, the operation pauses for a
        Ratings Lab replay instead of combining incompatible projections.
      </p>
    </section>
  );
}
