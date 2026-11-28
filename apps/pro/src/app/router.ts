/**
 * Duna Pro's typed route table (M-R0). Pure data: no React Native, so the
 * shell reducer, the deep-link map and the tests read the same table.
 *
 * Navigation (board P00-NavMap, contract R15 "Pro keeps coach tabs"): five
 * labelled tabs on the system tab bar, shaped by role. A coach sees
 * Today · Schedule · Students · Threads · Earnings; an owner or manager sees
 * the same places as Today · Schedule · People · Inbox · Money. Create (+),
 * Ask Duna and the account sit in the top bar of every tab, never in the
 * tab bar. Courtside is a mode, not a tab: full window, tab bar hidden.
 *
 * ADDING A ROUTE (screen packages M-R1 … M-R6): add ONE entry to `ROUTES`
 * below, for example
 *
 *   availability: route("schedule", "Availability", "clock", "When you coach"),
 *
 * then give it a renderer in `screens.tsx` (the compiler refuses to build
 * until every key has one). A rebuilt screen replaces its legacy entry and
 * drops `legacy: true`; nothing else in the shell changes.
 */
import type { GlyphName } from "@duna/ui/native/icons";

export type TabKey = "today" | "schedule" | "people" | "inbox" | "money";

/**
 * Where a route opens:
 * - `pane`: in its tab, as the pushed detail (compact) or the second pane
 *   (regular and expanded);
 * - `window`: over the whole window, tab bar hidden (Courtside, check-in,
 *   Messages, Ask Duna, Create, Get paid). Closing returns to the tab.
 */
export type RoutePresentation = "pane" | "window";

export interface RouteDefinition {
  /** Its tab, or `null` for a route that opens in whichever tab is showing. */
  readonly tab: TabKey | null;
  readonly title: string;
  readonly icon: GlyphName;
  /** One line under the title in the tab's hub list. */
  readonly summary: string;
  readonly presentation: RoutePresentation;
  /** Still the pre-Tideline screen inside the new shell's header. */
  readonly legacy: boolean;
  /** Listed in its tab's hub (false for routes reached only from elsewhere). */
  readonly listed: boolean;
  /** Drawn in the Live zone (Night Court ground; Solar only while live). */
  readonly live: boolean;
}

function route(
  tab: TabKey | null,
  title: string,
  icon: GlyphName,
  summary: string,
  options: Partial<
    Pick<RouteDefinition, "presentation" | "legacy" | "listed" | "live">
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
    live: options.live ?? false,
  };
}

export const ROUTES = {
  // Today: the day at a glance is the tab's root; Courtside and notes open
  // from it full window.
  courtside: route(
    "today",
    "Courtside",
    "score",
    "Score a match on your courts",
    { presentation: "window", live: true },
  ),
  notes: route(
    "today",
    "Session notes",
    "lesson",
    "Voice notes for you or a player",
    { presentation: "window", listed: false },
  ),
  // Schedule: the agenda is the tab's root.
  calendar: route(
    "schedule",
    "Calendar",
    "schedule",
    "Every session, booking and block, by day or week",
  ),
  checkin: route(
    "schedule",
    "Check-in",
    "pass",
    "Scan passes and tickets at the court",
    { presentation: "window", live: true },
  ),
  events: route(
    "schedule",
    "Event desk",
    "tournament",
    "Tournaments, brackets and court assignments",
    { presentation: "window" },
  ),
  // My working life (M-R5): when I can work, time away and cover.
  availability: route(
    "schedule",
    "Availability",
    "clock-window",
    "When you can coach, week by week",
    { legacy: false },
  ),
  timeAway: route(
    "schedule",
    "Time away",
    "block",
    "Days you can't work and time off you ask for",
    { legacy: false },
  ),
  cover: route(
    "schedule",
    "Cover",
    "users",
    "Sessions that need a coach, and asking for cover",
    { legacy: false },
  ),
  // People (Students for coaches).
  people: route(
    "people",
    "Roster",
    "users",
    "Players, guardians, balances, notes and history",
  ),
  film: route(
    "people",
    "Film review",
    "film",
    "Coach video and clips for your players",
    { presentation: "window" },
  ),
  // Inbox (Threads for coaches).
  messages: route(
    "inbox",
    "Messages",
    "message",
    "Players, guardians, groups and Duna support",
    { presentation: "window" },
  ),
  ai: route(
    "inbox",
    "Ask Duna",
    "thread",
    "Ask about your day, your players and your club",
    { presentation: "window" },
  ),
  // Money (Earnings for coaches): the tab's root is Earnings (M-R5).
  money: route(
    "money",
    "Club money",
    "wallet",
    "Sales, payouts, refunds and what is owed",
  ),
  getPaid: route(
    "money",
    "Get paid",
    "tap-to-pay",
    "Collect in person or send a payment link",
    { presentation: "window" },
  ),
  // Opened from the top bar, in whichever tab is showing.
  create: route(null, "Create", "plus", "Sessions, services, goods and plans", {
    presentation: "window",
    listed: false,
  }),
  account: route(
    null,
    "Account",
    "you",
    "Organisations, appearance and sign-out",
    { legacy: false, listed: false },
  ),
  // The session a coach runs (M-R2): opens in whichever tab it came from
  // (Today, Schedule), beside the day on the open Duo and iPad.
  session: route(
    null,
    "Session",
    "schedule",
    "Who is coming, the group's state and what to do",
    { legacy: false, listed: false },
  ),
  // Courtside check-in and attendance (M-R2): whole window, works offline.
  attendance: route(
    null,
    "Attendance",
    "check",
    "Check players in at the court, with or without signal",
    { presentation: "window", legacy: false, listed: false },
  ),
  tools: route(
    null,
    "Club tools",
    "venue",
    "Products, venues, team, policies and billing",
    { listed: false },
  ),
} as const satisfies Record<string, RouteDefinition>;

export type RouteKey = keyof typeof ROUTES;

/** Who the tabs are labelled for (board P00-NavMap, "Tab bar by role"). */
export type ProAudience = "coach" | "owner";

export interface TabDefinition {
  readonly key: TabKey;
  /** The tab's name for a coach and for an owner or manager. */
  readonly titles: Readonly<Record<ProAudience, string>>;
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

/** Tab order on every size. */
export const TABS: readonly TabDefinition[] = [
  {
    key: "today",
    titles: { coach: "Today", owner: "Today" },
    systemImage: "sun.max",
    icon: "home",
    defaultRoute: null,
    summary: "Up next, what needs you and who is on court",
  },
  {
    key: "schedule",
    titles: { coach: "Schedule", owner: "Schedule" },
    systemImage: "calendar",
    icon: "schedule",
    defaultRoute: null,
    summary: "Your agenda by day, court and coach",
  },
  {
    key: "people",
    titles: { coach: "Students", owner: "People" },
    systemImage: "person.2",
    icon: "users",
    defaultRoute: "people",
    summary: "Players, guardians, notes and film",
  },
  {
    key: "inbox",
    titles: { coach: "Threads", owner: "Inbox" },
    systemImage: "bubble.left.and.bubble.right",
    icon: "thread",
    defaultRoute: null,
    summary: "Conversations and Ask Duna",
  },
  {
    key: "money",
    titles: { coach: "Earnings", owner: "Money" },
    systemImage: "dollarsign.circle",
    icon: "wallet",
    defaultRoute: null,
    summary: "What you have earned, collected and are owed",
  },
];

/** The tab the app opens on. */
export const INITIAL_TAB: TabKey = "today";

/** The top bar's create action (every tab, every size). */
export const NEW_ACTION = {
  key: "new",
  title: "Create",
  accessibilityLabel: "Create: a session, a payment or a check-in",
} as const;

/**
 * The audience for an organisation role. Owners, admins and managers run the
 * business; everyone else (coach, staff, unknown) sees the coach labels,
 * which is also what the preview build shows. Role capabilities are not in
 * the API yet (board: "Needs API · role capabilities").
 */
export function audienceForRole(role: string | undefined): ProAudience {
  const normalized = (role ?? "").toLowerCase();
  return /owner|admin|manager/.test(normalized) ? "owner" : "coach";
}

export function tabDefinition(tab: TabKey): TabDefinition {
  return TABS.find((candidate) => candidate.key === tab)!;
}

export function tabTitle(tab: TabKey, audience: ProAudience): string {
  return tabDefinition(tab).titles[audience];
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

export function isTabKey(value: string): value is TabKey {
  return TABS.some((tab) => tab.key === value);
}
