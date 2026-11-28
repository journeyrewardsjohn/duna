import { formatVenueTime } from "@duna/core";
import { Chip, Icon, type TidelineTone } from "@duna/ui/tideline";
import Link from "@/components/site/site-link";
import type { ReactNode } from "react";
import { mapboxStaticImageUrl, publicMapboxToken } from "@/lib/static-map";
import { directionsHref } from "../event/event-model";
import {
  sessionState,
  type Occurrence,
  type Offering,
  type SessionState,
} from "./offers";

/** Participation tone → the chip's tone. Never `live`: a session filling up is not live. */
const TONE: Readonly<Record<SessionState["tone"], TidelineTone | "neutral">> = {
  neutral: "neutral",
  positive: "positive",
  caution: "warning",
  critical: "danger",
};

/** "Fri, Dec 11 · 6:00 PM", in the venue's time zone. */
export function sessionWhen(occurrence: Occurrence): {
  readonly day: string;
  readonly time: string;
} {
  return {
    day: formatVenueTime(occurrence.startsAt, occurrence.timezone, "en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    }),
    time: formatVenueTime(occurrence.startsAt, occurrence.timezone, "en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }),
  };
}

/** A session's state as a status chip in the shared words. */
export function SessionChip({ state }: { readonly state: SessionState }) {
  return (
    <Chip kind="status" tone={TONE[state.tone]}>
      {state.status}
    </Chip>
  );
}

/**
 * The next sessions of an offering: when, who coaches, the group state in
 * the shared words and, for group sessions, the price line and ladder.
 */
export function SessionList({
  item,
  clubName,
  now,
  limit = 3,
  href,
  showLadder = false,
}: {
  readonly item: Offering;
  readonly clubName: string;
  readonly now: Date;
  readonly limit?: number;
  /** Each row links here (the offering page); otherwise rows are plain. */
  readonly href?: string;
  readonly showLadder?: boolean;
}) {
  const sessions = item.upcomingOccurrences
    .filter((occurrence) => Date.parse(occurrence.endsAt) > now.getTime())
    .slice(0, limit);
  if (sessions.length === 0) return null;
  return (
    <ul className="club-sessions" aria-label={`Next sessions of ${item.title}`}>
      {sessions.map((occurrence) => {
        const state = sessionState({ item, occurrence, clubName, now });
        const when = sessionWhen(occurrence);
        const coaches = occurrence.availableCoaches
          .map((coach) => coach.displayName)
          .join(", ");
        const body = (
          <>
            <span className="club-sessions__when">
              <strong>{when.day}</strong>
              <span className="club-num">{when.time}</span>
            </span>
            <span className="club-sessions__state">
              {state ? <SessionChip state={state} /> : null}
              {state?.line ? (
                <span className="club-sessions__line">{state.line}</span>
              ) : null}
            </span>
            {coaches ? (
              <span className="club-sessions__coach">
                <Icon name="coach" size="chip" /> {coaches}
              </span>
            ) : null}
            {showLadder && state?.price ? (
              <span className="club-sessions__price">{state.price}</span>
            ) : null}
            {showLadder && state && state.ladder.length > 1 ? (
              <span className="club-sessions__ladder">
                {state.ladder.join(" · ")}
              </span>
            ) : null}
          </>
        );
        return (
          <li key={occurrence.key} aria-label={state?.a11y}>
            {href ? (
              <Link className="club-sessions__row" href={href}>
                {body}
              </Link>
            ) : (
              <div className="club-sessions__row">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * A place on a map: the map image when maps are configured (with the
 * required attribution), otherwise an honest line, and directions either way.
 */
export function PlaceMap({
  name,
  address,
  latitude,
  longitude,
  googlePlaceId,
}: {
  readonly name: string;
  readonly address?: string;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly googlePlaceId?: string;
}) {
  const token = publicMapboxToken(process.env);
  const located = latitude !== undefined && longitude !== undefined;
  return (
    <figure className="club-map">
      {token && located ? (
        <div className="club-map__frame">
          <img
            alt={`Map of ${name}`}
            className="club-map__image"
            decoding="async"
            height={540}
            loading="lazy"
            src={mapboxStaticImageUrl({ latitude, longitude, token })}
            width={960}
          />
          <span className="club-map__credit">© Mapbox © OpenStreetMap</span>
        </div>
      ) : (
        <div className="club-map__frame club-map__frame--none">
          <Icon name="map" size="nav" />
          <span>
            {located
              ? "The map isn't available here yet."
              : "The club hasn't pinned this place on a map yet."}
          </span>
        </div>
      )}
      <figcaption className="club-map__caption">
        <span>
          <strong>{name}</strong>
          {address ? <span className="site-meta">{address}</span> : null}
        </span>
        <a
          className="site-link"
          href={directionsHref({
            name,
            address,
            latitude,
            longitude,
            googlePlaceId,
          })}
          rel="noreferrer"
          target="_blank"
        >
          <Icon name="directions" size="inline" /> Directions
        </a>
      </figcaption>
    </figure>
  );
}

/** A plain section with the site's net line and an h2. */
export function Section({
  id,
  label,
  title,
  lead,
  chip,
  children,
  className,
}: {
  readonly id: string;
  readonly label: string;
  readonly title: string;
  readonly lead?: ReactNode;
  readonly chip?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <section
      aria-labelledby={`${id}-title`}
      className={`site-wrap club-section${className ? ` ${className}` : ""}`}
      id={id}
    >
      <div className="club-section__head">
        <p className="site-label">
          {label}
          {chip ? <span className="club-section__chip">{chip}</span> : null}
        </p>
        <h2 className="club-h2" id={`${id}-title`}>
          {title}
        </h2>
        {lead ? <p className="site-body">{lead}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** The club's own words, set apart and attributed. */
export function ClubWords({
  club,
  children,
}: {
  readonly club: string;
  readonly children: ReactNode;
}) {
  return (
    <blockquote className="club-words">
      <p>{children}</p>
      <footer className="site-meta">From {club}</footer>
    </blockquote>
  );
}

export function addressLine(input: {
  readonly addressLine1?: string;
  readonly addressLine2?: string;
  readonly locality?: string;
  readonly administrativeArea?: string;
  readonly postalCode?: string;
}): string | undefined {
  const line = [
    input.addressLine1,
    input.addressLine2,
    [input.locality, input.administrativeArea].filter(Boolean).join(", "),
    input.postalCode,
  ]
    .filter((part) => part && part.trim())
    .join(", ");
  return line || undefined;
}
