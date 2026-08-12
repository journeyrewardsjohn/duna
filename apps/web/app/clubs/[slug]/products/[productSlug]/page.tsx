import { ArrowLeft, Check, WalletCards } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { CatalogCheckoutPanel } from "@/components/catalog-checkout-panel";
import { CatalogMediaGallery } from "@/components/catalog-media-gallery";
import { MarkdownContent } from "@/components/markdown-content";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getServerCaller } from "@/lib/api";
import { absolutePublicUrl, serializeJsonLd } from "@/lib/pro-seo";

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
  const membershipOffers = storefront.catalog.filter(
    (candidate) =>
      candidate.type === "plan" && candidate.subtype === "membership",
  );
  const canonicalPath = `/clubs/${slug}/products/${productSlug}`;
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

  return (
    <main
      className="public-detail catalog-product-page"
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
      <div className="catalog-product-shell">
        <Link className="catalog-product-back" href={`/clubs/${slug}`}>
          <ArrowLeft size={16} /> Back to {storefront.name}
        </Link>
        <section className="catalog-product-layout">
          <div className="catalog-product-main">
            <CatalogMediaGallery
              media={item.media}
              subtype={item.subtype}
              title={item.title}
              variants={item.variants}
            />
            <div className="catalog-product-copy">
              <span className="section__eyebrow">{item.type}</span>
              <h1>{item.title}</h1>
              <p className="catalog-product-summary">
                {item.shortSummary ??
                  `A better way to spend time with ${storefront.name}.`}
              </p>
              {bestFor && (
                <section className="catalog-product-story">
                  <span className="section__eyebrow">Best for</span>
                  <p>{bestFor}</p>
                </section>
              )}
              {highlights.length > 0 && (
                <section className="catalog-product-highlights">
                  <span className="section__eyebrow">What you get</span>
                  <div>
                    {highlights.map((highlight) => (
                      <article key={highlight}>
                        <Check size={18} />
                        <strong>{highlight}</strong>
                      </article>
                    ))}
                  </div>
                </section>
              )}
              {item.description && (
                <div className="catalog-product-description">
                  <span className="section__eyebrow">The details</span>
                  <MarkdownContent>{item.description}</MarkdownContent>
                </div>
              )}
              {Number(membershipConfiguration?.includedCreditsPerCycle ?? 0) >
                0 && (
                <section className="catalog-membership-inclusions">
                  <span className="section__eyebrow">Every billing cycle</span>
                  <div>
                    <article>
                      <WalletCards size={18} />
                      <span>
                        <strong>
                          {
                            membershipConfiguration?.includedCreditsPerCycle as number
                          }{" "}
                          credits
                        </strong>
                        <small>Ready to use only with {storefront.name}.</small>
                      </span>
                    </article>
                  </div>
                </section>
              )}
              {(redemptionNotes || validityDays > 0) && (
                <section className="catalog-product-story">
                  <span className="section__eyebrow">How to use it</span>
                  <p>
                    {redemptionNotes ??
                      `Use within ${validityDays} days of purchase.`}
                    {redemptionNotes && validityDays > 0
                      ? ` Valid for ${validityDays} days after purchase.`
                      : ""}
                  </p>
                </section>
              )}
            </div>
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
              slug,
              name: storefront.name,
              currency: storefront.currency,
              paymentsReady: storefront.paymentsReady,
            }}
            isMember={isMember}
            membershipIncluded={offerEligibility.included}
            membershipOffers={membershipOffers}
            membershipRemainingBookings={offerEligibility.remainingBookings}
            dunaServiceFeeWaived={playerSettings?.dunaPlus.active ?? false}
            walletCredits={walletCredits}
          />
        </section>
      </div>
      <SiteFooter />
    </main>
  );
}
