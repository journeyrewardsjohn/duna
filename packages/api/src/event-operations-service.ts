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
  messages,
  organizationInvitations,
  organizationCreditApplications,
  organizationMemberships,
  organizationParticipants,
  organizations,
  orders,
  people,
  programs,
  ratings,
  ratingEvents,
  rallyEvents,
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
  generateKobPartnerRotation,
  generateRoundRobin,
  generateSingleElimination,
  foldScore,
  standardBeachFormat,
  type Bracket,
  type ScoreEvent,
  type SeededTeam,
  type KobCompetitionConfig,
} from "@duna/league-engine";
import { and, asc, desc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { stableHash } from "./canonical";
import {
  cancelCalendarSession,
  refundOrganizationOrder,
} from "./catalog-service";
import type { OperatorMutationResult } from "./contracts";
import type { ApiActor } from "./context";
import { eventCaptainPaymentComplete } from "./event-entry-payment";
import { canonicalPublicWebUrl } from "./public-web-url";
import { sendTransactionalEmail } from "./resend";
import { sendTemplateSms } from "./sent";

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
  readonly kobConfig?: KobCompetitionConfig;
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

export function registrationCanReceiveEventCancellationRefund(
  status: string,
): boolean {
  return [
    "pending",
    "confirmed",
    "waitlisted",
    "checked-in",
    "cancelled",
  ].includes(status);
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
  const refundCandidates = registrationRows.filter((row) =>
    registrationCanReceiveEventCancellationRefund(row.status),
  );
  const refundCandidateIds = new Set(refundCandidates.map((row) => row.id));
  const retryOrderIds =
    session.status === "cancelled" && operation?.refundStatus === "attention"
      ? (operation.refundSummary?.failedOrderIds ?? [])
      : [];
  const orderIds = [
    ...new Set([
      ...refundCandidates.flatMap((row) => (row.orderId ? [row.orderId] : [])),
      ...teamPaymentRows.flatMap((team) =>
        refundCandidateIds.has(team.registrationId)
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
  const previewOrderIds = new Set(previewOrders.map((order) => order.orderId));
  const teamRosterByRegistration = new Map(
    teamPaymentRows.map((team) => [team.registrationId, team.roster] as const),
  );
  const affectedRegistrationCount = registrationRows.filter(
    (registration) =>
      activeRegistration(registration.status) ||
      (registration.status === "cancelled" &&
        collectRegistrationOrderIds(
          registration.orderId,
          teamRosterByRegistration.get(registration.id) ?? [],
        ).some((orderId) => previewOrderIds.has(orderId))),
  ).length;
  return {
    sessionId: input.sessionId,
    sessionStatus: session.status,
    registrationCount:
      session.status === "cancelled" && operation?.refundSummary
        ? operation.refundSummary.registrationCount
        : affectedRegistrationCount,
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
      eligibilityDecision: registrations.eligibilityDecision,
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
    const captainPaid = eventCaptainPaymentComplete({
      eligibilityDecision: row.eligibilityDecision,
      orderStatus: row.orderStatus,
      registrationStatus: row.registrationStatus,
    });
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
    readonly status: string;
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
    readonly entryFeeMinor: number;
    readonly seeding: string;
    readonly tournamentFormat: string;
    readonly poolPlay?: DivisionSettings["poolPlay"];
    readonly kobConfig?: KobCompetitionConfig;
    readonly registrationClosesAt?: string;
  };
  readonly teams: readonly TeamOperationalSummary[];
  readonly bracket?: {
    readonly id: string;
    readonly version: number;
    readonly format: string;
    readonly structure: Record<string, unknown>;
    readonly liveAt?: string;
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
    readonly heat?: {
      readonly durationMinutes: number;
      readonly advanceCount: number;
      readonly participants: readonly {
        readonly teamId: string;
        readonly teamName: string;
        readonly points: number;
        readonly rank: number;
        readonly advances: boolean;
      }[];
    };
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
  const heatEventRows = matchRows.length
    ? await database
        .select({
          matchId: rallyEvents.matchId,
          eventType: rallyEvents.eventType,
          payload: rallyEvents.payload,
        })
        .from(rallyEvents)
        .where(
          inArray(
            rallyEvents.matchId,
            matchRows.map((match) => match.id),
          ),
        )
        .orderBy(asc(rallyEvents.sequence))
    : [];
  const heatScores = new Map<string, Map<string, number>>();
  for (const event of heatEventRows) {
    if (event.eventType !== "kob-heat-adjusted") continue;
    const payload = event.payload as Record<string, unknown>;
    if (
      typeof payload.teamId !== "string" ||
      typeof payload.delta !== "number"
    ) {
      continue;
    }
    const scores = heatScores.get(event.matchId) ?? new Map<string, number>();
    scores.set(
      payload.teamId,
      Math.max(0, (scores.get(payload.teamId) ?? 0) + payload.delta),
    );
    heatScores.set(event.matchId, scores);
  }
  const matchTeamIds = [
    ...new Set(
      matchRows.flatMap((match) => {
        const format = match.format as Record<string, unknown>;
        const heatTeamIds = Array.isArray(format.participantTeamIds)
          ? format.participantTeamIds.filter(
              (teamId): teamId is string => typeof teamId === "string",
            )
          : [];
        return [match.teamAId, match.teamBId, ...heatTeamIds].filter(
          (teamId): teamId is string => Boolean(teamId),
        );
      }),
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
      status: record.session.status,
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
      entryFeeMinor: record.division.entryFeeMinor,
      seeding: settings.seeding ?? "first-come",
      tournamentFormat: settings.tournamentFormat ?? "single-elimination",
      poolPlay: settings.poolPlay,
      kobConfig: settings.kobConfig,
      registrationClosesAt: closesAt?.toISOString(),
    },
    teams: record.teams,
    bracket: latestBracket
      ? {
          id: latestBracket.id,
          version: latestBracket.version,
          format: latestBracket.format,
          structure: latestBracket.structure,
          liveAt: latestBracket.liveAt?.toISOString(),
          createdAt: latestBracket.createdAt.toISOString(),
        }
      : undefined,
    matches: matchRows.map((match) => {
      const format = match.format as {
        label?: string;
        bracket?: string;
        round?: number;
        position?: number;
        kobHeat?: boolean;
        durationMinutes?: number;
        advanceCount?: number;
        participantTeamIds?: readonly string[];
      };
      const participants = (format.participantTeamIds ?? [])
        .map((teamId) => ({
          teamId,
          teamName: teamNameById.get(teamId) ?? "Team",
          points:
            ((
              (format as Record<string, unknown>).initialHeatScores as
                Record<string, number> | undefined
            )?.[teamId] ?? 0) + (heatScores.get(match.id)?.get(teamId) ?? 0),
        }))
        .sort(
          (left, right) =>
            right.points - left.points ||
            left.teamName.localeCompare(right.teamName),
        );
      const advanceCount = Math.max(1, format.advanceCount ?? 1);
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
        ...(format.kobHeat
          ? {
              heat: {
                durationMinutes: Math.max(1, format.durationMinutes ?? 15),
                advanceCount,
                participants: participants.map((participant, index) => ({
                  ...participant,
                  rank: index + 1,
                  advances: index < advanceCount,
                })),
              },
            }
          : {}),
      };
    }),
    courts: courtRows,
  };
}

type CompetitionBracketKind =
  "winners" | "losers" | "final" | "pool" | "consolation";

interface CompetitionStructureTeam {
  readonly id: string;
  readonly seed: number;
  readonly name: string;
}

interface CompetitionStructureMatch {
  readonly id: string;
  readonly bracket: CompetitionBracketKind;
  readonly round: number;
  readonly position: number;
  readonly label?: string;
}

function competitionStructure(value: Record<string, unknown>): {
  readonly teams: readonly CompetitionStructureTeam[];
  readonly matches: readonly CompetitionStructureMatch[];
  readonly pools: Readonly<Record<string, readonly string[]>>;
} {
  const teams = Array.isArray(value.teams)
    ? value.teams.flatMap((candidate) => {
        if (!candidate || typeof candidate !== "object") return [];
        const team = candidate as Record<string, unknown>;
        return typeof team.id === "string" &&
          typeof team.seed === "number" &&
          typeof team.name === "string"
          ? [
              {
                id: team.id,
                seed: team.seed,
                name: team.name,
              },
            ]
          : [];
      })
    : [];
  const matches = Array.isArray(value.matches)
    ? value.matches.flatMap((candidate) => {
        if (!candidate || typeof candidate !== "object") return [];
        const match = candidate as Record<string, unknown>;
        const bracket = match.bracket;
        return typeof match.id === "string" &&
          typeof match.round === "number" &&
          typeof match.position === "number" &&
          (bracket === "winners" ||
            bracket === "losers" ||
            bracket === "final" ||
            bracket === "pool" ||
            bracket === "consolation")
          ? [
              {
                id: match.id,
                bracket: bracket as CompetitionBracketKind,
                round: match.round,
                position: match.position,
                ...(typeof match.label === "string"
                  ? { label: match.label }
                  : {}),
              },
            ]
          : [];
      })
    : [];
  const rawPools =
    value.pools &&
    typeof value.pools === "object" &&
    !Array.isArray(value.pools)
      ? (value.pools as Record<string, unknown>)
      : {};
  const pools = Object.fromEntries(
    Object.entries(rawPools).flatMap(([key, teamIds]) =>
      Array.isArray(teamIds) &&
      teamIds.every((teamId) => typeof teamId === "string")
        ? [[key, teamIds] as const]
        : [],
    ),
  );
  return { teams, matches, pools };
}

function competitionRoundLabel(input: {
  readonly bracket: CompetitionBracketKind;
  readonly round: number;
  readonly label?: string;
}): string {
  if (input.label) return input.label;
  const prefix =
    input.bracket === "pool"
      ? "Pool play"
      : input.bracket === "winners"
        ? "Championship"
        : input.bracket === "losers"
          ? "Contenders"
          : input.bracket === "consolation"
            ? "Consolation"
            : "Finals";
  return `${prefix} · round ${input.round}`;
}

/**
 * The shared, read-only local tournament projection. Every competition
 * surface consumes this representation; no client derives a bracket, pool,
 * score, or player's next match from a separate event feed.
 */
export async function loadTournamentCompetitionSnapshot(input: {
  readonly sessionId: string;
  readonly personId?: string;
}) {
  requireDatabase();
  const database = getDatabase();
  const session = await database.query.sessions.findFirst({
    where: eq(sessions.id, input.sessionId),
  });
  if (!session) throw new Error("Tournament event was not found.");
  const divisionRows = await database
    .select()
    .from(divisions)
    .where(eq(divisions.sessionId, input.sessionId));
  if (divisionRows.length === 0) {
    return {
      session: {
        id: session.id,
        title: session.title,
        status: session.status,
        timezone: session.timezone,
        updatedAt: session.updatedAt.toISOString(),
      },
      divisions: [],
    };
  }
  const divisionIds = divisionRows.map((division) => division.id);
  const bracketRows = await database
    .select()
    .from(brackets)
    .where(inArray(brackets.divisionId, divisionIds))
    .orderBy(desc(brackets.version));
  const latestBracketByDivision = new Map<
    string,
    typeof brackets.$inferSelect
  >();
  for (const bracket of bracketRows) {
    if (!latestBracketByDivision.has(bracket.divisionId)) {
      latestBracketByDivision.set(bracket.divisionId, bracket);
    }
  }
  const activeBrackets = [...latestBracketByDivision.values()];
  const bracketIds = activeBrackets.map((bracket) => bracket.id);
  const matchRows = bracketIds.length
    ? await database
        .select({ match: matches, courtName: courts.name })
        .from(matches)
        .leftJoin(courts, eq(matches.courtId, courts.id))
        .where(inArray(matches.bracketId, bracketIds))
        .orderBy(asc(matches.scheduledAt), asc(matches.createdAt))
    : [];
  const matchIds = matchRows.map((row) => row.match.id);
  const rallyRows = matchIds.length
    ? await database
        .select({
          matchId: rallyEvents.matchId,
          eventType: rallyEvents.eventType,
          payload: rallyEvents.payload,
        })
        .from(rallyEvents)
        .where(inArray(rallyEvents.matchId, matchIds))
        .orderBy(asc(rallyEvents.sequence))
    : [];
  const rallyEventsByMatch = new Map<string, ScoreEvent[]>();
  const heatScoresByMatch = new Map<string, Map<string, number>>();
  for (const row of rallyRows) {
    if (row.eventType === "kob-heat-adjusted") {
      const heat = row.payload as Record<string, unknown>;
      if (typeof heat.teamId === "string" && typeof heat.delta === "number") {
        const scores = heatScoresByMatch.get(row.matchId) ?? new Map();
        scores.set(
          heat.teamId,
          Math.max(0, (scores.get(heat.teamId) ?? 0) + heat.delta),
        );
        heatScoresByMatch.set(row.matchId, scores);
      }
      continue;
    }
    const payload = row.payload as Partial<ScoreEvent>;
    if (
      payload &&
      typeof payload === "object" &&
      typeof payload.id === "string" &&
      typeof payload.type === "string" &&
      typeof payload.occurredAt === "string"
    ) {
      const values = rallyEventsByMatch.get(row.matchId) ?? [];
      values.push(payload as ScoreEvent);
      rallyEventsByMatch.set(row.matchId, values);
    }
  }
  const allTeamIds = [
    ...new Set(
      matchRows.flatMap(({ match }) => {
        const format = match.format as Record<string, unknown>;
        const heatTeamIds = Array.isArray(format.participantTeamIds)
          ? format.participantTeamIds.filter(
              (teamId): teamId is string => typeof teamId === "string",
            )
          : [];
        return [match.teamAId, match.teamBId, ...heatTeamIds].filter(
          (teamId): teamId is string => Boolean(teamId),
        );
      }),
    ),
  ];
  const competitionMemberRows = allTeamIds.length
    ? await database
        .select({ teamId: teamMembers.teamId, personId: teamMembers.personId })
        .from(teamMembers)
        .where(inArray(teamMembers.teamId, allTeamIds))
    : [];
  const membersByTeam = new Map<string, string[]>();
  for (const member of competitionMemberRows) {
    const values = membersByTeam.get(member.teamId) ?? [];
    values.push(member.personId);
    membersByTeam.set(member.teamId, values);
  }
  const myTeamIds = new Set(
    input.personId
      ? competitionMemberRows
          .filter((member) => member.personId === input.personId)
          .map((member) => member.teamId)
      : [],
  );
  const rowsByBracket = new Map<string, typeof matchRows>();
  for (const row of matchRows) {
    if (!row.match.bracketId) continue;
    const values = rowsByBracket.get(row.match.bracketId) ?? [];
    values.push(row);
    rowsByBracket.set(row.match.bracketId, values);
  }
  let myNextMatch:
    | {
        id: string;
        logicalId: string;
        bracket: CompetitionBracketKind;
        round: number;
        position: number;
        label: string;
        status: string;
        teamA?: { id: string; name: string; seed?: number };
        teamB?: { id: string; name: string; seed?: number };
        winnerTeamId?: string;
        courtName?: string;
        scheduledAt?: string;
        startedAt?: string;
        completedAt?: string;
        score?: {
          status: "not-started" | "live" | "complete" | "forfeit";
          sets: readonly [number, number][];
        };
      }
    | undefined;
  const result = activeBrackets.flatMap((bracket) => {
    const structure = competitionStructure(bracket.structure);
    const teamById = new Map(structure.teams.map((team) => [team.id, team]));
    const matchByLogicalId = new Map(
      (rowsByBracket.get(bracket.id) ?? []).map((row) => {
        const format = row.match.format as Record<string, unknown>;
        return [
          typeof format.logicalId === "string"
            ? format.logicalId
            : row.match.id,
          row,
        ] as const;
      }),
    );
    const competitionMatches = structure.matches.flatMap((definition) => {
      const row = matchByLogicalId.get(definition.id);
      if (!row) return [];
      const scoreEvents = rallyEventsByMatch.get(row.match.id) ?? [];
      const matchFormat = row.match.format as Record<string, unknown>;
      let score:
        | {
            status: "not-started" | "live" | "complete" | "forfeit";
            sets: readonly [number, number][];
          }
        | undefined;
      if (scoreEvents.length > 0) {
        try {
          const folded = foldScore(scoreEvents, {
            ...standardBeachFormat,
            ...matchFormat,
          });
          score = {
            status: folded.status,
            sets: folded.sets.map((set) => [set.a, set.b] as [number, number]),
          };
        } catch {
          score = undefined;
        }
      }
      const competitionMatch = {
        id: row.match.id,
        logicalId: definition.id,
        bracket: definition.bracket,
        round: definition.round,
        position: definition.position,
        label: competitionRoundLabel(definition),
        status: row.match.status,
        ...(row.match.teamAId && teamById.get(row.match.teamAId)
          ? { teamA: teamById.get(row.match.teamAId)! }
          : {}),
        ...(row.match.teamBId && teamById.get(row.match.teamBId)
          ? { teamB: teamById.get(row.match.teamBId)! }
          : {}),
        ...(row.match.winnerTeamId
          ? { winnerTeamId: row.match.winnerTeamId }
          : {}),
        ...(row.courtName ? { courtName: row.courtName } : {}),
        ...(row.match.scheduledAt
          ? { scheduledAt: row.match.scheduledAt.toISOString() }
          : {}),
        ...(row.match.startedAt
          ? { startedAt: row.match.startedAt.toISOString() }
          : {}),
        ...(row.match.completedAt
          ? { completedAt: row.match.completedAt.toISOString() }
          : {}),
        ...(score ? { score } : {}),
        ...(matchFormat.kobHeat === true
          ? (() => {
              const participantIds = Array.isArray(
                matchFormat.participantTeamIds,
              )
                ? matchFormat.participantTeamIds.filter(
                    (teamId): teamId is string => typeof teamId === "string",
                  )
                : [];
              const advanceCount =
                typeof matchFormat.advanceCount === "number"
                  ? Math.max(1, Math.trunc(matchFormat.advanceCount))
                  : 1;
              const initialHeatScores =
                matchFormat.initialHeatScores &&
                typeof matchFormat.initialHeatScores === "object"
                  ? (matchFormat.initialHeatScores as Record<string, number>)
                  : {};
              const participants = participantIds
                .flatMap((teamId) => {
                  const team = teamById.get(teamId);
                  return team
                    ? [
                        {
                          team,
                          points:
                            (initialHeatScores[teamId] ?? 0) +
                            (heatScoresByMatch.get(row.match.id)?.get(teamId) ??
                              0),
                        },
                      ]
                    : [];
                })
                .sort(
                  (left, right) =>
                    right.points - left.points ||
                    left.team.seed - right.team.seed,
                );
              return {
                heat: {
                  durationMinutes:
                    typeof matchFormat.durationMinutes === "number"
                      ? Math.max(1, Math.trunc(matchFormat.durationMinutes))
                      : 15,
                  advanceCount,
                  participants: participants.map((participant, index) => ({
                    ...participant,
                    rank: index + 1,
                    advances: index < advanceCount,
                  })),
                },
              };
            })()
          : {}),
      };
      const isMyMatch =
        (row.match.teamAId && myTeamIds.has(row.match.teamAId)) ||
        (row.match.teamBId && myTeamIds.has(row.match.teamBId)) ||
        (competitionMatch.heat?.participants.some((participant) =>
          myTeamIds.has(participant.team.id),
        ) ??
          false);
      if (
        isMyMatch &&
        !myNextMatch &&
        ["scheduled", "live"].includes(row.match.status)
      ) {
        myNextMatch = competitionMatch;
      }
      return [competitionMatch];
    });
    const pools = Object.entries(structure.pools).map(([key, teamIds]) => {
      const poolTeams = teamIds.flatMap((teamId) => {
        const team = teamById.get(teamId);
        return team ? [team] : [];
      });
      const poolMatches = competitionMatches.filter(
        (match) =>
          match.bracket === "pool" && match.logicalId.includes(`-pool-${key}-`),
      );
      const standings = new Map(
        poolTeams.map((team) => [
          team.id,
          {
            team,
            wins: 0,
            losses: 0,
            setDifferential: 0,
            pointDifferential: 0,
          },
        ]),
      );
      for (const match of poolMatches) {
        if (!match.teamA || !match.teamB || !match.score) continue;
        const left = standings.get(match.teamA.id);
        const right = standings.get(match.teamB.id);
        if (!left || !right) continue;
        const pointDifference = match.score.sets.reduce(
          (total, set) => total + set[0] - set[1],
          0,
        );
        const setDifference = match.score.sets.reduce(
          (total, set) => total + Math.sign(set[0] - set[1]),
          0,
        );
        left.pointDifferential += pointDifference;
        right.pointDifferential -= pointDifference;
        left.setDifferential += setDifference;
        right.setDifferential -= setDifference;
        if (match.winnerTeamId === left.team.id) {
          left.wins += 1;
          right.losses += 1;
        } else if (match.winnerTeamId === right.team.id) {
          right.wins += 1;
          left.losses += 1;
        }
      }
      return {
        key,
        teams: poolTeams,
        completedMatches: poolMatches.filter((match) =>
          Boolean(match.completedAt || match.winnerTeamId),
        ).length,
        matchCount: poolMatches.length,
        standings: [...standings.values()].sort(
          (left, right) =>
            right.wins - left.wins ||
            right.setDifferential - left.setDifferential ||
            right.pointDifferential - left.pointDifferential ||
            left.team.seed - right.team.seed,
        ),
      };
    });
    const rawStructure = bracket.structure as Record<string, unknown>;
    const kobConfig = rawStructure.kobConfig as
      KobCompetitionConfig | undefined;
    const kobEntrants = Array.isArray(rawStructure.kobEntrants)
      ? (rawStructure.kobEntrants as readonly {
          readonly id: string;
          readonly name: string;
        }[])
      : [];
    const currentKobStageIndex =
      typeof rawStructure.generatedStageCount === "number"
        ? Math.max(0, Math.trunc(rawStructure.generatedStageCount) - 1)
        : 0;
    const currentKobCarryPoints =
      rawStructure.kobCarryPoints &&
      typeof rawStructure.kobCarryPoints === "object"
        ? (rawStructure.kobCarryPoints as Record<string, number>)
        : {};
    const savedKobStageStandings = Array.isArray(rawStructure.kobStageStandings)
      ? (rawStructure.kobStageStandings as readonly Record<string, unknown>[])
      : [];
    const kobStandings =
      bracket.format === "kob-individual-rotation" && kobConfig
        ? kobConfig.stages.flatMap((stage, stageIndex) => {
            const saved = savedKobStageStandings.find(
              (candidate) => candidate.stageId === stage.id,
            );
            if (saved && Array.isArray(saved.players)) {
              return [
                {
                  stageIndex,
                  name: stage.name,
                  complete: true,
                  players: (saved.players as readonly Record<string, unknown>[])
                    .filter(
                      (player) =>
                        typeof player.id === "string" &&
                        typeof player.name === "string" &&
                        typeof player.points === "number" &&
                        typeof player.wins === "number" &&
                        typeof player.rank === "number",
                    )
                    .map((player) => ({
                      personId: player.id as string,
                      name: player.name as string,
                      points: player.points as number,
                      wins: player.wins as number,
                      rank: player.rank as number,
                      advances: player.advanced === true,
                    })),
                },
              ];
            }
            const stageMatches = competitionMatches.filter((match) => {
              const row = matchByLogicalId.get(match.logicalId);
              return (
                (row?.match.format as Record<string, unknown> | undefined)
                  ?.kobStageIndex === stageIndex
              );
            });
            if (!stageMatches.length) return [];
            const stagePlayerIds = new Set(
              stageMatches.flatMap((match) => [
                ...(match.teamA
                  ? (membersByTeam.get(match.teamA.id) ?? [])
                  : []),
                ...(match.teamB
                  ? (membersByTeam.get(match.teamB.id) ?? [])
                  : []),
              ]),
            );
            const points = new Map(
              kobEntrants.map((player) => [
                player.id,
                stageIndex === currentKobStageIndex
                  ? (currentKobCarryPoints[player.id] ?? 0)
                  : 0,
              ]),
            );
            const wins = new Map(kobEntrants.map((player) => [player.id, 0]));
            for (const match of stageMatches) {
              if (!match.teamA || !match.teamB || !match.score) continue;
              const leftPoints = match.score.sets.reduce(
                (total, set) => total + set[0],
                0,
              );
              const rightPoints = match.score.sets.reduce(
                (total, set) => total + set[1],
                0,
              );
              for (const personId of membersByTeam.get(match.teamA.id) ?? []) {
                points.set(personId, (points.get(personId) ?? 0) + leftPoints);
                if (match.winnerTeamId === match.teamA.id) {
                  wins.set(personId, (wins.get(personId) ?? 0) + 1);
                }
              }
              for (const personId of membersByTeam.get(match.teamB.id) ?? []) {
                points.set(personId, (points.get(personId) ?? 0) + rightPoints);
                if (match.winnerTeamId === match.teamB.id) {
                  wins.set(personId, (wins.get(personId) ?? 0) + 1);
                }
              }
            }
            const ranked = kobEntrants
              .filter((player) => stagePlayerIds.has(player.id))
              .sort(
                (left, right) =>
                  (points.get(right.id) ?? 0) - (points.get(left.id) ?? 0) ||
                  (wins.get(right.id) ?? 0) - (wins.get(left.id) ?? 0) ||
                  left.name.localeCompare(right.name),
              );
            const complete = stageMatches.every(
              (match) =>
                Boolean(match.completedAt || match.winnerTeamId) ||
                ["complete", "verified", "forfeit"].includes(match.status),
            );
            return [
              {
                stageIndex,
                name: stage.name,
                complete,
                players: ranked.map((player, index) => ({
                  personId: player.id,
                  name: player.name,
                  points: points.get(player.id) ?? 0,
                  wins: wins.get(player.id) ?? 0,
                  rank: index + 1,
                  advances: index < stage.advanceCount,
                })),
              },
            ];
          })
        : undefined;
    const rounds = [
      ...new Map(
        competitionMatches
          .sort(
            (left, right) =>
              left.bracket.localeCompare(right.bracket) ||
              left.round - right.round ||
              left.position - right.position,
          )
          .map((match) => {
            const key = `${match.bracket}-${match.round}`;
            return [
              key,
              {
                key,
                label: match.label,
                bracket: match.bracket,
                round: match.round,
                matches: competitionMatches
                  .filter(
                    (candidate) =>
                      candidate.bracket === match.bracket &&
                      candidate.round === match.round,
                  )
                  .sort((left, right) => left.position - right.position),
              },
            ] as const;
          }),
      ).values(),
    ];
    return [
      {
        id: bracket.divisionId,
        name:
          divisionRows.find((division) => division.id === bracket.divisionId)
            ?.name ?? "Division",
        competitionVersion: bracket.version,
        format: bracket.format,
        ...(bracket.liveAt ? { liveAt: bracket.liveAt.toISOString() } : {}),
        ...(kobStandings ? { kobStandings } : {}),
        pools,
        rounds,
        matches: competitionMatches,
      },
    ];
  });
  return {
    session: {
      id: session.id,
      title: session.title,
      status: session.status,
      timezone: session.timezone,
      updatedAt: session.updatedAt.toISOString(),
    },
    divisions: result,
    ...(myNextMatch ? { myNextMatch } : {}),
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
    case "kob-individual-rotation":
    case "kob-team-progressive":
      throw new Error(
        "KOB draws require the division's saved round blueprint.",
      );
  }
}

interface DerivedKobTeam extends SeededTeam {
  readonly personIds: readonly [string, string];
}

function kobMatchMetadata(
  stage: KobCompetitionConfig["stages"][number],
  stageIndex: number,
): Readonly<Record<string, unknown>> {
  const maximumSets = Math.max(1, stage.setsToWin * 2 - 1);
  return {
    kobStageIndex: stageIndex,
    kobStageId: stage.id,
    kobStageName: stage.name,
    carryPoints: stage.carryPoints,
    scoringMode: stage.scoringMode,
    setsToWin: stage.setsToWin,
    maximumSets,
    pointTargets: Array.from({ length: maximumSets }, () => stage.pointsToWin),
    winBy: stage.winBy === 1 ? 1 : 2,
    hardCaps: Array.from({ length: maximumSets }, () => stage.pointCap ?? null),
    scoringSystem: "rally",
    sideSwitchIntervals: Array.from({ length: maximumSets }, () => 7),
    timeoutsPerTeamPerSet: 1,
    lockedServeOrder: false,
  };
}

function buildIndividualKobStage(input: {
  readonly bracketId: string;
  readonly players: readonly {
    readonly id: string;
    readonly name: string;
    readonly seed: number;
    readonly rating?: number;
  }[];
  readonly config: KobCompetitionConfig;
  readonly stageIndex: number;
}): {
  readonly teams: readonly DerivedKobTeam[];
  readonly matches: readonly Bracket["matches"][number][];
  readonly pools: Readonly<Record<string, readonly string[]>>;
} {
  const stage = input.config.stages[input.stageIndex];
  if (!stage || stage.format !== "partner-rotation") {
    throw new Error("Individual KOB stages must use partner rotation.");
  }
  const pools = generateKobPartnerRotation({
    players: input.players,
    poolSize: stage.poolSize,
    guaranteedGames: stage.guaranteedGames,
    balanceByRating: input.config.balanceByRating,
    avoidRepeatOpponents: input.config.avoidRepeatOpponents,
  });
  const pairByKey = new Map<string, DerivedKobTeam>();
  const teamFor = (
    pair: readonly [
      (typeof input.players)[number],
      (typeof input.players)[number],
    ],
  ) => {
    const personIds = [pair[0].id, pair[1].id].sort() as [string, string];
    const key = personIds.join(":");
    const existing = pairByKey.get(key);
    if (existing) return existing;
    const team: DerivedKobTeam = {
      id: crypto.randomUUID(),
      seed: pairByKey.size + 1,
      name: `${pair[0].name} + ${pair[1].name}`,
      personIds,
    };
    pairByKey.set(key, team);
    return team;
  };
  let position = 0;
  const matches = pools.flatMap((pool) =>
    pool.matchups.map((matchup) => {
      const left = teamFor(matchup.teamA);
      const right = teamFor(matchup.teamB);
      position += 1;
      return {
        id: `${input.bracketId}-kob-s${input.stageIndex + 1}-${matchup.id}`,
        bracket: "pool" as const,
        round: input.stageIndex + 1,
        position,
        sideA: { kind: "seed" as const, seed: left.seed },
        sideB: { kind: "seed" as const, seed: right.seed },
        label: `${stage.name} · Pool ${pool.key} · rotation ${matchup.round}`,
        metadata: {
          ...kobMatchMetadata(stage, input.stageIndex),
          kobPoolKey: pool.key,
          kobPlayerIds: pool.players.map((player) => player.id),
        },
      };
    }),
  );
  return {
    teams: [...pairByKey.values()],
    matches,
    pools: Object.fromEntries(
      pools.map((pool) => [pool.key, pool.players.map((player) => player.id)]),
    ),
  };
}

function buildTeamKobBracket(input: {
  readonly bracketId: string;
  readonly teams: readonly SeededTeam[];
  readonly config: KobCompetitionConfig;
  readonly version: number;
}): Bracket {
  const matches = input.config.stages.map((stage, stageIndex) => ({
    id: `${input.bracketId}-kob-heat-${stageIndex + 1}`,
    bracket: (stageIndex === input.config.stages.length - 1
      ? "final"
      : "pool") as "final" | "pool",
    round: stageIndex + 1,
    position: 1,
    sideA: { kind: "bye" as const },
    sideB: { kind: "bye" as const },
    label: stage.name,
    metadata: {
      ...kobMatchMetadata(stage, stageIndex),
      kobHeat: true,
      durationMinutes: stage.durationMinutes ?? 15,
      advanceCount: stage.advanceCount,
      participantTeamIds:
        stageIndex === 0 ? input.teams.map((team) => team.id) : [],
    },
  }));
  return {
    id: input.bracketId,
    version: input.version,
    format: "kob-team-progressive",
    teams: input.teams,
    matches,
    rounds: matches.length,
  };
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
  const settings = record.division.settings as DivisionSettings;
  const configuredTeams = confirmed.map((team) => ({
    id: team.teamId!,
    seed: team.seed!,
    name: team.name,
  }));
  let derivedTeams: readonly DerivedKobTeam[] = [];
  let generated: Bracket;
  if (input.format === "kob-individual-rotation") {
    const config = settings.kobConfig;
    if (!config || config.entryMode !== "individual") {
      throw new Error("Save an individual KOB round blueprint first.");
    }
    const players = confirmed.map((team) => {
      const player = team.roster[0];
      if (!player?.personId) {
        throw new Error("Every individual KOB entry needs one claimed player.");
      }
      return {
        id: player.personId,
        name: player.displayName,
        seed: team.seed!,
        rating: player.qualificationRating ?? player.ratingDisplay,
      };
    });
    const stage = buildIndividualKobStage({
      bracketId,
      players,
      config,
      stageIndex: 0,
    });
    derivedTeams = stage.teams;
    generated = {
      id: bracketId,
      version,
      format: "kob-individual-rotation",
      teams: stage.teams,
      matches: stage.matches,
      rounds: config.stages.length,
      ...({
        pools: stage.pools,
        kobConfig: config,
        kobEntrants: players,
        generatedStageCount: 1,
      } as Record<string, unknown>),
    } as Bracket;
  } else if (input.format === "kob-team-progressive") {
    const config = settings.kobConfig;
    if (!config || config.entryMode !== "team") {
      throw new Error("Save a team KOB round blueprint first.");
    }
    generated = buildTeamKobBracket({
      bracketId,
      teams: configuredTeams,
      config,
      version,
    });
  } else {
    generated = generateBracket({
      id: bracketId,
      format: input.format,
      teams: configuredTeams,
      version,
      poolCount: input.poolCount,
    });
  }
  const teamIdBySeed = new Map(
    generated.teams.map((team) => [team.seed, team.id] as const),
  );
  const database = getTransactionalDatabase();
  await database.transaction(async (transaction) => {
    if (derivedTeams.length) {
      await transaction.insert(teams).values(
        derivedTeams.map((team) => ({
          id: team.id,
          divisionId: input.divisionId,
          name: team.name,
          seed: team.seed,
          status: "active",
        })),
      );
      await transaction.insert(teamMembers).values(
        derivedTeams.flatMap((team) =>
          team.personIds.map((personId) => ({
            teamId: team.id,
            personId,
            role: "player",
          })),
        ),
      );
    }
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
          ...(match.metadata ?? {}),
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

export async function advanceIndividualKobStage(
  input: MutationContext & {
    readonly divisionId: string;
    readonly reason: string;
  },
): Promise<OperatorMutationResult> {
  requireDatabase();
  const organizationId = requireOrganization(input.actor);
  const owned = await ownedDivision(organizationId, input.divisionId);
  const bracket = await getDatabase().query.brackets.findFirst({
    where: eq(brackets.divisionId, input.divisionId),
    orderBy: [desc(brackets.version)],
  });
  if (!bracket || bracket.format !== "kob-individual-rotation") {
    throw new Error("Generate the individual KOB rotation first.");
  }
  const structure = bracket.structure as Record<string, unknown>;
  const config = structure.kobConfig as KobCompetitionConfig | undefined;
  const entrants = Array.isArray(structure.kobEntrants)
    ? (structure.kobEntrants as readonly {
        readonly id: string;
        readonly name: string;
        readonly seed: number;
        readonly rating?: number;
      }[])
    : [];
  const generatedStageCount =
    typeof structure.generatedStageCount === "number"
      ? Math.max(1, Math.trunc(structure.generatedStageCount))
      : 1;
  if (!config || config.entryMode !== "individual" || entrants.length < 4) {
    throw new Error("The saved individual KOB blueprint is incomplete.");
  }
  if (generatedStageCount >= config.stages.length) {
    return { id: bracket.id, entity: "bracket", status: "all-rounds-built" };
  }
  const currentStageIndex = generatedStageCount - 1;
  const currentStage = config.stages[currentStageIndex]!;
  const matchRows = await getDatabase()
    .select()
    .from(matches)
    .where(eq(matches.bracketId, bracket.id))
    .orderBy(asc(matches.createdAt));
  const currentMatches = matchRows.filter(
    (match) =>
      (match.format as Record<string, unknown>).kobStageIndex ===
      currentStageIndex,
  );
  if (!currentMatches.length) {
    throw new Error("The current KOB round has no generated matches.");
  }
  if (
    currentMatches.some(
      (match) =>
        !match.winnerTeamId &&
        !["complete", "verified", "forfeit"].includes(match.status),
    )
  ) {
    throw new Error("Finish every match in this KOB round before advancing.");
  }
  const matchIds = currentMatches.map((match) => match.id);
  const scoreRows = await getDatabase()
    .select({ matchId: rallyEvents.matchId, payload: rallyEvents.payload })
    .from(rallyEvents)
    .where(inArray(rallyEvents.matchId, matchIds))
    .orderBy(asc(rallyEvents.sequence));
  const eventsByMatch = new Map<string, ScoreEvent[]>();
  for (const row of scoreRows) {
    const payload = row.payload as Partial<ScoreEvent>;
    if (
      typeof payload.id !== "string" ||
      typeof payload.type !== "string" ||
      typeof payload.occurredAt !== "string"
    ) {
      continue;
    }
    const events = eventsByMatch.get(row.matchId) ?? [];
    events.push(payload as ScoreEvent);
    eventsByMatch.set(row.matchId, events);
  }
  const stageTeamIds = [
    ...new Set(
      currentMatches.flatMap((match) =>
        [match.teamAId, match.teamBId].filter((teamId): teamId is string =>
          Boolean(teamId),
        ),
      ),
    ),
  ];
  const memberRows = await getDatabase()
    .select({ teamId: teamMembers.teamId, personId: teamMembers.personId })
    .from(teamMembers)
    .where(inArray(teamMembers.teamId, stageTeamIds));
  const membersByTeam = new Map<string, string[]>();
  for (const member of memberRows) {
    const values = membersByTeam.get(member.teamId) ?? [];
    values.push(member.personId);
    membersByTeam.set(member.teamId, values);
  }
  const carriedPoints =
    structure.kobCarryPoints && typeof structure.kobCarryPoints === "object"
      ? (structure.kobCarryPoints as Record<string, number>)
      : {};
  const pointsByPlayer = new Map(
    entrants.map((player) => [player.id, carriedPoints[player.id] ?? 0]),
  );
  const winsByPlayer = new Map(entrants.map((player) => [player.id, 0]));
  for (const match of currentMatches) {
    if (!match.teamAId || !match.teamBId) continue;
    const events = eventsByMatch.get(match.id) ?? [];
    const folded = foldScore(events, {
      ...standardBeachFormat,
      ...(match.format as Record<string, unknown>),
    });
    const leftPoints = folded.sets.reduce((total, set) => total + set.a, 0);
    const rightPoints = folded.sets.reduce((total, set) => total + set.b, 0);
    for (const personId of membersByTeam.get(match.teamAId) ?? []) {
      pointsByPlayer.set(
        personId,
        (pointsByPlayer.get(personId) ?? 0) + leftPoints,
      );
      if (match.winnerTeamId === match.teamAId) {
        winsByPlayer.set(personId, (winsByPlayer.get(personId) ?? 0) + 1);
      }
    }
    for (const personId of membersByTeam.get(match.teamBId) ?? []) {
      pointsByPlayer.set(
        personId,
        (pointsByPlayer.get(personId) ?? 0) + rightPoints,
      );
      if (match.winnerTeamId === match.teamBId) {
        winsByPlayer.set(personId, (winsByPlayer.get(personId) ?? 0) + 1);
      }
    }
  }
  const ranked = [...entrants].sort(
    (left, right) =>
      (pointsByPlayer.get(right.id) ?? 0) -
        (pointsByPlayer.get(left.id) ?? 0) ||
      (winsByPlayer.get(right.id) ?? 0) - (winsByPlayer.get(left.id) ?? 0) ||
      left.seed - right.seed,
  );
  const advancing = ranked.slice(
    0,
    Math.min(currentStage.advanceCount, ranked.length),
  );
  if (advancing.length < 4) {
    throw new Error(
      "Partner rotation needs at least four advancing players. Increase this round's advance count.",
    );
  }
  const nextStageIndex = generatedStageCount;
  const next = buildIndividualKobStage({
    bracketId: bracket.id,
    players: advancing.map((player, index) => ({ ...player, seed: index + 1 })),
    config,
    stageIndex: nextStageIndex,
  });
  const teamIdBySeed = new Map(next.teams.map((team) => [team.seed, team.id]));
  const database = getTransactionalDatabase();
  await database.transaction(async (transaction) => {
    await transaction.insert(teams).values(
      next.teams.map((team) => ({
        id: team.id,
        divisionId: input.divisionId,
        name: team.name,
        seed: team.seed,
        status: "active",
      })),
    );
    await transaction.insert(teamMembers).values(
      next.teams.flatMap((team) =>
        team.personIds.map((personId) => ({
          teamId: team.id,
          personId,
          role: "player",
        })),
      ),
    );
    await transaction.insert(matches).values(
      next.matches.map((match) => ({
        id: crypto.randomUUID(),
        divisionId: input.divisionId,
        bracketId: bracket.id,
        teamAId:
          match.sideA.kind === "seed"
            ? teamIdBySeed.get(match.sideA.seed)
            : undefined,
        teamBId:
          match.sideB.kind === "seed"
            ? teamIdBySeed.get(match.sideB.seed)
            : undefined,
        venueId: owned.session.venueId,
        createdByPersonId: input.actor.personId,
        status: "scheduled" as const,
        format: {
          logicalId: match.id,
          bracket: match.bracket,
          round: match.round,
          position: match.position,
          sideA: match.sideA,
          sideB: match.sideB,
          label: match.label,
          ...(match.metadata ?? {}),
        },
      })),
    );
    const advanced = await transaction
      .update(brackets)
      .set({
        structure: {
          ...structure,
          teams: [
            ...(Array.isArray(structure.teams) ? structure.teams : []),
            ...next.teams,
          ],
          matches: [
            ...(Array.isArray(structure.matches) ? structure.matches : []),
            ...next.matches,
          ],
          generatedStageCount: generatedStageCount + 1,
          kobCarryPoints: currentStage.carryPoints
            ? Object.fromEntries(
                advancing.map((player) => [
                  player.id,
                  pointsByPlayer.get(player.id) ?? 0,
                ]),
              )
            : {},
          kobStageStandings: [
            ...(Array.isArray(structure.kobStageStandings)
              ? structure.kobStageStandings
              : []),
            {
              stageId: currentStage.id,
              completedAt: input.now.toISOString(),
              players: ranked.map((player, index) => ({
                id: player.id,
                name: player.name,
                rank: index + 1,
                points: pointsByPlayer.get(player.id) ?? 0,
                wins: winsByPlayer.get(player.id) ?? 0,
                advanced: advancing.some(
                  (candidate) => candidate.id === player.id,
                ),
              })),
            },
          ],
        },
      })
      .where(
        and(
          eq(brackets.id, bracket.id),
          sql`coalesce((${brackets.structure}->>'generatedStageCount')::int, 1) = ${generatedStageCount}`,
        ),
      )
      .returning({ id: brackets.id });
    if (!advanced.length) {
      throw new Error(
        "This KOB round was already advanced. Refresh Tournament Control.",
      );
    }
    await transaction.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "kob.stage_advanced",
      entityType: "bracket",
      entityId: bracket.id,
      afterHash: stableHash({
        currentStageIndex,
        nextStageIndex,
        advancing: advancing.map((player) => player.id),
      }),
      reason: input.reason,
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    });
  });
  return {
    id: bracket.id,
    entity: "bracket",
    status: `round-${nextStageIndex + 1}-ready`,
  };
}

/**
 * Puts an already generated competition structure into the live operating
 * state. Generating a bracket deliberately stays separate from this action:
 * directors can inspect the field, pools and assignments before changing the
 * public event state.
 */
export async function launchDivisionTournament(
  input: MutationContext & {
    readonly divisionId: string;
    readonly reason: string;
  },
): Promise<OperatorMutationResult> {
  requireDatabase();
  const organizationId = requireOrganization(input.actor);
  const record = await loadDivisionRecord(organizationId, input.divisionId);
  const current = await getDatabase().query.brackets.findFirst({
    where: eq(brackets.divisionId, input.divisionId),
    orderBy: [desc(brackets.version)],
  });
  if (!current) {
    throw new Error(
      "Build the pools or bracket before launching the tournament.",
    );
  }
  if (
    record.session.status === "cancelled" ||
    record.session.status === "completed"
  ) {
    throw new Error("A cancelled or completed event cannot be launched.");
  }
  if (record.session.status === "live" && current.liveAt) {
    return { id: current.id, entity: "bracket", status: "live" };
  }
  const database = getTransactionalDatabase();
  await database.transaction(async (transaction) => {
    await transaction
      .update(sessions)
      .set({ status: "live", updatedAt: input.now })
      .where(eq(sessions.id, record.session.id));
    await transaction
      .update(brackets)
      .set({ liveAt: current.liveAt ?? input.now })
      .where(eq(brackets.id, current.id));
    await transaction.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "tournament.launched",
      entityType: "bracket",
      entityId: current.id,
      beforeHash: stableHash({
        sessionStatus: record.session.status,
        bracketLiveAt: current.liveAt,
      }),
      afterHash: stableHash({
        sessionStatus: "live",
        bracketLiveAt: input.now,
      }),
      reason: input.reason,
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    });
  });
  return { id: current.id, entity: "bracket", status: "live" };
}

/**
 * Organizer-added players use the same registrations, teams, and payment
 * reconciliation as self-service entries. Guest identities remain provisional
 * until the private invitation is claimed, while the field hold and every
 * complimentary or payment-due decision stay visible and auditable.
 */
export interface EventPlayerSearchResult {
  readonly id: string;
  readonly displayName: string;
  readonly handle: string;
  readonly avatarUrl?: string;
  readonly rating?: number;
  readonly connection: "organization" | "duna";
}

export interface EventPlayerEntryResult extends OperatorMutationResult {
  readonly personId: string;
  readonly displayName: string;
  readonly paymentTreatment: "complimentary" | "to-be-paid";
  readonly identityStatus: "connected" | "guest-invited";
  readonly invitationUrl?: string;
  readonly deliveryStatus?: "not-configured" | "sent" | "failed";
}

export function eventPlayerInvitationMessage(input: {
  readonly organizationName: string;
  readonly eventTitle: string;
  readonly divisionName: string;
  readonly paymentTreatment: "complimentary" | "to-be-paid";
  readonly invitationUrl: string;
}): string {
  const paymentCopy =
    input.paymentTreatment === "complimentary"
      ? "Your entry is complimentary."
      : "Your place is reserved and payment is due after you claim it.";
  return `${input.organizationName} registered you for ${input.eventTitle}, ${input.divisionName}. ${paymentCopy} Claim your spot and connect it to your Duna profile: ${input.invitationUrl}`;
}

function provisionalEventHandle(input: {
  readonly givenName: string;
  readonly familyName: string;
  readonly id: string;
}): string {
  const base = `${input.givenName}-${input.familyName}`
    .normalize("NFKD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/(^-|-$)/g, "")
    .slice(0, 30);
  return `${base || "player"}-guest-${input.id.replaceAll("-", "").slice(-8)}`.slice(
    0,
    48,
  );
}

export async function searchEventPlayers(input: {
  readonly actor: ApiActor;
  readonly sessionId: string;
  readonly query: string;
}): Promise<readonly EventPlayerSearchResult[]> {
  requireDatabase();
  const organizationId = requireOrganization(input.actor);
  await ownedSession(organizationId, input.sessionId);
  const query = input.query.trim().toLowerCase().replaceAll("%", "");
  if (query.length < 2) return [];
  const pattern = `%${query}%`;
  const rows = await getDatabase()
    .select({
      id: people.id,
      displayName: people.displayName,
      handle: people.handle,
      avatarUrl: people.avatarUrl,
      rating: ratings.display,
      participantId: organizationParticipants.id,
      membershipId: organizationMemberships.id,
    })
    .from(people)
    .leftJoin(
      ratings,
      and(eq(ratings.personId, people.id), eq(ratings.discipline, "beach-2s")),
    )
    .leftJoin(
      organizationParticipants,
      and(
        eq(organizationParticipants.personId, people.id),
        eq(organizationParticipants.organizationId, organizationId),
        eq(organizationParticipants.status, "active"),
      ),
    )
    .leftJoin(
      organizationMemberships,
      and(
        eq(organizationMemberships.personId, people.id),
        eq(organizationMemberships.organizationId, organizationId),
        eq(organizationMemberships.active, true),
      ),
    )
    .where(
      and(
        eq(people.status, "active"),
        sql`(lower(${people.displayName}) LIKE ${pattern} OR lower(${people.handle}) LIKE ${pattern})`,
        or(
          sql`${organizationParticipants.id} IS NOT NULL`,
          sql`${organizationMemberships.id} IS NOT NULL`,
          and(
            eq(people.profileClaimStatus, "claimed"),
            eq(people.profileVisibility, "public"),
            eq(people.isMinor, false),
          ),
        ),
        sql`NOT EXISTS (
          SELECT 1 FROM ${registrations}
          WHERE ${registrations.sessionId} = ${input.sessionId}::uuid
            AND ${registrations.personId} = ${people.id}
            AND ${registrations.status} IN ('pending', 'confirmed', 'waitlisted', 'checked-in')
        )`,
      ),
    )
    .orderBy(
      desc(sql`${organizationParticipants.id} IS NOT NULL`),
      desc(ratings.display),
      asc(people.displayName),
    )
    .limit(20);
  return rows.map((row) => ({
    id: row.id,
    displayName: row.displayName,
    handle: row.handle,
    avatarUrl: row.avatarUrl ?? undefined,
    rating: row.rating ?? undefined,
    connection: row.participantId || row.membershipId ? "organization" : "duna",
  }));
}

export async function addEventPlayerEntry(
  input: MutationContext & {
    readonly sessionId: string;
    readonly divisionId: string;
    readonly identity:
      | { readonly kind: "duna"; readonly personId: string }
      | {
          readonly kind: "guest";
          readonly givenName: string;
          readonly familyName: string;
          readonly email?: string;
          readonly phoneE164?: string;
        };
    readonly paymentTreatment: "complimentary" | "to-be-paid";
    readonly reason: string;
  },
): Promise<EventPlayerEntryResult> {
  requireDatabase();
  const organizationId = requireOrganization(input.actor);
  const record = await loadDivisionRecord(organizationId, input.divisionId);
  if (record.session.id !== input.sessionId) {
    throw new Error("That division does not belong to this event.");
  }
  if (["cancelled", "completed"].includes(record.session.status)) {
    throw new Error(
      "Players cannot be added to a cancelled or completed event.",
    );
  }
  const fieldLimit =
    record.division.maximumTeams ??
    Math.floor(record.division.capacity / record.division.teamSize);
  if (
    record.teams.filter((team) => team.selectionStatus === "confirmed")
      .length >= fieldLimit
  ) {
    throw new Error(
      "This division is full. Expand the field before adding another entry.",
    );
  }
  const database = getTransactionalDatabase();
  const normalizedEmail =
    input.identity.kind === "guest"
      ? input.identity.email?.trim().toLowerCase() || undefined
      : undefined;
  const normalizedPhone =
    input.identity.kind === "guest"
      ? input.identity.phoneE164?.trim() || undefined
      : undefined;
  if (input.identity.kind === "guest") {
    const duplicate = normalizedEmail
      ? await database
          .select({
            displayName: people.displayName,
            profileClaimStatus: people.profileClaimStatus,
          })
          .from(people)
          .where(sql`lower(${people.email}) = ${normalizedEmail}`)
          .limit(1)
          .then((rows) => rows[0])
      : normalizedPhone
        ? await database
            .select({
              displayName: people.displayName,
              profileClaimStatus: people.profileClaimStatus,
            })
            .from(people)
            .where(eq(people.phoneE164, normalizedPhone))
            .limit(1)
            .then((rows) => rows[0])
        : undefined;
    if (duplicate?.profileClaimStatus === "claimed") {
      throw new Error(
        `${duplicate.displayName} already has a Duna profile. Add that profile from Duna search instead.`,
      );
    }
  }

  const guestPersonId =
    input.identity.kind === "guest" ? crypto.randomUUID() : undefined;
  const personId =
    input.identity.kind === "duna" ? input.identity.personId : guestPersonId!;
  const person =
    input.identity.kind === "duna"
      ? await database
          .select({
            id: people.id,
            displayName: people.displayName,
            status: people.status,
            isMinor: people.isMinor,
            profileClaimStatus: people.profileClaimStatus,
            profileVisibility: people.profileVisibility,
            participantId: organizationParticipants.id,
            membershipId: organizationMemberships.id,
          })
          .from(people)
          .leftJoin(
            organizationParticipants,
            and(
              eq(organizationParticipants.personId, people.id),
              eq(organizationParticipants.organizationId, organizationId),
              eq(organizationParticipants.status, "active"),
            ),
          )
          .leftJoin(
            organizationMemberships,
            and(
              eq(organizationMemberships.personId, people.id),
              eq(organizationMemberships.organizationId, organizationId),
              eq(organizationMemberships.active, true),
            ),
          )
          .where(eq(people.id, personId))
          .limit(1)
          .then((rows) => rows[0])
      : {
          id: personId,
          displayName: `${input.identity.givenName.trim()} ${input.identity.familyName.trim()}`,
          status: "active",
          isMinor: false,
          profileClaimStatus: "unclaimed",
          profileVisibility: "private",
          participantId: null,
          membershipId: null,
        };
  if (!person || person.status !== "active") {
    throw new Error("That Duna player is not available to add.");
  }
  if (
    input.identity.kind === "duna" &&
    !person.participantId &&
    !person.membershipId &&
    (person.profileClaimStatus !== "claimed" ||
      person.profileVisibility !== "public" ||
      person.isMinor)
  ) {
    throw new Error(
      "That Duna profile is private or not eligible for organizer entry.",
    );
  }
  const existingRegistration = await database
    .select({ id: registrations.id })
    .from(registrations)
    .where(
      and(
        eq(registrations.sessionId, input.sessionId),
        eq(registrations.personId, personId),
        inArray(registrations.status, [
          "pending",
          "confirmed",
          "waitlisted",
          "checked-in",
        ]),
      ),
    )
    .limit(1)
    .then((rows) => rows[0]);
  if (existingRegistration) {
    throw new Error(
      `${person.displayName} is already registered for this event.`,
    );
  }

  const registrationId = crypto.randomUUID();
  const teamId = crypto.randomUUID();
  const teamEntryId = crypto.randomUUID();
  const claimToken = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll(
    "-",
    "",
  );
  const invitationId = guestPersonId ? crypto.randomUUID() : undefined;
  const invitationToken = guestPersonId
    ? `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll("-", "")
    : undefined;
  const claimExpiresAt = new Date(
    Math.max(
      input.now.getTime() + 30 * 24 * 60 * 60_000,
      record.session.startsAt.getTime() + 24 * 60 * 60_000,
    ),
  );
  const ready =
    input.identity.kind === "duna" &&
    record.division.teamSize === 1 &&
    input.paymentTreatment === "complimentary";
  const usedSeeds = new Set(
    record.teams.flatMap((team) => (team.seed ? [team.seed] : [])),
  );
  const seed = nextAvailableSeed(usedSeeds);
  const eligibilityDecision = {
    source: "operator-player-entry",
    status: "approved",
    paymentTreatment: input.paymentTreatment,
    identityKind: input.identity.kind,
    recordedAt: input.now.toISOString(),
  };

  await database.transaction(async (transaction) => {
    if (input.identity.kind === "guest") {
      await transaction.insert(people).values({
        id: personId,
        givenName: input.identity.givenName.trim(),
        familyName: input.identity.familyName.trim(),
        displayName: person.displayName,
        handle: provisionalEventHandle({
          givenName: input.identity.givenName,
          familyName: input.identity.familyName,
          id: personId,
        }),
        profileClaimStatus: "unclaimed",
        profileVisibility: "private",
        status: "active",
        ageBand: "adult",
        createdAt: input.now,
        updatedAt: input.now,
      });
    }
    await transaction.insert(teams).values({
      id: teamId,
      divisionId: input.divisionId,
      name: person.displayName,
      seed,
      status: "active",
      createdAt: input.now,
      updatedAt: input.now,
    });
    await transaction.insert(teamMembers).values({
      teamId,
      personId,
      role: "player",
      joinedAt: input.now,
    });
    await transaction.insert(registrations).values({
      id: registrationId,
      sessionId: input.sessionId,
      divisionId: input.divisionId,
      personId,
      status: "confirmed",
      eligibilityDecision,
      overriddenByPersonId: input.actor.personId,
      overrideReason: input.reason,
      createdAt: input.now,
      updatedAt: input.now,
    });
    await transaction.insert(teamEntries).values({
      id: teamEntryId,
      registrationId,
      teamId,
      payingPersonId: personId,
      expectedTeamSize: record.division.teamSize,
      paymentMode: "self",
      roster: [],
      status: ready ? "ready" : "assembling",
      claimToken,
      claimExpiresAt,
      claimedAt: ready ? input.now : undefined,
      rosterLockedAt: ready ? input.now : undefined,
      seed,
      selectionStatus: "confirmed",
      selectionLocked: true,
      selectionReason: input.reason,
      selectedAt: input.now,
      updatedAt: input.now,
    });
    if (guestPersonId && invitationId && invitationToken) {
      await transaction.insert(organizationInvitations).values({
        id: invitationId,
        organizationId,
        invitedByPersonId: input.actor.personId,
        inviteToken: invitationToken,
        relationship: "player",
        invitedName: person.displayName,
        invitedEmail: normalizedEmail,
        invitedPhoneE164: normalizedPhone,
        isMinor: false,
        deliveryChannel: normalizedPhone
          ? "sms"
          : normalizedEmail
            ? "email"
            : undefined,
        eventSessionId: input.sessionId,
        eventDivisionId: input.divisionId,
        provisionalPersonId: personId,
        eventRegistrationId: registrationId,
        teamEntryId,
        eventPaymentTreatment: input.paymentTreatment,
        expiresAt: claimExpiresAt,
        createdAt: input.now,
        updatedAt: input.now,
      });
    } else {
      const playerUrl = canonicalPublicWebUrl(`/app/team/claim/${claimToken}`);
      await transaction.insert(messages).values(
        (["in-app", "push"] as const).map((channel) => ({
          id: crypto.randomUUID(),
          organizationId,
          senderPersonId: input.actor.personId,
          recipientPersonId: personId,
          guardianCopyPersonIds: [],
          channel,
          kind: "event-registration",
          subject: `You were added to ${record.session.title}`,
          body:
            input.paymentTreatment === "complimentary" && ready
              ? `${input.actor.displayName} added you to ${record.division.name}. Your entry is complimentary.`
              : input.paymentTreatment === "complimentary"
                ? `${input.actor.displayName} added you to ${record.division.name}. Your entry is complimentary. Complete your team roster: ${playerUrl}`
                : `${input.actor.displayName} reserved your place in ${record.division.name}. Claim your entry and complete payment: ${playerUrl}`,
          status: "queued",
          scheduledAt: input.now,
        })),
      );
    }
    await transaction.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action:
        input.paymentTreatment === "complimentary"
          ? "tournament.player.complimentary_added"
          : "tournament.player.payment_due_added",
      entityType: "team-entry",
      entityId: teamEntryId,
      afterHash: stableHash({
        registrationId,
        personId,
        identityKind: input.identity.kind,
        paymentTreatment: input.paymentTreatment,
        invitationId,
      }),
      reason: input.reason,
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    });
  });

  let invitationUrl: string | undefined;
  let deliveryStatus: "not-configured" | "sent" | "failed" | undefined;
  if (invitationId && invitationToken) {
    invitationUrl = canonicalPublicWebUrl(
      `/join/organization/${encodeURIComponent(invitationToken)}`,
    );
    const organization = await getDatabase().query.organizations.findFirst({
      where: eq(organizations.id, organizationId),
    });
    const message = eventPlayerInvitationMessage({
      organizationName: organization?.name ?? "Your organizer",
      eventTitle: record.session.title,
      divisionName: record.division.name,
      paymentTreatment: input.paymentTreatment,
      invitationUrl,
    });
    const deliveryAttempts: {
      readonly channel: "email" | "sms";
      readonly configured: boolean;
      readonly sent: boolean;
      readonly messageId?: string;
    }[] = [];
    if (normalizedPhone) {
      const smsDelivery = await sendTemplateSms({
        to: normalizedPhone,
        templateName:
          process.env.SENT_DM_EVENT_PLAYER_INVITE_TEMPLATE_NAME ??
          "duna_event_player_invitation",
        parameters: {
          player_name: person.displayName,
          organization_name: organization?.name ?? "Your organizer",
          event_title: record.session.title,
          division_name: record.division.name,
          invite_url: invitationUrl,
          message,
        },
        idempotencyKey: `event-player-invite:${invitationId}`,
      }).catch(() => ({ configured: true, sent: false }));
      deliveryAttempts.push({ channel: "sms", ...smsDelivery });
    }
    if (!deliveryAttempts.some((attempt) => attempt.sent) && normalizedEmail) {
      const emailDelivery = await sendTransactionalEmail({
        to: normalizedEmail,
        subject: `You are registered for ${record.session.title}`,
        text: `Hi ${input.identity.kind === "guest" ? input.identity.givenName.trim() : person.displayName},\n\n${message}`,
        idempotencyKey: `event-player-invite-email:${invitationId}`,
      }).catch(() => ({ configured: true, sent: false }));
      deliveryAttempts.push({ channel: "email", ...emailDelivery });
    }
    const successfulDelivery = deliveryAttempts.find((attempt) => attempt.sent);
    deliveryStatus = successfulDelivery
      ? "sent"
      : deliveryAttempts.some((attempt) => attempt.configured)
        ? "failed"
        : "not-configured";
    await getDatabase()
      .update(organizationInvitations)
      .set({
        deliveryStatus,
        deliveryChannel:
          successfulDelivery?.channel ??
          deliveryAttempts[0]?.channel ??
          undefined,
        deliveryMessageId: successfulDelivery?.messageId,
        updatedAt: input.now,
      })
      .where(eq(organizationInvitations.id, invitationId));
  } else if (!ready) {
    invitationUrl = canonicalPublicWebUrl(`/app/team/claim/${claimToken}`);
  }
  return {
    id: teamEntryId,
    entity: "team-entry",
    status: ready ? "confirmed" : "attention",
    personId,
    displayName: person.displayName,
    paymentTreatment: input.paymentTreatment,
    identityStatus:
      input.identity.kind === "guest" ? "guest-invited" : "connected",
    invitationUrl,
    deliveryStatus,
  };
}

export async function addManualDivisionEntry(
  input: MutationContext & {
    readonly divisionId: string;
    readonly playerIds: readonly string[];
    readonly payment: "complimentary" | "cash";
    readonly cashAmountMinor?: number;
    readonly cashReference?: string;
    readonly reason: string;
  },
): Promise<OperatorMutationResult> {
  requireDatabase();
  const organizationId = requireOrganization(input.actor);
  const record = await loadDivisionRecord(organizationId, input.divisionId);
  if (
    record.session.status === "cancelled" ||
    record.session.status === "completed"
  ) {
    throw new Error(
      "Entries cannot be added to a cancelled or completed event.",
    );
  }
  const playerIds = [...new Set(input.playerIds)];
  if (playerIds.length !== record.division.teamSize) {
    throw new Error(
      `Choose exactly ${record.division.teamSize} players for this division.`,
    );
  }
  if (
    input.payment === "cash" &&
    (!input.cashAmountMinor || input.cashAmountMinor <= 0)
  ) {
    throw new Error("Record the verified cash amount before adding this team.");
  }
  const fieldLimit =
    record.division.maximumTeams ??
    Math.floor(record.division.capacity / record.division.teamSize);
  const confirmedCount = record.teams.filter(
    (team) => team.selectionStatus === "confirmed",
  ).length;
  if (confirmedCount >= fieldLimit) {
    throw new Error(
      "This field is full. Expand the field before adding another team.",
    );
  }
  const database = getTransactionalDatabase();
  const playerRows = await database
    .select({ id: people.id, displayName: people.displayName })
    .from(people)
    .where(inArray(people.id, playerIds));
  if (playerRows.length !== playerIds.length) {
    throw new Error("One or more selected players could not be found.");
  }
  const captain = playerRows.find((player) => player.id === playerIds[0]);
  if (!captain) throw new Error("Choose a captain for this entry.");
  const existingRegistration = await database
    .select({ id: registrations.id })
    .from(registrations)
    .where(
      and(
        eq(registrations.sessionId, record.session.id),
        eq(registrations.personId, captain.id),
      ),
    )
    .limit(1)
    .then((rows) => rows[0]);
  if (existingRegistration) {
    throw new Error("That captain is already registered for this event.");
  }
  const alreadyAssigned = await database
    .select({ personId: teamMembers.personId })
    .from(teamMembers)
    .innerJoin(teams, eq(teamMembers.teamId, teams.id))
    .innerJoin(teamEntries, eq(teamEntries.teamId, teams.id))
    .innerJoin(registrations, eq(teamEntries.registrationId, registrations.id))
    .where(
      and(
        eq(teams.divisionId, input.divisionId),
        inArray(teamMembers.personId, playerIds),
        inArray(registrations.status, [
          "pending",
          "confirmed",
          "waitlisted",
          "checked-in",
        ]),
      ),
    )
    .limit(1)
    .then((rows) => rows[0]);
  if (alreadyAssigned) {
    throw new Error(
      "One of those players is already assigned to this division.",
    );
  }

  const paymentAmount = input.payment === "cash" ? input.cashAmountMinor! : 0;
  const orderId = input.payment === "cash" ? crypto.randomUUID() : undefined;
  const registrationId = crypto.randomUUID();
  const teamId = crypto.randomUUID();
  const teamEntryId = crypto.randomUUID();
  const roster = playerIds.slice(1).map((personId) => {
    const player = playerRows.find((candidate) => candidate.id === personId)!;
    return {
      personId,
      displayName: player.displayName,
      status: "claimed" as const,
      paidAt: input.now.toISOString(),
      ...(orderId ? { orderId } : {}),
    };
  });
  const usedSeeds = new Set(
    record.teams.flatMap((team) => (team.seed ? [team.seed] : [])),
  );
  const seed = nextAvailableSeed(usedSeeds);
  const teamName = playerIds
    .map(
      (personId) =>
        playerRows.find((player) => player.id === personId)!.displayName,
    )
    .join(" / ");
  const nowPlusThirtyDays = new Date(
    input.now.getTime() + 30 * 24 * 60 * 60_000,
  );

  await database.transaction(async (transaction) => {
    if (orderId) {
      await transaction.insert(orders).values({
        id: orderId,
        organizationId,
        buyerPersonId: captain.id,
        status: "paid",
        currency: record.division.currency,
        subtotalMinor: paymentAmount,
        totalMinor: paymentAmount,
        idempotencyKey: `cash-entry:${input.requestId}`,
        updatedAt: input.now,
      });
    }
    await transaction.insert(teams).values({
      id: teamId,
      divisionId: input.divisionId,
      name: teamName,
      seed,
      status: "active",
      updatedAt: input.now,
    });
    await transaction
      .insert(teamMembers)
      .values(
        playerIds.map((personId) => ({ teamId, personId, role: "player" })),
      );
    await transaction.insert(registrations).values({
      id: registrationId,
      sessionId: record.session.id,
      divisionId: input.divisionId,
      personId: captain.id,
      status: "confirmed",
      eligibilityDecision: {
        source: "operator-manual-entry",
        payment: input.payment,
        verifiedAt: input.now.toISOString(),
      },
      orderId,
      overriddenByPersonId: input.actor.personId,
      overrideReason: input.reason,
      updatedAt: input.now,
    });
    await transaction.insert(teamEntries).values({
      id: teamEntryId,
      registrationId,
      teamId,
      payingPersonId: captain.id,
      expectedTeamSize: record.division.teamSize,
      paymentMode: "team",
      roster,
      status: "confirmed",
      claimToken: crypto.randomUUID(),
      claimExpiresAt: nowPlusThirtyDays,
      rosterLockedAt: input.now,
      seed,
      selectionStatus: "confirmed",
      selectionLocked: true,
      selectionReason: input.reason,
      selectedAt: input.now,
      updatedAt: input.now,
    });
    await transaction.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action:
        input.payment === "cash"
          ? "tournament.entry.cash_verified"
          : "tournament.entry.complimentary_added",
      entityType: "team-entry",
      entityId: teamEntryId,
      afterHash: stableHash({
        teamId,
        registrationId,
        playerIds,
        seed,
        payment: input.payment,
        paymentAmount,
        cashReference: input.cashReference,
      }),
      reason: input.reason,
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    });
  });
  return { id: teamEntryId, entity: "team-entry", status: "confirmed" };
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

async function loadOwnedKobHeat(organizationId: string, matchId: string) {
  const row = await getDatabase()
    .select({
      match: matches,
      bracket: brackets,
      organizationId: sql<
        string | null
      >`coalesce(${programs.organizationId}, ${eventTypes.organizationId}, ${venues.organizationId})`,
    })
    .from(matches)
    .innerJoin(divisions, eq(matches.divisionId, divisions.id))
    .innerJoin(sessions, eq(divisions.sessionId, sessions.id))
    .innerJoin(brackets, eq(matches.bracketId, brackets.id))
    .leftJoin(programs, eq(sessions.programId, programs.id))
    .leftJoin(eventTypes, eq(sessions.eventTypeId, eventTypes.id))
    .leftJoin(venues, eq(sessions.venueId, venues.id))
    .where(eq(matches.id, matchId))
    .limit(1)
    .then((rows) => rows[0]);
  const format = row?.match.format as Record<string, unknown> | undefined;
  if (
    !row ||
    row.organizationId !== organizationId ||
    format?.kobHeat !== true
  ) {
    throw new Error("KOB heat was not found in this organization.");
  }
  return { ...row, format };
}

export async function adjustKobHeatScore(
  input: MutationContext & {
    readonly matchId: string;
    readonly teamId: string;
    readonly delta: -1 | 1;
  },
): Promise<OperatorMutationResult> {
  requireDatabase();
  const organizationId = requireOrganization(input.actor);
  const row = await loadOwnedKobHeat(organizationId, input.matchId);
  const participantTeamIds = Array.isArray(row.format.participantTeamIds)
    ? row.format.participantTeamIds.filter(
        (teamId): teamId is string => typeof teamId === "string",
      )
    : [];
  if (!participantTeamIds.includes(input.teamId)) {
    throw new Error("That team is not taking part in this heat.");
  }
  if (["complete", "cancelled", "forfeit"].includes(row.match.status)) {
    throw new Error("A completed heat cannot be changed.");
  }
  const database = getTransactionalDatabase();
  await database.transaction(async (transaction) => {
    await transaction.execute(
      sql`select id from matches where id = ${input.matchId}::uuid for update`,
    );
    const lockedMatch = await transaction
      .select({ status: matches.status, format: matches.format })
      .from(matches)
      .where(eq(matches.id, input.matchId))
      .limit(1)
      .then((rows) => rows[0]);
    if (
      !lockedMatch ||
      ["complete", "cancelled", "forfeit"].includes(lockedMatch.status)
    ) {
      throw new Error("A completed heat cannot be changed.");
    }
    const existing = await transaction
      .select({
        sequence: rallyEvents.sequence,
        eventType: rallyEvents.eventType,
        payload: rallyEvents.payload,
      })
      .from(rallyEvents)
      .where(eq(rallyEvents.matchId, input.matchId))
      .orderBy(asc(rallyEvents.sequence));
    const lockedFormat = lockedMatch.format as Record<string, unknown>;
    const initialHeatScores =
      lockedFormat.initialHeatScores &&
      typeof lockedFormat.initialHeatScores === "object"
        ? (lockedFormat.initialHeatScores as Record<string, number>)
        : {};
    const currentPoints = existing.reduce((total, event) => {
      if (event.eventType !== "kob-heat-adjusted") return total;
      const payload = event.payload as Record<string, unknown>;
      return payload.teamId === input.teamId &&
        typeof payload.delta === "number"
        ? Math.max(0, total + payload.delta)
        : total;
    }, initialHeatScores[input.teamId] ?? 0);
    if (input.delta < 0 && currentPoints === 0) {
      throw new Error("A team's heat score cannot be below zero.");
    }
    const sequence = (existing.at(-1)?.sequence ?? 0) + 1;
    await transaction.insert(rallyEvents).values({
      id: crypto.randomUUID(),
      matchId: input.matchId,
      reportedByPersonId: input.actor.personId,
      sequence,
      deviceId: `duna-pro:${input.actor.personId}`,
      monotonicCounter: sequence,
      eventType: "kob-heat-adjusted",
      payload: {
        id: crypto.randomUUID(),
        type: "kob-heat-adjusted",
        teamId: input.teamId,
        delta: input.delta,
        occurredAt: input.now.toISOString(),
      },
      wallClockAt: input.now,
      receivedAt: input.now,
    });
    if (lockedMatch.status === "scheduled" || lockedMatch.status === "warmup") {
      await transaction
        .update(matches)
        .set({ status: "live", startedAt: input.now, updatedAt: input.now })
        .where(eq(matches.id, input.matchId));
    }
  });
  return { id: input.matchId, entity: "match", status: "live" };
}

export async function completeKobHeat(
  input: MutationContext & {
    readonly matchId: string;
    readonly reason: string;
  },
): Promise<OperatorMutationResult> {
  requireDatabase();
  const organizationId = requireOrganization(input.actor);
  const row = await loadOwnedKobHeat(organizationId, input.matchId);
  if (row.match.status === "complete") {
    return { id: input.matchId, entity: "match", status: "complete" };
  }
  if (["cancelled", "forfeit"].includes(row.match.status)) {
    throw new Error("A cancelled heat cannot be completed.");
  }
  const participantTeamIds = Array.isArray(row.format.participantTeamIds)
    ? row.format.participantTeamIds.filter(
        (teamId): teamId is string => typeof teamId === "string",
      )
    : [];
  if (participantTeamIds.length < 2) {
    throw new Error("At least two teams must enter the heat before it closes.");
  }
  const seedRows = await getDatabase()
    .select({ id: teams.id, seed: teams.seed })
    .from(teams)
    .where(inArray(teams.id, participantTeamIds));
  const seedByTeam = new Map(
    seedRows.map((team) => [team.id, team.seed ?? 9999]),
  );
  const advanceCount =
    typeof row.format.advanceCount === "number"
      ? Math.max(1, Math.trunc(row.format.advanceCount))
      : 1;
  const stageIndex =
    typeof row.format.kobStageIndex === "number" ? row.format.kobStageIndex : 0;
  const siblingRows = await getDatabase()
    .select()
    .from(matches)
    .where(eq(matches.bracketId, row.bracket.id));
  const nextMatch = siblingRows.find((match) => {
    const format = match.format as Record<string, unknown>;
    return format.kobHeat === true && format.kobStageIndex === stageIndex + 1;
  });
  const database = getTransactionalDatabase();
  const completed = await database.transaction(async (transaction) => {
    await transaction.execute(
      sql`select id from matches where id = ${input.matchId}::uuid for update`,
    );
    const lockedMatch = await transaction
      .select({ status: matches.status, format: matches.format })
      .from(matches)
      .where(eq(matches.id, input.matchId))
      .limit(1)
      .then((rows) => rows[0]);
    if (!lockedMatch) throw new Error("KOB heat was not found.");
    if (lockedMatch.status === "complete") return false;
    if (["cancelled", "forfeit"].includes(lockedMatch.status)) {
      throw new Error("A cancelled heat cannot be completed.");
    }
    const lockedFormat = lockedMatch.format as Record<string, unknown>;
    const eventRows = await transaction
      .select({
        eventType: rallyEvents.eventType,
        payload: rallyEvents.payload,
      })
      .from(rallyEvents)
      .where(eq(rallyEvents.matchId, input.matchId))
      .orderBy(asc(rallyEvents.sequence));
    const initialHeatScores =
      lockedFormat.initialHeatScores &&
      typeof lockedFormat.initialHeatScores === "object"
        ? (lockedFormat.initialHeatScores as Record<string, number>)
        : {};
    const scoreByTeam = new Map(
      participantTeamIds.map((teamId) => [
        teamId,
        initialHeatScores[teamId] ?? 0,
      ]),
    );
    for (const event of eventRows) {
      if (event.eventType !== "kob-heat-adjusted") continue;
      const payload = event.payload as Record<string, unknown>;
      if (
        typeof payload.teamId !== "string" ||
        typeof payload.delta !== "number"
      ) {
        continue;
      }
      scoreByTeam.set(
        payload.teamId,
        Math.max(0, (scoreByTeam.get(payload.teamId) ?? 0) + payload.delta),
      );
    }
    const ranked = [...participantTeamIds].sort(
      (left, right) =>
        (scoreByTeam.get(right) ?? 0) - (scoreByTeam.get(left) ?? 0) ||
        (seedByTeam.get(left) ?? 9999) - (seedByTeam.get(right) ?? 9999),
    );
    const advancing = ranked.slice(0, Math.min(advanceCount, ranked.length));
    await transaction
      .update(matches)
      .set({
        status: "complete",
        winnerTeamId: ranked[0],
        startedAt: row.match.startedAt ?? input.now,
        completedAt: input.now,
        updatedAt: input.now,
      })
      .where(eq(matches.id, input.matchId));
    if (nextMatch) {
      await transaction
        .update(matches)
        .set({
          format: {
            ...(nextMatch.format as Record<string, unknown>),
            participantTeamIds: advancing,
            initialHeatScores:
              lockedFormat.carryPoints === true
                ? Object.fromEntries(
                    advancing.map((teamId) => [
                      teamId,
                      scoreByTeam.get(teamId) ?? 0,
                    ]),
                  )
                : {},
          },
          updatedAt: input.now,
        })
        .where(eq(matches.id, nextMatch.id));
    }
    const structure = row.bracket.structure as Record<string, unknown>;
    const logicalNextId = nextMatch
      ? (nextMatch.format as Record<string, unknown>).logicalId
      : undefined;
    const structureMatches = Array.isArray(structure.matches)
      ? structure.matches.map((candidate) => {
          if (!candidate || typeof candidate !== "object") return candidate;
          const definition = candidate as Record<string, unknown>;
          return definition.id === logicalNextId
            ? {
                ...definition,
                metadata: {
                  ...((definition.metadata as Record<string, unknown>) ?? {}),
                  participantTeamIds: advancing,
                },
              }
            : definition;
        })
      : structure.matches;
    await transaction
      .update(brackets)
      .set({ structure: { ...structure, matches: structureMatches } })
      .where(eq(brackets.id, row.bracket.id));
    await transaction.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "kob.heat_completed",
      entityType: "match",
      entityId: input.matchId,
      afterHash: stableHash({
        ranked,
        scoreByTeam: Object.fromEntries(scoreByTeam),
      }),
      reason: input.reason,
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    });
    return true;
  });
  return {
    id: input.matchId,
    entity: "match",
    status: completed && nextMatch ? "complete-next-round-ready" : "complete",
  };
}
