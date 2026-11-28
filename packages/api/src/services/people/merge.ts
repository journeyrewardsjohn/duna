/**
 * Merging a duplicate person record into another, inside one club
 * (PEOPLE-API). Conservative by design, because a `people` row is global:
 *
 * - Only a club-only record can be merged away: no sign-in account of its
 *   own, not known to any other club, not on the club's staff. The kept
 *   record may have a sign-in account (it keeps it).
 * - Refused when both records hold the same plan, both hold a credit
 *   wallet, both are booked into the same session, they are a junior and an
 *   adult, or they are juniors with different guardians.
 * - Everything the club holds moves to the kept record: bookings,
 *   attendance, memberships, the credit wallet (with its ledger account,
 *   balances untouched), payments (orders are re-pointed, never deleted),
 *   waiver signatures, family links, notes and tags. Each moved row id is
 *   kept in `people_merges.moved`. The merged record is marked `merged`.
 * - One transaction; a preview that changed since is refused.
 */
import {
  catalogFulfillments,
  eventTypes,
  getDatabase,
  getTransactionalDatabase,
  guardianships,
  ledgerAccounts,
  membershipTiers,
  memberships,
  orders,
  organizationMemberships,
  organizationParticipants,
  organizationWallets,
  people,
  peopleMerges,
  personNotes,
  personTags,
  programs,
  registrations,
  sessionAttendance,
  sessions,
  venues,
  waiverExecutions,
} from "@duna/db";
import { log } from "@duna/observability";
import { and, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { stableHash } from "../../canonical";
import type {
  PeopleMergeMoveKind,
  PeopleMergePreview,
  PeopleMergeResult,
} from "../../contracts/people";
import {
  PeopleError,
  adultBand,
  clubPersonIds,
  requireManager,
  rowsOf,
  writeAudit,
  type PeopleContext,
} from "./shared";

export const MERGE_PREVIEW_MINUTES = 15;

type Blocker = PeopleMergePreview["blockers"][number];
type Moves = Record<PeopleMergeMoveKind, string[]>;

const EMPTY_MOVES = (): Moves => ({
  bookings: [],
  attendance: [],
  memberships: [],
  credits: [],
  payments: [],
  waivers: [],
  familyLinks: [],
  notes: [],
  tags: [],
});

function countMoves(moves: Moves): Record<PeopleMergeMoveKind, number> {
  return Object.fromEntries(
    Object.entries(moves).map(([kind, ids]) => [kind, ids.length]),
  ) as Record<PeopleMergeMoveKind, number>;
}

/** Club sessions' registrations of one person (legacy event sessions). */
function clubRegistrations(organizationId: string, personId: string) {
  return getDatabase()
    .select({ id: registrations.id, sessionId: registrations.sessionId })
    .from(registrations)
    .innerJoin(sessions, eq(sessions.id, registrations.sessionId))
    .leftJoin(programs, eq(programs.id, sessions.programId))
    .leftJoin(eventTypes, eq(eventTypes.id, sessions.eventTypeId))
    .leftJoin(venues, eq(venues.id, sessions.venueId))
    .where(
      and(
        eq(registrations.personId, personId),
        or(
          eq(programs.organizationId, organizationId),
          eq(eventTypes.organizationId, organizationId),
          eq(venues.organizationId, organizationId),
        ),
      ),
    );
}

async function otherClubCount(
  organizationId: string,
  personId: string,
): Promise<number> {
  const result = await getDatabase().execute<{ count: number }>(sql`
    select count(*)::int as count from (
      select 1 from ${organizationParticipants}
        where ${organizationParticipants.personId} = ${personId}
          and ${organizationParticipants.organizationId} <> ${organizationId}
      union all
      select 1 from ${memberships}
        join ${membershipTiers} on ${membershipTiers.id} = ${memberships.tierId}
        where ${memberships.personId} = ${personId}
          and ${membershipTiers.organizationId} is distinct from ${organizationId}
      union all
      select 1 from ${organizationMemberships}
        where ${organizationMemberships.personId} = ${personId}
          and ${organizationMemberships.organizationId} <> ${organizationId}
      union all
      select 1 from ${orders}
        where ${orders.buyerPersonId} = ${personId}
          and ${orders.organizationId} is distinct from ${organizationId}
      union all
      select 1 from ${catalogFulfillments}
        where ${catalogFulfillments.personId} = ${personId}
          and ${catalogFulfillments.organizationId} <> ${organizationId}
    ) as other_club
  `);
  return Number(rowsOf<{ count: number }>(result)[0]?.count ?? 0);
}

interface MergePlan {
  readonly keep: typeof people.$inferSelect;
  readonly merge: typeof people.$inferSelect;
  readonly blockers: Blocker[];
  readonly moves: Moves;
  /** Tag rows that would duplicate one the kept record has (dropped). */
  readonly duplicateTagIds: string[];
  /** Family links the kept record already has (left in place). */
  readonly duplicateFamilyIds: string[];
}

async function planMerge(
  context: PeopleContext,
  keepId: string,
  mergeId: string,
): Promise<MergePlan> {
  const inClub = await clubPersonIds(context.organizationId, [keepId, mergeId]);
  if (!inClub.has(keepId) || !inClub.has(mergeId)) {
    throw new PeopleError(
      "NOT_FOUND",
      "One or both people were not found in your club.",
    );
  }
  const database = getDatabase();
  const [keep, merge] = await Promise.all(
    [keepId, mergeId].map((id) =>
      database.query.people.findFirst({ where: eq(people.id, id) }),
    ),
  );
  if (!keep || !merge) {
    throw new PeopleError("NOT_FOUND", "One or both people were not found.");
  }
  const blockers: Blocker[] = [];
  if (keepId === mergeId) {
    blockers.push({
      code: "same-person",
      message: "Choose two different people.",
    });
  }
  if (
    keep.profileClaimStatus === "merged" ||
    merge.profileClaimStatus === "merged"
  ) {
    blockers.push({
      code: "already-merged",
      message: "One of these records was already merged.",
    });
  }
  if (merge.workosUserId || merge.clerkUserId) {
    blockers.push({
      code: "sign-in-account",
      message: `${merge.displayName} signs in to Duna. Keep that record instead, or ask them to contact Duna support.`,
    });
  }
  const keepJunior = ["teen", "under-13"].includes(
    adultBand(keep.birthDate, keep.isMinor, context.now),
  );
  const mergeJunior = ["teen", "under-13"].includes(
    adultBand(merge.birthDate, merge.isMinor, context.now),
  );
  if (keep.isMinor !== merge.isMinor || keepJunior !== mergeJunior) {
    blockers.push({
      code: "age-mismatch",
      message: "One record is a junior and the other an adult.",
    });
  }
  const [
    otherClubs,
    staffRows,
    keepRegs,
    mergeRegs,
    attendanceRows,
    fulfillmentRows,
    membershipRows,
    walletRows,
    orderRows,
    waiverRows,
    familyRows,
    noteRows,
    tagRows,
  ] = await Promise.all([
    otherClubCount(context.organizationId, mergeId),
    database
      .select({ id: organizationMemberships.id })
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.organizationId, context.organizationId),
          eq(organizationMemberships.personId, mergeId),
        ),
      ),
    clubRegistrations(context.organizationId, keepId),
    clubRegistrations(context.organizationId, mergeId),
    database
      .select({
        id: sessionAttendance.id,
        personId: sessionAttendance.personId,
        sessionId: sessionAttendance.sessionId,
      })
      .from(sessionAttendance)
      .where(
        and(
          eq(sessionAttendance.organizationId, context.organizationId),
          inArray(sessionAttendance.personId, [keepId, mergeId]),
        ),
      ),
    database
      .select({
        id: catalogFulfillments.id,
        personId: catalogFulfillments.personId,
        occurrenceId: catalogFulfillments.catalogSessionOccurrenceId,
        status: catalogFulfillments.status,
      })
      .from(catalogFulfillments)
      .where(
        and(
          eq(catalogFulfillments.organizationId, context.organizationId),
          inArray(catalogFulfillments.personId, [keepId, mergeId]),
        ),
      ),
    database
      .select({
        id: memberships.id,
        personId: memberships.personId,
        tierId: memberships.tierId,
        status: memberships.status,
      })
      .from(memberships)
      .innerJoin(membershipTiers, eq(membershipTiers.id, memberships.tierId))
      .where(
        and(
          eq(membershipTiers.organizationId, context.organizationId),
          inArray(memberships.personId, [keepId, mergeId]),
        ),
      ),
    database
      .select({
        id: organizationWallets.id,
        personId: organizationWallets.personId,
      })
      .from(organizationWallets)
      .where(
        and(
          eq(organizationWallets.organizationId, context.organizationId),
          inArray(organizationWallets.personId, [keepId, mergeId]),
        ),
      ),
    database
      .select({ id: orders.id })
      .from(orders)
      .where(
        and(
          eq(orders.organizationId, context.organizationId),
          eq(orders.buyerPersonId, mergeId),
        ),
      ),
    database
      .select({ id: waiverExecutions.id })
      .from(waiverExecutions)
      .where(
        and(
          eq(waiverExecutions.organizationId, context.organizationId),
          or(
            eq(waiverExecutions.subjectPersonId, mergeId),
            eq(waiverExecutions.signerPersonId, mergeId),
          ),
        ),
      ),
    database
      .select()
      .from(guardianships)
      .where(
        or(
          inArray(guardianships.minorId, [keepId, mergeId]),
          inArray(guardianships.guardianId, [keepId, mergeId]),
        ),
      ),
    database
      .select({ id: personNotes.id })
      .from(personNotes)
      .where(
        and(
          eq(personNotes.organizationId, context.organizationId),
          eq(personNotes.personId, mergeId),
          isNull(personNotes.removedAt),
        ),
      ),
    database
      .select({
        id: personTags.id,
        personId: personTags.personId,
        tag: personTags.tag,
      })
      .from(personTags)
      .where(
        and(
          eq(personTags.organizationId, context.organizationId),
          inArray(personTags.personId, [keepId, mergeId]),
        ),
      ),
  ]);
  if (otherClubs > 0) {
    blockers.push({
      code: "other-club",
      message: `${merge.displayName}'s record is also used by another club, so it cannot be merged from here.`,
    });
  }
  if (staffRows.length > 0) {
    blockers.push({
      code: "staff-record",
      message: `${merge.displayName} is on your team. Remove them from the team first.`,
    });
  }
  const keepSessions = new Set(keepRegs.map((row) => row.sessionId));
  const keepOccurrences = new Set(
    fulfillmentRows
      .filter(
        (row) =>
          row.personId === keepId &&
          row.occurrenceId &&
          ["held", "pending", "ready", "fulfilled"].includes(row.status),
      )
      .map((row) => row.occurrenceId),
  );
  if (
    mergeRegs.some((row) => keepSessions.has(row.sessionId)) ||
    fulfillmentRows.some(
      (row) =>
        row.personId === mergeId &&
        row.occurrenceId &&
        ["held", "pending", "ready", "fulfilled"].includes(row.status) &&
        keepOccurrences.has(row.occurrenceId),
    )
  ) {
    blockers.push({
      code: "same-booking-twice",
      message:
        "Both records are booked into the same session. Cancel one booking first.",
    });
  }
  const active = (status: string) =>
    ["active", "trialing", "past_due", "paused"].includes(status);
  const keepTiers = new Set(
    membershipRows
      .filter((row) => row.personId === keepId && active(row.status))
      .map((row) => row.tierId),
  );
  if (
    membershipRows.some(
      (row) =>
        row.personId === mergeId &&
        active(row.status) &&
        keepTiers.has(row.tierId),
    )
  ) {
    blockers.push({
      code: "same-plan-twice",
      message:
        "Both records hold the same active plan. End one of them before merging.",
    });
  }
  if (
    walletRows.some((row) => row.personId === keepId) &&
    walletRows.some((row) => row.personId === mergeId)
  ) {
    blockers.push({
      code: "two-credit-wallets",
      message:
        "Both records hold club credits. Move or use one balance before merging.",
    });
  }
  const guardiansOf = (personId: string) =>
    new Set(
      familyRows
        .filter(
          (row) => row.minorId === personId && row.reviewStatus !== "rejected",
        )
        .map((row) => row.guardianId),
    );
  if (keepJunior || mergeJunior || keep.isMinor || merge.isMinor) {
    const keepGuardians = guardiansOf(keepId);
    const mergeGuardians = guardiansOf(mergeId);
    if (
      keepGuardians.size > 0 &&
      mergeGuardians.size > 0 &&
      ([...mergeGuardians].some((id) => !keepGuardians.has(id)) ||
        [...keepGuardians].some((id) => !mergeGuardians.has(id)))
    ) {
      blockers.push({
        code: "different-guardians",
        message:
          "These juniors have different guardians. Confirm the family with Duna support before merging.",
      });
    }
  }
  const keepPairs = new Set(
    familyRows
      .filter((row) => row.guardianId === keepId || row.minorId === keepId)
      .map((row) =>
        row.guardianId === keepId ? `g:${row.minorId}` : `m:${row.guardianId}`,
      ),
  );
  const mergeFamily = familyRows.filter(
    (row) =>
      (row.guardianId === mergeId || row.minorId === mergeId) &&
      row.guardianId !== keepId &&
      row.minorId !== keepId,
  );
  const familyKey = (row: (typeof familyRows)[number]) =>
    row.guardianId === mergeId ? `g:${row.minorId}` : `m:${row.guardianId}`;
  const keepTags = new Set(
    tagRows.filter((row) => row.personId === keepId).map((row) => row.tag),
  );
  const mergeTags = tagRows.filter((row) => row.personId === mergeId);
  const moves = EMPTY_MOVES();
  moves.bookings = [
    ...mergeRegs.map((row) => row.id),
    ...fulfillmentRows
      .filter((row) => row.personId === mergeId)
      .map((row) => row.id),
  ];
  moves.attendance = attendanceRows
    .filter((row) => row.personId === mergeId)
    .map((row) => row.id);
  moves.memberships = membershipRows
    .filter((row) => row.personId === mergeId)
    .map((row) => row.id);
  moves.credits = walletRows
    .filter((row) => row.personId === mergeId)
    .map((row) => row.id);
  moves.payments = orderRows.map((row) => row.id);
  moves.waivers = waiverRows.map((row) => row.id);
  moves.familyLinks = mergeFamily
    .filter((row) => !keepPairs.has(familyKey(row)))
    .map((row) => `${row.guardianId}:${row.minorId}`);
  moves.notes = noteRows.map((row) => row.id);
  moves.tags = mergeTags
    .filter((row) => !keepTags.has(row.tag))
    .map((row) => row.id);
  return {
    keep,
    merge,
    blockers,
    moves,
    duplicateTagIds: mergeTags
      .filter((row) => keepTags.has(row.tag))
      .map((row) => row.id),
    duplicateFamilyIds: mergeFamily
      .filter((row) => keepPairs.has(familyKey(row)))
      .map((row) => `${row.guardianId}:${row.minorId}`),
  };
}

function planHash(plan: MergePlan): string {
  return stableHash({
    keep: [plan.keep.id, plan.keep.updatedAt.toISOString()],
    merge: [plan.merge.id, plan.merge.updatedAt.toISOString()],
    blockers: plan.blockers.map((blocker) => blocker.code).sort(),
    moves: Object.fromEntries(
      Object.entries(plan.moves).map(([kind, ids]) => [kind, [...ids].sort()]),
    ),
  });
}

const KEPT = [
  "Name, contact details and profile of the record you keep",
  "Its sign-in account, if it has one",
  "Every payment and waiver record (re-pointed, never deleted)",
];

export async function previewPeopleMerge(
  context: PeopleContext,
  input: { readonly keepId: string; readonly mergeId: string },
): Promise<PeopleMergePreview> {
  requireManager(context.actor);
  const plan = await planMerge(context, input.keepId, input.mergeId);
  const expiresAt = new Date(
    context.now.getTime() + MERGE_PREVIEW_MINUTES * 60_000,
  );
  const [row] = await getDatabase()
    .insert(peopleMerges)
    .values({
      organizationId: context.organizationId,
      keepPersonId: plan.keep.id,
      mergedPersonId: plan.merge.id,
      status: "previewed",
      planHash: planHash(plan),
      createdByPersonId: context.actor.personId,
      expiresAt,
      createdAt: context.now,
      updatedAt: context.now,
    })
    .returning({ id: peopleMerges.id });
  if (!row) throw new Error("The merge preview could not be saved.");
  return {
    previewId: row.id,
    expiresAt: expiresAt.toISOString(),
    keep: { personId: plan.keep.id, displayName: plan.keep.displayName },
    merge: { personId: plan.merge.id, displayName: plan.merge.displayName },
    canMerge: plan.blockers.length === 0,
    kept: KEPT,
    moves: countMoves(plan.moves),
    blockers: plan.blockers,
  };
}

export async function runPeopleMerge(
  context: PeopleContext,
  input: { readonly previewId: string; readonly idempotencyKey: string },
): Promise<PeopleMergeResult> {
  requireManager(context.actor);
  const database = getDatabase();
  const preview = await database.query.peopleMerges.findFirst({
    where: and(
      eq(peopleMerges.id, input.previewId),
      eq(peopleMerges.organizationId, context.organizationId),
    ),
  });
  if (!preview) {
    throw new PeopleError("NOT_FOUND", "This merge preview was not found.");
  }
  if (preview.status === "completed") {
    return {
      mergeId: preview.id,
      personId: preview.keepPersonId,
      moved: countMoves({
        ...EMPTY_MOVES(),
        ...(preview.moved as Partial<Moves> | null),
      }),
    };
  }
  if (preview.expiresAt <= context.now) {
    throw new PeopleError(
      "PRECONDITION_FAILED",
      "This merge preview has expired. Preview the merge again.",
    );
  }
  const plan = await planMerge(
    context,
    preview.keepPersonId,
    preview.mergedPersonId,
  );
  if (plan.blockers.length > 0) {
    throw new PeopleError("CONFLICT", plan.blockers[0]!.message);
  }
  if (planHash(plan) !== preview.planHash) {
    throw new PeopleError(
      "PRECONDITION_FAILED",
      "These records changed since the preview. Preview the merge again.",
    );
  }
  const keepId = plan.keep.id;
  const mergeId = plan.merge.id;
  const { moves } = plan;
  await getTransactionalDatabase().transaction(async (transaction) => {
    // `bookings` holds event registrations and catalog bookings; each
    // update only matches its own table's ids.
    const registrationIds = moves.bookings;
    if (registrationIds.length) {
      await transaction
        .update(registrations)
        .set({ personId: keepId })
        .where(
          and(
            inArray(registrations.id, registrationIds),
            eq(registrations.personId, mergeId),
          ),
        );
      await transaction
        .update(catalogFulfillments)
        .set({ personId: keepId })
        .where(
          and(
            inArray(catalogFulfillments.id, registrationIds),
            eq(catalogFulfillments.personId, mergeId),
          ),
        );
    }
    if (moves.attendance.length) {
      await transaction
        .update(sessionAttendance)
        .set({ personId: keepId })
        .where(inArray(sessionAttendance.id, moves.attendance));
    }
    if (moves.memberships.length) {
      await transaction
        .update(memberships)
        .set({ personId: keepId, updatedAt: context.now })
        .where(inArray(memberships.id, moves.memberships));
    }
    if (moves.credits.length) {
      const wallets = await transaction
        .update(organizationWallets)
        .set({ personId: keepId })
        .where(inArray(organizationWallets.id, moves.credits))
        .returning({ ledgerId: organizationWallets.creditLedgerAccountId });
      const ledgerIds = wallets
        .map((wallet) => wallet.ledgerId)
        .filter((value): value is string => Boolean(value));
      if (ledgerIds.length) {
        // Ownership only: no journal is written, balances do not change.
        await transaction
          .update(ledgerAccounts)
          .set({ ownerPersonId: keepId })
          .where(
            and(
              inArray(ledgerAccounts.id, ledgerIds),
              eq(ledgerAccounts.ownerPersonId, mergeId),
            ),
          );
      }
    }
    if (moves.payments.length) {
      await transaction
        .update(orders)
        .set({ buyerPersonId: keepId, updatedAt: context.now })
        .where(inArray(orders.id, moves.payments));
    }
    if (moves.waivers.length) {
      await transaction
        .update(waiverExecutions)
        .set({ subjectPersonId: keepId })
        .where(
          and(
            inArray(waiverExecutions.id, moves.waivers),
            eq(waiverExecutions.subjectPersonId, mergeId),
          ),
        );
      await transaction
        .update(waiverExecutions)
        .set({ signerPersonId: keepId })
        .where(
          and(
            inArray(waiverExecutions.id, moves.waivers),
            eq(waiverExecutions.signerPersonId, mergeId),
          ),
        );
    }
    // Family links are keyed "guardianId:minorId" (no row id).
    for (const pair of moves.familyLinks) {
      const [guardianId, minorId] = pair.split(":") as [string, string];
      await transaction
        .update(guardianships)
        .set({
          guardianId: guardianId === mergeId ? keepId : guardianId,
          minorId: minorId === mergeId ? keepId : minorId,
        })
        .where(
          and(
            eq(guardianships.guardianId, guardianId),
            eq(guardianships.minorId, minorId),
          ),
        );
    }
    if (moves.notes.length) {
      await transaction
        .update(personNotes)
        .set({ personId: keepId, updatedAt: context.now })
        .where(inArray(personNotes.id, moves.notes));
    }
    if (moves.tags.length) {
      await transaction
        .update(personTags)
        .set({ personId: keepId })
        .where(inArray(personTags.id, moves.tags));
    }
    if (plan.duplicateTagIds.length) {
      await transaction
        .delete(personTags)
        .where(inArray(personTags.id, plan.duplicateTagIds));
    }
    // The kept record joins the club with the merged record's relationship.
    const participants = await transaction
      .select()
      .from(organizationParticipants)
      .where(
        and(
          eq(organizationParticipants.organizationId, context.organizationId),
          eq(organizationParticipants.personId, mergeId),
        ),
      );
    for (const participant of participants) {
      await transaction
        .insert(organizationParticipants)
        .values({
          organizationId: context.organizationId,
          personId: keepId,
          relationship: participant.relationship,
          status: participant.status,
          addedByPersonId: context.actor.personId,
          joinedAt: participant.joinedAt,
        })
        .onConflictDoNothing();
    }
    await transaction
      .update(organizationParticipants)
      .set({ status: "inactive" })
      .where(
        and(
          eq(organizationParticipants.organizationId, context.organizationId),
          eq(organizationParticipants.personId, mergeId),
        ),
      );
    await transaction
      .update(people)
      .set({
        profileClaimStatus: "merged",
        status: "restricted",
        updatedAt: context.now,
      })
      .where(
        and(eq(people.id, mergeId), ne(people.profileClaimStatus, "merged")),
      );
    await transaction
      .update(peopleMerges)
      .set({
        status: "completed",
        moved: moves,
        idempotencyKey: input.idempotencyKey,
        completedAt: context.now,
        updatedAt: context.now,
      })
      .where(eq(peopleMerges.id, preview.id));
    await writeAudit(
      context,
      {
        action: "people.merged",
        entityType: "person",
        entityId: keepId,
        reason: `Staff merged a duplicate record into this one (${Object.values(
          moves,
        ).reduce((sum, ids) => sum + ids.length, 0)} rows moved).`,
        after: { keepId, mergeId, moves },
      },
      transaction,
    );
  });
  log.info("people.merged", {
    organizationId: context.organizationId,
    mergeId: preview.id,
    keepPersonId: keepId,
    mergedPersonId: mergeId,
    ...countMoves(moves),
  });
  return {
    mergeId: preview.id,
    personId: keepId,
    moved: countMoves(moves),
  };
}
