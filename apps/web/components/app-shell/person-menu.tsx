"use client";

import { hqHref } from "@duna/core/hq-routes";
import { report } from "@duna/observability";
import { Icon } from "@duna/ui/icons";
import {
  Avatar,
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Segmented,
  errorToast,
  successToast,
  useConfirm,
} from "@duna/ui/tideline";
import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { APP_ROUTES } from "@/lib/app-routes";
import { switchActingFor, switchPlayerOrganization } from "./actions";
import type { AppSession } from "./session-types";
import {
  applyThemePreference,
  parseThemePreference,
  storedThemePreference,
  themePreferences,
  type DunaThemePreference,
} from "./theme";

/** Match device, Light or Dark. Updates the document and remembers it. */
export function AppearanceChoice() {
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
    <div className="aps-menu__section">
      <span className="aps-menu__label" id="aps-appearance-label">
        Appearance
      </span>
      <Segmented
        aria-labelledby="aps-appearance-label"
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

function SignOut() {
  const { signOut } = useAuth();
  const confirm = useConfirm();
  return (
    <>
      <Button
        block
        icon={<Icon name="key" size="inline" />}
        onClick={() =>
          void confirm.run({
            tier: "confirm",
            title: "Sign out of Duna?",
            description:
              "You'll need to sign in again to see your bookings, messages and wallet on this device.",
            verb: "Sign out now",
            cancelLabel: "Stay signed in",
            agentConfirm: "Signs this person out of Duna on this device",
            perform: () =>
              signOut({
                returnTo: new URL("/", window.location.origin).toString(),
              }),
            errorMessage: "Duna couldn't sign you out. Try again.",
            report: (error) =>
              report(error, { event: "web.app_shell.sign_out_failed" }),
          })
        }
        variant="secondary"
      >
        Sign out
      </Button>
      {confirm.dialog}
    </>
  );
}

/**
 * Whose account: the person, or one of the juniors they are a guardian of.
 * Rebuilt screens (Home today) show the chosen account; every screen says
 * whose it is.
 */
function ActingForChoice({ session }: { readonly session: AppSession }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!session.person || session.dependents.length === 0) return null;
  const current = session.actingFor?.personId ?? null;
  const choose = (personId: string | null, name: string) =>
    start(async () => {
      try {
        await switchActingFor(personId);
        router.refresh();
        successToast(
          personId ? `Showing ${name}'s account.` : "Showing your own account.",
        );
      } catch (error) {
        errorToast("Duna couldn't switch accounts. Try again.", {
          reference: report(error, {
            event: "web.app_shell.acting_for_failed",
          }),
        });
      }
    });
  const people = [
    {
      personId: null,
      name: session.person.displayName,
      line: "You",
    },
    ...session.dependents.map((dependent) => ({
      personId: dependent.personId,
      name: dependent.displayName,
      line:
        dependent.ageBand === "under-13"
          ? "Junior · you manage this account"
          : dependent.ageBand === "teen"
            ? "Teen · you are a guardian"
            : "You are a guardian",
    })),
  ];
  return (
    <div
      aria-busy={pending || undefined}
      className="aps-menu__section"
      role="group"
      aria-labelledby="aps-acting-label"
    >
      <span className="aps-menu__label" id="aps-acting-label">
        Whose account
      </span>
      {people.map((person) => {
        const selected = person.personId === current;
        return (
          <button
            aria-pressed={selected}
            className="aps-menu__person"
            disabled={pending}
            key={person.personId ?? "self"}
            onClick={() =>
              selected ? undefined : choose(person.personId, person.name)
            }
            type="button"
          >
            <Avatar decorative name={person.name} size="sm" />
            <span className="aps-menu__text">
              <span className="aps-menu__name">{person.name}</span>
              <span className="td-meta">{person.line}</span>
            </span>
            {selected ? (
              <Icon label="Showing" name="check" size="inline" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function ClubChoice({ session }: { readonly session: AppSession }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const createHref = `${session.hqUrl}${hqHref("setupStart")}?mode=create`;
  const active = session.clubs.find((club) => club.isActive);
  const choose = (id: string, name: string) =>
    start(async () => {
      try {
        await switchPlayerOrganization(id);
        router.refresh();
        successToast(`${name} is your active club.`);
      } catch (error) {
        errorToast("Duna couldn't switch clubs. Try again.", {
          reference: report(error, { event: "web.app_shell.club_failed" }),
        });
      }
    });
  return (
    <div
      aria-busy={pending || undefined}
      aria-labelledby="aps-clubs-label"
      className="aps-menu__section"
      role="group"
    >
      <span className="aps-menu__label" id="aps-clubs-label">
        Your clubs
      </span>
      {session.clubs.length === 0 ? (
        <p className="td-meta aps-menu__note">
          No clubs yet. Playing in {session.person?.homeMarket}.
        </p>
      ) : (
        session.clubs.map((club) => (
          <button
            aria-pressed={club.isActive}
            className="aps-menu__person"
            disabled={pending}
            key={club.id}
            onClick={() =>
              club.isActive ? undefined : choose(club.id, club.name)
            }
            type="button"
          >
            <Avatar decorative kind="club" name={club.name} size="sm" />
            <span className="aps-menu__text">
              <span className="aps-menu__name">{club.name}</span>
              <span className="td-meta">{club.roleLabel}</span>
            </span>
            {club.isActive ? (
              <Icon label="Active club" name="check" size="inline" />
            ) : null}
          </button>
        ))
      )}
      {active?.canManage ? (
        <a className="aps-menu__link" href={session.hqUrl}>
          <Icon name="layout" size="inline" />
          Manage {active.name} in Duna HQ
        </a>
      ) : null}
      <a className="aps-menu__link" href={createHref}>
        <Icon name="plus" size="inline" />
        Create new organisation
      </a>
    </div>
  );
}

/**
 * The person menu (Tideline `Sidebar` foot / top bar avatar): who is signed
 * in and whose account is showing, the club switcher with "Create new
 * organisation", profile and account, appearance, and sign out with a
 * confirmation.
 */
export function PersonMenu({
  session,
  placement,
}: {
  readonly session: AppSession;
  readonly placement: "rail" | "top";
}) {
  const person = session.person;
  if (!person) return null;
  const showing = session.actingFor;
  const subline = showing
    ? `Acting for ${showing.firstName}`
    : person.rating !== null
      ? `You · Sand Rating ${person.rating.toFixed(2)}`
      : "You";
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`Account menu for ${person.displayName}${showing ? `, acting for ${showing.displayName}` : ""}`}
        className="aps-person"
        data-placement={placement}
        variant="ghost"
      >
        <Avatar
          decorative
          name={person.displayName}
          size="sm"
          {...(person.avatarUrl ? { src: person.avatarUrl } : {})}
        />
        <span className="aps-person__text">
          <span className="aps-person__name">{person.displayName}</span>
          <span className="aps-person__line">{subline}</span>
        </span>
        <Icon className="aps-person__more" name="more" size="inline" />
      </PopoverTrigger>
      <PopoverContent
        align={placement === "rail" ? "start" : "end"}
        className="aps-menu"
        description={
          session.demo
            ? "Demo mode: sample data, nothing is sent or charged."
            : `@${person.handle}`
        }
        side={placement === "rail" ? "top" : "bottom"}
        title={person.displayName}
      >
        <ActingForChoice session={session} />
        <ClubChoice session={session} />
        <nav aria-label="Your account" className="aps-menu__section">
          <a className="aps-menu__link" href={APP_ROUTES.profile.path}>
            <Icon name="player" size="inline" />
            Profile
          </a>
          <a className="aps-menu__link" href={APP_ROUTES.settings.path}>
            <Icon name="you" size="inline" />
            Account and household
          </a>
          <a className="aps-menu__link" href={APP_ROUTES.wallet.path}>
            <Icon name="wallet" size="inline" />
            Wallet
          </a>
        </nav>
        <AppearanceChoice />
        {session.authConfigured ? (
          <SignOut />
        ) : (
          <p className="td-meta aps-menu__note">
            Sign-in isn't set up on this server, so there is nothing to sign out
            of.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
