export interface SiteExperienceNavigationItem {
  readonly href: string;
  readonly label: string;
  readonly description: string;
  readonly icon:
    | "calendar"
    | "camera"
    | "court"
    | "create"
    | "health"
    | "live"
    | "market"
    | "player"
    | "rating"
    | "score"
    | "search"
    | "tour"
    | "watch";
}

export interface SiteExperienceNavigationGroup {
  readonly label: string;
  readonly description: string;
  readonly items: readonly SiteExperienceNavigationItem[];
}

export interface SiteExperienceNavigation {
  readonly id: "play" | "watch";
  readonly label: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly href: string;
  readonly actionLabel: string;
  readonly groups: readonly SiteExperienceNavigationGroup[];
  readonly featured: {
    readonly label: string;
    readonly title: string;
    readonly description: string;
    readonly href: string;
    readonly action: string;
  };
}

export const playNavigation: SiteExperienceNavigation = {
  id: "play",
  label: "Play",
  eyebrow: "Get on court",
  title: "Find the next point.",
  description:
    "Discover places and people, join what is happening, then keep the match and your progress in Duna.",
  href: "/discover",
  actionLabel: "Explore Play",
  groups: [
    {
      label: "Find your game",
      description: "See what is available around you.",
      items: [
        {
          href: "/discover",
          label: "Discover",
          description: "Games, sessions, events, and people",
          icon: "search",
        },
        {
          href: "/discover/map",
          label: "Court map",
          description: "Places to play and live availability",
          icon: "court",
        },
        {
          href: "/discover/results",
          label: "Search Duna",
          description: "Find a specific player, place, or event",
          icon: "player",
        },
      ],
    },
    {
      label: "Play and remember",
      description: "Take the match with you.",
      items: [
        {
          href: "/app/score",
          label: "Score a match",
          description: "Run the score and keep the result",
          icon: "score",
        },
        {
          href: "/app/matches",
          label: "Record a match",
          description: "Create, invite, score, and review",
          icon: "camera",
        },
        {
          href: "/app/health",
          label: "Health and load",
          description: "Keep your private player context",
          icon: "health",
        },
      ],
    },
  ],
  featured: {
    label: "Bring people together",
    title: "Create an event",
    description:
      "Open play, pickup, clinics, tournaments, and more start with a guided path.",
    href: "/create",
    action: "Start creating",
  },
};

export const watchNavigation: SiteExperienceNavigation = {
  id: "watch",
  label: "Watch",
  eyebrow: "Follow the game",
  title: "Every tour. Every signal.",
  description:
    "Move from live matches to the people, ratings, forecasts, and events that explain what happens next.",
  href: "/pro",
  actionLabel: "Explore Watch",
  groups: [
    {
      label: "Live and professional",
      description: "The world game in one view.",
      items: [
        {
          href: "/pro#latest-match-updates",
          label: "Live now",
          description: "Scores, updates, and match context",
          icon: "live",
        },
        {
          href: "/pro",
          label: "Pro events",
          description: "FIVB, AVP, schedules, and results",
          icon: "tour",
        },
        {
          href: "/pro#players",
          label: "Pro players",
          description: "Profiles, teams, form, and history",
          icon: "player",
        },
      ],
    },
    {
      label: "Understand the point",
      description: "Context beyond the final score.",
      items: [
        {
          href: "/rankings",
          label: "Sand Rating",
          description: "Duna ratings and world rankings",
          icon: "rating",
        },
        {
          href: "/methodology",
          label: "Rating methodology",
          description: "How the rating system works",
          icon: "score",
        },
        {
          href: "/app/wallet/predictions",
          label: "Prediction markets",
          description: "Free-play forecasts and positions",
          icon: "market",
        },
      ],
    },
  ],
  featured: {
    label: "The game on your wrist",
    title: "Duna for Apple Watch",
    description:
      "Score without leaving the court and carry every point back to the match timeline.",
    href: "/apps/apple-watch",
    action: "Explore the Watch app",
  },
};

export const siteExperienceNavigations = [
  playNavigation,
  watchNavigation,
] as const;
