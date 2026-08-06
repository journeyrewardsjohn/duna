"use client";

import { useEffect, useState } from "react";

type ConnectionPreference = EventTarget & {
  readonly effectiveType?: string;
  readonly saveData?: boolean;
};

function connectionPreference(): ConnectionPreference | undefined {
  return (
    navigator as Navigator & {
      readonly connection?: ConnectionPreference;
    }
  ).connection;
}

export function AmbientHeroVideo() {
  const [enabled, setEnabled] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = connectionPreference();
    const update = () => {
      const constrained =
        connection?.saveData === true ||
        connection?.effectiveType === "slow-2g" ||
        connection?.effectiveType === "2g" ||
        connection?.effectiveType === "3g";
      setEnabled(!motion.matches && !constrained);
    };

    update();
    motion.addEventListener("change", update);
    connection?.addEventListener("change", update);
    return () => {
      motion.removeEventListener("change", update);
      connection?.removeEventListener("change", update);
    };
  }, []);

  if (!enabled) return null;

  return (
    <video
      aria-hidden
      autoPlay
      className={`campaign-hero__video${playing ? " campaign-hero__video--playing" : ""}`}
      loop
      muted
      onPlaying={() => setPlaying(true)}
      onWaiting={() => setPlaying(false)}
      playsInline
      poster="/media/brand/duna-home-hero-v1.webp"
      preload="metadata"
    >
      <source
        src="/media/brand/duna-home-hero-motion-v1.mp4"
        type="video/mp4"
      />
    </video>
  );
}
