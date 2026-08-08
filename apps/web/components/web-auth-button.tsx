"use client";

import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { ArrowUpRight, LogOut, Settings, UserRound } from "lucide-react";
import Link from "next/link";

function OpenDunaLink({ href }: { readonly href: string }) {
  return (
    <Link
      aria-label="Open Duna Player"
      className="site-header__enter"
      href={href}
    >
      <span>
        <small>Player app</small>
        <strong>Duna Player</strong>
      </span>
      <i>
        <ArrowUpRight aria-hidden size={16} />
      </i>
    </Link>
  );
}

export function WebAuthButton({
  configured,
}: {
  readonly configured: boolean;
}) {
  if (!configured) {
    return <OpenDunaLink href="/app" />;
  }
  return <ConfiguredWebAuthButton />;
}

function ConfiguredWebAuthButton() {
  const { loading, signOut, user } = useAuth();
  if (loading) return null;
  const initials = user
    ? `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}` ||
      user.email[0]?.toUpperCase()
    : "";
  return (
    <>
      {user ? (
        <>
          <OpenDunaLink href="/app" />
          <details className="site-header-account">
            <summary aria-label="Open account menu">
              <span className="site-header__avatar">
                {user.profilePictureUrl ? (
                  <img alt="" src={user.profilePictureUrl} />
                ) : (
                  initials
                )}
              </span>
            </summary>
            <div>
              <header>
                <span>{initials}</span>
                <p>
                  <strong>
                    {[user.firstName, user.lastName]
                      .filter(Boolean)
                      .join(" ") || "Your Duna"}
                  </strong>
                  <small>{user.email}</small>
                </p>
              </header>
              <Link href="/app/profile">
                <UserRound aria-hidden size={16} /> Player profile
              </Link>
              <Link href="/app/settings">
                <Settings aria-hidden size={16} /> Account settings
              </Link>
              <button
                onClick={() =>
                  void signOut({ returnTo: window.location.origin })
                }
                type="button"
              >
                <LogOut aria-hidden size={16} /> Sign out
              </button>
            </div>
          </details>
        </>
      ) : (
        <OpenDunaLink href="/sign-in" />
      )}
    </>
  );
}
