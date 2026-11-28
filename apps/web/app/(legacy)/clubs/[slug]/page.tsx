import type { OperatorWorkspace, PublicCatalogItem } from "@duna/api";
import { Badge, clubColorCssVariables, Numeric } from "@duna/ui";
import {
  ArrowRight,
  CalendarDays,
  Check,
  CreditCard,
  MapPin,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Users,
} from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { CoachCard } from "@/components/coach-card";
import { ClubHeroMedia } from "@/components/club-hero-media";
import { EventCard } from "@/components/event-card";
import {
  PublicSectionNav,
  type PublicSectionNavItem,
} from "@/components/event-section-nav";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getServerCaller } from "@/lib/api";
import { absolutePublicUrl, serializeJsonLd } from "@/lib/pro-seo";

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const caller = await getServerCaller();
  const organization = await caller.public
    .organizationBySlug({ slug })
    .catch(() => undefined);
  if (!organization) return { title: "Club not found" };
  const canonical = `/clubs/${slug}`;
  return {
    title: `${organization.name} beach volleyball programs`,
    description: `Events, clinics, coaching, memberships, and public booking options from ${organization.name} on Duna.`,
    alternates: {
      canonical,
      types: { "text/markdown": `${canonical}.md` },
    },
    openGraph: {
      title: `${organization.name} · Duna`,
      description: `Explore public beach volleyball programs and booking options from ${organization.name}.`,
      type: "website",
      url: canonical,
    },
    robots: { index: true, follow: true },
  };
}

function priceLabel(item: PublicCatalogItem): string {
  const prices = item.variants[0]?.prices ?? [];
  const moneyPrices = prices.filter(
    (price) => price.paymentKind === "card" && price.amountMinor !== undefined,
  );
  const money = moneyPrices.toSorted(
    (left, right) => (left.amountMinor ?? 0) - (right.amountMinor ?? 0),
  )[0];
  const credits = prices.find(
    (price) =>
      price.paymentKind === "credit" && price.creditAmount !== undefined,
  );
  const parts: string[] = [];
  if (money?.amountMinor !== undefined && money.currency) {
    parts.push(
      `${moneyPrices.length > 1 ? "From " : ""}${new Intl.NumberFormat(
        "en-US",
        {
          style: "currency",
          currency: money.currency,
          maximumFractionDigits: 2,
        },
      ).format(money.amountMinor / 100)}`,
    );
    if (money.recurringInterval) {
      parts[0] += ` / ${money.recurringInterval}`;
    }
  }
  if (credits?.creditAmount) parts.push(`${credits.creditAmount} credits`);
  if (item.allowCash && parts.length === 0) parts.push("Cash");
  return parts.join(" or ") || "Free";
}

function CatalogSection({
  eyebrow,
  title,
  description,
  icon,
  items,
  slug,
  id,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly icon: ReactNode;
  readonly items: readonly PublicCatalogItem[];
  readonly slug: string;
  readonly id: string;
}) {
  if (items.length === 0) return null;
  return (
    <section className="club-offerings" id={id}>
      <header>
        <div>
          <span className="section__eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <span className="club-offerings__icon">{icon}</span>
      </header>
      <div className="club-product-grid">
        {items.map((item) => {
          const media = item.media[0];
          const available = item.variants.reduce(
            (total, variant) => total + (variant.availableQuantity ?? 0),
            0,
          );
          return (
            <article className="club-product-card" key={item.id}>
              <div
                className="club-product-card__media"
                style={
                  media?.kind === "image"
                    ? { backgroundImage: `url("${media.url}")` }
                    : undefined
                }
              >
                {!media && <span>{item.title.slice(0, 2).toUpperCase()}</span>}
                <Badge>{item.subtype.replaceAll("-", " ")}</Badge>
              </div>
              <div className="club-product-card__body">
                <div>
                  <h3>{item.title}</h3>
                  <p>
                    {item.shortSummary ??
                      item.description ??
                      "View details, eligibility, and purchase options."}
                  </p>
                </div>
                <div className="club-product-card__meta">
                  <strong>{priceLabel(item)}</strong>
                  <span>
                    {item.membershipRequired || item.visibility === "members"
                      ? "Members only"
                      : item.type === "good"
                        ? `${available} available`
                        : "Open to book"}
                  </span>
                </div>
                <Link href={`/clubs/${slug}/products/${item.slug}`}>
                  View details <ArrowRight size={16} />
                </Link>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default async function ClubPage({
  params,
}: {
  readonly params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const caller = await getServerCaller();
  const [organization, storefront, allEvents, allVenues, coaches] =
    await Promise.all([
      caller.public.organizationBySlug({ slug }).catch(() => undefined),
      caller.public.organizationStorefront({ slug }).catch(() => undefined),
      caller.public.events(),
      caller.public.venues(),
      caller.public.coaches({ organizationSlug: slug }).catch(() => []),
    ]);
  if (!organization) notFound();
  const events = allEvents.filter(
    (event) =>
      event.organizationId === organization.id ||
      (!event.organizationId && event.organizationName === organization.name),
  );
  const venues = allVenues.filter(
    (venue) => venue.organizationId === organization.id,
  );
  const mark = organization.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  const theme: OperatorWorkspace["theme"] = storefront?.theme ?? {
    palette: {
      primary: "#517986",
      accent: "#BDD2D9",
      sand: "#E5F1F5",
      ink: "#2D4D57",
      canvas: "#F6F5F1",
      success: "#2F6B3A",
      clubHue: 220.25,
      clubChroma: 0.0489,
    },
    typography: { heading: "Satoshi", body: "Satoshi" },
    fontLicenseConfirmed: false,
    safeFallbackFont: "Arial, Helvetica, sans-serif",
    cardStyle: "soft" as const,
    profileLayout: "editorial",
  };
  const normalizedClubColor = clubColorCssVariables(theme.palette.primary);
  const themeStyle = {
    ...normalizedClubColor,
    "--club-primary": normalizedClubColor["--club-core"],
    "--club-accent": normalizedClubColor["--club-edge"],
    "--club-sand": normalizedClubColor["--club-tint"],
    "--club-heading": "var(--font-display)",
    "--club-body": "var(--font-body)",
  } as CSSProperties;
  const catalog = storefront?.catalog ?? [];
  const catalogEvents = catalog.filter((item) => item.type === "event");
  const services = catalog.filter((item) => item.type === "service");
  const plans = catalog.filter((item) => item.type === "plan");
  const goods = catalog.filter((item) => item.type === "good");
  const hasHeroImage =
    theme.heroMediaType === "image" && Boolean(theme.heroMediaUrl);
  const hasHeroVideo =
    theme.heroMediaType === "video" && Boolean(theme.heroMediaUrl);
  const hasHeroMedia = hasHeroImage || hasHeroVideo;
  const sectionNav: PublicSectionNavItem[] = [
    { id: "book", label: "Events" },
    ...(services.length > 0 ? [{ id: "services", label: "Services" }] : []),
    ...(coaches.length > 0 ? [{ id: "coaches", label: "Coaches" }] : []),
    ...(plans.length > 0
      ? [{ id: "plans", label: "Memberships + credits" }]
      : []),
    ...(goods.length > 0 ? [{ id: "shop", label: "Shop" }] : []),
    { id: "locations", label: "Locations" },
  ];
  const clubUrl = absolutePublicUrl(`/clubs/${slug}`);
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${clubUrl}#page`,
        url: clubUrl,
        name: organization.name,
        mainEntity: { "@id": `${clubUrl}#organization` },
        encoding: {
          "@type": "MediaObject",
          encodingFormat: "text/markdown",
          contentUrl: absolutePublicUrl(`/clubs/${slug}.md`),
        },
      },
      {
        "@type": "SportsOrganization",
        "@id": `${clubUrl}#organization`,
        identifier: organization.id,
        name: organization.name,
        url: clubUrl,
        sport: "Beach volleyball",
        employee: coaches.map((coach) => ({
          "@type": "Person",
          "@id": absolutePublicUrl(`/coaches/${coach.handle}`),
          name: coach.displayName,
          url: absolutePublicUrl(`/coaches/${coach.handle}`),
        })),
        event: events.map((event) => ({
          "@type": "SportsEvent",
          "@id": `${absolutePublicUrl(`/events/${event.slug}`)}#event`,
          name: event.title,
          url: absolutePublicUrl(`/events/${event.slug}`),
          startDate: event.startsAt,
          endDate: event.endsAt,
        })),
        makesOffer: catalog.map((item) => ({
          "@type": "Offer",
          name: item.title,
          url: absolutePublicUrl(`/clubs/${slug}/products/${item.slug}`),
        })),
      },
    ],
  };

  return (
    <main
      className={`public-detail club-profile club-profile--${theme.cardStyle} club-profile-layout--${theme.profileLayout}`}
      data-zone="editorial"
      style={themeStyle}
    >
      <SiteHeader />
      <script
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }}
        type="application/ld+json"
      />
      <section
        className={`club-hero club-hero--${hasHeroMedia ? "media" : "gradient"}`}
        data-hero-kind={
          hasHeroImage ? "image" : hasHeroVideo ? "video" : "gradient"
        }
      >
        {hasHeroMedia && theme.heroMediaUrl && (
          <div aria-hidden="true" className="club-hero__media">
            <ClubHeroMedia
              kind={hasHeroImage ? "image" : "video"}
              poster={theme.heroPosterUrl}
              url={theme.heroMediaUrl}
            />
          </div>
        )}
        {!hasHeroMedia && (
          <span aria-hidden="true" className="club-hero__watermark">
            {mark}
          </span>
        )}
        <div className="club-hero__inner">
          <div className="club-hero__identity">
            <span
              className={`club-hero__mark${theme.logoUrl ? " club-hero__mark--logo" : ""}`}
            >
              {theme.logoUrl ? (
                <img alt={`${organization.name} logo`} src={theme.logoUrl} />
              ) : (
                <span aria-hidden="true">{mark}</span>
              )}
            </span>
            <div className="club-hero__chips">
              <Badge tone="positive">Verified club</Badge>
              <Badge>{organization.plan.replace("-", " ")}</Badge>
            </div>
          </div>
          <div className="club-hero__copy">
            <h1>{organization.name}</h1>
            <p>
              {theme.tagline ??
                theme.profileSummary ??
                "Training, competition, and community in one simple place."}
            </p>
            <div className="club-hero__footer">
              <dl className="club-hero__stats">
                <div>
                  <dd>
                    <Numeric>{organization.memberCount}</Numeric>
                  </dd>
                  <dt>players</dt>
                </div>
                <div>
                  <dd>
                    <Numeric>{organization.staffCount}</Numeric>
                  </dd>
                  <dt>coaches + staff</dt>
                </div>
                <div>
                  <dd>
                    <Numeric>{organization.venueCount}</Numeric>
                  </dd>
                  <dt>venues</dt>
                </div>
              </dl>
              <a href="#book">
                Explore what’s available <ArrowRight size={17} />
              </a>
            </div>
          </div>
        </div>
      </section>
      <PublicSectionNav
        ariaLabel="Explore this club"
        className="club-profile-nav"
        items={sectionNav}
        label="Explore club"
        observedContentSelector=".club-profile"
      />
      <section className="club-body">
        <div className="section__heading" id="book">
          <div>
            <span className="section__eyebrow">Book now</span>
            <h2>What’s happening.</h2>
          </div>
        </div>
        <div className="event-grid">
          {events.slice(0, 4).map((event) => (
            <EventCard event={event} key={event.id} />
          ))}
          {events.length === 0 && catalogEvents.length === 0 && (
            <article className="empty-state">
              <h3>No published events yet.</h3>
              <p>This club’s next public offering will appear here.</p>
            </article>
          )}
        </div>
        <CatalogSection
          description="Leagues, tournaments, clinics, and open play with clear eligibility and pricing."
          eyebrow="Events"
          icon={<CalendarDays />}
          id="catalog-events"
          items={catalogEvents}
          slug={slug}
          title="Choose your next run."
        />
        <CatalogSection
          description="Book private coaching, group training, assessments, and recurring programs."
          eyebrow="Services"
          icon={<Sparkles />}
          id="services"
          items={services}
          slug={slug}
          title="Train with intention."
        />
        {coaches.length > 0 && (
          <section className="club-offerings" id="coaches">
            <header>
              <div>
                <span className="section__eyebrow">Meet the team</span>
                <h2>Choose your coach.</h2>
                <p>
                  Explore each coach’s approach, availability, upcoming
                  sessions, and bookable services.
                </p>
              </div>
              <span className="club-offerings__icon">
                <Users />
              </span>
            </header>
            <div className="coach-grid">
              {coaches.map((coach) => (
                <CoachCard
                  coach={coach}
                  key={`${coach.organizationId}-${coach.personId}`}
                  preferred
                />
              ))}
            </div>
          </section>
        )}
        <CatalogSection
          description="Member pricing and organization credits stay with this club and remain visible in your wallet."
          eyebrow="Memberships + credit packs"
          icon={<CreditCard />}
          id="plans"
          items={plans}
          slug={slug}
          title="A simpler way to play more."
        />
        <CatalogSection
          description="Club goods and available equipment for sale, rental, or pickup."
          eyebrow="Shop"
          icon={<ShoppingBag />}
          id="shop"
          items={goods}
          slug={slug}
          title="Gear from the club."
        />
        <div className="club-values">
          <article>
            <Users />
            <strong>A place at every level</strong>
            <p>First sessions through Open division competition.</p>
          </article>
          <article>
            <ShieldCheck />
            <strong>Built-in safety</strong>
            <p>Verified coaches, guardian structure, and versioned waivers.</p>
          </article>
          <article>
            <Check />
            <strong>One clean account</strong>
            <p>Bookings, credits, memberships, purchases, and messages.</p>
          </article>
        </div>
        <div className="club-locations" id="locations">
          <div>
            <span className="section__eyebrow">Where we play</span>
            <h2>
              {venues.length} {venues.length === 1 ? "venue" : "venues"}. One
              club.
            </h2>
          </div>
          <div>
            {venues.map((venue) => (
              <article key={venue.id}>
                <MapPin size={18} />
                <span>
                  <strong>{venue.name}</strong>
                  <small>
                    {venue.city}, {venue.region}
                  </small>
                </span>
                <Badge>{venue.courtCount} courts</Badge>
              </article>
            ))}
          </div>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
