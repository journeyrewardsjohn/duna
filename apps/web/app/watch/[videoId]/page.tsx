import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DunaVideoGallery } from "@/components/duna-video-gallery";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getServerCaller } from "@/lib/api";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Watch on Duna",
  description: "Watch a live beach volleyball stream or replay on Duna.",
  robots: { index: false, follow: false },
};

export default async function WatchVideoPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ videoId: string }>;
  readonly searchParams: Promise<{ token?: string }>;
}) {
  const [{ videoId }, { token }] = await Promise.all([params, searchParams]);
  const caller = await getServerCaller();
  const playback = await caller.public
    .videoPlayback({
      videoId,
      accessToken: token,
      platform: "web",
    })
    .catch(() => undefined);
  if (!playback) notFound();

  const related = await caller.public
    .videos({
      eventId: playback.video.event?.id,
      matchId: playback.video.match?.id,
    })
    .catch(() => []);
  const videos = [
    playback.video,
    ...related.filter((video) => video.id !== playback.video.id),
  ];

  return (
    <main className="video-watch-page" data-zone="athletic">
      <SiteHeader />
      <div className="video-watch-page__shell">
        <DunaVideoGallery
          accessToken={token}
          description={
            playback.video.match?.label ??
            playback.video.event?.title ??
            "Live and recorded beach volleyball on Duna."
          }
          eyebrow={
            playback.video.status === "live" ? "Live on Duna" : "Duna replay"
          }
          initialPlayback={playback}
          title={playback.video.title}
          videos={videos}
        />
      </div>
      <SiteFooter />
    </main>
  );
}
