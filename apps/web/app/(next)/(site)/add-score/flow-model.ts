/**
 * Pure helpers for the add-a-score flow (no React, no browser), tested
 * directly.
 */
import type { AddScorePlayer, AddScorePreview, AddScoreStep } from "@duna/api";

export const ADD_SCORE_STEP_TITLES = [
  "Where",
  "Score",
  "Players",
  "Your rating",
] as const;

const STEP_ORDER: readonly AddScoreStep[] = ["where", "score", "players"];

/** The step to open: the first not finished, or the result when all are. */
export function firstIncompleteStep(
  completed: readonly AddScoreStep[],
): number {
  const index = STEP_ORDER.findIndex((step) => !completed.includes(step));
  return index === -1 ? 3 : index;
}

export const FORMAT_OPTIONS = [
  { value: "2", label: "2 v 2" },
  { value: "3", label: "3 v 3" },
  { value: "4", label: "4 v 4" },
  { value: "6", label: "6 v 6" },
] as const;

export const SURFACE_OPTIONS = [
  { value: "beach-sand", label: "Beach sand" },
  { value: "indoor-sand", label: "Indoor sand" },
  { value: "indoor-hardwood", label: "Indoor hardwood" },
  { value: "grass", label: "Grass" },
] as const;

export interface NameRow {
  readonly firstName: string;
  readonly lastInitial: string;
}

/** Exactly `count` rows, keeping what was typed. */
export function nameRows(
  rows: readonly (NameRow | AddScorePlayer)[] | undefined,
  count: number,
): NameRow[] {
  const out: NameRow[] = (rows ?? [])
    .slice(0, Math.max(0, count))
    .map((row) => ({
      firstName: row.firstName ?? "",
      lastInitial: row.lastInitial ?? "",
    }));
  while (out.length < count) out.push({ firstName: "", lastInitial: "" });
  return out;
}

/** `YYYY-MM-DD` for the visitor's own calendar day. */
export function todayIso(now: Date): string {
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

/** "Fri, Nov 27" for a day or an instant. */
export function formatDay(value: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00`)
    : new Date(value);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

function signed(value: number): string {
  const fixed = Math.abs(value).toFixed(2);
  return value >= 0 ? `+${fixed}` : `−${fixed}`;
}

/**
 * What the result would do, in one honest sentence: never a rating, only the
 * change one confirmed result makes from where every new player starts.
 */
export function resultSentence(preview: AddScorePreview): string {
  const what = preview.whatItWouldDo;
  if (!preview.counts || !what) {
    return preview.reason === "friendly"
      ? "Nothing to your Sand Rating: friendly matches are kept in your history but don’t move it."
      : "Nothing to your Sand Rating yet: only competitive two-on-two matches move it for now. This one is kept in your history.";
  }
  const verb = preview.result === "won" ? "win" : "loss";
  return `If the other side confirms it, a ${verb} like this moves a player new to Duna from ${what.startingPoint.toFixed(2)} to ${what.afterThisMatch.toFixed(2)} (${signed(what.change)}).`;
}

/** Where "Save it to your name" goes: sign-up or sign-in returning to claim. */
export const claimHref = {
  claim: "/add-score/claim",
  signUp: `/sign-up?returnTo=${encodeURIComponent("/add-score/claim")}`,
  signIn: `/sign-in?returnTo=${encodeURIComponent("/add-score/claim")}`,
} as const;

/**
 * After a failed check: move focus to the first field that says what is
 * wrong (a control marked invalid, else the first inline error).
 */
export function focusFirstProblem(container: HTMLElement | null): void {
  if (!container) return;
  const target =
    container.querySelector<HTMLElement>('[aria-invalid="true"]') ??
    container.querySelector<HTMLElement>(".as-error");
  if (!target) return;
  if (!target.matches("input, button, select, textarea, [tabindex]")) {
    target.setAttribute("tabindex", "-1");
  }
  target.focus();
}
