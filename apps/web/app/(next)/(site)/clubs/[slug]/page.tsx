import "../../detail.css";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ClubPage } from "@/components/club/club-page";
import { load, value } from "@/components/club/load";
import { clubJsonLd, serializeGraph } from "@/components/club/structured-data";
import { clubThemeView, UNPUBLISHED_THEME } from "@/components/club/theme";
import { pageViewer } from "@/components/club/viewer";
import { siteOgImage } from "@/components/site/og";
import { getServerCaller, getServerContext } from "@/lib/api";
import { absolutePublicUrl } from "@/lib/pro-seo";

type Params = Promise<{ slug: string }>;

/** One read per request, shared by the metadata and the page. */
const loadClub = cache(async (slug: string) => {
  const caller = await getServerCaller();
  const [storefront, organization] = await Promise.all([
    load(
      () => caller.public.organizationStorefront({ slug }),
      "web.club.storefront",
      { slug },
    ),
    load(
      () => caller.public.organizationBySlug({ slug }),
      "web.club.organization",
      { slug },
    ),
  ]);
  return { storefront, organization };
});

export async function generateMetadata({
  params,
}: {
  readonly params: Params;
}): Promise<Metadata> {
  const { slug } = await params;
  const { storefront, organization } = await loadClub(slug);
  const club = value(storefront);
  const name =
    club?.theme.brandDisplayName ?? club?.name ?? value(organization)?.name;
  if (!name) return { title: "Club not found", robots: { index: false } };
  const theme = clubThemeView(club?.theme);
  const canonical = `/clubs/${slug}`;
  const place = club?.venues[0]?.locality ?? club?.contact.locality;
  const description = (
    theme.tagline ??
    `Open play, coaching, memberships and events at ${name}${place ? ` in ${place}` : ""}. Book on Duna.`
  ).slice(0, 155);
  const image =
    theme.hero?.kind === "image"
      ? absolutePublicUrl(theme.hero.url)
      : siteOgImage({ title: name, eyebrow: place ?? "Club", concept: "club" });
  return {
    title: name,
    description,
    alternates: {
      canonical,
      types: { "text/markdown": `${canonical}.md` },
    },
    openGraph: {
      title: `${name} · Duna`,
      description,
      type: "website",
      url: canonical,
      images: [{ url: image, alt: name }],
    },
    twitter: { card: "summary_large_image", title: name, description },
    robots: { index: true, follow: true },
  };
}

export default async function ClubRoute({
  params,
}: {
  readonly params: Params;
}) {
  const { slug } = await params;
  const [{ storefront, organization }, caller, context, viewer] =
    await Promise.all([
      loadClub(slug),
      getServerCaller(),
      getServerContext(),
      pageViewer(),
    ]);
  const organizationValue = value(organization);
  if (storefront.status === "missing" && !organizationValue) notFound();
  if (storefront.status !== "ok" && !organizationValue) {
    // Neither read worked: the site's error page, with the reference.
    throw new Error(`Club ${slug} did not load`);
  }
  const [events, coaches] = await Promise.all([
    caller.public.events().catch(() => []),
    caller.public.coaches({ organizationSlug: slug }).catch(() => []),
  ]);
  const now = context.now;
  // Without a storefront (not set up, or it failed) the page still shows the
  // club's name, its events and coaches, and says what it can.
  const shop =
    storefront.status === "ok"
      ? storefront.value
      : {
          organizationId: organizationValue!.id,
          slug,
          name: organizationValue!.name,
          currency: "USD" as const,
          timezone: organizationValue!.timezone,
          paymentsReady: false,
          theme: UNPUBLISHED_THEME,
          catalog: [],
          contact: { countryCode: "US" },
          venues: [],
        };
  const theme = clubThemeView(shop.theme);
  const structured = clubJsonLd({
    storefront: shop,
    coaches,
    description: theme.tagline ?? theme.summary,
    image: theme.hero?.kind === "image" ? theme.hero.url : undefined,
    now,
  });
  return (
    <>
      <script
        dangerouslySetInnerHTML={{ __html: serializeGraph(structured) }}
        type="application/ld+json"
      />
      <ClubPage
        catalogError={
          storefront.status === "error" ? storefront.reference : undefined
        }
        coaches={coaches}
        events={events}
        now={now}
        storefront={shop}
        theme={theme}
        viewer={viewer}
      />
    </>
  );
}
