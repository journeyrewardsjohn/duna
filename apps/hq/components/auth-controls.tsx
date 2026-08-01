"use client";

import {
  OrganizationSwitcher,
  SignInButton,
  UserButton,
  useAuth,
} from "@clerk/nextjs";
import { LogIn } from "lucide-react";

export function AuthControls({
  configured,
  showOrganization = true,
}: {
  readonly configured: boolean;
  readonly showOrganization?: boolean;
}) {
  if (!configured) {
    return (
      <span className="auth-setup-badge" title="Add Clerk keys to activate">
        Auth setup
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
  const { isLoaded, userId } = useAuth();
  if (!isLoaded) return null;
  return (
    <>
      {userId ? (
        <>
          {showOrganization && (
            <OrganizationSwitcher
              afterCreateOrganizationUrl="/"
              afterSelectOrganizationUrl="/"
              hidePersonal
            />
          )}
          <UserButton />
        </>
      ) : (
        <SignInButton mode="modal">
          <button className="hq-button hq-button--secondary" type="button">
            <LogIn aria-hidden size={16} /> Sign in
          </button>
        </SignInButton>
      )}
    </>
  );
}
