"use client";

import { hqHref } from "@duna/core/hq-routes";
import { Icon } from "@duna/ui/icons";
import {
  Avatar,
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Segmented,
} from "@duna/ui/tideline";
import { useAuth } from "@workos-inc/authkit-nextjs/components";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { ShellSession } from "./session-types";
import {
  applyThemePreference,
  parseThemePreference,
  storedThemePreference,
  themePreferences,
  type DunaThemePreference,
} from "./theme";

/** The theme choice: Match device, Light or Dark. Updates `<html>` and `<body>`. */
export function ThemeChoice() {
  const [preference, setPreference] = useState<DunaThemePreference>("system");
  useEffect(() => {
    setPreference(storedThemePreference());
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const follow = () => {
      if (storedThemePreference() === "system") applyThemePreference("system");
    };
    media.addEventListener("change", follow);
    return () => media.removeEventListener("change", follow);
  }, []);
  return (
    <div className="hqs-account__theme">
      <span className="td-meta" id="hqs-theme-label">
        Theme
      </span>
      <Segmented
        aria-labelledby="hqs-theme-label"
        block
        onValueChange={(value) => {
          const next = parseThemePreference(String(value));
          setPreference(next);
          applyThemePreference(next);
        }}
        options={themePreferences.map((option) => ({
          value: option.value,
          label: option.label,
        }))}
        value={preference}
      />
    </div>
  );
}

function SignOutButton() {
  const { signOut } = useAuth();
  const [pending, setPending] = useState(false);
  return (
    <Button
      block
      icon={<Icon name="key" size="inline" />}
      loading={pending}
      onClick={async () => {
        setPending(true);
        try {
          await signOut({
            returnTo: new URL("/sign-in", window.location.origin).toString(),
          });
        } finally {
          setPending(false);
        }
      }}
      variant="secondary"
    >
      Sign out
    </Button>
  );
}

/**
 * The account row at the foot of the sidebar: who is signed in, their
 * profile and the club's settings, the theme, and sign out.
 */
export function AccountMenu({
  session,
  collapsed,
}: {
  readonly session: ShellSession;
  readonly collapsed: boolean;
}) {
  const name = session.person?.displayName ?? "Not signed in";
  const staff =
    session.roles.includes("super-admin") || session.roles.includes("admin");
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`Account and settings for ${name}`}
        className="hqs-account"
        data-collapsed={collapsed || undefined}
        variant="ghost"
      >
        <Avatar decorative name={name} size="sm" />
        <span className="hqs-club__text">
          <span className="hqs-club__name">{name}</span>
          <span className="hqs-club__role">Account</span>
        </span>
        <Icon className="hqs-club__chevron" name="more" size="inline" />
      </PopoverTrigger>
      <PopoverContent
        className="hqs-account__panel"
        description={
          session.demo
            ? "Demo mode: sample club data, nothing is sent or charged."
            : [session.roleLabel, session.organization?.name]
                .filter(Boolean)
                .join(" · ")
        }
        align="start"
        side="top"
        title={name}
      >
        <nav aria-label="Account" className="hqs-account__links">
          <Link href={hqHref("account")}>
            <Icon name="you" size="inline" />
            Profile and account
          </Link>
          <Link href={hqHref("settings")}>
            <Icon name="key" size="inline" />
            Club settings
          </Link>
          {staff ? (
            <Link href={hqHref("admin")}>
              <Icon name="verified" size="inline" />
              Duna Admin
            </Link>
          ) : null}
        </nav>
        <ThemeChoice />
        {session.authConfigured && session.person ? (
          <SignOutButton />
        ) : session.authConfigured ? (
          <Button block href="/sign-in" variant="secondary">
            Sign in
          </Button>
        ) : (
          <p className="td-meta hqs-account__note">
            Sign-in is not set up on this server, so there is nothing to sign
            out of.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
