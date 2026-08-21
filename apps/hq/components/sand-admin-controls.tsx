"use client";

import type {
  PlayerMergeFieldChoice,
  PlayerMergeFieldPlan,
  PlayerMergePreview,
  SandDataOverview,
} from "@duna/api";
import type { PersonSummary } from "@duna/core";
import { Badge, Numeric } from "@duna/ui";
import {
  Activity,
  ArrowLeftRight,
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
  Sparkles,
  TriangleAlert,
  Trash2,
  Trophy,
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
  previewSandProfilesAction,
  refreshFivbIndexAction,
  refreshWorldRankingsAction,
  removeProfessionalWatchOptionAction,
  reviewProfileClaimAction,
  reviewMatchHistoryDisputeAction,
  reviewSandMatchAction,
  saveAvpRosterAssignmentAction,
  saveRatingConfigurationAction,
  saveProfessionalWatchOptionAction,
  smokeTestScraperAction,
  updateScraperControlAction,
  type SandActionState,
} from "@/app/admin/sand-actions";
import { PlayerCombobox, type PlayerComboboxOption } from "./player-combobox";

const initialState: SandActionState = { status: "idle", message: "" };
const consumerOrigin =
  process.env.NEXT_PUBLIC_DUNA_WEB_URL?.replace(/\/$/, "") ??
  "https://duna.coach";

function liveTransportFailure(
  detail: Readonly<Record<string, unknown>> | undefined,
): string | undefined {
  const failures = detail?.failures;
  if (!Array.isArray(failures)) return undefined;
  const first = failures[0];
  if (!first || typeof first !== "object") return undefined;
  const message = Reflect.get(first, "message");
  const externalEventId = Reflect.get(first, "externalEventId");
  if (typeof message !== "string" || !message.trim()) return undefined;
  return typeof externalEventId === "string" && externalEventId
    ? `${externalEventId}: ${message}`
    : message;
}

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
          <option value="avp-tournaments">AVP tournament season</option>
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

function ScraperControlCard({
  control,
}: {
  readonly control: SandDataOverview["controls"][number];
}) {
  const [saveState, save, saving] = useActionState(
    updateScraperControlAction,
    initialState,
  );
  const [smokeState, smoke, smoking] = useActionState(
    smokeTestScraperAction,
    initialState,
  );
  const playerCadence =
    control.source === "volleyball-life" || control.source === "bvbinfo";
  const fivbCadence = control.source === "fivb-12ndr";
  const liveTransport = control.source === "volleyball-world";
  const nativeOnly = control.source === "volleyball-life" || liveTransport;
  const transportFailure = liveTransportFailure(control.liveHealth?.detail);
  const adaptiveTransport = control.adaptiveTransport;
  return (
    <article className="hq-card scraper-control-card">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">SuperAdmin source policy</span>
          <h3>{control.name}</h3>
          <p>
            {control.latestRun
              ? `${control.latestRun.status} · ${new Intl.DateTimeFormat(
                  "en-US",
                  {
                    dateStyle: "medium",
                    timeStyle: "short",
                  },
                ).format(new Date(control.latestRun.startedAt))}`
              : "No importer run recorded yet"}
          </p>
        </div>
        <Badge tone={control.enabled ? "positive" : "warning"}>
          {control.enabled ? "enabled" : "paused"}
        </Badge>
      </header>
      {liveTransport && (
        <>
          <p className="scraper-transport-health">
            Live transport: {control.liveHealth?.status ?? "idle"}
            {control.liveHealth?.checkedAt
              ? ` · checked ${new Intl.DateTimeFormat("en-US", {
                  timeStyle: "medium",
                }).format(new Date(control.liveHealth.checkedAt))}`
              : " · not checked yet"}
            {control.liveHealth?.latencyMs !== undefined
              ? ` · ${control.liveHealth.latencyMs} ms`
              : ""}
          </p>
          {transportFailure && (
            <p className="scraper-transport-error">
              <TriangleAlert aria-hidden size={14} />
              {transportFailure}
            </p>
          )}
        </>
      )}
      {adaptiveTransport && adaptiveTransport.nativeFailureStreak > 0 && (
        <p className="scraper-transport-error">
          <TriangleAlert aria-hidden size={14} />
          {adaptiveTransport.firecrawlPreferredUntil
            ? `Adaptive Firecrawl preference after ${adaptiveTransport.nativeFailureStreak} recovered native failures · native recovery probe after ${new Intl.DateTimeFormat(
                "en-US",
                {
                  dateStyle: "medium",
                  timeStyle: "short",
                },
              ).format(new Date(adaptiveTransport.firecrawlPreferredUntil))}`
            : `Firecrawl recovered ${adaptiveTransport.nativeFailureStreak} recent native failure${adaptiveTransport.nativeFailureStreak === 1 ? "" : "s"} · preference changes after 3`}
          {adaptiveTransport.nativeLastError
            ? ` · latest native error: ${adaptiveTransport.nativeLastError}`
            : ""}
        </p>
      )}
      <form action={save} className="scraper-control-form">
        <input name="source" type="hidden" value={control.source} />
        <label className="scraper-toggle">
          <input
            defaultChecked={control.enabled}
            name="enabled"
            type="checkbox"
          />
          <span>Allow scheduled and manual requests</span>
        </label>
        <label>
          <span>Request engine</span>
          {nativeOnly ? (
            <>
              <input name="engine" type="hidden" value="native" />
              <span className="scraper-control-static-value">
                Native official API
              </span>
            </>
          ) : (
            <select defaultValue={control.engine} name="engine">
              <option value="auto">Auto</option>
              <option value="native">Native HTTP</option>
              <option value="firecrawl">Firecrawl</option>
            </select>
          )}
        </label>
        <label>
          <span>Minimum gap (ms)</span>
          <input
            defaultValue={control.minRequestIntervalMs}
            min={250}
            name="minRequestIntervalMs"
            type="number"
          />
        </label>
        <label>
          <span>Maximum requests/hour</span>
          <input
            defaultValue={control.maxRequestsPerHour}
            min={1}
            name="maxRequestsPerHour"
            type="number"
          />
        </label>
        {playerCadence && (
          <>
            <label>
              <span>Active linked player cadence (hours)</span>
              <input
                defaultValue={control.linkedPlayerActiveRefreshHours ?? ""}
                min={1}
                name="linkedPlayerActiveRefreshHours"
                type="number"
              />
            </label>
            <label>
              <span>Inactive linked player cadence (hours)</span>
              <input
                defaultValue={control.linkedPlayerIdleRefreshHours ?? ""}
                min={1}
                name="linkedPlayerIdleRefreshHours"
                type="number"
              />
            </label>
            <label>
              <span>Active player window (days)</span>
              <input
                defaultValue={control.activePlayerWindowDays ?? ""}
                min={1}
                name="activePlayerWindowDays"
                type="number"
              />
            </label>
          </>
        )}
        {fivbCadence && (
          <>
            <label>
              <span>12ndr event-detail cadence (minutes)</span>
              <input
                defaultValue={control.activeEventRefreshMinutes ?? ""}
                min={5}
                name="activeEventRefreshMinutes"
                type="number"
              />
            </label>
            <label>
              <span>Completed-event grace (hours)</span>
              <input
                defaultValue={control.completedEventGraceHours ?? ""}
                min={0}
                name="completedEventGraceHours"
                type="number"
              />
            </label>
          </>
        )}
        {liveTransport && (
          <>
            <label className="scraper-toggle">
              <input
                defaultChecked={control.liveTransportEnabled}
                name="liveTransportEnabled"
                type="checkbox"
              />
              <span>Enable Duna live refresh health checks</span>
            </label>
            <label>
              <span>Official live refresh cadence (seconds)</span>
              <input
                defaultValue={control.liveRefreshSeconds ?? 60}
                min={60}
                name="liveRefreshSeconds"
                type="number"
              />
            </label>
            <label>
              <span>REST fallback cadence (seconds)</span>
              <input
                defaultValue={control.liveRestFallbackSeconds ?? 30}
                min={15}
                name="liveRestFallbackSeconds"
                type="number"
              />
            </label>
          </>
        )}
        {!liveTransport && (
          <input name="liveTransportEnabled" type="hidden" value="false" />
        )}
        <label>
          <span>Firecrawl cache max age (seconds)</span>
          <input
            defaultValue={control.firecrawlCacheTtlSeconds ?? ""}
            min={0}
            name="firecrawlCacheTtlSeconds"
            type="number"
          />
        </label>
        <label className="scraper-toggle">
          <input
            defaultChecked={control.firecrawlChangeTracking}
            name="firecrawlChangeTracking"
            type="checkbox"
          />
          <span>Request Firecrawl change tracking</span>
        </label>
        <button className="hq-button hq-button--primary" disabled={saving}>
          {saving ? (
            <LoaderCircle className="spin" size={16} />
          ) : (
            <ShieldCheck size={16} />
          )}
          Save guardrails
        </button>
        <ActionFeedback state={saveState} />
      </form>
      <form action={smoke} className="sand-mini-action">
        <input name="source" type="hidden" value={control.source} />
        <button disabled={smoking || !control.enabled}>
          {smoking ? (
            <LoaderCircle className="spin" size={15} />
          ) : (
            <Activity size={15} />
          )}
          Run smoke test
        </button>
        <ActionFeedback state={smokeState} />
      </form>
    </article>
  );
}

function ScraperControls({
  controls,
}: {
  readonly controls: SandDataOverview["controls"];
}) {
  return (
    <section className="scraper-control-grid">
      {controls.map((control) => (
        <ScraperControlCard control={control} key={control.source} />
      ))}
    </section>
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

      <section>
        <header className="hq-section-heading">
          <div>
            <span className="hq-eyebrow">SuperAdmin</span>
            <h2>Source policies and live transport health</h2>
          </div>
        </header>
        <ScraperControls controls={data.controls} />
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
              {run.errorMessage && (
                <small className="sand-run-error">{run.errorMessage}</small>
              )}
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

function ProfileClaimReview({
  claim,
}: {
  readonly claim: SandDataOverview["profileClaimReviews"][number];
}) {
  const [state, action, pending] = useActionState(
    reviewProfileClaimAction,
    initialState,
  );
  return (
    <article className="profile-claim-review">
      <header>
        <span>
          <Badge tone={claim.professionalClaim ? "warning" : "neutral"}>
            {claim.professionalClaim ? "professional claim" : "profile claim"}
          </Badge>
          <small>{claim.verificationTier}</small>
        </span>
        <time>
          {new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(
            new Date(claim.createdAt),
          )}
        </time>
      </header>
      <div className="profile-claim-review__identities">
        <span>
          <small>Signed-in identity</small>
          <strong>{claim.subject.displayName}</strong>
          <em>@{claim.subject.handle}</em>
        </span>
        <ArrowRight aria-hidden size={17} />
        <span>
          <small>Public profile requested</small>
          <strong>{claim.target.displayName}</strong>
          <em>@{claim.target.handle}</em>
        </span>
      </div>
      <div className="profile-claim-review__checks">
        <span className={claim.nameMatched ? "is-pass" : undefined}>
          <CheckCircle2 aria-hidden size={13} /> Exact legal name
        </span>
        {claim.birthDateMatched ? (
          <span className="is-pass">
            <CheckCircle2 aria-hidden size={13} /> Birth date matched
          </span>
        ) : (
          <span>
            <TriangleAlert aria-hidden size={13} /> Partner birth date
            unavailable
          </span>
        )}
        {claim.worldRanking ? (
          <span className="is-pass">
            <Trophy aria-hidden size={13} /> World #{claim.worldRanking.rank}
          </span>
        ) : null}
      </div>
      <div className="profile-claim-review__sources">
        {claim.officialSourceProfiles.map((source) => (
          <a
            href={source.profileUrl}
            key={`${source.sourceName}:${source.profileUrl}`}
            rel="noreferrer"
            target="_blank"
          >
            <span>
              <strong>{source.sourceName}</strong>
              <small>{source.displayName}</small>
            </span>
            <Link2 aria-hidden size={14} />
          </a>
        ))}
      </div>
      <form action={action}>
        <input name="jobId" type="hidden" value={claim.jobId} />
        <select defaultValue="approved" name="decision">
          <option value="approved">Approve + consolidate history</option>
          <option value="rejected">Reject + reopen profile</option>
        </select>
        <label>
          <input name="officialProfileMatched" type="checkbox" />
          <span>
            I compared the official profile page to the signed-in identity
          </span>
        </label>
        <input
          name="reason"
          placeholder="Evidence reviewed and why this decision is safe"
          required
        />
        <button disabled={pending}>
          {pending ? (
            <LoaderCircle className="spin" size={14} />
          ) : (
            <ShieldCheck size={14} />
          )}
          Save reviewed decision
        </button>
        <ActionFeedback state={state} />
      </form>
    </article>
  );
}

function mergeValueLabel(
  field: PlayerMergeFieldPlan,
  value: PlayerMergeFieldPlan["sourceValue"],
): string {
  if (value === null) return "No value";
  if (Array.isArray(value)) {
    const labels = value
      .map((item) => {
        const label = item.label ?? item.title ?? item.url;
        return typeof label === "string" ? label : undefined;
      })
      .filter((label): label is string => Boolean(label));
    return labels.length
      ? `${value.length} · ${labels.slice(0, 2).join(", ")}${labels.length > 2 ? "…" : ""}`
      : `${value.length} item${value.length === 1 ? "" : "s"}`;
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (field.key === "heightMillimeters" && typeof value === "number") {
    return `${Math.round(value / 10)} cm`;
  }
  return String(value);
}

function MergeFieldControl({
  choice,
  field,
  onChange,
  sourceName,
  targetName,
}: {
  readonly choice: PlayerMergeFieldChoice;
  readonly field: PlayerMergeFieldPlan;
  readonly onChange: (choice: PlayerMergeFieldChoice) => void;
  readonly sourceName: string;
  readonly targetName: string;
}) {
  return (
    <article className="player-merge-field">
      <div>
        <small>{field.group}</small>
        <strong>{field.label}</strong>
      </div>
      <label>
        <span className="sr-only">Value to keep for {field.label}</span>
        <select
          aria-label={`Value to keep for ${field.label}`}
          onChange={(event) =>
            onChange(event.target.value as PlayerMergeFieldChoice)
          }
          value={choice}
        >
          <option value="target">
            {targetName}: {mergeValueLabel(field, field.targetValue)}
          </option>
          <option value="source">
            {sourceName}: {mergeValueLabel(field, field.sourceValue)}
          </option>
          {field.kind === "collection" ? (
            <option value="combine">Combine unique items</option>
          ) : null}
          <option value="discard">Discard this field</option>
        </select>
      </label>
      <small className="player-merge-field__suggestion">
        <Sparkles aria-hidden size={12} /> Duna suggests {field.suggestedChoice}
      </small>
    </article>
  );
}

function PlayerMergeReview({
  preview,
}: {
  readonly preview: PlayerMergePreview;
}) {
  const [state, action, pending] = useActionState(
    mergeSandProfilesAction,
    initialState,
  );
  const suggestedChoices = useMemo(
    () =>
      Object.fromEntries(
        preview.plan.fields.map((field) => [field.key, field.suggestedChoice]),
      ) as Record<string, PlayerMergeFieldChoice>,
    [preview.plan.fields],
  );
  const [choices, setChoices] = useState(suggestedChoices);
  const conflicts = preview.plan.fields.filter(
    (field) => field.status === "conflict",
  );
  const automatic = preview.plan.fields.filter((field) =>
    ["source-fill", "target-fill", "combined"].includes(field.status),
  );
  const impact = [
    ["Source profiles", preview.impact.externalProfiles],
    ["Imported matches", preview.impact.importedMatches],
    ["Team memberships", preview.impact.teamMemberships],
    ["Rating events", preview.impact.ratingEvents],
    ["Followers", preview.impact.followers],
    ["Duplicate matches", preview.impact.duplicateImportedMatches],
  ] as const;
  return (
    <div className="player-merge-review">
      <section className="player-merge-recommendation">
        <div>
          <span className="player-merge-recommendation__icon">
            <Sparkles aria-hidden size={18} />
          </span>
          <div>
            <span className="hq-eyebrow">Duna merge intelligence</span>
            <h3>Keep {preview.plan.target.displayName} as canonical</h3>
            <p>
              Merge {preview.plan.source.displayName} into this identity with{" "}
              {preview.plan.confidence}% confidence.
            </p>
          </div>
        </div>
        <Badge tone={preview.plan.canMerge ? "positive" : "warning"}>
          {preview.plan.canMerge ? "ready to review" : "blocked"}
        </Badge>
      </section>
      <div className="player-merge-profile-pair">
        <article>
          <small>Duplicate profile</small>
          <strong>{preview.plan.source.displayName}</strong>
          <span>@{preview.plan.source.handle}</span>
          <Badge>{preview.plan.source.profileClaimStatus}</Badge>
        </article>
        <ArrowRight aria-hidden size={20} />
        <article className="is-canonical">
          <small>Canonical survivor</small>
          <strong>{preview.plan.target.displayName}</strong>
          <span>@{preview.plan.target.handle}</span>
          <Badge tone="positive">
            {preview.plan.target.profileClaimStatus}
          </Badge>
        </article>
      </div>
      <ul className="player-merge-reasons">
        {preview.plan.reasons.map((reason) => (
          <li key={reason}>
            <CheckCircle2 aria-hidden size={14} /> {reason}
          </li>
        ))}
      </ul>
      <div className="player-merge-impact">
        {impact.map(([label, value]) => (
          <span key={label}>
            <strong>{value}</strong>
            <small>{label}</small>
          </span>
        ))}
      </div>
      {preview.plan.blockers.length > 0 ? (
        <div className="player-merge-blockers">
          <TriangleAlert aria-hidden size={18} />
          <div>
            <strong>Merge blocked</strong>
            {preview.plan.blockers.map((blocker) => (
              <p key={blocker}>{blocker}</p>
            ))}
          </div>
        </div>
      ) : (
        <form action={action} className="player-merge-resolution">
          <input
            name="sourcePersonId"
            type="hidden"
            value={preview.plan.source.id}
          />
          <input
            name="targetPersonId"
            type="hidden"
            value={preview.plan.target.id}
          />
          <input
            name="fieldChoices"
            type="hidden"
            value={JSON.stringify(choices)}
          />
          <section>
            <header>
              <div>
                <span className="hq-eyebrow">Conflicts requiring a choice</span>
                <h3>
                  {conflicts.length
                    ? `${conflicts.length} field conflict${conflicts.length === 1 ? "" : "s"}`
                    : "No conflicting fields"}
                </h3>
              </div>
              <Badge tone={conflicts.length ? "warning" : "positive"}>
                {conflicts.length ? "review" : "resolved"}
              </Badge>
            </header>
            {conflicts.length ? (
              <div className="player-merge-fields">
                {conflicts.map((field) => (
                  <MergeFieldControl
                    choice={choices[field.key] ?? field.suggestedChoice}
                    field={field}
                    key={field.key}
                    onChange={(choice) =>
                      setChoices((current) => ({
                        ...current,
                        [field.key]: choice,
                      }))
                    }
                    sourceName={preview.plan.source.displayName}
                    targetName={preview.plan.target.displayName}
                  />
                ))}
              </div>
            ) : (
              <p className="hq-empty">
                Every populated field has one clear value or an identical value.
              </p>
            )}
          </section>
          {automatic.length > 0 ? (
            <details className="player-merge-automatic">
              <summary>
                Review {automatic.length} automatically filled or combined
                fields
              </summary>
              <div className="player-merge-fields">
                {automatic.map((field) => (
                  <MergeFieldControl
                    choice={choices[field.key] ?? field.suggestedChoice}
                    field={field}
                    key={field.key}
                    onChange={(choice) =>
                      setChoices((current) => ({
                        ...current,
                        [field.key]: choice,
                      }))
                    }
                    sourceName={preview.plan.source.displayName}
                    targetName={preview.plan.target.displayName}
                  />
                ))}
              </div>
            </details>
          ) : null}
          <section className="player-merge-rescore">
            <RefreshCw aria-hidden size={19} />
            <div>
              <strong>De-duplicate, then rescore</strong>
              <p>
                The merge will consolidate every source and match participant,
                cancel {preview.impact.duplicateCanonicalMatches} duplicate
                rated match
                {preview.impact.duplicateCanonicalMatches === 1 ? "" : "es"},
                and replay the Sand Rating projection chronologically.
              </p>
            </div>
          </section>
          <label className="player-merge-reason">
            <span>Merge reason</span>
            <textarea
              minLength={10}
              name="reason"
              placeholder="Evidence reviewed and why these are the same player"
              required
              rows={3}
            />
          </label>
          <label className="player-merge-confirmation">
            <input required type="checkbox" />
            <span>
              I reviewed the canonical survivor, field conflicts, duplicate
              matches, and rating replay impact.
            </span>
          </label>
          <button
            className="hq-button hq-button--primary"
            disabled={pending}
            type="submit"
          >
            {pending ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <GitMerge size={16} />
            )}
            Merge profiles + rescore
          </button>
          <ActionFeedback state={state} />
        </form>
      )}
    </div>
  );
}

function PlayerMergeWorkspace({
  initialPlayer,
  players,
}: {
  readonly initialPlayer?: PersonSummary;
  readonly players: readonly PersonSummary[];
}) {
  const [state, action, pending] = useActionState(
    previewSandProfilesAction,
    initialState,
  );
  const options = useMemo(() => playerComboboxOptions(players), [players]);
  const initialOption = initialPlayer
    ? options.find((option) => option.id === initialPlayer.id)
    : undefined;
  return (
    <section className="hq-card player-merge-workspace" id="profile-merge">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Map, compare, merge</span>
          <h2>Merge duplicate player profiles</h2>
        </div>
        <GitMerge aria-hidden size={21} />
      </header>
      <p>
        Search for two profiles. Duna recommends the canonical survivor, fills
        empty fields, combines unique evidence, and asks only about real
        conflicts before any data changes.
      </p>
      <form action={action} className="player-merge-picker">
        <PlayerCombobox
          currentOption={initialOption}
          initialOptions={options}
          key={`profile-a-${initialOption?.id ?? "empty"}`}
          label="Profile A"
          name="profileAId"
          placeholder="Search the first player…"
        />
        <ArrowLeftRight aria-hidden size={20} />
        <PlayerCombobox
          initialOptions={options}
          label="Profile B"
          name="profileBId"
          placeholder="Search the possible duplicate…"
        />
        <button
          className="hq-button hq-button--primary"
          disabled={pending}
          type="submit"
        >
          {pending ? (
            <LoaderCircle className="spin" size={16} />
          ) : (
            <Sparkles size={16} />
          )}
          Preview intelligent merge
        </button>
      </form>
      <ActionFeedback state={state} />
      {state.mergePreview ? (
        <PlayerMergeReview
          key={`${state.mergePreview.plan.source.id}-${state.mergePreview.plan.target.id}`}
          preview={state.mergePreview}
        />
      ) : null}
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
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>();
  const selectedPlayer =
    players.find((player) => player.id === selectedPlayerId) ?? players[0];
  const connectedMappings = selectedPlayer
    ? data.linkedMappings.filter(
        (mapping) => mapping.personId === selectedPlayer.id,
      )
    : [];
  const possibleIssues = selectedPlayer
    ? data.mappings.filter(
        (mapping) =>
          mapping.displayName.trim().toLowerCase() ===
          selectedPlayer.displayName.trim().toLowerCase(),
      )
    : [];
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
        <div className="player-directory-browser">
          <div className="player-directory-results">
            {players.map((player) => (
              <article
                className={
                  player.id === selectedPlayer?.id ? "is-selected" : undefined
                }
                key={player.id}
              >
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
                <button
                  aria-label={`Inspect ${player.displayName}`}
                  onClick={() => setSelectedPlayerId(player.id)}
                  type="button"
                >
                  Inspect <ArrowRight aria-hidden size={14} />
                </button>
              </article>
            ))}
            {players.length === 0 && (
              <p className="hq-empty">
                No Duna players match “{query}”. Try a broader name or handle.
              </p>
            )}
          </div>
          {selectedPlayer ? (
            <aside className="player-directory-inspector">
              <header>
                <span className="player-directory-results__avatar">
                  {selectedPlayer.avatarUrl ? (
                    <img alt="" src={selectedPlayer.avatarUrl} />
                  ) : (
                    selectedPlayer.initials
                  )}
                </span>
                <div>
                  <small>Canonical Duna identity</small>
                  <h3>{selectedPlayer.displayName}</h3>
                  <span>@{selectedPlayer.handle}</span>
                </div>
              </header>
              <dl>
                <div>
                  <dt>Sand Rating</dt>
                  <dd>{selectedPlayer.rating.display.toFixed(2)}</dd>
                </div>
                <div>
                  <dt>Claim</dt>
                  <dd>{selectedPlayer.profileClaimStatus ?? "claimed"}</dd>
                </div>
                <div>
                  <dt>Sources</dt>
                  <dd>{connectedMappings.length}</dd>
                </div>
                <div>
                  <dt>Open identity leads</dt>
                  <dd>{possibleIssues.length}</dd>
                </div>
              </dl>
              <div className="player-directory-inspector__actions">
                <a
                  href={`${consumerOrigin}/players/${selectedPlayer.handle}`}
                  rel="noreferrer"
                  target="_blank"
                >
                  <Link2 aria-hidden size={14} /> Public profile
                </a>
                <button
                  onClick={() =>
                    void navigator.clipboard.writeText(selectedPlayer.id)
                  }
                  type="button"
                >
                  Copy person ID
                </button>
                <a href="#profile-merge">
                  <GitMerge aria-hidden size={14} /> Compare + merge
                </a>
              </div>
              <section>
                <h4>Connected records</h4>
                {connectedMappings.map((mapping) =>
                  mapping.profileUrl ? (
                    <a
                      href={mapping.profileUrl}
                      key={mapping.id}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <span>
                        <strong>{mapping.source}</strong>
                        <small>{mapping.displayName}</small>
                      </span>
                      <ArrowRight aria-hidden size={13} />
                    </a>
                  ) : (
                    <span key={mapping.id}>
                      <strong>{mapping.source}</strong>
                      <small>{mapping.displayName}</small>
                    </span>
                  ),
                )}
                {connectedMappings.length === 0 ? (
                  <p>No source profile is connected yet.</p>
                ) : null}
              </section>
              {possibleIssues.length > 0 ? (
                <a
                  className="player-directory-inspector__issue"
                  href="#external-player-mapping"
                >
                  <TriangleAlert aria-hidden size={14} />
                  Review {possibleIssues.length} unresolved record
                  {possibleIssues.length === 1 ? "" : "s"} with this name
                </a>
              ) : null}
            </aside>
          ) : null}
        </div>
      </section>

      <PlayerMergeWorkspace initialPlayer={selectedPlayer} players={players} />

      <section className="hq-card profile-claim-queue">
        <header className="hq-card-heading">
          <div>
            <span className="hq-eyebrow">Identity ownership</span>
            <h2>Profile claims requiring review</h2>
          </div>
          <Badge
            tone={data.profileClaimReviews.length ? "warning" : "positive"}
          >
            {data.profileClaimReviews.length}
          </Badge>
        </header>
        <p>
          Professional claims require exact identity data plus a manual
          comparison against an official partner or tour profile. Approval
          consolidates match history and replays ratings when necessary.
        </p>
        <div>
          {data.profileClaimReviews.map((claim) => (
            <ProfileClaimReview claim={claim} key={claim.jobId} />
          ))}
        </div>
        {data.profileClaimReviews.length === 0 ? (
          <p className="hq-empty">No profile claims are waiting.</p>
        ) : null}
      </section>

      <AvpRosterAssignment data={data} players={players} />

      <div id="linked-player-mappings">
        <LinkedMappingHistory data={data} players={players} />
      </div>

      <section className="hq-card mapping-queue" id="external-player-mapping">
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
        <Activity size={16} /> Run walk-forward backtest
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
  const latestBacktest = data.backtests[0];
  const champion = latestBacktest?.modelSummaries.find(
    (model) => model.modelId === latestBacktest.championModelId,
  );
  return (
    <div className="ratings-lab">
      <section className="ratings-lab__metrics">
        <article>
          <small>Prediction accuracy</small>
          <Numeric>
            {champion
              ? `${(champion.accuracy * 100).toFixed(1)}%`
              : latest
                ? `${(latest.predictionAccuracy * 100).toFixed(1)}%`
                : "—"}
          </Numeric>
          <span>
            {latestBacktest?.matchesProcessed ?? latest?.sampleSize ?? 0}{" "}
            pre-match forecasts
          </span>
        </article>
        <article>
          <small>Brier score</small>
          <Numeric>
            {champion
              ? champion.brierScore.toFixed(4)
              : latest
                ? latest.brierScore.toFixed(3)
                : "—"}
          </Numeric>
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
          <small>Players replayed</small>
          <Numeric>{latestBacktest?.playersProcessed ?? 0}</Numeric>
          <span>{latestBacktest?.methodologyVersion ?? "run pending"}</span>
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
          <span>Sand Rating vs TruVolley</span>
        </article>
      </section>
      <section className="hq-card ratings-evaluation-card">
        <header className="hq-card-heading">
          <div>
            <span className="hq-eyebrow">Private benchmark</span>
            <h2>Where Sand Rating differs</h2>
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
            <h2>Chronological model challenge</h2>
          </div>
          <Activity size={20} />
        </header>
        <p>
          Every probability is captured before its match is learned. Baselines,
          Elo variants, Duna ablations, and the online ensemble are scored on
          identical history without future-result leakage.
        </p>
        <RatingEvaluationForm />
        {latestBacktest ? (
          <div className="rating-backtest-admin-table">
            <header>
              <span>Model</span>
              <span>Accuracy</span>
              <span>Brier</span>
              <span>Log loss</span>
              <span>AUC</span>
            </header>
            {latestBacktest.modelSummaries.map((model) => (
              <article
                className={
                  model.modelId === latestBacktest.championModelId
                    ? "is-champion"
                    : undefined
                }
                key={model.modelId}
              >
                <span>
                  <strong>{model.label}</strong>
                  <small>{model.family}</small>
                </span>
                <Numeric>{(model.accuracy * 100).toFixed(1)}%</Numeric>
                <Numeric>{model.brierScore.toFixed(4)}</Numeric>
                <Numeric>{model.logLoss.toFixed(4)}</Numeric>
                <Numeric>{model.areaUnderRocCurve.toFixed(3)}</Numeric>
              </article>
            ))}
            <footer>
              {latestBacktest.matchesProcessed.toLocaleString()} matches ·{" "}
              {latestBacktest.playersProcessed.toLocaleString()} players ·{" "}
              {latestBacktest.dateFrom
                ? new Intl.DateTimeFormat("en-US", {
                    dateStyle: "medium",
                  }).format(new Date(latestBacktest.dateFrom))
                : "start unknown"}{" "}
              through{" "}
              {latestBacktest.dateTo
                ? new Intl.DateTimeFormat("en-US", {
                    dateStyle: "medium",
                  }).format(new Date(latestBacktest.dateTo))
                : "end unknown"}
            </footer>
          </div>
        ) : latest ? (
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
        ) : null}
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
