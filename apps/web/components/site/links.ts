import { DUNA_HQ_SIGNUP_URL } from "@/lib/site-urls";

/**
 * Where the public site's links go today. Pages that later packages build
 * (docs/design/website.md section 8) point at the closest live page until
 * they exist; change the address here when the page ships.
 */
export const siteLinks = {
  home: "/",
  findGame: "/discover",
  /** The discovery page that reads Where · When · What from its address. */
  searchResults: "/discover/results",
  /**
   * Add a score. `/add-score` (no account needed) is SITE-4; until then this
   * is the signed-in score entry.
   */
  addScore: "/app/score",
  forClubs: "/run-your-club",
  /** `/coaches` (Duna Pro) is SITE-6; until then the clubs and coaches page. */
  forCoaches: "/run-your-club",
  proTour: "/pro",
  /** `/pricing` is SITE-7; until then the plans on the clubs page. */
  pricing: "/run-your-club#plans",
  /** `/sand-rating` is SITE-9 (absorbs `/methodology`). */
  sandRating: "/methodology",
  rankings: "/rankings",
  events: "/discover",
  about: "/about",
  safety: "/safety",
  appleWatch: "/apps/apple-watch",
  signIn: "/sign-in",
  signUp: "/sign-up",
  app: "/app",
  startClub: DUNA_HQ_SIGNUP_URL,
} as const;

/** The header's page links, in the spec's order (section 3.1). */
export const siteNavigation = [
  { label: "Find a game", href: siteLinks.findGame },
  { label: "Add a score", href: siteLinks.addScore },
  { label: "For clubs", href: siteLinks.forClubs },
  { label: "For coaches", href: siteLinks.forCoaches },
  { label: "Pro Tour", href: siteLinks.proTour },
  { label: "Pricing", href: siteLinks.pricing },
] as const;
