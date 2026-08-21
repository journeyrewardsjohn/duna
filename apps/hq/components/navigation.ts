import {
  Activity,
  BadgeDollarSign,
  Bot,
  BrainCircuit,
  Building2,
  CalendarDays,
  CircleGauge,
  ClipboardCheck,
  Coins,
  CreditCard,
  DatabaseZap,
  Dumbbell,
  Flag,
  FlaskConical,
  HeartHandshake,
  Headphones,
  LayoutDashboard,
  ListChecks,
  Mail,
  MapPinned,
  MessageSquareText,
  Network,
  PackageOpen,
  Radio,
  ShoppingBag,
  ScrollText,
  Settings2,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Trophy,
  UserRoundSearch,
  UsersRound,
  Waves,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const operatorModules = [
  {
    slug: "overview",
    label: "Overview",
    icon: LayoutDashboard,
    group: "Today",
  },
  { slug: "calendar", label: "Calendar", icon: CalendarDays, group: "Today" },
  { slug: "locations", label: "Venues", icon: MapPinned, group: "Run" },
  { slug: "members", label: "People", icon: UsersRound, group: "Run" },
  { slug: "team", label: "Team", icon: UserRoundSearch, group: "Run" },
  { slug: "training", label: "Training", icon: Dumbbell, group: "Run" },
  { slug: "products", label: "Products", icon: ShoppingBag, group: "Run" },
  { slug: "events", label: "Events", icon: Trophy, group: "Run" },
  {
    slug: "leagues",
    label: "Leagues",
    icon: Network,
    group: "Run",
    hiddenFromNavigation: true,
  },
  {
    slug: "messages",
    label: "Messages",
    icon: MessageSquareText,
    group: "Run",
  },
  { slug: "payments", label: "Money", icon: CreditCard, group: "Grow" },
  { slug: "marketing", label: "Marketing", icon: Mail, group: "Grow" },
  { slug: "reports", label: "Reports", icon: CircleGauge, group: "Grow" },
  {
    slug: "ai",
    label: "Duna AI",
    icon: Bot,
    group: "Grow",
    hiddenFromNavigation: true,
  },
  { slug: "settings", label: "Settings", icon: Settings2, group: "Configure" },
] as const satisfies readonly {
  readonly slug: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly group: string;
  readonly hiddenFromNavigation?: boolean;
}[];

export type OperatorModule = (typeof operatorModules)[number]["slug"];

export const productNavigationItems = [
  { slug: "all-products", label: "All products", href: "/products" },
  {
    slug: "services",
    label: "Services",
    href: "/products/types/services",
    productType: "service",
    title: "Services",
    description: "Lessons, coaching, programs, and bookable services.",
  },
  {
    slug: "plans",
    label: "Memberships + packs",
    href: "/products/types/plans",
    productType: "plan",
    title: "Memberships + packs",
    description: "Memberships, credit packs, and recurring offers.",
  },
  {
    slug: "goods",
    label: "Goods + equipment",
    href: "/products/types/goods",
    productType: "good",
    title: "Goods + equipment",
    description: "Inventory-backed goods, rentals, and equipment.",
  },
] as const;

export type ProductNavigationItem = (typeof productNavigationItems)[number];
export type ProductNavigationSlug = ProductNavigationItem["slug"];

export const eventNavigationItems = [
  { slug: "all-events", label: "All events", href: "/events" },
  {
    slug: "tournaments",
    label: "Tournaments",
    href: "/events/types/tournaments",
    eventKinds: ["tournament"],
    title: "Tournaments",
    description:
      "Brackets, divisions, registrations, and event-day operations.",
  },
  {
    slug: "clinics",
    label: "Clinics",
    href: "/events/types/clinics",
    eventKinds: ["clinic"],
    title: "Clinics",
    description:
      "Skill-building sessions, rosters, and coach-ready operations.",
  },
  {
    slug: "open-play",
    label: "Open play",
    href: "/events/types/open-play",
    eventKinds: ["open-play"],
    title: "Open play",
    description:
      "Flexible sessions, attendance, and player-facing availability.",
  },
  {
    slug: "pickup",
    label: "Pickup",
    href: "/events/types/pickup",
    eventKinds: ["pickup"],
    title: "Pickup",
    description:
      "Community pickup sessions and their live participant operations.",
  },
  {
    slug: "leagues",
    label: "Leagues",
    href: "/leagues",
    eventKinds: ["league"],
    title: "Leagues",
    description:
      "Seasonal schedules, standings, scoring, and league operations.",
  },
] as const;

export type EventNavigationItem = (typeof eventNavigationItems)[number];
export type EventNavigationSlug = EventNavigationItem["slug"];

export type OperatorNavigationChild =
  ProductNavigationItem | EventNavigationItem;

export const operatorNavigationChildren: Partial<
  Record<OperatorModule, readonly OperatorNavigationChild[]>
> = {
  products: productNavigationItems,
  events: eventNavigationItems,
};

export const adminModules = [
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

export const quickActions = [
  { label: "New session", icon: CalendarDays },
  { label: "Add person", icon: UsersRound },
  { label: "Create product", icon: PackageOpen },
  { label: "Send update", icon: Mail },
  { label: "Run check-in", icon: ClipboardCheck },
  { label: "Reconcile", icon: ListChecks },
] as const;
