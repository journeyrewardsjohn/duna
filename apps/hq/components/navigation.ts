import {
  Activity,
  BadgeDollarSign,
  Bot,
  BrainCircuit,
  Building2,
  Coins,
  DatabaseZap,
  Flag,
  FlaskConical,
  HeartHandshake,
  Headphones,
  Radio,
  ScrollText,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Trophy,
  UserRoundSearch,
  UsersRound,
  Waves,
} from "lucide-react";
import {
  hqHref,
  hqLeaguesPath,
  hqModuleHref,
  hqRoutes,
} from "@duna/core/hq-routes";
import type { IconName } from "@duna/ui/icons";
import type { LucideIcon } from "lucide-react";

/**
 * The operator sidebar, in the order of docs/design/tideline-4.1.1/ia-hq.md.
 * Groups are separated by hairlines; there is no "More tools" entry and no
 * sidebar children. Every address comes from `@duna/core/hq-routes`.
 */
export const operatorNavigationGroups = [
  "Run the day",
  "People and play",
  "Money and setup",
  "Grow",
] as const;
export type OperatorNavigationGroup = (typeof operatorNavigationGroups)[number];

export const operatorModules = [
  {
    slug: "today",
    label: "Today",
    href: hqRoutes.home,
    icon: "home",
    group: "Run the day",
  },
  {
    slug: "schedule",
    label: "Schedule",
    href: hqModuleHref("schedule"),
    icon: "schedule",
    group: "Run the day",
  },
  {
    slug: "inbox",
    label: "Inbox",
    href: hqRoutes.inbox,
    icon: "message",
    group: "Run the day",
  },
  {
    slug: "people",
    label: "People",
    href: hqModuleHref("people"),
    icon: "users",
    group: "People and play",
  },
  {
    slug: "team",
    label: "Team",
    href: hqRoutes.team,
    icon: "partner",
    group: "People and play",
  },
  {
    slug: "training",
    label: "Training",
    href: hqRoutes.training,
    icon: "coach",
    group: "People and play",
  },
  {
    slug: "events",
    label: "Events",
    href: hqModuleHref("events"),
    icon: "trophy",
    group: "People and play",
  },
  {
    slug: "offerings",
    label: "Offerings",
    href: hqModuleHref("offerings"),
    icon: "pass",
    group: "People and play",
  },
  {
    slug: "money",
    label: "Money",
    href: hqRoutes.money,
    icon: "pay",
    group: "Money and setup",
  },
  {
    slug: "setup",
    label: "Club setup",
    href: hqRoutes.setup,
    icon: "venue",
    group: "Money and setup",
  },
  {
    slug: "website",
    label: "Website",
    href: hqRoutes.website,
    icon: "connect",
    group: "Grow",
  },
  {
    slug: "marketing",
    label: "Marketing",
    href: hqModuleHref("marketing"),
    icon: "send",
    group: "Grow",
  },
  {
    slug: "reports",
    label: "Reports",
    href: hqModuleHref("reports"),
    icon: "signal-line",
    group: "Grow",
  },
  // Not sidebar items: Ask Duna lives in the shell, Settings in the account
  // menu. Pages under them still name an area for the shell and Ask Duna.
  {
    slug: "ask",
    label: "Ask Duna",
    href: hqHref("ask"),
    icon: "find",
    group: "Shell",
    hiddenFromNavigation: true,
  },
  {
    slug: "settings",
    label: "Settings",
    href: hqRoutes.settings,
    icon: "key",
    group: "Shell",
    hiddenFromNavigation: true,
  },
] as const satisfies readonly {
  readonly slug: string;
  readonly label: string;
  readonly href: string;
  readonly icon: IconName;
  readonly group: OperatorNavigationGroup | "Shell";
  readonly hiddenFromNavigation?: boolean;
}[];

export type OperatorModule = (typeof operatorModules)[number]["slug"];

/** The sidebar items, in order (hidden areas excluded). */
export const operatorNavigationItems = operatorModules.filter(
  (item) => !("hiddenFromNavigation" in item && item.hiddenFromNavigation),
);

export function operatorModuleHref(module: OperatorModule): string {
  return operatorModules.find((item) => item.slug === module)?.href ?? "/";
}

/**
 * Work surfaces that are not sidebar areas of their own: the venues panel
 * lives under Club setup and leagues are an event type.
 */
export type OperatorPanel = OperatorModule | "places" | "leagues";

/** The sidebar area a panel belongs to. */
export function operatorPanelArea(panel: OperatorPanel): OperatorModule {
  if (panel === "places") return "setup";
  if (panel === "leagues") return "events";
  return panel;
}

/** The address of a panel's list page. */
export function operatorPanelHref(panel: OperatorPanel): string {
  if (panel === "places") return hqRoutes.places;
  if (panel === "leagues") return hqLeaguesPath;
  return operatorModuleHref(panel);
}

/**
 * Offering types, shown as links inside the Offerings list page until H9
 * turns them into in-page filters.
 */
export const productNavigationItems = [
  {
    slug: "all-products",
    label: "All offerings",
    href: hqModuleHref("offerings"),
  },
  {
    slug: "services",
    label: "Services",
    href: hqHref("offeringType", { productType: "services" }),
    productType: "service",
    title: "Services",
    description: "Lessons, coaching, programs, and bookable services.",
  },
  {
    slug: "plans",
    label: "Memberships + packs",
    href: hqHref("offeringType", { productType: "plans" }),
    productType: "plan",
    title: "Memberships + packs",
    description: "Memberships, credit packs, and recurring offers.",
  },
  {
    slug: "goods",
    label: "Goods + equipment",
    href: hqHref("offeringType", { productType: "goods" }),
    productType: "good",
    title: "Goods + equipment",
    description: "Inventory-backed goods, rentals, and equipment.",
  },
] as const;

export type ProductNavigationItem = (typeof productNavigationItems)[number];
export type ProductNavigationSlug = ProductNavigationItem["slug"];

/**
 * Event types, shown as links inside the Events list page until H9 turns them
 * into in-page filters. A league is an event type (`/events?type=league`).
 */
export const eventNavigationItems = [
  { slug: "all-events", label: "All events", href: hqModuleHref("events") },
  {
    slug: "tournaments",
    label: "Tournaments",
    href: hqHref("eventType", { eventType: "tournaments" }),
    eventKinds: ["tournament"],
    title: "Tournaments",
    description:
      "Brackets, divisions, registrations, and event-day operations.",
  },
  {
    slug: "clinics",
    label: "Clinics",
    href: hqHref("eventType", { eventType: "clinics" }),
    eventKinds: ["clinic"],
    title: "Clinics",
    description:
      "Skill-building sessions, rosters, and coach-ready operations.",
  },
  {
    slug: "open-play",
    label: "Open play",
    href: hqHref("eventType", { eventType: "open-play" }),
    eventKinds: ["open-play"],
    title: "Open play",
    description:
      "Flexible sessions, attendance, and player-facing availability.",
  },
  {
    slug: "pickup",
    label: "Pickup",
    href: hqHref("eventType", { eventType: "pickup" }),
    eventKinds: ["pickup"],
    title: "Pickup",
    description:
      "Community pickup sessions and their live participant operations.",
  },
  {
    slug: "leagues",
    label: "Leagues",
    href: hqLeaguesPath,
    eventKinds: ["league"],
    title: "Leagues",
    description:
      "Seasonal schedules, standings, scoring, and league operations.",
  },
] as const;

export type EventNavigationItem = (typeof eventNavigationItems)[number];
export type EventNavigationSlug = EventNavigationItem["slug"];

export const adminModules = [
  { slug: "ask-duna", label: "Ask Duna", icon: Bot, group: "Platform" },
  { slug: "overview", label: "Network", icon: Waves, group: "Network" },
  {
    slug: "organizations",
    label: "Organizations",
    icon: Building2,
    group: "Network",
  },
  {
    slug: "people",
    label: "People",
    icon: UsersRound,
    group: "Network",
  },
  {
    slug: "trust",
    label: "Trust + safety",
    icon: ShieldCheck,
    group: "Integrity",
  },
  {
    slug: "support",
    label: "Duna Support",
    icon: Headphones,
    group: "Integrity",
  },
  {
    slug: "messaging-safety",
    label: "Message safety",
    icon: ShieldAlert,
    group: "Integrity",
  },
  { slug: "ratings", label: "Ratings", icon: Activity, group: "Integrity" },
  {
    slug: "sand-data",
    label: "Sand data",
    icon: DatabaseZap,
    group: "Integrity",
  },
  { slug: "pro-tour", label: "Pro tour", icon: Trophy, group: "Integrity" },
  {
    slug: "player-intelligence",
    label: "Player profiles",
    icon: Sparkles,
    group: "Integrity",
  },
  {
    slug: "player-mapping",
    label: "Player mapping",
    icon: UserRoundSearch,
    group: "Integrity",
  },
  {
    slug: "ratings-lab",
    label: "Ratings lab",
    icon: FlaskConical,
    group: "Integrity",
  },
  {
    slug: "predictions",
    label: "Predictions",
    icon: Coins,
    group: "Integrity",
  },
  {
    slug: "payments",
    label: "Payments",
    icon: BadgeDollarSign,
    group: "Platform",
  },
  { slug: "video", label: "Video + Premium", icon: Radio, group: "Platform" },
  {
    slug: "vision",
    label: "Vision models",
    icon: BrainCircuit,
    group: "Platform",
  },
  { slug: "audit", label: "Audit log", icon: ScrollText, group: "Platform" },
  { slug: "flags", label: "Feature flags", icon: Flag, group: "Platform" },
  {
    slug: "health",
    label: "System health",
    icon: HeartHandshake,
    group: "Platform",
  },
] as const satisfies readonly {
  readonly slug: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly group: string;
}[];

export type AdminModule = (typeof adminModules)[number]["slug"];
