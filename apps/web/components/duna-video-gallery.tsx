"use client";

import type {
  VideoPlayback,
  VideoSummary,
  VisionScoreSnapshot,
} from "@duna/api";
import MuxPlayer from "@mux/mux-player-react";
import { Badge } from "@duna/ui";
import { SandLoader } from "@duna/ui/sand-loader";
import Image from "next/image";
import { Clock3, Eye, LockKeyhole, Play, Radio, UserRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

interface CloudflarePlayerController {
  readonly currentTime: number;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

type CloudflareStreamWindow = Window & {
  readonly Stream?: (iframe: HTMLIFrameElement) => CloudflarePlayerController;
};

function CloudflareStreamPlayer({
  onEnded,
  onPause,
  onTimeUpdate,
  onReady,
  onError,
  src,
  title,
}: {
  readonly onEnded: (seconds: number) => void;
  readonly onPause: (seconds: number) => void;
  readonly onTimeUpdate: (seconds: number) => void;
  readonly onReady: () => void;
  readonly onError: () => void;
  readonly src: string;
  readonly title: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const callbacks = useRef({
    onEnded,
    onPause,
    onTimeUpdate,
    onReady,
    onError,
  });
  callbacks.current = { onEnded, onPause, onTimeUpdate, onReady, onError };

  useEffect(() => {
    let active = true;
    let controller: CloudflarePlayerController | undefined;
    let script = document.querySelector<HTMLScriptElement>(
      "script[data-duna-cloudflare-stream-sdk]",
    );
    const timeUpdate = () =>
      callbacks.current.onTimeUpdate(controller?.currentTime ?? 0);
    const pause = () => callbacks.current.onPause(controller?.currentTime ?? 0);
    const ended = () => callbacks.current.onEnded(controller?.currentTime ?? 0);
    const ready = () => callbacks.current.onReady();
    const error = () => callbacks.current.onError();
    const attach = () => {
      const iframe = iframeRef.current;
      const factory = (window as CloudflareStreamWindow).Stream;
      if (!active || !iframe || !factory) return;
      controller = factory(iframe);
      controller.addEventListener("timeupdate", timeUpdate);
      controller.addEventListener("pause", pause);
      controller.addEventListener("ended", ended);
      controller.addEventListener("canplay", ready);
      controller.addEventListener("playing", ready);
      controller.addEventListener("error", error);
    };

    if ((window as CloudflareStreamWindow).Stream) {
      attach();
    } else {
      if (!script) {
        script = document.createElement("script");
        script.async = true;
        script.dataset.dunaCloudflareStreamSdk = "true";
        script.src = "https://embed.cloudflarestream.com/embed/sdk.latest.js";
        document.head.append(script);
      }
      script.addEventListener("load", attach, { once: true });
    }

    return () => {
      active = false;
      script?.removeEventListener("load", attach);
      controller?.removeEventListener("timeupdate", timeUpdate);
      controller?.removeEventListener("pause", pause);
      controller?.removeEventListener("ended", ended);
      controller?.removeEventListener("canplay", ready);
      controller?.removeEventListener("playing", ready);
      controller?.removeEventListener("error", error);
    };
  }, [src]);

  return (
    <iframe
      ref={iframeRef}
      onLoad={onReady}
      onError={onError}
      allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
      src={src}
      title={title}
    />
  );
}

function matchLabelTeams(label: string | undefined) {
  if (!label) return { teamA: "Side A", teamB: "Side B" };
  const [left, right] = label.split(/\s+(?:vs\.?|v\.?|—|–|-)\s+/i);
  return {
    teamA: left?.trim() || "Side A",
    teamB: right?.trim() || "Side B",
  };
}

function scoreAtTime(
  playback: VideoPlayback,
  seconds: number,
): VisionScoreSnapshot | undefined {
  if (playback.video.status === "live" && playback.liveScore) {
    return playback.liveScore;
  }

  let score: VisionScoreSnapshot | undefined;
  for (const event of playback.vision?.events ?? []) {
    if (event.elapsedMs > seconds * 1_000) break;
    if (event.score) score = event.score;
  }
  return score;
}

function heartRateAtTime(
  playback: VideoPlayback,
  seconds: number,
): number | undefined {
  const points = playback.healthOverlay?.points;
  if (!points?.length) return undefined;
  const elapsedMs = Math.max(0, seconds * 1_000);
  let low = 0;
  let high = points.length - 1;
  let selected = points[0];
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const point = points[middle]!;
    if (point.elapsedMs <= elapsedMs) {
      selected = point;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return selected?.beatsPerMinute;
}

function ScoreOverlay({
  score,
  teamA,
  teamB,
}: {
  readonly score: VisionScoreSnapshot;
  readonly teamA: string;
  readonly teamB: string;
}) {
  const current = score.sets[
    Math.min(score.setIndex, score.sets.length - 1)
  ] ?? {
    a: 0,
    b: 0,
  };
  const setsWon = score.sets.reduce(
    (total, set, index) => {
      if (index >= score.setIndex && score.status !== "complete") return total;
      if (set.a > set.b) total.a += 1;
      if (set.b > set.a) total.b += 1;
      return total;
    },
    { a: 0, b: 0 },
  );
  return (
    <aside aria-label="Live match score" className="duna-video-score">
      <header>
        <strong>DUNA</strong>
        <span>SET {score.setIndex + 1}</span>
      </header>
      {[
        { key: "A", label: teamA, points: current.a, sets: setsWon.a },
        { key: "B", label: teamB, points: current.b, sets: setsWon.b },
      ].map((team) => (
        <div key={team.key}>
          <i
            className={score.serving === team.key ? "is-serving" : undefined}
          />
          <span>{team.label}</span>
          <small>{team.sets}</small>
          <strong>{team.points}</strong>
        </div>
      ))}
    </aside>
  );
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
  const [mediaState, setMediaState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const playbackRequest = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => playbackRequest.current?.abort(), []);
  const [message, setMessage] = useState<string>();
  const [currentTime, setCurrentTime] = useState(0);
  const [liveScore, setLiveScore] = useState<VisionScoreSnapshot>();
  const lastHeartbeat = useRef(0);

  useEffect(() => {
    const matchId = playback?.video.match?.id;
    if (!matchId || playback.video.status !== "live") {
      setLiveScore(undefined);
      return;
    }
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch(
          `/api/matches/live?matchId=${encodeURIComponent(matchId)}`,
          { cache: "no-store" },
        );
        const payload = (await response.json()) as {
          readonly score?: VisionScoreSnapshot;
        };
        if (active && response.ok && payload.score) setLiveScore(payload.score);
      } catch {
        // Playback remains available if scoring is temporarily offline.
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 3_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [playback?.video.match?.id, playback?.video.status]);

  const overlayScore = useMemo(() => {
    if (!playback) return undefined;
    const enabled =
      playback.vision?.settings.overlayScoreboard ??
      (playback.video.status === "live" && Boolean(playback.video.match));
    if (!enabled) return undefined;
    return liveScore ?? scoreAtTime(playback, currentTime);
  }, [currentTime, liveScore, playback]);
  const overlayTeams = useMemo(
    () => matchLabelTeams(playback?.video.match?.label),
    [playback?.video.match?.label],
  );
  const overlayHeartRate = useMemo(
    () => (playback ? heartRateAtTime(playback, currentTime) : undefined),
    [currentTime, playback],
  );

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
      }).catch(() => {
        // Playback does not depend on view telemetry reaching the server.
      });
    },
    [playback],
  );

  const chooseVideo = useCallback(
    async (video: VideoSummary, retry = false) => {
      playbackRequest.current?.abort();
      if (playback?.video.id === video.id && !retry) {
        setLoadingId(undefined);
        setMessage(undefined);
        return;
      }
      const request = new AbortController();
      playbackRequest.current = request;
      setLoadingId(video.id);
      setMessage(undefined);
      try {
        const query = new URLSearchParams({ videoId: video.id });
        if (accessToken) query.set("token", accessToken);
        const response = await fetch(`/api/video/playback?${query}`, {
          cache: "no-store",
          signal: request.signal,
        });
        const payload = (await response.json()) as
          { playback: VideoPlayback } | { error: string };
        if (!response.ok || !("playback" in payload)) {
          throw new Error(
            "error" in payload ? payload.error : "Video is not ready.",
          );
        }
        if (request.signal.aborted) return;
        lastHeartbeat.current = 0;
        setMediaState("loading");
        setCurrentTime(0);
        setLiveScore(undefined);
        setPlayback(payload.playback);
      } catch (error) {
        if (request.signal.aborted) return;
        setMessage(
          error instanceof Error
            ? error.message
            : "This video could not be opened.",
        );
      } finally {
        if (!request.signal.aborted) setLoadingId(undefined);
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
          <div
            className="duna-video-gallery__picture"
            key={playback.viewSessionId}
          >
            {playback.provider === "mux" && playback.playbackId ? (
              <MuxPlayer
                accentColor="#e8e3d9"
                envKey={playback.dataEnvironmentKey}
                metadataVideoId={playback.video.id}
                metadataVideoTitle={playback.video.title}
                playbackId={playback.playbackId}
                primaryColor="#faf8f4"
                secondaryColor="#242521"
                streamType={
                  playback.video.status === "live" ? "ll-live" : "on-demand"
                }
                title={playback.video.title}
                poster={playback.posterUrl}
                onLoadedData={() => setMediaState("ready")}
                onPlaying={() => setMediaState("ready")}
                onWaiting={() => setMediaState("loading")}
                onError={() => setMediaState("error")}
                tokens={
                  playback.playbackToken
                    ? { playback: playback.playbackToken }
                    : undefined
                }
                onEnded={(event) => reportView(muxCurrentTime(event), true)}
                onPause={(event) => reportView(muxCurrentTime(event), false)}
                onTimeUpdate={(event) => {
                  const seconds = muxCurrentTime(event);
                  setCurrentTime(seconds);
                  reportView(seconds, false);
                }}
              />
            ) : playback.provider === "cloudflare" && playback.embedUrl ? (
              <CloudflareStreamPlayer
                onReady={() => setMediaState("ready")}
                onError={() => setMediaState("error")}
                onEnded={(seconds) => reportView(seconds, true)}
                onPause={(seconds) => reportView(seconds, false)}
                onTimeUpdate={(seconds) => {
                  setCurrentTime(seconds);
                  reportView(seconds, false);
                }}
                src={playback.embedUrl}
                title={playback.video.title}
              />
            ) : playback.sourceUrl ? (
              <video
                controls
                playsInline
                preload="metadata"
                onLoadedData={() => setMediaState("ready")}
                onPlaying={() => setMediaState("ready")}
                onWaiting={() => setMediaState("loading")}
                onCanPlay={() => setMediaState("ready")}
                onError={() => setMediaState("error")}
                poster={playback.posterUrl}
                src={playback.sourceUrl}
                title={playback.video.title}
                onEnded={(event) =>
                  reportView(event.currentTarget.currentTime, true)
                }
                onPause={(event) =>
                  reportView(event.currentTarget.currentTime, false)
                }
                onTimeUpdate={(event) => {
                  setCurrentTime(event.currentTarget.currentTime);
                  reportView(event.currentTarget.currentTime, false);
                }}
              />
            ) : null}
            {mediaState === "loading" && (
              <div className="duna-video-gallery__loading">
                <SandLoader label="Loading video" size={80} />
              </div>
            )}
            {(mediaState === "error" ||
              (!playback.playbackId &&
                !playback.embedUrl &&
                !playback.sourceUrl)) && (
              <div className="duna-video-gallery__failure" role="alert">
                <strong>Unable to play this video</strong>
                <p>Check your connection and try again.</p>
                <button
                  type="button"
                  disabled={Boolean(loadingId)}
                  onClick={() => void chooseVideo(playback.video, true)}
                >
                  {loadingId ? "Opening video…" : "Try again"}
                </button>
              </div>
            )}
            {overlayScore && (
              <ScoreOverlay
                score={overlayScore}
                teamA={playback.vision?.settings.teamA ?? overlayTeams.teamA}
                teamB={playback.vision?.settings.teamB ?? overlayTeams.teamB}
              />
            )}
            {overlayHeartRate !== undefined && (
              <aside
                aria-label="Private heart rate overlay"
                className="duna-video-health"
              >
                <b aria-hidden>♥</b>
                <span>
                  <strong>{Math.round(overlayHeartRate)} BPM</strong>
                  <small>PRIVATE DUNA HEALTH</small>
                </span>
              </aside>
            )}
          </div>
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

      {message && (
        <p role="alert" className="duna-video-gallery__message">
          {message}
        </p>
      )}

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
              aria-busy={loadingId === video.id}
              className={selected ? "is-selected" : undefined}
              disabled={loadingId === video.id || video.status === "processing"}
              key={video.id}
              type="button"
              onClick={() => void chooseVideo(video)}
            >
              <span className="duna-video-gallery__option-icon">
                {video.posterUrl && (
                  <Image
                    unoptimized
                    src={video.posterUrl}
                    alt=""
                    width={88}
                    height={66}
                  />
                )}
                {video.status === "live" ? (
                  <Radio aria-hidden size={20} />
                ) : (
                  <Play aria-hidden size={20} />
                )}
              </span>
              <span>
                <small>
                  {loadingId === video.id ? "Opening…" : statusLabel(video)}
                </small>
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
