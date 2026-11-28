import {
  getOrganizationSetupReadiness,
  type OperatorDashboard,
  type OperatorScorableMatch,
  type OperatorWorkspace,
  type OrganizationSetupReadiness,
} from "@duna/api";
import { isWorkOSAuthKitConfigured } from "@duna/api/workos-environment";
import type { PersonSummary } from "@duna/core";
import { report } from "@duna/observability";
import { cookies } from "next/headers";
import { cache } from "react";
import { getServerCaller } from "@/lib/api";
import { isPermissionDenied } from "@/lib/permission-denied";

/**
 * Today's data: the same four reads the old home page made (dashboard,
 * members, workspace, scorable matches), each loaded once per request and
 * turned into an honest result a block can render: data, "you need access",
 * or a failure with its reference. A block never fails the whole page.
 */
export type Loaded<T> =
  | { readonly state: "ok"; readonly data: T }
  | { readonly state: "denied" }
  | { readonly state: "error"; readonly reference: string };

async function settle<T>(
  read: () => Promise<T>,
  block: string,
): Promise<Loaded<T>> {
  try {
    return { state: "ok", data: await read() };
  } catch (error) {
    if (isPermissionDenied(error)) return { state: "denied" };
    const reference = report(error, {
      event: "hq.today.block_failed",
      tags: { block },
    });
    return { state: "error", reference };
  }
}

/** The cookie the persona suite uses to see a first-day club (demo only). */
export const DEMO_CLUB_COOKIE = "duna-demo-club";

/**
 * True only for the persona test servers: no sign-in, demo mode, the persona
 * switch on, never a production deployment (the same guard as
 * packages/api/src/demo-persona.ts). It shows a club with nothing in it yet.
 */
export async function demoFirstDayRequested(
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<boolean> {
  if (
    isWorkOSAuthKitConfigured(env) ||
    env.DUNA_DEMO_PERSONAS !== "enabled" ||
    env.NEXT_PUBLIC_DEMO_MODE === "false" ||
    env.VERCEL_ENV === "production"
  ) {
    return false;
  }
  return (await cookies()).get(DEMO_CLUB_COOKIE)?.value === "first-day";
}

/** A club on its first day: the same organisation with nothing added yet. */
export function firstDayDashboard(
  dashboard: OperatorDashboard,
): OperatorDashboard {
  return {
    organization: {
      ...dashboard.organization,
      memberCount: 0,
      venueCount: 0,
      stripeStatus: "pending",
    },
    metrics: [],
    schedule: [],
    events: [],
    alerts: [],
  };
}

export function firstDayWorkspace(
  workspace: OperatorWorkspace,
): OperatorWorkspace {
  return {
    ...workspace,
    organization: {
      ...workspace.organization,
      stripeChargesEnabled: false,
      addressLine1: undefined,
    },
    venues: [],
    sessions: [],
    people: [],
    participants: [],
    staff: workspace.staff.slice(0, 1),
    catalog: [],
    theme: {
      ...workspace.theme,
      publishedAt: undefined,
      tagline: undefined,
      logoUrl: undefined,
      markUrl: undefined,
    },
  };
}

export const loadDashboard = cache(async () => {
  const caller = await getServerCaller();
  const result = await settle(() => caller.operator.dashboard(), "dashboard");
  if (result.state === "ok" && (await demoFirstDayRequested())) {
    return { state: "ok", data: firstDayDashboard(result.data) } as const;
  }
  return result;
});

export const loadMembers = cache(
  async (): Promise<Loaded<readonly PersonSummary[]>> => {
    const caller = await getServerCaller();
    if (await demoFirstDayRequested()) return { state: "ok", data: [] };
    return settle(() => caller.operator.members(), "members");
  },
);

export const loadSetup = cache(
  async (): Promise<Loaded<OrganizationSetupReadiness>> => {
    const caller = await getServerCaller();
    const workspace = await settle(
      () => caller.operator.workspace(),
      "workspace",
    );
    if (workspace.state !== "ok") return workspace;
    const data = (await demoFirstDayRequested())
      ? firstDayWorkspace(workspace.data)
      : workspace.data;
    return { state: "ok", data: getOrganizationSetupReadiness(data) };
  },
);

export const loadScorableMatches = cache(
  async (): Promise<Loaded<readonly OperatorScorableMatch[]>> => {
    // Matches live in the database; demo mode without one has none.
    if (!process.env.DATABASE_URL || (await demoFirstDayRequested())) {
      return { state: "ok", data: [] };
    }
    const caller = await getServerCaller();
    return settle(() => caller.operator.scorableMatches(), "matches");
  },
);
