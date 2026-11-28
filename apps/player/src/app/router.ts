/**
 * The Player's typed route table (M-P0). Pure data: no React Native, so the
 * shell reducer, the deep-link map and the tests read the same table.
 *
 * Navigation (board P-IA, contract "Navigation"): four verbs on the system
 * tab bar, Find · Play · + · Improve · Connect. "+" is not a tab: it opens
 * the New sheet from every tab and every size. Play's root is Home.
 *
 * ADDING A ROUTE (screen packages M-P1 … M-P7): add ONE entry to `ROUTES`
 * below, for example
 *
 *   courts: route("find", "Book a court", "court", "Open times at your clubs"),
 *
 * then give it a renderer in `screens.tsx` (the compiler refuses to build
 * until every key has one). A rebuilt screen replaces its legacy entry and
 * drops `legacy: true`; nothing else in the shell changes.
 */
import type { GlyphName } from "@duna/ui/native/icons";

export type TabKey = "find" | "play" | "improve" | "connect";

/**
 * Where a route opens:
 * - `pane`: in its tab, as the pushed detail (compact) or the second pane
 *   (regular and expanded);
 * - `tab`: over its whole tab, tab bar still visible (the film studio);
 * - `window`: over the whole window, tab bar hidden (Concierge, Ask Duna).
 */
export type RoutePresentation = "pane" | "tab" | "window";

export interface RouteDefinition {
  readonly tab: TabKey;
  readonly title: string;
  readonly icon: GlyphName;
  /** One line under the title in the tab's hub list. */
  readonly summary: string;
  readonly presentation: RoutePresentation;
  /** Still the pre-Tideline screen inside the new shell's header. */
  readonly legacy: boolean;
  /** Listed in its tab's hub (false for routes reached only from elsewhere). */
  readonly listed: boolean;
  /**
   * The screen draws its own one Jost title (a session's name); the shell
   * header shows only Back.
   */
  readonly ownTitle: boolean;
}

function route(
  tab: TabKey,
  title: string,
  icon: GlyphName,
  summary: string,
  options: Partial<
    Pick<RouteDefinition, "presentation" | "legacy" | "listed" | "ownTitle">
  > = {},
): RouteDefinition {
  return {
    tab,
    title,
    icon,
    summary,
    presentation: options.presentation ?? "pane",
    legacy: options.legacy ?? true,
    listed: options.listed ?? true,
    ownTitle: options.ownTitle ?? false,
  };
}

export const ROUTES = {
  // Find: discover courts, clubs, matches, events and coaches.
  // Find's root (M-P1): Where · When · What, results as a list and a map.
  // The key stays "discover" so every link already shipped still lands here.
  discover: route(
    "find",
    "Find",
    "find",
    "Courts, clubs, matches and events near you",
    { legacy: false, listed: false, ownTitle: true },
  ),
  // A group session (lesson, clinic, group training, open play) and its booking.
  session: route("find", "Session", "lesson", "A session and its group", {
    legacy: false,
    listed: false,
    ownTitle: true,
  }),
  // A venue's open court times: day, length and time, then checkout.
  court: route("find", "Court times", "court", "Open times at a venue", {
    legacy: false,
    listed: false,
    ownTitle: true,
  }),
  coaches: route(
    "find",
    "Coaches",
    "coach",
    "Lessons, clinics and coaches to book",
  ),
  // Play: Home is the tab's root; plans and results live here.
  plans: route(
    "play",
    "Plans",
    "schedule",
    "Your bookings, matches and calendar",
  ),
  // Scoring and results (M-P4a): add a result, a result and its states,
  // and the scorekeeper (whole window, the live zone).
  score: route("play", "Add a result", "trophy", "Your opponents confirm it", {
    legacy: false,
  }),
  result: route("play", "Result", "score", "A match, its state and rating", {
    legacy: false,
    listed: false,
    ownTitle: true,
  }),
  live: route("play", "Score a match", "score", "Keep score point by point", {
    presentation: "window",
    legacy: false,
    listed: false,
  }),
  // Improve: rating, film, health, training and the player profile.
  performance: route(
    "improve",
    "Sand Rating",
    "rating",
    "Your rating, recent matches and what counts",
    { legacy: false },
  ),
  // The earlier performance analysis (form, partners, upsets), reached from
  // the Sand Rating home until Improve rebuilds it.
  insights: route(
    "improve",
    "Performance in depth",
    "rating",
    "Form, partners, upsets and every rated match",
    { listed: false },
  ),
  video: route(
    "improve",
    "Film",
    "film",
    "Record, review and share your games",
    { presentation: "tab" },
  ),
  health: route(
    "improve",
    "Health",
    "heart-rate",
    "Readiness, sleep and match-day trends",
  ),
  training: route(
    "improve",
    "Training",
    "whistle",
    "Programs, practice and coaching notes",
  ),
  // The profile (M-P5): the person first, then four named sections.
  you: route(
    "improve",
    "Profile",
    "player",
    "Your details, clubs and settings",
    { legacy: false, ownTitle: true },
  ),
  // Connect: Concierge, Ask Duna, wallet and the account.
  messages: route(
    "connect",
    "Messages",
    "message",
    "Clubs, coaches and the people you play with",
    { presentation: "window" },
  ),
  ai: route(
    "connect",
    "Ask Duna",
    "thread",
    "Ask about your games, bookings and clubs",
    { presentation: "window" },
  ),
  // The wallet (WALLET-2): club cards, the pass, credits and the balance.
  wallet: route(
    "connect",
    "Wallet",
    "wallet",
    "Passes, memberships and credits",
    { legacy: false, ownTitle: true },
  ),
  predictions: route(
    "connect",
    "Predictions",
    "podium",
    "Your picks on pro events",
    { listed: false },
  ),
  account: route(
    "connect",
    "Account",
    "you",
    "Organisations, sign-in and appearance",
    { legacy: false },
  ),
} as const satisfies Record<string, RouteDefinition>;

export type RouteKey = keyof typeof ROUTES;

export interface TabDefinition {
  readonly key: TabKey;
  readonly title: string;
  /**
   * SF Symbol for the system tab bar. Required: the Duo's vertical bar shows
   * only items with a symbol.
   */
  readonly systemImage: string;
  readonly icon: GlyphName;
  /** What a regular or expanded window shows beside the hub before a choice. */
  readonly defaultRoute: RouteKey | null;
  /** The hub's one line under the title. */
  readonly summary: string;
}

/** Tab order on every size (the centre "+" sits between Play and Improve). */
export const TABS: readonly TabDefinition[] = [
  {
    key: "find",
    title: "Find",
    systemImage: "magnifyingglass",
    icon: "find",
    // Find's root is the search itself; the map fills the second pane.
    defaultRoute: null,
    summary: "Courts, clubs, matches, events and coaches",
  },
  {
    key: "play",
    title: "Play",
    systemImage: "figure.volleyball",
    icon: "play",
    defaultRoute: null,
    summary: "Next up, your plans and results",
  },
  {
    key: "improve",
    title: "Improve",
    systemImage: "chart.line.uptrend.xyaxis",
    icon: "improve",
    defaultRoute: "performance",
    summary: "Sand Rating, film, health and training",
  },
  {
    key: "connect",
    title: "Connect",
    systemImage: "bubble.left.and.bubble.right",
    icon: "connect",
    defaultRoute: "wallet",
    summary: "Messages, Ask Duna, wallet and your account",
  },
];

/** The tab the app opens on: Play, whose root is Home. */
export const INITIAL_TAB: TabKey = "play";

/** The centre action: the system's prominent item, never a tab. */
export const NEW_ACTION = {
  key: "new",
  title: "New",
  systemImage: "plus",
  accessibilityLabel: "New: book, match or result",
} as const;

export function tabDefinition(tab: TabKey): TabDefinition {
  return TABS.find((candidate) => candidate.key === tab)!;
}

export function routeDefinition(key: RouteKey): RouteDefinition {
  return ROUTES[key];
}

/** The routes a tab lists in its hub, in table order. */
export function routesForTab(tab: TabKey): readonly RouteKey[] {
  return (Object.keys(ROUTES) as RouteKey[]).filter(
    (key) => ROUTES[key].tab === tab && ROUTES[key].listed,
  );
}

export function isRouteKey(value: string): value is RouteKey {
  return Object.prototype.hasOwnProperty.call(ROUTES, value);
}
