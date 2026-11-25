/** What the data behind a search field is doing. The caller owns this. */
export type SearchStatus =
  "idle" | "searching" | "results" | "empty" | "error" | "offline";

/** What a search field shows. `typing` is the debounce window. */
export type SearchFieldState =
  "idle" | "typing" | "searching" | "results" | "empty" | "error" | "offline";

export interface SearchStateInput {
  /** The text in the field. */
  query: string;
  /** Whether a debounced search is still waiting to fire. */
  pending: boolean;
  /** The caller's data status for the last search it started. */
  status: SearchStatus;
  /** Fewer trimmed characters than this is not a search. */
  minLength?: number;
}

/**
 * The single state a search field renders. Offline always shows: nothing can
 * be searched. Otherwise too little text is idle, whatever the caller's
 * status says, and typing wins over stale results so a list never sits under
 * a query it does not answer.
 */
export function resolveSearchState({
  query,
  pending,
  status,
  minLength = 1,
}: SearchStateInput): SearchFieldState {
  if (status === "offline") return "offline";
  if (query.trim().length < Math.max(1, minLength)) return "idle";
  if (pending) return "typing";
  return status;
}
