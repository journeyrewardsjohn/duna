"use client";

import type { OperatorWorkspace } from "@duna/api";
import { defaultEventMedia, formatMoney, formatVenueTime } from "@duna/core";
import { Badge } from "@duna/ui";
import {
  ArrowRight,
  CalendarClock,
  Check,
  CircleAlert,
  CreditCard,
  Eye,
  GalleryHorizontalEnd,
  MapPinned,
  MonitorSmartphone,
  PencilLine,
  Rocket,
  Sparkles,
  UsersRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { useActionState, useState, type CSSProperties } from "react";
import { useFormStatus } from "react-dom";
import { publishSessionAction, type OperatorActionState } from "@/app/actions";

const initialActionState: OperatorActionState = {
  status: "idle",
  message: "",
};

type DraftSession = OperatorWorkspace["sessions"][number];
type PreviewMode = "page" | "poster";

interface PublishBlocker {
  readonly code: "location" | "payments" | "schedule";
  readonly message: string;
  readonly href?: string;
  readonly linkLabel?: string;
}

function coverForSession(session: DraftSession) {
  const media = session.media.find(
    (item) => typeof item.url === "string" && item.url.length > 0,
  );
  const fallback = defaultEventMedia(session.kind, session.title);
  return {
    kind: media?.kind === "video" ? ("video" as const) : ("image" as const),
    url:
      typeof media?.url === "string"
        ? media.url
        : `https://duna.coach${fallback.path}`,
    posterUrl:
      typeof media?.posterUrl === "string" ? media.posterUrl : undefined,
    alt:
      typeof media?.alt === "string"
        ? media.alt
        : `${session.title} event cover`,
  };
}

function venueDatePart(
  value: string,
  timezone: string,
  options: Intl.DateTimeFormatOptions,
) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    ...options,
  }).format(new Date(value));
}

function PreviewWorkspace({
  mode,
  onClose,
  onModeChange,
  session,
  workspace,
}: {
  readonly mode: PreviewMode;
  readonly onClose: () => void;
  readonly onModeChange: (mode: PreviewMode) => void;
  readonly session: DraftSession;
  readonly workspace: OperatorWorkspace;
}) {
  const cover = coverForSession(session);
  const backgroundUrl = cover.kind === "video" ? cover.posterUrl : cover.url;
  const location = session.venueName ?? "Location shared after registration";
  const date = venueDatePart(session.startsAt, session.timezone, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const time = venueDatePart(session.startsAt, session.timezone, {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
  const visualStyle = backgroundUrl
    ? ({ "--event-preview-image": `url("${backgroundUrl}")` } as CSSProperties)
    : undefined;

  return (
    <section className="event-draft-preview" aria-label="Private event preview">
      <header>
        <div>
          <span className="event-draft-preview__lock">
            <Eye aria-hidden size={14} /> Private preview
          </span>
          <strong>
            {mode === "page" ? "Player event page" : "Discovery poster"}
          </strong>
          <small>
            Exactly the story players will meet before registration.
          </small>
        </div>
        <nav aria-label="Preview format">
          <button
            aria-pressed={mode === "page"}
            className={mode === "page" ? "active" : undefined}
            onClick={() => onModeChange("page")}
            type="button"
          >
            <MonitorSmartphone aria-hidden size={15} /> Event page
          </button>
          <button
            aria-pressed={mode === "poster"}
            className={mode === "poster" ? "active" : undefined}
            onClick={() => onModeChange("poster")}
            type="button"
          >
            <GalleryHorizontalEnd aria-hidden size={15} /> Card / poster
          </button>
          <button aria-label="Close preview" onClick={onClose} type="button">
            <X aria-hidden size={16} />
          </button>
        </nav>
      </header>

      {mode === "page" ? (
        <div className="event-player-preview">
          <div className="event-player-preview__browser">
            <span aria-hidden />
            <span aria-hidden />
            <span aria-hidden />
            <strong>duna.coach/events/{session.slug}</strong>
          </div>
          <div className="event-player-preview__hero">
            <article>
              <span className="event-player-preview__kicker">
                {session.kind.replaceAll("-", " ")} · Hosted by{" "}
                {workspace.organization.name}
              </span>
              <h3>{session.title}</h3>
              <p>
                {session.shortSummary ??
                  session.description ??
                  "A connected Duna event with everything players need in one place."}
              </p>
              <dl>
                <div>
                  <dt>When</dt>
                  <dd>{date}</dd>
                </div>
                <div>
                  <dt>First serve</dt>
                  <dd>{time}</dd>
                </div>
                <div>
                  <dt>Where</dt>
                  <dd>{location}</dd>
                </div>
              </dl>
            </article>
            <div className="event-player-preview__visual" style={visualStyle}>
              {cover.kind === "video" && !cover.posterUrl && (
                <video
                  aria-label={cover.alt}
                  muted
                  playsInline
                  src={cover.url}
                />
              )}
              <span>
                <UsersRound aria-hidden size={18} />
                <strong>{session.capacity} player spots</strong>
              </span>
            </div>
          </div>
          <div className="event-player-preview__lower">
            <article>
              <small>The experience</small>
              <strong>
                {session.kind === "league"
                  ? "A season with a real rhythm."
                  : "Built for the full day of play."}
              </strong>
              <p>
                {session.description ??
                  "Eligibility, payment, arrival, scoring, and results stay connected from the moment a player joins."}
              </p>
            </article>
            <aside>
              <span>Registration</span>
              <strong>
                {formatMoney(session.priceMinor, session.currency)}
              </strong>
              <small>per entry · {session.capacity} spots</small>
              <button disabled type="button">
                Preview only
              </button>
            </aside>
          </div>
        </div>
      ) : (
        <div className="event-poster-preview">
          <div className="event-poster-preview__stage">
            <article style={visualStyle}>
              <header>
                <span>DUNA</span>
                <small>{session.kind.replaceAll("-", " ")}</small>
              </header>
              <div>
                <span>{date}</span>
                <h3>{session.title}</h3>
                <p>{location}</p>
              </div>
              <footer>
                <strong>{workspace.organization.name}</strong>
                <span>{formatMoney(session.priceMinor, session.currency)}</span>
              </footer>
            </article>
          </div>
          <article className="event-poster-preview__context">
            <span className="hq-eyebrow">Discovery placement</span>
            <h3>Designed to stop the scroll.</h3>
            <p>
              This is the visual players see in Duna discovery, shared event
              links, and promotional placements.
            </p>
            <dl>
              <div>
                <dt>Story</dt>
                <dd>{session.shortSummary ? "Ready" : "Needs a summary"}</dd>
              </div>
              <div>
                <dt>Cover</dt>
                <dd>{session.media.length > 0 ? "Custom" : "Duna library"}</dd>
              </div>
              <div>
                <dt>Action</dt>
                <dd>View & register</dd>
              </div>
            </dl>
          </article>
        </div>
      )}
    </section>
  );
}

function publishBlockers(
  session: DraftSession,
  workspace: OperatorWorkspace,
): readonly PublishBlocker[] {
  const blockers: PublishBlocker[] = [];
  const venue = session.venueId
    ? workspace.venues.find((item) => item.id === session.venueId)
    : undefined;

  if (session.venueId && venue?.status !== "active") {
    blockers.push({
      code: "location",
      message: "Publish the connected venue before opening registration.",
      href: "/locations",
      linkLabel: "Review venue",
    });
  }
  if (session.priceMinor > 0 && !workspace.organization.stripeChargesEnabled) {
    blockers.push({
      code: "payments",
      message: "Finish Money setup before publishing this paid event.",
      href: "/payments/setup",
      linkLabel: "Configure Money",
    });
  }
  if (new Date(session.startsAt).getTime() <= Date.now()) {
    blockers.push({
      code: "schedule",
      message: "This start time has passed. Create a new future schedule.",
    });
  }

  return blockers;
}

function PublishButton({ disabled }: { readonly disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      className="hq-button hq-button--primary"
      disabled={disabled || pending}
      type="submit"
    >
      {pending ? "Publishing…" : "Publish & open registration"}
      <ArrowRight aria-hidden size={16} />
    </button>
  );
}

function DraftPublicationCard({
  focused,
  session,
  workspace,
}: {
  readonly focused: boolean;
  readonly session: DraftSession;
  readonly workspace: OperatorWorkspace;
}) {
  const [state, action] = useActionState(
    publishSessionAction,
    initialActionState,
  );
  const [previewMode, setPreviewMode] = useState<PreviewMode | null>(null);
  const blockers = publishBlockers(session, workspace);
  const venue = session.venueId
    ? workspace.venues.find((item) => item.id === session.venueId)
    : undefined;
  const locationLabel = venue?.name ?? "Custom or online location";
  const cover = coverForSession(session);
  const coverUrl = cover.kind === "video" ? cover.posterUrl : cover.url;
  const coverStyle = coverUrl
    ? ({ "--event-draft-cover": `url("${coverUrl}")` } as CSSProperties)
    : undefined;
  const editHref = `/events/create?draft=${session.id}`;

  return (
    <article
      className={`event-draft-card${focused ? " event-draft-card--focused" : ""}`}
      id={`draft-${session.id}`}
    >
      <div className="event-draft-card__overview">
        <div className="event-draft-card__cover" style={coverStyle}>
          {cover.kind === "video" && !cover.posterUrl && (
            <video aria-label={cover.alt} muted playsInline src={cover.url} />
          )}
          <Badge tone="warning">Private draft</Badge>
          <span className="event-draft-card__date">
            {venueDatePart(session.startsAt, session.timezone, {
              month: "short",
            })}
            <strong>
              {venueDatePart(session.startsAt, session.timezone, {
                day: "numeric",
              })}
            </strong>
          </span>
        </div>

        <div className="event-draft-card__content">
          <header>
            <div>
              <span>
                {session.kind.replaceAll("-", " ")} ·{" "}
                {blockers.length === 0
                  ? "ready to publish"
                  : `${blockers.length} item${blockers.length === 1 ? "" : "s"} to finish`}
              </span>
              <h3>{session.title}</h3>
              <p>
                {session.shortSummary ??
                  "Add the player-facing story, then check how it looks before opening registration."}
              </p>
            </div>
            <strong>{formatMoney(session.priceMinor, session.currency)}</strong>
          </header>

          <div className="event-draft-card__facts">
            <span>
              <CalendarClock aria-hidden size={18} />
              <small>First serve</small>
              <strong>
                {formatVenueTime(session.startsAt, session.timezone, "en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </strong>
            </span>
            <span>
              <MapPinned aria-hidden size={18} />
              <small>Location</small>
              <strong>{locationLabel}</strong>
            </span>
            <span>
              <UsersRound aria-hidden size={18} />
              <small>Capacity</small>
              <strong>{session.capacity} player spots</strong>
            </span>
            <span>
              <CreditCard aria-hidden size={18} />
              <small>Registration</small>
              <strong>
                {session.priceMinor > 0
                  ? workspace.organization.stripeChargesEnabled
                    ? "Payments ready"
                    : "Money setup needed"
                  : "Free entry"}
              </strong>
            </span>
          </div>

          <nav
            className="event-draft-jobs"
            aria-label={`${session.title} actions`}
          >
            <Link
              className="event-draft-job event-draft-job--edit"
              href={editHref}
            >
              <span>
                <PencilLine aria-hidden size={18} />
              </span>
              <span>
                <strong>Edit event</strong>
                <small>Story, schedule, pricing & rules</small>
              </span>
              <ArrowRight aria-hidden size={16} />
            </Link>
            <button
              aria-expanded={previewMode === "page"}
              className="event-draft-job"
              onClick={() =>
                setPreviewMode((current) =>
                  current === "page" ? null : "page",
                )
              }
              type="button"
            >
              <span>
                <MonitorSmartphone aria-hidden size={18} />
              </span>
              <span>
                <strong>Preview page</strong>
                <small>See exactly what players see</small>
              </span>
              <Eye aria-hidden size={16} />
            </button>
            <button
              aria-expanded={previewMode === "poster"}
              className="event-draft-job"
              onClick={() =>
                setPreviewMode((current) =>
                  current === "poster" ? null : "poster",
                )
              }
              type="button"
            >
              <span>
                <GalleryHorizontalEnd aria-hidden size={18} />
              </span>
              <span>
                <strong>Preview card</strong>
                <small>Discovery & share poster</small>
              </span>
              <Sparkles aria-hidden size={16} />
            </button>
          </nav>
        </div>
      </div>

      {previewMode && (
        <PreviewWorkspace
          mode={previewMode}
          onClose={() => setPreviewMode(null)}
          onModeChange={setPreviewMode}
          session={session}
          workspace={workspace}
        />
      )}

      <details className="event-draft-review" open={focused ? true : undefined}>
        <summary>
          <span>
            <Rocket aria-hidden size={19} />
            <span>
              <strong>Open registration</strong>
              <small>Final readiness check & publish</small>
            </span>
          </span>
          <strong>
            {blockers.length === 0
              ? "Ready to open registration"
              : `${blockers.length} item${blockers.length === 1 ? "" : "s"} to finish`}
          </strong>
        </summary>
        <div className="event-draft-review__body">
          {blockers.length > 0 ? (
            <div className="event-draft-blockers">
              {blockers.map((blocker) => (
                <div key={blocker.code}>
                  <CircleAlert aria-hidden size={17} />
                  <span>
                    <strong>{blocker.message}</strong>
                    {blocker.href && blocker.linkLabel && (
                      <Link href={blocker.href}>
                        {blocker.linkLabel} <ArrowRight aria-hidden size={14} />
                      </Link>
                    )}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="event-draft-ready">
              <Check aria-hidden size={18} />
              <span>
                <strong>Ready for players.</strong>
                Publishing makes the event visible and opens registration.
              </span>
            </div>
          )}

          {state.status !== "idle" && (
            <div
              className={`event-draft-action-state event-draft-action-state--${state.status}`}
              role={state.status === "error" ? "alert" : "status"}
            >
              {state.status === "success" ? (
                <Check aria-hidden size={17} />
              ) : (
                <CircleAlert aria-hidden size={17} />
              )}
              <span>{state.message}</span>
            </div>
          )}

          {state.status !== "success" && (
            <form action={action} className="event-draft-publish-form">
              <input name="sessionId" type="hidden" value={session.id} />
              <input name="confirmed" type="hidden" value="true" />
              <span>
                This is the explicit publication step. No draft goes live
                automatically.
              </span>
              <PublishButton disabled={blockers.length > 0} />
            </form>
          )}
        </div>
      </details>
    </article>
  );
}

export function SessionDraftManager({
  focusedDraftId,
  kinds,
  workspace,
}: {
  readonly focusedDraftId?: string;
  readonly kinds?: readonly DraftSession["kind"][];
  readonly workspace: OperatorWorkspace;
}) {
  const drafts = workspace.sessions.filter(
    (session) =>
      session.status === "draft" && (!kinds || kinds.includes(session.kind)),
  );

  return (
    <section className="hq-card event-draft-manager">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Needs review</span>
          <h2>
            {drafts.length === 0
              ? "No drafts awaiting publication"
              : `${drafts.length} draft${drafts.length === 1 ? "" : "s"} awaiting publication`}
          </h2>
          <p>
            Every saved draft stays here until you explicitly review it and open
            registration.
          </p>
        </div>
        <Badge tone={drafts.length > 0 ? "warning" : "positive"}>
          {drafts.length > 0 ? "Action needed" : "All clear"}
        </Badge>
      </header>

      {drafts.length > 0 ? (
        <div className="event-draft-list">
          {drafts.map((session) => (
            <DraftPublicationCard
              focused={focusedDraftId === session.id}
              key={session.id}
              session={session}
              workspace={workspace}
            />
          ))}
        </div>
      ) : (
        <div className="hq-empty event-draft-manager__empty">
          <Check aria-hidden size={20} />
          <span>
            Saved drafts will appear here automatically. Published events stay
            in the inventory below.
          </span>
        </div>
      )}
    </section>
  );
}
