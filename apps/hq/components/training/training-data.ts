import type {
  TrainingDrillsDetail,
  TrainingProgramsProgram,
  TrainingProgramsSession,
} from "@duna/api";
import { PROVIDER_NOT_CONFIGURED_MESSAGE } from "@duna/api/observability";
import { log, report } from "@duna/observability";
import {
  addCalendarDays as addDaysIso,
  availabilityFor,
  type BusyReason,
  localDateOf,
} from "@duna/scheduling";
import { cache } from "react";
import { getServerCaller } from "@/lib/api";
import { isPermissionDenied } from "@/lib/permission-denied";
import { getHqSession, hasScope } from "../shell/hq-session";
import type { ShellSession } from "../shell/session-types";
import { loadTeamWorkspace } from "../team/team-data";
import { toRuleSchedule } from "../team/team-model";
import type { LibraryTab } from "./drill-model";

/**
 * Training's reads (H-TRAIN). Every read becomes an honest result a block
 * renders: the data; "you need access"; "not configured yet"; not found; or
 * a failure with its reference. Nothing here invents a figure.
 */
export type Loaded<T> =
  | { readonly state: "ok"; readonly data: T }
  | { readonly state: "denied" }
  | { readonly state: "not-configured"; readonly message?: string }
  | { readonly state: "not-found" }
  | { readonly state: "error"; readonly reference: string };

function codeOf(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : undefined;
}

export function isNotConfigured(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    const code = codeOf(current);
    if (code === "NOT_IMPLEMENTED" || code === "DATABASE_REQUIRED") return true;
    if (
      code === "PRECONDITION_FAILED" &&
      current instanceof Error &&
      (current.message === PROVIDER_NOT_CONFIGURED_MESSAGE ||
        /not configured/i.test(current.message))
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
      log.info("hq.training.block_not_configured", { block });
      return { state: "not-configured" };
    }
    if (codeOf(error) === "NOT_FOUND") return { state: "not-found" };
    const reference = report(error, {
      event: "hq.training.block_failed",
      tags: { block },
    });
    return { state: "error", reference };
  }
}

/** Who is looking, and what they may do in Training. */
export interface TrainingContext {
  readonly session: ShellSession;
  readonly organization: string;
  readonly timeZone: string;
  readonly personId?: string;
  /** Sees schedules (front desk included). */
  readonly canRead: boolean;
  /** Plans, drills and their own programs' practices (coaches, managers, owner). */
  readonly canWrite: boolean;
  /** Creates, changes, activates and cancels programs (managers, owner). */
  readonly canManage: boolean;
  readonly now: string;
}

export const trainingContext = cache(async (): Promise<TrainingContext> => {
  const session = await getHqSession();
  return {
    session,
    organization: session.organization?.name ?? "your club",
    timeZone: session.organization?.timezone ?? "UTC",
    personId: session.person?.id,
    canRead: hasScope(session, "training:read"),
    canWrite: hasScope(session, "training:write"),
    canManage:
      hasScope(session, "members:write") && hasScope(session, "training:write"),
    now: new Date().toISOString(),
  };
});

/** Runs this program's practices: a manager, or one of its coaches. */
export function canRunProgram(
  context: TrainingContext,
  program: Pick<TrainingProgramsProgram, "coaches">,
): boolean {
  if (context.canManage) return true;
  return (
    context.canWrite &&
    program.coaches.some((coach) => coach.personId === context.personId)
  );
}

export const loadPrograms = cache(async () => {
  const caller = await getServerCaller();
  return settle(() => caller.operator.trainingPrograms.list({}), "programs");
});

export const loadProgram = cache(async (programId: string) => {
  const caller = await getServerCaller();
  return settle(
    () => caller.operator.trainingPrograms.program({ programId }),
    "program",
  );
});

/** The program's whole season (the window is capped at 400 days). */
export const loadProgramSessions = cache(
  async (programId: string, startDate: string, endDate: string) => {
    const caller = await getServerCaller();
    const from = `${addDaysIso(startDate, -1)}T00:00:00.000Z`;
    const lastDay = addDaysIso(startDate, 398);
    const to = `${addDaysIso(endDate < lastDay ? endDate : lastDay, 2)}T00:00:00.000Z`;
    return settle(
      () => caller.operator.trainingPrograms.sessions({ programId, from, to }),
      "sessions",
    );
  },
);

/** The club's sessions in a window (the practice page finds its own here). */
export const loadSessionsBetween = cache(async (from: string, to: string) => {
  const caller = await getServerCaller();
  return settle(
    () => caller.operator.trainingPrograms.sessions({ from, to }),
    "sessions",
  );
});

export const loadConflicts = cache(async (programId: string) => {
  const caller = await getServerCaller();
  return settle(
    () => caller.operator.trainingPrograms.conflicts({ programId }),
    "conflicts",
  );
});

export const loadOutcome = cache(async (sessionId: string) => {
  const caller = await getServerCaller();
  return settle(
    () => caller.operator.trainingPrograms.sessionOutcome({ sessionId }),
    "outcome",
  );
});

export const loadPracticePlans = cache(async () => {
  const caller = await getServerCaller();
  return settle(
    () => caller.operator.trainingPrograms.practicePlans({}),
    "practicePlans",
  );
});

export const loadPracticePlan = cache(async (practicePlanId: string) => {
  const caller = await getServerCaller();
  return settle(
    () => caller.operator.trainingPrograms.practicePlan({ practicePlanId }),
    "practicePlan",
  );
});

export const loadLibrary = cache(
  async (scope: Exclude<LibraryTab, "store">, query?: string) => {
    const caller = await getServerCaller();
    return settle(
      () =>
        caller.operator.trainingDrills.library({
          scope,
          ...(query ? { query } : {}),
        }),
      "library",
    );
  },
);

export const loadStore = cache(async (query?: string) => {
  const caller = await getServerCaller();
  return settle(
    () => caller.operator.trainingDrills.store(query ? { query } : {}),
    "store",
  );
});

export const loadPurchases = cache(async () => {
  const caller = await getServerCaller();
  return settle(() => caller.operator.trainingDrills.purchases(), "purchases");
});

export const loadDrill = cache(
  async (drillId: string): Promise<Loaded<TrainingDrillsDetail>> => {
    const caller = await getServerCaller();
    return settle(
      () => caller.operator.trainingDrills.drill({ drillId }),
      "drill",
    );
  },
);

/** Every drill a plan can use: mine, the club's, Duna's and purchased. */
export const loadPlanLibrary = cache(async () => {
  const scopes = ["personal", "club", "duna", "purchased"] as const;
  const results = await Promise.all(scopes.map((scope) => loadLibrary(scope)));
  const seen = new Set<string>();
  const items = results.flatMap((result) =>
    result.state === "ok" ? result.data.items : [],
  );
  return {
    items: items.filter((item) =>
      seen.has(item.id) ? false : (seen.add(item.id), true),
    ),
    failed: results.find((result) => result.state !== "ok"),
  };
});

/** The club's coaches (people who can be put on a program or a practice). */
export interface CoachOption {
  readonly personId: string;
  readonly staffProfileId: string;
  readonly displayName: string;
  readonly role: string;
}

export const loadCoaches = cache(async (): Promise<CoachOption[]> => {
  const workspace = await loadTeamWorkspace();
  if (workspace.state !== "ok") return [];
  return workspace.data.staff
    .filter(
      (member) =>
        member.active &&
        (member.role === "coach" ||
          member.role === "director" ||
          member.role === "manager"),
    )
    .map((member) => ({
      personId: member.personId,
      staffProfileId: member.id,
      displayName: member.displayName,
      role: member.role,
    }));
});

export interface CoachVerdict {
  readonly personId: string;
  readonly displayName: string;
  readonly free: boolean;
  /** The shared availability rule's answer in words. */
  readonly words: string;
}

const busyWords: Record<BusyReason, string> = {
  "time-off": "on approved time off",
  blackout: "has blocked this time",
  commitment: "already booked then",
  "outside-hours": "outside their hours",
  "no-schedule": "no availability set",
};

/**
 * Who can coach this practice, by the team's shared availability rule
 * (`availabilityFor`): free for all of it, or why not, in words.
 */
export async function coachVerdicts(
  session: Pick<TrainingProgramsSession, "startsAt" | "endsAt">,
  coaches: readonly CoachOption[],
): Promise<CoachVerdict[]> {
  const caller = await getServerCaller();
  const rows = await Promise.all(
    coaches.slice(0, 20).map(async (coach) => {
      const page = await settle(
        () =>
          caller.operator.teamAvailability.staff({
            staffProfileId: coach.staffProfileId,
          }),
        "coachAvailability",
      );
      if (page.state !== "ok") {
        return {
          personId: coach.personId,
          displayName: coach.displayName,
          free: false,
          words: "availability can't be read right now",
        };
      }
      const result = availabilityFor(
        { staffProfileId: coach.staffProfileId },
        { startsAt: session.startsAt, endsAt: session.endsAt },
        {
          schedules: page.data.schedules.map(toRuleSchedule),
          blackouts: page.data.blackouts.map((row) => ({
            id: row.id,
            startsAt: row.startsAt,
            endsAt: row.endsAt,
          })),
          timeOff: page.data.timeOff.map((row) => ({
            id: row.id,
            startsAt: row.startsAt,
            endsAt: row.endsAt,
            status: row.status,
          })),
          commitments: [],
        },
      );
      const reason = result.busy[0]?.reason;
      return {
        personId: coach.personId,
        displayName: coach.displayName,
        free: result.busy.length === 0,
        words: reason ? busyWords[reason] : "free for the whole practice",
      };
    }),
  );
  return rows.sort(
    (a, b) =>
      Number(b.free) - Number(a.free) ||
      a.displayName.localeCompare(b.displayName),
  );
}

/** Today in the club's zone ("2026-11-28"). */
export function clubToday(context: TrainingContext): string {
  return localDateOf(Date.parse(context.now), context.timeZone);
}

/** The club's places, for a program's practices. */
export const loadVenues = cache(async () => {
  const caller = await getServerCaller();
  const workspace = await settle(() => caller.operator.workspace(), "venues");
  return workspace.state === "ok"
    ? workspace.data.venues.map((venue) => ({ id: venue.id, name: venue.name }))
    : [];
});
