import { hasDunaAiGatewayCredential } from "@duna/api";
import { isWorkOSAuthKitConfigured } from "@duna/api/workos-environment";
import type { OrganizationSummary, PersonRole } from "@duna/core";
import { log } from "@duna/observability";
import { cookies } from "next/headers";
import { cache } from "react";
import { getServerCaller, getServerContext } from "@/lib/api";
import { loadWorkspaceOptions } from "@/lib/workspace-options";
import { hasAskDunaSessionSecret } from "@/lib/ask-duna-tokens";
import type { ShellSession } from "./session-types";

/** Roles that work in HQ. Players and guardians use the Duna app instead. */
export const hqOperatorRoles = [
  "owner",
  "manager",
  "coach",
  "front-desk",
  "scorekeeper",
  "accountant",
  "super-admin",
] as const satisfies readonly PersonRole[];

const roleLabels: Partial<Record<PersonRole, string>> = {
  owner: "Owner",
  manager: "Manager",
  coach: "Coach",
  "front-desk": "Front desk",
  scorekeeper: "Scorekeeper",
  accountant: "Accountant",
  "super-admin": "Duna staff",
};

/** The person's most senior HQ role, as the switcher names it. */
export function hqRoleLabel(roles: readonly PersonRole[]): string | undefined {
  for (const role of hqOperatorRoles) {
    if (roles.includes(role)) return roleLabels[role];
  }
  return undefined;
}

/** The cookie the browser suites set to run Ask Duna against their fixture. */
export const DEMO_ASK_COOKIE = "duna-demo-ask";

/**
 * Test servers only (the persona switch's guard: no sign-in, demo mode,
 * DUNA_DEMO_PERSONAS=enabled, never production): the browser suites answer
 * /api/ask-duna themselves (tests/ask-duna-fixture.ts) and set this cookie so
 * the panel talks to that fixture instead of showing its demo state.
 */
async function demoAskFixtureRequested(): Promise<boolean> {
  if (
    isWorkOSAuthKitConfigured() ||
    process.env.DUNA_DEMO_PERSONAS !== "enabled" ||
    process.env.NEXT_PUBLIC_DEMO_MODE === "false" ||
    process.env.VERCEL_ENV === "production"
  ) {
    return false;
  }
  return (await cookies()).get(DEMO_ASK_COOKIE)?.value === "fixture";
}

async function loadOrganization(): Promise<OrganizationSummary | undefined> {
  const caller = await getServerCaller();
  try {
    return await caller.operator.organization();
  } catch {
    // An accountant can read reports but not the member list.
    try {
      return (await caller.operator.dashboard()).organization;
    } catch {
      return undefined;
    }
  }
}

/**
 * Everything the shell and a `(next)` page need to know about who is here:
 * the person, the organisation, the organisations they can switch to, what
 * they may do, and whether Ask Duna can run. Cached per request, so a page
 * and the shell share one read. See docs/design/hq-shell.md.
 */
export const getHqSession = cache(async (): Promise<ShellSession> => {
  const { actor } = await getServerContext();
  const authConfigured = isWorkOSAuthKitConfigured();
  const roles = actor?.roles ?? [];
  const operator =
    Boolean(actor?.organizationId) &&
    roles.some((role) => (hqOperatorRoles as readonly string[]).includes(role));
  const [organization, workspaces] = await Promise.all([
    operator ? loadOrganization() : Promise.resolve(undefined),
    authConfigured
      ? loadWorkspaceOptions().catch((error: unknown) => {
          log.warn("hq.shell.workspaces_unavailable", {
            error: error instanceof Error ? error.name : "unknown",
          });
          return { organizations: [], currentOrganizationId: undefined };
        })
      : Promise.resolve({
          organizations: [],
          currentOrganizationId: undefined,
        }),
  ]);
  const askDuna: ShellSession["askDuna"] = !actor
    ? "signed-out"
    : actor.isDemo
      ? operator && (await demoAskFixtureRequested())
        ? "ready"
        : "demo"
      : !operator
        ? "no-access"
        : !hasDunaAiGatewayCredential() || !hasAskDunaSessionSecret()
          ? "not-configured"
          : "ready";
  return {
    authConfigured,
    demo: actor?.isDemo ?? !authConfigured,
    person: actor
      ? { id: actor.personId, displayName: actor.displayName }
      : undefined,
    roles,
    roleLabel: hqRoleLabel(roles),
    scopes: actor?.scopes ?? [],
    access: operator && organization ? "operator" : actor ? "denied" : "none",
    organization: organization
      ? {
          id: organization.id,
          name: organization.name,
          plan: organization.plan,
          timezone: organization.timezone,
          stripeStatus: organization.stripeStatus,
        }
      : undefined,
    workspaces: workspaces.organizations,
    currentWorkspaceId: workspaces.currentOrganizationId,
    askDuna,
  };
});

/** Whether the session holds a permission scope (`*` holds every scope). */
export function hasScope(session: ShellSession, scope: string): boolean {
  return session.scopes.includes("*") || session.scopes.includes(scope);
}
