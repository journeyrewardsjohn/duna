import "server-only";

import { isWorkOSAuthKitConfigured } from "@duna/api/workos-environment";
import { log, report } from "@duna/observability";
import { cookies } from "next/headers";
import { cache } from "react";
import { getServerCaller, getServerContext } from "@/lib/api";
import { readWithRateLimitRetry } from "@/lib/server-read";
import { DUNA_HQ_URL } from "@/lib/site-urls";
import {
  ACTING_FOR_COOKIE,
  dependentsFrom,
  firstNameOf,
  resolveActingFor,
} from "./acting-for";
import {
  signedOutSession,
  type AgeBand,
  type AppClub,
  type AppSession,
} from "./session-types";

type Caller = Awaited<ReturnType<typeof getServerCaller>>;

/**
 * The dashboard and settings, read once per request (the shell and Home share
 * them). A short rate-limit refusal is retried once (lib/server-read.ts).
 */
export const loadDashboard = cache(async () => {
  const caller = await getServerCaller();
  return readWithRateLimitRetry(() => caller.player.dashboard());
});
export const loadSettings = cache(async () => {
  const caller = await getServerCaller();
  return readWithRateLimitRetry(() => caller.player.settings());
});

function roleLabel(role: string): string {
  if (role === "owner") return "Admin";
  if (role === "front-desk") return "Front desk";
  return `${role[0]?.toUpperCase() ?? ""}${role.slice(1)}`;
}

/** A read that may fail without taking the shell down: logged, then a fallback. */
async function optional<T>(
  read: () => Promise<T>,
  fallback: T,
  event: string,
): Promise<T> {
  try {
    return await read();
  } catch (error) {
    const code = (error as { code?: unknown })?.code;
    if (code === "NOT_IMPLEMENTED" || code === "FORBIDDEN") {
      log.info(event, { outcome: String(code).toLowerCase() });
    } else {
      report(error, { event });
    }
    return fallback;
  }
}

async function loadDependents(
  caller: Caller,
  personId: string,
  roles: readonly string[],
  isDemo: boolean,
  settingsHousehold: Parameters<typeof dependentsFrom>[0]["settingsHousehold"],
) {
  // The households seam answers with its fixture in demo mode for anyone;
  // there only a guardian persona has a household, so the demo player and
  // the demo club owner do not suddenly have children.
  const household =
    isDemo && !roles.includes("guardian")
      ? null
      : await optional(
          () => caller.player.households.mine(),
          null,
          "web.app_shell.household_unavailable",
        );
  return dependentsFrom({
    guardianId: personId,
    links: household?.guardianLinks,
    members: household?.members,
    settingsHousehold,
  });
}

/**
 * The person behind every Player web page, once per request: who they are,
 * the juniors they manage and whom they are acting for, their clubs, unread
 * messages. Signed out: `state: "signed-out"` and nothing else is read.
 */
export const getAppSession = cache(async (): Promise<AppSession> => {
  const authConfigured = isWorkOSAuthKitConfigured();
  const context = await getServerContext();
  const actor = context.actor;
  if (!actor) return signedOutSession(authConfigured, DUNA_HQ_URL);

  const caller = await getServerCaller();
  const [dashboard, settings, access, inbox] = await Promise.all([
    loadDashboard(),
    optional(() => loadSettings(), null, "web.app_shell.settings_unavailable"),
    optional(
      () => caller.player.organizationAccess(),
      { organizations: [] },
      "web.app_shell.organizations_unavailable",
    ),
    optional(
      () => caller.messaging.inbox({ asPrincipal: "user" }),
      null,
      "web.app_shell.inbox_unavailable",
    ),
  ]);
  const player = dashboard.player;
  const ageBand: AgeBand =
    settings?.profile.ageBand ?? (player.isMinor ? "teen" : "unknown");
  const junior =
    ageBand === "under-13" || ageBand === "teen" || player.isMinor === true;
  const dependents = junior
    ? []
    : await loadDependents(
        caller,
        player.id,
        actor.roles,
        actor.isDemo,
        settings?.household,
      );
  const actingFor = resolveActingFor(
    (await cookies()).get(ACTING_FOR_COOKIE)?.value,
    dependents,
  );
  const clubs: AppClub[] = access.organizations.map((organization) => ({
    id: organization.id,
    slug: organization.slug,
    name: organization.name,
    roleLabel: organization.staff?.active
      ? `${roleLabel(organization.staff.role)} · Player`
      : organization.roles.map(roleLabel).join(" · ") || "Player",
    isActive: organization.isActive,
    canManage: organization.canManage,
  }));

  return {
    state: "signed-in",
    authConfigured,
    demo: actor.isDemo,
    person: {
      id: player.id,
      displayName: player.displayName,
      firstName: firstNameOf(player.displayName),
      handle: player.handle,
      initials: player.initials,
      ...(player.avatarUrl ? { avatarUrl: player.avatarUrl } : {}),
      homeMarket: player.homeMarket,
      rating:
        player.rating.confidence === "Provisional"
          ? null
          : Number(player.rating.display.toFixed(2)),
    },
    ageBand,
    junior,
    dependents,
    actingFor,
    clubs,
    unreadMessages: inbox ? inbox.totalUnread : null,
    hqUrl: DUNA_HQ_URL,
  };
});
