/**
 * Pure rules for the native search parts: the summary a search bar says,
 * the date-range taps, the What choices and how many tiles fit a row.
 */

export type SearchStep = "where" | "when" | "what";

export const SEARCH_STEPS: ReadonlyArray<SearchStep> = [
  "where",
  "when",
  "what",
];

/** The tiny labels over the values (large size) and in the chip names. */
export const SEARCH_STEP_LABELS: Readonly<Record<SearchStep, string>> = {
  where: "Where",
  when: "When",
  what: "What",
};

/** What an empty value reads as. */
export const SEARCH_EMPTY_VALUES: Readonly<Record<SearchStep, string>> = {
  where: "Anywhere",
  when: "Any time",
  what: "For you",
};

/** The collapsed bar's lead when no place is chosen. */
export const SEARCH_WHERE_PROMPT = "Where to?";
export const EDIT_SEARCH_LABEL = "Edit search";

export interface SearchValues {
  readonly where: string | null;
  readonly when: string | null;
  readonly what: string | null;
}

/** What the bar shows and says. Pure. */
export function searchBarSummary(values: SearchValues): {
  readonly lead: string;
  readonly detail: string;
  readonly chips: ReadonlyArray<{
    readonly step: SearchStep;
    readonly value: string;
    readonly set: boolean;
    readonly label: string;
    readonly clearLabel: string;
  }>;
} {
  const shown = (step: SearchStep) =>
    values[step] && values[step]!.trim() !== ""
      ? values[step]!
      : SEARCH_EMPTY_VALUES[step];
  return {
    lead:
      values.where && values.where.trim() !== ""
        ? values.where
        : SEARCH_WHERE_PROMPT,
    detail: `${shown("when")} · ${shown("what")}`,
    chips: SEARCH_STEPS.map((step) => ({
      step,
      value: shown(step),
      set: Boolean(values[step] && values[step]!.trim() !== ""),
      label: `Change ${SEARCH_STEP_LABELS[step]}: ${shown(step)}`,
      clearLabel: `Clear ${SEARCH_STEP_LABELS[step]}`,
    })),
  };
}

export interface DateRange {
  readonly start: string | null;
  readonly end: string | null;
}

/**
 * A tap on the date strip. The first tap sets the start; a second tap on or
 * after the start sets the end; a tap before the start (or any tap once both
 * are set) starts again from that day.
 */
export function nextRange(state: DateRange, tapped: string): DateRange {
  if (!state.start || state.end) return { start: tapped, end: null };
  if (tapped < state.start) return { start: tapped, end: null };
  return { start: state.start, end: tapped };
}

/** The default exclusive choice in What. */
export const WHAT_EXCLUSIVE = "for-you";

/**
 * Toggle a What choice. Choosing the exclusive one clears the others;
 * choosing another clears the exclusive one; clearing everything returns to
 * the exclusive one.
 */
export function toggleWhat(
  value: ReadonlyArray<string>,
  option: string,
  exclusive: string = WHAT_EXCLUSIVE,
): ReadonlyArray<string> {
  if (option === exclusive) return [exclusive];
  if (value.includes(option)) {
    const rest = value.filter((v) => v !== option && v !== exclusive);
    return rest.length > 0 ? rest : [exclusive];
  }
  return [...value.filter((v) => v !== exclusive), option];
}

/** Two tiles a row; one at large accessibility sizes. */
export function whatColumns(fontScale: number): 1 | 2 {
  return fontScale >= 1.6 ? 1 : 2;
}

/** The status words a place search shows. */
export interface WhereMessages {
  readonly empty: (q: string) => string;
  readonly error: string;
  readonly offline: string;
  readonly notConfigured: string;
  readonly denied: string;
}

export const DEFAULT_WHERE_MESSAGES: WhereMessages = {
  empty: (q) => `No places or clubs match "${q}".`,
  error: "Location search is unavailable. Try again.",
  offline: "You're offline. Type a place you know, or try again later.",
  notConfigured:
    "Place search isn't set up yet. Clubs on Duna and places you type still work.",
  denied: "Location is off. Type a place instead.",
};

export type WhereStatus =
  | "idle"
  | "loading"
  | "ready"
  | "empty"
  | "error"
  | "offline"
  | "not-configured";

/** The message for a status, or none. Pure. */
export function whereMessage(
  status: WhereStatus,
  query: string,
  messages: Partial<WhereMessages> = {},
): string | null {
  const text = { ...DEFAULT_WHERE_MESSAGES, ...messages };
  switch (status) {
    case "empty":
      return text.empty(query.trim());
    case "error":
      return text.error;
    case "offline":
      return text.offline;
    case "not-configured":
      return text.notConfigured;
    default:
      return null;
  }
}
