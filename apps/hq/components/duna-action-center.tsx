"use client";

import { DunaActionCenter as SharedDunaActionCenter } from "@duna/ui";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";

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
  "What is missing from our organization setup?",
  "Show me what needs attention today",
  "How is the business performing?",
] as const;

export function DunaActionCenter({ scopeKey }: { scopeKey: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const openChat = useCallback(
    (prompt?: string) => {
      if (prompt) {
        try {
          sessionStorage.setItem(
            `ask-duna:draft:${scopeKey}`,
            JSON.stringify({ prompt, page: pathname, submit: true }),
          );
        } catch {
          /* Navigation still works without draft storage. */
        }
      }
      window.dispatchEvent(new Event("ask-duna:new"));
      router.push("/ask");
    },
    [pathname, router, scopeKey],
  );
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "j") {
        event.preventDefault();
        openChat();
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [openChat]);
  return (
    <SharedDunaActionCenter
      pathname={pathname}
      onOpenChat={openChat}
      quickActions={quickActions}
      starters={starters}
      surface="hq"
    />
  );
}
