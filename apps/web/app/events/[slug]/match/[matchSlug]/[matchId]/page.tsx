import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ProMatchDetail } from "@/components/pro-match-detail";
import { getServerCaller } from "@/lib/api";
import { findProfessionalMatchReplacement } from "@/lib/pro-match-route";
import {
  professionalEventImages,
  professionalMatchDescription,
  professionalOgImageUrl,
} from "@/lib/pro-seo";

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{
    slug: string;
    matchSlug: string;
    matchId: string;
  }>;
}): Promise<Metadata> {
  const { slug, matchId } = await params;
  const caller = await getServerCaller();
  const detail = await caller.public
    .proMatch({ eventSlug: slug, matchId })
    .catch(() => undefined);
  const title = detail
    ? `${detail.match.teamA.label} vs ${detail.match.teamB.label} | ${detail.event.name}`
    : "Match";
  const description = detail ? professionalMatchDescription(detail) : undefined;
  const eventImage = detail
    ? professionalEventImages(detail.event)[0]
    : undefined;
  const image = detail
    ? (eventImage ?? {
        url: professionalOgImageUrl({
          title: `${detail.match.teamA.label} vs ${detail.match.teamB.label}`,
          eyebrow:
            detail.match.status === "live"
              ? "Live match"
              : detail.match.roundLabel,
          detail: detail.event.name,
        }),
        alt: `${detail.match.teamA.label} vs ${detail.match.teamB.label} at ${detail.event.name}`,
      })
    : undefined;
  return {
    title,
    description,
    alternates: {
      canonical: detail?.match.canonicalPath,
    },
    openGraph: detail
      ? {
          title,
          description,
          type: "website",
          url: detail.match.canonicalPath,
          siteName: "Duna",
          images: image ? [{ url: image.url, alt: image.alt }] : undefined,
        }
      : undefined,
    twitter: detail
      ? {
          card: image ? "summary_large_image" : "summary",
          title,
          description,
          images: image ? [image.url] : undefined,
        }
      : undefined,
    robots: { index: Boolean(detail), follow: true },
  };
}

export default async function ProfessionalMatchPage({
  params,
}: {
  readonly params: Promise<{
    slug: string;
    matchSlug: string;
    matchId: string;
  }>;
}) {
  const { slug, matchId, matchSlug } = await params;
  const caller = await getServerCaller();
  const [detail, videos, predictionMarket, predictionWallet] =
    await Promise.all([
      caller.public
        .proMatch({ eventSlug: slug, matchId })
        .catch(() => undefined),
      caller.public.videos({ matchId }).catch(() => []),
      caller.public
        .proMatchPredictionMarket({ eventSlug: slug, matchId })
        .catch(() => undefined),
      caller.player.predictionWallet().catch(() => undefined),
    ]);
  if (!detail) {
    const event = await caller.public.proEvent({ slug }).catch(() => undefined);
    const replacement = event
      ? findProfessionalMatchReplacement(event.matches, { matchId, matchSlug })
      : undefined;
    if (replacement) redirect(replacement.canonicalPath);
    notFound();
  }
  return (
    <ProMatchDetail
      detail={detail}
      predictionMarket={predictionMarket}
      predictionWallet={predictionWallet}
      videos={videos}
    />
  );
}
