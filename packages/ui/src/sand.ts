/** The warm, quiet product palette. Live camera surfaces keep their own contrast. */
export const sandColors = {
  canvas: "#F1EDE6",
  surface: "#FAF8F4",
  inset: "#E8E3D9",
  ink: "#32332F",
  muted: "#686761",
  line: "#D9D4CB",
  white: "#FFFFFF",
  inkRgb: "50,51,47",
  surfaceRgb: "250,248,244",
  insetRgb: "232,227,217",
  veil: "rgba(20,24,25,0.43)",
  glass: "rgba(30,33,32,0.30)",
  scrim: "rgba(32,33,29,0.35)",
} as const;

/** Deterministic Fibonacci sphere, gently deformed and rotated in three dimensions. */
export function sandParticle(index: number, count: number, seconds: number) {
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
