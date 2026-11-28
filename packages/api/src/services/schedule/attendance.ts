/**
 * The one narrow attendance rule (SCHED-API): a coach may record
 * attendance (check people in) on a session they are assigned to, with
 * `sessions:read`. Everyone else still needs `sessions:write`. Used by
 * `operator.recordSessionAttendance`; nothing else is widened.
 */
import {
  eventTypes,
  getDatabase,
  programs,
  registrations,
  sessions,
  venues,
} from "@duna/db";
import { TRPCError } from "@trpc/server";
import { and, eq, sql } from "drizzle-orm";
import type { ApiActor } from "../../context";
import { hasScope } from "./shared";

/** Throws FORBIDDEN unless the actor may record attendance for the registration. */
export async function assertMayRecordSessionAttendance(input: {
  readonly actor: ApiActor;
  readonly organizationId: string;
  readonly registrationId: string;
}): Promise<void> {
  if (hasScope(input.actor, "sessions:write")) return;
  const denied = () =>
    new TRPCError({
      code: "FORBIDDEN",
      message: "Missing required scope: sessions:write",
    });
  if (!hasScope(input.actor, "sessions:read") || !process.env.DATABASE_URL) {
    throw denied();
  }
  const [row] = await getDatabase()
    .select({ coachPersonId: sessions.coachPersonId })
    .from(registrations)
    .innerJoin(sessions, eq(registrations.sessionId, sessions.id))
    .leftJoin(programs, eq(sessions.programId, programs.id))
    .leftJoin(eventTypes, eq(sessions.eventTypeId, eventTypes.id))
    .leftJoin(venues, eq(sessions.venueId, venues.id))
    .where(
      and(
        eq(registrations.id, input.registrationId),
        sql`coalesce(${programs.organizationId}, ${eventTypes.organizationId}, ${venues.organizationId}) = ${input.organizationId}`,
      ),
    )
    .limit(1);
  if (!row || row.coachPersonId !== input.actor.personId) throw denied();
}
