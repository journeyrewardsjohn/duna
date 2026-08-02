"use client";

import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { LogIn, LogOut, UsersRound } from "lucide-react";
import Link from "next/link";

export function AuthControls({
  configured,
  showOrganization = true,
}: {
  readonly configured: boolean;
  readonly showOrganization?: boolean;
}) {
  if (!configured) {
    return (
      <span className="auth-setup-badge" title="WorkOS is not configured">
        Preview
      </span>
    );
  }
  return <ConfiguredAuthControls showOrganization={showOrganization} />;
}

function ConfiguredAuthControls({
  showOrganization,
}: {
  readonly showOrganization: boolean;
}) {
  const { loading, organizationId, signOut, user } = useAuth();
  if (loading) return null;
  const initials = user
    ? `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}` ||
      user.email[0]?.toUpperCase()
    : "";
  return (
    <>
      {user ? (
        <>
          {showOrganization && (
            <Link className="hq-auth-workspace" href="/onboarding">
              <UsersRound aria-hidden size={15} />
              {organizationId ? "Workspace" : "Choose workspace"}
            </Link>
          )}
          <Link
            aria-label="Personal account settings"
            className="hq-auth-avatar"
            href="/account"
            title={`${user.email} · Account settings`}
          >
            {initials}
          </Link>
          <button
            aria-label="Sign out"
            className="hq-auth-signout"
            onClick={() =>
              void signOut({
                returnTo: new URL(
                  "/sign-in",
                  window.location.origin,
                ).toString(),
              })
            }
            title="Sign out"
            type="button"
          >
            <LogOut aria-hidden size={16} />
          </button>
        </>
      ) : (
        <Link className="hq-button hq-button--secondary" href="/sign-in">
          <LogIn aria-hidden size={16} /> Sign in
        </Link>
      )}
    </>
  );
}
