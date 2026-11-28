import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CatalogCheckoutPanel } from "@/components/catalog-checkout-panel";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getServerCaller } from "@/lib/api";

/**
 * Catalog checkout, unchanged: the purchase panel that used to sit on the
 * offering page (options, sessions, payment method, membership add-on,
 * waivers after payment, resume after sign-in). The offering's public face
 * is `/clubs/[slug]/products/[productSlug]` (SITE-5); its one action leads
 * here, and payment returns here. Not indexed.
 */
export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ slug: string; productSlug: string }>;
}): Promise<Metadata> {
  const { slug, productSlug } = await params;
  return {
    title: "Checkout",
    alternates: { canonical: `/clubs/${slug}/products/${productSlug}` },
    robots: { index: false, follow: false },
  };
}

export default async function CatalogCheckoutPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ slug: string; productSlug: string }>;
  readonly searchParams: Promise<{
    checkout?: string;
    session_id?: string;
    membership_checkout?: string;
    membership_session_id?: string;
    resume_checkout?: string;
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
  const walletCredits =
    wallets.find(
      (wallet) => wallet.organizationId === storefront.organizationId,
    )?.credits ?? 0;
  const membershipOffers = storefront.catalog.filter(
    (candidate) =>
      candidate.type === "plan" && candidate.subtype === "membership",
  );
  const afterPayment =
    query.checkout === "success" || query.membership_checkout === "success";
  const [itemWaiverRequirements, membershipWaiverRequirements] = afterPayment
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
  const brandName = storefront.theme.brandDisplayName ?? storefront.name;
  return (
    <main className="standard-page checkout-page" data-zone="editorial">
      <SiteHeader />
      <Link href={`/clubs/${slug}/products/${productSlug}`}>
        Back to {item.title}
      </Link>
      <h1>{item.title}</h1>
      <p>{brandName}</p>
      <CatalogCheckoutPanel
        dunaServiceFeeWaived={playerSettings?.dunaPlus.active ?? false}
        initialCheckoutSessionId={
          query.checkout === "success" ? query.session_id : undefined
        }
        initialMembershipCheckoutSessionId={
          query.membership_checkout === "success"
            ? query.membership_session_id
            : undefined
        }
        initialNotice={
          query.checkout === "cancelled"
            ? "Checkout was cancelled. Any temporary inventory hold will be released."
            : query.membership_checkout === "cancelled"
              ? "Membership checkout was cancelled. You can change your selection below."
              : undefined
        }
        isMember={offerEligibility.isMember}
        item={item}
        itemWaiverRequirements={itemWaiverRequirements}
        membershipIncluded={offerEligibility.included}
        membershipOffers={membershipOffers}
        membershipRemainingBookings={offerEligibility.remainingBookings}
        membershipWaiverRequirements={membershipWaiverRequirements}
        organization={{
          id: storefront.organizationId,
          slug,
          name: storefront.name,
          currency: storefront.currency,
          paymentsReady: storefront.paymentsReady,
        }}
        resumeCheckout={query.resume_checkout === "1"}
        walletCredits={walletCredits}
      />
      <SiteFooter />
    </main>
  );
}
