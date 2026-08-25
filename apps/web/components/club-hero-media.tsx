"use client";

import { useEffect, useRef } from "react";

type SaveDataConnection = {
  readonly saveData?: boolean;
  addEventListener?: (type: "change", listener: () => void) => void;
  removeEventListener?: (type: "change", listener: () => void) => void;
};

export function ClubHeroMedia({
  kind,
  poster,
  url,
}: {
  readonly kind: "image" | "video";
  readonly poster?: string;
  readonly url: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (kind !== "video") return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (
      navigator as Navigator & { readonly connection?: SaveDataConnection }
    ).connection;

    const syncPlayback = () => {
      const video = videoRef.current;
      if (!video) return;
      if (reducedMotion.matches || connection?.saveData) {
        video.pause();
        return;
      }
      void video.play().catch(() => undefined);
    };

    syncPlayback();
    reducedMotion.addEventListener("change", syncPlayback);
    connection?.addEventListener?.("change", syncPlayback);

    return () => {
      reducedMotion.removeEventListener("change", syncPlayback);
      connection?.removeEventListener?.("change", syncPlayback);
    };
  }, [kind]);

  if (kind === "image") return <img alt="" src={url} />;

  return (
    <video
      loop
      muted
      playsInline
      poster={poster}
      preload="metadata"
      ref={videoRef}
      src={url}
    />
  );
}
