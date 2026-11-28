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
    href: hqRoutes.schedule,
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
    href: hqRoutes.people,
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
    href: hqHref("events"),
    icon: "trophy",
    group: "People and play",
  },
  {
    slug: "offerings",
    label: "Offerings",
    href: hqRoutes.offerings,
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
