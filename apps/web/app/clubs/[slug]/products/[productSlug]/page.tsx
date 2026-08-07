import {
  ArrowLeft,
  Check,
  Clock3,
  CreditCard,
  PackageCheck,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
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
  const isMember =
    organizationBenefits?.membershipStatus === "active" ||
    organizationBenefits?.membershipStatus === "trialing";
  const benefits = Array.isArray(item.configuration.benefits)
    ? item.configuration.benefits.filter(
        (benefit): benefit is string => typeof benefit === "string",
      )
    : [];
  const membershipConfiguration =
    item.configuration.membership &&
    typeof item.configuration.membership === "object" &&
    !Array.isArray(item.configuration.membership)
      ? (item.configuration.membership as Readonly<Record<string, unknown>>)
      : undefined;
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
    <main className="public-detail catalog-product-page" data-zone="editorial">
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
                  "A connected offer from this Duna organization."}
              </p>
              {item.description && (
                <div className="catalog-product-description">
                  <MarkdownContent>{item.description}</MarkdownContent>
                </div>
              )}
              {(benefits.length > 0 || membershipConfiguration) && (
                <section className="catalog-membership-inclusions">
                  <span className="section__eyebrow">What is included</span>
                  <div>
                    {Number(
                      membershipConfiguration?.includedCreditsPerCycle ?? 0,
                    ) > 0 && (
                      <article>
                        <WalletCards size={18} />
                        <span>
                          <strong>
                            {
                              membershipConfiguration?.includedCreditsPerCycle as number
                            }{" "}
                            credits each billing cycle
                          </strong>
                          <small>Valid only with this organization.</small>
                        </span>
                      </article>
                    )}
                    {benefits.map((benefit) => (
                      <article key={benefit}>
                        <Check size={18} />
                        <span>
                          <strong>{benefit}</strong>
                        </span>
                      </article>
                    ))}
                  </div>
                </section>
              )}
              <div className="catalog-product-benefits">
                <article>
                  <Check size={18} />
                  <span>
                    <strong>Connected to your account</strong>
                    <small>
                      Purchases, credits, and membership stay visible in Duna.
                    </small>
                  </span>
                </article>
                <article>
                  {item.allowCredits ? (
                    <WalletCards size={18} />
                  ) : (
                    <CreditCard size={18} />
                  )}
                  <span>
                    <strong>Clear payment choices</strong>
                    <small>
                      {item.allowCredits
                        ? "Pay by card or this organization’s credits."
                        : item.allowCard
                          ? "Secure online payment."
                          : "Pay directly with the organization in person."}
                    </small>
                  </span>
                </article>
                <article>
                  {item.type === "good" ? (
                    <PackageCheck size={18} />
                  ) : (
                    <Clock3 size={18} />
                  )}
                  <span>
                    <strong>
                      {item.type === "good" &&
                      item.configuration.inventoryTracked !== false
                        ? "Inventory reserved at checkout"
                        : "Fulfillment tracked"}
                    </strong>
                    <small>
                      Duna keeps the operator and player on the same record.
                    </small>
                  </span>
                </article>
                <article>
                  <ShieldCheck size={18} />
                  <span>
                    <strong>Organization-scoped</strong>
                    <small>
                      Member access and credits are enforced by organization.
                    </small>
                  </span>
                </article>
              </div>
            </div>
          </div>
          <CatalogCheckoutPanel
            initialCheckoutSessionId={
              query.checkout === "success" ? query.session_id : undefined
            }
            initialNotice={
              query.checkout === "cancelled"
                ? "Checkout was cancelled. Any temporary inventory hold will be released."
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
