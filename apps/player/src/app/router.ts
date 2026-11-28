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
}

function route(
  tab: TabKey,
  title: string,
  icon: GlyphName,
  summary: string,
  options: Partial<
    Pick<RouteDefinition, "presentation" | "legacy" | "listed">
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
  };
}

export const ROUTES = {
  // Find: discover courts, clubs, matches, events and coaches.
  discover: route(
    "find",
    "Search",
    "find",
    "Courts, clubs, matches and events near you",
  ),
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
  score: route("play", "Add a result", "trophy", "Your opponents confirm it"),
  // Improve: rating, film, health, training and the player profile.
  performance: route(
    "improve",
    "Sand Rating and results",
    "rating",
    "Your rating, form and recent matches",
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
  you: route(
    "improve",
    "Profile",
    "player",
    "Your details, artwork and privacy",
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
  wallet: route(
    "connect",
    "Wallet",
    "wallet",
    "Passes, memberships and credits",
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
    defaultRoute: "discover",
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
