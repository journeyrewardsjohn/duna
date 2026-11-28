/**
 * Group state for the events on the discovery map (B10): event sessions and
 * pickups that carry a group rule get `participation: { displayState, copy }`
 * from the one core display model, so today's device search can show "Needs
 * 2 more players" before it switches to the server search. Batched: two
 * queries find the ruled events, four more count them, whatever the number
 * of events (no query per event).
 */
import {
  getDatabase,
  participationDecisions,
  participationWaitlistEntries,
  pickupParticipants,
  pickupSessions,
  registrations,
  sessions,
} from "@duna/db";
import {
  PARTICIPATION_POLICY,
  participationDisplay,
  participationLockAt,
  readParticipationRuleV2,
  renderParticipationDisplay,
  resolveParticipationRuleV2,
  type EventSummary,
  type ParticipationDecisionOutcome,
} from "@duna/core";
import { and, inArray, isNotNull, sql } from "drizzle-orm";
import type { DiscoveryMapItem } from "../../contracts";
import { decisionRule, effectiveLockAt } from "../participation/catalog";

export type DiscoveryParticipation = NonNullable<
  DiscoveryMapItem["participation"]
>;

type Database = ReturnType<typeof getDatabase>;

const CONFIRMED = new Set(["confirmed", "checked-in"]);

/** Display state and words for each ruled event, keyed by event id. */
export async function loadEventParticipation(input: {
  readonly events: readonly Pick<
    EventSummary,
    "id" | "kind" | "title" | "organizationName" | "timezone"
  >[];
  readonly now: Date;
  readonly database?: Database;
}): Promise<ReadonlyMap<string, DiscoveryParticipation>> {
  const output = new Map<string, DiscoveryParticipation>();
  const sessionIds = input.events
    .filter((event) => event.kind !== "pickup")
    .map((event) => event.id);
  const pickupIds = input.events
    .filter((event) => event.kind === "pickup")
    .map((event) => event.id);
  if (sessionIds.length + pickupIds.length === 0) return output;
  const database = input.database ?? getDatabase();
  const [sessionRows, pickupRows] = await Promise.all([
    sessionIds.length === 0
      ? Promise.resolve([])
      : database
          .select({
            id: sessions.id,
            participation: sessions.participation,
            capacity: sessions.capacity,
            status: sessions.status,
            startsAt: sessions.startsAt,
            endsAt: sessions.endsAt,
          })
          .from(sessions)
          .where(
            and(
              inArray(sessions.id, sessionIds),
              isNotNull(sessions.participation),
            ),
          ),
    pickupIds.length === 0
      ? Promise.resolve([])
      : database
          .select({
            id: pickupSessions.id,
            participation: pickupSessions.participation,
            capacity: pickupSessions.capacity,
            status: pickupSessions.status,
            startsAt: pickupSessions.startsAt,
            endsAt: pickupSessions.endsAt,
          })
          .from(pickupSessions)
          .where(
            and(
              inArray(pickupSessions.id, pickupIds),
              isNotNull(pickupSessions.participation),
            ),
          ),
  ]);
  const ruled = [
    ...sessionRows.map((row) => ({ ...row, subjectType: "session" as const })),
    ...pickupRows.map((row) => ({
      ...row,
      subjectType: "pickup-session" as const,
    })),
  ].filter((row) => readParticipationRuleV2(row.participation) !== undefined);
  if (ruled.length === 0) return output;
  const ruledSessionIds = ruled
    .filter((row) => row.subjectType === "session")
    .map((row) => row.id);
  const ruledPickupIds = ruled
    .filter((row) => row.subjectType === "pickup-session")
    .map((row) => row.id);
  const subjectIds = ruled.map((row) => row.id);
  const [registrationRows, pickupPeopleRows, decisionRows, waitingRows] =
    await Promise.all([
      ruledSessionIds.length === 0
        ? Promise.resolve([])
        : database
            .select({
              subjectId: registrations.sessionId,
              status: registrations.status,
              count: sql<number>`count(*)::int`,
            })
            .from(registrations)
            .where(
              and(
                inArray(registrations.sessionId, ruledSessionIds),
                inArray(registrations.status, [
                  "confirmed",
                  "checked-in",
                  "pending",
                ]),
              ),
            )
            .groupBy(registrations.sessionId, registrations.status),
      ruledPickupIds.length === 0
        ? Promise.resolve([])
        : database
            .select({
              subjectId: pickupParticipants.pickupSessionId,
              status: pickupParticipants.status,
              count: sql<number>`count(*)::int`,
            })
            .from(pickupParticipants)
            .where(
              and(
                inArray(pickupParticipants.pickupSessionId, ruledPickupIds),
                inArray(pickupParticipants.status, [
                  "confirmed",
                  "checked-in",
                  "pending",
                ]),
              ),
            )
            .groupBy(
              pickupParticipants.pickupSessionId,
              pickupParticipants.status,
            ),
      database
        .select()
        .from(participationDecisions)
        .where(
          and(
            inArray(participationDecisions.subjectType, [
              "session",
              "pickup-session",
            ]),
            inArray(participationDecisions.subjectId, subjectIds),
          ),
        ),
      database
        .select({
          subjectId: participationWaitlistEntries.subjectId,
          quantity: participationWaitlistEntries.quantity,
        })
        .from(participationWaitlistEntries)
        .where(
          and(
            inArray(participationWaitlistEntries.subjectType, [
              "session",
              "pickup-session",
            ]),
            inArray(participationWaitlistEntries.subjectId, subjectIds),
            inArray(participationWaitlistEntries.status, [
              "waiting",
              "offered",
            ]),
          ),
        ),
    ]);
  const counts = new Map<string, { confirmed: number; pending: number }>();
  for (const row of [...registrationRows, ...pickupPeopleRows]) {
    if (!row.subjectId) continue;
    const current = counts.get(row.subjectId) ?? { confirmed: 0, pending: 0 };
    if (CONFIRMED.has(row.status)) current.confirmed += Number(row.count);
    else current.pending += Number(row.count);
    counts.set(row.subjectId, current);
  }
  const decisions = new Map(
    decisionRows.map((row) => [`${row.subjectType}:${row.subjectId}`, row]),
  );
  const waiting = new Map<string, number>();
  for (const row of waitingRows) {
    waiting.set(
      row.subjectId,
      (waiting.get(row.subjectId) ?? 0) + row.quantity,
    );
  }
  const events = new Map(input.events.map((event) => [event.id, event]));
  for (const row of ruled) {
    const event = events.get(row.id);
    if (!event) continue;
    const decision = decisions.get(`${row.subjectType}:${row.id}`);
    const stored = readParticipationRuleV2(row.participation)!;
    const rule = decision
      ? decisionRule(decision, row.capacity)
      : resolveParticipationRuleV2(stored, {
          capacity: row.capacity,
          defaultLockMinutes:
            PARTICIPATION_POLICY.defaultLockMinutesBeforeStart,
        });
    const counted = counts.get(row.id) ?? { confirmed: 0, pending: 0 };
    const display = participationDisplay({
      rule,
      title: event.title,
      capacity: row.capacity,
      booked: counted.confirmed,
      held: counted.pending,
      waiting: waiting.get(row.id) ?? 0,
      outcome:
        (decision?.outcome as
          ParticipationDecisionOutcome | null | undefined) ??
        (row.status === "cancelled" ? "cancelled-by-club" : undefined),
      decidedGroupSize: decision?.decidedGroupSize,
      lockAt: decision
        ? effectiveLockAt(decision)
        : participationLockAt({
            startsAt: row.startsAt,
            lockMinutesBeforeStart: rule.lockMinutesBeforeStart,
          }),
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      now: input.now,
      timeZone: event.timezone,
      clubName: event.organizationName,
      payment: { method: "credit" },
      viewer: { booked: false, quantity: 1 },
    });
    const copy = renderParticipationDisplay(display);
    output.set(event.id, {
      displayState: display.state,
      copy: { status: copy.status, ...(copy.line ? { line: copy.line } : {}) },
    });
  }
  return output;
}
