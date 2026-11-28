import { formatMoney, type PersonSummary } from "@duna/core";
import {
  Button,
  Chip,
  ClubMark,
  ConditionsLine,
  Icon,
} from "@duna/ui/tideline";
import { localDateOf, parseIsoDate, sunTimes } from "@duna/tideline-core";
import Link from "@/components/site/site-link";
import { CourtBooking } from "./court-booking";
import { ResultItem } from "./result-list";
import { discoverHref, DEFAULT_DISCOVER_STATE } from "./search-state";
import type { MapPresence } from "./map-presence";
import type { VenuePageData } from "./venue-data";
import { VenueMap } from "./venue-map";

function directionsHref(venue: VenuePageData) {
  if (venue.latitude === undefined || venue.longitude === undefined) {
    return undefined;
  }
  const query = new URLSearchParams({
    api: "1",
    destination: `${venue.latitude},${venue.longitude}`,
  });
  if (venue.googlePlaceId) {
    query.set("destination_place_id", venue.googlePlaceId);
  }
  return `https://www.google.com/maps/dir/?${query.toString()}`;
}

function rate(
  pricing: NonNullable<
    NonNullable<VenuePageData["inventory"]>["courts"][number]["pricing"]
  >,
) {
  const unit =
    pricing.rateUnitMinutes === 60 ? "hour" : `${pricing.rateUnitMinutes} min`;
  return `${formatMoney(pricing.baseAmountMinor, pricing.currency)} per ${unit}`;
}

export interface VenueViewProps {
  readonly venue: VenuePageData;
  /** Decided on the server (map-presence.ts). */
  readonly map?: MapPresence;
  /** `/discover` or `/app/discover`: where "Find a game" goes. */
  readonly discoverPath: string;
  /** Signed in (the booking twin) or a visitor (browse, then sign in). */
  readonly booking:
    | { readonly mode: "guest"; readonly defaultLocalStartsAt: string }
    | {
        readonly mode: "player";
        readonly defaultLocalStartsAt: string;
        readonly defaultDurationMinutes?: number;
        readonly bookingSubjects: readonly PersonSummary[];
        readonly suggestedPlayers: readonly PersonSummary[];
        readonly isDunaPlus: boolean;
        readonly initialCheckoutSessionId?: string;
        readonly initialNotice?: string;
        readonly initialCheckoutIntent?: "host";
      };
}

/**
 * A venue: what it is and where, the light and weather now, what is on this
 * week (in the shared group words), its courts, booking, the map and the
 * club that runs it. Photos only when the club uploaded one; otherwise the
 * brand's placeholder, never a stand-in picture.
 */
export function VenueView({
  venue,
  discoverPath,
  booking,
  map = "on",
}: VenueViewProps) {
  const now = Date.now();
  const localDate = parseIsoDate(localDateOf(now, venue.timezone));
  const sun =
    venue.latitude !== undefined && venue.longitude !== undefined && localDate
      ? sunTimes(venue.latitude, venue.longitude, localDate)
      : null;
  const anyLit = venue.inventory?.courts.some((court) => court.lit) ?? false;
  const surfaces = [
    ...new Set(venue.inventory?.courts.map((court) => court.surface) ?? []),
  ];
  const indoor = venue.tags.some((tag) => /\bindoor\b/i.test(tag));
  const nearHere =
    venue.latitude !== undefined && venue.longitude !== undefined
      ? discoverHref(
          {
            ...DEFAULT_DISCOVER_STATE,
            where: {
              kind: "place",
              label: venue.name,
              latitude: venue.latitude,
              longitude: venue.longitude,
              venueId: venue.id,
            },
            when: { kind: "preset", preset: "week" },
          },
          discoverPath,
        )
      : discoverPath;
  const directions = directionsHref(venue);
  // Tags that repeat the court count say nothing new.
  const tags = venue.tags.filter((tag) => !/^\d+\s+courts?$/i.test(tag));
  const place = venue.address ?? `${venue.city}, ${venue.region}`;
  let index = 0;

  return (
    <article className="vn">
      <nav aria-label="Breadcrumb" className="vn-crumbs">
        <Link href={discoverPath}>Find a game</Link>
        <Icon name="chevron-right" size="chip" />
        <span aria-current="page">{venue.name}</span>
      </nav>
      <header className="vn-head td-rise">
        <p className="site-label">
          {venue.city}, {venue.region}
        </p>
        <h1 className="vn-head__title">{venue.name}</h1>
        <p className="vn-head__facts">
          <Chip kind="metric" value={venue.courtCount}>
            {venue.courtCount === 1 ? "Court" : "Courts"}
          </Chip>
          {surfaces.length > 0 ? (
            surfaces.map((surface) => (
              <Chip key={surface} kind="taxonomy">
                {surface}
              </Chip>
            ))
          ) : (
            <Chip kind="taxonomy">{indoor ? "Indoor" : "Beach"}</Chip>
          )}
          {venue.openNow === true ? (
            <Chip kind="status" tone="positive">
              Open now
            </Chip>
          ) : null}
        </p>
        {venue.description ? (
          <p className="vn-head__lead">{venue.description}</p>
        ) : null}
        <div className="vn-head__actions">
          {venue.inventory ? (
            <Button href="#book" variant="primary">
              Book a court
            </Button>
          ) : null}
          <Button href="#on-this-week" variant="secondary">
            What’s on this week
          </Button>
          {directions ? (
            <Button
              href={directions}
              icon={<Icon name="directions" size="control" />}
              rel="noopener"
              target="_blank"
              variant="ghost"
            >
              Get directions
            </Button>
          ) : null}
        </div>
      </header>

      <figure className="vn-photo">
        {venue.imageUrl ? (
          // The club's own photo, sized so the page never shifts.
          <img
            alt={`${venue.name}`}
            decoding="async"
            fetchPriority="high"
            height={540}
            src={venue.imageUrl}
            width={1200}
          />
        ) : (
          <div className="vn-photo__none td" data-theme="dark">
            <ClubMark decorative name={venue.name} size="2xl" />
            <figcaption className="vn-photo__caption">
              No photos of {venue.name} yet
            </figcaption>
          </div>
        )}
      </figure>

      <div className="vn-grid">
        <div className="vn-main">
          <section aria-labelledby="vn-now" className="vn-section">
            <h2 className="vn-section__title" id="vn-now">
              Conditions now
            </h2>
            <ConditionsLine
              conditions={venue.conditions.hour ?? null}
              courtIsLit={anyLit}
              label="Light and weather now"
              now={now}
              status={
                venue.conditions.status === "ready" && venue.conditions.hour
                  ? "ready"
                  : venue.conditions.status === "not-configured"
                    ? "not-configured"
                    : "no-data"
              }
              sun={sun}
              timeZone={venue.timezone}
            />
            {venue.conditions.attribution ? (
              <p className="site-meta">{venue.conditions.attribution}</p>
            ) : null}
          </section>

          <section
            aria-labelledby="vn-week"
            className="vn-section"
            id="on-this-week"
          >
            <h2 className="vn-section__title" id="vn-week">
              On this week
            </h2>
            {venue.week.length === 0 ? (
              <div className="vn-empty">
                <p>Nothing is scheduled here in the next seven days.</p>
                <Button href={nearHere} size="sm" variant="secondary">
                  Find a game nearby
                </Button>
              </div>
            ) : (
              venue.week.map((day) => (
                <section
                  aria-labelledby={`vn-day-${day.date}`}
                  className="dv-day"
                  key={day.date}
                >
                  <h3 className="dv-day__title" id={`vn-day-${day.date}`}>
                    {day.label}
                  </h3>
                  <ul className="dv-rows">
                    {day.rows.map((row) => (
                      <ResultItem
                        index={index++}
                        key={row.id}
                        row={row}
                        session
                      />
                    ))}
                  </ul>
                </section>
              ))
            )}
          </section>

          {venue.coaches.length > 0 ? (
            <section aria-labelledby="vn-coaches" className="vn-section">
              <h2 className="vn-section__title" id="vn-coaches">
                Coaches here
              </h2>
              <ul className="dv-rows">
                {venue.coaches.map((row) => (
                  <ResultItem
                    index={index++}
                    key={row.id}
                    row={row}
                    session={false}
                  />
                ))}
              </ul>
            </section>
          ) : null}

          <section aria-labelledby="vn-courts" className="vn-section">
            <h2 className="vn-section__title" id="vn-courts">
              Courts
            </h2>
            {venue.inventory && venue.inventory.courts.length > 0 ? (
              <ul className="vn-court-list">
                {venue.inventory.courts.map((court) => (
                  <li className="vn-court-list__item" key={court.id}>
                    <span className="vn-court__name">{court.name}</span>
                    <span className="site-meta">
                      {court.surface} · {court.lit ? "Lit" : "Daylight only"} ·
                      up to {court.capacity} players
                    </span>
                    {court.pricing ? (
                      <span className="vn-price">{rate(court.pricing)}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p>
                {venue.courtCount} {venue.courtCount === 1 ? "court" : "courts"}
                {tags.length > 0 ? ` · ${tags.join(" · ")}` : ""}
              </p>
            )}
            {venue.amenities.length > 0 ? (
              <p className="site-meta">{venue.amenities.join(" · ")}</p>
            ) : null}
          </section>

          {venue.inventory ? (
            <CourtBooking
              defaultLocalStartsAt={booking.defaultLocalStartsAt}
              inventory={venue.inventory}
              {...(booking.mode === "guest"
                ? { guest: true }
                : {
                    bookingSubjects: booking.bookingSubjects,
                    suggestedPlayers: booking.suggestedPlayers,
                    isDunaPlus: booking.isDunaPlus,
                    defaultDurationMinutes: booking.defaultDurationMinutes,
                    initialCheckoutSessionId: booking.initialCheckoutSessionId,
                    initialNotice: booking.initialNotice,
                    initialCheckoutIntent: booking.initialCheckoutIntent,
                  })}
            />
          ) : (
            <section
              aria-labelledby="dv-book-title"
              className="vn-section"
              id="book"
            >
              <h2 className="vn-section__title" id="dv-book-title">
                Book a court
              </h2>
              <p>
                {venue.club ? venue.club.name : "The club"} hasn’t opened online
                court booking here yet. Join a session above, or find a game
                nearby.
              </p>
              <Button href={nearHere} size="sm" variant="secondary">
                Find a game nearby
              </Button>
            </section>
          )}
        </div>

        <aside aria-label="Getting there" className="vn-side">
          {venue.latitude !== undefined && venue.longitude !== undefined ? (
            <VenueMap
              id={venue.id}
              presence={map}
              latitude={venue.latitude}
              longitude={venue.longitude}
              name={venue.name}
            />
          ) : null}
          <div className="vn-side__block">
            <p className="site-label">Address</p>
            <p>{place}</p>
            {directions ? (
              <a
                className="site-textbutton"
                href={directions}
                rel="noopener"
                target="_blank"
              >
                Get directions
              </a>
            ) : null}
          </div>
          {venue.club ? (
            <div className="vn-side__block">
              <p className="site-label">Run by</p>
              <p className="vn-club">
                <ClubMark decorative name={venue.club.name} size={36} />
                {venue.club.href ? (
                  <Link href={venue.club.href}>{venue.club.name}</Link>
                ) : (
                  <span>{venue.club.name}</span>
                )}
              </p>
            </div>
          ) : null}
          <div className="vn-side__block">
            <p className="site-label">Played here?</p>
            <p>
              <a
                className="site-textbutton"
                href={`/add-score?where=${encodeURIComponent(venue.name)}`}
              >
                Add your score
              </a>
            </p>
          </div>
        </aside>
      </div>
    </article>
  );
}
