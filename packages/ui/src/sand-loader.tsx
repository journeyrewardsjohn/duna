"use client";

import { useEffect, useRef } from "react";
import { sandParticle } from "./sand";

export function SandLoader({
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
        const point = sandParticle(index, 220, time);
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
    <div aria-label={label} role="status" className="sand-loader">
      <canvas aria-hidden ref={ref} style={{ width: size, height: size }} />
      <span>{label}</span>
    </div>
  );
}
