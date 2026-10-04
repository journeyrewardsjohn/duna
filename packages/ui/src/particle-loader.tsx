"use client";

import { useEffect, useRef } from "react";

export function DunaParticleLoader({
  label = "Loading Duna",
  size = 150,
}: {
  readonly label?: string;
  readonly size?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = size * ratio;
    canvas.height = size * ratio;
    context.scale(ratio, ratio);
    let frame = 0;
    let last = 0;
    const draw = (time: number) => {
      context.clearRect(0, 0, size, size);
      context.fillStyle = getComputedStyle(canvas).color;
      for (let index = 0; index < 220; index += 1) {
        const point = particle(index, 220, time);
        context.globalAlpha = point.opacity;
        context.beginPath();
        context.arc(
          (point.x * size) / 100,
          (point.y * size) / 100,
          (point.radius * size) / 100,
          0,
          Math.PI * 2,
        );
        context.fill();
      }
    };
    const animate = (time: number) => {
      if (time - last >= 40) {
        draw(time / 1000);
        last = time;
      }
      frame = requestAnimationFrame(animate);
    };
    const sync = () => {
      cancelAnimationFrame(frame);
      draw(0);
      if (!preference.matches && !document.hidden)
        frame = requestAnimationFrame(animate);
    };
    sync();
    preference.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      cancelAnimationFrame(frame);
      preference.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [size]);
  return (
    <div aria-label={label} role="status" className="duna-particle-loader">
      <canvas aria-hidden ref={ref} style={{ width: size, height: size }} />
      <span>{label}</span>
    </div>
  );
}

/** Deterministic Fibonacci sphere, gently deformed and rotated in three dimensions. */
function particle(index: number, count: number, seconds: number) {
  const y = 1 - (index / Math.max(1, count - 1)) * 2;
  const radius = Math.sqrt(1 - y * y);
  const theta = index * Math.PI * (3 - Math.sqrt(5));
  const pulse = 1 + 0.13 * Math.sin(theta * 2 + seconds * 0.7 + y * 3);
  const x = Math.cos(theta) * radius * pulse;
  const z = Math.sin(theta) * radius * pulse;
  const turn = seconds * 0.12;
  const rotatedX = x * Math.cos(turn) + z * Math.sin(turn);
  const rotatedZ = z * Math.cos(turn) - x * Math.sin(turn);
  const depth = (rotatedZ + 1.2) / 2.4;
  return {
    x: 50 + rotatedX * 35,
    y: 50 + (y * pulse + Math.sin(seconds * 0.5 + theta) * 0.06) * 35,
    radius: 0.32 + depth * 0.35,
    opacity: 0.32 + depth * 0.58,
  };
}
