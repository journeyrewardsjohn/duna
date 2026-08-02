"use client";

import type { SandDataOverview } from "@duna/api";
import { Badge, Numeric } from "@duna/ui";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Database,
  GitMerge,
  Link2,
  LoaderCircle,
  Play,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  UsersRound,
  Waves,
} from "lucide-react";
import { useActionState } from "react";
import {
  approveSandMatchAction,
  evaluateRatingAction,
  importSandSourceAction,
  linkSandPlayerAction,
  mergeSandProfilesAction,
  refreshFivbIndexAction,
  refreshWorldRankingsAction,
  reviewMatchHistoryDisputeAction,
  reviewSandMatchAction,
  saveRatingConfigurationAction,
  type SandActionState,
} from "@/app/admin/sand-actions";

const initialState: SandActionState = { status: "idle", message: "" };

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
        </select>
      </label>
      <label>
        <span>Player ID, event tcode, or source URL</span>
        <input
          name="externalId"
          placeholder="e.g. 653 or MWORLD2026"
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
        FIVB event index
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
}: {
  readonly mapping: SandDataOverview["mappings"][number];
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
      </div>
      <ArrowRight aria-hidden size={18} />
      <form action={action}>
        <input name="externalProfileId" type="hidden" value={mapping.id} />
        <label>
          <span>Duna person ID</span>
          <input
            defaultValue={suggestedPersonId}
            name="personId"
            placeholder="Paste canonical person UUID"
            required
          />
        </label>
        {suggestedName && (
          <small>
            Suggested: <strong>{suggestedName}</strong> ·{" "}
            {((mapping.mappingScoreBps ?? 0) / 100).toFixed(0)}% confidence
          </small>
        )}
        <input
          name="reason"
          placeholder="Why these identities match"
          required
        />
        <button disabled={pending}>
          <Link2 size={15} /> Link identity
        </button>
        <ActionFeedback state={state} />
      </form>
    </article>
  );
}

export function PlayerMappingPanel({
  data,
}: {
  readonly data: SandDataOverview;
}) {
  return (
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
        Exact source IDs link automatically. Name matches remain suggestions
        until a human confirms them.
      </p>
      <div>
        {data.mappings.map((mapping) => (
          <MappingReview key={mapping.id} mapping={mapping} />
        ))}
      </div>
      {data.mappings.length === 0 && (
        <p className="hq-empty">Every discovered player is resolved.</p>
      )}
    </section>
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
