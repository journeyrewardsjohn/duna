type ResultRosterDensity = "regular" | "compact" | "dense";

export function resultRosterDensity(playerCount: number): ResultRosterDensity {
  if (playerCount <= 2) return "regular";
  if (playerCount <= 4) return "compact";
  return "dense";
}

export function resultRosterWidth(playerCount: number): `${number}%` {
  return `${100 / Math.max(1, Math.min(playerCount, 6))}%` as `${number}%`;
}

export function resultRosterName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}
