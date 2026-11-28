/**
 * The waitlist for group sessions (participation.md §7.2, PART-4): join a
 * full session, leave, be offered a place with a hold (2 hours, never past
 * the start), let an unanswered offer expire. An offered place is held for
 * that person: nobody else's checkout can take it while the hold runs.
 */
import {
  catalogItems,
  catalogSessionOccurrences,
  getDatabase,
  participationWaitlistEntries,
} from "@duna/db";
import { PARTICIPATION_WAITLIST_HOLD_MINUTES } from "@duna/core";
import { log } from "@duna/observability";
import { and, asc, eq, gt, inArray, lte, ne, sql } from "drizzle-orm";
import { assertGuardianCanBookFor } from "../../catalog-checkout";
import type { ApiActor } from "../../context";
import {
  CATALOG_SUBJECT,
  ParticipationError,
  catalogSessionPicture,
  queueParticipationNotices,
  requireParticipationDatabase,
} from "./catalog";
import { personHoldsPlace } from "./player";

type Entry = typeof participationWaitlistEntries.$inferSelect;

/** Places held for people with a live offer, except `exceptPersonId`'s own. */
export async function offeredPlaces(input: {
  readonly subjectId: string;
  readonly now: Date;
  readonly exceptPersonId?: string;
}): Promise<number> {
  const rows = await getDatabase()
    .select({ quantity: participationWaitlistEntries.quantity })
    .from(participationWaitlistEntries)
    .where(
      and(
        eq(participationWaitlistEntries.subjectType, CATALOG_SUBJECT),
        eq(participationWaitlistEntries.subjectId, input.subjectId),
        eq(participationWaitlistEntries.status, "offered"),
        gt(participationWaitlistEntries.holdExpiresAt, input.now),
        input.exceptPersonId
          ? ne(participationWaitlistEntries.personId, input.exceptPersonId)
          : undefined,
      ),
    );
  return rows.reduce((total, row) => total + row.quantity, 0);
}

async function loadSubject(subjectId: string) {
  const row = await getDatabase()
    .select({ occurrence: catalogSessionOccurrences, item: catalogItems })
    .from(catalogSessionOccurrences)
    .innerJoin(catalogItems, eq(catalogSessionOccurrences.catalogItemId, catalogItems.id))
    .where(eq(catalogSessionOccurrences.id, subjectId))
    .limit(1)
    .then((rows) => rows[0]);
  if (!row) throw new ParticipationError("NOT_FOUND", "This session was not found.");
  return row;
}

/** The person's place in line among people still waiting (1 = next). */
async function rankOf(entry: Entry): Promise<number> {
  const ahead = await getDatabase()
    .select({ id: participationWaitlistEntries.id })
    .from(participationWaitlistEntries)
    .where(
      and(
        eq(participationWaitlistEntries.subjectType, entry.subjectType),
        eq(participationWaitlistEntries.subjectId, entry.subjectId),
        inArray(participationWaitlistEntries.status, ["waiting", "offered"]),
        sql`${participationWaitlistEntries.position} < ${entry.position}`,
      ),
    );
  return ahead.length + 1;
}

export async function joinParticipationWaitlist(input: {
  readonly actor: ApiActor;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly participantPersonId?: string;
  readonly quantity: number;
  readonly now: Date;
}): Promise<{
  readonly entryId: string;
  readonly position: number;
  readonly status: "waiting" | "offered";
}> {
  requireParticipationDatabase();
  if (input.subjectType !== CATALOG_SUBJECT) {
    throw new ParticipationError("INVALID", "This session has no waitlist yet.");
  }
  const participant = input.participantPersonId ?? input.actor.personId;
  if (participant !== input.actor.personId) {
    try {
      await assertGuardianCanBookFor({ actor: input.actor, participantPersonId: participant });
    } catch {
      throw new ParticipationError("FORBIDDEN", "You can only add family members you manage.");
    }
  }
  const { occurrence, item } = await loadSubject(input.subjectId);
  if (occurrence.status !== "scheduled" || occurrence.startsAt <= input.now) {
    throw new ParticipationError("NOT_ALLOWED", "This session is no longer taking bookings.");
  }
  const picture = await catalogSessionPicture({ occurrence, item, now: input.now });
  if (!picture?.rule.waitlist) {
    throw new ParticipationError("NOT_ALLOWED", "This session doesn't keep a waitlist.");
  }
  if (await personHoldsPlace({ occurrenceId: occurrence.id, personId: participant, now: input.now })) {
    throw new ParticipationError("CONFLICT", "You're already booked for this session.");
  }
  const database = getDatabase();
  const existing = await database.query.participationWaitlistEntries.findFirst({
    where: and(
      eq(participationWaitlistEntries.subjectType, CATALOG_SUBJECT),
      eq(participationWaitlistEntries.subjectId, occurrence.id),
      eq(participationWaitlistEntries.personId, participant),
      inArray(participationWaitlistEntries.status, ["waiting", "offered"]),
    ),
  });
  if (existing) {
    return {
      entryId: existing.id,
      position: await rankOf(existing),
      status: existing.status === "offered" ? "offered" : "waiting",
    };
  }
  const open =
    occurrence.capacity -
    picture.confirmed -
    picture.held -
    (await offeredPlaces({ subjectId: occurrence.id, now: input.now }));
  if (open >= input.quantity) {
    throw new ParticipationError("CONFLICT", "There's a place now: book it instead.");
  }
  // Positions are unique per session; a concurrent join retries once.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const [{ next }] = (await database
      .select({ next: sql<number>`coalesce(max(${participationWaitlistEntries.position}), 0)::int + 1` })
      .from(participationWaitlistEntries)
      .where(
        and(
          eq(participationWaitlistEntries.subjectType, CATALOG_SUBJECT),
          eq(participationWaitlistEntries.subjectId, occurrence.id),
        ),
      )) as [{ next: number }];
    const inserted = await database
      .insert(participationWaitlistEntries)
      .values({
        organizationId: occurrence.organizationId,
        subjectType: CATALOG_SUBJECT,
        subjectId: occurrence.id,
        personId: participant,
        requestedByPersonId: input.actor.personId,
        quantity: input.quantity,
        position: next,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .onConflictDoNothing()
      .returning();
    const entry = inserted[0];
    if (entry) {
      const position = await rankOf(entry);
      log.info("participation.waitlist.changed", {
        organizationId: occurrence.organizationId,
        subjectId: occurrence.id,
        step: "joined",
        position,
      });
      return { entryId: entry.id, position, status: "waiting" };
    }
  }
  throw new ParticipationError("CONFLICT", "The waitlist is busy. Try again.");
}

export async function leaveParticipationWaitlist(input: {
  readonly actor: ApiActor;
  readonly entryId: string;
  readonly now: Date;
}): Promise<{ readonly status: "cancelled" }> {
  requireParticipationDatabase();
  const database = getDatabase();
  const entry = await database.query.participationWaitlistEntries.findFirst({
    where: eq(participationWaitlistEntries.id, input.entryId),
  });
  if (
    !entry ||
    (entry.personId !== input.actor.personId &&
      entry.requestedByPersonId !== input.actor.personId)
  ) {
    throw new ParticipationError("NOT_FOUND", "This waitlist place was not found.");
  }
  if (entry.status === "waiting" || entry.status === "offered") {
    await database
      .update(participationWaitlistEntries)
      .set({ status: "cancelled", updatedAt: input.now })
      .where(eq(participationWaitlistEntries.id, entry.id));
    // A declined offer frees its place for the next person.
    if (entry.status === "offered") {
      await offerOpenPlaces({ now: input.now, subjectId: entry.subjectId });
    }
  }
  return { status: "cancelled" };
}

/** The viewer's own waitlist place for a session, if any. */
export async function myWaitlistEntry(input: {
  readonly subjectId: string;
  readonly personId: string;
}): Promise<
  | {
      readonly entryId: string;
      readonly position: number;
      readonly status: "waiting" | "offered";
      readonly holdExpiresAt?: string;
    }
  | undefined
> {
  const entry = await getDatabase().query.participationWaitlistEntries.findFirst({
    where: and(
      eq(participationWaitlistEntries.subjectType, CATALOG_SUBJECT),
      eq(participationWaitlistEntries.subjectId, input.subjectId),
      eq(participationWaitlistEntries.personId, input.personId),
      inArray(participationWaitlistEntries.status, ["waiting", "offered"]),
    ),
  });
  if (!entry) return undefined;
  return {
    entryId: entry.id,
    position: await rankOf(entry),
    status: entry.status === "offered" ? "offered" : "waiting",
    ...(entry.holdExpiresAt ? { holdExpiresAt: entry.holdExpiresAt.toISOString() } : {}),
  };
}

/** Marks the participant's waitlist place accepted once they booked. */
export async function acceptWaitlistOnBooking(input: {
  readonly subjectId: string;
  readonly personId: string;
  readonly now: Date;
}): Promise<void> {
  await getDatabase()
    .update(participationWaitlistEntries)
    .set({ status: "accepted", acceptedAt: input.now, updatedAt: input.now })
    .where(
      and(
        eq(participationWaitlistEntries.subjectType, CATALOG_SUBJECT),
        eq(participationWaitlistEntries.subjectId, input.subjectId),
        eq(participationWaitlistEntries.personId, input.personId),
        inArray(participationWaitlistEntries.status, ["waiting", "offered"]),
      ),
    );
}

/** Offers that ran out become "expired"; their places go to the next person. */
export async function expireWaitlistOffers(input: { readonly now: Date }): Promise<number> {
  const expired = await getDatabase()
    .update(participationWaitlistEntries)
    .set({ status: "expired", updatedAt: input.now })
    .where(
      and(
        eq(participationWaitlistEntries.status, "offered"),
        lte(participationWaitlistEntries.holdExpiresAt, input.now),
      ),
    )
    .returning({
      subjectId: participationWaitlistEntries.subjectId,
      organizationId: participationWaitlistEntries.organizationId,
    });
  for (const row of expired) {
    log.info("participation.waitlist.changed", {
      organizationId: row.organizationId,
      subjectId: row.subjectId,
      step: "expired",
    });
  }
  return expired.length;
}

/**
 * Offers open places to people waiting, in order (a cancellation, an expired
 * offer, a capacity raise). Each offer holds its places for 2 hours, never
 * past the start. Safe to repeat: only "waiting" entries are offered.
 */
export async function offerOpenPlaces(input: {
  readonly now: Date;
  readonly subjectId?: string;
}): Promise<number> {
  const database = getDatabase();
  const subjects = input.subjectId
    ? [input.subjectId]
    : (
        await database
          .selectDistinct({ subjectId: participationWaitlistEntries.subjectId })
          .from(participationWaitlistEntries)
          .where(
            and(
              eq(participationWaitlistEntries.subjectType, CATALOG_SUBJECT),
              eq(participationWaitlistEntries.status, "waiting"),
            ),
          )
          .limit(200)
      ).map((row) => row.subjectId);
  let offered = 0;
  for (const subjectId of subjects) {
    const { occurrence, item } = await loadSubject(subjectId);
    if (occurrence.status !== "scheduled" || occurrence.startsAt <= input.now) continue;
    const picture = await catalogSessionPicture({ occurrence, item, now: input.now });
    if (!picture) continue;
    let open =
      occurrence.capacity -
      picture.confirmed -
      picture.held -
      (await offeredPlaces({ subjectId, now: input.now }));
    if (open <= 0) continue;
    const waiting = await database
      .select()
      .from(participationWaitlistEntries)
      .where(
        and(
          eq(participationWaitlistEntries.subjectType, CATALOG_SUBJECT),
          eq(participationWaitlistEntries.subjectId, subjectId),
          eq(participationWaitlistEntries.status, "waiting"),
        ),
      )
      .orderBy(asc(participationWaitlistEntries.position));
    for (const entry of waiting) {
      if (open <= 0) break;
      // Never skip ahead of someone who needs more places than are open.
      if (entry.quantity > open) break;
      const holdExpiresAt = new Date(
        Math.min(
          input.now.getTime() + PARTICIPATION_WAITLIST_HOLD_MINUTES * 60_000,
          occurrence.startsAt.getTime(),
        ),
      );
      const claimed = await database
        .update(participationWaitlistEntries)
        .set({ status: "offered", offeredAt: input.now, holdExpiresAt, updatedAt: input.now })
        .where(
          and(
            eq(participationWaitlistEntries.id, entry.id),
            eq(participationWaitlistEntries.status, "waiting"),
          ),
        )
        .returning({ id: participationWaitlistEntries.id });
      if (claimed.length === 0) continue;
      open -= entry.quantity;
      offered += 1;
      await queueParticipationNotices([
        {
          organizationId: entry.organizationId,
          subjectId,
          recipientPersonId: entry.requestedByPersonId,
          bookingId: entry.id,
          kind: "waitlist-offer",
          scheduledFor: input.now,
        },
      ]);
      log.info("participation.waitlist.changed", {
        organizationId: entry.organizationId,
        subjectId,
        step: "offered",
        position: entry.position,
      });
    }
  }
  return offered;
}
