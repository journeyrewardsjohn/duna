import "../../detail.css";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import {
  coachClubs,
  coachJsonLd,
  coachOfferings,
} from "@/components/coach/coach-model";
import { CoachPage } from "@/components/coach/coach-page";
import { load } from "@/components/club/load";
import { serializeGraph } from "@/components/club/structured-data";
import { clubThemeView } from "@/components/club/theme";
import { siteOgImage } from "@/components/site/og";
import { getServerCaller, getServerContext } from "@/lib/api";
import { absolutePublicUrl } from "@/lib/pro-seo";

type Params = Promise<{ handle: string }>;
type Query = Promise<{ organization?: string }>;

const loadCoach = cache(async (handle: string, organization?: string) => {
  const caller = await getServerCaller();
  return load(
    () =>
      caller.public.coach({
        handle,
        ...(organization ? { organizationSlug: organization } : {}),
      }),
    "web.coach.load",
    { handle },
  );
});

export async function generateMetadata({
  params,
  searchParams,
}: {
  readonly params: Params;
  readonly searchParams: Query;
}): Promise<Metadata> {
  const [{ handle }, query] = await Promise.all([params, searchParams]);
  const loaded = await loadCoach(handle, query.organization);
  if (loaded.status !== "ok") {
    return { title: "Coach not found", robots: { index: false } };
  }
  const coach = loaded.value;
  const canonical = `/coaches/${coach.handle}`;
  const description = (
    coach.bio ??
    `Book volleyball coaching with ${coach.displayName} at ${coach.organizationName} on Duna.`
  ).slice(0, 155);
  const image = coach.avatarUrl
    ? absolutePublicUrl(coach.avatarUrl)
    : siteOgImage({
        title: coach.displayName,
        eyebrow: "Coach",
        concept: "coach",
      });
  return {
    title: `${coach.displayName}, volleyball coach`,
    description,
    alternates: {
      canonical,
      types: { "text/markdown": `${canonical}.md` },
    },
    openGraph: {
      title: `${coach.displayName} · Duna coach`,
      description,
      type: "profile",
      url: canonical,
      images: [{ url: image, alt: coach.displayName }],
    },
    robots: { index: true, follow: true },
  };
}

export default async function CoachRoute({
  params,
  searchParams,
}: {
  readonly params: Params;
  readonly searchParams: Query;
}) {
  const [{ handle }, query] = await Promise.all([params, searchParams]);
  const loaded = await loadCoach(handle, query.organization);
  if (loaded.status === "missing") notFound();
  if (loaded.status === "error") {
    throw new Error(`Coach ${handle} did not load`);
  }
  const coach = loaded.value;
  const [caller, context] = await Promise.all([
    getServerCaller(),
    getServerContext(),
  ]);
  const [profiles, storefront] = await Promise.all([
    caller.public.coaches().catch(() => [coach]),
    caller.public
      .organizationStorefront({ slug: coach.organizationSlug })
      .catch(() => undefined),
  ]);
  const clubs = coachClubs([
    coach,
    ...profiles.filter((profile) => profile.personId === coach.personId),
  ]);
  const offerings = coachOfferings({
    coach,
    clubSlug: coach.organizationSlug,
    clubName: storefront?.name ?? coach.organizationName,
    catalog: storefront?.catalog ?? [],
  });
  const clubColors = storefront
    ? { [storefront.slug]: clubThemeView(storefront.theme).color }
    : {};
  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: serializeGraph(coachJsonLd({ coach, clubs, offerings })),
        }}
        type="application/ld+json"
      />
      <CoachPage
        clubColors={clubColors}
        clubs={clubs}
        coach={coach}
        now={context.now}
        offerings={offerings}
      />
    </>
  );
}
