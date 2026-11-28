import type {
  HealthProfile,
  OperatorMemberProfile,
  OperatorWorkspace,
} from "@duna/api";
import { appRouter } from "@duna/api";
import { PROVIDER_NOT_CONFIGURED_MESSAGE } from "@duna/api/observability";
import { log, report } from "@duna/observability";
import { cache } from "react";
import { getServerCaller } from "@/lib/api";
import { isPermissionDenied } from "@/lib/permission-denied";
import { getHqSession, hasScope } from "../shell/hq-session";
import type { ShellSession } from "../shell/session-types";
import { demoFirstDayRequested } from "../today/today-data";
import {
  capabilitiesFrom,
  type PeopleCapabilities,
} from "./people-capabilities";
import {
  canSeeHealth,
  type DuplicateCandidate,
  type PersonRow,
  redactProfile,
  toPersonRow,
} from "./people-model";

/**
 * People's reads (H-PEOPLE). Each read becomes an honest result a block can
 * render: the data; "you need access"; "not configured yet" (a procedure
 * whose service has not landed, or an environment without Duna Database);
 * not found; or a failure with its reference. Everything is cut to what the
 * viewer may see HERE, on the server: a client component never receives a
 * value its viewer is not allowed (health, money, a junior's contact).
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
      log.info("hq.people.block_not_configured", { block });
      return { state: "not-configured" };
    }
    if (codeOf(error) === "NOT_FOUND") return { state: "not-found" };
    const reference = report(error, {
      event: "hq.people.block_failed",
      tags: { block },
    });
    return { state: "error", reference };
  }
}

/** Who is looking, and what they may do here. */
export interface PeopleContext {
  readonly session: ShellSession;
  readonly organization: string;
  readonly timeZone: string;
  readonly roles: readonly string[];
  /** Sees the club's people (coaches, front desk, managers, owner). */
  readonly canSeePeople: boolean;
  /** Adds, edits, imports and merges people; changes memberships. */
  readonly canWrite: boolean;
  /** Sees payments, spend and prices. */
  readonly canSeePayments: boolean;
  /** Grants credits (money changes). */
  readonly canGrantCredits: boolean;
  /** Prepares message drafts for Inbox. */
  readonly canDraft: boolean;
  /** Downloads the people list (owners and managers). */
  readonly canExport: boolean;
  /** Refunds a payment (owners): the same refund Money uses. */
  readonly canRefund: boolean;
  /** Adds someone to a session. */
  readonly canBook: boolean;
  /** Features whose backend has landed (see people-capabilities.ts). */
  readonly capabilities: PeopleCapabilities;
  readonly now: string;
}

/** Every procedure path the API router serves (read once per process). */
function procedurePaths(): string[] {
  const definition = (
    appRouter as unknown as {
      _def?: { procedures?: Record<string, unknown> };
    }
  )._def;
  return Object.keys(definition?.procedures ?? {});
}

export const peopleContext = cache(async (): Promise<PeopleContext> => {
  const session = await getHqSession();
  const canWrite = hasScope(session, "members:write");
  return {
    session,
    organization: session.organization?.name ?? "your club",
    timeZone: session.organization?.timezone ?? "UTC",
    roles: session.roles,
    canSeePeople: hasScope(session, "members:read"),
    canWrite,
    canSeePayments: hasScope(session, "payments:read"),
    canGrantCredits: hasScope(session, "payments:write"),
    canDraft: hasScope(session, "messages:propose"),
    canExport: canWrite,
    canRefund: hasScope(session, "payments:write"),
    canBook: hasScope(session, "sessions:write"),
    capabilities: capabilitiesFrom(procedurePaths()),
    now: new Date().toISOString(),
  };
});

/**
 * Whether this person's Health tab exists for this viewer, decided WITHOUT
 * an access record. The Health service's only read (`memberHealthProfile`)
 * records "health.profile_viewed" for every non-owner call, and its
 * non-recording check (`resolveHealthAccess`) is not exported, so the page
 * never calls the service on load. It decides from the two non-recording
 * parts it can read: the service's viewer roles (owners, managers and coaches
 * for an adult; only coaches for a junior), and the person's active share
 * with the club as the member profile's own grant lookup returns it (the
 * `health` snapshot `operator.memberProfile` builds from health sharing
 * grants). The recording read happens once, when the Health tab is opened,
 * and the service then checks age, guardian approval and the grant again.
 */
function healthTabExists(
  subjectIsJunior: boolean,
  sharedWithClub: boolean,
  context: PeopleContext,
): boolean {
  return sharedWithClub && canSeeHealth(context.roles, subjectIsJunior);
}

export interface PeopleWorkspace {
  readonly rows: readonly PersonRow[];
  /** For duplicate checks in the browser: adults' contact, juniors' names only. */
  readonly candidates: readonly DuplicateCandidate[];
  readonly currency: OperatorWorkspace["organization"]["currency"];
  readonly club: {
    readonly name: string;
    readonly color?: string;
    readonly logo?: string;
    readonly programName?: string;
  };
  /** The club's invitations still waiting, by name only. */
  readonly pendingInvitations: number;
  /** Sessions someone can still be added to. */
  readonly openSessions: readonly {
    readonly id: string;
    readonly title: string;
    readonly startsAt: string;
    readonly timezone: string;
  }[];
  readonly firstDay: boolean;
}

function rowContext(workspace: OperatorWorkspace, context: PeopleContext) {
  return {
    now: new Date(context.now),
    timeZone: workspace.organization.timezone || context.timeZone,
    canSeePayments: context.canSeePayments,
    guardianStatus: new Map(
      workspace.participants.map((participant) => [
        participant.personId,
        participant.guardianStatus,
      ]),
    ),
    verifiedGuardians: new Map(
      workspace.messageRecipients.map((recipient) => [
        recipient.id,
        recipient.verifiedGuardianCount,
      ]),
    ),
    guardianNames: new Map(
      workspace.invitations.flatMap((invitation) =>
        invitation.isMinor && invitation.guardianName
          ? [
              [
                invitation.invitedName.toLocaleLowerCase(),
                invitation.guardianName,
              ] as const,
            ]
          : [],
      ),
    ),
  };
}

const loadWorkspace = cache(async () => {
  const caller = await getServerCaller();
  return settle(() => caller.operator.workspace(), "workspace");
});

export const loadPeople = cache(async (): Promise<Loaded<PeopleWorkspace>> => {
  const context = await peopleContext();
  const workspace = await loadWorkspace();
  if (workspace.state !== "ok") return workspace;
  const firstDay = await demoFirstDayRequested();
  const data = workspace.data;
  const people = firstDay ? [] : data.people;
  const rowsContext = rowContext(data, context);
  const rows = people.map((person) => toPersonRow(person, rowsContext));
  log.info("hq.people.list_loaded", { count: rows.length });
  return {
    state: "ok",
    data: {
      rows,
      candidates: rows.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        isJunior: row.isJunior,
        isGuardian: row.isGuardian,
      })),
      currency: data.organization.currency,
      club: {
        name: data.theme.brandDisplayName || data.organization.name,
        color: data.theme.palette.primary,
        logo: data.theme.logoUrl,
        programName: data.theme.membershipProgramName,
      },
      pendingInvitations: firstDay
        ? 0
        : data.invitations.filter(
            (invitation) => invitation.status === "pending",
          ).length,
      openSessions: data.sessions
        .filter(
          (session) =>
            new Date(session.startsAt).getTime() > Date.now() &&
            !["cancelled", "completed", "draft"].includes(session.status),
        )
        .slice(0, 200)
        .map((session) => ({
          id: session.id,
          title: session.title,
          startsAt: session.startsAt,
          timezone: session.timezone,
        })),
      firstDay,
    },
  };
});

export interface PersonRecord {
  readonly row: PersonRow;
  /** Already redacted for the viewer (see `redactProfile`). */
  readonly profile: OperatorMemberProfile;
  readonly canSeeHealth: boolean;
  readonly people: PeopleWorkspace;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One person, redacted for the viewer, with their row from the list. */
export const loadPerson = cache(
  async (personId: string): Promise<Loaded<PersonRecord>> => {
    if (!uuid.test(personId)) return { state: "not-found" };
    const context = await peopleContext();
    const people = await loadPeople();
    if (people.state !== "ok") return people;
    const row = people.data.rows.find((entry) => entry.id === personId);
    if (!row) return { state: "not-found" };
    const caller = await getServerCaller();
    const profile = await settle(
      () => caller.operator.memberProfile({ personId }),
      "memberProfile",
    );
    if (profile.state !== "ok") return profile;
    const health = healthTabExists(
      row.isJunior,
      profile.data.health !== undefined,
      context,
    );
    return {
      state: "ok",
      data: {
        row,
        profile: redactProfile(profile.data, {
          canSeePayments: context.canSeePayments,
          canSeeHealth: health,
        }),
        canSeeHealth: health,
        people: people.data,
      },
    };
  },
);

/**
 * The person's detailed Health history: the Health service's recording read
 * (one "health.profile_viewed" access record per call). Called only by the
 * Health tab itself, for a viewer whose tab exists; the service checks the
 * person's grant, age and guardian approval again.
 */
export const loadHealthHistory = cache(
  async (personId: string): Promise<Loaded<HealthProfile>> => {
    // The history lives only in Duna Database; without it (demo, local) the
    // honest answer is "not set up", not a failed request.
    if (!process.env.DATABASE_URL) {
      log.info("hq.people.block_not_configured", {
        block: "memberHealthProfile",
      });
      return { state: "not-configured" };
    }
    const caller = await getServerCaller();
    return settle(
      () => caller.operator.memberHealthProfile({ personId }),
      "memberHealthProfile",
    );
  },
);

/** The club's waivers and consent documents (versions and requirements). */
export const loadWaivers = cache(async () => {
  const caller = await getServerCaller();
  return settle(() => caller.operator.waiverWorkspace(), "waiverWorkspace");
});
