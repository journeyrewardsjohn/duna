import type { OperatorWorkspace, PublicCatalogItem } from "@duna/api";
import { Badge, Numeric } from "@duna/ui";
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
import { notFound } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { CoachCard } from "@/components/coach-card";
import { EventCard } from "@/components/event-card";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getServerCaller } from "@/lib/api";

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
      primary: "#173A63",
      accent: "#2B67A4",
      sand: "#E9DFC9",
      ink: "#101828",
      canvas: "#FAFAF7",
      success: "#3E7A5D",
    },
    typography: { heading: "Instrument Sans", body: "Archivo" },
    fontLicenseConfirmed: false,
    safeFallbackFont: "Arial, Helvetica, sans-serif",
    cardStyle: "soft" as const,
    profileLayout: "editorial",
  };
  const themeStyle = {
    "--club-primary": theme.palette.primary,
    "--club-accent": theme.palette.accent,
    "--club-sand": theme.palette.sand,
    "--club-ink": theme.palette.ink,
    "--club-canvas": theme.palette.canvas,
    "--club-heading": `"${theme.typography.heading}", "Instrument Sans", sans-serif`,
    "--club-body": `"${theme.typography.body}", "Archivo", sans-serif`,
  } as CSSProperties;
  const catalog = storefront?.catalog ?? [];
  const catalogEvents = catalog.filter((item) => item.type === "event");
  const services = catalog.filter((item) => item.type === "service");
  const plans = catalog.filter((item) => item.type === "plan");
  const goods = catalog.filter((item) => item.type === "good");

  return (
    <main
      className={`public-detail club-profile club-profile--${theme.cardStyle} club-profile-layout--${theme.profileLayout}`}
      style={themeStyle}
    >
      <SiteHeader />
      <section className="club-hero">
        <div
          className="club-hero__art"
          style={
            theme.heroMediaType === "image" && theme.heroMediaUrl
              ? { backgroundImage: `url("${theme.heroMediaUrl}")` }
              : undefined
          }
        >
          {theme.heroMediaType === "video" && theme.heroMediaUrl && (
            <video
              autoPlay
              loop
              muted
              playsInline
              poster={theme.heroPosterUrl}
              src={theme.heroMediaUrl}
            />
          )}
          <div />
          <span>{mark}</span>
        </div>
        <div className="club-hero__copy">
          <div>
            <Badge tone="positive">Verified club</Badge>
            <Badge>{organization.plan.replace("-", " ")}</Badge>
          </div>
          {theme.logoUrl && (
            <img
              alt={`${organization.name} logo`}
              className="club-hero__logo"
              src={theme.logoUrl}
            />
          )}
          <h1>{organization.name}</h1>
          <p>
            {theme.tagline ??
              theme.profileSummary ??
              "Training, competition, and community in one simple place."}
          </p>
          <div className="club-hero__stats">
            <span>
              <Numeric>{organization.memberCount}</Numeric>
              <small>players</small>
            </span>
            <span>
              <Numeric>{organization.staffCount}</Numeric>
              <small>coaches + staff</small>
            </span>
            <span>
              <Numeric>{organization.venueCount}</Numeric>
              <small>venues</small>
            </span>
          </div>
          <a href="#book">
            Explore what’s available <ArrowRight size={17} />
          </a>
        </div>
      </section>
      <nav aria-label="Club profile" className="club-profile-nav">
        <a href="#book">Events</a>
        {services.length > 0 && <a href="#services">Services</a>}
        {coaches.length > 0 && <a href="#coaches">Coaches</a>}
        {plans.length > 0 && <a href="#plans">Memberships + credits</a>}
        {goods.length > 0 && <a href="#shop">Shop</a>}
        <a href="#locations">Locations</a>
      </nav>
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
