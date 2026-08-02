import { formatMoney, formatVenueTime } from "@duna/core";
import { Badge, Numeric } from "@duna/ui";
import {
  ArrowRight,
  CalendarDays,
  Check,
  CircleDollarSign,
  Clock3,
  Crown,
  ExternalLink,
  Footprints,
  MapPin,
  Medal,
  ShieldCheck,
  Sparkles,
  Ticket,
  Trophy,
  UsersRound,
  Waves,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ProEventDetail } from "@/components/pro-event-detail";
import { MarkdownContent } from "@/components/markdown-content";
import { PickupEventActions } from "@/components/pickup-event-actions";
import { WeatherForecastCard } from "@/components/weather-forecast";
import { getServerCaller } from "@/lib/api";

function words(value: string | undefined, fallback = "Configured") {
  return value
    ? value
        .replaceAll("-", " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase())
    : fallback;
}

function ratingLabel(minimum?: number, maximum?: number) {
  if (minimum !== undefined && maximum !== undefined) {
    return `${minimum.toFixed(2)}–${maximum.toFixed(2)}`;
  }
  if (minimum !== undefined) return `${minimum.toFixed(2)}+`;
  if (maximum !== undefined) return `Up to ${maximum.toFixed(2)}`;
  return "Open rating";
}

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const caller = await getServerCaller();
  const [event, proEvent] = await Promise.all([
    caller.public.eventBySlug({ slug }).catch(() => undefined),
    caller.public.proEvent({ slug }).catch(() => undefined),
  ]);
  return {
    title: event?.title ?? proEvent?.name ?? "Event",
    description:
      event?.shortSummary ??
      event?.description ??
      (proEvent
        ? `Live standings, pools, bracket, results, and predictions for ${proEvent.name}.`
        : undefined),
    alternates: {
      canonical: `/events/${slug}`,
    },
  };
}

export default async function EventPage({
  params,
}: {
  readonly params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const caller = await getServerCaller();
  const [event, proEvent] = await Promise.all([
    caller.public.eventBySlug({ slug }).catch(() => undefined),
    caller.public.proEvent({ slug }).catch(() => undefined),
  ]);
  if (!event && proEvent) return <ProEventDetail event={proEvent} />;
  if (!event) notFound();
  const pickupManagement =
    event.kind === "pickup"
      ? await caller.player
          .pickupManagement({ pickupSessionId: event.id })
          .catch(() => undefined)
      : undefined;

  const cover = event.media?.[0];
  const capacityUsed = Math.max(0, event.capacity - event.spotsRemaining);
  const capacityPercent =
    event.capacity > 0
      ? Math.min(100, (capacityUsed / event.capacity) * 100)
      : 0;
  const starts = formatVenueTime(event.startsAt, event.timezone, "en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const startTime = formatVenueTime(event.startsAt, event.timezone, "en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  const endTime = formatVenueTime(event.endsAt, event.timezone, "en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
  const requiredPolicies = event.policies?.filter((policy) => policy.required);

  return (
    <main className="event-public">
      <SiteHeader />

      <section className="event-public__hero">
        <div className="event-public__hero-copy">
          <div className="event-public__badges">
            <Badge tone={event.live ? "live" : "neutral"}>
              {event.live ? "Live now" : words(event.kind)}
            </Badge>
            {event.tags.slice(0, 3).map((tag) => (
              <Badge key={tag}>{tag}</Badge>
            ))}
          </div>
          <span className="event-public__host">
            Hosted by <strong>{event.organizationName}</strong>
          </span>
          <h1>{event.title}</h1>
          <p>
            {event.shortSummary ??
              event.description ??
              "A connected Duna event with clear registration, live operations, and everything your team needs in one place."}
          </p>
          <div className="event-public__facts">
            <span>
              <CalendarDays aria-hidden size={18} />
              <small>When</small>
              <strong>{starts}</strong>
            </span>
            <span>
              <Clock3 aria-hidden size={18} />
              <small>Time</small>
              <strong>
                {startTime}–{endTime}
              </strong>
            </span>
            <span>
              <MapPin aria-hidden size={18} />
              <small>Where</small>
              <strong>{event.location?.venueName ?? event.venueName}</strong>
            </span>
          </div>
        </div>

        <div
          className={`event-public__visual ${
            cover?.kind === "video" ? "event-public__visual--video" : ""
          }`}
          style={
            cover?.kind === "image" || (!cover && event.imageUrl)
              ? {
                  backgroundImage: `linear-gradient(180deg, transparent 45%, rgb(16 24 40 / 55%)), url("${cover?.url ?? event.imageUrl}")`,
                }
              : undefined
          }
        >
          {cover?.kind === "video" && (
            <video
              aria-label={cover.alt ?? `${event.title} event video`}
              controls
              muted
              playsInline
              poster={cover.posterUrl}
              src={cover.url}
            />
          )}
          {!cover && !event.imageUrl && (
            <>
              <div className="event-public__sun" />
              <div className="event-public__net" />
              <div className="event-public__court" />
              <span>South Bay · Duna</span>
            </>
          )}
          <article className="event-public__availability">
            <span>
              <UsersRound aria-hidden size={18} />
              <strong>
                <Numeric>{event.spotsRemaining}</Numeric> player spots
              </strong>
            </span>
            <div>
              <i style={{ width: `${capacityPercent}%` }} />
            </div>
            <small>
              <Numeric>{capacityUsed}</Numeric> of{" "}
              <Numeric>{event.capacity}</Numeric> joined
            </small>
          </article>
        </div>
      </section>

      <section className="event-public__weather">
        <WeatherForecastCard
          forecast={event.weather}
          instant={event.startsAt}
          title="Forecast at first serve"
        />
      </section>

      <section className="event-public__layout">
        <div className="event-public__content">
          <article className="event-public__intro">
            <span className="section__eyebrow">The experience</span>
            <h2>
              {event.kind === "league"
                ? "A season with a real rhythm."
                : event.kind === "tournament"
                  ? "Built for the full day of play."
                  : "Arrive ready. Duna handles the rest."}
            </h2>
            {!event.description && (
              <p>
                Eligibility, payment, arrival, scoring, and results stay
                connected from the moment you join.
              </p>
            )}
            {event.description && (
              <MarkdownContent className="markdown-content">
                {event.description}
              </MarkdownContent>
            )}
          </article>

          {event.features && event.features.length > 0 && (
            <section className="event-public__section">
              <header>
                <div>
                  <span className="section__eyebrow">Only here</span>
                  <h2>More than the matches.</h2>
                </div>
                <Sparkles aria-hidden size={23} />
              </header>
              <div className="event-feature-grid">
                {event.features.map((feature) => (
                  <article key={feature.id}>
                    <span
                      className={`event-feature-grid__icon event-feature-grid__icon--${feature.kind}`}
                    >
                      {feature.kind === "guest" ? (
                        (feature.personInitials ?? (
                          <Crown aria-hidden size={19} />
                        ))
                      ) : feature.kind === "activity" ? (
                        <Footprints aria-hidden size={19} />
                      ) : (
                        <Sparkles aria-hidden size={19} />
                      )}
                    </span>
                    <Badge>{words(feature.kind)}</Badge>
                    <h3>{feature.title}</h3>
                    <p>{feature.description}</p>
                    {feature.personHandle && (
                      <Link href={`/players/${feature.personHandle}`}>
                        View Duna profile <ArrowRight aria-hidden size={14} />
                      </Link>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}

          {event.divisions && event.divisions.length > 0 && (
            <section className="event-public__section" id="divisions">
              <header>
                <div>
                  <span className="section__eyebrow">Player entries</span>
                  <h2>Find your division.</h2>
                  <p>
                    Every format, eligibility rule, price, and remaining spot is
                    visible before checkout.
                  </p>
                </div>
                <Trophy aria-hidden size={23} />
              </header>
              <div className="event-division-grid">
                {event.divisions.map((division, index) => (
                  <article key={division.id}>
                    <div className="event-division-grid__topline">
                      <Numeric>{String(index + 1).padStart(2, "0")}</Numeric>
                      <Badge
                        tone={
                          division.spotsRemaining <= 4 ? "warning" : "neutral"
                        }
                      >
                        {division.spotsRemaining} spots
                      </Badge>
                    </div>
                    <h3>{division.name}</h3>
                    <p>{division.description}</p>
                    <dl>
                      <div>
                        <dt>Team</dt>
                        <dd>
                          {words(
                            division.teamFormat,
                            words(division.discipline),
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Field</dt>
                        <dd>
                          {words(division.gender)} · {words(division.surface)}
                        </dd>
                      </div>
                      <div>
                        <dt>Rating</dt>
                        <dd>
                          <Numeric>
                            {ratingLabel(
                              division.ratingMinimum,
                              division.ratingMaximum,
                            )}
                          </Numeric>
                        </dd>
                      </div>
                      <div>
                        <dt>Format</dt>
                        <dd>{words(division.tournamentFormat)}</dd>
                      </div>
                      {division.poolPlay?.enabled && (
                        <div>
                          <dt>Pool play</dt>
                          <dd>
                            {division.poolPlay.teamsPerPool} teams ·{" "}
                            {division.poolPlay.teamsAdvancing} advance
                          </dd>
                        </div>
                      )}
                      <div>
                        <dt>Seeding</dt>
                        <dd>
                          {words(division.seeding ?? division.ratingBasis)}
                        </dd>
                      </div>
                    </dl>
                    <footer>
                      <span>
                        <small>
                          {division.priceBasis === "per-person"
                            ? "Per player"
                            : "Per team"}
                        </small>
                        <Numeric>
                          {division.price.amountMinor === 0
                            ? "Free"
                            : formatMoney(
                                division.price.amountMinor,
                                division.price.currency,
                              )}
                        </Numeric>
                      </span>
                      <Link
                        href={`/app/checkout/${event.slug}?division=${division.id}`}
                      >
                        Join division <ArrowRight aria-hidden size={16} />
                      </Link>
                    </footer>
                  </article>
                ))}
              </div>
            </section>
          )}

          {event.recurrence && (
            <section className="event-public__section">
              <header>
                <div>
                  <span className="section__eyebrow">Season rhythm</span>
                  <h2>Know every league night.</h2>
                </div>
                <CalendarDays aria-hidden size={23} />
              </header>
              <div className="league-public-rhythm">
                <article>
                  <small>Cadence</small>
                  <strong>
                    {event.recurrence.interval === "weekly"
                      ? "Every week"
                      : "Every other week"}
                  </strong>
                </article>
                {event.recurrence.days.map((day) => (
                  <article key={day.day}>
                    <small>{words(day.day)}</small>
                    <strong>
                      {day.startsAt}–{day.endsAt}
                    </strong>
                  </article>
                ))}
                <article>
                  <small>Team assignment</small>
                  <strong>{words(event.recurrence.teamAssignment)}</strong>
                </article>
                <article>
                  <small>Substitutes</small>
                  <strong>
                    {event.recurrence.substitutesAllowed
                      ? event.recurrence.substituteApprovalRequired
                        ? "Allowed with approval"
                        : "Allowed"
                      : "Not allowed"}
                  </strong>
                </article>
              </div>
            </section>
          )}

          <section className="event-public__section">
            <header>
              <div>
                <span className="section__eyebrow">Who&apos;s playing</span>
                <h2>
                  {capacityUsed === 0
                    ? "No one has joined yet."
                    : `${capacityUsed} ${capacityUsed === 1 ? "player" : "players"} confirmed.`}
                </h2>
              </div>
              <UsersRound aria-hidden size={23} />
            </header>
            <div className="event-player-strip">
              {(event.attendees ?? []).map((person) => (
                <Link href={`/players/${person.handle}`} key={person.id}>
                  <span className="avatar">
                    {person.avatarUrl ? (
                      <img alt="" src={person.avatarUrl} />
                    ) : (
                      person.initials
                    )}
                  </span>
                  <span>
                    <strong>{person.displayName}</strong>
                    <small>
                      {person.id === event.host?.id
                        ? "Host"
                        : (person.homeMarket?.split(",")[0] ?? "Player")}
                    </small>
                  </span>
                  <Numeric>
                    {person.ratingDisplay?.toFixed(2) ?? "Joined"}
                  </Numeric>
                </Link>
              ))}
              {(event.attendees?.length ?? 0) === 0 && (
                <article className="event-player-strip__empty">
                  <UsersRound aria-hidden size={22} />
                  <span>
                    <strong>
                      {capacityUsed === 0
                        ? "Be the first player in."
                        : `${capacityUsed} confirmed ${capacityUsed === 1 ? "player" : "players"}.`}
                    </strong>
                    <small>
                      {capacityUsed === 0
                        ? "Confirmed players who share a public profile will appear here."
                        : "Their profile visibility keeps the player cards private."}
                    </small>
                  </span>
                </article>
              )}
            </div>
            <p className="event-public__privacy-note">
              Player visibility follows each profile&apos;s privacy settings.
            </p>
          </section>

          {event.tickets && event.tickets.length > 0 && (
            <section className="event-public__section" id="tickets">
              <header>
                <div>
                  <span className="section__eyebrow">Spectator access</span>
                  <h2>Come for the day.</h2>
                  <p>Watch, bring friends, or choose an upgraded experience.</p>
                </div>
                <Ticket aria-hidden size={23} />
              </header>
              <div className="event-ticket-grid">
                {event.tickets
                  .filter((ticketItem) => ticketItem.availableOnline)
                  .map((ticketItem) => (
                    <article key={ticketItem.id}>
                      <span>
                        <Ticket aria-hidden size={19} />
                      </span>
                      <div>
                        <h3>{ticketItem.name}</h3>
                        <p>{ticketItem.description}</p>
                        <small>
                          {ticketItem.approvalRequired
                            ? "Host approval required"
                            : ticketItem.waitlistEnabled
                              ? "Waitlist available"
                              : `${ticketItem.remaining ?? "Unlimited"} available`}
                        </small>
                      </div>
                      <Numeric>
                        {ticketItem.price.amountMinor === 0
                          ? "Free"
                          : formatMoney(
                              ticketItem.price.amountMinor,
                              ticketItem.price.currency,
                            )}
                      </Numeric>
                      <Link
                        href={`/app/checkout/${event.slug}?ticket=${ticketItem.id}`}
                      >
                        Choose <ArrowRight aria-hidden size={15} />
                      </Link>
                    </article>
                  ))}
              </div>
            </section>
          )}

          <section className="event-public__section event-public__location">
            <header>
              <div>
                <span className="section__eyebrow">Place</span>
                <h2>{event.location?.venueName ?? event.venueName}</h2>
              </div>
              <MapPin aria-hidden size={23} />
            </header>
            <div>
              <span>
                <MapPin aria-hidden size={18} />
                <strong>
                  {event.location?.address ??
                    (event.location?.mode === "online"
                      ? "Online event"
                      : event.venueName)}
                </strong>
              </span>
              {event.location?.courtNames &&
                event.location.courtNames.length > 0 && (
                  <span>
                    <Waves aria-hidden size={18} />
                    <strong>{event.location.courtNames.join(" · ")}</strong>
                  </span>
                )}
              {event.location?.onlineUrl && (
                <a href={event.location.onlineUrl}>
                  Open event link <ExternalLink aria-hidden size={15} />
                </a>
              )}
            </div>
            {event.location?.mode !== "online" && (
              <div className="event-location-map">
                <iframe
                  aria-label={`Map of ${event.location?.venueName ?? event.venueName}`}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  src={`https://www.google.com/maps?q=${encodeURIComponent(
                    event.location?.latitude !== undefined &&
                      event.location?.longitude !== undefined
                      ? `${event.location.latitude},${event.location.longitude}`
                      : (event.location?.address ??
                          event.location?.venueName ??
                          event.venueName),
                  )}&output=embed`}
                  title={`Map of ${event.location?.venueName ?? event.venueName}`}
                />
                <span>
                  <Badge
                    tone={
                      event.location?.confidence === "confirmed"
                        ? "positive"
                        : "neutral"
                    }
                  >
                    {event.location?.confidence === "confirmed"
                      ? "Confirmed location"
                      : "Approximate location"}
                  </Badge>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                      event.location?.address ??
                        event.location?.venueName ??
                        event.venueName,
                    )}${
                      event.location?.googlePlaceId
                        ? `&query_place_id=${encodeURIComponent(event.location.googlePlaceId)}`
                        : ""
                    }`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Open directions <ExternalLink aria-hidden size={14} />
                  </a>
                </span>
              </div>
            )}
          </section>

          {event.policies && event.policies.length > 0 && (
            <section className="event-public__section">
              <header>
                <div>
                  <span className="section__eyebrow">Before you join</span>
                  <h2>Clear policies. No surprises.</h2>
                </div>
                <ShieldCheck aria-hidden size={23} />
              </header>
              <div className="event-policy-list">
                {event.policies.map((policy) => (
                  <details key={policy.id}>
                    <summary>
                      <span>
                        {policy.kind === "waiver" ? (
                          <ShieldCheck aria-hidden size={17} />
                        ) : (
                          <Check aria-hidden size={17} />
                        )}
                        <strong>{policy.title}</strong>
                      </span>
                      <Badge
                        tone={policy.kind === "waiver" ? "warning" : "neutral"}
                      >
                        {policy.kind}
                      </Badge>
                    </summary>
                    <MarkdownContent className="markdown-content">
                      {policy.markdown}
                    </MarkdownContent>
                    {policy.requireFullScroll && (
                      <small>
                        This waiver must be read in full and accepted during
                        checkout.
                      </small>
                    )}
                  </details>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="event-public__booking">
          <div className="event-public__booking-label">
            <CircleDollarSign aria-hidden size={18} />
            <span>
              <small>
                {event.divisions && event.divisions.length > 1
                  ? "Entries from"
                  : "Player entry"}
              </small>
              <Numeric>
                {event.price.amountMinor === 0
                  ? "Free"
                  : formatMoney(event.price.amountMinor, event.price.currency)}
              </Numeric>
            </span>
          </div>
          <h2>Ready to play?</h2>
          <p>
            Choose your division, complete your team, review the waiver, and pay
            securely.
          </p>
          <ul>
            <li>
              <Check aria-hidden size={15} /> Eligibility checked before payment
            </li>
            <li>
              <Check aria-hidden size={15} /> Invite teammates from Duna or by
              link
            </li>
            <li>
              <Check aria-hidden size={15} /> Registration confirms when the
              team is complete
            </li>
          </ul>
          {event.kind === "pickup" ? (
            <PickupEventActions
              approvalRequired={event.approvalRequired ?? false}
              management={pickupManagement}
              pickupSessionId={event.id}
              slug={event.slug}
            />
          ) : (
            <Link href={`/app/checkout/${event.slug}`}>
              Join this event <ArrowRight aria-hidden size={17} />
            </Link>
          )}
          {event.tickets && event.tickets.length > 0 && (
            <Link className="secondary" href="#tickets">
              Browse tickets
            </Link>
          )}
          <div className="event-public__booking-capacity">
            <span>
              <small>Field</small>
              <strong>
                <Numeric>{capacityUsed}</Numeric> /{" "}
                <Numeric>{event.capacity}</Numeric>
              </strong>
            </span>
            <div>
              <i style={{ width: `${capacityPercent}%` }} />
            </div>
          </div>
          {requiredPolicies && requiredPolicies.length > 0 && (
            <small className="event-public__booking-policy">
              <ShieldCheck aria-hidden size={14} />
              {requiredPolicies.length} required{" "}
              {requiredPolicies.length === 1 ? "agreement" : "agreements"} at
              checkout
            </small>
          )}
          <div className="event-public__booking-trust">
            <Medal aria-hidden size={16} />
            <span>
              <strong>Powered by Duna</strong>
              <small>Secure registration and event operations</small>
            </span>
          </div>
        </aside>
      </section>

      <SiteFooter />
    </main>
  );
}
