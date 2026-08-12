"use client";

import { useAuth } from "@workos-inc/authkit-nextjs/components";
import {
  Building2,
  ChevronsUpDown,
  LogIn,
  LogOut,
  Settings,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

export function AuthControls({
  configured,
  organizationName,
  showOrganization = true,
}: {
  readonly configured: boolean;
  readonly organizationName?: string;
  readonly showOrganization?: boolean;
}) {
  if (!configured) {
    return (
      <span className="auth-setup-badge" title="WorkOS is not configured">
        Preview
      </span>
    );
  }
  return (
    <ConfiguredAuthControls
      organizationName={organizationName}
      showOrganization={showOrganization}
    />
  );
}

function ConfiguredAuthControls({
  organizationName,
  showOrganization,
}: {
  readonly organizationName?: string;
  readonly showOrganization: boolean;
}) {
  const { loading, organizationId, signOut, user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !menuRef.current?.contains(event.target)
      ) {
        setMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  if (loading) return null;
  const initials = user
    ? `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}` ||
      user.email[0]?.toUpperCase()
    : "";
  const displayName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      "Your Duna account"
    : "";

  return (
    <>
      {user ? (
        <div className="hq-auth-menu" ref={menuRef}>
          <button
            aria-controls={menuId}
            aria-expanded={menuOpen}
            aria-label={`${menuOpen ? "Close" : "Open"} account menu for ${displayName}`}
            className="hq-auth-menu__trigger"
            onClick={() => setMenuOpen((open) => !open)}
            ref={triggerRef}
            title={`${user.email} · Account menu`}
            type="button"
          >
            <span className="hq-auth-menu__avatar">
              {user.profilePictureUrl ? (
                <img alt="" src={user.profilePictureUrl} />
              ) : (
                initials
              )}
            </span>
          </button>
          {menuOpen && (
            <div
              aria-label="Account menu"
              className="hq-auth-menu__panel"
              id={menuId}
              role="group"
            >
              <div className="hq-auth-menu__identity">
                <span className="hq-auth-menu__identity-avatar">
                  {user.profilePictureUrl ? (
                    <img alt="" src={user.profilePictureUrl} />
                  ) : (
                    initials
                  )}
                </span>
                <span>
                  <strong>{displayName}</strong>
                  <small>{user.email}</small>
                </span>
              </div>
              <nav
                aria-label="Account navigation"
                className="hq-auth-menu__nav"
              >
                <Link href="/account" onClick={() => setMenuOpen(false)}>
                  <span className="hq-auth-menu__item-icon">
                    <UserRound aria-hidden size={17} />
                  </span>
                  <span>
                    <strong>Profile &amp; account</strong>
                    <small>Personal details and security</small>
                  </span>
                </Link>
                <Link href="/settings" onClick={() => setMenuOpen(false)}>
                  <span className="hq-auth-menu__item-icon">
                    <Settings aria-hidden size={17} />
                  </span>
                  <span>
                    <strong>Organization settings</strong>
                    <small>Brand, team, billing, and access</small>
                  </span>
                </Link>
                {showOrganization && (
                  <Link href="/onboarding" onClick={() => setMenuOpen(false)}>
                    <span className="hq-auth-menu__item-icon">
                      {organizationId ? (
                        <ChevronsUpDown aria-hidden size={17} />
                      ) : (
                        <Building2 aria-hidden size={17} />
                      )}
                    </span>
                    <span>
                      <strong>
                        {organizationId
                          ? "Switch workspace"
                          : "Choose workspace"}
                      </strong>
                      <small>
                        {organizationName ?? "Manage your Duna HQ workspaces"}
                      </small>
                    </span>
                  </Link>
                )}
              </nav>
              <div className="hq-auth-menu__footer">
                <button
                  disabled={signingOut}
                  onClick={async () => {
                    setSigningOut(true);
                    try {
                      await signOut({
                        returnTo: new URL(
                          "/sign-in",
                          window.location.origin,
                        ).toString(),
                      });
                    } finally {
                      setSigningOut(false);
                    }
                  }}
                  type="button"
                >
                  <LogOut aria-hidden size={17} />
                  {signingOut ? "Signing out…" : "Sign out"}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <Link className="hq-button hq-button--secondary" href="/sign-in">
          <LogIn aria-hidden size={16} /> Sign in
        </Link>
      )}
    </>
  );
}
