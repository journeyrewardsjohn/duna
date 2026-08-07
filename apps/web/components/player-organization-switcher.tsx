"use client";

import type { PlayerOrganizationAccess } from "@duna/api";
import {
  Building2,
  Check,
  ChevronDown,
  ExternalLink,
  LoaderCircle,
  UserRoundCog,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import {
  selfEnrollPlayerStaff,
  switchPlayerOrganization,
} from "@/app/app/actions";
import { DUNA_HQ_URL } from "@/lib/site-urls";

function roleLabel(role: string): string {
  if (role === "owner") return "Admin";
  if (role === "front-desk") return "Front desk";
  return `${role[0]?.toUpperCase() ?? ""}${role.slice(1)}`;
}

export function PlayerOrganizationSwitcher({
  access,
  homeMarket,
}: {
  readonly access: PlayerOrganizationAccess;
  readonly homeMarket: string;
}) {
  const router = useRouter();
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [error, setError] = useState<string>();
  const [isPending, startTransition] = useTransition();
  const active = access.organizations.find(
    (organization) => organization.isActive,
  );
  const activeRole = active?.staff?.active
    ? roleLabel(active.staff.role)
    : active?.roles.includes("owner")
      ? "Admin"
      : active?.roles[0]
        ? roleLabel(active.roles[0])
        : "Player";

  const run = (task: () => Promise<unknown>) => {
    setError(undefined);
    startTransition(async () => {
      try {
        await task();
        detailsRef.current?.removeAttribute("open");
        router.refresh();
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : "Duna could not update your organization context.",
        );
      }
    });
  };

  if (access.organizations.length === 0) {
    return (
      <div className="player-topbar__market">
        <span>Playing in</span>
        <strong>{homeMarket}</strong>
      </div>
    );
  }

  return (
    <details className="player-organization-switcher" ref={detailsRef}>
      <summary aria-label="Switch player or organization context">
        <span className="player-organization-switcher__icon">
          <Building2 aria-hidden size={17} />
        </span>
        <span>
          <small>{activeRole}</small>
          <strong>{active?.name ?? "Your organizations"}</strong>
        </span>
        {access.organizations.length > 1 ? (
          <em>{access.organizations.length}</em>
        ) : null}
        <ChevronDown aria-hidden size={15} />
      </summary>

      <div className="player-organization-switcher__panel">
        <header>
          <span>Your Duna</span>
          <strong>
            {access.organizations.length > 1
              ? "Choose where you’re working"
              : "Player and team access together"}
          </strong>
        </header>

        <div className="player-organization-switcher__list">
          {access.organizations.map((organization) => (
            <button
              aria-pressed={organization.isActive}
              disabled={isPending || organization.isActive}
              key={organization.id}
              onClick={() =>
                run(() => switchPlayerOrganization(organization.id))
              }
              type="button"
            >
              <span className="player-organization-switcher__org-mark">
                {organization.name.slice(0, 1).toUpperCase()}
              </span>
              <span>
                <strong>{organization.name}</strong>
                <small>
                  {organization.staff?.active
                    ? `${roleLabel(organization.staff.role)} · Player`
                    : organization.roles.map(roleLabel).join(" · ")}
                </small>
              </span>
              {organization.isActive ? (
                <Check aria-label="Current organization" size={17} />
              ) : (
                <span className="player-organization-switcher__switch">
                  Switch
                </span>
              )}
            </button>
          ))}
        </div>

        {active?.canSelfEnroll ? (
          <section className="player-organization-switcher__enroll">
            <UserRoundCog aria-hidden size={20} />
            <div>
              <strong>Put yourself on the schedule</strong>
              <p>
                Add a working role without changing your organization admin
                access.
              </p>
              <div>
                <button
                  disabled={isPending}
                  onClick={() => run(() => selfEnrollPlayerStaff("coach"))}
                  type="button"
                >
                  Add as coach
                </button>
                <button
                  disabled={isPending}
                  onClick={() => run(() => selfEnrollPlayerStaff("director"))}
                  type="button"
                >
                  Add as director
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {active?.canManage ? (
          <a className="player-organization-switcher__hq" href={DUNA_HQ_URL}>
            <span>
              <small>Duna HQ</small>
              <strong>Manage {active.name}</strong>
            </span>
            <ExternalLink aria-hidden size={16} />
          </a>
        ) : null}

        {isPending ? (
          <p className="player-organization-switcher__status">
            <LoaderCircle aria-hidden className="spin" size={15} /> Updating
            your workspace…
          </p>
        ) : null}
        {error ? (
          <p className="player-organization-switcher__error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </details>
  );
}
