/**
 * Training programs (B4): context, permissions, audit and small helpers.
 *
 * Who may do what (docs/product/training.md):
 * - Schedule reads (programs, sessions, conflicts): `training:read`, which
 *   front desk, coaches, managers and owners hold.
 * - Content reads (practice plans, after-practice records with attendance
 *   and notes): `training:write` (coaches, managers, owners). Front desk
 *   reads schedules only.
 * - Programs (create, update, activate, cancel): managers and owners
 *   (`members:write`).
 * - Sessions of a program (add, cancel, coaches, plan, outcome, conflicts):
 *   managers and owners, or a coach of that program.
 * - Practice plans: any coach creates one; the author or a manager edits it.
 * - Another club's ids answer NOT_FOUND, never FORBIDDEN.
 */
import {
  auditLog,
  getDatabase,
  getTransactionalDatabase,
  organizationMemberships,
  organizationStaffProfiles,
  people,
} from "@duna/db";
import { TRPCError } from "@trpc/server";
import { createHash } from "node:crypto";
import { and, eq, inArray, or } from "drizzle-orm";
import { stableHash } from "../../canonical";
import type { ApiActor } from "../../context";

export type Transaction = Parameters<
  Parameters<ReturnType<typeof getTransactionalDatabase>["transaction"]>[0]
>[0];

export interface TrainingContext {
  readonly actor: ApiActor;
  readonly organizationId: string;
  readonly requestId: string;
  readonly now: Date;
  readonly ipAddress?: string;
}

export function hasScope(actor: ApiActor, scope: string): boolean {
  return actor.scopes.includes("*") || actor.scopes.includes(scope);
}

/** Owners and managers (directors hold a manager membership). */
export function isTrainingManager(actor: ApiActor): boolean {
  return hasScope(actor, "members:write");
}

export function forbidden(message: string): never {
  throw new TRPCError({ code: "FORBIDDEN", message });
}
export function notFound(message: string): never {
  throw new TRPCError({ code: "NOT_FOUND", message });
}
export function conflict(message: string): never {
  throw new TRPCError({ code: "CONFLICT", message });
}
export function badRequest(message: string): never {
  throw new TRPCError({ code: "BAD_REQUEST", message });
}

export function assertManager(context: TrainingContext): void {
  if (!isTrainingManager(context.actor)) {
    forbidden("Only an owner or a manager can change programs.");
  }
}

/** Plans, outcomes and notes are coaching content: not front desk. */
export function assertContentReader(context: TrainingContext): void {
  if (!hasScope(context.actor, "training:write")) {
    forbidden("Practice plans and after-practice records are for coaches.");
  }
}

export async function audit(
  transaction: Transaction,
  context: TrainingContext,
  entry: {
    readonly action: string;
    readonly entityType: string;
    readonly entityId: string;
    readonly before?: unknown;
    readonly after?: unknown;
    readonly reason: string;
  },
): Promise<void> {
  await transaction.insert(auditLog).values({
    organizationId: context.organizationId,
    actorPersonId: context.actor.personId,
    actorType: "person",
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    beforeHash: entry.before === undefined ? null : stableHash(entry.before),
    afterHash: entry.after === undefined ? null : stableHash(entry.after),
    reason: entry.reason,
    traceId: context.requestId,
    ipAddress: context.ipAddress ?? null,
    createdAt: context.now,
  });
}

/** A UUID derived from stable parts (deterministic ids for derived rows). */
export function stableUuid(...parts: readonly string[]): string {
  const hex = createHash("sha256").update(parts.join("\u0000")).digest("hex");
  const variant = ((Number.parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function slugify(value: string, suffix: string): string {
  const base = value
    .normalize("NFKD")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${base || "untitled"}-${suffix.slice(0, 6)}`;
}

export function initials(displayName: string): string {
  return (
    displayName
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0]!.toUpperCase())
      .join("")
      .slice(0, 2) || "?"
  );
}

export interface PersonRef {
  readonly personId: string;
  readonly displayName: string;
  readonly initials?: string;
  readonly avatarUrl?: string;
}

function safeUrl(value: string | null): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}

/** One query for every person a read needs (never one per row). */
export async function loadPeople(
  ids: Iterable<string | null | undefined>,
): Promise<Map<string, PersonRef>> {
  const unique = [...new Set([...ids].filter((id): id is string => !!id))];
  if (unique.length === 0) return new Map();
  const rows = await getDatabase()
    .select({
      id: people.id,
      displayName: people.displayName,
      avatarUrl: people.avatarUrl,
    })
    .from(people)
    .where(inArray(people.id, unique));
  return new Map(
    rows.map((row) => {
      const avatarUrl = safeUrl(row.avatarUrl);
      return [
        row.id,
        {
          personId: row.id,
          displayName: row.displayName || "Member",
          initials: initials(row.displayName || "Member"),
          ...(avatarUrl ? { avatarUrl } : {}),
        },
      ];
    }),
  );
}

export function personRef(
  map: ReadonlyMap<string, PersonRef>,
  id: string | null | undefined,
): PersonRef | undefined {
  return id ? map.get(id) : undefined;
}

/** Coaches must be staff of this club (a staff profile or a staff membership). */
export async function assertClubStaff(
  organizationId: string,
  personIds: readonly string[],
): Promise<void> {
  const unique = [...new Set(personIds)];
  if (unique.length === 0) return;
  const [profiles, memberships] = await Promise.all([
    getDatabase()
      .select({ personId: organizationStaffProfiles.personId })
      .from(organizationStaffProfiles)
      .where(
        and(
          eq(organizationStaffProfiles.organizationId, organizationId),
          eq(organizationStaffProfiles.active, true),
          inArray(organizationStaffProfiles.personId, unique),
        ),
      ),
    getDatabase()
      .select({ personId: organizationMemberships.personId })
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.organizationId, organizationId),
          eq(organizationMemberships.active, true),
          inArray(organizationMemberships.personId, unique),
          or(
            eq(organizationMemberships.role, "coach"),
            eq(organizationMemberships.role, "manager"),
            eq(organizationMemberships.role, "owner"),
          ),
        ),
      ),
  ]);
  const staff = new Set([
    ...profiles.map((row) => row.personId),
    ...memberships.map((row) => row.personId),
  ]);
  if (unique.some((id) => !staff.has(id))) {
    badRequest("Every coach must be on this club's team.");
  }
}

/** Athletes must be real people; nothing about them is returned here. */
export async function assertPeopleExist(personIds: readonly string[]) {
  const unique = [...new Set(personIds)];
  if (unique.length === 0) return;
  const rows = await getDatabase()
    .select({ id: people.id })
    .from(people)
    .where(inArray(people.id, unique));
  if (rows.length !== unique.length) {
    badRequest("Some athletes could not be found.");
  }
}

export function isoDate(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
