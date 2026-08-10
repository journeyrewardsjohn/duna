import { defaultEventMedia, formatMoney, formatVenueTime } from "@duna/core";
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
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DunaVideoGallery } from "@/components/duna-video-gallery";
import { EventDivisionExplorer } from "@/components/event-division-explorer";
import {
  EventSectionNav,
  type EventSectionNavItem,
} from "@/components/event-section-nav";
import { EventTicketSelector } from "@/components/event-ticket-selector";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ProEventDetail } from "@/components/pro-event-detail";
import { MarkdownContent } from "@/components/markdown-content";
import { PickupEventActions } from "@/components/pickup-event-actions";
import { TournamentPredictionMarkets } from "@/components/prediction-market";
import { WeatherForecastCard } from "@/components/weather-forecast";
import { getServerCaller } from "@/lib/api";
import {
  consumerEventJsonLd,
  professionalEventDescription,
  professionalEventImages,
  professionalOgImageUrl,
  serializeJsonLd,
} from "@/lib/pro-seo";

function words(value: string | undefined, fallback = "Configured") {
  return value
    ? value
        .replaceAll("-", " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase())
    : fallback;
}

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const caller = await getServerCaller();
  const [event, proEvent] = await Promise.all([
    caller.public.eventBySlug({ slug }).catch(() => undefined),
    caller.public.proEvent({ slug }).catch(() => undefined),
  ]);
  const proImages = proEvent ? professionalEventImages(proEvent) : [];
  const proSocialImage = proImages[0];
  const title = event?.title ?? proEvent?.name ?? "Event";
  const description =
    event?.shortSummary ??
    event?.description ??
    (proEvent ? professionalEventDescription(proEvent) : undefined);
  const eventImage = event
    ? (event.media?.find((item) => item.kind === "image")?.url ??
      event.imageUrl ??
      defaultEventMedia(event.kind, event.id).path)
    : undefined;
  const image =
    proSocialImage?.url ??
    eventImage ??
    (proEvent
      ? professionalOgImageUrl({
          title: proEvent.name,
          eyebrow: `${proEvent.source === "avp" ? "AVP League" : "Beach Pro Tour"} · ${proEvent.genderCategory}`,
          detail: [proEvent.category, proEvent.location, proEvent.startsOn]
            .filter(Boolean)
            .join(" · "),
        })
      : undefined);
  return {
    title,
    description,
    alternates: {
      canonical: `/events/${slug}`,
      types: {
        "text/markdown": `/events/${slug}.md`,
      },
    },
    openGraph: {
      title,
      description,
      type: "website",
      url: `/events/${slug}`,
      siteName: "Duna",
      images: image
        ? [
            {
              url: image,
              alt: proSocialImage?.alt ?? `${title} event artwork`,
            },
          ]
        : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: image ? [image] : undefined,
    },
    robots: { index: true, follow: true },
    ...(proEvent?.editorial.venue?.latitude !== undefined &&
    proEvent.editorial.venue.longitude !== undefined
      ? {
          other: {
            "geo.position": `${proEvent.editorial.venue.latitude};${proEvent.editorial.venue.longitude}`,
            ICBM: `${proEvent.editorial.venue.latitude}, ${proEvent.editorial.venue.longitude}`,
          },
        }
      : {}),
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
  if (!event && proEvent) {
    const marketMatches = proEvent.matches.slice(0, 40);
    const [eventMarkets, predictionWallet, matchMarkets] = await Promise.all([
      caller.public
        .proEventPredictionMarkets({ eventSlug: slug })
        .catch(() => []),
      caller.player.predictionWallet().catch(() => undefined),
      caller.public
        .proMatchPredictionMarkets({
          matches: marketMatches.map((match) => ({
            eventSlug: slug,
            matchId: match.id,
          })),
        })
        .catch(() => ({})),
    ]);
    return (
      <ProEventDetail
        event={proEvent}
        eventMarkets={eventMarkets}
        matchMarkets={matchMarkets}
        predictionWallet={predictionWallet}
      />
    );
  }
  if (!event) notFound();
  const pickupManagement =
    event.kind === "pickup"
      ? await caller.player
          .pickupManagement({ pickupSessionId: event.id })
          .catch(() => undefined)
      : undefined;
  const [videos, eventPredictionData, predictionWallet] = await Promise.all([
    caller.public.videos({ eventId: event.id }).catch(() => []),
    caller.public
      .eventPredictionMarkets({ eventSlug: event.slug })
      .catch(() => undefined),
    caller.player.predictionWallet().catch(() => undefined),
  ]);

  const cover = event.media?.[0];
  const fallbackMedia = defaultEventMedia(event.kind, event.id);
  const hostName = event.organizationName.replace(/^Hosted by\s+/i, "");
  const visualImageUrl =
    cover?.kind === "image"
      ? cover.url
      : (event.imageUrl ?? fallbackMedia.path);
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
    month: undefined,
    day: undefined,
    hour: "numeric",
    minute: "2-digit",
  });
  const endTime = formatVenueTime(event.endsAt, event.timezone, "en-US", {
    month: undefined,
    day: undefined,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
  const requiredPolicies = event.policies?.filter((policy) => policy.required);
  const guestFeatures = event.features?.filter(
    (feature) => feature.kind === "guest",
  );
  const supportingFeatures = event.features?.filter(
    (feature) => feature.kind !== "guest",
  );
  const startingTeamPrice = event.divisions
    ?.map((division) => division.teamPrice)
    .sort((left, right) => left.amountMinor - right.amountMinor)[0];
  const startingPlayerPrice = event.divisions
    ?.map((division) => division.playerPrice)
    .sort((left, right) => left.amountMinor - right.amountMinor)[0];
  const sectionNav: EventSectionNavItem[] = [
    { id: "event-overview", label: "Overview" },
    ...(eventPredictionData?.markets.length
      ? [{ id: "prediction-markets", label: "Predictions" }]
      : []),
    ...(videos.length ? [{ id: "event-media", label: "Watch" }] : []),
    { id: "event-experience", label: "Experience" },
    ...(event.features?.length
      ? [{ id: "event-features", label: "Highlights" }]
      : []),
    ...(event.divisions?.length
      ? [{ id: "divisions", label: "Divisions" }]
      : []),
    ...(event.recurrence ? [{ id: "event-schedule", label: "Schedule" }] : []),
    { id: "event-players", label: "Players" },
    ...(event.tickets?.length ? [{ id: "tickets", label: "Tickets" }] : []),
    { id: "event-location", label: "Location" },
    ...(event.policies?.length
      ? [{ id: "event-policies", label: "Policies" }]
      : []),
  ];
  const structuredData = consumerEventJsonLd(event);

  return (
    <main className="event-public" data-zone="athletic">
      <SiteHeader />
      <script
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }}
        type="application/ld+json"
      />

      <section className="event-public__hero" id="event-overview">
        <div className="event-public__hero-copy">
          <div className="event-public__badges">
            <Badge tone={event.live ? "live" : "neutral"}>
              {event.live ? "Live now" : words(event.kind)}
            </Badge>
            {event.tags.slice(0, 2).map((tag) => (
              <Badge key={tag}>{tag}</Badge>
            ))}
          </div>
          <span className="event-public__host">
            Hosted by <strong>{hostName}</strong>
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
          aria-label={
            cover?.kind !== "video"
              ? (cover?.alt ?? `${event.title} event poster`)
              : undefined
          }
          className={`event-public__visual ${
            cover?.kind === "video" ? "event-public__visual--video" : ""
          }`}
          role={cover?.kind !== "video" ? "img" : undefined}
          style={
            cover?.kind !== "video"
              ? {
                  backgroundImage: `linear-gradient(180deg, transparent 45%, rgb(16 24 40 / 55%)), url("${visualImageUrl}")`,
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

      <EventSectionNav items={sectionNav} />

      <section className="event-public__weather">
        <WeatherForecastCard
          forecast={event.weather}
          instant={event.startsAt}
          title="Forecast at first serve"
        />
      </section>

      {eventPredictionData && eventPredictionData.markets.length > 0 && (
        <div className="event-public__prediction">
          <TournamentPredictionMarkets
            entries={eventPredictionData.entries}
            eventSlug={event.slug}
            markets={eventPredictionData.markets}
            returnTo={`/events/${event.slug}`}
            targetKind="event-team"
            wallet={predictionWallet}
          />
        </div>
      )}

      {videos.length > 0 && (
        <div className="event-public__video" id="event-media">
          <DunaVideoGallery
            description="Player-streamed views and published replays from this event."
            title={
              videos.some((video) => video.status === "live")
                ? "Live from the sand."
                : "Watch the event."
            }
            videos={videos}
          />
        </div>
      )}

      <section className="event-public__layout">
        <div className="event-public__content">
          <article className="event-public__intro" id="event-experience">
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
            <section className="event-public__section" id="event-features">
              <header>
                <div>
                  <span className="section__eyebrow">Only here</span>
                  <h2>More than the matches.</h2>
                </div>
                <Sparkles aria-hidden size={23} />
              </header>
              {guestFeatures && guestFeatures.length > 0 && (
                <div className="event-guest-lineup">
                  {guestFeatures.map((feature) => (
                    <article key={feature.id}>
                      <div className="event-guest-lineup__portrait">
                        {feature.imageUrl ? (
                          <img
                            alt={`${feature.personName ?? feature.title}, featured guest`}
                            src={feature.imageUrl}
                          />
                        ) : (
                          <span>
                            {feature.personInitials ?? (
                              <Crown aria-hidden size={28} />
                            )}
                          </span>
                        )}
                        <Badge>Featured guest</Badge>
                      </div>
                      <div className="event-guest-lineup__copy">
                        <small>Meet your host</small>
                        <h3>{feature.personName ?? feature.title}</h3>
                        {feature.personName &&
                          feature.title !== feature.personName && (
                            <strong>{feature.title}</strong>
                          )}
                        <p>
                          {feature.description ??
                            "Meet, learn from, and share the event with this featured Duna player."}
                        </p>
                        <div>
                          {feature.personHomeMarket && (
                            <span>
                              <MapPin aria-hidden size={15} />
                              {feature.personHomeMarket}
                            </span>
                          )}
                          {feature.personRating !== undefined && (
                            <span>
                              <Medal aria-hidden size={15} />
                              <Numeric>
                                {feature.personRating.toFixed(2)}
                              </Numeric>{" "}
                              rating
                            </span>
                          )}
                        </div>
                        {(feature.personPublicPath ?? feature.personHandle) && (
                          <Link
                            href={
                              feature.personPublicPath ??
                              `/players/${feature.personHandle}`
                            }
                          >
                            View full profile{" "}
                            <ArrowRight aria-hidden size={15} />
                          </Link>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
              {supportingFeatures && supportingFeatures.length > 0 && (
                <div className="event-feature-grid">
                  {supportingFeatures.map((feature) => (
                    <article key={feature.id}>
                      <span
                        className={`event-feature-grid__icon event-feature-grid__icon--${feature.kind}`}
                      >
                        {feature.kind === "activity" ? (
                          <Footprints aria-hidden size={19} />
                        ) : (
                          <Sparkles aria-hidden size={19} />
                        )}
                      </span>
                      <Badge>{words(feature.kind)}</Badge>
                      <h3>{feature.title}</h3>
                      <p>{feature.description}</p>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          {event.divisions && event.divisions.length > 0 && (
            <section className="event-public__section" id="divisions">
              <header>
                <div>
                  <span className="section__eyebrow">Player entries</span>
                  <h2>Find your best fit.</h2>
                  <p>
                    Start with age or level, compare the eligible formats, then
                    see team and individual prices together.
                  </p>
                </div>
                <Trophy aria-hidden size={23} />
              </header>
              <EventDivisionExplorer
                divisions={event.divisions}
                eventSlug={event.slug}
              />
            </section>
          )}

          {event.recurrence && (
            <section className="event-public__section" id="event-schedule">
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

          <section className="event-public__section" id="event-players">
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
                <Link
                  href={person.publicPath ?? `/players/${person.handle}`}
                  key={person.id}
                >
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
              <EventTicketSelector
                eventSlug={event.slug}
                tickets={event.tickets.filter(
                  (ticketItem) => ticketItem.availableOnline,
                )}
              />
            </section>
          )}

          <section
            className="event-public__section event-public__location"
            id="event-location"
          >
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
            <section className="event-public__section" id="event-policies">
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
            {startingTeamPrice && startingPlayerPrice ? (
              <div>
                <span>
                  <small>
                    Team entry{event.divisions!.length > 1 ? " from" : ""}
                  </small>
                  <Numeric>
                    {startingTeamPrice.amountMinor === 0
                      ? "Free"
                      : formatMoney(
                          startingTeamPrice.amountMinor,
                          startingTeamPrice.currency,
                        )}
                  </Numeric>
                </span>
                <i aria-hidden />
                <span>
                  <small>
                    Per player{event.divisions!.length > 1 ? " from" : ""}
                  </small>
                  <Numeric>
                    {startingPlayerPrice.amountMinor === 0
                      ? "Free"
                      : formatMoney(
                          startingPlayerPrice.amountMinor,
                          startingPlayerPrice.currency,
                        )}
                  </Numeric>
                </span>
              </div>
            ) : (
              <span>
                <small>Admission from</small>
                <Numeric>
                  {event.price.amountMinor === 0
                    ? "Free"
                    : formatMoney(
                        event.price.amountMinor,
                        event.price.currency,
                      )}
                </Numeric>
              </span>
            )}
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
              paidMatch={event.price.amountMinor > 0}
              pickupSessionId={event.id}
              slug={event.slug}
            />
          ) : (
            <Link
              href={
                event.divisions?.length === 1
                  ? `/app/checkout/${event.slug}?division=${event.divisions[0]!.id}`
                  : "#divisions"
              }
            >
              Find my division <ArrowRight aria-hidden size={17} />
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
