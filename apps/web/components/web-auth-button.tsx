"use client";

import { useAuth } from "@workos-inc/authkit-nextjs/components";
import Link from "next/link";

export function WebAuthButton({
  configured,
}: {
  readonly configured: boolean;
}) {
  if (!configured) {
    return (
      <Link className="site-header__enter" href="/app">
        Enter Duna
      </Link>
    );
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
          <Link className="site-header__enter" href="/app">
            Open Duna
          </Link>
          <button
            aria-label={`Sign out ${user.email}`}
            className="site-header__avatar"
            onClick={() => void signOut({ returnTo: window.location.origin })}
            title="Sign out"
            type="button"
          >
            {initials}
          </button>
        </>
      ) : (
        <Link className="site-header__enter" href="/sign-in">
          Sign in
        </Link>
      )}
    </>
  );
}
