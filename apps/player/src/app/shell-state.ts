/**
 * The Player shell's navigation state and reducer (M-P0). Pure and
 * unit-tested (`shell-state.test.ts`).
 *
 * - Each tab keeps its own selected route, so switching tabs (or opening and
 *   closing the Duo) keeps the person's place.
 * - `window` routes (Concierge, Ask Duna) cover the whole window and return
 *   to the tab they came from.
 * - Tapping the selected tab again goes back to its root (iOS convention).
 */
import type { DiscoverIntentKind } from "../features/find/discover-intent";
import {
  INITIAL_TAB,
  ROUTES,
  TABS,
  type RouteKey,
  type TabKey,
} from "./router";

export interface RouteEntry {
  readonly key: RouteKey;
  /** Find's search opens on a kind of result (a match, a court, an event). */
  readonly intent?: DiscoverIntentKind;
  /** Messages: the thread to open; "support" opens Duna support. */
  readonly conversationId?: string;
  /** Ask Duna: a first question. */
  readonly prompt?: string;
  /** The thing a detail route shows (a session occurrence, a venue). */
  readonly targetId?: string;
  /** Changes on every open, so re-opening the same route re-applies its intent. */
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
  | {
      readonly type: "open";
      readonly route: RouteKey;
      readonly intent?: DiscoverIntentKind;
      readonly conversationId?: string;
      readonly prompt?: string;
      readonly targetId?: string;
      readonly nonce?: number;
    }
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
      const definition = ROUTES[action.route];
      const entry: RouteEntry = {
        key: action.route,
        ...(action.intent ? { intent: action.intent } : {}),
        ...(action.conversationId
          ? { conversationId: action.conversationId }
          : {}),
        ...(action.prompt ? { prompt: action.prompt } : {}),
        ...(action.targetId ? { targetId: action.targetId } : {}),
        nonce: action.nonce ?? nextNonce(),
      };
      if (definition.presentation === "window") {
        return {
          ...state,
          sheet: null,
          window: { entry, from: state.window?.from ?? state.tab },
        };
      }
      return {
        ...state,
        tab: definition.tab,
        sheet: null,
        window: null,
        stacks: { ...state.stacks, [definition.tab]: entry },
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

/** Whether the route is the one shown (the film studio's `active`). */
export function isRouteActive(state: ShellState, key: RouteKey): boolean {
  const definition = ROUTES[key];
  if (definition.presentation === "window")
    return state.window?.entry.key === key;
  return (
    state.tab === definition.tab &&
    !state.window &&
    state.stacks[definition.tab]?.key === key
  );
}
