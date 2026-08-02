import {
  Activity,
  BadgeDollarSign,
  Bot,
  Building2,
  CalendarDays,
  CircleGauge,
  ClipboardCheck,
  CreditCard,
  DatabaseZap,
  Flag,
  FlaskConical,
  GitMerge,
  HeartHandshake,
  LayoutDashboard,
  ListChecks,
  Mail,
  MapPinned,
  MessageSquareText,
  Network,
  PackageOpen,
  ShoppingBag,
  ScrollText,
  Settings2,
  ShieldCheck,
  Trophy,
  UserRoundSearch,
  UsersRound,
  Waves,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const operatorModules = [
  { slug: "overview", label: "Overview", icon: LayoutDashboard },
  { slug: "calendar", label: "Calendar", icon: CalendarDays },
  { slug: "locations", label: "Venues", icon: MapPinned },
  { slug: "members", label: "People", icon: UsersRound },
  { slug: "team", label: "Team", icon: UserRoundSearch },
  { slug: "products", label: "Products", icon: ShoppingBag },
  { slug: "events", label: "Events", icon: Trophy },
  { slug: "leagues", label: "Leagues", icon: Network },
  { slug: "payments", label: "Money", icon: CreditCard },
  { slug: "messages", label: "Marketing", icon: MessageSquareText },
  { slug: "reports", label: "Reports", icon: CircleGauge },
  { slug: "ai", label: "Duna AI", icon: Bot },
  { slug: "settings", label: "Settings", icon: Settings2 },
] as const satisfies readonly {
  readonly slug: string;
  readonly label: string;
  readonly icon: LucideIcon;
}[];

export type OperatorModule = (typeof operatorModules)[number]["slug"];

export const adminModules = [
  { slug: "overview", label: "Network", icon: Waves },
  { slug: "organizations", label: "Organizations", icon: Building2 },
  { slug: "trust", label: "Trust + safety", icon: ShieldCheck },
  { slug: "ratings", label: "Ratings", icon: Activity },
  { slug: "sand-data", label: "Sand data", icon: DatabaseZap },
  { slug: "player-mapping", label: "Player mapping", icon: UserRoundSearch },
  { slug: "ratings-lab", label: "Ratings lab", icon: FlaskConical },
  { slug: "profile-merge", label: "Merge profiles", icon: GitMerge },
  { slug: "payments", label: "Payments", icon: BadgeDollarSign },
  { slug: "audit", label: "Audit log", icon: ScrollText },
  { slug: "flags", label: "Feature flags", icon: Flag },
  { slug: "health", label: "System health", icon: HeartHandshake },
] as const satisfies readonly {
  readonly slug: string;
  readonly label: string;
  readonly icon: LucideIcon;
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
