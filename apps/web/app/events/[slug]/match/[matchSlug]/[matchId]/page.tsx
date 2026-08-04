import { notFound } from "next/navigation";
import { ProMatchDetail } from "@/components/pro-match-detail";
import { getServerCaller } from "@/lib/api";

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{
    slug: string;
    matchSlug: string;
    matchId: string;
  }>;
}) {
  const { slug, matchId } = await params;
  const caller = await getServerCaller();
  const detail = await caller.public
    .proMatch({ eventSlug: slug, matchId })
    .catch(() => undefined);
  return {
    title: detail
      ? `${detail.match.teamA.label} vs ${detail.match.teamB.label} | ${detail.event.name}`
      : "Match",
    description: detail
      ? `Score, players, SandRating prediction, and event context for ${detail.match.teamA.label} vs ${detail.match.teamB.label}.`
      : undefined,
    alternates: {
      canonical: detail?.match.canonicalPath,
    },
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
  const { slug, matchId } = await params;
  const caller = await getServerCaller();
  const [detail, videos] = await Promise.all([
    caller.public.proMatch({ eventSlug: slug, matchId }).catch(() => undefined),
    caller.public.videos({ matchId }).catch(() => []),
  ]);
  if (!detail) notFound();
  return <ProMatchDetail detail={detail} videos={videos} />;
}
