"use client";

import { UserButton, useAuth } from "@clerk/nextjs";
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
  const { isLoaded, userId } = useAuth();
  if (!isLoaded) return null;
  return (
    <>
      {userId ? (
        <>
          <Link className="site-header__enter" href="/app">
            Open Duna
          </Link>
          <UserButton />
        </>
      ) : (
        <Link className="site-header__enter" href="/sign-in">
          Sign in
        </Link>
      )}
    </>
  );
}
