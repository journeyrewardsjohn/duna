"use client";

import type {
  PlayerIntelligenceAdmin,
  PlayerIntelligenceDetail,
} from "@duna/api";
import { Badge, Numeric } from "@duna/ui";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  CheckCircle2,
  ExternalLink,
  Image as ImageIcon,
  LoaderCircle,
  Search,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  UserRoundSearch,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useActionState } from "react";
import {
  researchPlayerProfileAction,
  researchRankedPlayersAction,
  reviewPlayerMediaWorkflowAction,
  savePlayerIdentityAction,
  savePlayerPublicProfileAction,
  type PlayerIntelligenceActionState,
} from "@/app/admin/player-intelligence-actions";

const initialState: PlayerIntelligenceActionState = {
  status: "idle",
  message: "",
};
const consumerOrigin =
  process.env.NEXT_PUBLIC_DUNA_WEB_URL?.replace(/\/$/, "") ??
  "https://duna.coach";

function flagEmoji(countryCode?: string) {
  if (!countryCode || !/^[A-Z]{2}$/i.test(countryCode)) return "◌";
  return String.fromCodePoint(
    ...countryCode
      .toUpperCase()
      .split("")
      .map((character) => 127397 + character.charCodeAt(0)),
  );
}

function statusTone(status: string): "positive" | "warning" | "neutral" {
  if (status === "published") return "positive";
  if (["review", "ready", "generating", "researching"].includes(status)) {
    return "warning";
  }
  return "neutral";
}

function ActionFeedback({
  state,
}: {
  readonly state: PlayerIntelligenceActionState;
}) {
  if (state.status === "idle") return null;
  return (
    <p className={`player-intelligence-feedback is-${state.status}`}>
      {state.status === "success" ? (
        <CheckCircle2 aria-hidden size={16} />
      ) : (
        <TriangleAlert aria-hidden size={16} />
      )}
      {state.message}
    </p>
  );
}

function buildHref(
  current: {
    readonly query?: string;
    readonly gender?: "men" | "women";
    readonly status?: "all" | "not-started" | "review" | "published" | "failed";
  },
  values: { readonly page?: number; readonly player?: string },
) {
  const params = new URLSearchParams();
  if (current.query) params.set("q", current.query);
  if (current.gender) params.set("gender", current.gender);
  if (current.status && current.status !== "all") {
    params.set("status", current.status);
  }
  if (values.page && values.page > 1) params.set("page", String(values.page));
  if (values.player) params.set("player", values.player);
  const query = params.toString();
  return `/admin/player-intelligence${query ? `?${query}` : ""}`;
}

function BatchResearch() {
  const [state, action, pending] = useActionState(
    researchRankedPlayersAction,
    initialState,
  );
  return (
    <form action={action} className="player-intelligence-batch">
      <input name="limit" type="hidden" value="4" />
      <div>
        <Sparkles aria-hidden size={20} />
        <span>
          <strong>Prepare the next four research dossiers</strong>
          <small>
            Firecrawl evidence → OpenAI through Vercel AI Gateway → human review
          </small>
        </span>
      </div>
      <button className="hq-button hq-button--primary" disabled={pending}>
        {pending ? (
          <LoaderCircle className="spin" size={16} />
        ) : (
          <Bot size={16} />
        )}
        {pending ? "Researching…" : "Research next four"}
      </button>
      <ActionFeedback state={state} />
    </form>
  );
}

function ResearchPlayer({ personId }: { readonly personId: string }) {
  const [state, action, pending] = useActionState(
    researchPlayerProfileAction,
    initialState,
  );
  return (
    <form action={action} className="player-intelligence-research-one">
      <input name="personId" type="hidden" value={personId} />
      <button className="hq-button hq-button--secondary" disabled={pending}>
        {pending ? (
          <LoaderCircle className="spin" size={16} />
        ) : (
          <Sparkles size={16} />
        )}
        {pending ? "Building dossier…" : "Research again"}
      </button>
      <ActionFeedback state={state} />
    </form>
  );
}

function metricCards(data: PlayerIntelligenceAdmin) {
  return [
    ["Ranked players", data.counts.total, "Latest top 50 women + men"],
    ["Mapped identities", data.counts.mapped, "Ready for evidence research"],
    ["Awaiting review", data.counts.review, "Never published automatically"],
    ["Published stories", data.counts.published, "Visible on public profiles"],
    ["With artwork", data.counts.withMedia, "Reviewed cutout or hero media"],
  ] as const;
}

function PlayerQueue({
  data,
  filters,
}: {
  readonly data: PlayerIntelligenceAdmin;
  readonly filters: {
    readonly query?: string;
    readonly gender?: "men" | "women";
    readonly status?: "all" | "not-started" | "review" | "published" | "failed";
  };
}) {
  return (
    <section className="hq-card player-intelligence-queue">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Global player intelligence queue</span>
          <h2>Top 50 women + top 50 men</h2>
        </div>
        <Badge>{data.total} results</Badge>
      </header>
      <form className="player-intelligence-filters">
        <label className="player-intelligence-search">
          <Search aria-hidden size={17} />
          <input
            defaultValue={filters.query}
            name="q"
            placeholder="Search a ranked player"
          />
        </label>
        <label>
          <span>Division</span>
          <select defaultValue={filters.gender ?? ""} name="gender">
            <option value="">Women + men</option>
            <option value="women">Women</option>
            <option value="men">Men</option>
          </select>
        </label>
        <label>
          <span>Workflow</span>
          <select defaultValue={filters.status ?? "all"} name="status">
            <option value="all">Every status</option>
            <option value="not-started">Not started</option>
            <option value="review">Needs review</option>
            <option value="published">Published</option>
            <option value="failed">Needs attention</option>
          </select>
        </label>
        <button className="hq-button hq-button--secondary">
          Apply filters
        </button>
      </form>
      <div className="player-intelligence-list" role="list">
        {data.items.map((player) => {
          const artwork = player.cutoutImageUrl ?? player.heroImageUrl;
          return (
            <article
              key={`${player.genderCategory}-${player.rank}`}
              role="listitem"
            >
              <span className="player-intelligence-rank">#{player.rank}</span>
              <span className="player-intelligence-avatar">
                {artwork || player.avatarUrl ? (
                  <Image
                    alt=""
                    fill
                    sizes="54px"
                    src={(artwork ?? player.avatarUrl)!}
                  />
                ) : (
                  flagEmoji(player.countryCode)
                )}
              </span>
              <span className="player-intelligence-name">
                <strong>{player.displayName}</strong>
                <small>
                  {player.genderCategory} · {player.points.toLocaleString()} pts
                  · {player.countryCode ?? "country pending"}
                  {player.sourceDisplayName
                    ? ` · Source: ${player.sourceDisplayName}`
                    : ""}
                </small>
              </span>
              <span className="player-intelligence-status">
                <Badge tone={statusTone(player.researchStatus)}>
                  {player.researchStatus.replaceAll("-", " ")}
                </Badge>
                {player.mediaStatus ? (
                  <small>Artwork: {player.mediaStatus}</small>
                ) : (
                  <small>No artwork request</small>
                )}
              </span>
              {player.personId ? (
                <Link
                  className="hq-button hq-button--secondary"
                  href={buildHref(filters, { player: player.personId })}
                >
                  Review <ArrowRight size={15} />
                </Link>
              ) : (
                <span className="player-intelligence-unmapped">
                  <UserRoundSearch size={15} /> Map identity first
                </span>
              )}
            </article>
          );
        })}
        {data.items.length === 0 && (
          <div className="player-intelligence-empty">
            <Search size={24} />
            <strong>No players match these filters.</strong>
            <span>Clear a filter or search by a different name.</span>
          </div>
        )}
      </div>
      <footer className="player-intelligence-pagination">
        <span>
          Page {data.page} of {data.totalPages}
        </span>
        <nav aria-label="Player intelligence pages">
          {data.page > 1 && (
            <Link
              className="hq-button hq-button--secondary"
              href={buildHref(filters, { page: data.page - 1 })}
            >
              <ArrowLeft size={15} /> Previous
            </Link>
          )}
          {data.page < data.totalPages && (
            <Link
              className="hq-button hq-button--secondary"
              href={buildHref(filters, { page: data.page + 1 })}
            >
              Next <ArrowRight size={15} />
            </Link>
          )}
        </nav>
      </footer>
    </section>
  );
}

function profileValue<T>(
  current: T | null | undefined,
  proposed: T | undefined,
) {
  return current ?? proposed;
}

function linksAsText(detail: PlayerIntelligenceDetail) {
  const values = detail.profile?.links.length
    ? detail.profile.links
    : (detail.profile?.proposal?.links ?? []);
  return values
    .map((item) => `${item.label} | ${item.url} | ${item.kind}`)
    .join("\n");
}

function newsAsText(detail: PlayerIntelligenceDetail) {
  const values = detail.profile?.news.length
    ? detail.profile.news
    : (detail.profile?.proposal?.news ?? []);
  return values
    .map((item) =>
      [item.title, item.url, item.publisher, item.publishedAt]
        .filter(Boolean)
        .join(" | "),
    )
    .join("\n");
}

function CanonicalIdentityEditor({
  detail,
}: {
  readonly detail: PlayerIntelligenceDetail;
}) {
  const [state, action, pending] = useActionState(
    savePlayerIdentityAction,
    initialState,
  );
  const proposedHeight = detail.profile?.proposal?.heightMillimeters;
  const heightMillimeters =
    detail.person.heightMillimeters ?? proposedHeight ?? undefined;
  return (
    <form
      action={action}
      className="hq-card player-intelligence-editor player-intelligence-identity"
    >
      <input name="personId" type="hidden" value={detail.person.id} />
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Duna-wide source of truth</span>
          <h2>Canonical player identity</h2>
        </div>
        <Badge>{detail.person.profileClaimStatus.replaceAll("-", " ")}</Badge>
      </header>
      <p className="player-intelligence-identity-note">
        Used by rankings, research prompts, public pages, and player alerts.
        Identity changes take effect across Duna as soon as they are saved.
      </p>
      <section className="player-intelligence-identity-sources">
        {detail.ranking && (
          <div>
            <span>
              <strong>Imported ranking identity</strong>
              <small>
                World #{detail.ranking.rank} ·{" "}
                {detail.ranking.points.toLocaleString()} pts ·{" "}
                {detail.ranking.countryCode ?? "country pending"}
              </small>
              {detail.ranking.sourceTeamKey && (
                <small>
                  Source team:{" "}
                  {detail.ranking.sourceTeamKey
                    .replace(/^[a-z]+:/i, "")
                    .replaceAll("__", " / ")
                    .replaceAll("-", " ")}
                </small>
              )}
            </span>
            <span>
              {detail.ranking.sourcePlayerName ??
                detail.ranking.sourceDisplayName}
            </span>
          </div>
        )}
        {detail.sourceProfiles.map((source) => (
          <div key={`${source.source}-${source.externalPersonId}`}>
            <span>
              <strong>{source.sourceName}</strong>
              <small>
                {source.externalPersonId}
                {source.lastImportedAt
                  ? ` · refreshed ${new Date(source.lastImportedAt).toLocaleDateString()}`
                  : ""}
              </small>
            </span>
            {source.profileUrl ? (
              <a href={source.profileUrl} rel="noreferrer" target="_blank">
                {source.displayName} <ExternalLink size={14} />
              </a>
            ) : (
              <span>{source.displayName}</span>
            )}
          </div>
        ))}
      </section>
      {detail.possibleCanonicalMatches.length > 0 && (
        <aside className="player-intelligence-identity-warning">
          <TriangleAlert aria-hidden size={20} />
          <span>
            <strong>Possible existing canonical profiles</strong>
            <small>
              If this record is a duplicate, merge it instead of giving two
              players the same identity.
            </small>
          </span>
          <div>
            {detail.possibleCanonicalMatches.map((match) => (
              <Link
                href={`/admin/player-mapping?q=${encodeURIComponent(match.displayName)}`}
                key={match.id}
              >
                {match.displayName} · @{match.handle}
              </Link>
            ))}
          </div>
          <Link
            className="hq-button hq-button--secondary"
            href="/admin/profile-merge"
          >
            Review merge
          </Link>
        </aside>
      )}
      <div className="player-intelligence-form-grid">
        <label>
          <span>Player name</span>
          <input
            defaultValue={detail.person.displayName}
            maxLength={120}
            name="displayName"
            required
          />
        </label>
        <label>
          <span>Duna handle</span>
          <input
            defaultValue={detail.person.handle}
            maxLength={48}
            name="handle"
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            required
          />
          <small>Claimed profiles use this in their public URL.</small>
        </label>
        <label>
          <span>Given name</span>
          <input
            defaultValue={detail.person.givenName ?? ""}
            maxLength={80}
            name="givenName"
          />
        </label>
        <label>
          <span>Family name</span>
          <input
            defaultValue={detail.person.familyName ?? ""}
            maxLength={80}
            name="familyName"
          />
        </label>
        <label>
          <span>Home market</span>
          <input
            defaultValue={detail.person.homeMarket ?? ""}
            maxLength={120}
            name="homeMarket"
            placeholder="Honolulu, Hawaii"
          />
        </label>
        <label>
          <span>Height, centimeters</span>
          <input
            defaultValue={
              heightMillimeters ? heightMillimeters / 10 : undefined
            }
            max={260}
            min={60}
            name="heightCentimeters"
            step="0.1"
            type="number"
          />
        </label>
      </div>
      <footer className="player-intelligence-editor-footer">
        <label>
          <span>Identity verification note</span>
          <input
            minLength={10}
            name="reason"
            placeholder="Official source used to verify this identity"
            required
          />
        </label>
        <div>
          <button className="hq-button hq-button--primary" disabled={pending}>
            {pending ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <ShieldCheck size={16} />
            )}
            {pending ? "Saving identity…" : "Save canonical identity"}
          </button>
        </div>
        <ActionFeedback state={state} />
      </footer>
    </form>
  );
}

function ProfileEditor({
  detail,
}: {
  readonly detail: PlayerIntelligenceDetail;
}) {
  const [state, action, pending] = useActionState(
    savePlayerPublicProfileAction,
    initialState,
  );
  const profile = detail.profile;
  const proposal = profile?.proposal;
  const stats = profile?.careerStats ?? {};
  const proposedStats = proposal?.careerStats ?? {};
  const country = profileValue(
    profile?.countryCode,
    proposal?.countryCode ?? detail.ranking?.countryCode,
  );
  return (
    <form action={action} className="hq-card player-intelligence-editor">
      <input name="personId" type="hidden" value={detail.person.id} />
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Reviewed Duna editorial layer</span>
          <h2>Public profile story</h2>
        </div>
        <Badge tone={statusTone(profile?.publicationStatus ?? "draft")}>
          {profile?.publicationStatus ?? "draft"}
        </Badge>
      </header>
      <div className="player-intelligence-form-grid">
        <label className="is-wide">
          <span>One-line introduction</span>
          <textarea
            defaultValue={profileValue(profile?.shortBio, proposal?.shortBio)}
            maxLength={700}
            name="shortBio"
            placeholder="The concise answer a fan or search engine needs first."
            rows={2}
          />
        </label>
        <label className="is-wide">
          <span>Biography</span>
          <textarea
            defaultValue={profileValue(profile?.biography, proposal?.biography)}
            maxLength={2500}
            name="biography"
            placeholder="Verified career story, playing identity, and context."
            rows={7}
          />
        </label>
        <label>
          <span>Country code</span>
          <input defaultValue={country} maxLength={3} name="countryCode" />
        </label>
        <label>
          <span>Hometown</span>
          <input
            defaultValue={profileValue(profile?.hometown, proposal?.hometown)}
            name="hometown"
          />
        </label>
        <label>
          <span>College / university</span>
          <input
            defaultValue={profileValue(
              profile?.collegeName,
              proposal?.collegeName ?? detail.person.collegeName,
            )}
            name="collegeName"
          />
        </label>
        <label>
          <span>College logo URL</span>
          <input
            defaultValue={profile?.collegeLogoUrl ?? ""}
            name="collegeLogoUrl"
          />
        </label>
        <label>
          <span>Playing role</span>
          <input
            defaultValue={profileValue(
              profile?.playingRole,
              proposal?.playingRole,
            )}
            name="playingRole"
            placeholder="Blocker, defender, or all-around"
          />
        </label>
        <label>
          <span>Accessible image description</span>
          <input
            defaultValue={profile?.imageAlt ?? ""}
            name="imageAlt"
            placeholder={`${detail.person.displayName} playing beach volleyball`}
          />
        </label>
      </div>
      <fieldset className="player-intelligence-stat-fields">
        <legend>Career record</legend>
        {(
          [
            ["events", "Events"],
            ["wins", "Event wins"],
            ["podiums", "Podiums"],
            ["gold", "Gold"],
            ["silver", "Silver"],
            ["bronze", "Bronze"],
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            <span>{label}</span>
            <input
              defaultValue={stats[key] ?? proposedStats[key]}
              min="0"
              name={key}
              type="number"
            />
          </label>
        ))}
        <label>
          <span>Career earnings, minor units</span>
          <input
            defaultValue={stats.earningsMinor ?? proposedStats.earningsMinor}
            min="0"
            name="earningsMinor"
            type="number"
          />
        </label>
        <label>
          <span>Currency</span>
          <input
            defaultValue={
              stats.earningsCurrency ?? proposedStats.earningsCurrency
            }
            maxLength={3}
            name="earningsCurrency"
            placeholder="USD"
          />
        </label>
      </fieldset>
      <div className="player-intelligence-form-grid">
        <label className="is-wide">
          <span>Profile links · one per line</span>
          <textarea
            defaultValue={linksAsText(detail)}
            name="links"
            placeholder="Instagram | https://instagram.com/player | instagram"
            rows={4}
          />
          <small>
            Format: Label | URL | website, instagram, youtube, or news
          </small>
        </label>
        <label className="is-wide">
          <span>Recent coverage · one per line</span>
          <textarea
            defaultValue={newsAsText(detail)}
            name="news"
            placeholder="Headline | https://article.com | Publisher | 2026-08-05"
            rows={4}
          />
          <small>Only add reporting that is genuinely about this player.</small>
        </label>
      </div>
      <section className="player-intelligence-media-urls">
        <header>
          <ImageIcon size={18} />
          <span>
            <strong>Approved public artwork</strong>
            <small>
              These editorial URLs override generated or source imagery.
            </small>
          </span>
        </header>
        <div className="player-intelligence-form-grid">
          <label>
            <span>Transparent player cutout</span>
            <input
              defaultValue={profile?.cutoutImageUrl ?? ""}
              name="cutoutImageUrl"
            />
          </label>
          <label>
            <span>Poster / profile hero</span>
            <input
              defaultValue={profile?.heroImageUrl ?? ""}
              name="heroImageUrl"
            />
          </label>
          <label className="is-wide">
            <span>Profile hero video</span>
            <input
              defaultValue={profile?.heroVideoUrl ?? ""}
              name="heroVideoUrl"
            />
          </label>
        </div>
      </section>
      <footer className="player-intelligence-editor-footer">
        <label>
          <span>Editorial review note</span>
          <input
            minLength={10}
            name="reason"
            placeholder="What was verified, changed, and why"
            required
          />
        </label>
        <div>
          <button
            className="hq-button hq-button--secondary"
            disabled={pending}
            name="publicationStatus"
            value="draft"
          >
            Save private draft
          </button>
          <button
            className="hq-button hq-button--primary"
            disabled={pending}
            name="publicationStatus"
            value="published"
          >
            {pending ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <ShieldCheck size={16} />
            )}
            Publish reviewed profile
          </button>
        </div>
        <ActionFeedback state={state} />
      </footer>
    </form>
  );
}

function EvidencePanel({
  detail,
}: {
  readonly detail: PlayerIntelligenceDetail;
}) {
  const proposal = detail.profile?.proposal;
  const evidence = proposal?.evidence ?? detail.profile?.researchEvidence ?? [];
  return (
    <section className="hq-card player-intelligence-evidence">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Source-by-source verification</span>
          <h2>Research evidence</h2>
        </div>
        <Badge>{evidence.length}</Badge>
      </header>
      {proposal && (
        <div className="player-intelligence-model-note">
          <Bot size={17} />
          <span>
            <strong>{proposal.model}</strong>
            <small>
              Generated {new Date(proposal.generatedAt).toLocaleString()}{" "}
              through Vercel AI Gateway
            </small>
          </span>
        </div>
      )}
      <div className="player-intelligence-evidence-list">
        {evidence.map((item) => (
          <a href={item.url} key={item.url} rel="noreferrer" target="_blank">
            <span>
              <strong>{item.title}</strong>
              <small>{item.description ?? new URL(item.url).hostname}</small>
            </span>
            <ExternalLink size={15} />
          </a>
        ))}
        {evidence.length === 0 && (
          <p>
            No research dossier exists yet. Run research before publishing
            biography claims.
          </p>
        )}
      </div>
      {proposal?.claims.length ? (
        <details className="player-intelligence-claims">
          <summary>{proposal.claims.length} field-level claims</summary>
          <div>
            {proposal.claims.map((claim, index) => (
              <article key={`${claim.field}-${index}`}>
                <span>{claim.field}</span>
                <strong>{claim.value}</strong>
                <small>{claim.confidence}% source confidence</small>
              </article>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}

function MediaWorkflow({
  detail,
  workflow,
}: {
  readonly detail: PlayerIntelligenceDetail;
  readonly workflow: PlayerIntelligenceDetail["workflows"][number];
}) {
  const [state, action, pending] = useActionState(
    reviewPlayerMediaWorkflowAction,
    initialState,
  );
  const cutout = workflow.outputImages.find((item) => item.kind === "cutout");
  const poster = workflow.outputImages.find((item) => item.kind === "poster");
  const background = workflow.outputImages.find(
    (item) => item.kind === "background",
  );
  return (
    <article className="player-media-review-card">
      <header>
        <span>
          <strong>Identity-faithful artwork brief</strong>
          <small>{new Date(workflow.createdAt).toLocaleString()}</small>
        </span>
        <Badge tone={statusTone(workflow.status)}>{workflow.status}</Badge>
      </header>
      <div className="player-media-reference-grid">
        {workflow.referenceImages.map((reference) => (
          <figure key={reference.url}>
            <Image alt="" fill sizes="120px" src={reference.url} />
            <figcaption>{reference.kind}</figcaption>
          </figure>
        ))}
      </div>
      <details>
        <summary>Generation brief and models</summary>
        <p>{workflow.brief ?? "No additional player direction."}</p>
        <pre>{workflow.generationPrompt}</pre>
        <small>
          Cutout: {workflow.models.cutout ?? "not set"} · Poster:{" "}
          {workflow.models.poster ?? "not set"}
        </small>
      </details>
      <form action={action} className="player-media-review-form">
        <input name="workflowId" type="hidden" value={workflow.id} />
        <input name="personId" type="hidden" value={detail.person.id} />
        <label>
          <span>Transparent cutout output</span>
          <input
            defaultValue={cutout?.url}
            name="cutoutUrl"
            placeholder="https://…"
          />
        </label>
        <label>
          <span>Poster / hero output</span>
          <input
            defaultValue={poster?.url}
            name="posterUrl"
            placeholder="https://…"
          />
        </label>
        <label>
          <span>Background artwork output</span>
          <input
            defaultValue={background?.url}
            name="backgroundUrl"
            placeholder="https://…"
          />
        </label>
        <label className="is-wide">
          <span>Review note</span>
          <input
            minLength={10}
            name="reason"
            placeholder="Identity fidelity, rights, composition, and publishing decision"
            required
          />
        </label>
        <footer>
          <button
            className="hq-button hq-button--secondary"
            disabled={pending}
            name="decision"
            value="review"
          >
            Keep in review
          </button>
          <button
            className="hq-button hq-button--danger"
            disabled={pending}
            name="decision"
            value="rejected"
          >
            Reject
          </button>
          <button
            className="hq-button hq-button--primary"
            disabled={pending}
            name="decision"
            value="published"
          >
            {pending ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <ShieldCheck size={16} />
            )}
            Approve artwork
          </button>
        </footer>
        <ActionFeedback state={state} />
      </form>
    </article>
  );
}

function PlayerDetail({
  detail,
  filters,
}: {
  readonly detail: PlayerIntelligenceDetail;
  readonly filters: {
    readonly query?: string;
    readonly gender?: "men" | "women";
    readonly status?: "all" | "not-started" | "review" | "published" | "failed";
  };
}) {
  return (
    <section className="player-intelligence-detail">
      <header className="player-intelligence-detail-heading">
        <Link href={buildHref(filters, {})}>
          <ArrowLeft size={16} /> Back to queue
        </Link>
        <div>
          <span className="player-intelligence-detail-flag">
            {flagEmoji(
              detail.profile?.countryCode ?? detail.ranking?.countryCode,
            )}
          </span>
          <span>
            <small>
              {detail.ranking
                ? `World #${detail.ranking.rank} · ${detail.ranking.genderCategory}`
                : "Canonical Duna player"}
            </small>
            <h2>{detail.person.displayName}</h2>
            <p>
              @{detail.person.handle} ·{" "}
              {detail.profile?.hometown ??
                detail.person.homeMarket ??
                "Home market pending"}
            </p>
          </span>
        </div>
        <nav>
          <ResearchPlayer personId={detail.person.id} />
          <a
            className="hq-button hq-button--secondary"
            href={`${consumerOrigin}${detail.publicPath}`}
            rel="noreferrer"
            target="_blank"
          >
            Public page <ExternalLink size={15} />
          </a>
        </nav>
      </header>
      <CanonicalIdentityEditor detail={detail} />
      <div className="player-intelligence-review-layout">
        <ProfileEditor detail={detail} />
        <EvidencePanel detail={detail} />
      </div>
      <section className="hq-card player-media-review-queue">
        <header className="hq-card-heading">
          <div>
            <span className="hq-eyebrow">Player-submitted references</span>
            <h2>Higgsfield artwork review</h2>
          </div>
          <Badge>{detail.workflows.length}</Badge>
        </header>
        <p className="player-media-review-intro">
          One action photo and two or three portraits establish facial dynamics.
          Generated assets remain private until identity fidelity, image rights,
          and composition are approved here.
        </p>
        <div className="player-media-review-list">
          {detail.workflows.map((workflow) => (
            <MediaWorkflow
              detail={detail}
              key={workflow.id}
              workflow={workflow}
            />
          ))}
          {detail.workflows.length === 0 && (
            <div className="player-intelligence-empty">
              <ImageIcon size={24} />
              <strong>No player artwork request yet.</strong>
              <span>
                The player can submit references from their Profile artwork
                settings.
              </span>
            </div>
          )}
        </div>
      </section>
    </section>
  );
}

export function PlayerIntelligenceAdminPanel({
  data,
  detail,
  query,
  gender,
  status,
}: {
  readonly data: PlayerIntelligenceAdmin;
  readonly detail?: PlayerIntelligenceDetail;
  readonly query?: string;
  readonly gender?: "men" | "women";
  readonly status?: "all" | "not-started" | "review" | "published" | "failed";
}) {
  const filters = { query, gender, status };
  return (
    <div className="player-intelligence-admin">
      <section className="player-intelligence-metrics">
        {metricCards(data).map(([label, number, description]) => (
          <article className="hq-card" key={label}>
            <span>{label}</span>
            <Numeric>{number}</Numeric>
            <small>{description}</small>
          </article>
        ))}
      </section>
      <BatchResearch />
      {detail ? (
        <PlayerDetail detail={detail} filters={filters} />
      ) : (
        <PlayerQueue data={data} filters={filters} />
      )}
    </div>
  );
}
