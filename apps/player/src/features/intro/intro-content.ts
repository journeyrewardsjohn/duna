/**
 * What each section of the Player is for, as a short intro (owner feedback
 * 28 Nov, point 6: "intro pages with beautiful animations that describe all
 * of the things in new sections ... easy to exit and return to"). Pure data
 * and rules, no React Native: the shell, the profile's "What's in Duna" and
 * the tests read the same table.
 *
 * Copy describes what the app does today. No people, prices or claims.
 */
import type { RouteKey, TabKey } from "../../app/router";

export type IntroKey = "find" | "play" | "rating" | "wallet" | "profile";

/** The brand ground an intro sits on (never Solar: Solar is live only). */
export type IntroGround = "night-court" | "tidewater" | "hardwood" | "dune";

export interface IntroPoint {
  readonly title: string;
  readonly body: string;
}

export interface Intro {
  readonly key: IntroKey;
  /** One Jost title: no numerals. */
  readonly title: string;
  /** Under the title: what the section is for, in one sentence. */
  readonly lead: string;
  readonly points: readonly [IntroPoint, IntroPoint, IntroPoint];
  readonly ground: IntroGround;
  /** The tour's link to the section ("Open Plans"). */
  readonly goLabel: string;
  /** Where that link goes. */
  readonly destination: { readonly route: RouteKey } | { readonly tab: TabKey };
}

export const INTROS: readonly Intro[] = [
  {
    key: "find",
    goLabel: "Open Find",
    title: "Find your next game",
    lead: "Courts, clubs, open matches, events and coaches near you, in one search.",
    points: [
      {
        title: "Where, when, what",
        body: "Pick a place and a time; results show as a list and on the map.",
      },
      {
        title: "Book in one flow",
        body: "Choose a court time once and carry it straight through checkout.",
      },
      {
        title: "Join others",
        body: "Open matches, clinics and events sit beside courts in the same results.",
      },
    ],
    ground: "tidewater",
    destination: { tab: "find" },
  },
  {
    key: "play",
    goLabel: "Open Plans",
    title: "Your games, kept",
    lead: "Plans, matches and scores live under Play, with your next game first.",
    points: [
      {
        title: "Plans",
        body: "Bookings, matches and your calendar, in the order they happen.",
      },
      {
        title: "Keep score",
        body: "Score point by point on your phone or your watch.",
      },
      {
        title: "Results",
        body: "Add a result and your opponents confirm it before it counts.",
      },
    ],
    ground: "night-court",
    destination: { route: "plans" },
  },
  {
    key: "rating",
    goLabel: "Open Sand Rating",
    title: "Your Sand Rating",
    lead: "One number for your level, built from confirmed results.",
    points: [
      {
        title: "What counts",
        body: "Results your opponents confirm are the ones that move it.",
      },
      {
        title: "Recent form",
        body: "See the matches behind each change and how it moved.",
      },
      {
        title: "In depth",
        body: "Form, partners and upsets across every rated match.",
      },
    ],
    ground: "hardwood",
    destination: { route: "performance" },
  },
  {
    key: "wallet",
    goLabel: "Open Wallet",
    title: "Wallet and memberships",
    lead: "Club cards, your member pass, credits and your balance together.",
    points: [
      {
        title: "Club cards",
        body: "Each club you belong to has its own card and pass.",
      },
      {
        title: "Credits and balance",
        body: "See what you can spend before you book.",
      },
      {
        title: "Memberships",
        body: "Pause, resume or cancel from your profile.",
      },
    ],
    ground: "dune",
    destination: { route: "wallet" },
  },
  {
    key: "profile",
    goLabel: "Open Profile",
    title: "Your profile",
    lead: "Who you are on Duna, and every setting, in a few clear sections.",
    points: [
      {
        title: "Your game",
        body: "Sand Rating, film, health and training in one place.",
      },
      {
        title: "Money and clubs",
        body: "Wallet, memberships, billing and your organisations.",
      },
      {
        title: "Settings and privacy",
        body: "Notifications, data use, privacy and your account.",
      },
    ],
    ground: "night-court",
    destination: { route: "you" },
  },
];

export function introFor(key: IntroKey): Intro {
  return INTROS.find((intro) => intro.key === key)!;
}

export function isIntroKey(
  value: string | null | undefined,
): value is IntroKey {
  return INTROS.some((intro) => intro.key === value);
}

/**
 * The intro a place in the shell introduces, if any. Pure; unit-tested.
 * `route` is the route on show (null for a tab's root).
 */
export function introForLocation(
  tab: TabKey,
  route: RouteKey | null,
): IntroKey | null {
  if (route === null) return tab === "find" ? "find" : null;
  switch (route) {
    case "discover":
      return "find";
    case "plans":
    case "score":
    case "result":
      return "play";
    case "performance":
      return "rating";
    case "wallet":
      return "wallet";
    case "you":
      return "profile";
    default:
      return null;
  }
}

/** Which intro to show now: the place's intro, unless it was seen. Pure. */
export function introToShow(
  candidate: IntroKey | null,
  seen: ReadonlySet<IntroKey>,
): IntroKey | null {
  return candidate && !seen.has(candidate) ? candidate : null;
}

/** Parses what the store holds; anything unexpected is dropped. Pure. */
export function parseSeen(raw: string | null): Set<IntroKey> {
  if (!raw) return new Set();
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return new Set();
    return new Set(value.filter((item): item is IntroKey => isIntroKey(item)));
  } catch {
    return new Set();
  }
}
