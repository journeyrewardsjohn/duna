import type {
  EventSummary,
  PublicCoach,
  PublicOrganizationStorefront,
} from "@duna/api";
import { formatVenueTime } from "@duna/core";
import {
  Chip,
  ClubMark,
  EmptyState,
  ErrorState,
  Icon,
  MembershipCard,
  OfflineBanner,
  Rally,
} from "@duna/ui/tideline";
import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowLink, LinkButton } from "@/components/site/link-button";
import { siteLinks } from "@/components/site/links";
import {
  eventPhase,
  eventWhen,
  lowestEntry,
  PHASE_WORDS,
} from "../event/event-model";
import { ActionBar, type PageAction } from "./action-bar";
import { ClubMedia } from "./club-media";
import {
  allInNote,
  AVAILABILITY_WORDS,
  cancellationSentence,
  minimumSentence,
  offeringAvailability,
  offeringDoor,
  offeringIncludes,
  offeringPrice,
  offeringPriceLine,
  priceWords,
  sessionState,
  subtypeWords,
  upcoming,
  type Door,
  type Offering,
} from "./offers";
import {
  addressLine,
  ClubWords,
  PlaceMap,
  Section,
  SessionChip,
  SessionList,
  sessionWhen,
} from "./parts";
import type { ClubThemeView } from "./theme";
import { actionHref } from "./viewer";

type Storefront = PublicOrganizationStorefront;

export interface ClubPageProps {
  readonly storefront: Storefront;
  readonly theme: ClubThemeView;
  readonly events: readonly EventSummary[];
  readonly coaches: readonly PublicCoach[];
  readonly viewer: { readonly signedIn: boolean; readonly name?: string };
  readonly now: Date;
  /** The catalog could not be read (its reference is shown). */
  readonly catalogError?: string;
}

const productHref = (slug: string, item: Pick<Offering, "slug">) =>
  `/clubs/${slug}/products/${item.slug}`;

const DOORS: readonly {
  readonly door: Exclude<Door, "shop">;
  readonly label: string;
  readonly title: string;
  readonly icon: "play" | "lesson" | "member-card";
  readonly empty: string;
}[] = [
  {
    door: "play",
    label: "Play",
    title: "Open play and pickup",
    icon: "play",
    empty: "No open play published yet.",
  },
  {
    door: "train",
    label: "Train",
    title: "Lessons, groups and clinics",
    icon: "lesson",
    empty: "No coaching published yet.",
  },
  {
    door: "join",
    label: "Join",
    title: "Memberships",
    icon: "member-card",
    empty: "No membership on sale yet.",
  },
];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
}

/** The next session across a set of offerings, with its offering. */
function soonest(items: readonly Offering[], now: Date) {
  return items
    .flatMap((item) =>
      upcoming(item, now).map((occurrence) => ({ item, occurrence })),
    )
    .toSorted(
      (left, right) =>
        Date.parse(left.occurrence.startsAt) -
        Date.parse(right.occurrence.startsAt),
    )[0];
}

/** The public club page (website.md §2.1: "Book / Register / Follow"). */
export function ClubPage({
  storefront,
  theme,
  events,
  coaches,
  viewer,
  now,
  catalogError,
}: ClubPageProps) {
  const name = theme.displayName ?? storefront.name;
  const slug = storefront.slug;
  const catalog = storefront.catalog;
  const byDoor = (door: Door) =>
    catalog.filter((item) => offeringDoor(item) === door);
  const play = byDoor("play");
  const train = byDoor("train");
  const plans = byDoor("join");
  const shop = byDoor("shop");
  const memberships = plans.filter((item) => item.subtype === "membership");
  const packs = plans.filter((item) => item.subtype !== "membership");
  const clubEvents = events
    .filter(
      (event) =>
        (event.organizationId === storefront.organizationId ||
          event.organizationSlug === slug) &&
        event.lifecycleStatus !== "cancelled" &&
        (event.live || Date.parse(event.endsAt) > now.getTime()),
    )
    .toSorted(
      (left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt),
    )
    .slice(0, 6);
  const openForBooking =
    catalog.length > 0 || clubEvents.length > 0 || Boolean(catalogError);

  const club = {
    name,
    color: theme.color,
    ...theme.mark,
  };
  const place =
    storefront.venues[0]?.locality ?? storefront.contact.locality ?? undefined;
  const region =
    storefront.venues[0]?.administrativeArea ??
    storefront.contact.administrativeArea;
  const where = [place, region].filter(Boolean).join(", ");

  // ---------- Actions ----------
  const next = soonest([...play, ...train], now);
  const membership = memberships[0];
  const membershipPrice = membership ? offeringPrice(membership) : undefined;
  const messageTarget = `/app/messages?club=${encodeURIComponent(slug)}`;
  // Messages reach the club's team in Duna (signed in; a visitor signs in
  // first and comes back to the conversation).
  const messageAction: PageAction = {
    label: "Message the club",
    href: actionHref({ signedIn: viewer.signedIn, target: messageTarget }),
  };
  const bookAction: PageAction | undefined = next
    ? {
        label: "Book a session",
        href: productHref(slug, next.item),
        note: `${next.item.title} · ${sessionWhen(next.occurrence).day} ${sessionWhen(next.occurrence).time}`,
      }
    : clubEvents[0]
      ? {
          label: "Register",
          href: `/events/${clubEvents[0].slug}`,
          note: clubEvents[0].title,
        }
      : undefined;
  const joinAction: PageAction | undefined =
    membership && membershipPrice?.card
      ? {
          label: `Join for ${priceWords(membershipPrice.card)}`,
          href: `${productHref(slug, membership)}#join`,
          note: theme.membershipProgramName ?? membership.title,
        }
      : undefined;
  const primary = bookAction ?? joinAction ?? messageAction;
  const sectionActions: Record<string, PageAction> = {
    ...(bookAction
      ? { play: bookAction, train: bookAction, week: bookAction }
      : {}),
    ...(joinAction ? { join: joinAction } : {}),
    contact: messageAction,
    places: messageAction,
  };

  // ---------- This week ----------
  const weekEnd = now.getTime() + 7 * 24 * 3_600_000;
  const week = [
    ...[...play, ...train].flatMap((item) =>
      upcoming(item, now)
        .filter((occurrence) => Date.parse(occurrence.startsAt) < weekEnd)
        .map((occurrence) => ({
          key: occurrence.key,
          at: occurrence.startsAt,
          zone: occurrence.timezone,
          title: item.title,
          href: productHref(slug, item),
          state: sessionState({ item, occurrence, clubName: name, now }),
          chip: undefined as string | undefined,
          live: false,
        })),
    ),
    ...clubEvents
      .filter((event) => Date.parse(event.startsAt) < weekEnd)
      .map((event) => ({
        key: event.id,
        at: event.startsAt,
        zone: event.timezone,
        title: event.title,
        href: `/events/${event.slug}`,
        state: undefined,
        chip: PHASE_WORDS[eventPhase(event)],
        live: eventPhase(event) === "live",
      })),
  ].toSorted((left, right) => Date.parse(left.at) - Date.parse(right.at));
  const weekDays = new Map<string, typeof week>();
  for (const entry of week) {
    const day = formatVenueTime(entry.at, entry.zone, "en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
    weekDays.set(day, [...(weekDays.get(day) ?? []), entry]);
  }

  // ---------- Policies (the club's published rules, in plain words) ----------
  const policies = [...play, ...train]
    .flatMap((item) => {
      const lines = [minimumSentence(item), cancellationSentence(item)].filter(
        (line): line is string => Boolean(line),
      );
      return lines.length ? [{ item, lines }] : [];
    })
    .slice(0, 6);

  const style = {
    ...theme.style,
  } as CSSProperties;

  const heroMedia = theme.hero;
  const doorItems: Readonly<
    Record<Exclude<Door, "shop">, readonly Offering[]>
  > = { play, train, join: plans };

  return (
    <main
      className="club-page"
      data-card={theme.cardStyle}
      data-layout={theme.layout}
      data-themed={theme.themed ? "" : undefined}
      data-zone="editorial"
      id="main"
      style={style}
      tabIndex={-1}
    >
      <OfflineBanner className="site-wrap club-offline" writes="refused" />

      {/* ---------- Hero ---------- */}
      <section
        aria-labelledby="club-title"
        className="site-wrap club-hero"
        data-media={heroMedia ? heroMedia.kind : "none"}
      >
        <Rally className="club-hero__copy">
          <div className="club-hero__identity">
            <ClubMark {...club} decorative size="xl" />
            <p className="site-label">
              {where ? `Club · ${where}` : "Club on Duna"}
            </p>
          </div>
          <h1 className="club-display" id="club-title">
            {name}
          </h1>
          {theme.tagline ? (
            <p className="site-lead club-hero__tagline">{theme.tagline}</p>
          ) : null}
          {openForBooking ? (
            <div className="site-actions club-hero__actions">
              <LinkButton href={primary.href} size="lg" variant="primary">
                {primary.label}
              </LinkButton>
              {joinAction && primary !== joinAction ? (
                <LinkButton href="#join" size="lg" variant="secondary">
                  Membership
                </LinkButton>
              ) : null}
            </div>
          ) : null}
          {theme.summary ? (
            <ClubWords club={name}>{theme.summary}</ClubWords>
          ) : null}
        </Rally>
        <div className="club-hero__stage td-rise">
          {heroMedia ? (
            <ClubMedia
              alt={`${name}: the club's own ${heroMedia.kind === "video" ? "film" : "photograph"}`}
              kind={heroMedia.kind}
              poster={heroMedia.poster}
              priority
              url={heroMedia.url}
            />
          ) : (
            <div aria-hidden="true" className="club-hero__placeholder">
              <ClubMark {...club} decorative size="hero" />
            </div>
          )}
        </div>
      </section>

      {!openForBooking ? (
        <section className="site-wrap club-section" aria-label="Booking">
          <EmptyState
            actions={
              <>
                <LinkButton href={siteLinks.findGame} variant="primary">
                  Find a game nearby
                </LinkButton>
                <LinkButton href={messageAction.href} variant="secondary">
                  Message the club
                </LinkButton>
              </>
            }
            description={`When ${name} publishes sessions, coaching or memberships, you'll book them here. Until then, find a game near you.`}
            icon="clock"
            title="Not open for booking yet"
          />
        </section>
      ) : null}

      {/* ---------- Three doors ---------- */}
      {openForBooking ? (
        <nav aria-label="What you can do here" className="site-wrap club-doors">
          <Rally className="club-doors__grid">
            {DOORS.map((door) => {
              const items = doorItems[door.door];
              const first =
                door.door === "join" ? undefined : soonest(items, now);
              const state = first
                ? sessionState({
                    item: first.item,
                    occurrence: first.occurrence,
                    clubName: name,
                    now,
                  })
                : undefined;
              const price =
                door.door === "join" && membership && membershipPrice?.card
                  ? `${membershipPrice.from ? "From " : ""}${priceWords(membershipPrice.card)}`
                  : undefined;
              return (
                <a
                  aria-disabled={items.length === 0 || undefined}
                  className="club-door club-card"
                  href={`#${door.door}`}
                  key={door.door}
                >
                  <span className="club-door__head">
                    <Icon name={door.icon} size="control" />
                    <span className="site-label">{door.label}</span>
                  </span>
                  <strong className="club-door__title">{door.title}</strong>
                  {items.length === 0 ? (
                    <span className="site-meta">{door.empty}</span>
                  ) : first ? (
                    <span className="club-door__next">
                      <span>
                        {first.item.title} ·{" "}
                        <span className="club-num">
                          {sessionWhen(first.occurrence).day}
                        </span>
                      </span>
                      {state ? <SessionChip state={state} /> : null}
                    </span>
                  ) : price ? (
                    <span className="club-door__next">
                      <span className="club-num">{price}</span>
                    </span>
                  ) : (
                    <span className="site-meta">{items.length} on offer</span>
                  )}
                </a>
              );
            })}
          </Rally>
        </nav>
      ) : null}

      {catalogError ? (
        <section className="site-wrap club-section" aria-label="Offerings">
          <ErrorState
            message="We couldn't load this club's sessions and memberships just now. Try again in a moment."
            reference={catalogError}
            title="Sessions didn't load"
          />
        </section>
      ) : null}

      {/* ---------- This week ---------- */}
      {weekDays.size > 0 ? (
        <Section id="week" label="This week" title="This week at a glance">
          <div className="club-week">
            {[...weekDays.entries()].map(([day, entries]) => (
              <div className="club-week__day" key={day}>
                <h3 className="club-week__date">{day}</h3>
                <ul>
                  {entries.map((entry) => (
                    <li key={entry.key}>
                      <Link className="club-week__row" href={entry.href}>
                        <span className="club-num club-week__time">
                          {formatVenueTime(entry.at, entry.zone, "en-US", {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                        <span className="club-week__title">{entry.title}</span>
                        {entry.state ? (
                          <SessionChip state={entry.state} />
                        ) : entry.chip ? (
                          <Chip
                            kind="status"
                            tone={entry.live ? "live" : "neutral"}
                          >
                            {entry.chip}
                          </Chip>
                        ) : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {/* ---------- Play ---------- */}
      {play.length > 0 ? (
        <Section
          id="play"
          label="Play"
          lead="Turn up and play: rotating games with players at your level."
          title="Open play and pickup"
        >
          <OfferingGrid items={play} now={now} clubName={name} slug={slug} />
        </Section>
      ) : null}

      {/* ---------- Train ---------- */}
      {train.length > 0 ? (
        <Section
          id="train"
          label="Train"
          lead="Coached sessions. Group sessions show how many have booked and what happens if too few do."
          title="Lessons, groups and clinics"
        >
          <OfferingGrid items={train} now={now} clubName={name} slug={slug} />
        </Section>
      ) : null}

      {/* ---------- Join ---------- */}
      {plans.length > 0 ? (
        <Section
          id="join"
          label="Join"
          lead={
            membership
              ? "The card you'll carry in your Duna wallet."
              : "Credits and packs for regular players."
          }
          title={theme.membershipProgramName ?? "Membership"}
        >
          {membership ? (
            <MembershipOffer
              club={club}
              href={`${productHref(slug, membership)}#join`}
              item={membership}
              memberName={viewer.name}
              now={now}
            />
          ) : null}
          {packs.length > 0 || memberships.length > 1 ? (
            <OfferingGrid
              items={[...memberships.slice(1), ...packs]}
              now={now}
              clubName={name}
              slug={slug}
            />
          ) : null}
        </Section>
      ) : null}

      {/* ---------- Events ---------- */}
      {clubEvents.length > 0 ? (
        <Section id="events" label="Events" title="Tournaments and events">
          <Rally className="club-grid">
            {clubEvents.map((event) => {
              const phase = eventPhase(event);
              const when = eventWhen(event);
              const entry = lowestEntry(event);
              return (
                <Link
                  className="club-card club-event"
                  href={`/events/${event.slug}`}
                  key={event.id}
                >
                  <span className="club-event__top">
                    <Chip
                      kind="status"
                      tone={
                        phase === "live"
                          ? "live"
                          : phase === "waitlist"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {PHASE_WORDS[phase]}
                    </Chip>
                    <span className="site-meta">
                      {subtypeWords(event.kind)}
                    </span>
                  </span>
                  <strong className="club-card__title">{event.title}</strong>
                  <span className="site-meta club-num">{when.day}</span>
                  <span className="club-card__price club-num">
                    {entry.from ? "From " : ""}
                    {entry.price.label}
                  </span>
                </Link>
              );
            })}
          </Rally>
        </Section>
      ) : null}

      {/* ---------- Shop ---------- */}
      {shop.length > 0 ? (
        <Section id="shop" label="Shop" title="From the club shop">
          <OfferingGrid items={shop} now={now} clubName={name} slug={slug} />
        </Section>
      ) : null}

      {/* ---------- Coaches ---------- */}
      {coaches.length > 0 ? (
        <Section id="coaches" label="Coaches" title="Who coaches here">
          <Rally className="club-coaches">
            {coaches.map((coach) => (
              <Link
                className="club-coach club-card"
                href={`/coaches/${coach.handle}`}
                key={`${coach.organizationId}-${coach.personId}`}
              >
                {coach.avatarUrl ? (
                  <img
                    alt=""
                    className="club-coach__photo"
                    height={64}
                    loading="lazy"
                    src={coach.avatarUrl}
                    width={64}
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="club-coach__photo club-coach__initials"
                  >
                    {initials(coach.displayName)}
                  </span>
                )}
                <span>
                  <strong>{coach.displayName}</strong>
                  <span className="site-meta">
                    {coach.homeMarket ?? "Coach"}
                  </span>
                </span>
                <Icon name="chevron-right" size="inline" />
              </Link>
            ))}
          </Rally>
        </Section>
      ) : null}

      {/* ---------- Places ---------- */}
      {storefront.venues.length > 0 ? (
        <Section id="places" label="Places" title="Where the club plays">
          <div className="club-places">
            <PlaceMap
              address={addressLine(storefront.venues[0]!)}
              latitude={storefront.venues[0]!.latitude}
              longitude={storefront.venues[0]!.longitude}
              name={storefront.venues[0]!.name}
            />
            <ul className="club-venues">
              {storefront.venues.map((venue) => (
                <li className="club-venue" key={venue.id}>
                  <Icon name="pin" size="control" />
                  <span>
                    <strong>{venue.name}</strong>
                    <span className="site-meta">
                      {[
                        addressLine(venue),
                        venue.courtCount
                          ? `${venue.courtCount} court${venue.courtCount === 1 ? "" : "s"}`
                          : undefined,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    {venue.amenities.length ? (
                      <span className="club-venue__tags">
                        {venue.amenities.slice(0, 4).map((amenity) => (
                          <Chip key={amenity} kind="taxonomy">
                            {amenity}
                          </Chip>
                        ))}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Section>
      ) : null}

      {/* ---------- Policies ---------- */}
      {policies.length > 0 ? (
        <Section
          id="policies"
          label="Policies"
          lead="From the rules the club set for each session."
          title="Before you book"
        >
          <dl className="club-policies">
            {policies.map(({ item, lines }) => (
              <div key={item.id}>
                <dt>{item.title}</dt>
                {lines.map((line) => (
                  <dd key={line}>{line}</dd>
                ))}
              </div>
            ))}
          </dl>
        </Section>
      ) : null}

      {/* ---------- Contact ---------- */}
      <Section id="contact" label="Contact" title={`Talk to ${name}`}>
        <div className="club-contact">
          <ul className="club-contact__list">
            {storefront.contact.email ? (
              <li>
                <Icon name="mail" size="control" />
                <a
                  className="site-link"
                  href={`mailto:${storefront.contact.email}`}
                >
                  {storefront.contact.email}
                </a>
              </li>
            ) : null}
            {storefront.contact.phone ? (
              <li>
                <Icon name="phone-bubble" size="control" />
                <a
                  className="site-link"
                  href={`tel:${storefront.contact.phone}`}
                >
                  {storefront.contact.phone}
                </a>
              </li>
            ) : null}
            {addressLine(storefront.contact) ? (
              <li>
                <Icon name="pin" size="control" />
                <span>{addressLine(storefront.contact)}</span>
              </li>
            ) : null}
          </ul>
          <div className="club-contact__message">
            <p className="site-body">
              Messages go to the club&apos;s team in Duna, and replies come back
              to you there.
            </p>
            <LinkButton href={messageAction.href} variant="secondary">
              Message the club
            </LinkButton>
          </div>
        </div>
      </Section>

      {openForBooking ? (
        <ActionBar
          label={`Book at ${name}`}
          primary={primary}
          sections={sectionActions}
        />
      ) : null}
    </main>
  );
}

/** Offering cards: title, what it is, the next sessions with group state, price all-in. */
function OfferingGrid({
  items,
  now,
  clubName,
  slug,
}: {
  readonly items: readonly Offering[];
  readonly now: Date;
  readonly clubName: string;
  readonly slug: string;
}) {
  return (
    <Rally className="club-grid">
      {items.map((item) => {
        const price = offeringPrice(item);
        const availability = offeringAvailability(item, now);
        const href = productHref(slug, item);
        const image = item.media.find((media) => media.kind === "image");
        return (
          <article className="club-card club-offering" key={item.id}>
            {image ? (
              <div className="club-offering__photo">
                <img alt={image.alt ?? ""} loading="lazy" src={image.url} />
              </div>
            ) : null}
            <span className="club-offering__top">
              <span className="site-label">{subtypeWords(item.subtype)}</span>
              {AVAILABILITY_WORDS[availability.kind] ? (
                <Chip
                  kind="status"
                  tone={
                    availability.kind === "members-only" ? "info" : "warning"
                  }
                >
                  {AVAILABILITY_WORDS[availability.kind]}
                </Chip>
              ) : null}
            </span>
            <h3 className="club-card__title">
              <Link href={href}>{item.title}</Link>
            </h3>
            {item.shortSummary ? (
              <p className="site-body">{item.shortSummary}</p>
            ) : null}
            <SessionList
              clubName={clubName}
              href={href}
              item={item}
              limit={2}
              now={now}
            />
            <span className="club-offering__foot">
              <span className="club-card__price club-num">
                {offeringPriceLine(price)}
              </span>
              <ArrowLink href={href}>Details</ArrowLink>
            </span>
          </article>
        );
      })}
    </Rally>
  );
}

/** The membership as the club's card (wallet.md §7), then plans, benefits and one join action. */
function MembershipOffer({
  club,
  item,
  href,
  memberName,
  now,
}: {
  readonly club: { readonly name: string; readonly color: string | null };
  readonly item: Offering;
  readonly href: string;
  readonly memberName?: string;
  readonly now: Date;
}) {
  const price = offeringPrice(item);
  const includes = offeringIncludes(item).slice(0, 3);
  const availability = offeringAvailability(item, now);
  const plans = item.variants.flatMap((variant) => {
    const card = offeringPrice(item, variant.id).card;
    return card ? [{ id: variant.id, title: variant.title, card }] : [];
  });
  const firstPlan = plans[0];
  return (
    <div className="club-join">
      <div className="club-join__card">
        <MembershipCard
          art={club.color ? { source: "colour", color: club.color } : undefined}
          chip={firstPlan?.title}
          club={club}
          label={`${club.name} membership card, as it will look in your wallet`}
          member={memberName ?? "Your name"}
          motion="still"
          number={null}
          pass={null}
          plan={item.title}
          status="active"
        />
        <p className="site-meta club-join__caption">
          {memberName
            ? "Your card, with your name."
            : "Your card, with your name on it once you join."}
        </p>
      </div>
      <div className="club-join__detail">
        <h3 className="club-card__title">{item.title}</h3>
        {plans.length > 0 ? (
          <ul className="club-join__plans" aria-label="Plans">
            {plans.map((plan) => (
              <li className="club-join__plan" key={plan.id}>
                <span>{plan.title}</span>
                <strong className="club-num">{priceWords(plan.card)}</strong>
              </li>
            ))}
          </ul>
        ) : null}
        {includes.length > 0 ? (
          <ul className="club-join__includes" aria-label="What it includes">
            {includes.map((line) => (
              <li key={line}>
                <Icon name="check" size="inline" /> {line}
              </li>
            ))}
          </ul>
        ) : null}
        {allInNote(price.card) ? (
          <p className="site-meta">{allInNote(price.card)}</p>
        ) : null}
        {availability.kind === "available" && price.card ? (
          <LinkButton href={href} size="lg" variant="secondary">
            {`Join for ${priceWords(price.card)}`}
          </LinkButton>
        ) : (
          <p className="site-body">
            {AVAILABILITY_WORDS[availability.kind] ?? "Not on sale online"}
          </p>
        )}
      </div>
    </div>
  );
}
