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
  { slug: "products", label: "Products", icon: ShoppingBag, group: "Run" },
  { slug: "events", label: "Events", icon: Trophy, group: "Run" },
  { slug: "leagues", label: "Leagues", icon: Network, group: "Run" },
  {
    slug: "messages",
    label: "Messages",
    icon: MessageSquareText,
    group: "Run",
  },
  { slug: "payments", label: "Money", icon: CreditCard, group: "Grow" },
  { slug: "marketing", label: "Marketing", icon: Mail, group: "Grow" },
  { slug: "reports", label: "Reports", icon: CircleGauge, group: "Grow" },
  { slug: "ai", label: "Duna AI", icon: Bot, group: "Grow" },
  { slug: "settings", label: "Settings", icon: Settings2, group: "Configure" },
] as const satisfies readonly {
  readonly slug: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly group: string;
}[];

export type OperatorModule = (typeof operatorModules)[number]["slug"];

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
