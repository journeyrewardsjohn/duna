"use client";

import { hqHref } from "@duna/core/hq-routes";
import { Icon } from "@duna/ui/icons";
import {
  ClubMark,
  Menu,
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "@duna/ui/tideline";
import { usePathname, useRouter } from "next/navigation";
import { switchWorkspaceAction } from "@/app/workspace-actions";
import type { ShellSession } from "./session-types";

/** Menu values that are not organisation ids. */
export const ORG_CREATE = "__create";
export const ORG_PERSONAL = "__personal";

/** Where "Create new organisation" leads: Club setup's first run, create mode. */
export const createOrganizationHref = `${hqHref("setupStart")}?mode=create`;

export interface OrgSwitcherEntry {
  readonly id: string;
  readonly name: string;
  readonly current: boolean;
}

/**
 * The organisations the switcher lists: the person's organisations with the
 * current one first; the current organisation alone when the identity
 * provider has none to offer (demo, local development).
 */
export function orgSwitcherEntries(
  session: Pick<
    ShellSession,
    "organization" | "workspaces" | "currentWorkspaceId"
  >,
): OrgSwitcherEntry[] {
  const currentId = session.currentWorkspaceId;
  const entries = session.workspaces.map((workspace) => ({
    id: workspace.id,
    name: workspace.name,
    current: workspace.id === currentId,
  }));
  if (!entries.some((entry) => entry.current) && session.organization) {
    entries.unshift({
      id: session.organization.id,
      name: session.organization.name,
      current: true,
    });
  }
  return entries.sort((left, right) =>
    left.current === right.current
      ? left.name.localeCompare(right.name)
      : left.current
        ? -1
        : 1,
  );
}

/**
 * The club switcher at the top of the sidebar: club mark, name and role; the
 * person's organisations; "Create new organisation"; the personal account.
 */
export function OrgSwitcher({
  session,
  collapsed,
}: {
  readonly session: ShellSession;
  readonly collapsed: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const name = session.organization?.name ?? "Choose a club";
  const role = session.roleLabel ?? "Duna HQ";
  const entries = orgSwitcherEntries(session);
  return (
    <Menu
      onAction={async (value) => {
        if (value === ORG_CREATE) return router.push(createOrganizationHref);
        if (value === ORG_PERSONAL) return router.push(hqHref("account"));
        const entry = entries.find((item) => item.id === value);
        if (!entry || entry.current) return;
        const form = new FormData();
        form.set("organizationId", entry.id);
        form.set("returnTo", pathname || "/");
        await switchWorkspaceAction(form);
      }}
    >
      <MenuTrigger
        aria-label={`Switch club. Current: ${name}, ${role}`}
        className="hqs-club"
        data-collapsed={collapsed || undefined}
        variant="ghost"
      >
        <ClubMark decorative name={name} size="sm" />
        <span className="hqs-club__text">
          <span className="hqs-club__name">{name}</span>
          <span className="hqs-club__role">{role}</span>
        </span>
        <Icon className="hqs-club__chevron" name="chevron-down" size="inline" />
      </MenuTrigger>
      <MenuContent className="hqs-club-menu">
        <MenuGroup>
          <MenuGroupLabel>Your organisations</MenuGroupLabel>
          {entries.map((entry) => (
            <MenuItem
              data-current={entry.current || undefined}
              disabled={entry.current}
              key={entry.id}
              value={entry.id}
            >
              <ClubMark decorative name={entry.name} size="inline" />
              <span className="hqs-club-menu__name">{entry.name}</span>
              {entry.current ? (
                <span className="hqs-club-menu__current">
                  <Icon name="check" size="inline" />
                  <span className="td-sr">Current organisation</span>
                </span>
              ) : null}
            </MenuItem>
          ))}
          {entries.length === 0 ? (
            <MenuItem disabled value="__none">
              No organisations yet
            </MenuItem>
          ) : null}
        </MenuGroup>
        <MenuSeparator />
        <MenuItem value={ORG_CREATE}>
          <Icon name="plus" size="inline" />
          Create new organisation
        </MenuItem>
        <MenuItem value={ORG_PERSONAL}>
          <Icon name="you" size="inline" />
          Your personal account
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
