import type { VideoSummary } from "@duna/api";
import { log, report } from "@duna/observability";
import { ErrorState, buttonClassName } from "@duna/ui/tideline";
import {
  ArrowUpRight,
  Clapperboard,
  Clock3,
  LockKeyhole,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { ThemedTideline } from "@/components/themed-tideline";
import { PaneErrorBoundary } from "@/components/observability/pane-error-boundary";
import { ProfileAvatar } from "@/components/profile-avatar-stack";
import { getServerCaller } from "@/lib/api";
import styles from "./video-studio.module.css";
import { VideoPosterImage } from "./video-poster-image";

function durationLabel(seconds: number | undefined): string {
  if (!seconds) return "Recording";
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${Math.max(1, minutes)}m`;
}

function createdLabel(createdAt: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(createdAt));
}

function statusLabel(status: VideoSummary["status"]): string {
  if (status === "ready") return "Ready to review";
  if (status === "processing") return "Building report";
  if (status === "uploading") return "Uploading";
  if (status === "live") return "Live now";
  if (status === "ended") return "Finalizing";
  if (status === "failed") return "Needs attention";
  if (status === "draft") return "Draft";
  return "Unavailable";
}

function categoryLabel(category: VideoSummary["category"]): string {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

function VideoCardContent({ video }: { readonly video: VideoSummary }) {
  const context =
    video.match?.label ??
    video.event?.title ??
    video.venue?.name ??
    "Duna recording";
  const ready = video.status === "ready";

  return (
    <>
      <div className={styles.videoPoster}>
        <div className={styles.videoPosterFallback}>
          <Clapperboard aria-hidden size={30} />
          <span>
            {video.status === "processing"
              ? "Preparing preview"
              : "Duna Vision"}
          </span>
        </div>
        {video.posterUrl ? <VideoPosterImage src={video.posterUrl} /> : null}
        <span className={styles.videoStatus} data-status={video.status}>
          {statusLabel(video.status)}
        </span>
        <span className={styles.videoDuration}>
          <Clock3 aria-hidden size={13} />{" "}
          {durationLabel(video.durationSeconds)}
        </span>
      </div>
      <div className={styles.videoCardBody}>
        <div className={styles.videoOwner}>
          <ProfileAvatar person={video.owner} size="sm" />
          <span>
            <strong>{video.owner.displayName}</strong>
            <small>{createdLabel(video.createdAt)}</small>
          </span>
        </div>
        <div className={styles.videoCopy}>
          <h3>{video.title}</h3>
          <p>{context}</p>
        </div>
        <footer>
          <span>
            <LockKeyhole aria-hidden size={14} />
            {video.recordingVisibility === "private" ? "Private" : "Public"}
          </span>
          <span>{categoryLabel(video.category)}</span>
          {ready ? <ArrowUpRight aria-hidden size={18} /> : null}
        </footer>
      </div>
    </>
  );
}

/**
 * The library could not load. Without a connected Duna database (demo mode)
 * this is expected and logged; anything else is reported with a reference.
 * The cause lives in the video service, which another work stream owns: this
 * page only fails soft.
 */
function VideoUnavailable({ error }: { readonly error: unknown }) {
  const cause = (error as { cause?: { code?: unknown } } | null)?.cause;
  const needsDatabase = cause?.code === "DATABASE_REQUIRED";
  let reference: string | undefined;
  if (needsDatabase) {
    log.warn("web.video.library.unavailable", {
      reason: "database-not-connected",
    });
  } else {
    reference = report(error, { event: "web.video.library.failed" });
  }
  return (
    <main className={styles.page} data-player-page="video" data-zone="athletic">
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <span>Duna Vision</span>
          <h1>Review your game.</h1>
        </div>
      </header>
      <ThemedTideline>
        <ErrorState
          action={
            <Link
              className={buttonClassName({ variant: "secondary" })}
              href="/app"
            >
              Back to home
            </Link>
          }
          message={
            needsDatabase
              ? "Your video library needs a connected Duna database, which this preview doesn't have."
              : "We couldn't load your recordings. Try again in a moment."
          }
          reference={reference}
          title="Your video library isn't available"
        />
      </ThemedTideline>
    </main>
  );
}

export default async function VideoStudioIndexPage() {
  const caller = await getServerCaller();
  let studio: Awaited<ReturnType<typeof caller.player.videoStudio>>;
  try {
    studio = await caller.player.videoStudio();
  } catch (error) {
    return <VideoUnavailable error={error} />;
  }
  const readyCount = studio.videos.filter(
    (video) => video.status === "ready",
  ).length;
  const activeCount = studio.videos.filter((video) =>
    ["draft", "uploading", "processing", "ended"].includes(video.status),
  ).length;

  return (
    <main className={styles.page} data-player-page="video" data-zone="athletic">
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <span>Duna Vision</span>
          <h1>Review your game.</h1>
          <p>
            Recordings, private replays, and source-linked Vision reports in one
            focused library.
          </p>
        </div>
        <Link className={styles.captureLink} href="/app/score">
          <Clapperboard aria-hidden size={18} /> Record a match
        </Link>
        <div aria-label="Video library summary" className={styles.heroStats}>
          <span>
            <strong>{studio.videos.length}</strong> recordings
          </span>
          <span>
            <strong>{readyCount}</strong> ready
          </span>
          {activeCount > 0 ? (
            <span>
              <strong>{activeCount}</strong> in progress
            </span>
          ) : null}
        </div>
      </header>

      <PaneErrorBoundary label="Your recordings" name="web.video.archive">
        <section className={styles.archive}>
          <header>
            <div>
              <span>Private archive</span>
              <h2>Recent recordings</h2>
              <p>Ready videos open their full Duna Vision report.</p>
            </div>
            <Sparkles aria-hidden size={22} />
          </header>
          {studio.videos.length > 0 ? (
            <div className={styles.videoGrid}>
              {studio.videos.map((video) =>
                video.status === "ready" ? (
                  <Link
                    className={styles.videoCard}
                    href={`/app/video/${video.id}`}
                    key={video.id}
                  >
                    <VideoCardContent video={video} />
                  </Link>
                ) : (
                  <article
                    aria-label={`${video.title}: ${statusLabel(video.status)}`}
                    className={styles.videoCard}
                    data-disabled="true"
                    key={video.id}
                  >
                    <VideoCardContent video={video} />
                  </article>
                ),
              )}
            </div>
          ) : (
            <p className={styles.empty}>
              Record a match in Duna Player to start your private video library.
            </p>
          )}
        </section>
      </PaneErrorBoundary>
    </main>
  );
}
