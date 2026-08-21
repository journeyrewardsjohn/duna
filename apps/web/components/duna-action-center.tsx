"use client";

import { DunaActionCenter as SharedDunaActionCenter } from "@duna/ui";
import { usePathname } from "next/navigation";

const quickActions = [
  {
    label: "Find play",
    detail: "Search nearby matches, events, clubs, and coaches",
    href: "/discover",
    kind: "play" as const,
  },
  {
    label: "Book a court",
    detail: "See live venue and court availability",
    href: "/app/play",
    kind: "calendar" as const,
  },
  {
    label: "Host pickup",
    detail: "Choose the time and invite the right players",
    href: "/app/pickup/new",
    kind: "create" as const,
  },
  {
    label: "Record a match",
    detail: "Add a result or keep score live",
    href: "/app/score",
    kind: "score" as const,
  },
  {
    label: "Message someone",
    detail: "Open your Duna conversations",
    href: "/app/messages",
    kind: "message" as const,
  },
] as const;

const starters = [
  "Find events that fit my schedule",
  "What should I know before my next booking?",
  "Why did my rating move?",
] as const;

export function DunaActionCenter() {
  const pathname = usePathname();
  return (
    <SharedDunaActionCenter
      pathname={pathname}
      quickActions={quickActions}
      starters={starters}
      surface="player"
    />
  );
}
