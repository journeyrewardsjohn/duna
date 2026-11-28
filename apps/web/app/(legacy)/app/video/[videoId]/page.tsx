import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { VideoAnalysisStudioReport } from "@/components/video-analysis-studio-report";
import { DunaVideoGallery } from "@/components/duna-video-gallery";
import { getServerCaller } from "@/lib/api";
import styles from "../video-studio.module.css";

export const dynamic = "force-dynamic";

export default async function VideoAnalysisStudioPage({
  params,
}: {
  readonly params: Promise<{ videoId: string }>;
}) {
  const { videoId } = await params;
  const caller = await getServerCaller();
  const [report, playback] = await Promise.all([
    caller.player.videoAnalysisReport({ videoId }).catch(() => undefined),
    caller.public
      .videoPlayback({ videoId, platform: "web" })
      .catch(() => undefined),
  ]);
  if (!report) notFound();

  return (
    <main className={styles.detail} data-zone="athletic">
      <Link className={styles.back} href="/app/video">
        <ArrowLeft aria-hidden size={17} /> Video studio
      </Link>
      {playback ? (
        <DunaVideoGallery
          description="Source-linked playback for this private Duna Vision report."
          eyebrow="Duna Vision playback"
          initialPlayback={playback}
          title={playback.video.title}
          videos={[playback.video]}
        />
      ) : (
        <section className={styles.processing}>
          <strong>Playback is still preparing.</strong>
          <p>
            Your timed Watch moments and Vision report remain available while
            Duna prepares the private replay.
          </p>
        </section>
      )}
      <VideoAnalysisStudioReport report={report} />
    </main>
  );
}
