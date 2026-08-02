import { Badge } from "@duna/ui";
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
import { notFound } from "next/navigation";
import { CatalogCheckoutPanel } from "@/components/catalog-checkout-panel";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getServerCaller } from "@/lib/api";

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
  const [storefront, wallets] = await Promise.all([
    caller.public.organizationStorefront({ slug }).catch(() => undefined),
    caller.player.organizationWallets().catch(() => []),
  ]);
  const item = storefront?.catalog.find(
    (candidate) => candidate.slug === productSlug,
  );
  if (!storefront || !item) notFound();
  const organizationBenefits = wallets.find(
    (wallet) => wallet.organizationId === storefront.organizationId,
  );
  const walletCredits = organizationBenefits?.credits ?? 0;
  const isMember =
    organizationBenefits?.membershipStatus === "active" ||
    organizationBenefits?.membershipStatus === "trialing";
  const media = item.media[0];

  return (
    <main className="public-detail catalog-product-page">
      <SiteHeader />
      <div className="catalog-product-shell">
        <Link className="catalog-product-back" href={`/clubs/${slug}`}>
          <ArrowLeft size={16} /> Back to {storefront.name}
        </Link>
        <section className="catalog-product-layout">
          <div className="catalog-product-main">
            <div
              className="catalog-product-hero"
              style={
                media?.kind === "image"
                  ? { backgroundImage: `url("${media.url}")` }
                  : undefined
              }
            >
              {!media && <span>{item.title.slice(0, 2).toUpperCase()}</span>}
              <Badge>{item.subtype.replaceAll("-", " ")}</Badge>
            </div>
            <div className="catalog-product-copy">
              <span className="section__eyebrow">{item.type}</span>
              <h1>{item.title}</h1>
              <p className="catalog-product-summary">
                {item.shortSummary ??
                  "A connected offer from this Duna organization."}
              </p>
              {item.description && (
                <div className="catalog-product-description">
                  {item.description}
                </div>
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
                      {item.type === "good"
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
            walletCredits={walletCredits}
          />
        </section>
      </div>
      <SiteFooter />
    </main>
  );
}
