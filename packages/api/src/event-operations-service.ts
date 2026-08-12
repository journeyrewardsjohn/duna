import {
  auditLog,
  brackets,
  courts,
  divisions,
  eventBlueprints,
  eventTypes,
  getDatabase,
  getTransactionalDatabase,
  matches,
  organizationCreditApplications,
  organizationMemberships,
  orders,
  people,
  programs,
  ratings,
  ratingEvents,
  refundRecords,
  registrations,
  sessionOperations,
  sessions,
  teamEntries,
  teamMembers,
  teams,
  venues,
} from "@duna/db";
import {
  generateDoubleElimination,
  generatePoolPlay,
  generateRoundRobin,
  generateSingleElimination,
  type Bracket,
  type SeededTeam,
} from "@duna/league-engine";
import { and, asc, desc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { stableHash } from "./canonical";
import {
  cancelCalendarSession,
  refundOrganizationOrder,
} from "./catalog-service";
import type { OperatorMutationResult } from "./contracts";
import type { ApiActor } from "./context";

interface MutationContext {
  readonly actor: ApiActor;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}

interface DivisionSettings {
  readonly tournamentFormat?:
    | "kob-qob"
    | "single-elimination"
    | "double-elimination-true"
    | "double-elimination-crossover";
  readonly poolPlay?: {
    readonly enabled: boolean;
    readonly teamsPerPool: number;
    readonly format: "full" | "olympic-crossover";
    readonly teamsAdvancing: number;
  };
  readonly seeding?:
    | "first-come"
    | "sand-rating-score"
    | "sand-rating-best-8"
    | "sand-rating-ttm"
    | "manual";
  readonly qualificationFinalizedAt?: string;
  readonly qualificationFinalizedRegistrationClosesAt?: string;
}

type SelectionStatus = "pending" | "confirmed" | "waitlisted" | "withdrawn";

function requireDatabase(): void {
  if (!process.env.DATABASE_URL) {
    throw new Error("Event operations require the connected Duna database.");
  }
}

function requireOrganization(actor: ApiActor): string {
  if (!actor.organizationId) {
    throw new Error("An organization context is required.");
  }
  return actor.organizationId;
}

function activeRegistration(status: string): boolean {
  return ["pending", "confirmed", "waitlisted", "checked-in"].includes(status);
}

/** Captures both the captain order and split-pay teammate orders. */
export function collectRegistrationOrderIds(
  registrationOrderId: string | null | undefined,
  roster: readonly { readonly orderId?: string }[],
): readonly string[] {
  return [
    ...new Set([
      ...(registrationOrderId ? [registrationOrderId] : []),
      ...roster.flatMap((member) => (member.orderId ? [member.orderId] : [])),
    ]),
  ];
}

export function registrationRefundIsComplete(input: {
  readonly associatedOrderIds: readonly string[];
  readonly refundableOrderIds: ReadonlySet<string>;
  readonly succeededOrderIds: ReadonlySet<string>;
}): boolean {
  const requiredRefunds = input.associatedOrderIds.filter((orderId) =>
    input.refundableOrderIds.has(orderId),
  );
  return (
    requiredRefunds.length > 0 &&
    requiredRefunds.every((orderId) => input.succeededOrderIds.has(orderId))
  );
}

async function ownedSession(organizationId: string, sessionId: string) {
  const row = await getDatabase()
    .select({
      session: sessions,
      organizationId: sql<
        string | null
      >`coalesce(${programs.organizationId}, ${eventTypes.organizationId}, ${venues.organizationId})`,
    })
    .from(sessions)
    .leftJoin(programs, eq(sessions.programId, programs.id))
    .leftJoin(eventTypes, eq(sessions.eventTypeId, eventTypes.id))
    .leftJoin(venues, eq(sessions.venueId, venues.id))
    .where(eq(sessions.id, sessionId))
    .limit(1)
    .then((rows) => rows[0]);
  if (!row || row.organizationId !== organizationId) {
    throw new Error("Event was not found in this organization.");
  }
  return row.session;
}

async function ownedDivision(organizationId: string, divisionId: string) {
  const row = await getDatabase()
    .select({
      division: divisions,
      session: sessions,
      registrationSettings: eventBlueprints.registrationSettings,
      programKind: programs.kind,
      eventTypeKind: eventTypes.kind,
      organizationId: sql<
        string | null
      >`coalesce(${programs.organizationId}, ${eventTypes.organizationId}, ${venues.organizationId})`,
    })
    .from(divisions)
    .innerJoin(sessions, eq(divisions.sessionId, sessions.id))
    .leftJoin(eventBlueprints, eq(sessions.id, eventBlueprints.sessionId))
    .leftJoin(programs, eq(sessions.programId, programs.id))
    .leftJoin(eventTypes, eq(sessions.eventTypeId, eventTypes.id))
    .leftJoin(venues, eq(sessions.venueId, venues.id))
    .where(eq(divisions.id, divisionId))
    .limit(1)
    .then((rows) => rows[0]);
  if (!row || row.organizationId !== organizationId) {
    throw new Error("Division was not found in this organization.");
  }
  return row;
}

function registrationClose(
  settings: Record<string, unknown> | null,
): Date | undefined {
  const value =
    settings?.registrationClosesAt ??
    settings?.registrationCloseAt ??
    settings?.closesAt;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    return undefined;
  }
  return new Date(value);
}

export interface EventCancellationOrderPreview {
  readonly orderId: string;
  readonly buyerName: string;
  readonly totalMinor: number;
  readonly cashRefundMinor: number;
  readonly creditsToRestore: number;
  readonly creditValueMinor: number;
  readonly refundAttempt: number;
}

export interface EventCancellationPreview {
  readonly sessionId: string;
  readonly sessionStatus: string;
  readonly registrationCount: number;
  readonly orderCount: number;
  readonly cashRefundMinor: number;
  readonly creditsToRestore: number;
  readonly creditValueMinor: number;
  readonly currency: string;
  readonly orders: readonly EventCancellationOrderPreview[];
}

export async function loadEventCancellationPreview(input: {
  readonly organizationId: string;
  readonly sessionId: string;
}): Promise<EventCancellationPreview> {
  requireDatabase();
  const session = await ownedSession(input.organizationId, input.sessionId);
  const database = getDatabase();
  const registrationRows = await database
    .select({
      id: registrations.id,
      status: registrations.status,
      orderId: registrations.orderId,
      buyerName: people.displayName,
    })
    .from(registrations)
    .innerJoin(people, eq(registrations.personId, people.id))
    .where(eq(registrations.sessionId, input.sessionId));
  const teamPaymentRows = await database
    .select({
      registrationId: teamEntries.registrationId,
      roster: teamEntries.roster,
    })
    .from(teamEntries)
    .innerJoin(registrations, eq(teamEntries.registrationId, registrations.id))
    .where(eq(registrations.sessionId, input.sessionId));
  const operation = await database.query.sessionOperations.findFirst({
    where: eq(sessionOperations.sessionId, input.sessionId),
  });
  const active = registrationRows.filter((row) =>
    activeRegistration(row.status),
  );
  const activeRegistrationIds = new Set(active.map((row) => row.id));
  const retryOrderIds =
    session.status === "cancelled" && operation?.refundStatus === "attention"
      ? (operation.refundSummary?.failedOrderIds ?? [])
      : [];
  const orderIds = [
    ...new Set([
      ...active.flatMap((row) => (row.orderId ? [row.orderId] : [])),
      ...teamPaymentRows.flatMap((team) =>
        activeRegistrationIds.has(team.registrationId)
          ? collectRegistrationOrderIds(undefined, team.roster)
          : [],
      ),
      ...retryOrderIds,
    ]),
  ];
  const [orderRows, refunds, applications] = await Promise.all([
    orderIds.length
      ? database
          .select()
          .from(orders)
          .where(
            and(
              eq(orders.organizationId, input.organizationId),
              inArray(orders.id, orderIds),
            ),
          )
      : Promise.resolve([]),
    orderIds.length
      ? database
          .select()
          .from(refundRecords)
          .where(
            and(
              eq(refundRecords.organizationId, input.organizationId),
              inArray(refundRecords.orderId, orderIds),
            ),
          )
      : Promise.resolve([]),
    orderIds.length
      ? database
          .select()
          .from(organizationCreditApplications)
          .where(
            and(
              eq(
                organizationCreditApplications.organizationId,
                input.organizationId,
              ),
              inArray(organizationCreditApplications.orderId, orderIds),
              isNull(organizationCreditApplications.restoredAt),
            ),
          )
      : Promise.resolve([]),
  ]);
  const refundedCashByOrder = new Map<string, number>();
  const failedAttemptsByOrder = new Map<string, number>();
  for (const refund of refunds) {
    if (refund.status === "failed") {
      failedAttemptsByOrder.set(
        refund.orderId,
        (failedAttemptsByOrder.get(refund.orderId) ?? 0) + 1,
      );
    } else if (
      refund.disposition === "original-payment" &&
      (refund.status === "pending" || refund.status === "succeeded")
    ) {
      refundedCashByOrder.set(
        refund.orderId,
        (refundedCashByOrder.get(refund.orderId) ?? 0) + refund.amountMinor,
      );
    }
  }
  const creditsByOrder = new Map<
    string,
    { credits: number; valueMinor: number }
  >();
  for (const application of applications) {
    const current = creditsByOrder.get(application.orderId) ?? {
      credits: 0,
      valueMinor: 0,
    };
    current.credits += application.credits;
    current.valueMinor += application.valueMinor;
    creditsByOrder.set(application.orderId, current);
  }
  const buyerByOrder = new Map(
    registrationRows.flatMap((row) =>
      row.orderId ? ([[row.orderId, row.buyerName]] as const) : [],
    ),
  );
  for (const team of teamPaymentRows) {
    for (const member of team.roster) {
      if (!member.orderId) continue;
      buyerByOrder.set(
        member.orderId,
        member.displayName ?? member.inviteTarget ?? "Team member",
      );
    }
  }
  const previewOrders = orderRows
    .map((order): EventCancellationOrderPreview => {
      const credits = creditsByOrder.get(order.id) ?? {
        credits: 0,
        valueMinor: 0,
      };
      return {
        orderId: order.id,
        buyerName: buyerByOrder.get(order.id) ?? "Registered player",
        totalMinor: order.totalMinor,
        cashRefundMinor: order.stripePaymentIntentId
          ? Math.max(
              0,
              order.totalMinor - (refundedCashByOrder.get(order.id) ?? 0),
            )
          : 0,
        creditsToRestore: credits.credits,
        creditValueMinor: credits.valueMinor,
        refundAttempt: failedAttemptsByOrder.get(order.id) ?? 0,
      };
    })
    .filter((order) => order.cashRefundMinor > 0 || order.creditsToRestore > 0);
  return {
    sessionId: input.sessionId,
    sessionStatus: session.status,
    registrationCount:
      session.status === "cancelled" && operation?.refundSummary
        ? operation.refundSummary.registrationCount
        : active.length,
    orderCount: previewOrders.length,
    cashRefundMinor: previewOrders.reduce(
      (total, order) => total + order.cashRefundMinor,
      0,
    ),
    creditsToRestore: previewOrders.reduce(
      (total, order) => total + order.creditsToRestore,
      0,
    ),
    creditValueMinor: previewOrders.reduce(
      (total, order) => total + order.creditValueMinor,
      0,
    ),
    currency: orderRows[0]?.currency ?? "USD",
    orders: previewOrders,
  };
}

export async function updateEventSession(
  input: MutationContext & {
    readonly sessionId: string;
    readonly title: string;
    readonly startsAt: Date;
    readonly endsAt: Date;
    readonly timezone: string;
    readonly capacity: number;
    readonly registrationClosesAt?: Date;
    readonly reason: string;
  },
): Promise<OperatorMutationResult> {
  requireDatabase();
  const organizationId = requireOrganization(input.actor);
  const current = await ownedSession(organizationId, input.sessionId);
  if (current.status === "cancelled" || current.status === "completed") {
    throw new Error("Cancelled and completed events cannot be edited.");
  }
  if (input.endsAt <= input.startsAt) {
    throw new Error("The event must end after it starts.");
  }
  if (
    input.registrationClosesAt &&
    input.registrationClosesAt > input.startsAt
  ) {
    throw new Error("Registration must close before the event starts.");
  }
  const confirmed = await getDatabase()
    .select({ count: sql<number>`count(*)::int` })
    .from(registrations)
    .where(
      and(
        eq(registrations.sessionId, input.sessionId),
        inArray(registrations.status, ["confirmed", "checked-in"]),
      ),
    )
    .then((rows) => rows[0]?.count ?? 0);
  if (input.capacity < confirmed) {
    throw new Error(
      `Capacity cannot be lower than the ${confirmed} confirmed registrations.`,
    );
  }
  const database = getTransactionalDatabase();
  await database.transaction(async (transaction) => {
    const blueprint = await transaction.query.eventBlueprints.findFirst({
      where: eq(eventBlueprints.sessionId, input.sessionId),
    });
    const registrationSettings = {
      ...(blueprint?.registrationSettings ?? {}),
      ...(input.registrationClosesAt
        ? { registrationClosesAt: input.registrationClosesAt.toISOString() }
        : {}),
    };
    await transaction
      .update(sessions)
      .set({
        title: input.title,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        timezone: input.timezone,
        capacity: input.capacity,
        updatedAt: input.now,
      })
      .where(eq(sessions.id, input.sessionId));
    await transaction
      .insert(eventBlueprints)
      .values({
        sessionId: input.sessionId,
        registrationSettings,
      })
      .onConflictDoUpdate({
        target: eventBlueprints.sessionId,
        set: { registrationSettings, updatedAt: input.now },
      });
    await transaction.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "event.operations_updated",
      entityType: "session",
      entityId: input.sessionId,
      beforeHash: stableHash(current),
      afterHash: stableHash({
        title: input.title,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        timezone: input.timezone,
        capacity: input.capacity,
        registrationClosesAt: input.registrationClosesAt,
      }),
      reason: input.reason,
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    });
  });
  return { id: input.sessionId, entity: "session", status: "updated" };
}

export async function cancelEventWithRefunds(
  input: MutationContext & {
    readonly sessionId: string;
    readonly reason: string;
  },
): Promise<OperatorMutationResult> {
  requireDatabase();
  const organizationId = requireOrganization(input.actor);
  const preview = await loadEventCancellationPreview({
    organizationId,
    sessionId: input.sessionId,
  });
  if (preview.sessionStatus === "completed") {
    throw new Error("A completed event cannot be cancelled.");
  }
  if (preview.sessionStatus !== "cancelled") {
    await cancelCalendarSession(input);
  }
  const database = getDatabase();
  const previousOperation = await database.query.sessionOperations.findFirst({
    where: eq(sessionOperations.sessionId, input.sessionId),
  });
  const previousSummary = previousOperation?.refundSummary;
  const summaryRegistrationCount =
    previousSummary?.registrationCount ?? preview.registrationCount;
  const summaryOrderCount = previousSummary?.orderCount ?? preview.orderCount;
  const summaryCashRefundMinor =
    previousSummary?.cashRefundMinor ?? preview.cashRefundMinor;
  const summaryCreditsRestored =
    previousSummary?.creditsRestored ?? preview.creditsToRestore;
  await database
    .insert(sessionOperations)
    .values({
      sessionId: input.sessionId,
      organizationId,
      refundSummary: {
        registrationCount: summaryRegistrationCount,
        orderCount: summaryOrderCount,
        cashRefundMinor: summaryCashRefundMinor,
        creditsRestored: summaryCreditsRestored,
        succeededOrderIds: previousSummary?.succeededOrderIds ?? [],
        failedOrderIds: previousSummary?.failedOrderIds ?? [],
      },
    })
    .onConflictDoNothing();
  const staleProcessingCutoff = new Date(input.now.getTime() - 15 * 60_000);
  const acquired = await database
    .update(sessionOperations)
    .set({
      refundStatus: "pending",
      refundSummary: {
        registrationCount: summaryRegistrationCount,
        orderCount: summaryOrderCount,
        cashRefundMinor: summaryCashRefundMinor,
        creditsRestored: summaryCreditsRestored,
        succeededOrderIds: previousSummary?.succeededOrderIds ?? [],
        failedOrderIds: previousSummary?.failedOrderIds ?? [],
      },
      updatedAt: input.now,
    })
    .where(
      and(
        eq(sessionOperations.sessionId, input.sessionId),
        sql`${sessionOperations.refundStatus} IS DISTINCT FROM 'pending' OR ${sessionOperations.updatedAt} < ${staleProcessingCutoff}`,
      ),
    )
    .returning({ id: sessionOperations.sessionId });
  if (acquired.length === 0) {
    throw new Error(
      "Cancellation refunds are already being processed. Refresh in a moment before retrying.",
    );
  }
  const succeededOrderIds: string[] = [];
  const failedOrderIds: string[] = [];
  for (const order of preview.orders) {
    try {
      const result = await refundOrganizationOrder({
        actor: input.actor,
        orderId: order.orderId,
        amountMinor:
          order.cashRefundMinor > 0 ? order.cashRefundMinor : order.totalMinor,
        disposition: "original-payment",
        reason: `Event cancelled · ${input.reason}`,
        requestId: `event-cancel:${input.sessionId}:${order.orderId}:attempt-${order.refundAttempt + 1}`,
        ipAddress: input.ipAddress,
        now: input.now,
      });
      if (result.status === "failed") failedOrderIds.push(order.orderId);
      else succeededOrderIds.push(order.orderId);
    } catch {
      failedOrderIds.push(order.orderId);
    }
  }
  const [sessionRegistrations, sessionTeamPayments] = await Promise.all([
    database
      .select({ id: registrations.id, orderId: registrations.orderId })
      .from(registrations)
      .where(eq(registrations.sessionId, input.sessionId)),
    database
      .select({
        registrationId: teamEntries.registrationId,
        roster: teamEntries.roster,
      })
      .from(teamEntries)
      .innerJoin(
        registrations,
        eq(teamEntries.registrationId, registrations.id),
      )
      .where(eq(registrations.sessionId, input.sessionId)),
  ]);
  const allSucceededOrderIds = [
    ...new Set([
      ...(previousSummary?.succeededOrderIds ?? []),
      ...succeededOrderIds,
    ]),
  ];
  const succeededOrderSet = new Set(allSucceededOrderIds);
  const refundableOrderSet = new Set([
    ...preview.orders.map((order) => order.orderId),
    ...(previousSummary?.succeededOrderIds ?? []),
    ...(previousSummary?.failedOrderIds ?? []),
  ]);
  const teamOrderIdsByRegistration = new Map<string, string[]>();
  for (const team of sessionTeamPayments) {
    teamOrderIdsByRegistration.set(team.registrationId, [
      ...collectRegistrationOrderIds(undefined, team.roster),
    ]);
  }
  const succeededRegistrationIds = sessionRegistrations
    .filter((registration) => {
      const associatedOrderIds = [
        ...(registration.orderId ? [registration.orderId] : []),
        ...(teamOrderIdsByRegistration.get(registration.id) ?? []),
      ];
      return registrationRefundIsComplete({
        associatedOrderIds,
        refundableOrderIds: refundableOrderSet,
        succeededOrderIds: succeededOrderSet,
      });
    })
    .map((registration) => registration.id);
  const teamEntryIds = await database
    .select({ id: teamEntries.id })
    .from(teamEntries)
    .innerJoin(registrations, eq(teamEntries.registrationId, registrations.id))
    .where(eq(registrations.sessionId, input.sessionId))
    .then((rows) => rows.map((row) => row.id));
  await database.batch([
    database
      .update(registrations)
      .set({ status: "cancelled", updatedAt: input.now })
      .where(
        and(
          eq(registrations.sessionId, input.sessionId),
          inArray(registrations.status, [
            "pending",
            "confirmed",
            "waitlisted",
            "checked-in",
          ]),
        ),
      ),
    succeededRegistrationIds.length
      ? database
          .update(registrations)
          .set({ status: "refunded", updatedAt: input.now })
          .where(inArray(registrations.id, succeededRegistrationIds))
      : database
          .update(registrations)
          .set({ updatedAt: input.now })
          .where(sql`false`),
    teamEntryIds.length
      ? database
          .update(teamEntries)
          .set({
            status: "cancelled",
            selectionStatus: "withdrawn",
            selectionLocked: true,
            selectionReason: "Event cancelled",
            updatedAt: input.now,
          })
          .where(inArray(teamEntries.id, teamEntryIds))
      : database
          .update(teamEntries)
          .set({ updatedAt: input.now })
          .where(sql`false`),
    database
      .update(sessionOperations)
      .set({
        refundStatus: failedOrderIds.length ? "attention" : "complete",
        refundSummary: {
          registrationCount: summaryRegistrationCount,
          orderCount: summaryOrderCount,
          cashRefundMinor: summaryCashRefundMinor,
          creditsRestored: summaryCreditsRestored,
          succeededOrderIds: allSucceededOrderIds,
          failedOrderIds,
        },
        refundCompletedAt: failedOrderIds.length ? null : input.now,
        updatedAt: input.now,
      })
      .where(eq(sessionOperations.sessionId, input.sessionId)),
    database.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "event.cancellation_refunds_processed",
      entityType: "session",
      entityId: input.sessionId,
      afterHash: stableHash({
        preview,
        succeededOrderIds,
        failedOrderIds,
      }),
      reason: input.reason,
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  return {
    id: input.sessionId,
    entity: "session",
    status: failedOrderIds.length ? "refund-attention" : "cancelled-refunded",
  };
}

interface TeamOperationalSummary {
  readonly id: string;
  readonly registrationId: string;
  readonly teamId?: string;
  readonly divisionId: string;
  readonly divisionName: string;
  readonly name: string;
  readonly captainName: string;
  readonly registrationStatus:
    | "pending"
    | "confirmed"
    | "waitlisted"
    | "cancelled"
    | "refunded"
    | "checked-in";
  readonly selectionStatus: SelectionStatus;
  readonly selectionLocked: boolean;
  readonly selectionReason?: string;
  readonly seed?: number;
  readonly expectedTeamSize: number;
  readonly playersAdded: number;
  readonly claimedPlayers: number;
  readonly paidPlayers: number;
  readonly fullyPaid: boolean;
  readonly fullyPaidAt?: string;
  readonly registeredAt: string;
  readonly averageRating?: number;
  readonly qualificationScore?: number;
  readonly paymentMode: "self" | "team";
  readonly status:
    "assembling" | "ready" | "confirmed" | "cancelled" | "expired";
  readonly needsAttention: boolean;
  readonly expiresAt: string;
  readonly roster: readonly {
    readonly personId?: string;
    readonly orderId?: string;
    readonly displayName: string;
    readonly avatarUrl?: string;
    readonly status: "captain" | "selected" | "invited" | "claimed";
    readonly deliveryStatus?: "queued" | "sent" | "failed";
    readonly paid: boolean;
    readonly ratingDisplay?: number;
    readonly qualificationRating?: number;
  }[];
}

interface DivisionRecord {
  readonly division: typeof divisions.$inferSelect;
  readonly session: typeof sessions.$inferSelect;
  readonly kind: NonNullable<
    | (typeof programs.$inferSelect)["kind"]
    | (typeof eventTypes.$inferSelect)["kind"]
  >;
  readonly registrationSettings: Record<string, unknown> | null;
  readonly teams: readonly TeamOperationalSummary[];
}

async function loadDivisionRecord(
  organizationId: string,
  divisionId: string,
  now?: Date,
): Promise<DivisionRecord> {
  const owned = await ownedDivision(organizationId, divisionId);
  const database = getDatabase();
  const settings = owned.division.settings as DivisionSettings;
  const closesAt = registrationClose(owned.registrationSettings);
  const ratingCutoff =
    settings.seeding?.startsWith("sand-rating") &&
    closesAt &&
    now &&
    now >= closesAt
      ? closesAt
      : undefined;
  const rows = await database
    .select({
      id: teamEntries.id,
      teamId: teamEntries.teamId,
      seed: teamEntries.seed,
      selectionStatus: teamEntries.selectionStatus,
      selectionLocked: teamEntries.selectionLocked,
      selectionReason: teamEntries.selectionReason,
      qualificationScore: teamEntries.qualificationScore,
      expectedTeamSize: teamEntries.expectedTeamSize,
      paymentMode: teamEntries.paymentMode,
      roster: teamEntries.roster,
      entryStatus: teamEntries.status,
      claimExpiresAt: teamEntries.claimExpiresAt,
      registrationId: registrations.id,
      registrationStatus: registrations.status,
      registeredAt: registrations.createdAt,
      orderId: registrations.orderId,
      orderStatus: orders.status,
      orderUpdatedAt: orders.updatedAt,
      captainId: people.id,
      captainName: people.displayName,
      captainAvatarUrl: people.avatarUrl,
    })
    .from(teamEntries)
    .innerJoin(registrations, eq(teamEntries.registrationId, registrations.id))
    .innerJoin(people, eq(teamEntries.payingPersonId, people.id))
    .leftJoin(orders, eq(registrations.orderId, orders.id))
    .where(
      and(
        eq(registrations.divisionId, divisionId),
        inArray(registrations.status, [
          "pending",
          "confirmed",
          "waitlisted",
          "checked-in",
        ]),
      ),
    )
    .orderBy(asc(registrations.createdAt));
  const personIds = [
    ...new Set(
      rows.flatMap((row) => [
        row.captainId,
        ...row.roster.flatMap((member) =>
          member.personId ? [member.personId] : [],
        ),
      ]),
    ),
  ];
  const [personRows, ratingRows, ratingEventRows] = await Promise.all([
    personIds.length
      ? database
          .select({
            id: people.id,
            displayName: people.displayName,
            avatarUrl: people.avatarUrl,
          })
          .from(people)
          .where(inArray(people.id, personIds))
      : Promise.resolve([]),
    personIds.length
      ? database
          .select({
            personId: ratings.personId,
            display: ratings.display,
            current52WeekPeak: ratings.current52WeekPeak,
            updatedAt: ratings.updatedAt,
          })
          .from(ratings)
          .where(
            and(
              inArray(ratings.personId, personIds),
              eq(ratings.discipline, owned.division.discipline),
            ),
          )
      : Promise.resolve([]),
    personIds.length && ratingCutoff
      ? database
          .select({
            personId: ratingEvents.personId,
            after: ratingEvents.after,
            createdAt: ratingEvents.createdAt,
          })
          .from(ratingEvents)
          .where(
            and(
              inArray(ratingEvents.personId, personIds),
              eq(ratingEvents.discipline, owned.division.discipline),
              lte(ratingEvents.createdAt, ratingCutoff),
            ),
          )
          .orderBy(asc(ratingEvents.createdAt), asc(ratingEvents.sequence))
      : Promise.resolve([]),
  ]);
  const personById = new Map(personRows.map((person) => [person.id, person]));
  const ratingById = new Map(
    ratingRows.map((rating) => [rating.personId, rating]),
  );
  const usePeak = settings.seeding === "sand-rating-ttm";
  const qualificationRatingById = new Map<string, number>();
  if (ratingCutoff) {
    const peakWindowStartsAt = new Date(
      ratingCutoff.getTime() - 52 * 7 * 24 * 60 * 60_000,
    );
    for (const event of ratingEventRows) {
      const display = event.after.display;
      if (typeof display !== "number") continue;
      if (usePeak) {
        if (event.createdAt < peakWindowStartsAt) continue;
        qualificationRatingById.set(
          event.personId,
          Math.max(
            qualificationRatingById.get(event.personId) ?? display,
            display,
          ),
        );
      } else {
        qualificationRatingById.set(event.personId, display);
      }
    }
    for (const rating of ratingRows) {
      if (
        !qualificationRatingById.has(rating.personId) &&
        rating.updatedAt <= ratingCutoff
      ) {
        qualificationRatingById.set(
          rating.personId,
          usePeak ? rating.current52WeekPeak : rating.display,
        );
      }
    }
  } else {
    for (const rating of ratingRows) {
      qualificationRatingById.set(
        rating.personId,
        usePeak ? rating.current52WeekPeak : rating.display,
      );
    }
  }
  const summaries = rows.map((row): TeamOperationalSummary => {
    const captainPaid =
      row.orderStatus === "paid" ||
      (row.registrationStatus === "confirmed" && !row.orderStatus) ||
      row.registrationStatus === "checked-in";
    const paidPlayers =
      row.paymentMode === "team" && captainPaid
        ? row.expectedTeamSize
        : (captainPaid ? 1 : 0) +
          row.roster.filter((member) => Boolean(member.paidAt)).length;
    const roster = [
      {
        personId: row.captainId,
        orderId: row.orderId ?? undefined,
        displayName: row.captainName,
        avatarUrl: row.captainAvatarUrl ?? undefined,
        status: "captain" as const,
        paid: captainPaid,
        ratingDisplay: ratingById.get(row.captainId)?.display,
        qualificationRating: qualificationRatingById.get(row.captainId),
      },
      ...row.roster.map((member) => {
        const person = member.personId
          ? personById.get(member.personId)
          : undefined;
        return {
          personId: member.personId,
          orderId: member.orderId,
          displayName:
            person?.displayName ??
            member.displayName ??
            member.inviteTarget ??
            "Invite pending",
          avatarUrl: person?.avatarUrl ?? undefined,
          status: member.status,
          deliveryStatus: member.deliveryStatus,
          paid:
            row.paymentMode === "team" ? captainPaid : Boolean(member.paidAt),
          ratingDisplay: member.personId
            ? ratingById.get(member.personId)?.display
            : undefined,
          qualificationRating: member.personId
            ? qualificationRatingById.get(member.personId)
            : undefined,
        };
      }),
    ];
    const numericRatings = roster.flatMap((member) =>
      member.ratingDisplay === undefined ? [] : [member.ratingDisplay],
    );
    const qualificationRatings = roster.flatMap((member) =>
      member.qualificationRating === undefined
        ? []
        : [member.qualificationRating],
    );
    const fullyPaid = paidPlayers >= row.expectedTeamSize;
    const paidMoments = [
      ...(captainPaid && row.orderUpdatedAt ? [row.orderUpdatedAt] : []),
      ...row.roster.flatMap((member) =>
        member.paidAt ? [new Date(member.paidAt)] : [],
      ),
    ];
    const fullyPaidAt =
      fullyPaid && paidMoments.length
        ? new Date(Math.max(...paidMoments.map((value) => value.getTime())))
        : undefined;
    const derivedSelection: SelectionStatus =
      row.selectionStatus === "confirmed" ||
      row.selectionStatus === "waitlisted" ||
      row.selectionStatus === "withdrawn"
        ? row.selectionStatus
        : row.registrationStatus === "confirmed" ||
            row.registrationStatus === "checked-in"
          ? "confirmed"
          : row.registrationStatus === "waitlisted"
            ? "waitlisted"
            : "pending";
    const entryStatus =
      row.entryStatus === "ready" ||
      row.entryStatus === "confirmed" ||
      row.entryStatus === "cancelled" ||
      row.entryStatus === "expired"
        ? row.entryStatus
        : "assembling";
    return {
      id: row.id,
      registrationId: row.registrationId,
      teamId: row.teamId ?? undefined,
      divisionId,
      divisionName: owned.division.name,
      name: roster
        .slice(0, 2)
        .map((member) => member.displayName)
        .join(" / "),
      captainName: row.captainName,
      registrationStatus:
        row.registrationStatus === "invited"
          ? "pending"
          : row.registrationStatus,
      selectionStatus: derivedSelection,
      selectionLocked: row.selectionLocked,
      selectionReason: row.selectionReason ?? undefined,
      seed: row.seed ?? undefined,
      expectedTeamSize: row.expectedTeamSize,
      playersAdded: Math.min(row.expectedTeamSize, roster.length),
      claimedPlayers:
        1 + row.roster.filter((member) => member.status === "claimed").length,
      paidPlayers,
      fullyPaid,
      fullyPaidAt: fullyPaidAt?.toISOString(),
      registeredAt: row.registeredAt.toISOString(),
      averageRating:
        numericRatings.length > 0
          ? numericRatings.reduce((total, value) => total + value, 0) /
            numericRatings.length
          : undefined,
      qualificationScore:
        row.qualificationScore ??
        (qualificationRatings.length > 0
          ? qualificationRatings.reduce((total, value) => total + value, 0) /
            qualificationRatings.length
          : undefined),
      paymentMode: row.paymentMode === "team" ? "team" : "self",
      status: entryStatus,
      needsAttention:
        entryStatus === "assembling" &&
        (roster.length < row.expectedTeamSize ||
          1 +
            row.roster.filter((member) => member.status === "claimed").length <
            row.expectedTeamSize ||
          paidPlayers < row.expectedTeamSize),
      expiresAt: row.claimExpiresAt.toISOString(),
      roster,
    };
  });
  return {
    division: owned.division,
    session: owned.session,
    kind: owned.programKind ?? owned.eventTypeKind ?? "tournament",
    registrationSettings: owned.registrationSettings,
    teams: summaries,
  };
}

interface DivisionOperationsDetail {
  readonly session: {
    readonly id: string;
    readonly title: string;
    readonly kind: string;
    readonly startsAt: string;
    readonly timezone: string;
    readonly venueId?: string;
  };
  readonly division: {
    readonly id: string;
    readonly name: string;
    readonly discipline: string;
    readonly teamSize: number;
    readonly capacity: number;
    readonly maximumTeams?: number;
    readonly seeding: string;
    readonly tournamentFormat: string;
    readonly poolPlay?: DivisionSettings["poolPlay"];
    readonly registrationClosesAt?: string;
  };
  readonly teams: readonly TeamOperationalSummary[];
  readonly bracket?: {
    readonly id: string;
    readonly version: number;
    readonly format: string;
    readonly structure: Record<string, unknown>;
    readonly createdAt: string;
  };
  readonly matches: readonly {
    readonly id: string;
    readonly status: string;
    readonly label: string;
    readonly teamAName?: string;
    readonly teamBName?: string;
    readonly courtId?: string;
    readonly courtName?: string;
    readonly scheduledAt?: string;
  }[];
  readonly courts: readonly { readonly id: string; readonly name: string }[];
}

export async function loadOperatorDivisionDetail(input: {
  readonly organizationId: string;
  readonly divisionId: string;
}): Promise<DivisionOperationsDetail> {
  requireDatabase();
  const record = await loadDivisionRecord(
    input.organizationId,
    input.divisionId,
  );
  const database = getDatabase();
  const latestBracket = await database.query.brackets.findFirst({
    where: eq(brackets.divisionId, input.divisionId),
    orderBy: [desc(brackets.version)],
  });
  const matchRows = latestBracket
    ? await database
        .select()
        .from(matches)
        .where(eq(matches.bracketId, latestBracket.id))
        .orderBy(asc(matches.createdAt))
    : [];
  const courtRows = record.session.venueId
    ? await database
        .select({ id: courts.id, name: courts.name })
        .from(courts)
        .innerJoin(venues, eq(courts.venueId, venues.id))
        .where(
          and(
            eq(courts.venueId, record.session.venueId),
            eq(venues.organizationId, input.organizationId),
          ),
        )
        .orderBy(asc(courts.name))
    : [];
  const matchTeamIds = [
    ...new Set(
      matchRows.flatMap((match) =>
        [match.teamAId, match.teamBId].filter((teamId): teamId is string =>
          Boolean(teamId),
        ),
      ),
    ),
  ];
  const matchTeamRows = matchTeamIds.length
    ? await database
        .select({ id: teams.id, name: teams.name })
        .from(teams)
        .where(inArray(teams.id, matchTeamIds))
    : [];
  const teamNameById = new Map(
    matchTeamRows.map((team) => [team.id, team.name] as const),
  );
  const courtNameById = new Map(
    courtRows.map((court) => [court.id, court.name] as const),
  );
  const settings = record.division.settings as DivisionSettings;
  const closesAt = registrationClose(record.registrationSettings);
  return {
    session: {
      id: record.session.id,
      title: record.session.title,
      kind: record.kind,
      startsAt: record.session.startsAt.toISOString(),
      timezone: record.session.timezone,
      venueId: record.session.venueId ?? undefined,
    },
    division: {
      id: record.division.id,
      name: record.division.name,
      discipline: record.division.discipline,
      teamSize: record.division.teamSize,
      capacity: record.division.capacity,
      maximumTeams: record.division.maximumTeams ?? undefined,
      seeding: settings.seeding ?? "first-come",
      tournamentFormat: settings.tournamentFormat ?? "single-elimination",
      poolPlay: settings.poolPlay,
      registrationClosesAt: closesAt?.toISOString(),
    },
    teams: record.teams,
    bracket: latestBracket
      ? {
          id: latestBracket.id,
          version: latestBracket.version,
          format: latestBracket.format,
          structure: latestBracket.structure,
          createdAt: latestBracket.createdAt.toISOString(),
        }
      : undefined,
    matches: matchRows.map((match) => {
      const format = match.format as {
        label?: string;
        bracket?: string;
        round?: number;
        position?: number;
      };
      return {
        id: match.id,
        status: match.status,
        label:
          format.label ??
          `${format.bracket ?? "Match"} · round ${format.round ?? 1} · ${format.position ?? 1}`,
        teamAName: match.teamAId ? teamNameById.get(match.teamAId) : undefined,
        teamBName: match.teamBId ? teamNameById.get(match.teamBId) : undefined,
        courtId: match.courtId ?? undefined,
        courtName: match.courtId ? courtNameById.get(match.courtId) : undefined,
        scheduledAt: match.scheduledAt?.toISOString(),
      };
    }),
    courts: courtRows,
  };
}

function nextAvailableSeed(used: Set<number>): number {
  let seed = 1;
  while (used.has(seed)) seed += 1;
  used.add(seed);
  return seed;
}

export interface DivisionSelectionCandidate {
  readonly id: string;
  readonly fullyPaid: boolean;
  readonly fullyPaidAt?: string;
  readonly registeredAt: string;
  readonly averageRating?: number;
  readonly qualificationScore?: number;
  readonly selectionStatus: SelectionStatus;
  readonly selectionLocked: boolean;
  readonly seed?: number;
}

export interface DivisionSelectionDecision {
  readonly id: string;
  readonly selectionStatus: SelectionStatus;
  readonly seed?: number;
  readonly qualificationScore?: number;
}

/** Pure qualification plan used by the API, payment workflow, and unit tests. */
export function planDivisionSelection(input: {
  readonly method: NonNullable<DivisionSettings["seeding"]>;
  readonly maximumTeams: number;
  readonly teams: readonly DivisionSelectionCandidate[];
}): readonly DivisionSelectionDecision[] {
  const score = (team: DivisionSelectionCandidate): number | undefined =>
    input.method === "first-come"
      ? team.fullyPaidAt
        ? -new Date(team.fullyPaidAt).getTime()
        : -new Date(team.registeredAt).getTime()
      : (team.qualificationScore ?? team.averageRating);
  const rank = (
    left: DivisionSelectionCandidate,
    right: DivisionSelectionCandidate,
  ): number => {
    if (input.method === "manual") {
      return (
        (left.seed ?? Number.MAX_SAFE_INTEGER) -
          (right.seed ?? Number.MAX_SAFE_INTEGER) ||
        left.registeredAt.localeCompare(right.registeredAt)
      );
    }
    if (input.method === "first-come") {
      return (
        (left.fullyPaidAt ?? left.registeredAt).localeCompare(
          right.fullyPaidAt ?? right.registeredAt,
        ) || left.registeredAt.localeCompare(right.registeredAt)
      );
    }
    return (
      (score(right) ?? -1) - (score(left) ?? -1) ||
      (left.fullyPaidAt ?? left.registeredAt).localeCompare(
        right.fullyPaidAt ?? right.registeredAt,
      ) ||
      left.registeredAt.localeCompare(right.registeredAt)
    );
  };
  const eligible = input.teams.filter(
    (team) => team.fullyPaid && team.selectionStatus !== "withdrawn",
  );
  const lockedConfirmed = eligible
    .filter(
      (team) => team.selectionLocked && team.selectionStatus === "confirmed",
    )
    .sort(rank);
  const lockedWaitlisted = eligible
    .filter(
      (team) => team.selectionLocked && team.selectionStatus === "waitlisted",
    )
    .sort(rank);
  const rankedUnlocked = eligible
    .filter((team) => !team.selectionLocked)
    .sort(rank);
  const remainingSpots = Math.max(
    0,
    input.maximumTeams - lockedConfirmed.length,
  );
  const promoted = rankedUnlocked.slice(0, remainingSpots);
  const promotedIds = new Set(promoted.map((team) => team.id));
  const confirmedOrder = [...lockedConfirmed, ...promoted];
  const waitlistOrder = [
    ...lockedWaitlisted,
    ...rankedUnlocked.filter((team) => !promotedIds.has(team.id)),
  ];
  const seedById = new Map<string, number>();
  const usedSeeds = new Set<number>();
  for (const team of confirmedOrder) {
    const requested = team.seed;
    let seed: number;
    if (requested && !usedSeeds.has(requested)) {
      usedSeeds.add(requested);
      seed = requested;
    } else {
      seed = nextAvailableSeed(usedSeeds);
    }
    seedById.set(team.id, seed);
  }
  for (const team of waitlistOrder) {
    seedById.set(team.id, nextAvailableSeed(usedSeeds));
  }
  const confirmedIds = new Set(confirmedOrder.map((team) => team.id));
  const waitlistedIds = new Set(waitlistOrder.map((team) => team.id));
  return input.teams.map((team) => ({
    id: team.id,
    selectionStatus:
      team.selectionStatus === "withdrawn"
        ? "withdrawn"
        : confirmedIds.has(team.id)
          ? "confirmed"
          : waitlistedIds.has(team.id)
            ? "waitlisted"
            : "pending",
    seed: seedById.get(team.id),
    qualificationScore: score(team),
  }));
}

export async function reconcileDivisionSelection(
  input: MutationContext & {
    readonly divisionId: string;
    readonly force?: boolean;
  },
): Promise<OperatorMutationResult> {
  requireDatabase();
  const organizationId = requireOrganization(input.actor);
  const record = await loadDivisionRecord(
    organizationId,
    input.divisionId,
    input.now,
  );
  const settings = record.division.settings as DivisionSettings;
  const method = settings.seeding ?? "first-come";
  const closesAt = registrationClose(record.registrationSettings);
  if (
    method.startsWith("sand-rating") &&
    closesAt &&
    input.now < closesAt &&
    !input.force
  ) {
    return {
      id: input.divisionId,
      entity: "division",
      status: "awaiting-registration-close",
    };
  }
  const maximumTeams =
    record.division.maximumTeams ??
    Math.max(
      1,
      Math.floor(record.division.capacity / record.division.teamSize),
    );
  const plan = planDivisionSelection({
    method,
    maximumTeams,
    teams: record.teams,
  });
  const decisionById = new Map(plan.map((decision) => [decision.id, decision]));
  const database = getTransactionalDatabase();
  await database.transaction(async (transaction) => {
    for (const summary of record.teams) {
      if (summary.selectionStatus === "withdrawn") continue;
      const decision = decisionById.get(summary.id)!;
      const { selectionStatus, seed, qualificationScore } = decision;
      let teamId = summary.teamId;
      if (!teamId) {
        // Reusing the team-entry UUID makes concurrent payment webhooks
        // converge on one canonical competition team instead of orphaning
        // duplicate rows.
        teamId = summary.id;
        await transaction
          .insert(teams)
          .values({
            id: teamId,
            divisionId: input.divisionId,
            name: summary.name,
            seed,
            status: selectionStatus === "confirmed" ? "active" : "waitlisted",
          })
          .onConflictDoUpdate({
            target: teams.id,
            set: {
              name: summary.name,
              seed,
              status: selectionStatus === "confirmed" ? "active" : "waitlisted",
              updatedAt: input.now,
            },
          });
      } else {
        await transaction
          .update(teams)
          .set({
            name: summary.name,
            seed,
            status: selectionStatus === "confirmed" ? "active" : "waitlisted",
            updatedAt: input.now,
          })
          .where(eq(teams.id, teamId));
      }
      const playerIds = summary.roster.flatMap((member) =>
        member.personId ? [member.personId] : [],
      );
      await transaction
        .delete(teamMembers)
        .where(eq(teamMembers.teamId, teamId));
      if (playerIds.length) {
        await transaction
          .insert(teamMembers)
          .values(
            playerIds.map((personId) => ({
              teamId: teamId!,
              personId,
              role:
                personId === summary.roster[0]?.personId ? "captain" : "player",
            })),
          )
          .onConflictDoNothing();
      }
      await transaction
        .update(teamEntries)
        .set({
          teamId,
          seed,
          selectionStatus,
          selectionReason: summary.selectionLocked
            ? summary.selectionReason
            : method === "first-come"
              ? "Fully paid order"
              : `Provisional ${method} ranking`,
          qualificationScore,
          qualificationSnapshot: {
            method,
            calculatedAt: input.now.toISOString(),
            registrationClosesAt: closesAt?.toISOString(),
            fullyPaidAt: summary.fullyPaidAt,
            playerRatings: summary.roster.flatMap((member) =>
              member.personId
                ? [
                    {
                      personId: member.personId,
                      display:
                        member.qualificationRating ?? member.ratingDisplay,
                    },
                  ]
                : [],
            ),
          },
          selectedAt: summary.fullyPaid ? input.now : null,
          updatedAt: input.now,
        })
        .where(eq(teamEntries.id, summary.id));
      await transaction
        .update(registrations)
        .set({
          status:
            selectionStatus === "confirmed"
              ? "confirmed"
              : selectionStatus === "waitlisted"
                ? "waitlisted"
                : "pending",
          updatedAt: input.now,
        })
        .where(eq(registrations.id, summary.registrationId));
    }
    if (method.startsWith("sand-rating") && closesAt && input.now >= closesAt) {
      await transaction
        .update(divisions)
        .set({
          settings: {
            ...settings,
            qualificationFinalizedAt: input.now.toISOString(),
            qualificationFinalizedRegistrationClosesAt: closesAt.toISOString(),
          },
          updatedAt: input.now,
        })
        .where(eq(divisions.id, input.divisionId));
    }
    await transaction.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "division.selection_reconciled",
      entityType: "division",
      entityId: input.divisionId,
      afterHash: stableHash({
        method,
        maximumTeams,
        decisions: plan,
      }),
      reason: `Reconciled ${method} qualification and waitlist order.`,
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    });
  });
  const confirmedCount = plan.filter(
    (decision) => decision.selectionStatus === "confirmed",
  ).length;
  if (record.kind === "league" && confirmedCount >= 2) {
    const latest = await getDatabase().query.brackets.findFirst({
      where: eq(brackets.divisionId, input.divisionId),
      orderBy: [desc(brackets.version)],
    });
    const latestTeamIds = new Set(
      (
        (latest?.structure as { teams?: readonly { id: string }[] } | null)
          ?.teams ?? []
      ).map((team) => team.id),
    );
    const confirmedTeamIds = new Set(
      (
        await loadDivisionRecord(organizationId, input.divisionId)
      ).teams.flatMap((team) =>
        team.selectionStatus === "confirmed" && team.teamId
          ? [team.teamId]
          : [],
      ),
    );
    const sameField =
      latest?.format === "round-robin" &&
      latestTeamIds.size === confirmedTeamIds.size &&
      [...confirmedTeamIds].every((teamId) => latestTeamIds.has(teamId));
    if (!sameField) {
      await persistDivisionBracket({
        ...input,
        format: "round-robin",
        reason: "League field changed; Duna generated the updated matchups.",
        requestId: `${input.requestId}:auto-league-schedule`,
      });
    }
  }
  return {
    id: input.divisionId,
    entity: "division",
    status: `confirmed-${confirmedCount}`,
  };
}

export async function reconcilePaidOrderDivisionSelections(input: {
  readonly orderId: string;
  readonly now: Date;
  readonly requestId: string;
}): Promise<readonly OperatorMutationResult[]> {
  if (!process.env.DATABASE_URL) return [];
  const database = getDatabase();
  const order = await database.query.orders.findFirst({
    where: eq(orders.id, input.orderId),
  });
  if (!order?.organizationId) return [];
  const [buyer, directRows, teammateRows] = await Promise.all([
    database.query.people.findFirst({
      where: eq(people.id, order.buyerPersonId),
    }),
    database
      .select({ divisionId: registrations.divisionId })
      .from(registrations)
      .where(eq(registrations.orderId, input.orderId)),
    database
      .select({ divisionId: registrations.divisionId })
      .from(teamEntries)
      .innerJoin(
        registrations,
        eq(teamEntries.registrationId, registrations.id),
      )
      .where(
        sql`${teamEntries.roster} @> ${JSON.stringify([{ orderId: input.orderId }])}::jsonb`,
      ),
  ]);
  if (!buyer) return [];
  const divisionIds = [
    ...new Set(
      [...directRows, ...teammateRows].flatMap((row) =>
        row.divisionId ? [row.divisionId] : [],
      ),
    ),
  ];
  const actor: ApiActor = {
    personId: buyer.id,
    displayName: buyer.displayName,
    roles: ["player"],
    organizationId: order.organizationId,
    scopes: [],
    ageBand: buyer.isMinor ? "teen" : "adult",
    isDemo: false,
  };
  const results: OperatorMutationResult[] = [];
  for (const divisionId of divisionIds) {
    results.push(
      await reconcileDivisionSelection({
        actor,
        divisionId,
        requestId: `${input.requestId}:${divisionId}`,
        now: input.now,
      }),
    );
  }
  return results;
}

export async function reconcileRegistrationDivisionSelection(
  input: MutationContext & { readonly registrationId: string },
): Promise<OperatorMutationResult | undefined> {
  const registration = await getDatabase().query.registrations.findFirst({
    where: eq(registrations.id, input.registrationId),
  });
  if (!registration?.divisionId) return undefined;
  return reconcileDivisionSelection({
    ...input,
    divisionId: registration.divisionId,
  });
}

export async function reconcileScheduledDivisionSelections(input: {
  readonly now: Date;
  readonly limit?: number;
}): Promise<{
  readonly processed: number;
  readonly skipped: number;
  readonly failedDivisionIds: readonly string[];
}> {
  requireDatabase();
  const database = getDatabase();
  const registrationCloseExpression = sql<string>`coalesce(
    ${eventBlueprints.registrationSettings}->>'registrationClosesAt',
    ${eventBlueprints.registrationSettings}->>'registrationCloseAt',
    ${eventBlueprints.registrationSettings}->>'closesAt'
  )`;
  const rows = await database
    .select({
      divisionId: divisions.id,
      settings: divisions.settings,
      registrationSettings: eventBlueprints.registrationSettings,
      sessionStatus: sessions.status,
      coachPersonId: sessions.coachPersonId,
      needsTeamBackfill: sql<boolean>`exists(
        select 1
        from team_entries pending_team_entry
        join registrations pending_registration
          on pending_registration.id = pending_team_entry.registration_id
        where pending_registration.division_id = ${divisions.id}
          and pending_team_entry.team_id is null
          and pending_registration.status in ('pending', 'confirmed', 'waitlisted', 'checked-in')
      )`,
      organizationId: sql<
        string | null
      >`coalesce(${programs.organizationId}, ${eventTypes.organizationId}, ${venues.organizationId})`,
    })
    .from(divisions)
    .innerJoin(sessions, eq(divisions.sessionId, sessions.id))
    .leftJoin(eventBlueprints, eq(sessions.id, eventBlueprints.sessionId))
    .leftJoin(programs, eq(sessions.programId, programs.id))
    .leftJoin(eventTypes, eq(sessions.eventTypeId, eventTypes.id))
    .leftJoin(venues, eq(sessions.venueId, venues.id))
    .where(
      and(
        inArray(sessions.status, [
          "published",
          "registration-open",
          "live",
          "weather-hold",
        ]),
        sql`(
          (
            ${divisions.settings}->>'seeding' LIKE 'sand-rating%'
            AND ${registrationCloseExpression} ~ '^\\d{4}-\\d{2}-\\d{2}T'
            AND ${registrationCloseExpression}::timestamptz <= ${input.now}
            AND coalesce(${divisions.settings}->>'qualificationFinalizedRegistrationClosesAt', '') <> ${registrationCloseExpression}
          )
          OR (
            coalesce(${divisions.settings}->>'seeding', 'first-come') = 'first-come'
            AND exists(
              select 1
              from team_entries pending_team_entry
              join registrations pending_registration
                on pending_registration.id = pending_team_entry.registration_id
              where pending_registration.division_id = ${divisions.id}
                and pending_team_entry.team_id is null
                and pending_registration.status in ('pending', 'confirmed', 'waitlisted', 'checked-in')
            )
          )
        )`,
      ),
    )
    .orderBy(asc(sessions.startsAt))
    .limit(Math.max(1, Math.min(input.limit ?? 100, 500)));
  let processed = 0;
  let skipped = 0;
  const failedDivisionIds: string[] = [];
  for (const row of rows) {
    const settings = row.settings as DivisionSettings;
    const closesAt = registrationClose(row.registrationSettings);
    const ratingFinalizationReady = Boolean(
      settings.seeding?.startsWith("sand-rating") &&
      closesAt &&
      closesAt <= input.now &&
      settings.qualificationFinalizedRegistrationClosesAt !==
        closesAt.toISOString(),
    );
    const firstComeBackfillReady =
      (settings.seeding ?? "first-come") === "first-come" &&
      row.needsTeamBackfill;
    if (
      !row.organizationId ||
      (!ratingFinalizationReady && !firstComeBackfillReady)
    ) {
      skipped += 1;
      continue;
    }
    try {
      const membership = row.coachPersonId
        ? undefined
        : await database
            .select({
              personId: organizationMemberships.personId,
              role: organizationMemberships.role,
            })
            .from(organizationMemberships)
            .where(
              and(
                eq(organizationMemberships.organizationId, row.organizationId),
                eq(organizationMemberships.active, true),
                inArray(organizationMemberships.role, [
                  "owner",
                  "manager",
                  "coach",
                ]),
              ),
            )
            .limit(1)
            .then((memberships) => memberships[0]);
      const actorPersonId = row.coachPersonId ?? membership?.personId;
      if (!actorPersonId) {
        failedDivisionIds.push(row.divisionId);
        continue;
      }
      const actorPerson = await database.query.people.findFirst({
        where: eq(people.id, actorPersonId),
      });
      if (!actorPerson) {
        failedDivisionIds.push(row.divisionId);
        continue;
      }
      await reconcileDivisionSelection({
        actor: {
          personId: actorPerson.id,
          displayName: actorPerson.displayName,
          roles: [membership?.role ?? "coach"],
          organizationId: row.organizationId,
          scopes: ["sessions:write"],
          ageBand: actorPerson.isMinor ? "teen" : "adult",
          isDemo: false,
        },
        divisionId: row.divisionId,
        requestId: ratingFinalizationReady
          ? `registration-close:${row.divisionId}:${closesAt!.toISOString()}`
          : `team-selection-backfill:${row.divisionId}`,
        now: input.now,
      });
      processed += 1;
    } catch {
      failedDivisionIds.push(row.divisionId);
    }
  }
  return { processed, skipped, failedDivisionIds };
}

export async function setTeamSelection(
  input: MutationContext & {
    readonly teamEntryId: string;
    readonly selectionStatus: Exclude<SelectionStatus, "pending">;
    readonly seed?: number;
    readonly reason: string;
  },
): Promise<OperatorMutationResult> {
  requireDatabase();
  const organizationId = requireOrganization(input.actor);
  const row = await getDatabase()
    .select({
      teamEntry: teamEntries,
      registration: registrations,
      divisionId: divisions.id,
      organizationId: sql<
        string | null
      >`coalesce(${programs.organizationId}, ${eventTypes.organizationId}, ${venues.organizationId})`,
    })
    .from(teamEntries)
    .innerJoin(registrations, eq(teamEntries.registrationId, registrations.id))
    .innerJoin(divisions, eq(registrations.divisionId, divisions.id))
    .innerJoin(sessions, eq(divisions.sessionId, sessions.id))
    .leftJoin(programs, eq(sessions.programId, programs.id))
    .leftJoin(eventTypes, eq(sessions.eventTypeId, eventTypes.id))
    .leftJoin(venues, eq(sessions.venueId, venues.id))
    .where(eq(teamEntries.id, input.teamEntryId))
    .limit(1)
    .then((rows) => rows[0]);
  if (!row || row.organizationId !== organizationId) {
    throw new Error("Team was not found in this organization.");
  }
  if (input.seed) {
    const seedConflict = await getDatabase()
      .select({ id: teamEntries.id })
      .from(teamEntries)
      .innerJoin(
        registrations,
        eq(teamEntries.registrationId, registrations.id),
      )
      .where(
        and(
          eq(registrations.divisionId, row.divisionId),
          eq(teamEntries.seed, input.seed),
          sql`${teamEntries.id} <> ${input.teamEntryId}::uuid`,
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);
    if (seedConflict) {
      throw new Error(
        `Seed ${input.seed} is already assigned in this division.`,
      );
    }
  }
  const nextRegistrationStatus =
    input.selectionStatus === "confirmed"
      ? "confirmed"
      : input.selectionStatus === "waitlisted"
        ? "waitlisted"
        : "cancelled";
  const database = getDatabase();
  await database.batch([
    database
      .update(teamEntries)
      .set({
        selectionStatus: input.selectionStatus,
        selectionLocked: true,
        selectionReason: input.reason,
        seed: input.seed ?? row.teamEntry.seed,
        selectedAt: input.now,
        status:
          input.selectionStatus === "withdrawn"
            ? "cancelled"
            : row.teamEntry.status,
        updatedAt: input.now,
      })
      .where(eq(teamEntries.id, input.teamEntryId)),
    database
      .update(registrations)
      .set({
        status: nextRegistrationStatus,
        overriddenByPersonId: input.actor.personId,
        overrideReason: input.reason,
        updatedAt: input.now,
      })
      .where(eq(registrations.id, row.registration.id)),
    row.teamEntry.teamId
      ? database
          .update(teams)
          .set({
            seed: input.seed ?? row.teamEntry.seed,
            status:
              input.selectionStatus === "confirmed"
                ? "active"
                : input.selectionStatus,
            updatedAt: input.now,
          })
          .where(eq(teams.id, row.teamEntry.teamId))
      : database
          .update(teams)
          .set({ updatedAt: input.now })
          .where(sql`false`),
    database.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "division.team_selection_overridden",
      entityType: "team-entry",
      entityId: input.teamEntryId,
      beforeHash: stableHash({
        status: row.teamEntry.selectionStatus,
        seed: row.teamEntry.seed,
      }),
      afterHash: stableHash({
        status: input.selectionStatus,
        seed: input.seed ?? row.teamEntry.seed,
      }),
      reason: input.reason,
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  await reconcileDivisionSelection({
    ...input,
    divisionId: row.divisionId,
    requestId: `${input.requestId}:promote`,
  });
  return {
    id: input.teamEntryId,
    entity: "team-entry",
    status: input.selectionStatus,
  };
}

export async function expandDivisionField(
  input: MutationContext & {
    readonly divisionId: string;
    readonly maximumTeams: number;
    readonly reason: string;
  },
): Promise<OperatorMutationResult> {
  requireDatabase();
  const organizationId = requireOrganization(input.actor);
  const record = await ownedDivision(organizationId, input.divisionId);
  const currentMaximum =
    record.division.maximumTeams ??
    Math.floor(record.division.capacity / record.division.teamSize);
  if (input.maximumTeams < currentMaximum) {
    throw new Error("Use team actions before reducing a published field.");
  }
  await getDatabase().batch([
    getDatabase()
      .update(divisions)
      .set({
        maximumTeams: input.maximumTeams,
        capacity: Math.max(
          record.division.capacity,
          input.maximumTeams * record.division.teamSize,
        ),
        updatedAt: input.now,
      })
      .where(eq(divisions.id, input.divisionId)),
    getDatabase()
      .insert(auditLog)
      .values({
        organizationId,
        actorPersonId: input.actor.personId,
        actorType: "person",
        action: "division.field_expanded",
        entityType: "division",
        entityId: input.divisionId,
        beforeHash: stableHash({ maximumTeams: currentMaximum }),
        afterHash: stableHash({ maximumTeams: input.maximumTeams }),
        reason: input.reason,
        traceId: input.requestId,
        ipAddress: input.ipAddress,
        createdAt: input.now,
      }),
  ]);
  await reconcileDivisionSelection({
    ...input,
    requestId: `${input.requestId}:promote`,
  });
  return {
    id: input.divisionId,
    entity: "division",
    status: `field-${input.maximumTeams}`,
  };
}

export async function refundEventRegistration(
  input: MutationContext & {
    readonly registrationId: string;
    readonly orderId?: string;
    readonly reason: string;
  },
): Promise<OperatorMutationResult> {
  requireDatabase();
  const organizationId = requireOrganization(input.actor);
  const row = await getDatabase()
    .select({
      registration: registrations,
      divisionId: registrations.divisionId,
      teamEntryId: teamEntries.id,
      teamRoster: teamEntries.roster,
      teamPaymentMode: teamEntries.paymentMode,
      organizationId: sql<
        string | null
      >`coalesce(${programs.organizationId}, ${eventTypes.organizationId}, ${venues.organizationId})`,
    })
    .from(registrations)
    .innerJoin(sessions, eq(registrations.sessionId, sessions.id))
    .leftJoin(teamEntries, eq(teamEntries.registrationId, registrations.id))
    .leftJoin(programs, eq(sessions.programId, programs.id))
    .leftJoin(eventTypes, eq(sessions.eventTypeId, eventTypes.id))
    .leftJoin(venues, eq(sessions.venueId, venues.id))
    .where(eq(registrations.id, input.registrationId))
    .limit(1)
    .then((rows) => rows[0]);
  if (!row || row.organizationId !== organizationId) {
    throw new Error("A paid registration was not found.");
  }
  const associatedOrderIds = collectRegistrationOrderIds(
    row.registration.orderId,
    row.teamRoster ?? [],
  );
  const orderId = input.orderId ?? row.registration.orderId;
  if (!orderId || !associatedOrderIds.includes(orderId)) {
    throw new Error("That payment does not belong to this event registration.");
  }
  const order = await getDatabase().query.orders.findFirst({
    where: and(
      eq(orders.id, orderId),
      eq(orders.organizationId, organizationId),
    ),
  });
  if (!order) {
    throw new Error("A paid registration order was not found.");
  }
  const [cashRefunds, failedRefunds, creditApplications] = await Promise.all([
    getDatabase()
      .select({
        amount: sql<number>`coalesce(sum(${refundRecords.amountMinor}), 0)::bigint`,
      })
      .from(refundRecords)
      .where(
        and(
          eq(refundRecords.orderId, order.id),
          eq(refundRecords.disposition, "original-payment"),
          inArray(refundRecords.status, ["pending", "succeeded"]),
        ),
      )
      .then((rows) => rows[0]?.amount ?? 0),
    getDatabase()
      .select({ count: sql<number>`count(*)::int` })
      .from(refundRecords)
      .where(
        and(
          eq(refundRecords.orderId, order.id),
          eq(refundRecords.status, "failed"),
        ),
      )
      .then((rows) => rows[0]?.count ?? 0),
    getDatabase()
      .select()
      .from(organizationCreditApplications)
      .where(
        and(
          eq(organizationCreditApplications.orderId, order.id),
          isNull(organizationCreditApplications.restoredAt),
        ),
      ),
  ]);
  const amountMinor = order.stripePaymentIntentId
    ? Math.max(0, order.totalMinor - cashRefunds)
    : order.totalMinor;
  if (amountMinor === 0 && creditApplications.length === 0) {
    throw new Error("This registration has already been fully refunded.");
  }
  const result = await refundOrganizationOrder({
    actor: input.actor,
    orderId: order.id,
    amountMinor,
    disposition: "original-payment",
    reason: input.reason,
    requestId: `registration-refund:${input.registrationId}:${order.id}:attempt-${failedRefunds + 1}`,
    ipAddress: input.ipAddress,
    now: input.now,
  });
  if (result.status === "failed") return result;
  if (row.teamEntryId) {
    const refundedCaptain = order.id === row.registration.orderId;
    const roster = (row.teamRoster ?? []).map((member) =>
      member.orderId === order.id ? { ...member, paidAt: undefined } : member,
    );
    await getDatabase().batch([
      getDatabase()
        .update(teamEntries)
        .set({
          roster,
          status: "assembling",
          claimedAt: null,
          rosterLockedAt: null,
          selectionStatus: "pending",
          selectionLocked: false,
          selectionReason: `${refundedCaptain ? "Captain" : "Team member"} payment refunded · ${input.reason}`,
          updatedAt: input.now,
        })
        .where(eq(teamEntries.id, row.teamEntryId)),
      getDatabase()
        .update(registrations)
        .set({ status: "pending", updatedAt: input.now })
        .where(eq(registrations.id, row.registration.id)),
    ]);
  } else {
    await getDatabase()
      .update(registrations)
      .set({ status: "refunded", updatedAt: input.now })
      .where(eq(registrations.id, row.registration.id));
  }
  if (row.divisionId) {
    await reconcileDivisionSelection({
      ...input,
      divisionId: row.divisionId,
      requestId: `${input.requestId}:promote`,
    });
  }
  return result;
}

function generateBracket(input: {
  readonly id: string;
  readonly format: Bracket["format"];
  readonly teams: readonly SeededTeam[];
  readonly version: number;
  readonly poolCount?: number;
}): Bracket {
  switch (input.format) {
    case "single-elimination":
      return generateSingleElimination(input);
    case "double-elimination-true-reset":
      return generateDoubleElimination({
        ...input,
        variant: "true-reset",
      });
    case "double-elimination-modified":
      return generateDoubleElimination({ ...input, variant: "modified" });
    case "double-elimination-crossover":
      return generateDoubleElimination({ ...input, variant: "crossover" });
    case "round-robin":
      return generateRoundRobin(input);
    case "pool-play":
      return generatePoolPlay({
        ...input,
        poolCount: input.poolCount ?? 2,
      });
  }
}

export async function persistDivisionBracket(
  input: MutationContext & {
    readonly divisionId: string;
    readonly format: Bracket["format"];
    readonly poolCount?: number;
    readonly reason: string;
  },
): Promise<OperatorMutationResult> {
  requireDatabase();
  const organizationId = requireOrganization(input.actor);
  const record = await loadDivisionRecord(organizationId, input.divisionId);
  const confirmed = record.teams
    .filter(
      (team) =>
        team.selectionStatus === "confirmed" && team.teamId && team.seed,
    )
    .sort((left, right) => left.seed! - right.seed!);
  if (confirmed.length < 2) {
    throw new Error("Confirm and seed at least two teams first.");
  }
  const current = await getDatabase().query.brackets.findFirst({
    where: eq(brackets.divisionId, input.divisionId),
    orderBy: [desc(brackets.version)],
  });
  const bracketId = crypto.randomUUID();
  const version = (current?.version ?? 0) + 1;
  const generated = generateBracket({
    id: bracketId,
    format: input.format,
    teams: confirmed.map((team) => ({
      id: team.teamId!,
      seed: team.seed!,
      name: team.name,
    })),
    version,
    poolCount: input.poolCount,
  });
  const teamIdBySeed = new Map(
    generated.teams.map((team) => [team.seed, team.id] as const),
  );
  const database = getTransactionalDatabase();
  await database.transaction(async (transaction) => {
    await transaction.insert(brackets).values({
      id: bracketId,
      divisionId: input.divisionId,
      version,
      format: generated.format,
      structure: generated as unknown as Record<string, unknown>,
      supersedesBracketId: current?.id,
      changeReason: input.reason,
    });
    await transaction.insert(matches).values(
      generated.matches.map((match) => ({
        id: crypto.randomUUID(),
        divisionId: input.divisionId,
        bracketId,
        teamAId:
          match.sideA.kind === "seed"
            ? teamIdBySeed.get(match.sideA.seed)
            : undefined,
        teamBId:
          match.sideB.kind === "seed"
            ? teamIdBySeed.get(match.sideB.seed)
            : undefined,
        venueId: record.session.venueId,
        createdByPersonId: input.actor.personId,
        status: "scheduled" as const,
        format: {
          logicalId: match.id,
          bracket: match.bracket,
          round: match.round,
          position: match.position,
          sideA: match.sideA,
          sideB: match.sideB,
          ifNecessary: match.ifNecessary,
          label: match.label,
        },
      })),
    );
    await transaction.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "division.bracket_published",
      entityType: "bracket",
      entityId: bracketId,
      afterHash: stableHash(generated),
      reason: input.reason,
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    });
  });
  return {
    id: bracketId,
    entity: "bracket",
    status: `version-${version}`,
  };
}

export async function updateDivisionMatchSchedule(
  input: MutationContext & {
    readonly matchId: string;
    readonly courtId?: string;
    readonly scheduledAt?: Date;
    readonly reason: string;
  },
): Promise<OperatorMutationResult> {
  requireDatabase();
  const organizationId = requireOrganization(input.actor);
  const row = await getDatabase()
    .select({
      match: matches,
      sessionVenueId: sessions.venueId,
      organizationId: sql<
        string | null
      >`coalesce(${programs.organizationId}, ${eventTypes.organizationId}, ${venues.organizationId})`,
    })
    .from(matches)
    .innerJoin(divisions, eq(matches.divisionId, divisions.id))
    .innerJoin(sessions, eq(divisions.sessionId, sessions.id))
    .leftJoin(programs, eq(sessions.programId, programs.id))
    .leftJoin(eventTypes, eq(sessions.eventTypeId, eventTypes.id))
    .leftJoin(venues, eq(sessions.venueId, venues.id))
    .where(eq(matches.id, input.matchId))
    .limit(1)
    .then((rows) => rows[0]);
  if (!row || row.organizationId !== organizationId) {
    throw new Error("Match was not found in this organization.");
  }
  if (input.courtId) {
    const court = await getDatabase()
      .select({ id: courts.id })
      .from(courts)
      .innerJoin(venues, eq(courts.venueId, venues.id))
      .where(
        and(
          eq(courts.id, input.courtId),
          eq(venues.organizationId, organizationId),
          row.sessionVenueId
            ? eq(courts.venueId, row.sessionVenueId)
            : undefined,
        ),
      )
      .limit(1);
    if (!court[0]) throw new Error("Choose a court at this event venue.");
  }
  await getDatabase().batch([
    getDatabase()
      .update(matches)
      .set({
        courtId: input.courtId ?? null,
        venueId: row.sessionVenueId,
        scheduledAt: input.scheduledAt ?? null,
        updatedAt: input.now,
      })
      .where(eq(matches.id, input.matchId)),
    getDatabase()
      .insert(auditLog)
      .values({
        organizationId,
        actorPersonId: input.actor.personId,
        actorType: "person",
        action: "match.schedule_updated",
        entityType: "match",
        entityId: input.matchId,
        beforeHash: stableHash({
          courtId: row.match.courtId,
          scheduledAt: row.match.scheduledAt,
        }),
        afterHash: stableHash({
          courtId: input.courtId,
          scheduledAt: input.scheduledAt,
        }),
        reason: input.reason,
        traceId: input.requestId,
        ipAddress: input.ipAddress,
        createdAt: input.now,
      }),
  ]);
  return { id: input.matchId, entity: "match", status: "scheduled" };
}
