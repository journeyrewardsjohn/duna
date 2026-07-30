import {
  Activity,
  BadgeDollarSign,
  Bot,
  Building2,
  CalendarDays,
  CircleGauge,
  ClipboardCheck,
  CreditCard,
  Flag,
  HeartHandshake,
  LayoutDashboard,
  ListChecks,
  Mail,
  MessageSquareText,
  Network,
  PackageOpen,
  ScrollText,
  Settings2,
  ShieldCheck,
  Trophy,
  UsersRound,
  Waves,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const operatorModules = [
  { slug: "overview", label: "Overview", icon: LayoutDashboard },
  { slug: "calendar", label: "Calendar", icon: CalendarDays },
  { slug: "members", label: "People", icon: UsersRound },
  { slug: "programs", label: "Programs", icon: PackageOpen },
  { slug: "events", label: "Events", icon: Trophy },
  { slug: "leagues", label: "Leagues", icon: Network },
  { slug: "payments", label: "Money", icon: CreditCard },
  { slug: "messages", label: "Messages", icon: MessageSquareText },
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
  { label: "Create event", icon: Trophy },
  { label: "Send update", icon: Mail },
  { label: "Run check-in", icon: ClipboardCheck },
  { label: "Reconcile", icon: ListChecks },
] as const;
