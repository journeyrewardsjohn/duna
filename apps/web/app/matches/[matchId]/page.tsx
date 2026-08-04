import { Badge } from "@duna/ui";
import { Radio } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DunaVideoGallery } from "@/components/duna-video-gallery";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getServerCaller } from "@/lib/api";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Match video · Duna",
  description: "Live streams and player-published replays for a Duna match.",
};

export default async function PublicMatchVideoPage({
  params,
}: {
  readonly params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;
  const caller = await getServerCaller();
  const videos = await caller.public.videos({ matchId }).catch(() => []);
  if (videos.length === 0) notFound();
  const match = videos[0]?.match;
  const event = videos[0]?.event;

  return (
    <main className="video-match-page">
      <SiteHeader />
      <section className="video-match-page__hero">
        <Badge
          tone={
            videos.some((video) => video.status === "live") ? "live" : "neutral"
          }
        >
          <Radio aria-hidden size={12} />
          {videos.some((video) => video.status === "live")
            ? "Live coverage"
            : "Match video"}
        </Badge>
        <h1>{match?.label ?? "Duna match"}</h1>
        <p>{event?.title ?? "Player-published beach volleyball coverage."}</p>
      </section>
      <div className="video-match-page__gallery">
        <DunaVideoGallery videos={videos} />
      </div>
      <SiteFooter />
    </main>
  );
}
