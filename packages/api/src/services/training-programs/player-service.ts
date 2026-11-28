/**
 * Training programs (B4): the athlete's own view. A signed-in person sees
 * the programs they are on, and those of the juniors they are the verified
 * guardian of (`guardianships`), across clubs. Draft programs are never
 * shown. Nothing here is organisation-scoped: the person is the scope.
 */
import {
  getDatabase,
  guardianships,
  trainingEvents,
  trainingPrograms,
} from "@duna/db";
import { and, asc, eq, gt, inArray, lt } from "drizzle-orm";
import type { z } from "zod";
import type {
  trainingProgramsListSchema,
  trainingProgramsSessionsSchema,
} from "../../contracts/training-programs";
import type { ApiActor } from "../../context";
import { programSummaries } from "./programs-service";
import {
  athleteProgramIds,
  buildSessions,
  SESSION_LIST_LIMIT,
  SESSION_WINDOW_DAYS,
} from "./sessions-service";
import { badRequest } from "./shared";

export async function followedPeople(actor: ApiActor): Promise<string[]> {
  const minors = await getDatabase()
    .select({ minorId: guardianships.minorId })
    .from(guardianships)
    .where(
      and(
        eq(guardianships.guardianId, actor.personId),
        eq(guardianships.verified, true),
      ),
    )
    .limit(20);
  return [actor.personId, ...minors.map((row) => row.minorId)];
}

export async function myPrograms(
  actor: ApiActor,
  now: Date,
): Promise<z.infer<typeof trainingProgramsListSchema>> {
  const programIds = await athleteProgramIds(await followedPeople(actor));
  if (programIds.length === 0) return { items: [] };
  const rows = await getDatabase()
    .select()
    .from(trainingPrograms)
    .where(inArray(trainingPrograms.id, programIds))
    .orderBy(asc(trainingPrograms.startDate));
  return { items: await programSummaries(rows, now) };
}

export async function mySchedule(
  actor: ApiActor,
  input: { readonly from: string; readonly to: string },
): Promise<z.infer<typeof trainingProgramsSessionsSchema>> {
  const from = new Date(input.from);
  const to = new Date(input.to);
  if (!(to > from)) badRequest("The window ends after it starts.");
  if (to.getTime() - from.getTime() > SESSION_WINDOW_DAYS * 86_400_000) {
    badRequest(`Ask for at most ${SESSION_WINDOW_DAYS} days at a time.`);
  }
  const programIds = await athleteProgramIds(await followedPeople(actor));
  if (programIds.length === 0) return { items: [] };
  const rows = await getDatabase()
    .select()
    .from(trainingEvents)
    .where(
      and(
        inArray(trainingEvents.programId, programIds),
        lt(trainingEvents.startsAt, to),
        gt(trainingEvents.endsAt, from),
      ),
    )
    .orderBy(asc(trainingEvents.startsAt))
    .limit(SESSION_LIST_LIMIT);
  return { items: await buildSessions(rows) };
}
