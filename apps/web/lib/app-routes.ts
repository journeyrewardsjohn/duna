/**
 * The Player web app's typed route table (work package P1). Pure data: the
 * shell's navigation, the command palette, the page titles and the tests all
 * read this one table, so nothing in the signed-in app can be left out.
 *
 * It mirrors the Player app's table (`apps/player/src/app/router.ts`): the
 * same four verbs (Find · Play · Improve · Connect), the same grouping and the
 * same words. Play's root is Home (`/app`).
 *
 * EVERY page under `app/(legacy)/app/**` and `app/(next)/(app)/app/**` has an
 * entry (`lib/app-routes.test.ts` fails otherwise). A screen package that
 * rebuilds a page moves it to `app/(next)/(app)/app/…` and flips `rebuilt` to
 * true; the shell then navigates to it without a full page load. Pages still
 * in `(legacy)` are reached with a full page load (a different document).
 */
import type { GlyphName } from "@duna/ui/icons";

export type AppVerb = "find" | "play" | "improve" | "connect";

export interface AppRoute {
  /** The address. Dynamic segments use the folder name: `/app/matches/[id]`. */
  readonly path: string;
  readonly verb: AppVerb;
  readonly title: string;
  /** One line under the title in menus and the command palette. */
  readonly summary: string;
  readonly icon: GlyphName;
  /** On the design system in `app/(next)/(app)`. False: still in `(legacy)`. */
  readonly rebuilt: boolean;
  /** Shown in the navigation (false for pages reached only from elsewhere). */
  readonly listed: boolean;
  /** Only an adult may use it (the API's `adultProcedure`); juniors never see it. */
  readonly adultOnly?: boolean;
  /** Outside `/app` (a public page the app links to); not a page of the app. */
  readonly external?: boolean;
}

function route(
  path: string,
  verb: AppVerb,
  title: string,
  icon: GlyphName,
  summary: string,
  options: Partial<
    Pick<AppRoute, "rebuilt" | "listed" | "adultOnly" | "external">
  > = {},
): AppRoute {
  return {
    path,
    verb,
    title,
    icon,
    summary,
    rebuilt: options.rebuilt ?? false,
    listed: options.listed ?? true,
    ...(options.adultOnly ? { adultOnly: true } : {}),
    ...(options.external ? { external: true } : {}),
  };
}

export const APP_ROUTES = {
  // Find: courts, clubs, matches, events and coaches. The search lives on the
  // public site; the old /app/discover addresses redirect there (proxy.ts).
  search: route(
    "/discover",
    "find",
    "Search",
    "find",
    "Courts, clubs, matches and events near you",
    { external: true },
  ),
  coaches: route(
    "/coaches",
    "find",
    "Coaches",
    "coach",
    "Lessons, clinics and coaches to book",
    { external: true },
  ),
  discover: route(
    "/app/discover",
    "find",
    "Search",
    "find",
    "Moved to Search",
    { listed: false },
  ),
  discoverMap: route(
    "/app/discover/map",
    "find",
    "Map",
    "map",
    "Moved to Search",
    { listed: false },
  ),
  discoverResults: route(
    "/app/discover/results",
    "find",
    "Results",
    "find",
    "Moved to Search",
    { listed: false },
  ),
  venue: route(
    "/app/venues/[venueId]",
    "find",
    "Venue",
    "venue",
    "Courts and open times at a venue",
    { listed: false },
  ),

  // Play: Home is the root; plans, results and hosting live here.
  home: route("/app", "play", "Home", "home", "Next up, your week and clubs", {
    rebuilt: true,
  }),
  plans: route(
    "/app/play",
    "play",
    "Plans",
    "schedule",
    "Your bookings, matches and calendar",
  ),
  score: route(
    "/app/score",
    "play",
    "Add a result",
    "trophy",
    "Your opponents confirm it",
  ),
  hostPickup: route(
    "/app/pickup/new",
    "play",
    "Host a pickup",
    "users",
    "Set the time and invite players",
    { adultOnly: true },
  ),
  editPickup: route(
    "/app/pickup/[slug]/edit",
    "play",
    "Edit pickup",
    "users",
    "Change a pickup you host",
    { listed: false, adultOnly: true },
  ),
  checkout: route(
    "/app/checkout/[slug]",
    "play",
    "Checkout",
    "pay",
    "Join a session or event",
    { listed: false },
  ),
  bookingInvite: route(
    "/app/booking-invite/[inviteToken]",
    "play",
    "Booking invite",
    "user-plus",
    "A court booking you were invited to",
    { listed: false },
  ),

  // Improve: rating and results, film, health and the player profile.
  performance: route(
    "/app/matches",
    "improve",
    "Sand Rating and results",
    "rating",
    "Your rating, form and recent matches",
  ),
  match: route(
    "/app/matches/[id]",
    "improve",
    "Match",
    "score",
    "One match, set by set",
    { listed: false },
  ),
  video: route(
    "/app/video",
    "improve",
    "Film",
    "film",
    "Record, review and share your games",
  ),
  videoDetail: route(
    "/app/video/[videoId]",
    "improve",
    "Film",
    "film",
    "One recording",
    { listed: false },
  ),
  health: route(
    "/app/health",
    "improve",
    "Health",
    "heart-rate",
    "Readiness, sleep and match-day trends",
  ),
  profile: route(
    "/app/profile",
    "improve",
    "Profile",
    "player",
    "Your details, artwork and privacy",
  ),

  // Connect: messages, wallet and the account.
  messages: route(
    "/app/messages",
    "connect",
    "Messages",
    "message",
    "Clubs, coaches and the people you play with",
  ),
  messagesConnect: route(
    "/app/messages/connect",
    "connect",
    "Connect a channel",
    "phone-bubble",
    "Text and email for your messages",
    { listed: false },
  ),
  wallet: route(
    "/app/wallet",
    "connect",
    "Wallet",
    "wallet",
    "Passes, memberships and credits",
    { rebuilt: true },
  ),
  predictions: route(
    "/app/wallet/predictions",
    "connect",
    "Predictions",
    "podium",
    "Your picks on pro events",
    { listed: false, adultOnly: true },
  ),
  settings: route(
    "/app/settings",
    "connect",
    "Account",
    "you",
    "Profile, household, clubs, sign-in and appearance",
  ),
  onboarding: route(
    "/app/onboarding",
    "connect",
    "Set up your profile",
    "player",
    "Who you are and how you play",
    { listed: false },
  ),
  teamClaim: route(
    "/app/team/claim/[token]",
    "connect",
    "Join a team",
    "users",
    "A team entry you were invited to",
    { listed: false },
  ),
} as const satisfies Record<string, AppRoute>;

export type AppRouteKey = keyof typeof APP_ROUTES;

export interface AppVerbDefinition {
  readonly key: AppVerb;
  readonly title: string;
  readonly icon: GlyphName;
  /** Where the verb itself goes. */
  readonly root: AppRouteKey;
  readonly summary: string;
}

/** Navigation order on every size (the create action sits between Play and Improve on phones). */
export const APP_VERBS: readonly AppVerbDefinition[] = [
  {
    key: "find",
    title: "Find",
    icon: "find",
    root: "search",
    summary: "Courts, clubs, matches, events and coaches",
  },
  {
    key: "play",
    title: "Play",
    icon: "play",
    root: "home",
    summary: "Next up, your plans and results",
  },
  {
    key: "improve",
    title: "Improve",
    icon: "improve",
    root: "performance",
    summary: "Sand Rating, film, health and your profile",
  },
  {
    key: "connect",
    title: "Connect",
    icon: "connect",
    root: "messages",
    summary: "Messages, wallet and your account",
  },
];

/**
 * The create action ("New"): every way to start something, in the Player
 * app's order (`apps/player/src/app/NewSheet.tsx`), each pointing at the page
 * that does it today.
 */
export const NEW_ACTIONS: readonly {
  readonly key: string;
  readonly title: string;
  readonly summary: string;
  readonly icon: GlyphName;
  readonly href: string;
  readonly adultOnly?: boolean;
}[] = [
  {
    key: "book-court",
    title: "Book a court",
    summary: "Open times across your beaches and clubs",
    icon: "court",
    href: APP_ROUTES.plans.path,
  },
  {
    key: "find-coach",
    title: "Book a lesson",
    summary: "Choose a format and a coach",
    icon: "lesson",
    href: APP_ROUTES.coaches.path,
  },
  {
    key: "find-match",
    title: "Find a match",
    summary: "Open matches at your level",
    icon: "ball",
    href: APP_ROUTES.search.path,
  },
  {
    key: "host-pickup",
    title: "Host a pickup",
    summary: "Set the time and invite players",
    icon: "users",
    href: APP_ROUTES.hostPickup.path,
    adultOnly: true,
  },
  {
    key: "add-result",
    title: "Add a result",
    summary: "Your opponents confirm it",
    icon: "trophy",
    href: APP_ROUTES.score.path,
  },
  {
    key: "record-video",
    title: "Record a game",
    summary: "Film with Duna Vision and keep score",
    icon: "film",
    href: APP_ROUTES.video.path,
  },
];

export function appRoute(key: AppRouteKey): AppRoute {
  return APP_ROUTES[key];
}

/** True for a pattern with a `[segment]`: reached from its parent, never linked bare. */
export function isDynamicRoute(route: AppRoute): boolean {
  return route.path.includes("[");
}

/** The routes a verb lists in the navigation, in table order. */
export function routesForVerb(
  verb: AppVerb,
  options: { readonly junior?: boolean } = {},
): readonly AppRoute[] {
  return Object.values(APP_ROUTES as Record<string, AppRoute>).filter(
    (candidate) =>
      candidate.verb === verb &&
      candidate.listed &&
      !(options.junior && candidate.adultOnly),
  );
}

function matches(pattern: string, pathname: string): boolean {
  const source = pattern
    .split("/")
    .map((segment) =>
      segment.startsWith("[")
        ? "[^/]+"
        : segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    )
    .join("/");
  return new RegExp(`^${source}/?$`).test(pathname);
}

/** The table entry for an address, or undefined when the app has no such page. */
export function routeForPath(pathname: string): AppRoute | undefined {
  const all = Object.values(APP_ROUTES as Record<string, AppRoute>);
  return (
    all.find((candidate) => candidate.path === pathname) ??
    all.find((candidate) => matches(candidate.path, pathname))
  );
}

/** The verb an address belongs to (Play for anything unknown under /app). */
export function verbForPath(pathname: string): AppVerb {
  return routeForPath(pathname)?.verb ?? "play";
}

/**
 * Whether the shell can move to an address without a full page load: only
 * pages rebuilt in `app/(next)/(app)` share its document.
 */
export function isShellRoute(pathname: string): boolean {
  return routeForPath(pathname)?.rebuilt === true;
}

/** The sign-in address that returns the person to where they were. */
export function signInHref(returnTo: string): string {
  const safe =
    returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/app";
  return `/sign-in?returnTo=${encodeURIComponent(safe)}`;
}

/** The sign-up address that returns the person to where they were. */
export function signUpHref(returnTo: string): string {
  const safe =
    returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/app";
  return `/sign-up?returnTo=${encodeURIComponent(safe)}`;
}
