/**
 * The participation view, pure. It renders the BACKEND's words
 * (`player.participation.quote` → `copy`) and never writes its own: labels
 * come straight from `copy`, the current ladder row from `display.price`.
 */
import type { NativeColorRole } from "../tokens";

export type ParticipationTone = "neutral" | "positive" | "caution" | "critical";

/** Structurally the API's participation quote (`participationQuoteSchema`). */
export interface ParticipationViewInput {
  readonly displayState: string;
  readonly display: {
    readonly tone: ParticipationTone;
    readonly numbers: {
      readonly booked: number;
      readonly capacity: number;
      readonly minimum: number;
      readonly needed: number;
      readonly spotsLeft: number;
      readonly waiting: number;
    };
    readonly price?: {
      readonly maxCharge: number;
      readonly ladder: ReadonlyArray<{
        readonly current: boolean;
        readonly minParticipants: number;
        readonly maxParticipants: number;
        readonly creditsPerPlayer: number;
      }>;
    };
    readonly cancellation: {
      readonly allowed: boolean;
      readonly free: boolean;
    };
  };
  readonly copy: {
    readonly status: string;
    readonly line?: string;
    readonly price?: string;
    readonly ladder: ReadonlyArray<string>;
    readonly cancellation?: string;
    readonly a11y: string;
  };
}

export interface ParticipationView {
  readonly chip: { readonly label: string; readonly tone: ParticipationTone };
  readonly line?: string;
  readonly ladder: ReadonlyArray<{
    readonly label: string;
    readonly current: boolean;
  }>;
  readonly priceLine?: string;
  readonly cancelLine?: string;
  readonly a11y: string;
  /** A ladder worth showing: more than one row, and the session still ahead. */
  readonly showLadder: boolean;
  readonly full: boolean;
  readonly needsPlayers: boolean;
}

const OVER = new Set(["cancelled-low", "cancelled-club", "done", "settled"]);

export function participationView(
  input: ParticipationViewInput,
): ParticipationView {
  const rows = input.display.price?.ladder ?? [];
  const ladder = input.copy.ladder.map((label, index) => ({
    label,
    current: rows[index]?.current ?? false,
  }));
  return {
    chip: { label: input.copy.status, tone: input.display.tone },
    ...(input.copy.line ? { line: input.copy.line } : {}),
    ladder,
    ...(input.copy.price ? { priceLine: input.copy.price } : {}),
    ...(input.copy.cancellation ? { cancelLine: input.copy.cancellation } : {}),
    a11y: input.copy.a11y,
    showLadder: ladder.length > 1 && !OVER.has(input.displayState),
    full: input.displayState === "full",
    needsPlayers: input.displayState === "needs-players",
  };
}

/** The chip's fill and ink roles. Never Solar: `live` is handled apart. */
export function participationToneRoles(tone: ParticipationTone): {
  readonly fill: NativeColorRole;
  readonly ink: NativeColorRole;
} {
  switch (tone) {
    case "positive":
      return { fill: "positive-wash", ink: "positive" };
    case "caution":
      return { fill: "warning-wash", ink: "warning" };
    case "critical":
      return { fill: "danger-wash", ink: "danger" };
    default:
      return { fill: "surface-sunken", ink: "text-2" };
  }
}

/** The compact one-line text in a result row: "Needs 2 more · Confirms … if 2 more join". */
export function participationCompactText(
  status: string,
  line?: string,
): string {
  return line ? `${status} · ${line}` : status;
}
