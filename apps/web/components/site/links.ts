import { DUNA_HQ_SIGNUP_URL, DUNA_HQ_URL } from "@/lib/site-urls";

/**
 * Where the public site's links go today. Pages that later packages build
 * (docs/design/website.md section 8) point at the closest live page until
 * they exist; change the address here when it ships.
 */
export const siteLinks = {
  home: "/",
  findGame: "/discover",
  /** The find-a-game page reads Where · When · What from its address. */
  searchResults: "/discover",
  /** Add a score and where you played, no account needed (SITE-3). */
  addScore: "/add-score",
  forClubs: "/run-your-club",
  /** Duna Pro for coaches (the index above `/coaches/[handle]` profiles). */
  forCoaches: "/coaches",
  proTour: "/pro",
  pricing: "/pricing",
  /** What the rating is and how it moves (absorbs `/methodology`). */
  sandRating: "/sand-rating",
  ratingMethod: "/sand-rating#method",
  rankings: "/rankings",
  events: "/discover",
  about: "/about",
  safety: "/safety",
  apps: "/apps",
  appleWatch: "/apps#watch",
  /**
   * A conversation with a person. There is no sales form backend: the
   * support address already published in the legal documents.
   */
  talkToUs:
    "mailto:support@duna.coach?subject=" +
    encodeURIComponent("Running my club on Duna"),
  signIn: "/sign-in",
  signUp: "/sign-up",
  app: "/app",
  /** Duna Premium is bought from the player's settings (signed in). */
  premium: "/app/settings#membership",
  startClub: DUNA_HQ_SIGNUP_URL,
} as const;

/**
 * Pages still served by the `(legacy)` root layout. Navigating to one from a
 * rebuilt page is a full page load, so `SiteLink` never prefetches them (a
 * prefetch would only download the legacy stylesheet). Remove an entry when
 * its page moves into `app/(next)`.
 */
const crossDocumentPrefixes = [
  "/about",
  "/rankings",
  "/safety",
  "/sign-in",
  "/sign-up",
] as const;

/** Whether `href` leaves the rebuilt site's document for a `(legacy)` page. */
export function isCrossDocumentPath(href: string): boolean {
  const path = href.split(/[?#]/)[0] ?? "";
  return crossDocumentPrefixes.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

/** The header's page links, in the spec's order (section 3.1). */
export const siteNavigation = [
  { label: "Find a game", href: siteLinks.findGame },
  { label: "Add a score", href: siteLinks.addScore },
  { label: "For clubs", href: siteLinks.forClubs },
  { label: "For coaches", href: siteLinks.forCoaches },
  { label: "Pro Tour", href: siteLinks.proTour },
  { label: "Pricing", href: siteLinks.pricing },
] as const;

/**
 * Sign-up for a club plan: HQ's sign-up, returning to HQ setup with the
 * plan and billing period chosen here (the same hand-off the old clubs page
 * used, so onboarding keeps reading it).
 */
export function clubSignupHref(
  planId: string,
  interval: "month" | "year" = "month",
  source = "website",
): string {
  const returnTo = `/setup/start?plan=${planId}&interval=${interval}&source=${source}`;
  return `${DUNA_HQ_URL}/sign-up?returnTo=${encodeURIComponent(returnTo)}`;
}
