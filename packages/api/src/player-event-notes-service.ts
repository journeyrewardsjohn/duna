import {
  auditLog,
  getDatabase,
  pickupParticipants,
  playerEventNotes,
  registrations,
} from "@duna/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { stableHash } from "./canonical";
import type { ApiActor } from "./context";

export type PlayerEventNote = {
  readonly id: string;
  readonly body: string;
  readonly visibility: "private" | "shared-with-host";
  readonly source: "typed" | "voice";
  readonly audioUrl?: string;
  readonly createdAt: string;
};

async function requireParticipation(input: {
  readonly actor: ApiActor;
  readonly activityType: "pickup" | "session";
  readonly activityId: string;
}) {
  const database = getDatabase();
  const pickup =
    input.activityType === "pickup"
      ? await database.query.pickupParticipants.findFirst({
          where: and(
            eq(pickupParticipants.pickupSessionId, input.activityId),
            eq(pickupParticipants.personId, input.actor.personId),
            inArray(pickupParticipants.status, ["confirmed", "checked-in"]),
          ),
        })
      : undefined;
  const registration =
    input.activityType === "session"
      ? await database.query.registrations.findFirst({
          where: and(
            eq(registrations.sessionId, input.activityId),
            eq(registrations.personId, input.actor.personId),
            inArray(registrations.status, ["confirmed", "checked-in"]),
          ),
        })
      : undefined;
  if (!pickup && !registration) {
    throw new Error("Only a participant can add a reflection for this event.");
  }
}

function noteSummary(
  note: typeof playerEventNotes.$inferSelect,
): PlayerEventNote {
  return {
    id: note.id,
    body: note.body,
    visibility: note.visibility as PlayerEventNote["visibility"],
    source: note.source as PlayerEventNote["source"],
    ...(note.audioUrl ? { audioUrl: note.audioUrl } : {}),
    createdAt: note.createdAt.toISOString(),
  };
}

export async function loadPlayerEventNotes(input: {
  readonly actor: ApiActor;
  readonly activityType: "pickup" | "session";
  readonly activityId: string;
}): Promise<readonly PlayerEventNote[]> {
  await requireParticipation(input);
  const notes = await getDatabase()
    .select()
    .from(playerEventNotes)
    .where(
      and(
        eq(playerEventNotes.personId, input.actor.personId),
        eq(playerEventNotes.activityType, input.activityType),
        eq(playerEventNotes.activityId, input.activityId),
      ),
    )
    .orderBy(desc(playerEventNotes.createdAt));
  return notes.map(noteSummary);
}

export async function createPlayerEventNote(input: {
  readonly actor: ApiActor;
  readonly activityType: "pickup" | "session";
  readonly activityId: string;
  readonly body: string;
  readonly visibility: "private" | "shared-with-host";
  readonly source: "typed" | "voice";
  readonly audioUrl?: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<PlayerEventNote> {
  await requireParticipation(input);
  const database = getDatabase();
  const id = crypto.randomUUID();
  const [note] = await database
    .insert(playerEventNotes)
    .values({
      id,
      personId: input.actor.personId,
      activityType: input.activityType,
      activityId: input.activityId,
      body: input.body,
      visibility: input.visibility,
      source: input.source,
      audioUrl: input.audioUrl,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .returning();
  await database.insert(auditLog).values({
    actorPersonId: input.actor.personId,
    actorType: "person",
    action: "player.event_note_created",
    entityType: "player-event-note",
    entityId: id,
    afterHash: stableHash({
      activityType: input.activityType,
      activityId: input.activityId,
      visibility: input.visibility,
      source: input.source,
      body: input.body,
    }),
    reason: "Player saved a private event reflection.",
    traceId: input.requestId,
    ipAddress: input.ipAddress,
    createdAt: input.now,
  });
  return noteSummary(note!);
}
