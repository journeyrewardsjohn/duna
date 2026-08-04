"use client";

import type { VideoPlayback, VideoSummary } from "@duna/api";
import MuxPlayer from "@mux/mux-player-react";
import { Badge } from "@duna/ui";
import { Clock3, Eye, LockKeyhole, Play, Radio, UserRound } from "lucide-react";
import { useCallback, useRef, useState } from "react";

function durationLabel(seconds: number | undefined) {
  if (!seconds) return "Recording";
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(1, minutes)}m`;
}

function statusLabel(video: VideoSummary) {
  if (video.status === "live") return "Live now";
  if (video.status === "processing") return "Replay processing";
  return durationLabel(video.durationSeconds);
}

function muxCurrentTime(event: Event) {
  const target = event.target as { readonly currentTime?: number } | null;
  return typeof target?.currentTime === "number" ? target.currentTime : 0;
}

export function DunaVideoGallery({
  videos,
  eyebrow = "Duna Video",
  title = "Watch the action.",
  description = "Choose a stream or replay from this match.",
  initialPlayback,
  accessToken,
}: {
  readonly videos: readonly VideoSummary[];
  readonly eyebrow?: string;
  readonly title?: string;
  readonly description?: string;
  readonly initialPlayback?: VideoPlayback;
  readonly accessToken?: string;
}) {
  const [playback, setPlayback] = useState<VideoPlayback | undefined>(
    initialPlayback,
  );
  const [loadingId, setLoadingId] = useState<string>();
  const [message, setMessage] = useState<string>();
  const lastHeartbeat = useRef(0);

  const reportView = useCallback(
    (watchedSeconds: number, completed: boolean) => {
      if (!playback) return;
      const rounded = Math.max(0, Math.floor(watchedSeconds));
      if (!completed && rounded < lastHeartbeat.current + 15) return;
      lastHeartbeat.current = rounded;
      void fetch("/api/video/view", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          videoId: playback.video.id,
          viewSessionId: playback.viewSessionId,
          watchedSeconds: rounded,
          completed,
        }),
        keepalive: true,
      });
    },
    [playback],
  );

  const chooseVideo = useCallback(
    async (video: VideoSummary) => {
      if (playback?.video.id === video.id) return;
      setLoadingId(video.id);
      setMessage(undefined);
      try {
        const query = new URLSearchParams({ videoId: video.id });
        if (accessToken) query.set("token", accessToken);
        const response = await fetch(`/api/video/playback?${query}`, {
          cache: "no-store",
        });
        const payload = (await response.json()) as
          { playback: VideoPlayback } | { error: string };
        if (!response.ok || !("playback" in payload)) {
          throw new Error(
            "error" in payload ? payload.error : "Video is not ready.",
          );
        }
        lastHeartbeat.current = 0;
        setPlayback(payload.playback);
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "This video could not be opened.",
        );
      } finally {
        setLoadingId(undefined);
      }
    },
    [accessToken, playback?.video.id],
  );

  if (videos.length === 0) return null;

  return (
    <section className="duna-video-gallery">
      <header className="duna-video-gallery__header">
        <div>
          <span className="page-eyebrow">
            <Radio aria-hidden size={15} /> {eyebrow}
          </span>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <Badge
          tone={
            videos.some((video) => video.status === "live") ? "live" : "neutral"
          }
        >
          {videos.length} {videos.length === 1 ? "video" : "angles"}
        </Badge>
      </header>

      {playback && (
        <div className="duna-video-gallery__stage">
          {playback.provider === "mux" && playback.playbackId ? (
            <MuxPlayer
              accentColor="#d5ff4f"
              envKey={playback.dataEnvironmentKey}
              metadataVideoId={playback.video.id}
              metadataVideoTitle={playback.video.title}
              playbackId={playback.playbackId}
              primaryColor="#f8fafc"
              secondaryColor="#081522"
              streamType={
                playback.video.status === "live" ? "ll-live" : "on-demand"
              }
              title={playback.video.title}
              tokens={
                playback.playbackToken
                  ? { playback: playback.playbackToken }
                  : undefined
              }
              onEnded={(event) => reportView(muxCurrentTime(event), true)}
              onPause={(event) => reportView(muxCurrentTime(event), false)}
              onTimeUpdate={(event) => reportView(muxCurrentTime(event), false)}
            />
          ) : playback.sourceUrl ? (
            <video
              controls
              playsInline
              poster={playback.posterUrl}
              src={playback.sourceUrl}
              title={playback.video.title}
              onEnded={(event) =>
                reportView(event.currentTarget.currentTime, true)
              }
              onPause={(event) =>
                reportView(event.currentTarget.currentTime, false)
              }
              onTimeUpdate={(event) =>
                reportView(event.currentTarget.currentTime, false)
              }
            />
          ) : null}
          <div className="duna-video-gallery__now-playing">
            <span>
              {playback.video.status === "live" ? (
                <Radio aria-hidden size={14} />
              ) : (
                <Play aria-hidden size={14} />
              )}
              {playback.video.status === "live" ? "Live" : "Now playing"}
            </span>
            <strong>{playback.video.title}</strong>
            <small>
              by {playback.video.owner.displayName}
              {playback.video.hasAudio ? " · Audio on" : " · No audio"}
            </small>
          </div>
        </div>
      )}

      {message && <p className="duna-video-gallery__message">{message}</p>}

      <div className="duna-video-gallery__options">
        {videos.map((video) => {
          const selected = playback?.video.id === video.id;
          const requiresShareLink =
            video.status === "live"
              ? video.liveVisibility === "link-only"
              : video.recordingVisibility === "private";
          return (
            <button
              aria-pressed={selected}
              className={selected ? "is-selected" : undefined}
              disabled={loadingId === video.id || video.status === "processing"}
              key={video.id}
              type="button"
              onClick={() => void chooseVideo(video)}
            >
              <span className="duna-video-gallery__option-icon">
                {video.status === "live" ? (
                  <Radio aria-hidden size={20} />
                ) : (
                  <Play aria-hidden size={20} />
                )}
              </span>
              <span>
                <small>{statusLabel(video)}</small>
                <strong>{video.title}</strong>
                <em>
                  <UserRound aria-hidden size={13} />
                  {video.owner.displayName}
                </em>
              </span>
              <span className="duna-video-gallery__option-meta">
                {requiresShareLink ? (
                  <LockKeyhole aria-label="Private link" size={15} />
                ) : (
                  <Eye aria-label="Public video" size={15} />
                )}
                {video.durationSeconds ? (
                  <Clock3 aria-hidden size={15} />
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
      <small className="duna-video-gallery__privacy">
        Players control whether each live stream and replay remains public.
      </small>
    </section>
  );
}
