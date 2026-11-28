import {
  type OperatorWorkspace,
  type TeamAvailabilityCoverageGrid,
  type TeamAvailabilityCoverageRequest,
  type TeamAvailabilityStaff,
  type TeamPayRun,
  scopesForRoles,
  usesDemoData,
} from "@duna/api";
import { PROVIDER_NOT_CONFIGURED_MESSAGE } from "@duna/api/observability";
import type { PersonRole } from "@duna/core";
import { log, report } from "@duna/observability";
import { addCalendarDays, localDateOf } from "@duna/scheduling";
import { cache } from "react";
import { getServerCaller } from "@/lib/api";
import { isPermissionDenied } from "@/lib/permission-denied";
import { getHqSession, hasScope } from "../shell/hq-session";
import type { ShellSession } from "../shell/session-types";
import { demoTeam } from "./team-demo";
import {
  availabilitySummary,
  type StaffMember,
  type StaffRole,
  weekStartOf,
} from "./team-model";

/**
 * Team's reads (H-TEAM). Each read becomes an honest result a block can
 * render: the data; "you need access"; "not configured yet" (a procedure
 * whose service has not landed, or an environment without Duna Database);
 * not found; or a failure with its reference. Nothing here invents a
 * figure: a block without data shows its state.
 */
export type Loaded<T> =
  | { readonly state: "ok"; readonly data: T }
  | { readonly state: "denied" }
  | { readonly state: "not-configured" }
  | { readonly state: "not-found" }
  | { readonly state: "error"; readonly reference: string };

function codeOf(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : undefined;
}

/** The API's "not configured yet" answers, including "needs Duna Database". */
export function isNotConfigured(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    const code = codeOf(current);
    if (code === "NOT_IMPLEMENTED" || code === "DATABASE_REQUIRED") return true;
    if (
      code === "PRECONDITION_FAILED" &&
      current instanceof Error &&
      current.message === PROVIDER_NOT_CONFIGURED_MESSAGE
    ) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export async function settle<T>(
  read: () => Promise<T>,
  block: string,
): Promise<Loaded<T>> {
  try {
    return { state: "ok", data: await read() };
  } catch (error) {
    if (isPermissionDenied(error)) return { state: "denied" };
    if (isNotConfigured(error)) {
      log.info("hq.team.block_not_configured", { block });
      return { state: "not-configured" };
    }
    if (codeOf(error) === "NOT_FOUND") return { state: "not-found" };
    const reference = report(error, {
      event: "hq.team.block_failed",
      tags: { block },
    });
    return { state: "error", reference };
  }
}

/** Who is looking, and what they may do here. */
export interface TeamContext {
  readonly session: ShellSession;
  readonly organization: string;
  readonly timeZone: string;
  readonly personId?: string;
  /** Sees the team (coaches, front desk, managers, owner). */
  readonly canSeeTeam: boolean;
  /** Changes the team, decides time off, arranges cover. */
  readonly canManage: boolean;
  /** Sees everyone's pay and the pay runs. */
  readonly canSeePay: boolean;
  /** Changes pay, computes, approves and exports pay runs (owner). */
  readonly canWritePay: boolean;
  readonly now: string;
}

export const teamContext = cache(async (): Promise<TeamContext> => {
  const session = await getHqSession();
  const canManage = hasScope(session, "members:write");
  return {
    session,
    organization: session.organization?.name ?? "your club",
    timeZone: session.organization?.timezone ?? "UTC",
    personId: session.person?.id,
    canSeeTeam: hasScope(session, "members:read"),
    canManage,
    // The pay procedures: members:read plus members:write or payments:read.
    canSeePay:
      hasScope(session, "members:read") &&
      (canManage || hasScope(session, "payments:read")),
    canWritePay: hasScope(session, "payments:write"),
    now: new Date().toISOString(),
  };
});

/** The workspace's team: staff, invitations and what the viewer may invite. */
export interface TeamWorkspace {
  readonly staff: readonly StaffMember[];
  readonly invitations: OperatorWorkspace["staffInvitations"];
  readonly canInviteDirector: boolean;
  readonly canTransferOwnership: boolean;
  /** Offering kinds the club sells (for a revenue share's scope). */
  readonly offeringKinds: readonly string[];
  readonly currency: StaffMember["currency"];
  readonly demo: boolean;
}

export const loadTeamWorkspace = cache(
  async (): Promise<Loaded<TeamWorkspace>> => {
    const caller = await getServerCaller();
    const session = await getHqSession();
    const workspace = await settle(
      () => caller.operator.workspace(),
      "workspace",
    );
    if (workspace.state !== "ok") return workspace;
    const demo = usesDemoData() && workspace.data.staff.length === 0;
    const staff = demo
      ? demoTeam(session.roles)
      : [...workspace.data.staff].sort((a, b) =>
          a.displayName.localeCompare(b.displayName),
        );
    return {
      state: "ok",
      data: {
        staff,
        invitations: workspace.data.staffInvitations,
        canInviteDirector:
          workspace.data.teamAccess.canInviteDirector ||
          (demo && session.roles.includes("owner")),
        canTransferOwnership: workspace.data.teamAccess.canTransferOwnership,
        offeringKinds: [
          ...new Set(workspace.data.catalog.map((item) => item.subtype)),
        ]
          .filter(Boolean)
          .sort(),
        currency: staff[0]?.currency ?? "USD",
        demo,
      },
    };
  },
);

export const loadAvailability = cache(async (staffProfileId: string) => {
  const caller = await getServerCaller();
  return settle(
    () => caller.operator.teamAvailability.staff({ staffProfileId }),
    "availability",
  );
});

/** One roster line's availability: the shared rule's sentence and flags. */
export interface AvailabilityGlance {
  readonly summary?: string;
  readonly hasSchedule: boolean;
  readonly needsCover: number;
  readonly timeOffAsked: number;
  readonly loaded: boolean;
}

export function glanceOf(
  loaded: Loaded<TeamAvailabilityStaff>,
  context: Pick<TeamContext, "now" | "timeZone">,
): AvailabilityGlance {
  if (loaded.state !== "ok") {
    return { hasSchedule: true, needsCover: 0, timeOffAsked: 0, loaded: false };
  }
  const page = loaded.data;
  return {
    summary: availabilitySummary({
      schedules: page.schedules,
      blackouts: page.blackouts,
      timeOff: page.timeOff,
      now: context.now,
      timeZone: context.timeZone,
    }),
    hasSchedule: page.schedules.some(
      (row) => row.status === "active" || row.status === "fallback",
    ),
    needsCover:
      page.blackouts.reduce((sum, row) => sum + row.sessionsNeedingCover, 0) +
      page.timeOff
        .filter((row) => row.status === "approved")
        .reduce((sum, row) => sum + row.sessionsNeedingCover, 0),
    timeOffAsked: page.timeOff.filter((row) => row.status === "requested")
      .length,
    loaded: true,
  };
}

/** Availability for every member, read through the shared rule (one read each). */
export async function loadRosterAvailability(
  staff: readonly StaffMember[],
  context: Pick<TeamContext, "now" | "timeZone">,
): Promise<Record<string, AvailabilityGlance>> {
  const pages = await Promise.all(
    staff
      .slice(0, 60)
      .map(
        async (member) =>
          [member.id, await loadAvailability(member.id)] as const,
      ),
  );
  return Object.fromEntries(
    pages.map(([id, page]) => [id, glanceOf(page, context)]),
  );
}

export const loadCompensation = cache(async (staffProfileId: string) => {
  const caller = await getServerCaller();
  return settle(
    () => caller.operator.teamPay.staffCompensation({ staffProfileId }),
    "compensation",
  );
});

export const loadPayPeriods = cache(async () => {
  const caller = await getServerCaller();
  return settle(() => caller.operator.teamPay.payPeriods(), "payPeriods");
});

export const loadPayRuns = cache(async () => {
  const caller = await getServerCaller();
  return settle(() => caller.operator.teamPay.payRuns({}), "payRuns");
});

export const loadPayRun = cache(
  async (payRunId: string): Promise<Loaded<TeamPayRun>> => {
    const caller = await getServerCaller();
    return settle(() => caller.operator.teamPay.payRun({ payRunId }), "payRun");
  },
);

/** Contractor payouts through Duna Pay: switched off until reviewed (B3c). */
export const loadPayoutsReady = cache(async () => {
  const caller = await getServerCaller();
  return settle(() => caller.operator.teamPayouts.status(), "payoutsStatus");
});

export interface CoverageView {
  readonly requests: readonly TeamAvailabilityCoverageRequest[];
  readonly weeks: readonly Loaded<TeamAvailabilityCoverageGrid>[];
  readonly from: string;
  readonly to: string;
}

/** The coming two weeks: what needs cover, and the hour-by-hour grid. */
export const loadCoverage = cache(
  async (
    context: Pick<TeamContext, "now" | "timeZone">,
  ): Promise<Loaded<CoverageView>> => {
    const caller = await getServerCaller();
    const from = context.now;
    const to = new Date(Date.parse(from) + 14 * 86_400_000).toISOString();
    const today = localDateOf(Date.parse(from), context.timeZone);
    const thisWeek = weekStartOf(today);
    const [requests, ...weeks] = await Promise.all([
      settle(
        () =>
          caller.operator.teamAvailability.coverageRequests({
            status: ["open", "asking", "nobody-free"],
            from,
            to,
          }),
        "coverageRequests",
      ),
      ...[thisWeek, addCalendarDays(thisWeek, 7)].map((weekStartsOn) =>
        settle(
          () => caller.operator.teamAvailability.coverageGrid({ weekStartsOn }),
          "coverageGrid",
        ),
      ),
    ]);
    if (requests.state !== "ok") return requests;
    return {
      state: "ok",
      data: { requests: requests.data.requests, weeks, from, to },
    };
  },
);

/** What each staff role may do: the backend's role table, read on the server. */
export function roleScopes(role: StaffRole, isOwner = false): string[] {
  if (isOwner) return ["*"];
  const personRole: PersonRole = role === "director" ? "manager" : role;
  return [...scopesForRoles([personRole])];
}
