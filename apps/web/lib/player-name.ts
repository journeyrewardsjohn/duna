export function compactPlayerName(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? "Player";
  return `${parts[0]?.slice(0, 1).toLocaleUpperCase()}. ${parts.at(-1)}`;
}
