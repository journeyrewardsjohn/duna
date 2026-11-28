import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProEventDetail } from "@/components/pro-event-detail";
import { getServerCaller } from "@/lib/api";

/**
 * The full Pro Tour desk for a professional event (draws, predictions,
 * discussion), kept as it was while the Pro Tour pages are rebuilt. The
 * event's public face is `/events/[slug]` (SITE-5), which links here; this
 * address is not indexed and points search engines at that page.
 */
export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const caller = await getServerCaller();
  const proEvent = await caller.public
    .proEvent({ slug })
    .catch(() => undefined);
  return {
    title: proEvent ? `${proEvent.name}: tour coverage` : "Tour coverage",
    alternates: { canonical: `/events/${slug}` },
    robots: { index: false, follow: true },
  };
}

export default async function ProEventTourPage({
  params,
}: {
  readonly params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const caller = await getServerCaller();
  const proEvent = await caller.public
    .proEvent({ slug })
    .catch(() => undefined);
  if (!proEvent) notFound();
  const marketMatches = proEvent.matches.slice(0, 40);
  const [
    eventMarkets,
    predictionWallet,
    matchMarkets,
    comments,
    communityAccess,
  ] = await Promise.all([
    caller.public
      .proEventPredictionMarkets({ eventSlug: slug })
      .catch(() => []),
    caller.player.predictionWallet().catch(() => undefined),
    caller.public
      .proMatchPredictionMarkets({
        matches: marketMatches.map((match) => ({
          eventSlug: slug,
          matchId: match.id,
        })),
      })
      .catch(() => ({})),
    caller.public
      .communityComments({
        subject: { type: "pro-event", id: proEvent.id },
      })
      .catch(() => []),
    caller.player.communityAccess().catch(() => undefined),
  ]);
  return (
    <ProEventDetail
      comments={comments}
      communityAccess={communityAccess}
      event={proEvent}
      eventMarkets={eventMarkets}
      matchMarkets={matchMarkets}
      predictionWallet={predictionWallet}
    />
  );
}
