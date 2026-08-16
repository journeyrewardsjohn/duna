import { Clapperboard, Sparkles } from "lucide-react";
import Link from "next/link";
import { getServerCaller } from "@/lib/api";
import styles from "./video-studio.module.css";

function durationLabel(seconds: number | undefined): string {
  if (!seconds) return "Recording";
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${Math.max(1, minutes)}m`;
}

export default async function VideoStudioIndexPage() {
  const caller = await getServerCaller();
  const studio = await caller.player.videoStudio();

  return (
    <main className={styles.page} data-zone="athletic">
      <header className={styles.hero}>
        <span>Duna Vision Studio</span>
        <h1>Your match, explained.</h1>
        <p>
          Capture with Duna Player and Apple Watch, then review source-linked
          rallies, placement, highlights, and coach cues in one calm workspace.
        </p>
        <Link className={styles.captureLink} href="/app/score">
          <Clapperboard aria-hidden size={18} /> Record a match
        </Link>
      </header>

      <section className={styles.archive}>
        <header>
          <div>
            <span>Private archive</span>
            <h2>Choose a video to open its Vision report.</h2>
          </div>
          <Sparkles aria-hidden size={22} />
        </header>
        {studio.videos.length > 0 ? (
          <div className={styles.videoGrid}>
            {studio.videos.map((video) => (
              <Link href={`/app/video/${video.id}`} key={video.id}>
                <span className={styles.videoStatus}>{video.status}</span>
                <strong>{video.title}</strong>
                <small>
                  {video.match?.label ?? video.event?.title ?? "Duna recording"}
                </small>
                <em>
                  {durationLabel(video.durationSeconds)} · {video.category}
                </em>
              </Link>
            ))}
          </div>
        ) : (
          <p className={styles.empty}>
            Your studio will fill with private Duna recordings, uploads, and
            source-linked Apple Watch moments.
          </p>
        )}
      </section>
    </main>
  );
}
