/**
 * The Pro shell's navigation state and reducer (M-R0). Pure and unit-tested
 * (`shell.test.ts`).
 *
 * - Each tab keeps its own selected route, so switching tabs (or opening and
 *   closing the Duo) keeps the person's place.
 * - `window` routes (Courtside, check-in, Messages, Ask Duna, Create, Get
 *   paid, film, notes, the event desk) cover the whole window and return to
 *   the tab they came from.
 * - Routes without a tab (Account, Club tools) open in the tab that is
 *   showing.
 * - Tapping the selected tab again goes back to its root (iOS convention).
 */
import {
  INITIAL_TAB,
  ROUTES,
  TABS,
  type RouteKey,
  type TabKey,
} from "./router";

/** What a route was opened with. Every field is optional. */
export interface RouteParams {
  /** Calendar: the session or booking to focus. Notes: the session. */
  readonly entryId?: string;
  /** Notes: the player the note is about. Messages: the person to write to. */
  readonly personId?: string;
  /** Courtside: the match to score. */
  readonly matchId?: string;
  /** Messages: the conversation to open. */
  readonly conversationId?: string;
  /** Messages: a session or booking group ("event:…", "rental:…"). */
  readonly audienceKey?: string;
}

export interface RouteEntry extends RouteParams {
  readonly key: RouteKey;
  /** Changes on every open, so re-opening the same route re-applies its params. */
  readonly nonce: number;
}

export interface ShellState {
  readonly tab: TabKey;
  readonly stacks: Readonly<Record<TabKey, RouteEntry | null>>;
  /** A whole-window route and the tab to return to. */
  readonly window: { readonly entry: RouteEntry; readonly from: TabKey } | null;
  readonly sheet: "new" | null;
}

export type ShellAction =
  | { readonly type: "select-tab"; readonly tab: TabKey }
  | ({
      readonly type: "open";
      readonly route: RouteKey;
      readonly nonce?: number;
    } & RouteParams)
  | { readonly type: "back"; readonly tab: TabKey }
  | { readonly type: "close-window" }
  | { readonly type: "open-sheet" }
  | { readonly type: "close-sheet" };

export function initialShellState(tab: TabKey = INITIAL_TAB): ShellState {
  return {
    tab,
    stacks: Object.fromEntries(TABS.map((t) => [t.key, null])) as Record<
      TabKey,
      RouteEntry | null
    >,
    window: null,
    sheet: null,
  };
}

let nonceCounter = 0;
function nextNonce(): number {
  nonceCounter += 1;
  return nonceCounter;
}

const PARAM_KEYS = [
  "entryId",
  "personId",
  "matchId",
  "conversationId",
  "audienceKey",
] as const satisfies readonly (keyof RouteParams)[];

function paramsOf(action: RouteParams): RouteParams {
  const params: Record<string, string> = {};
  for (const key of PARAM_KEYS) {
    const value = action[key];
    if (value) params[key] = value;
  }
  return params;
}

export function shellReducer(
  state: ShellState,
  action: ShellAction,
): ShellState {
  switch (action.type) {
    case "select-tab": {
      if (action.tab === state.tab && !state.window) {
        // Reselecting the current tab returns to its root.
        if (!state.stacks[action.tab]) return state;
        return { ...state, stacks: { ...state.stacks, [action.tab]: null } };
      }
      return { ...state, tab: action.tab, window: null, sheet: null };
    }
    case "open": {
      // People without a person is the roster: the tab's root.
      if (action.route === "people" && !action.personId) {
        return {
          ...state,
          tab: "people",
          sheet: null,
          window: null,
          stacks: { ...state.stacks, people: null },
        };
      }
      const definition = ROUTES[action.route];
      const entry: RouteEntry = {
        key: action.route,
        ...paramsOf(action),
        nonce: action.nonce ?? nextNonce(),
      };
      const home = state.window?.from ?? state.tab;
      if (definition.presentation === "window") {
        // Over whatever is showing; closing returns there.
        return {
          ...state,
          tab: home,
          sheet: null,
          window: { entry, from: home },
        };
      }
      const tab = definition.tab ?? home;
      return {
        ...state,
        tab,
        sheet: null,
        window: null,
        stacks: { ...state.stacks, [tab]: entry },
      };
    }
    case "back":
      if (!state.stacks[action.tab]) return state;
      return { ...state, stacks: { ...state.stacks, [action.tab]: null } };
    case "close-window":
      if (!state.window) return state;
      return { ...state, tab: state.window.from, window: null };
    case "open-sheet":
      return { ...state, sheet: "new" };
    case "close-sheet":
      return state.sheet ? { ...state, sheet: null } : state;
  }
}

/** The route a tab shows: its selection, or (when there is room) its default. */
export function visibleRoute(
  state: ShellState,
  tab: TabKey,
  paneCount: number,
): RouteEntry | null {
  const selected = state.stacks[tab];
  if (selected) return selected;
  if (paneCount < 2) return null;
  const fallback = TABS.find((t) => t.key === tab)?.defaultRoute;
  return fallback ? { key: fallback, nonce: 0 } : null;
}

/** Whether the route is the one shown. */
export function isRouteActive(state: ShellState, key: RouteKey): boolean {
  const definition = ROUTES[key];
  if (definition.presentation === "window")
    return state.window?.entry.key === key;
  const tab = definition.tab ?? state.tab;
  return !state.window && state.tab === tab && state.stacks[tab]?.key === key;
}
