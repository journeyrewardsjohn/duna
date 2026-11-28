"use client";

import { Icon } from "@duna/ui/tideline";
import { useEffect, useRef, useState } from "react";

/**
 * A club's own photograph or film, in the site's photo frame (website.md
 * §2.9): the still is there at once (sized by its frame, so nothing shifts);
 * a film loads only after the page has, never on data saver, 2G or reduced
 * motion, never with sound, pauses off screen and has a Pause control.
 * Without a poster a film shows its first frame.
 */
export function ClubMedia({
  kind,
  url,
  poster,
  alt,
  priority = false,
}: {
  readonly kind: "image" | "video";
  readonly url: string;
  readonly poster?: string;
  readonly alt: string;
  readonly priority?: boolean;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const player = useRef<HTMLVideoElement>(null);
  const [videoOn, setVideoOn] = useState(false);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (kind !== "video") return;
    const connection = (
      navigator as Navigator & {
        connection?: { saveData?: boolean; effectiveType?: string };
      }
    ).connection;
    if (
      matchMedia("(prefers-reduced-motion: reduce)").matches ||
      connection?.saveData ||
      /(^|-)2g$/.test(connection?.effectiveType ?? "")
    ) {
      return;
    }
    const start = () => setVideoOn(true);
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
    return () => window.removeEventListener("load", start);
  }, [kind]);

  useEffect(() => {
    const element = frame.current;
    if (!videoOn || !element) return;
    const observer = new IntersectionObserver(
      (entries) => setVisible(entries.some((entry) => entry.isIntersecting)),
      { threshold: 0.2 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [videoOn]);

  useEffect(() => {
    const element = player.current;
    if (!element) return;
    if (visible && !paused && document.visibilityState === "visible") {
      void element.play().catch(() => undefined);
    } else {
      element.pause();
    }
  }, [visible, paused, videoOn]);

  const still = kind === "image" ? url : poster;
  return (
    <div className="site-photo club-media" ref={frame}>
      {still ? (
        // The club's own media from its upload: a plain, sized image (the
        // frame fixes the ratio, so nothing moves when it arrives).
        <img
          alt={alt}
          className="site-photo__image club-media__image"
          decoding="async"
          fetchPriority={priority ? "high" : undefined}
          loading={priority ? "eager" : "lazy"}
          src={still}
        />
      ) : null}
      {kind === "video" && (videoOn || !still) ? (
        <video
          aria-label={still ? undefined : alt}
          aria-hidden={still ? true : undefined}
          className="site-photo__video club-media__video"
          data-ready=""
          loop
          muted
          playsInline
          poster={poster}
          preload={videoOn ? "auto" : "metadata"}
          ref={player}
          src={url}
          tabIndex={-1}
        />
      ) : null}
      {videoOn ? (
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
    </div>
  );
}
