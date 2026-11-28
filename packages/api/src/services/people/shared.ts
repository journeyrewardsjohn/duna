/**
 * Shared rules for `operator.people.*` (PEOPLE-API).
 *
 * Tenancy: every person id is checked against the caller's club; a person
 * the club does not know (or another club's id) is NOT_FOUND, never
 * FORBIDDEN, so ids cannot be probed. Coaches (without owner or manager)
 * read only the people they coach. Logs carry ids and counts only.
 */
import {
  auditLog,
  catalogFulfillments,
  catalogSessionOccurrences,
  getDatabase,
  getTransactionalDatabase,
  membershipTiers,
  memberships,
  orders,
  organizationMemberships,
  organizationParticipants,
  people,
  registrations,
  sessions,
} from "@duna/db";
import { eq, inArray, sql } from "drizzle-orm";
import { stableHash } from "../../canonical";
import type { ApiActor } from "../../context";
import { usesDemoData } from "../data-source";

export type PeopleErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "CONFLICT"
  | "BAD_REQUEST"
  | "PRECONDITION_FAILED";

export class PeopleError extends Error {
  constructor(
    readonly code: PeopleErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PeopleError";
  }
}

export interface PeopleContext {
  readonly actor: ApiActor;
  readonly organizationId: string;
  readonly now: Date;
  readonly requestId: string;
  readonly ipAddress?: string;
}

export function peopleUseDemo(): boolean {
  return usesDemoData();
}

export function notFound(): never {
  throw new PeopleError("NOT_FOUND", "This person was not found in your club.");
}

/** Owner, manager or anyone with `*`: manages people. */
export function managesPeople(actor: ApiActor): boolean {
  return (
    actor.scopes.includes("*") ||
    actor.roles.includes("owner") ||
    actor.roles.includes("manager")
  );
}

/** A coach without a managing role reads only the people they coach. */
export function coachOnly(actor: ApiActor): boolean {
  return actor.roles.includes("coach") && !managesPeople(actor);
}

export function readsPayments(actor: ApiActor): boolean {
  return actor.scopes.includes("*") || actor.scopes.includes("payments:read");
}

/**
 * Club people among `personIds`: participants, members of a club plan,
 * staff, buyers and booked players. One query per source, no per-person
 * loop.
 */
export async function clubPersonIds(
  organizationId: string,
  personIds: readonly string[],
): Promise<Set<string>> {
  const ids = [...new Set(personIds)];
  if (ids.length === 0) return new Set();
  const rows = await getDatabase().execute<{ person_id: string }>(sql`
    select ${organizationParticipants.personId} as person_id from ${organizationParticipants}
      where ${organizationParticipants.organizationId} = ${organizationId}
        and ${inArray(organizationParticipants.personId, ids)}
    union
    select ${memberships.personId} from ${memberships}
      join ${membershipTiers} on ${membershipTiers.id} = ${memberships.tierId}
      where ${membershipTiers.organizationId} = ${organizationId}
        and ${inArray(memberships.personId, ids)}
    union
    select ${organizationMemberships.personId} from ${organizationMemberships}
      where ${organizationMemberships.organizationId} = ${organizationId}
        and ${inArray(organizationMemberships.personId, ids)}
    union
    select ${orders.buyerPersonId} from ${orders}
      where ${orders.organizationId} = ${organizationId}
        and ${inArray(orders.buyerPersonId, ids)}
    union
    select ${catalogFulfillments.personId} from ${catalogFulfillments}
      where ${catalogFulfillments.organizationId} = ${organizationId}
        and ${inArray(catalogFulfillments.personId, ids)}
  `);
  return new Set(
    rowsOf<{ person_id: string }>(rows).map((row) => row.person_id),
  );
}

/** Rows from `db.execute` across the Neon and PGlite drivers. */
export function rowsOf<Row>(result: unknown): Row[] {
  if (Array.isArray(result)) return result as Row[];
  return ((result as { rows?: Row[] }).rows ?? []) as Row[];
}

/** People the coach coaches at this club (a booking in a session they lead). */
export async function coachedPersonIds(
  organizationId: string,
  coachPersonId: string,
  personIds: readonly string[],
): Promise<Set<string>> {
  const ids = [...new Set(personIds)];
  if (ids.length === 0) return new Set();
  const rows = await getDatabase().execute<{ person_id: string }>(sql`
    select ${registrations.personId} as person_id from ${registrations}
      join ${sessions} on ${sessions.id} = ${registrations.sessionId}
      where ${sessions.coachPersonId} = ${coachPersonId}
        and ${inArray(registrations.personId, ids)}
    union
    select ${catalogFulfillments.personId} from ${catalogFulfillments}
      join ${catalogSessionOccurrences}
        on ${catalogSessionOccurrences.id} = ${catalogFulfillments.catalogSessionOccurrenceId}
      where ${catalogFulfillments.organizationId} = ${organizationId}
        and ${coachPersonId} = any(${catalogSessionOccurrences.coachPersonIds})
        and ${inArray(catalogFulfillments.personId, ids)}
  `);
  return new Set(
    rowsOf<{ person_id: string }>(rows).map((row) => row.person_id),
  );
}

/**
 * The person, if the caller may read them at this club; NOT_FOUND
 * otherwise (another club's id, an unknown id, or a coach's non-player).
 */
export async function requireReadablePerson(
  context: PeopleContext,
  personId: string,
) {
  const inClub = await clubPersonIds(context.organizationId, [personId]);
  if (!inClub.has(personId)) notFound();
  if (coachOnly(context.actor)) {
    const coached = await coachedPersonIds(
      context.organizationId,
      context.actor.personId,
      [personId],
    );
    if (!coached.has(personId)) notFound();
  }
  const person = await getDatabase().query.people.findFirst({
    where: eq(people.id, personId),
  });
  if (!person) notFound();
  return person;
}

export function requireManager(actor: ApiActor): void {
  if (!managesPeople(actor)) {
    throw new PeopleError(
      "FORBIDDEN",
      "Only owners and managers can change people records.",
    );
  }
}

type Transaction = Parameters<
  Parameters<ReturnType<typeof getTransactionalDatabase>["transaction"]>[0]
>[0];
type AuditWriter =
  Pick<ReturnType<typeof getDatabase>, "insert"> | Pick<Transaction, "insert">;

export async function writeAudit(
  context: PeopleContext,
  input: {
    readonly action: string;
    readonly entityType: string;
    readonly entityId: string;
    readonly reason: string;
    readonly after?: unknown;
  },
  database: AuditWriter = getDatabase(),
): Promise<void> {
  await database.insert(auditLog).values({
    organizationId: context.organizationId,
    actorPersonId: context.actor.personId,
    actorType: "person",
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    afterHash: input.after === undefined ? undefined : stableHash(input.after),
    reason: input.reason,
    traceId: context.requestId,
    ipAddress: context.ipAddress,
    createdAt: context.now,
  });
}

export function adultBand(
  birthDate: string | null | undefined,
  isMinor: boolean,
  now: Date,
): "unknown" | "under-13" | "teen" | "adult" {
  if (birthDate) {
    const birth = new Date(`${birthDate}T00:00:00.000Z`);
    if (!Number.isNaN(birth.getTime())) {
      let age = now.getUTCFullYear() - birth.getUTCFullYear();
      const beforeBirthday =
        now.getUTCMonth() < birth.getUTCMonth() ||
        (now.getUTCMonth() === birth.getUTCMonth() &&
          now.getUTCDate() < birth.getUTCDate());
      if (beforeBirthday) age -= 1;
      if (age < 13) return "under-13";
      if (age < 18) return "teen";
      return "adult";
    }
  }
  return isMinor ? "teen" : "unknown";
}

/** "a••••@example.com" / "••••4567": enough to recognise, never the address. */
export function maskContact(value: string): string {
  if (value.includes("@")) {
    const [local, domain] = value.split("@");
    return `${(local ?? "").slice(0, 1)}••••@${domain ?? ""}`;
  }
  return `••••${value.slice(-4)}`;
}
