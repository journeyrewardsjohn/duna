import type { PublicOrganizationStorefront } from "@duna/api";
import {
  membershipSubscriptionDisclosure,
  membershipSubscriptionPolicy,
} from "@duna/core";
import {
  Chip,
  ClubMark,
  Icon,
  MembershipCard,
  Notice,
  OfflineBanner,
  Rally,
} from "@duna/ui/tideline";
import Link from "@/components/site/site-link";
import type { CSSProperties } from "react";
import { ArrowLink, LinkButton } from "@/components/site/link-button";
import { ActionBar, type PageAction } from "./action-bar";
import {
  allInNote,
  AVAILABILITY_WORDS,
  cancellationSentence,
  configured,
  minimumSentence,
  offeringAvailability,
  offeringDoor,
  offeringImages,
  offeringIncludes,
  offeringPrice,
  offeringPriceLine,
  priceWords,
  serviceFacts,
  subtypeWords,
  upcoming,
  type Offering,
} from "./offers";
import { addressLine, ClubWords, PlaceMap, SessionList } from "./parts";
import type { ClubThemeView } from "./theme";
import { actionHref } from "./viewer";

type Storefront = PublicOrganizationStorefront;

function paragraphs(text: string): readonly string[] {
  return text
    .split(/\n{2,}/)
    .map((part) => part.replaceAll(/[#*_>`]/g, "").trim())
    .filter(Boolean);
}

function stringList(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is string =>
          typeof entry === "string" && Boolean(entry.trim()),
      )
    : [];
}

function faqs(item: Offering) {
  const value = item.configuration.faqs;
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const { question, answer } = entry as Record<string, unknown>;
    return typeof question === "string" &&
      question.trim() &&
      typeof answer === "string" &&
      answer.trim()
      ? [{ question: question.trim(), answer: answer.trim() }]
      : [];
  });
}

/**
 * An offering's public page: what it is, who it is for, when (sessions with
 * the group state and price ladder in the shared words), where, the coach,
 * the price all-in, what happens if the group is too small, cancellation in
 * one sentence, and one action into the existing checkout. Goods show their
 * options and photos; a membership shows the club's card and its terms.
 */
export function OfferingPage({
  storefront,
  theme,
  item,
  viewer,
  now,
}: {
  readonly storefront: Storefront;
  readonly theme: ClubThemeView;
  readonly item: Offering;
  readonly viewer: { readonly signedIn: boolean; readonly name?: string };
  readonly now: Date;
}) {
  const name = theme.displayName ?? storefront.name;
  const slug = storefront.slug;
  const club = { name, color: theme.color, ...theme.mark };
  const door = offeringDoor(item);
  const price = offeringPrice(item);
  const availability = offeringAvailability(item, now);
  const sessions = upcoming(item, now);
  const facts = serviceFacts(item);
  const images = offeringImages(item);
  const includes = offeringIncludes(item);
  const bestFor = configured(item, "bestFor");
  const steps = stringList(item.configuration.howItWorks);
  const questions = faqs(item);
  const minimum = minimumSentence(item);
  const cancellation = cancellationSentence(item);
  const coaches = [
    ...new Map(
      sessions
        .flatMap((occurrence) => occurrence.availableCoaches)
        .map((coach) => [coach.personId, coach.displayName]),
    ).values(),
  ];
  const membership = item.type === "plan" && item.subtype === "membership";
  const waitlistOpen = sessions.some(
    (occurrence) => occurrence.participation?.waitlistCount !== undefined,
  );
  const membershipItem = storefront.catalog.find(
    (candidate) =>
      candidate.type === "plan" && candidate.subtype === "membership",
  );
  const checkout = `/clubs/${slug}/products/${item.slug}/checkout`;
  const toCheckout = (label: string): PageAction => ({
    label,
    href: actionHref({
      signedIn: viewer.signedIn,
      target: checkout,
      product: item.title,
      organization: name,
    }),
    ...(price.card ? { note: `${offeringPriceLine(price)} all-in` } : {}),
  });

  let action: PageAction | undefined;
  switch (availability.kind) {
    case "available":
      action = toCheckout(
        membership && price.card
          ? `Join for ${priceWords(price.card)}`
          : item.type === "service" || item.type === "event"
            ? "Book a place"
            : "Buy",
      );
      break;
    case "full":
      action = waitlistOpen
        ? toCheckout("Join the waitlist")
        : {
            label: "See other sessions",
            href: `/clubs/${slug}#${door === "play" ? "play" : "train"}`,
          };
      break;
    case "members-only":
      action =
        membershipItem && membershipItem.id !== item.id
          ? {
              label: "Join to book",
              href: `/clubs/${slug}/products/${membershipItem.slug}#join`,
            }
          : toCheckout("Book as a member");
      break;
    default:
      action = {
        label: "Message the club",
        href: actionHref({
          signedIn: viewer.signedIn,
          target: `/app/messages?club=${encodeURIComponent(slug)}`,
        }),
      };
  }

  const firstCard = price.card;
  const recurring = firstCard?.recurring;
  const terms =
    membership && firstCard && (recurring === "month" || recurring === "year")
      ? membershipSubscriptionDisclosure({
          organizationName: name,
          priceLabel: firstCard.label,
          billingInterval: recurring,
          policy: membershipSubscriptionPolicy(item.configuration),
        })
      : undefined;
  const siblings = storefront.catalog
    .filter(
      (candidate) =>
        candidate.id !== item.id && offeringDoor(candidate) === door,
    )
    .slice(0, 3);
  const venue = storefront.venues[0];

  return (
    <main
      className="club-page club-offering-page"
      data-card={theme.cardStyle}
      data-themed={theme.themed ? "" : undefined}
      data-zone="editorial"
      id="main"
      style={theme.style as CSSProperties}
      tabIndex={-1}
    >
      <OfflineBanner className="site-wrap club-offline" writes="refused" />
      <nav aria-label="Breadcrumb" className="site-wrap club-crumbs">
        <Link className="club-crumbs__club" href={`/clubs/${slug}`}>
          <ClubMark {...club} decorative size="sm" />
          <span>{name}</span>
        </Link>
        <Icon name="chevron-right" size="chip" />
        <span aria-current="page">{item.title}</span>
      </nav>

      <section
        aria-labelledby="offering-title"
        className="site-wrap club-offer"
      >
        <Rally className="club-offer__copy">
          <p className="site-label">
            {subtypeWords(item.subtype)}
            {AVAILABILITY_WORDS[availability.kind] ? (
              <Chip
                className="club-offer__state"
                kind="status"
                tone={availability.kind === "members-only" ? "info" : "warning"}
              >
                {AVAILABILITY_WORDS[availability.kind]}
              </Chip>
            ) : null}
          </p>
          <h1 className="club-display club-display--offer" id="offering-title">
            {item.title}
          </h1>
          {item.shortSummary ? (
            <p className="site-lead">{item.shortSummary}</p>
          ) : null}
          <dl className="club-facts">
            {bestFor ? (
              <div>
                <dt>Who it&apos;s for</dt>
                <dd>{bestFor}</dd>
              </div>
            ) : null}
            {facts.minutes ? (
              <div>
                <dt>How long</dt>
                <dd className="club-num">{facts.minutes} minutes</dd>
              </div>
            ) : null}
            {facts.capacity ? (
              <div>
                <dt>Group</dt>
                <dd>
                  {facts.capacity === 1
                    ? "Private: one player or a pair"
                    : `Up to ${facts.capacity} players`}
                </dd>
              </div>
            ) : null}
            {item.type === "service" ? (
              <div>
                <dt>Where</dt>
                <dd>
                  {facts.online
                    ? "Online"
                    : venue
                      ? `${name}'s courts; the court is confirmed when you book`
                      : "At the club; the court is confirmed when you book"}
                </dd>
              </div>
            ) : null}
            {coaches.length ? (
              <div>
                <dt>Coach</dt>
                <dd>{coaches.join(", ")}</dd>
              </div>
            ) : null}
          </dl>
          <div className="club-price">
            <span className="club-price__value club-num">
              {offeringPriceLine(price)}
            </span>
            {allInNote(price.card) ? (
              <span className="site-meta">{allInNote(price.card)}</span>
            ) : null}
          </div>
          {!storefront.paymentsReady && price.card ? (
            <Notice tone="info" title="Card payment isn't set up here yet">
              {name} hasn&apos;t finished setting up online payments. You can
              still message the club to book.
            </Notice>
          ) : null}
          {action ? (
            <div className="site-actions" id="join">
              <LinkButton href={action.href} size="lg" variant="primary">
                {action.label}
              </LinkButton>
            </div>
          ) : null}
          {!viewer.signedIn && availability.kind === "available" ? (
            <p className="site-meta">
              You&apos;ll sign in or create a free account, then come straight
              back to this.
            </p>
          ) : null}
        </Rally>
        <div className="club-offer__stage td-rise">
          {membership ? (
            <div className="club-join__card">
              <MembershipCard
                art={
                  theme.color
                    ? { source: "colour", color: theme.color }
                    : undefined
                }
                chip={item.variants[0]?.title}
                club={club}
                label={`${name} membership card, as it will look in your wallet`}
                member={viewer.name ?? "Your name"}
                motion="still"
                number={null}
                pass={null}
                plan={item.title}
                status="active"
              />
              <p className="site-meta club-join__caption">
                {viewer.name
                  ? "Your card, with your name."
                  : "Your card, with your name on it once you join."}
              </p>
            </div>
          ) : images.length ? (
            <div
              className="club-gallery"
              data-count={Math.min(images.length, 4)}
            >
              {images.slice(0, 4).map((image) => (
                <div className="site-photo club-gallery__photo" key={image.url}>
                  <img
                    alt={image.alt}
                    className="site-photo__image"
                    decoding="async"
                    src={image.url}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div
              aria-hidden="true"
              className="club-hero__placeholder club-offer__placeholder"
            >
              <ClubMark {...club} decorative size="2xl" />
            </div>
          )}
        </div>
      </section>

      {sessions.length > 0 ? (
        <section
          aria-labelledby="sessions-title"
          className="site-wrap club-section"
        >
          <div className="club-section__head">
            <p className="site-label">When</p>
            <h2 className="club-h2" id="sessions-title">
              Next sessions
            </h2>
          </div>
          <SessionList
            clubName={name}
            item={item}
            limit={6}
            now={now}
            showLadder
          />
          {minimum || cancellation ? (
            <dl className="club-policies club-policies--inline">
              {minimum ? (
                <div>
                  <dt>If the group is too small</dt>
                  <dd>{minimum}</dd>
                </div>
              ) : null}
              {cancellation ? (
                <div>
                  <dt>Cancellation</dt>
                  <dd>{cancellation}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}
        </section>
      ) : item.type === "service" ? (
        <section className="site-wrap club-section" aria-label="When">
          <p className="site-body">
            No dates are published right now. Times are offered when you book,
            from the coach&apos;s and the club&apos;s calendars.
          </p>
        </section>
      ) : null}

      {item.type === "good" && item.variants.length > 0 ? (
        <section
          aria-labelledby="options-title"
          className="site-wrap club-section"
        >
          <div className="club-section__head">
            <p className="site-label">Options</p>
            <h2 className="club-h2" id="options-title">
              Choose at checkout
            </h2>
          </div>
          <ul className="club-options">
            {item.variants.map((variant) => {
              const variantPrice = offeringPrice(item, variant.id).card;
              const left = variant.availableQuantity;
              return (
                <li className="club-option" key={variant.id}>
                  <span>
                    <strong>{variant.title}</strong>
                    {Object.entries(variant.optionCoordinates).length ? (
                      <span className="site-meta">
                        {Object.entries(variant.optionCoordinates)
                          .map(([key, value]) => `${key}: ${value}`)
                          .join(" · ")}
                      </span>
                    ) : null}
                  </span>
                  {variantPrice ? (
                    <span className="club-num">{variantPrice.label}</span>
                  ) : null}
                  {typeof left === "number" ? (
                    <Chip
                      kind="status"
                      tone={left === 0 ? "warning" : "neutral"}
                    >
                      {left === 0 ? "Sold out" : `${left} left`}
                    </Chip>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {includes.length > 0 || terms ? (
        <section
          aria-labelledby="includes-title"
          className="site-wrap club-section"
        >
          <div className="club-section__head">
            <p className="site-label">
              {membership ? "Membership" : "Included"}
            </p>
            <h2 className="club-h2" id="includes-title">
              What it includes
            </h2>
          </div>
          {includes.length ? (
            <ul className="club-join__includes">
              {includes.map((line) => (
                <li key={line}>
                  <Icon name="check" size="inline" /> {line}
                </li>
              ))}
            </ul>
          ) : null}
          {terms ? (
            <div className="club-terms">
              <h3 className="club-h3">Terms</h3>
              <p className="site-body">{terms}</p>
            </div>
          ) : null}
        </section>
      ) : null}

      {item.description || steps.length ? (
        <section
          aria-labelledby="about-title"
          className="site-wrap club-section"
        >
          <div className="club-section__head">
            <p className="site-label">About</p>
            <h2 className="club-h2" id="about-title">
              From {name}
            </h2>
          </div>
          {item.description ? (
            <ClubWords club={name}>
              {paragraphs(item.description).join("\n\n")}
            </ClubWords>
          ) : null}
          {steps.length ? (
            <ol className="club-steps">
              {steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          ) : null}
        </section>
      ) : null}

      {questions.length ? (
        <section aria-labelledby="faq-title" className="site-wrap club-section">
          <div className="club-section__head">
            <p className="site-label">Questions</p>
            <h2 className="club-h2" id="faq-title">
              Good to know
            </h2>
          </div>
          <div className="club-faq">
            {questions.map((faq) => (
              <details key={faq.question}>
                <summary>{faq.question}</summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>
      ) : null}

      {item.type === "service" && venue && !facts.online ? (
        <section
          aria-labelledby="where-title"
          className="site-wrap club-section"
        >
          <div className="club-section__head">
            <p className="site-label">Where</p>
            <h2 className="club-h2" id="where-title">
              Where {name} plays
            </h2>
          </div>
          <PlaceMap
            address={addressLine(venue)}
            latitude={venue.latitude}
            longitude={venue.longitude}
            name={venue.name}
          />
        </section>
      ) : null}

      {siblings.length ? (
        <section
          aria-labelledby="more-title"
          className="site-wrap club-section"
        >
          <div className="club-section__head">
            <p className="site-label">More at {name}</p>
            <h2 className="club-h2" id="more-title">
              You might also like
            </h2>
          </div>
          <ul className="club-more">
            {siblings.map((sibling) => (
              <li key={sibling.id}>
                <ArrowLink href={`/clubs/${slug}/products/${sibling.slug}`}>
                  {sibling.title}
                </ArrowLink>
                <span className="site-meta club-num">
                  {offeringPriceLine(offeringPrice(sibling))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {action ? (
        <ActionBar label={`${item.title} at ${name}`} primary={action} />
      ) : null}
    </main>
  );
}
