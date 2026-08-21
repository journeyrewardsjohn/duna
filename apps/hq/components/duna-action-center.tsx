"use client";

import { DunaActionCenter as SharedDunaActionCenter } from "@duna/ui";
import { usePathname } from "next/navigation";

const quickActions = [
  {
    label: "Create event",
    detail: "Tournament, clinic, league, open play, or pickup",
    href: "/events/create",
    kind: "create" as const,
  },
  {
    label: "Add person",
    detail: "Invite a player, member, guardian, or customer",
    href: "/members/invite",
    kind: "person" as const,
  },
  {
    label: "Send update",
    detail: "Message the right audience with review controls",
    href: "/messages",
    kind: "message" as const,
  },
  {
    label: "Open calendar",
    detail: "Run today and shape the upcoming schedule",
    href: "/calendar",
    kind: "calendar" as const,
  },
  {
    label: "Review money",
    detail: "Transactions, balances, payouts, and reconciliation",
    href: "/payments",
    kind: "money" as const,
  },
] as const;

const starters = [
  "Show me what needs attention today",
  "How is the business performing?",
  "Help me plan next week around coaches and courts",
] as const;

export function DunaActionCenter() {
  const pathname = usePathname();
  return (
    <SharedDunaActionCenter
      pathname={pathname}
      quickActions={quickActions}
      starters={starters}
      surface="hq"
    />
  );
}
