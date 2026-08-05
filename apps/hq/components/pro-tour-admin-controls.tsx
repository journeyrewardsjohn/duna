"use client";

import { upload } from "@vercel/blob/client";
import type { SandDataOverview } from "@duna/api";
import type { PersonSummary } from "@duna/core";
import { Badge, Numeric } from "@duna/ui";
import {
  ArrowUpRight,
  Bot,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  CloudUpload,
  ExternalLink,
  FileVideo2,
  ImageIcon,
  Link2,
  LoaderCircle,
  MapPin,
  Radio,
  RefreshCw,
  ScanSearch,
  Search,
  ShieldCheck,
  Trash2,
  Trophy,
  TicketCheck,
  Tv,
  UsersRound,
  X,
} from "lucide-react";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import {
  applyProfessionalEventResearchAction,
  linkSandPlayerAction,
  refreshAvpLeagueAction,
  refreshFivbIndexAction,
  removeProfessionalEventMediaAction,
  removeProfessionalWatchOptionAction,
  researchProfessionalEventAction,
  saveAvpRosterAssignmentAction,
  saveProfessionalEventEditorialAction,
  saveProfessionalEventMediaAction,
  saveProfessionalMatchScheduleAction,
  saveProfessionalWatchOptionAction,
  type SandActionState,
} from "@/app/admin/sand-actions";
import {
  createProfessionalEventMediaPath,
  optimizeImageUpload,
} from "@/lib/media-storage";
import { AddressEntry, type AddressValue } from "./place-address-fields";
import { PlayerCombobox, type PlayerComboboxOption } from "./player-combobox";
import {
  eventBroadcastCoverage,
  filterProfessionalEvents,
  professionalEventTour,
  type ProfessionalEvent,
  type ProfessionalStatusFilter,
  type ProfessionalTourFilter,
} from "./pro-tour-admin-helpers";
import { TimezoneSelect } from "./timezone-select";

const initialState: SandActionState = { status: "idle", message: "" };
const webOrigin =
  process.env.NEXT_PUBLIC_DUNA_WEB_URL?.replace(/\/$/, "") ??
  "https://duna.coach";

type AvpTeam = SandDataOverview["avpTeams"][number];
type WatchOption = ProfessionalEvent["watchOptions"][number];
export type ProfessionalTourTool =
  | "overview"
  | "events"
  | "editorial"
  | "research"
  | "schedule"
  | "broadcasts"
  | "rosters"
  | "mappings"
  | "sources";

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

function Pagination({
  count,
  page,
  pageSize,
  setPage,
}: {
  readonly count: number;
  readonly page: number;
  readonly pageSize: number;
  readonly setPage: (page: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(count / pageSize));
  if (pageCount <= 1) return null;
  return (
    <nav aria-label="Pagination" className="pro-admin-pagination">
      <button disabled={page <= 0} onClick={() => setPage(page - 1)}>
        Previous
      </button>
      <span>
        Page {page + 1} of {pageCount}
      </span>
      <button
        disabled={page >= pageCount - 1}
        onClick={() => setPage(page + 1)}
      >
        Next
      </button>
    </nav>
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
  onManageDetails,
}: {
  readonly event: ProfessionalEvent;
  readonly onManageBroadcast: (eventId: string) => void;
  readonly onManageDetails: (eventId: string) => void;
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
          onClick={() => onManageDetails(event.id)}
          type="button"
        >
          <ImageIcon aria-hidden size={15} /> Edit details + media
        </button>
        <button
          className="hq-button hq-button--secondary"
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
  onManageDetails,
}: {
  readonly events: SandDataOverview["events"];
  readonly onManageBroadcast: (eventId: string) => void;
  readonly onManageDetails: (eventId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [tour, setTour] = useState<ProfessionalTourFilter>("all");
  const [status, setStatus] = useState<ProfessionalStatusFilter>("active");
  const [page, setPage] = useState(0);
  const pageSize = 12;
  const filtered = useMemo(
    () => filterProfessionalEvents(events, { query, status, tour }),
    [events, query, status, tour],
  );
  useEffect(() => setPage(0), [query, status, tour]);
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
        {filtered.slice(page * pageSize, (page + 1) * pageSize).map((event) => (
          <SyncedEventCard
            event={event}
            key={event.id}
            onManageBroadcast={onManageBroadcast}
            onManageDetails={onManageDetails}
          />
        ))}
      </div>
      {filtered.length === 0 && (
        <p className="hq-empty">No synced events match these filters.</p>
      )}
      <Pagination
        count={filtered.length}
        page={page}
        pageSize={pageSize}
        setPage={setPage}
      />
    </section>
  );
}

function ProfessionalMediaRow({
  eventId,
  media,
}: {
  readonly eventId: string;
  readonly media: ProfessionalEvent["editorial"]["media"][number];
}) {
  const [state, action, pending] = useActionState(
    removeProfessionalEventMediaAction,
    initialState,
  );
  return (
    <article className="pro-admin-media-row">
      {media.kind === "hero-video" ? (
        <video muted playsInline poster={media.posterUrl} src={media.url} />
      ) : (
        <img alt={media.alt} src={media.url} />
      )}
      <div>
        <span>
          <Badge>{media.kind.replace("-", " ")}</Badge>
          {media.featured && <Badge tone="positive">Featured</Badge>}
        </span>
        <strong>{media.alt}</strong>
        {media.caption && <small>{media.caption}</small>}
      </div>
      <form action={action}>
        <input name="professionalEventId" type="hidden" value={eventId} />
        <input name="mediaId" type="hidden" value={media.id} />
        <input
          aria-label="Removal reason"
          name="reason"
          placeholder="Reason for removal"
          required
        />
        <button disabled={pending} type="submit">
          <Trash2 aria-hidden size={15} /> Remove
        </button>
        <ActionFeedback state={state} />
      </form>
    </article>
  );
}

function ProfessionalMediaForm({
  event,
}: {
  readonly event: ProfessionalEvent;
}) {
  const [kind, setKind] = useState<"poster" | "hero-image" | "hero-video">(
    "poster",
  );
  const [url, setUrl] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [fileSummary, setFileSummary] = useState<{
    readonly name: string;
    readonly size: number;
    readonly width?: number;
    readonly height?: number;
  }>();
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploadState, setUploadState] = useState<
    "idle" | "uploading" | "ready" | "error"
  >("idle");
  const [uploadMessage, setUploadMessage] = useState("");
  const [state, action, pending] = useActionState(
    saveProfessionalEventMediaAction,
    initialState,
  );

  const clearMedia = () => {
    if (previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setPreviewUrl("");
    setUrl("");
    setFileSummary(undefined);
    setUploadProgress(0);
    setUploadMessage("");
    setUploadState("idle");
    if (fileInput.current) fileInput.current.value = "";
  };

  const uploadMedia = async (file?: File) => {
    if (!file) return;
    if (previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    const localPreview = URL.createObjectURL(file);
    setPreviewUrl(localPreview);
    setFileSummary({ name: file.name, size: file.size });
    setUploadProgress(0);
    setUploadState("uploading");
    setUploadMessage("Preparing media…");
    try {
      if (file.type.startsWith("image/")) {
        const bitmap = await createImageBitmap(file);
        setFileSummary({
          name: file.name,
          size: file.size,
          width: bitmap.width,
          height: bitmap.height,
        });
        setKind(bitmap.width / bitmap.height < 0.9 ? "poster" : "hero-image");
        bitmap.close();
      } else {
        setKind("hero-video");
      }
      const prepared = file.type.startsWith("image/")
        ? await optimizeImageUpload(file)
        : file;
      setUploadMessage("Uploading to Duna storage…");
      const stored = await upload(
        createProfessionalEventMediaPath(event.id, prepared.type),
        prepared,
        {
          access: "public",
          clientPayload: JSON.stringify({
            professionalEventId: event.id,
            fileName: prepared.name,
            contentType: prepared.type,
            size: prepared.size,
          }),
          contentType: prepared.type,
          handleUploadUrl: "/api/admin/pro-media/upload",
          multipart: prepared.size > 100_000_000,
          onUploadProgress: ({ percentage }) => {
            setUploadProgress(Math.round(percentage));
            setUploadMessage(`Uploading… ${Math.round(percentage)}%`);
          },
        },
      );
      if (!stored.url) throw new Error("Storage did not return a media URL.");
      URL.revokeObjectURL(localPreview);
      setPreviewUrl(stored.url);
      setUrl(stored.url);
      setUploadProgress(100);
      setUploadState("ready");
      setUploadMessage("Ready to publish");
    } catch (error) {
      setUploadState("error");
      setUploadMessage(
        error instanceof Error ? error.message : "Media upload failed.",
      );
    }
  };
  return (
    <form action={action} className="pro-admin-media-form">
      <input name="professionalEventId" type="hidden" value={event.id} />
      <header>
        <div>
          <span className="hq-eyebrow">Event creative</span>
          <h3>Build the event&apos;s visual story</h3>
          <p>
            Upload once, preview the final treatment, then choose where it
            belongs.
          </p>
        </div>
        <Badge>{event.editorial.media.length} published</Badge>
      </header>
      <input
        accept="image/avif,image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
        className="pro-admin-media-file-input"
        disabled={uploadState === "uploading"}
        onChange={(input) => void uploadMedia(input.target.files?.[0])}
        ref={fileInput}
        type="file"
      />
      <div
        className={`pro-admin-media-studio${dragActive ? " is-dragging" : ""}${previewUrl ? " has-preview" : ""}`}
        onDragEnter={(drag) => {
          drag.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={(drag) => {
          drag.preventDefault();
          if (drag.currentTarget === drag.target) setDragActive(false);
        }}
        onDragOver={(drag) => drag.preventDefault()}
        onDrop={(drag) => {
          drag.preventDefault();
          setDragActive(false);
          void uploadMedia(drag.dataTransfer.files[0]);
        }}
      >
        <div
          className={`pro-admin-media-preview pro-admin-media-preview--${kind}`}
        >
          {previewUrl ? (
            kind === "hero-video" ? (
              <video controls muted playsInline src={previewUrl} />
            ) : (
              <img alt="Selected event media preview" src={previewUrl} />
            )
          ) : (
            <div className="pro-admin-media-preview__empty">
              <CloudUpload aria-hidden size={30} />
              <strong>Drop a poster, photo, or video</strong>
              <span>or choose an original file from your computer</span>
            </div>
          )}
          {previewUrl && (
            <span className="pro-admin-media-preview__placement">
              {kind === "poster"
                ? "Poster preview"
                : kind === "hero-video"
                  ? "Hero video preview"
                  : "Hero image preview"}
            </span>
          )}
        </div>
        <div className="pro-admin-media-studio__controls">
          <span className="hq-eyebrow">Original asset</span>
          <h4>{fileSummary?.name ?? "Choose media to begin"}</h4>
          {fileSummary ? (
            <p>
              {(fileSummary.size / 1_048_576).toFixed(1)} MB
              {fileSummary.width && fileSummary.height
                ? ` · ${fileSummary.width} × ${fileSummary.height}px`
                : ""}
            </p>
          ) : (
            <p>JPG, PNG, WebP, AVIF, MP4, MOV, or WebM</p>
          )}
          <div className="pro-admin-media-studio__actions">
            <button
              disabled={uploadState === "uploading"}
              onClick={() => fileInput.current?.click()}
              type="button"
            >
              <CloudUpload aria-hidden size={16} />
              {previewUrl ? "Replace media" : "Browse files"}
            </button>
            {previewUrl && uploadState !== "uploading" && (
              <button onClick={clearMedia} type="button">
                <X aria-hidden size={16} /> Remove
              </button>
            )}
          </div>
          <small>Images up to 15 MB · video up to 250 MB</small>
          {uploadState === "uploading" && (
            <div
              aria-label={`Upload ${uploadProgress}% complete`}
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={uploadProgress}
              className="pro-admin-media-progress"
              role="progressbar"
            >
              <span style={{ width: `${uploadProgress}%` }} />
            </div>
          )}
          {uploadMessage && (
            <p
              className={`pro-admin-media-status pro-admin-media-status--${uploadState}`}
              role={uploadState === "error" ? "alert" : "status"}
            >
              {uploadState === "ready" && (
                <CheckCircle2 aria-hidden size={15} />
              )}
              {uploadState === "uploading" && (
                <LoaderCircle aria-hidden className="spin" size={15} />
              )}
              {uploadMessage}
            </p>
          )}
        </div>
      </div>
      <fieldset className="pro-admin-media-placement">
        <legend>Choose placement</legend>
        {(
          [
            ["poster", "Promotional poster", "Portrait · event campaign"],
            ["hero-image", "Hero image", "Wide · event overview"],
            ["hero-video", "Hero video", "Wide motion · muted autoplay"],
          ] as const
        ).map(([value, label, helper]) => (
          <label className={kind === value ? "is-selected" : ""} key={value}>
            <input
              checked={kind === value}
              name="kind"
              onChange={() => setKind(value)}
              type="radio"
              value={value}
            />
            {value === "hero-video" ? (
              <FileVideo2 aria-hidden size={18} />
            ) : (
              <ImageIcon aria-hidden size={18} />
            )}
            <span>
              <strong>{label}</strong>
              <small>{helper}</small>
            </span>
          </label>
        ))}
      </fieldset>
      <details className="pro-admin-media-url">
        <summary>
          <Link2 aria-hidden size={15} /> Use a hosted media URL instead
        </summary>
        <label>
          <span>Media URL</span>
          <input
            name="url"
            onChange={(input) => {
              setUrl(input.target.value);
              if (!fileSummary) setPreviewUrl(input.target.value);
            }}
            placeholder="https://…"
            required
            type="url"
            value={url}
          />
        </label>
      </details>
      <div className="pro-admin-media-form__grid">
        <label>
          <span>Video poster URL</span>
          <input
            disabled={kind !== "hero-video"}
            name="posterUrl"
            placeholder="Optional still image"
            type="url"
          />
        </label>
        <label>
          <span>Accessible description</span>
          <input
            defaultValue={`${event.name} promotional artwork`}
            name="alt"
            required
          />
        </label>
        <label className="pro-admin-media-form__wide">
          <span>Caption</span>
          <input name="caption" placeholder="Optional public caption" />
        </label>
        <label className="pro-admin-toggle">
          <input defaultChecked name="featured" type="checkbox" />
          <span>Feature this in the event hero</span>
        </label>
        <label className="pro-admin-media-form__wide">
          <span>Review note</span>
          <input
            name="reason"
            placeholder="Source, rights, and reason for publishing"
            required
          />
        </label>
      </div>
      <button
        className="hq-button hq-button--primary pro-admin-media-publish"
        disabled={pending || uploadState === "uploading" || !url}
      >
        {pending ? (
          <LoaderCircle className="spin" size={16} />
        ) : (
          <CheckCircle2 size={16} />
        )}
        Publish to event
      </button>
      <ActionFeedback state={state} />
    </form>
  );
}

function EventEditorialForm({ event }: { readonly event: ProfessionalEvent }) {
  const [state, action, pending] = useActionState(
    saveProfessionalEventEditorialAction,
    initialState,
  );
  const [venueName, setVenueName] = useState(event.editorial.venueName ?? "");
  const [timeZone, setTimeZone] = useState(event.editorial.timezone ?? "");
  const [recommendedTimeZone, setRecommendedTimeZone] = useState(
    event.editorial.timezone ?? "",
  );
  const initialAddress: AddressValue = event.editorial.venue ?? {
    formattedAddress: event.editorial.venueAddress,
    countryCode: event.countryCode,
  };

  return (
    <form action={action} className="pro-admin-editorial-form">
      <input name="professionalEventId" type="hidden" value={event.id} />
      {(
        [
          ["Name", "name", "overrideName", "text"],
          ["Location", "location", "overrideLocation", "text"],
          ["Category", "category", "overrideCategory", "text"],
          ["Start date", "startsOn", "overrideStartsOn", "date"],
          ["End date", "endsOn", "overrideEndsOn", "date"],
        ] as const
      ).map(([label, field, toggle, type]) => (
        <label className="pro-admin-override-field" key={field}>
          <span>
            <input
              defaultChecked={Boolean(event.editorial.overrides[field])}
              name={toggle}
              type="checkbox"
            />
            Override {label.toLowerCase()}
          </span>
          <input defaultValue={event[field] ?? ""} name={field} type={type} />
          <small>Source: {event.scraped[field] ?? "Not provided"}</small>
        </label>
      ))}
      <label className="pro-admin-editorial-form__wide">
        <span>Event overview</span>
        <textarea
          defaultValue={event.editorial.summary ?? ""}
          name="summary"
          placeholder="A concise public introduction to this stop"
          rows={4}
        />
      </label>
      <label>
        <span>Venue name</span>
        <input
          name="venueName"
          onChange={(input) => setVenueName(input.target.value)}
          placeholder="e.g. Comerica Center"
          value={venueName}
        />
      </label>
      <TimezoneSelect
        onChange={setTimeZone}
        recommended={recommendedTimeZone || undefined}
        value={timeZone}
      />
      <label>
        <span>Public ticket URL</span>
        <input
          defaultValue={event.editorial.ticketUrl ?? ""}
          name="ticketUrl"
          placeholder="Official event or verified ticket page"
          type="url"
        />
      </label>
      <div className="pro-admin-editorial-form__wide">
        <AddressEntry
          initial={initialAddress}
          label="Search for the event venue"
          onPlaceResolved={(place) => {
            if (!place.timeZone) return;
            setRecommendedTimeZone(place.timeZone);
            setTimeZone(place.timeZone);
          }}
          onVenueName={(name) => {
            if (name) setVenueName(name);
          }}
          required={false}
        />
      </div>
      <label className="pro-admin-editorial-form__reason">
        <span>Review note</span>
        <input
          name="reason"
          placeholder="Source and reason for these Duna-managed details"
          required
        />
      </label>
      <button className="hq-button hq-button--primary" disabled={pending}>
        {pending ? (
          <LoaderCircle className="spin" size={16} />
        ) : (
          <ShieldCheck size={16} />
        )}
        Save editorial details
      </button>
      <ActionFeedback state={state} />
    </form>
  );
}

function EditorialWorkspace({
  events,
  selectedEventId,
  setSelectedEventId,
}: {
  readonly events: readonly ProfessionalEvent[];
  readonly selectedEventId: string;
  readonly setSelectedEventId: (eventId: string) => void;
}) {
  const selectedEvent =
    events.find((event) => event.id === selectedEventId) ?? events[0];
  return (
    <section className="hq-card pro-admin-editorial">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Duna editorial layer</span>
          <h2>Event details + promotional media</h2>
        </div>
        <ImageIcon aria-hidden size={20} />
      </header>
      <p>
        Scraped values remain visible below. Enable only the fields Duna should
        control; disabling an override immediately returns that field to its
        synced source value.
      </p>
      {selectedEvent ? (
        <>
          <label className="pro-admin-event-picker">
            <span>Professional event</span>
            <select
              onChange={(event) => setSelectedEventId(event.target.value)}
              value={selectedEvent.id}
            >
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.name} · {dateLabel(event.startsOn)}
                </option>
              ))}
            </select>
          </label>
          <EventEditorialForm event={selectedEvent} key={selectedEvent.id} />
          <ProfessionalMediaForm event={selectedEvent} key={selectedEvent.id} />
          <div className="pro-admin-media-library">
            {selectedEvent.editorial.media.map((media) => (
              <ProfessionalMediaRow
                eventId={selectedEvent.id}
                key={media.id}
                media={media}
              />
            ))}
            {selectedEvent.editorial.media.length === 0 && (
              <p className="hq-empty">No promotional media published yet.</p>
            )}
          </div>
        </>
      ) : (
        <p className="hq-empty">Sync a professional event first.</p>
      )}
    </section>
  );
}

function ResearchRequestForm({ event }: { readonly event: ProfessionalEvent }) {
  const [state, action, pending] = useActionState(
    researchProfessionalEventAction,
    initialState,
  );
  return (
    <form action={action} className="pro-admin-research-request">
      <input name="professionalEventId" type="hidden" value={event.id} />
      <button className="hq-button hq-button--primary" disabled={pending}>
        {pending ? (
          <LoaderCircle aria-hidden className="spin" size={16} />
        ) : (
          <ScanSearch aria-hidden size={16} />
        )}
        {event.research.latest
          ? "Refresh verified research"
          : "Research this event"}
      </button>
      <small>
        Firecrawl searches the current event year. The Vercel AI Gateway turns
        cited evidence into a proposal for human review.
      </small>
      <ActionFeedback state={state} />
    </form>
  );
}

function confidenceFor(
  proposal: NonNullable<ProfessionalEvent["research"]["latest"]>,
  fields: readonly string[],
) {
  const scores = proposal.claims
    .filter((claim) => fields.includes(claim.field))
    .map((claim) => claim.confidence);
  return scores.length ? Math.max(...scores) : undefined;
}

function Confidence({ value }: { readonly value?: number }) {
  if (value === undefined) return <Badge>Not verified</Badge>;
  return (
    <Badge
      tone={value >= 85 ? "positive" : value >= 65 ? "warning" : "neutral"}
    >
      {value}% confidence
    </Badge>
  );
}

function ResearchProposalReview({
  event,
}: {
  readonly event: ProfessionalEvent;
}) {
  const proposal = event.research.latest;
  const [state, action, pending] = useActionState(
    applyProfessionalEventResearchAction,
    initialState,
  );
  if (!proposal) {
    return (
      <div className="pro-admin-research-empty">
        <Bot aria-hidden size={26} />
        <div>
          <h3>No research proposal yet</h3>
          <p>
            Run research to look for a verified venue, local timezone, dates,
            tickets, and broadcast options for this year&apos;s event.
          </p>
        </div>
      </div>
    );
  }
  const venueAddress =
    proposal.venue?.formattedAddress ?? proposal.venueAddress;
  const dateConfidence = confidenceFor(proposal, ["startsOn", "endsOn"]);
  const venueConfidence = confidenceFor(proposal, [
    "venueName",
    "venueAddress",
  ]);
  return (
    <article className="pro-admin-research-proposal">
      <header>
        <div>
          <span className="hq-eyebrow">Evidence-backed proposal</span>
          <h3>{event.name}</h3>
          <p>
            Generated {syncedLabel(proposal.generatedAt)} · {proposal.model}
          </p>
        </div>
        <Badge tone={proposal.status === "applied" ? "positive" : "warning"}>
          {proposal.status === "applied" ? "Applied" : "Needs review"}
        </Badge>
      </header>

      {proposal.overview && (
        <section className="pro-admin-research-summary">
          <span>
            <strong>Public overview</strong>
            <Confidence value={confidenceFor(proposal, ["overview"])} />
          </span>
          <p>{proposal.overview}</p>
        </section>
      )}

      <div className="pro-admin-research-facts">
        <section>
          <span>
            <CalendarDays aria-hidden size={17} /> Dates
          </span>
          <strong>
            {proposal.startsOn
              ? `${dateLabel(proposal.startsOn)}${proposal.endsOn && proposal.endsOn !== proposal.startsOn ? ` – ${dateLabel(proposal.endsOn)}` : ""}`
              : "Not verified"}
          </strong>
          <Confidence value={dateConfidence} />
        </section>
        <section>
          <span>
            <MapPin aria-hidden size={17} /> Venue
          </span>
          <strong>{proposal.venueName ?? "Not verified"}</strong>
          <small>{venueAddress ?? "No verified address"}</small>
          {proposal.venue?.timezone && <small>{proposal.venue.timezone}</small>}
          <Confidence value={venueConfidence} />
        </section>
        <section>
          <span>
            <TicketCheck aria-hidden size={17} /> Tickets
          </span>
          {proposal.ticketUrl ? (
            <a href={proposal.ticketUrl} rel="noreferrer" target="_blank">
              Open verified ticket page <ExternalLink aria-hidden size={13} />
            </a>
          ) : (
            <strong>Not verified</strong>
          )}
          <Confidence value={confidenceFor(proposal, ["ticketUrl"])} />
        </section>
      </div>

      <section className="pro-admin-research-broadcasts">
        <header>
          <div>
            <strong>Proposed How to Watch</strong>
            <small>Only options supported by a cited source are shown.</small>
          </div>
          <Badge>{proposal.watchOptions.length}</Badge>
        </header>
        {proposal.watchOptions.length ? (
          <div>
            {proposal.watchOptions.map((option, index) => (
              <article key={`${option.kind}-${option.url ?? index}`}>
                <Tv aria-hidden size={16} />
                <span>
                  <strong>{option.channelName ?? option.label}</strong>
                  <small>{option.label}</small>
                </span>
                <Confidence value={option.confidence} />
                {option.url && (
                  <a href={option.url} rel="noreferrer" target="_blank">
                    Open <ExternalLink aria-hidden size={12} />
                  </a>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p className="hq-empty">No broadcast information was verified.</p>
        )}
      </section>

      <section className="pro-admin-research-evidence">
        <header>
          <div>
            <strong>Sources to review</strong>
            <small>
              Official tour, venue, broadcaster, and reputable ticketing pages
              are preferred.
            </small>
          </div>
          <Badge>{proposal.evidence.length}</Badge>
        </header>
        <div>
          {proposal.evidence.map((source) => (
            <a
              href={source.url}
              key={source.url}
              rel="noreferrer"
              target="_blank"
            >
              <span>
                <strong>{source.title}</strong>
                <small>
                  {new URL(source.url).hostname.replace(/^www\./, "")}
                </small>
              </span>
              <ExternalLink aria-hidden size={14} />
            </a>
          ))}
        </div>
      </section>

      {proposal.status === "review" ? (
        <form action={action} className="pro-admin-research-approval">
          <input name="professionalEventId" type="hidden" value={event.id} />
          <input name="proposalId" type="hidden" value={proposal.id} />
          <label>
            <span>Approval note</span>
            <input
              minLength={10}
              name="reason"
              placeholder="What you reviewed and why these details are trusted"
              required
            />
          </label>
          <button className="hq-button hq-button--primary" disabled={pending}>
            {pending ? (
              <LoaderCircle aria-hidden className="spin" size={16} />
            ) : (
              <ShieldCheck aria-hidden size={16} />
            )}
            Approve and publish verified details
          </button>
          <small>
            This publishes supported details as Duna-managed editorial values.
            Existing staff edits remain visible in the Details + media tool.
          </small>
          <ActionFeedback state={state} />
        </form>
      ) : (
        <p className="pro-admin-research-applied">
          <CheckCircle2 aria-hidden size={16} /> This proposal has been reviewed
          and applied. Run a fresh search if the event changes.
        </p>
      )}
    </article>
  );
}

function ResearchWorkspace({
  events,
  selectedEventId,
  setSelectedEventId,
}: {
  readonly events: readonly ProfessionalEvent[];
  readonly selectedEventId: string;
  readonly setSelectedEventId: (eventId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [tour, setTour] = useState<ProfessionalTourFilter>("all");
  const [status, setStatus] = useState<ProfessionalStatusFilter>("active");
  const [page, setPage] = useState(0);
  const pageSize = 8;
  const filtered = useMemo(
    () => filterProfessionalEvents(events, { query, status, tour }),
    [events, query, status, tour],
  );
  useEffect(() => setPage(0), [query, status, tour]);
  const selectedEvent =
    filtered.find((event) => event.id === selectedEventId) ?? filtered[0];

  return (
    <section className="hq-card pro-admin-research">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Verified event discovery</span>
          <h2>Research upcoming event details</h2>
        </div>
        <ScanSearch aria-hidden size={21} />
      </header>
      <p>
        Search this year&apos;s public web for venue, dates, tickets, and
        broadcast details. Every suggestion stays private until a super admin
        reviews its sources and approves it.
      </p>
      <EventFilters
        query={query}
        setQuery={setQuery}
        setStatus={setStatus}
        setTour={setTour}
        status={status}
        tour={tour}
      />
      {selectedEvent ? (
        <div className="pro-admin-research-workspace">
          <aside>
            <div className="pro-admin-research-event-list">
              {filtered
                .slice(page * pageSize, (page + 1) * pageSize)
                .map((event) => (
                  <button
                    aria-pressed={selectedEvent.id === event.id}
                    className={
                      selectedEvent.id === event.id ? "active" : undefined
                    }
                    key={event.id}
                    onClick={() => setSelectedEventId(event.id)}
                    type="button"
                  >
                    <span>
                      <Badge tone={eventTone(event)}>
                        {event.live ? "live" : event.status}
                      </Badge>
                      {event.research.latest && (
                        <Badge
                          tone={
                            event.research.latest.status === "applied"
                              ? "positive"
                              : "warning"
                          }
                        >
                          {event.research.latest.status === "applied"
                            ? "Applied"
                            : "Review"}
                        </Badge>
                      )}
                    </span>
                    <strong>{event.name}</strong>
                    <small>
                      {dateRange(event)} ·{" "}
                      {event.location ?? "Location pending"}
                    </small>
                  </button>
                ))}
            </div>
            <Pagination
              count={filtered.length}
              page={page}
              pageSize={pageSize}
              setPage={setPage}
            />
          </aside>
          <main>
            <ResearchRequestForm
              event={selectedEvent}
              key={`request-${selectedEvent.id}`}
            />
            <ResearchProposalReview
              event={selectedEvent}
              key={`proposal-${selectedEvent.id}`}
            />
          </main>
        </div>
      ) : (
        <p className="hq-empty">No events match these filters.</p>
      )}
    </section>
  );
}

function localDateTimeValue(value: string | undefined, timeZone: string) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

function AvpScheduleWorkspace({
  data,
  selectedEventId,
  setSelectedEventId,
}: {
  readonly data: SandDataOverview;
  readonly selectedEventId: string;
  readonly setSelectedEventId: (eventId: string) => void;
}) {
  const events = data.events.filter(
    (event) => event.sourceSlug === "avp-league",
  );
  const selectedEvent =
    events.find((event) => event.id === selectedEventId) ?? events[0];
  const [matchId, setMatchId] = useState("");
  const [gender, setGender] = useState<"men" | "women">("women");
  const [teamAName, setTeamAName] = useState("");
  const [teamBName, setTeamBName] = useState("");
  const [localStartsAt, setLocalStartsAt] = useState("");
  const [scheduleTimeZone, setScheduleTimeZone] = useState(
    selectedEvent?.editorial.timezone ?? "America/Chicago",
  );
  const [roundLabel, setRoundLabel] = useState("");
  const [court, setCourt] = useState("");
  const [page, setPage] = useState(0);
  const [state, action, pending] = useActionState(
    saveProfessionalMatchScheduleAction,
    initialState,
  );
  const timeZone = selectedEvent?.editorial.timezone ?? "America/Chicago";
  const weekLabel =
    selectedEvent?.name.match(/week\s+\d+/i)?.[0] ?? "League match";
  const teams = data.avpTeams.filter(
    (team) =>
      team.season === selectedEvent?.avpSeason && team.gender === gender,
  );
  const editMatch = (id: string) => {
    const match = selectedEvent?.matches.find(
      (candidate) => candidate.id === id,
    );
    if (!match) return;
    setMatchId(match.id);
    setGender(match.gender);
    setTeamAName(match.teamAName);
    setTeamBName(match.teamBName);
    setScheduleTimeZone(match.timezone ?? timeZone);
    setLocalStartsAt(
      localDateTimeValue(match.playedAt, match.timezone ?? timeZone),
    );
    setRoundLabel(match.roundLabel ?? "");
    setCourt(match.court ?? "");
  };
  const resetMatch = () => {
    setMatchId("");
    setTeamAName("");
    setTeamBName("");
    setLocalStartsAt("");
    setScheduleTimeZone(timeZone);
    setRoundLabel("");
    setCourt("");
  };
  return (
    <section className="hq-card pro-admin-schedule">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">AVP League operations</span>
          <h2>Match dates + schedules</h2>
        </div>
        <CalendarDays aria-hidden size={20} />
      </header>
      <p>
        Add missing league matches or correct their local start time, venue
        court, division, and matchup until the official source is complete.
      </p>
      {selectedEvent ? (
        <>
          <label className="pro-admin-event-picker">
            <span>AVP League event</span>
            <select
              onChange={(event) => {
                const nextEventId = event.target.value;
                setSelectedEventId(nextEventId);
                resetMatch();
                setScheduleTimeZone(
                  events.find((item) => item.id === nextEventId)?.editorial
                    .timezone ?? "America/Chicago",
                );
                setPage(0);
              }}
              value={selectedEvent.id}
            >
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.name} · {dateLabel(event.startsOn)}
                </option>
              ))}
            </select>
          </label>
          <div className="pro-admin-schedule__workspace">
            <form action={action} className="pro-admin-schedule-form">
              <input
                name="professionalEventId"
                type="hidden"
                value={selectedEvent.id}
              />
              <input name="importedMatchId" type="hidden" value={matchId} />
              <header>
                <div>
                  <span className="hq-eyebrow">
                    {matchId ? "Editing scheduled match" : "New league match"}
                  </span>
                  <h3>{matchId ? "Update matchup" : "Add matchup"}</h3>
                </div>
                {matchId && (
                  <button onClick={resetMatch} type="button">
                    Add another
                  </button>
                )}
              </header>
              <label>
                <span>Division</span>
                <select
                  name="gender"
                  onChange={(event) => {
                    setGender(event.target.value as "men" | "women");
                    setTeamAName("");
                    setTeamBName("");
                    setRoundLabel("");
                  }}
                  value={gender}
                >
                  <option value="women">Women</option>
                  <option value="men">Men</option>
                </select>
              </label>
              <label>
                <span>Team A</span>
                <select
                  name="teamAName"
                  onChange={(event) => setTeamAName(event.target.value)}
                  required
                  value={teamAName}
                >
                  <option value="">Choose team</option>
                  {teams.map((team) => (
                    <option key={team.key} value={team.teamName}>
                      {team.teamName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Team B</span>
                <select
                  name="teamBName"
                  onChange={(event) => setTeamBName(event.target.value)}
                  required
                  value={teamBName}
                >
                  <option value="">Choose team</option>
                  {teams.map((team) => (
                    <option key={team.key} value={team.teamName}>
                      {team.teamName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Local start</span>
                <input
                  name="localStartsAt"
                  onChange={(event) => setLocalStartsAt(event.target.value)}
                  required
                  type="datetime-local"
                  value={localStartsAt}
                />
              </label>
              <TimezoneSelect
                onChange={setScheduleTimeZone}
                recommended={selectedEvent.editorial.timezone}
                value={scheduleTimeZone}
              />
              <label>
                <span>Round or week label</span>
                <input
                  name="roundLabel"
                  onChange={(event) => setRoundLabel(event.target.value)}
                  placeholder={`${gender === "women" ? "Women" : "Men"} · ${weekLabel}`}
                  value={roundLabel}
                />
              </label>
              <label>
                <span>Court or venue area</span>
                <input
                  name="court"
                  onChange={(event) => setCourt(event.target.value)}
                  placeholder="e.g. Comerica Center"
                  value={court}
                />
              </label>
              <label className="pro-admin-schedule-form__wide">
                <span>Review note</span>
                <input
                  name="reason"
                  placeholder="Schedule source and reason for the change"
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
                  <CalendarDays size={16} />
                )}
                {matchId ? "Update schedule" : "Add match"}
              </button>
              <ActionFeedback state={state} />
            </form>
            <div className="pro-admin-schedule-list">
              {selectedEvent.matches
                .slice(page * 8, (page + 1) * 8)
                .map((match) => (
                  <article key={match.id}>
                    <span>
                      <Badge>{match.gender}</Badge>
                      <strong>
                        {match.teamAName} vs. {match.teamBName}
                      </strong>
                      <small>
                        {match.playedAt
                          ? new Intl.DateTimeFormat("en-US", {
                              dateStyle: "medium",
                              timeStyle: "short",
                              timeZone: match.timezone ?? timeZone,
                            }).format(new Date(match.playedAt))
                          : "Time pending"}
                      </small>
                    </span>
                    <button onClick={() => editMatch(match.id)} type="button">
                      Edit
                    </button>
                  </article>
                ))}
              {selectedEvent.matches.length === 0 && (
                <p className="hq-empty">No matches are scheduled yet.</p>
              )}
              <Pagination
                count={selectedEvent.matches.length}
                page={page}
                pageSize={8}
                setPage={setPage}
              />
            </div>
          </div>
        </>
      ) : (
        <p className="hq-empty">Sync an AVP League season first.</p>
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
                  placeholder="https://… (optional until a stream link is published)"
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
  const [page, setPage] = useState(0);
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
  useEffect(() => setPage(0), [season, gender]);
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
              {visibleTeams.slice(page * 8, (page + 1) * 8).map((team) => (
                <AvpTeamCard
                  active={team.key === selectedTeam?.key}
                  key={team.key}
                  onSelect={() => setSelectedTeamKey(team.key)}
                  team={team}
                />
              ))}
              <Pagination
                count={visibleTeams.length}
                page={page}
                pageSize={8}
                setPage={setPage}
              />
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
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const mappings = data.mappings.filter(
    (mapping) =>
      (mapping.source.toLowerCase().includes("avp") ||
        Boolean(mapping.sourceContext.teamName)) &&
      [
        mapping.displayName,
        mapping.sourceContext.teamName,
        mapping.sourceContext.gender,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  useEffect(() => setPage(0), [query]);
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
      <label className="pro-admin-event-search pro-admin-identity-search">
        <Search aria-hidden size={16} />
        <input
          aria-label="Search AVP identity queue"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find a player, team, or division…"
          type="search"
          value={query}
        />
      </label>
      <div>
        {mappings.slice(page * 10, (page + 1) * 10).map((mapping) => (
          <AvpIdentityForm
            key={mapping.id}
            mapping={mapping}
            players={players}
          />
        ))}
      </div>
      <Pagination
        count={mappings.length}
        page={page}
        pageSize={10}
        setPage={setPage}
      />
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
  initialEventId,
  players,
  tool = "overview",
}: {
  readonly data: SandDataOverview;
  readonly initialEventId?: string;
  readonly players: readonly PersonSummary[];
  readonly tool?: ProfessionalTourTool;
}) {
  const initialEvent =
    data.events.find((event) => event.live) ??
    data.events.find((event) => event.status === "upcoming") ??
    data.events[0];
  const [selectedEventId, setSelectedEventId] = useState(
    data.events.some((event) => event.id === initialEventId)
      ? (initialEventId ?? "")
      : (initialEvent?.id ?? ""),
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

  const openTool = (nextTool: ProfessionalTourTool, eventId?: string) => {
    const query = new URLSearchParams({ tool: nextTool });
    if (eventId) query.set("event", eventId);
    window.location.assign(`/admin/pro-tour?${query.toString()}`);
  };
  const tools: readonly {
    readonly id: ProfessionalTourTool;
    readonly label: string;
    readonly icon: typeof Trophy;
  }[] = [
    { id: "overview", label: "Overview", icon: Trophy },
    { id: "events", label: "Event library", icon: CalendarDays },
    { id: "research", label: "Event research", icon: ScanSearch },
    { id: "editorial", label: "Details + media", icon: ImageIcon },
    { id: "schedule", label: "AVP schedules", icon: CalendarDays },
    { id: "broadcasts", label: "How to Watch", icon: Tv },
    { id: "rosters", label: "AVP rosters", icon: UsersRound },
    { id: "mappings", label: "Player mappings", icon: ShieldCheck },
    { id: "sources", label: "Source sync", icon: RefreshCw },
  ];

  return (
    <div className="pro-admin-layout">
      <nav aria-label="Professional operations" className="pro-admin-jump-nav">
        {tools.map((item) => {
          const Icon = item.icon;
          return (
            <a
              aria-current={tool === item.id ? "page" : undefined}
              className={tool === item.id ? "active" : undefined}
              href={`/admin/pro-tour?tool=${item.id}`}
              key={item.id}
            >
              <Icon aria-hidden size={16} /> {item.label}
            </a>
          );
        })}
      </nav>

      {tool === "overview" && (
        <>
          <section className="pro-admin-metrics">
            <article>
              <small>Synced events</small>
              <Numeric>{data.events.length}</Numeric>
              <span>
                {data.events.filter((event) => event.live).length} live
              </span>
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
          <section className="pro-admin-tool-grid">
            {tools.slice(1).map((item) => {
              const Icon = item.icon;
              return (
                <a href={`/admin/pro-tour?tool=${item.id}`} key={item.id}>
                  <Icon aria-hidden size={22} />
                  <strong>{item.label}</strong>
                  <span>Open focused workspace</span>
                </a>
              );
            })}
          </section>
        </>
      )}
      {tool === "sources" && (
        <ProfessionalSyncControls
          currentAvpSeason={currentAvpSeason}
          data={data}
        />
      )}
      {tool === "events" && (
        <SyncedEvents
          events={data.events}
          onManageBroadcast={(eventId) => openTool("broadcasts", eventId)}
          onManageDetails={(eventId) => openTool("editorial", eventId)}
        />
      )}
      {tool === "editorial" && (
        <EditorialWorkspace
          events={data.events}
          selectedEventId={selectedEventId}
          setSelectedEventId={setSelectedEventId}
        />
      )}
      {tool === "research" && (
        <ResearchWorkspace
          events={data.events}
          selectedEventId={selectedEventId}
          setSelectedEventId={setSelectedEventId}
        />
      )}
      {tool === "schedule" && (
        <AvpScheduleWorkspace
          data={data}
          selectedEventId={selectedEventId}
          setSelectedEventId={setSelectedEventId}
        />
      )}
      {tool === "broadcasts" && (
        <BroadcastWorkspace
          events={data.events}
          selectedEventId={selectedEventId}
          setSelectedEventId={setSelectedEventId}
        />
      )}
      {tool === "rosters" && (
        <AvpLeagueWorkspace data={data} players={players} />
      )}
      {tool === "mappings" && (
        <AvpIdentityQueue data={data} players={players} />
      )}
    </div>
  );
}
