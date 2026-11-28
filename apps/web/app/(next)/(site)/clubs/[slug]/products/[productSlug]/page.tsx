import "../../../../detail.css";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { load } from "@/components/club/load";
import { OfferingPage } from "@/components/club/offering-page";
import {
  offeringImages,
  offeringPrice,
  offeringPriceLine,
} from "@/components/club/offers";
import {
  offeringJsonLd,
  serializeGraph,
} from "@/components/club/structured-data";
import { clubThemeView } from "@/components/club/theme";
import { pageViewer } from "@/components/club/viewer";
import { siteOgImage } from "@/components/site/og";
import { getServerCaller, getServerContext } from "@/lib/api";
import { absolutePublicUrl } from "@/lib/pro-seo";

type Params = Promise<{ slug: string; productSlug: string }>;
type Query = Promise<Record<string, string | string[] | undefined>>;

/** Addresses the checkout and sign-in send people back to (payment, resume). */
const CHECKOUT_RETURN_KEYS = [
  "checkout",
  "session_id",
  "membership_checkout",
  "membership_session_id",
  "resume_checkout",
] as const;

const loadOffering = cache(async (slug: string, productSlug: string) => {
  const caller = await getServerCaller();
  const storefront = await load(
    () => caller.public.organizationStorefront({ slug }),
    "web.offering.storefront",
    { slug, productSlug },
  );
  const item =
    storefront.status === "ok"
      ? storefront.value.catalog.find(
          (candidate) => candidate.slug === productSlug,
        )
      : undefined;
  return { storefront, item };
});

export async function generateMetadata({
  params,
}: {
  readonly params: Params;
}): Promise<Metadata> {
  const { slug, productSlug } = await params;
  const { storefront, item } = await loadOffering(slug, productSlug);
  if (storefront.status !== "ok" || !item) {
    return { title: "Offering not found", robots: { index: false } };
  }
  const club = storefront.value.theme.brandDisplayName ?? storefront.value.name;
  const canonical = `/clubs/${slug}/products/${productSlug}`;
  const priceLine = offeringPriceLine(offeringPrice(item));
  const description = (
    item.shortSummary ?? `${item.title} at ${club}: ${priceLine}. Book on Duna.`
  ).slice(0, 155);
  const image =
    offeringImages(item)[0]?.url !== undefined
      ? absolutePublicUrl(offeringImages(item)[0]!.url)
      : siteOgImage({
          title: item.title,
          eyebrow: club,
          concept: item.type === "plan" ? "price" : "club",
        });
  return {
    title: `${item.title} · ${club}`,
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
      images: [{ url: image, alt: item.title }],
    },
    robots: { index: item.visibility === "public", follow: true },
  };
}

export default async function OfferingRoute({
  params,
  searchParams,
}: {
  readonly params: Params;
  readonly searchParams: Query;
}) {
  const [{ slug, productSlug }, query] = await Promise.all([
    params,
    searchParams,
  ]);
  // Payment and sign-in return to this address; the purchase continues in
  // checkout, with the same query.
  if (CHECKOUT_RETURN_KEYS.some((key) => query[key] !== undefined)) {
    const forward = new URLSearchParams();
    for (const key of CHECKOUT_RETURN_KEYS) {
      const entry = query[key];
      if (typeof entry === "string") forward.set(key, entry);
    }
    redirect(
      `/clubs/${slug}/products/${productSlug}/checkout?${forward.toString()}`,
    );
  }
  const [{ storefront, item }, context, viewer] = await Promise.all([
    loadOffering(slug, productSlug),
    getServerContext(),
    pageViewer(),
  ]);
  if (storefront.status === "error") {
    throw new Error(`Offering ${slug}/${productSlug} did not load`);
  }
  if (storefront.status === "missing" || !item) notFound();
  const theme = clubThemeView(storefront.value.theme);
  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: serializeGraph(
            offeringJsonLd({
              storefront: storefront.value,
              item,
              now: context.now,
            }),
          ),
        }}
        type="application/ld+json"
      />
      <OfferingPage
        item={item}
        now={context.now}
        storefront={storefront.value}
        theme={theme}
        viewer={viewer}
      />
    </>
  );
}
