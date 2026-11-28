/**
 * Merging two thin sessions (participation.md §6): the club moves every
 * booking of one session into another of the same offering, then cancels
 * the emptied one with reason "merged". A move never raises anyone's price:
 * each booking keeps its own reservation and settles at the new session's
 * group, capped at what it reserved. Someone already booked in the target
 * session is refunded instead (they cannot hold two places). Divisions merge
 * the same way: their registrations move to the other division.
 */
import {
  catalogFulfillments,
  catalogItems,
  catalogSessionOccurrences,
  divisions,
  getDatabase,
  participationDecisions,
  registrations,
} from "@duna/db";
import {
  participationReservePerPlayer,
  serializeParticipationRule,
} from "@duna/core";
import { log } from "@duna/observability";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import {
  ParticipationError,
  catalogSessionPicture,
  ensureCatalogDecision,
  queueParticipationNotices,
  requireParticipationDatabase,
} from "./catalog";
import { cancelParticipationSession } from "./operator";
import { confirmedUnits, loadSubjectFacts, subjectRule } from "./subjects";

async function session(organizationId: string, id: string) {
  const row = await getDatabase()
    .select({ occurrence: catalogSessionOccurrences, item: catalogItems })
    .from(catalogSessionOccurrences)
    .innerJoin(
      catalogItems,
      eq(catalogSessionOccurrences.catalogItemId, catalogItems.id),
    )
    .where(
      and(
        eq(catalogSessionOccurrences.id, id),
        eq(catalogSessionOccurrences.organizationId, organizationId),
      ),
    )
    .limit(1)
    .then((rows) => rows[0]);
  if (!row)
    throw new ParticipationError("NOT_FOUND", "This session was not found.");
  return row;
}

export async function mergeParticipationSessions(input: {
  readonly organizationId: string;
  readonly actorPersonId: string;
  readonly fromOccurrenceId: string;
  readonly intoOccurrenceId: string;
  readonly requestId: string;
  readonly now: Date;
}): Promise<{
  readonly moved: number;
  readonly refunded: number;
  readonly priceChanges: readonly {
    readonly bookingId: string;
    readonly creditsReturned: number;
  }[];
}> {
  requireParticipationDatabase();
  if (input.fromOccurrenceId === input.intoOccurrenceId) {
    throw new ParticipationError("INVALID", "Choose two different sessions.");
  }
  const from = await session(input.organizationId, input.fromOccurrenceId);
  const into = await session(input.organizationId, input.intoOccurrenceId);
  if (from.item.id !== into.item.id) {
    throw new ParticipationError(
      "INVALID",
      "Only sessions of the same offering can be merged.",
    );
  }
  for (const side of [from, into]) {
    if (
      side.occurrence.status !== "scheduled" ||
      side.occurrence.startsAt <= input.now
    ) {
      throw new ParticipationError(
        "NOT_ALLOWED",
        "Both sessions must be upcoming and not cancelled.",
      );
    }
  }
  const fromDecision = await ensureCatalogDecision({ ...from, now: input.now });
  if (fromDecision?.outcome) {
    throw new ParticipationError(
      "ALREADY_DECIDED",
      "The group for the first session was already decided.",
    );
  }
  await ensureCatalogDecision({ ...into, now: input.now });
  const fromPicture = await catalogSessionPicture({ ...from, now: input.now });
  const intoPicture = await catalogSessionPicture({ ...into, now: input.now });
  // Never up: the target's most per player can't exceed the source's.
  const fromReserve = fromPicture
    ? participationReservePerPlayer(fromPicture.rule.tiers)
    : undefined;
  const intoReserve = intoPicture
    ? participationReservePerPlayer(intoPicture.rule.tiers)
    : undefined;
  if (
    intoReserve !== undefined &&
    fromReserve !== undefined &&
    intoReserve > fromReserve
  ) {
    throw new ParticipationError(
      "NOT_ALLOWED",
      "Moving these people would raise their price. Choose another session.",
    );
  }
  const intoPeople = new Set(
    (intoPicture?.bookings ?? []).map(
      (booking) => booking.fulfillment.personId,
    ),
  );
  const movable = (fromPicture?.bookings ?? []).filter(
    (booking) => !intoPeople.has(booking.fulfillment.personId),
  );
  const places = movable.reduce(
    (total, booking) => total + booking.quantity,
    0,
  );
  const open =
    into.occurrence.capacity -
    (intoPicture?.confirmed ?? 0) -
    (intoPicture?.held ?? 0);
  if (places > open) {
    throw new ParticipationError(
      "NOT_ALLOWED",
      `The second session has ${Math.max(0, open)} open places; ${places} are needed.`,
    );
  }
  const database = getDatabase();
  for (const booking of movable) {
    await database
      .update(catalogFulfillments)
      .set({
        catalogSessionOccurrenceId: into.occurrence.id,
        details: {
          ...booking.fulfillment.details,
          sessionOccurrenceId: into.occurrence.id,
          sessionStartsAt: into.occurrence.startsAt.toISOString(),
          sessionEndsAt: into.occurrence.endsAt.toISOString(),
          movedFromOccurrenceId: from.occurrence.id,
        },
        updatedAt: input.now,
      })
      .where(
        and(
          eq(catalogFulfillments.id, booking.fulfillment.id),
          eq(
            catalogFulfillments.catalogSessionOccurrenceId,
            from.occurrence.id,
          ),
        ),
      );
  }
  await queueParticipationNotices(
    movable.map((booking) => ({
      organizationId: input.organizationId,
      subjectId: from.occurrence.id,
      recipientPersonId: booking.bookerPersonId,
      bookingId: booking.fulfillment.id,
      kind: "moved" as const,
      scheduledFor: input.now,
    })),
  );
  // Whoever is left (already booked in the target) is refunded in full.
  const cancelled = await cancelParticipationSession({
    organizationId: input.organizationId,
    actorPersonId: input.actorPersonId,
    subjectType: "catalog-session-occurrence",
    subjectId: from.occurrence.id,
    reason: "merged",
    mergedIntoSubjectId: into.occurrence.id,
    requestId: input.requestId,
    now: input.now,
  });
  log.info("participation.intervention.recorded", {
    organizationId: input.organizationId,
    subjectId: from.occurrence.id,
    action: "merge",
    moved: movable.length,
  });
  return {
    moved: movable.length,
    refunded: cancelled.cancellations.length,
    priceChanges: movable.map((booking) => ({
      bookingId: booking.fulfillment.id,
      creditsReturned: 0,
    })),
  };
}

/** A director merges two thin divisions of the same event (§2.2). */
export async function mergeParticipationDivisions(input: {
  readonly actorPersonId: string;
  readonly fromDivisionId: string;
  readonly intoDivisionId: string;
  readonly now: Date;
}): Promise<{ readonly moved: number }> {
  requireParticipationDatabase();
  const database = getDatabase();
  const rows = await database
    .select()
    .from(divisions)
    .where(inArray(divisions.id, [input.fromDivisionId, input.intoDivisionId]));
  const from = rows.find((row) => row.id === input.fromDivisionId);
  const into = rows.find((row) => row.id === input.intoDivisionId);
  if (
    !from ||
    !into ||
    from.id === into.id ||
    from.sessionId !== into.sessionId
  ) {
    throw new ParticipationError(
      "INVALID",
      "Choose two divisions of the same event.",
    );
  }
  const fromFacts = await loadSubjectFacts("division", from.id);
  const intoFacts = await loadSubjectFacts("division", into.id);
  if (!fromFacts || !intoFacts)
    throw new ParticipationError("NOT_FOUND", "This division was not found.");
  const incomingTeams = confirmedUnits(fromFacts);
  if (confirmedUnits(intoFacts) + incomingTeams > intoFacts.capacity) {
    throw new ParticipationError(
      "NOT_ALLOWED",
      "The second division doesn't have room for these teams.",
    );
  }
  const moved = await database
    .update(registrations)
    .set({ divisionId: into.id, updatedAt: input.now })
    .where(
      and(
        eq(registrations.divisionId, from.id),
        inArray(registrations.status, ["confirmed", "checked-in", "pending"]),
      ),
    )
    .returning({ id: registrations.id, personId: registrations.personId });
  const rule = subjectRule(fromFacts);
  await database
    .insert(participationDecisions)
    .values({
      organizationId: fromFacts.organizationId,
      subjectType: "division",
      subjectId: from.id,
      ruleSnapshot: rule
        ? serializeParticipationRule(rule)
        : {
            version: 2,
            unit: "team",
            minParticipants: 1,
            minimumPolicy: "run",
            waitlist: false,
            tiers: [],
          },
      snapshotAt: input.now,
      lockAt: fromFacts.startsAt,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .onConflictDoNothing();
  await database
    .update(participationDecisions)
    .set({
      outcome: "cancelled-by-club",
      cancelReason: "merged",
      mergedIntoSubjectId: into.id,
      decidedAt: input.now,
      decidedGroupSize: incomingTeams,
      decidedByPersonId: input.actorPersonId,
      settledAt: null,
      settledGroupSize: null,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(participationDecisions.subjectType, "division"),
        eq(participationDecisions.subjectId, from.id),
        or(
          isNull(participationDecisions.outcome),
          inArray(participationDecisions.outcome, [
            "minimum-met",
            "run-under-minimum",
          ]),
        ),
      ),
    );
  await queueParticipationNotices(
    moved.map((row) => ({
      organizationId: fromFacts.organizationId,
      subjectType: "division",
      subjectId: from.id,
      recipientPersonId: row.personId,
      bookingId: row.id,
      kind: "moved" as const,
      scheduledFor: input.now,
    })),
  );
  return { moved: moved.length };
}
