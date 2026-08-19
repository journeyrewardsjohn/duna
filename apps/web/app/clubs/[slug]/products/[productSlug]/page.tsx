import {
  ArrowLeft,
  Boxes,
  CalendarClock,
  Check,
  CircleHelp,
  Clock3,
  Layers3,
  MapPin,
  Quote,
  RefreshCw,
  Star,
  Users,
  Video,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { CatalogCheckoutPanel } from "@/components/catalog-checkout-panel";
import { CatalogMediaGallery } from "@/components/catalog-media-gallery";
import { CatalogRecommendations } from "@/components/catalog-recommendations";
import { MarkdownContent } from "@/components/markdown-content";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getServerCaller } from "@/lib/api";
import { absolutePublicUrl, serializeJsonLd } from "@/lib/pro-seo";
import styles from "./catalog-product-page.module.css";

function configurationRecord(
  value: unknown,
): Readonly<Record<string, unknown>> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ slug: string; productSlug: string }>;
}): Promise<Metadata> {
  const { slug, productSlug } = await params;
  const caller = await getServerCaller();
  const storefront = await caller.public
    .organizationStorefront({ slug })
    .catch(() => undefined);
  const item = storefront?.catalog.find(
    (candidate) => candidate.slug === productSlug,
  );
  if (!storefront || !item) return { title: "Offer not found" };
  const canonical = `/clubs/${slug}/products/${productSlug}`;
  const description =
    item.shortSummary ??
    item.description ??
    `Review ${item.title} from ${storefront.name} and book through Duna.`;
  return {
    title: `${item.title} · ${storefront.name}`,
    description,
    alternates: {
      canonical,
      types: { "text/markdown": `${canonical}.md` },
    },
    openGraph: {
      title: item.title,
      description,
      type: "website",
      url: canonical,
      images: item.media
        .filter((media) => media.kind === "image")
        .slice(0, 1)
        .map((media) => ({ url: media.url, alt: media.alt ?? item.title })),
    },
    robots: { index: item.visibility === "public", follow: true },
  };
}

export default async function CatalogProductPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ slug: string; productSlug: string }>;
  readonly searchParams: Promise<{
    checkout?: string;
    session_id?: string;
    membership_checkout?: string;
    membership_session_id?: string;
  }>;
}) {
  const [{ slug, productSlug }, query] = await Promise.all([
    params,
    searchParams,
  ]);
  const caller = await getServerCaller();
  const [storefront, wallets, playerSettings] = await Promise.all([
    caller.public.organizationStorefront({ slug }).catch(() => undefined),
    caller.player.organizationWallets().catch(() => []),
    caller.player.settings().catch(() => undefined),
  ]);
  const item = storefront?.catalog.find(
    (candidate) => candidate.slug === productSlug,
  );
  if (!storefront || !item) notFound();
  const offerEligibility = await caller.player
    .catalogOfferEligibility({ catalogItemId: item.id })
    .catch(() => ({
      isMember: false,
      included: false,
      remainingBookings: undefined,
    }));
  const organizationBenefits = wallets.find(
    (wallet) => wallet.organizationId === storefront.organizationId,
  );
  const walletCredits = organizationBenefits?.credits ?? 0;
  const isMember = offerEligibility.isMember;
  const membershipConfiguration =
    item.configuration.membership &&
    typeof item.configuration.membership === "object" &&
    !Array.isArray(item.configuration.membership)
      ? (item.configuration.membership as Readonly<Record<string, unknown>>)
      : undefined;
  const serviceConfiguration = configurationRecord(item.configuration.service);
  const benefits = Array.isArray(membershipConfiguration?.benefits)
    ? membershipConfiguration.benefits.filter(
        (benefit): benefit is string => typeof benefit === "string",
      )
    : [];
  const configuredHighlights = Array.isArray(item.configuration.highlights)
    ? item.configuration.highlights.filter(
        (highlight): highlight is string => typeof highlight === "string",
      )
    : [];
  const creditsGranted = Number(item.configuration.creditsGranted ?? 0);
  const highlights =
    configuredHighlights.length > 0
      ? configuredHighlights
      : Number.isSafeInteger(creditsGranted) && creditsGranted > 0
        ? [
            `${creditsGranted} ${storefront.name} credits`,
            "Use credits on eligible bookings and services",
            "Balance appears in Duna as soon as payment completes",
          ]
        : benefits;
  const bestFor =
    typeof item.configuration.bestFor === "string"
      ? item.configuration.bestFor
      : undefined;
  const redemptionNotes =
    typeof item.configuration.redemptionNotes === "string"
      ? item.configuration.redemptionNotes
      : undefined;
  const validityDays = Number(item.configuration.validityDays ?? 0);
  const testimonials = Array.isArray(item.configuration.testimonials)
    ? item.configuration.testimonials.flatMap((entry) => {
        const testimonial = configurationRecord(entry);
        const quote = testimonial?.quote;
        if (typeof quote !== "string" || !quote.trim()) return [];
        return [
          {
            quote,
            author:
              typeof testimonial?.author === "string"
                ? testimonial.author
                : undefined,
            context:
              typeof testimonial?.context === "string"
                ? testimonial.context
                : undefined,
            rating:
              typeof testimonial?.rating === "number" &&
              testimonial.rating >= 1 &&
              testimonial.rating <= 5
                ? Math.round(testimonial.rating)
                : 5,
          },
        ];
      })
    : [];
  const faqs = Array.isArray(item.configuration.faqs)
    ? item.configuration.faqs.flatMap((entry) => {
        const faq = configurationRecord(entry);
        const question = faq?.question;
        const answer = faq?.answer;
        return typeof question === "string" &&
          question.trim() &&
          typeof answer === "string" &&
          answer.trim()
          ? [{ question, answer }]
          : [];
      })
    : [];
  const durationMinutes = Number(serviceConfiguration?.durationMinutes ?? 0);
  const capacity = Number(serviceConfiguration?.capacity ?? 0);
  const isOnline = item.configuration.deliveryMode === "online";
  const outcomeHeadline =
    typeof item.configuration.outcomeHeadline === "string"
      ? item.configuration.outcomeHeadline
      : undefined;
  const outcomeBody =
    typeof item.configuration.outcomeBody === "string"
      ? item.configuration.outcomeBody
      : undefined;
  const howItWorks = Array.isArray(item.configuration.howItWorks)
    ? item.configuration.howItWorks.filter(
        (step): step is string =>
          typeof step === "string" && Boolean(step.trim()),
      )
    : [];
  const membershipOffers = storefront.catalog.filter(
    (candidate) =>
      candidate.type === "plan" && candidate.subtype === "membership",
  );
  const shouldLoadPostPurchaseWaivers =
    query.checkout === "success" || query.membership_checkout === "success";
  const [itemWaiverRequirements, membershipWaiverRequirements] =
    shouldLoadPostPurchaseWaivers
      ? await Promise.all([
          caller.player
            .waiverRequirements({
              organizationId: storefront.organizationId,
              catalogItemId: item.id,
            })
            .catch(() => []),
          membershipOffers[0]
            ? caller.player
                .waiverRequirements({
                  organizationId: storefront.organizationId,
                  catalogItemId: membershipOffers[0].id,
                })
                .catch(() => [])
            : Promise.resolve([]),
        ])
      : [[], []];
  const canonicalPath = `/clubs/${slug}/products/${productSlug}`;
  const recommendations = await caller.public
    .catalogRecommendations({
      organizationSlug: slug,
      catalogItemId: item.id,
      title: item.title,
      type: item.type,
      subtype: item.subtype,
      latitude: storefront.contact.latitude,
      longitude: storefront.contact.longitude,
    })
    .catch(() => ({ sameOrganization: [], nearby: [] }));
  const inventoryQuantities = item.variants.flatMap((variant) =>
    typeof variant.availableQuantity === "number"
      ? [variant.availableQuantity]
      : [],
  );
  const totalAvailable = inventoryQuantities.reduce(
    (total, quantity) => total + quantity,
    0,
  );
  const recurringInterval = item.variants
    .flatMap((variant) => variant.prices)
    .find((price) => price.recurringInterval)?.recurringInterval;
  const hasFacts =
    item.type === "service" ||
    item.type === "good" ||
    item.type === "plan" ||
    validityDays > 0;
  const pageUrl = absolutePublicUrl(canonicalPath);
  const offers = item.variants.flatMap((variant) =>
    variant.prices.flatMap((price) =>
      price.amountMinor !== undefined && price.currency
        ? [
            {
              "@type": "Offer",
              name: variant.title,
              price: price.amountMinor / 100,
              priceCurrency: price.currency,
              availability:
                variant.availableQuantity === 0
                  ? "https://schema.org/SoldOut"
                  : "https://schema.org/InStock",
              url: pageUrl,
            },
          ]
        : [],
    ),
  );
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${pageUrl}#page`,
        url: pageUrl,
        name: item.title,
        mainEntity: { "@id": `${pageUrl}#offer` },
        encoding: {
          "@type": "MediaObject",
          encodingFormat: "text/markdown",
          contentUrl: absolutePublicUrl(`${canonicalPath}.md`),
        },
      },
      {
        "@type": item.type === "good" ? "Product" : "Service",
        "@id": `${pageUrl}#offer`,
        identifier: item.id,
        name: item.title,
        description: item.description ?? item.shortSummary,
        image: item.media
          .filter((media) => media.kind === "image")
          .map((media) => media.url),
        url: pageUrl,
        provider: {
          "@type": "SportsOrganization",
          "@id": `${absolutePublicUrl(`/clubs/${slug}`)}#organization`,
          name: storefront.name,
          url: absolutePublicUrl(`/clubs/${slug}`),
        },
        offers: offers.length ? offers : undefined,
      },
    ],
  };

  const brandName = storefront.theme.brandDisplayName ?? storefront.name;
  const featureHeadline =
    outcomeHeadline ??
    (item.type === "good"
      ? "Built for the way beach volleyball is played."
      : item.type === "plan"
        ? "More time playing. More value every time you return."
        : "Know where you are. See exactly what comes next.");
  const featureBody =
    outcomeBody ??
    item.shortSummary ??
    `A connected experience from ${brandName}, built to make the next step clear.`;
  const nearbyNoun =
    item.type === "good"
      ? "Goods"
      : item.type === "plan"
        ? "Plans"
        : item.type === "event"
          ? "Events"
          : "Services";

  return (
    <main
      className={styles.page}
      data-zone="editorial"
      style={
        {
          "--catalog-primary": storefront.theme.palette.primary,
          "--catalog-accent": storefront.theme.palette.accent,
          "--catalog-sand": storefront.theme.palette.sand,
        } as CSSProperties
      }
    >
      <SiteHeader />
      <script
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }}
        type="application/ld+json"
      />
      <div className={styles.shell}>
        <Link className={styles.back} href={`/clubs/${slug}`}>
          <ArrowLeft aria-hidden size={15} /> Back to {brandName}
        </Link>

        <section className={styles.topGrid}>
          <div className={styles.galleryPanel}>
            <CatalogMediaGallery
              media={item.media}
              subtype={item.subtype}
              title={item.title}
              variants={item.variants}
            />
          </div>
          <aside className={styles.purchaseColumn}>
            <div className={styles.identity}>
              <div className={styles.identityMeta}>
                <span>{item.subtype.replaceAll("-", " ")}</span>
                <Link href={`/clubs/${slug}`}>{brandName}</Link>
              </div>
              <h1>{item.title}</h1>
              <p className={styles.summary}>
                {item.shortSummary ??
                  `A better way to spend time with ${brandName}.`}
              </p>
              {bestFor && (
                <p className={styles.bestFor}>
                  <strong>Best for:</strong> {bestFor}
                </p>
              )}
              {hasFacts && (
                <div className={styles.facts} aria-label="Offer at a glance">
                  {item.type === "service" && durationMinutes > 0 && (
                    <article className={styles.fact}>
                      <Clock3 aria-hidden size={17} />
                      <span>
                        <strong>{durationMinutes} minutes</strong>
                        <small>Focused coaching time</small>
                      </span>
                    </article>
                  )}
                  {item.type === "service" && capacity > 0 && (
                    <article className={styles.fact}>
                      <Users aria-hidden size={17} />
                      <span>
                        <strong>
                          {capacity === 1
                            ? "Private session"
                            : `Up to ${capacity} players`}
                        </strong>
                        <small>
                          {capacity === 1
                            ? "One player or private group"
                            : "Train together"}
                        </small>
                      </span>
                    </article>
                  )}
                  {item.type === "service" && (
                    <article className={styles.fact}>
                      <MapPin aria-hidden size={17} />
                      <span>
                        <strong>{isOnline ? "Online" : "At the club"}</strong>
                        <small>
                          {isOnline
                            ? "Join from wherever you are"
                            : "Location confirmed when you book"}
                        </small>
                      </span>
                    </article>
                  )}
                  {item.type === "good" && (
                    <article className={styles.fact}>
                      <Layers3 aria-hidden size={17} />
                      <span>
                        <strong>
                          {item.variants.length} option
                          {item.variants.length === 1 ? "" : "s"}
                        </strong>
                        <small>Choose before checkout</small>
                      </span>
                    </article>
                  )}
                  {item.type === "good" && inventoryQuantities.length > 0 && (
                    <article className={styles.fact}>
                      <Boxes aria-hidden size={17} />
                      <span>
                        <strong>
                          {totalAvailable > 0
                            ? `${totalAvailable} available`
                            : "Currently unavailable"}
                        </strong>
                        <small>Live connected inventory</small>
                      </span>
                    </article>
                  )}
                  {item.type === "plan" && recurringInterval && (
                    <article className={styles.fact}>
                      <RefreshCw aria-hidden size={17} />
                      <span>
                        <strong>Renews {recurringInterval}ly</strong>
                        <small>Billing shown before payment</small>
                      </span>
                    </article>
                  )}
                  {item.type === "plan" && creditsGranted > 0 && (
                    <article className={styles.fact}>
                      <WalletCards aria-hidden size={17} />
                      <span>
                        <strong>{creditsGranted} credits</strong>
                        <small>Connected to your Duna account</small>
                      </span>
                    </article>
                  )}
                  {validityDays > 0 && (
                    <article className={styles.fact}>
                      <Clock3 aria-hidden size={17} />
                      <span>
                        <strong>{validityDays} days to use</strong>
                        <small>Starting at purchase</small>
                      </span>
                    </article>
                  )}
                </div>
              )}
              {item.upcomingOccurrences.length > 0 && (
                <section className="catalog-upcoming-sessions">
                  <span className="section__eyebrow">Upcoming sessions</span>
                  <div>
                    {item.upcomingOccurrences.map((occurrence) => (
                      <article key={occurrence.key}>
                        <CalendarClock aria-hidden size={18} />
                        <span>
                          <strong>
                            {new Intl.DateTimeFormat("en-US", {
                              weekday: "long",
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                              timeZone: occurrence.timezone,
                            }).format(new Date(occurrence.startsAt))}
                          </strong>
                          <small>
                            {occurrence.availableCoaches
                              .map((coach) => coach.displayName)
                              .join(", ")}
                            {item.configuration.deliveryMode === "online"
                              ? " · Google Meet"
                              : ""}
                          </small>
                        </span>
                        {item.configuration.deliveryMode === "online" && (
                          <Video aria-label="Online session" size={17} />
                        )}
                      </article>
                    ))}
                  </div>
                </section>
              )}
            </div>

            <CatalogCheckoutPanel
              initialCheckoutSessionId={
                query.checkout === "success" ? query.session_id : undefined
              }
              initialNotice={
                query.checkout === "cancelled"
                  ? "Checkout was cancelled. Any temporary inventory hold will be released."
                  : query.membership_checkout === "cancelled"
                    ? "Membership checkout was cancelled. You can change your selection below."
                    : undefined
              }
              initialMembershipCheckoutSessionId={
                query.membership_checkout === "success"
                  ? query.membership_session_id
                  : undefined
              }
              item={item}
              organization={{
                id: storefront.organizationId,
                slug,
                name: storefront.name,
                currency: storefront.currency,
                paymentsReady: storefront.paymentsReady,
              }}
              isMember={isMember}
              membershipIncluded={offerEligibility.included}
              membershipOffers={membershipOffers}
              itemWaiverRequirements={itemWaiverRequirements}
              membershipWaiverRequirements={membershipWaiverRequirements}
              membershipRemainingBookings={offerEligibility.remainingBookings}
              dunaServiceFeeWaived={playerSettings?.dunaPlus.active ?? false}
              walletCredits={walletCredits}
            />
          </aside>
        </section>

        <div className={styles.content}>
          <section className={styles.featureStory}>
            <div>
              <span className={styles.eyebrow}>Why it matters</span>
              <h2>{featureHeadline}</h2>
            </div>
            <p>{featureBody}</p>
          </section>

          {(item.description || highlights.length > 0) && (
            <section className={styles.detailsGrid}>
              <header className={styles.sectionHeading}>
                <span className={styles.eyebrow}>The experience</span>
                <h2>Everything you need to choose with confidence.</h2>
                {(redemptionNotes || validityDays > 0) && (
                  <p>
                    {redemptionNotes ?? `Use within ${validityDays} days.`}
                    {redemptionNotes && validityDays > 0
                      ? ` Valid for ${validityDays} days after purchase.`
                      : ""}
                  </p>
                )}
              </header>
              <div>
                {item.description && (
                  <div className={styles.richText}>
                    <MarkdownContent>{item.description}</MarkdownContent>
                  </div>
                )}
                {highlights.length > 0 && (
                  <div className={styles.highlights}>
                    {highlights.map((highlight) => (
                      <article className={styles.highlight} key={highlight}>
                        <Check aria-hidden size={17} />
                        <strong>{highlight}</strong>
                      </article>
                    ))}
                  </div>
                )}
                {Number(membershipConfiguration?.includedCreditsPerCycle ?? 0) >
                  0 && (
                  <div className={styles.highlights}>
                    <article className={styles.highlight}>
                      <WalletCards aria-hidden size={17} />
                      <strong>
                        {
                          membershipConfiguration?.includedCreditsPerCycle as number
                        }{" "}
                        credits every billing cycle
                      </strong>
                    </article>
                  </div>
                )}
              </div>
            </section>
          )}

          {howItWorks.length > 0 && (
            <section className={styles.detailsGrid}>
              <header className={styles.sectionHeading}>
                <span className={styles.eyebrow}>How it works</span>
                <h2>A simple path from purchase to play.</h2>
              </header>
              <div className={styles.steps}>
                {howItWorks.map((step) => (
                  <article className={styles.step} key={step}>
                    <p>{step}</p>
                  </article>
                ))}
              </div>
            </section>
          )}

          {testimonials.length > 0 && (
            <section className={styles.socialProof}>
              <header className={styles.sectionHeading}>
                <span className={styles.eyebrow}>From the community</span>
                <h2>What players and parents are saying.</h2>
              </header>
              <div className={styles.quotes}>
                {testimonials.map((testimonial) => (
                  <blockquote
                    className={styles.quote}
                    key={`${testimonial.quote}-${testimonial.author ?? ""}`}
                  >
                    <Quote aria-hidden size={25} />
                    <span
                      aria-label={`${testimonial.rating} out of 5 stars`}
                      className={styles.rating}
                    >
                      {Array.from({ length: 5 }, (_, index) => (
                        <Star
                          aria-hidden
                          fill={
                            index < testimonial.rating ? "currentColor" : "none"
                          }
                          key={index}
                          size={15}
                        />
                      ))}
                    </span>
                    <p>“{testimonial.quote}”</p>
                    {(testimonial.author || testimonial.context) && (
                      <footer>
                        {testimonial.author && (
                          <strong>{testimonial.author}</strong>
                        )}
                        {testimonial.author && testimonial.context && " · "}
                        {testimonial.context}
                      </footer>
                    )}
                  </blockquote>
                ))}
              </div>
            </section>
          )}

          {faqs.length > 0 && (
            <section className={styles.faqs}>
              <header className={styles.sectionHeading}>
                <span className={styles.eyebrow}>Questions, answered</span>
                <h2>Good to know before you begin.</h2>
                <CircleHelp aria-hidden size={26} />
              </header>
              <div className={styles.faqList}>
                {faqs.map((faq) => (
                  <details key={faq.question}>
                    <summary>{faq.question}</summary>
                    <p>{faq.answer}</p>
                  </details>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      <CatalogRecommendations
        cards={recommendations.sameOrganization}
        description={`Duna matched these active ${brandName} offers using the experience, audience, and next likely step. Organization-selected relationships take priority.`}
        eyebrow="Continue with this organization"
        title={`Explore Other Aspects of ${brandName}`}
      />
      <CatalogRecommendations
        cards={recommendations.nearby}
        description="Comparable active offers from other Duna organizations, ordered by local relevance and fit."
        eyebrow="Around you"
        title={`Other Similar ${nearbyNoun} Near You`}
      />
      <SiteFooter />
    </main>
  );
}
