"use client";

import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { LogOut, Settings, UserRound } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export function PlayerAccountMenu({
  configured,
  trigger,
}: {
  readonly configured: boolean;
  readonly trigger: ReactNode;
}) {
  if (!configured) {
    return (
      <Link
        aria-label="Open account settings"
        className="player-account-menu__direct"
        href="/app/settings"
      >
        {trigger}
      </Link>
    );
  }
  return <ConfiguredPlayerAccountMenu trigger={trigger} />;
}

function ConfiguredPlayerAccountMenu({
  trigger,
}: {
  readonly trigger: ReactNode;
}) {
  const { signOut } = useAuth();

  return (
    <details className="player-account-menu">
      <summary aria-label="Open account menu">{trigger}</summary>
      <div>
        <Link href="/app/profile">
          <UserRound aria-hidden size={17} />
          My profile
        </Link>
        <Link href="/app/settings">
          <Settings aria-hidden size={17} />
          Account settings
        </Link>
        <button
          onClick={() =>
            void signOut({
              returnTo: new URL("/", window.location.origin).toString(),
            })
          }
          type="button"
        >
          <LogOut aria-hidden size={17} />
          Sign out
        </button>
      </div>
    </details>
  );
}
