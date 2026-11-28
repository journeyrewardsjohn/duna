import { localMinuteOf } from "@duna/scheduling";
import type { BuilderSession } from "./plan-builder";
import { sessionMinutes, sessionWhen } from "./program-model";
import { loadSessionsBetween, type TrainingContext } from "./training-data";

const DAY = 86_400_000;

/** The practice a plan is being built for (`?session=`), in the builder's words. */
export async function builderSession(
  context: TrainingContext,
  sessionId: string | undefined,
): Promise<BuilderSession | undefined> {
  if (!sessionId) return undefined;
  const now = Date.parse(context.now);
  const sessions = await loadSessionsBetween(
    new Date(now - 199 * DAY).toISOString(),
    new Date(now + 199 * DAY).toISOString(),
  );
  if (sessions.state !== "ok") return undefined;
  const session = sessions.data.items.find((row) => row.id === sessionId);
  if (!session) return undefined;
  const minute = localMinuteOf(Date.parse(session.startsAt), session.timezone);
  return {
    id: session.id,
    when: sessionWhen(session),
    minutes: sessionMinutes(session),
    startsAt: `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`,
  };
}
