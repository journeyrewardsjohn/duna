import {
  auditLog,
  getDatabase,
  people,
  pickupJoinRequests,
  pickupParticipants,
  pickupSessions,
} from "@duna/db";
import { and, eq, inArray, ne } from "drizzle-orm";
import { stableHash } from "./canonical";
import type { ApiActor } from "./context";
import { CommerceError, evaluatePickupParticipant } from "./commerce";

export type PickupRequestStatus =
  "requested" | "approved" | "rejected" | "cancelled" | "expired";

export interface PickupJoinRequestSummary {
  readonly id: string;
  readonly personId: string;
  readonly displayName: string;
  readonly avatarUrl?: string;
  readonly note?: string;
  readonly status: PickupRequestStatus;
  readonly createdAt: string;
}

export interface PickupManagementSummary {
  readonly pickupSessionId: string;
  readonly status: "active" | "cancelled" | "completed";
  readonly approvalRequired: boolean;
  readonly isHost: boolean;
  readonly isParticipant: boolean;
  readonly canEdit: boolean;
  readonly canCancel: boolean;
  readonly canLeave: boolean;
  readonly confirmedParticipantCount: number;
  readonly ownRequestStatus?: PickupRequestStatus;
  readonly requests: readonly PickupJoinRequestSummary[];
}

async function pickupOrThrow(pickupSessionId: string) {
  const pickup = await getDatabase().query.pickupSessions.findFirst({
    where: eq(pickupSessions.id, pickupSessionId),
  });
  if (!pickup) {
    throw new CommerceError("PICKUP_NOT_FOUND", "Pickup was not found.");
  }
  return pickup;
}

export async function loadPickupManagement(input: {
  readonly actor: ApiActor;
  readonly pickupSessionId: string;
}): Promise<PickupManagementSummary> {
  const database = getDatabase();
  const pickup = await pickupOrThrow(input.pickupSessionId);
  const isHost = pickup.hostPersonId === input.actor.personId;
  const [participantRows, ownRequest, requestRows] = await Promise.all([
    database
      .select({
        personId: pickupParticipants.personId,
        status: pickupParticipants.status,
      })
      .from(pickupParticipants)
      .where(
        and(
          eq(pickupParticipants.pickupSessionId, pickup.id),
          inArray(pickupParticipants.status, [
            "confirmed",
            "checked-in",
            "pending",
            "waitlisted",
          ]),
        ),
      ),
    database.query.pickupJoinRequests.findFirst({
      where: and(
        eq(pickupJoinRequests.pickupSessionId, pickup.id),
        eq(pickupJoinRequests.personId, input.actor.personId),
      ),
    }),
    isHost
      ? database
          .select({
            id: pickupJoinRequests.id,
            personId: pickupJoinRequests.personId,
            displayName: people.displayName,
            avatarUrl: people.avatarUrl,
            note: pickupJoinRequests.note,
            status: pickupJoinRequests.status,
            createdAt: pickupJoinRequests.createdAt,
          })
          .from(pickupJoinRequests)
          .innerJoin(people, eq(pickupJoinRequests.personId, people.id))
          .where(
            and(
              eq(pickupJoinRequests.pickupSessionId, pickup.id),
              eq(pickupJoinRequests.status, "requested"),
            ),
          )
      : Promise.resolve([]),
  ]);
  const activeParticipants = participantRows.filter(
    (row) => row.personId !== pickup.hostPersonId,
  );
  const isParticipant = participantRows.some(
    (row) => row.personId === input.actor.personId,
  );
  const hostCanChange =
    isHost && pickup.status === "active" && activeParticipants.length === 0;
  return {
    pickupSessionId: pickup.id,
    status: pickup.status as PickupManagementSummary["status"],
    approvalRequired: pickup.approvalRequired,
    isHost,
    isParticipant,
    canEdit: hostCanChange,
    canCancel: hostCanChange,
    canLeave:
      isParticipant &&
      pickup.status === "active" &&
      (!isHost || activeParticipants.length > 0),
    confirmedParticipantCount: participantRows.filter((row) =>
      ["confirmed", "checked-in"].includes(row.status),
    ).length,
    ownRequestStatus: ownRequest?.status as PickupRequestStatus | undefined,
    requests: requestRows.map((row) => ({
      id: row.id,
      personId: row.personId,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl ?? undefined,
      note: row.note ?? undefined,
      status: row.status as PickupRequestStatus,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

export async function requestPickupJoin(input: {
  readonly actor: ApiActor;
  readonly pickupSessionId: string;
  readonly note?: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{ readonly id: string; readonly status: "requested" }> {
  const database = getDatabase();
  const pickup = await pickupOrThrow(input.pickupSessionId);
  if (!pickup.approvalRequired) {
    throw new CommerceError(
      "PICKUP_NOT_JOINABLE",
      "This pickup does not require a join request. Continue to booking.",
    );
  }
  if (pickup.status !== "active" || pickup.startsAt <= input.now) {
    throw new CommerceError(
      "PICKUP_NOT_JOINABLE",
      "This pickup is no longer accepting requests.",
    );
  }
  if (pickup.hostPersonId === input.actor.personId) {
    throw new CommerceError(
      "PICKUP_NOT_JOINABLE",
      "You are already hosting this pickup.",
    );
  }
  await evaluatePickupParticipant({
    actor: input.actor,
    pickupSessionId: pickup.id,
    subjectPersonId: input.actor.personId,
    now: input.now,
    requireApproval: false,
  });
  const id = crypto.randomUUID();
  await database.transaction(async (transaction) => {
    await transaction
      .insert(pickupJoinRequests)
      .values({
        id,
        pickupSessionId: pickup.id,
        personId: input.actor.personId,
        status: "requested",
        note: input.note,
        expiresAt: pickup.startsAt,
      })
      .onConflictDoUpdate({
        target: [
          pickupJoinRequests.pickupSessionId,
          pickupJoinRequests.personId,
        ],
        set: {
          status: "requested",
          note: input.note,
          reviewedAt: null,
          reviewedByPersonId: null,
          expiresAt: pickup.startsAt,
          updatedAt: input.now,
        },
      });
    await transaction.insert(auditLog).values({
      organizationId: pickup.organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "pickup.join-requested",
      entityType: "pickup-session",
      entityId: pickup.id,
      reason: "Player requested host approval to join.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
    });
  });
  const saved = await database.query.pickupJoinRequests.findFirst({
    where: and(
      eq(pickupJoinRequests.pickupSessionId, pickup.id),
      eq(pickupJoinRequests.personId, input.actor.personId),
    ),
  });
  return { id: saved?.id ?? id, status: "requested" };
}

export async function reviewPickupJoinRequest(input: {
  readonly actor: ApiActor;
  readonly requestId: string;
  readonly decision: "approved" | "rejected";
  readonly traceId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{ readonly id: string; readonly status: "approved" | "rejected" }> {
  const database = getDatabase();
  const request = await database.query.pickupJoinRequests.findFirst({
    where: eq(pickupJoinRequests.id, input.requestId),
  });
  if (!request) {
    throw new CommerceError("PICKUP_NOT_FOUND", "Join request was not found.");
  }
  const pickup = await pickupOrThrow(request.pickupSessionId);
  if (pickup.hostPersonId !== input.actor.personId) {
    throw new CommerceError(
      "PICKUP_NOT_JOINABLE",
      "Only the pickup host can review join requests.",
    );
  }
  if (request.status !== "requested" || pickup.status !== "active") {
    throw new CommerceError(
      "PICKUP_NOT_JOINABLE",
      "This join request can no longer be reviewed.",
    );
  }
  await database.transaction(async (transaction) => {
    await transaction
      .update(pickupJoinRequests)
      .set({
        status: input.decision,
        reviewedAt: input.now,
        reviewedByPersonId: input.actor.personId,
        updatedAt: input.now,
      })
      .where(eq(pickupJoinRequests.id, request.id));
    await transaction.insert(auditLog).values({
      organizationId: pickup.organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: `pickup.join-${input.decision}`,
      entityType: "pickup-join-request",
      entityId: request.id,
      reason: `Host ${input.decision} a pickup join request.`,
      traceId: input.traceId,
      ipAddress: input.ipAddress,
    });
  });
  return { id: request.id, status: input.decision };
}

export async function updatePickup(input: {
  readonly actor: ApiActor;
  readonly pickupSessionId: string;
  readonly title: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly venueName: string;
  readonly address?: string;
  readonly googlePlaceId?: string;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly locationConfidence?: "confirmed" | "approximate";
  readonly capacity: number;
  readonly note?: string;
  readonly approvalRequired: boolean;
  readonly visibility: "public" | "unlisted";
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{ readonly id: string; readonly status: "active" }> {
  const database = getDatabase();
  const pickup = await pickupOrThrow(input.pickupSessionId);
  if (pickup.hostPersonId !== input.actor.personId) {
    throw new CommerceError(
      "PICKUP_NOT_JOINABLE",
      "Only the pickup host can edit it.",
    );
  }
  const otherParticipant = await database.query.pickupParticipants.findFirst({
    where: and(
      eq(pickupParticipants.pickupSessionId, pickup.id),
      ne(pickupParticipants.personId, pickup.hostPersonId),
      inArray(pickupParticipants.status, [
        "confirmed",
        "checked-in",
        "pending",
        "waitlisted",
      ]),
    ),
  });
  if (pickup.status !== "active" || otherParticipant) {
    throw new CommerceError(
      "PICKUP_NOT_JOINABLE",
      "A pickup can be edited only before another player has joined.",
    );
  }
  if (
    input.startsAt <= input.now ||
    input.endsAt <= input.startsAt ||
    !input.title.trim() ||
    !input.venueName.trim() ||
    input.capacity < 2
  ) {
    throw new CommerceError(
      "PICKUP_NOT_JOINABLE",
      "Choose a future time, valid duration, venue, title, and at least two spots.",
    );
  }
  const beforeHash = stableHash({
    title: pickup.title,
    startsAt: pickup.startsAt.toISOString(),
    endsAt: pickup.endsAt.toISOString(),
    venueName: pickup.venueLabel,
    capacity: pickup.capacity,
    approvalRequired: pickup.approvalRequired,
  });
  await database.transaction(async (transaction) => {
    await transaction
      .update(pickupSessions)
      .set({
        title: input.title.trim(),
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        venueLabel: input.venueName.trim(),
        address: input.address?.trim() || null,
        googlePlaceId: input.googlePlaceId ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        locationConfidence:
          input.locationConfidence ??
          (input.googlePlaceId && input.latitude !== undefined
            ? "confirmed"
            : "approximate"),
        capacity: input.capacity,
        note: input.note?.trim() || null,
        approvalRequired: input.approvalRequired,
        visibility: input.visibility,
        updatedAt: input.now,
      })
      .where(eq(pickupSessions.id, pickup.id));
    await transaction.insert(auditLog).values({
      organizationId: pickup.organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "pickup.updated",
      entityType: "pickup-session",
      entityId: pickup.id,
      beforeHash,
      afterHash: stableHash({
        title: input.title.trim(),
        startsAt: input.startsAt.toISOString(),
        endsAt: input.endsAt.toISOString(),
        venueName: input.venueName.trim(),
        capacity: input.capacity,
        approvalRequired: input.approvalRequired,
      }),
      reason: "Host edited the pickup before another player joined.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
    });
  });
  return { id: pickup.id, status: "active" };
}

export async function cancelPickup(input: {
  readonly actor: ApiActor;
  readonly pickupSessionId: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{ readonly id: string; readonly status: "cancelled" }> {
  const database = getDatabase();
  const pickup = await pickupOrThrow(input.pickupSessionId);
  if (pickup.hostPersonId !== input.actor.personId) {
    throw new CommerceError(
      "PICKUP_NOT_JOINABLE",
      "Only the host can cancel this pickup.",
    );
  }
  const otherParticipant = await database.query.pickupParticipants.findFirst({
    where: and(
      eq(pickupParticipants.pickupSessionId, pickup.id),
      ne(pickupParticipants.personId, pickup.hostPersonId),
      inArray(pickupParticipants.status, [
        "confirmed",
        "checked-in",
        "pending",
        "waitlisted",
      ]),
    ),
  });
  if (pickup.status !== "active" || otherParticipant) {
    throw new CommerceError(
      "PICKUP_NOT_JOINABLE",
      "A host can cancel only before another player has joined.",
    );
  }
  await database.transaction(async (transaction) => {
    await transaction
      .update(pickupSessions)
      .set({ status: "cancelled", updatedAt: input.now })
      .where(eq(pickupSessions.id, pickup.id));
    await transaction
      .update(pickupJoinRequests)
      .set({ status: "cancelled", updatedAt: input.now })
      .where(
        and(
          eq(pickupJoinRequests.pickupSessionId, pickup.id),
          eq(pickupJoinRequests.status, "requested"),
        ),
      );
    await transaction.insert(auditLog).values({
      organizationId: pickup.organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "pickup.cancelled",
      entityType: "pickup-session",
      entityId: pickup.id,
      reason: "Host cancelled before another player joined.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
    });
  });
  return { id: pickup.id, status: "cancelled" };
}

export async function leavePickup(input: {
  readonly actor: ApiActor;
  readonly pickupSessionId: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{ readonly id: string; readonly status: "cancelled" }> {
  const database = getDatabase();
  const pickup = await pickupOrThrow(input.pickupSessionId);
  const otherParticipant =
    pickup.hostPersonId === input.actor.personId
      ? await database.query.pickupParticipants.findFirst({
          where: and(
            eq(pickupParticipants.pickupSessionId, pickup.id),
            ne(pickupParticipants.personId, pickup.hostPersonId),
            inArray(pickupParticipants.status, ["confirmed", "checked-in"]),
          ),
        })
      : undefined;
  if (pickup.hostPersonId === input.actor.personId && !otherParticipant) {
    return cancelPickup(input);
  }
  const participation = await database.query.pickupParticipants.findFirst({
    where: and(
      eq(pickupParticipants.pickupSessionId, pickup.id),
      eq(pickupParticipants.personId, input.actor.personId),
      inArray(pickupParticipants.status, [
        "confirmed",
        "checked-in",
        "pending",
        "waitlisted",
      ]),
    ),
  });
  if (!participation || pickup.status !== "active") {
    throw new CommerceError(
      "PICKUP_NOT_JOINABLE",
      "You do not have an active spot in this pickup.",
    );
  }
  await database.transaction(async (transaction) => {
    await transaction
      .update(pickupParticipants)
      .set({ status: "cancelled", updatedAt: input.now })
      .where(eq(pickupParticipants.id, participation.id));
    await transaction.insert(auditLog).values({
      organizationId: pickup.organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action:
        pickup.hostPersonId === input.actor.personId
          ? "pickup.host-left"
          : "pickup.left",
      entityType: "pickup-session",
      entityId: pickup.id,
      reason:
        pickup.hostPersonId === input.actor.personId
          ? "Host removed themself after other players joined."
          : "Player removed themself from the pickup.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
    });
  });
  return { id: pickup.id, status: "cancelled" };
}
