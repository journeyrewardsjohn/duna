import {
  type LucideIcon,
  House,
  CalendarDays,
  Plus,
  Ellipsis,
} from "lucide-react-native";

export type Tab = "today" | "calendar" | "people" | "more";

export type NavDestination = Tab | "ai" | "create";

export const tabs: readonly {
  key: NavDestination;
  label: string;
  icon?: LucideIcon;
}[] = [
  { key: "today", label: "Today", icon: House },
  { key: "calendar", label: "Calendar", icon: CalendarDays },
  { key: "ai", label: "Duna AI" },
  { key: "create", label: "Create", icon: Plus },
  { key: "more", label: "More", icon: Ellipsis },
];
