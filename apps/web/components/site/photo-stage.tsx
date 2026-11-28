"use client";

import { Icon } from "@duna/ui/tideline";
import Image from "next/image";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { SitePhoto } from "./media";

interface PhotoStageProps {
  readonly photo: SitePhoto;
  /** The `sizes` the layout gives this frame. */
  readonly sizes: string;
  /** The first screen's photograph: loaded first, never lazy. */
  readonly priority?: boolean;
  /** A muted loop laid over the photo (spec 2.4: hero and story step 2 only). */
  readonly video?: string;
  /** Whether the loop may play now (the story plays its clip only on its step). */
  readonly videoActive?: boolean;
  /** The small line at the bottom left. */
  readonly credit?: string;
  /** Hides the photo from assistive technology when the text says it all. */
  readonly decorative?: boolean;
  readonly className?: string;
  readonly children?: ReactNode;
}

interface NetworkInformationLike {
  readonly saveData?: boolean;
  readonly effectiveType?: string;
}

/** Video only for visitors who can afford it: no data saver, no 2G, motion on. */
function videoAllowed() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  const connection = (
    navigator as Navigator & { connection?: NetworkInformationLike }
  ).connection;
  if (connection?.saveData) return false;
  if (connection?.effectiveType && /(^|-)2g$/.test(connection.effectiveType))
    return false;
  return true;
}

function whenLoaded(callback: () => void) {
  if (document.readyState === "complete") {
    callback();
    return () => undefined;
  }
  window.addEventListener("load", callback, { once: true });
  return () => window.removeEventListener("load", callback);
}

/**
 * A rounded photo frame (spec 4, PhotoStage). The photograph is the poster:
 * it is there at once. A loop, when there is one, is fetched only after the
 * page has loaded, never on data saver, 2G or reduced motion, never with
 * sound; it pauses off screen and when the tab is hidden, and a Pause
 * control stops it for good.
 */
export function PhotoStage({
  photo,
  sizes,
  priority = false,
  video,
  videoActive = true,
  credit,
  decorative = false,
  className,
  children,
}: PhotoStageProps) {
  const frame = useRef<HTMLDivElement>(null);
  const player = useRef<HTMLVideoElement>(null);
  const [videoOn, setVideoOn] = useState(false);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!video || !videoAllowed()) return;
    return whenLoaded(() => setVideoOn(true));
  }, [video]);

  useEffect(() => {
    const element = frame.current;
    if (!videoOn || !element) return;
    const observer = new IntersectionObserver(
      (entries) => setVisible(entries.some((entry) => entry.isIntersecting)),
      { threshold: 0.2 },
    );
    observer.observe(element);
    const onVisibility = () =>
      setVisible(
        document.visibilityState === "visible" &&
          element.getBoundingClientRect().bottom > 0 &&
          element.getBoundingClientRect().top < window.innerHeight,
      );
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [videoOn]);

  useEffect(() => {
    const element = player.current;
    if (!element) return;
    if (visible && videoActive && !paused) {
      void element.play().catch(() => undefined);
    } else {
      element.pause();
    }
  }, [visible, videoActive, paused, videoOn]);

  return (
    <div
      className={className ? `site-photo ${className}` : "site-photo"}
      ref={frame}
    >
      <Image
        alt={decorative ? "" : photo.alt}
        className="site-photo__image"
        fill
        decoding="async"
        fetchPriority={priority ? "high" : undefined}
        loading={priority ? "eager" : "lazy"}
        placeholder="blur"
        preload={priority}
        sizes={sizes}
        src={photo.image}
        style={{ objectPosition: photo.focal }}
      />
      {videoOn ? (
        <video
          aria-hidden="true"
          className="site-photo__video"
          data-ready={(ready && videoActive && !paused) || undefined}
          loop
          muted
          onCanPlay={() => setReady(true)}
          playsInline
          poster={photo.image.src}
          preload="none"
          ref={player}
          src={video}
          style={{ objectPosition: photo.focal }}
          tabIndex={-1}
        />
      ) : null}
      {videoOn && videoActive ? (
        <button
          aria-pressed={paused}
          className="site-photo__pause"
          onClick={() => setPaused((value) => !value)}
          type="button"
        >
          {paused ? <Icon name="play" size="chip" /> : null}
          <span>{paused ? "Play" : "Pause"}</span>
        </button>
      ) : null}
      {children}
      {credit ? <span className="site-photo__credit">{credit}</span> : null}
    </div>
  );
}
