/**
 * The scoreboard's words (M-P4a). Pure; tested.
 */
import { formatSetScore } from "@duna/tideline-core";
import type { LiveView, TeamSide } from "./scoring-machine";
import type { SyncStatus } from "./use-live-match";

export const sideKey = (side: TeamSide) => (side === "A" ? "home" : "away");

/** What a point button says to VoiceOver. Pure. */
export function pointButtonLabel(view: LiveView, side: TeamSide): string {
  const name = view.names[sideKey(side)];
  const after = {
    A: view.points.A + (side === "A" ? 1 : 0),
    B: view.points.B + (side === "B" ? 1 : 0),
  };
  return `Point to ${name}. Makes it ${formatSetScore(after.A, after.B)}.`;
}

/** The short call over the score: match point, set point, switch, serve. Pure. */
export function liveCall(view: LiveView): string | null {
  if (view.decided && view.winner)
    return `${view.names[sideKey(view.winner)]} win`;
  if (view.technicalTimeoutDue) return "Technical timeout";
  if (view.sideSwitchDue) return "Switch sides";
  const match = view.matchPoint[0];
  if (match) return `Match point ${view.names[sideKey(match)]}`;
  const set = view.setPoint[0];
  if (set) return `Set point ${view.names[sideKey(set)]}`;
  return null;
}

export function syncText(sync: SyncStatus, queued: number): string {
  switch (sync.kind) {
    case "local":
      return "Kept on this phone";
    case "needs-players":
      return "On this phone until everyone is named";
    case "syncing":
      return "Saving to Duna";
    case "synced":
      return queued > 0 ? `${queued} waiting to send` : "Saved to Duna";
    case "offline":
      return `Offline · ${sync.queued} ${sync.queued === 1 ? "point" : "points"} waiting to send`;
    case "other-device":
      return "Scored on another phone";
    case "error":
      return `Not saved · reference ${sync.reference}`;
  }
}
