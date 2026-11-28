/**
 * Group rules on event sessions, divisions and pickups, and "Rules to
 * review" (participation.md §2.3): the legacy minimums the 0118 backfill
 * mapped to "run" until an owner keeps or changes them (decision 7). A rule
 * change never touches a session people already booked: the engine keeps
 * the snapshot taken when it first counted someone.
 */
import {
  auditLog,
  divisions,
  getDatabase,
  pickupSessions,
  sessions,
} from "@duna/db";
import {
  serializeParticipationRule,
  validateParticipationRuleV2,
  type ParticipationRevenueCliff,
  type ParticipationRuleV2,
} from "@duna/core";
import { and, asc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { stableHash } from "../../canonical";
import type { ApiActor } from "../../context";
import { ParticipationError, requireParticipationDatabase } from "./catalog";
import { loadSubjectFacts, type OtherSubjectType } from "./subjects";

export async function setSubjectParticipationRule(input: {
  readonly organizationId?: string;
  /** A player hosting a pickup sets its rule themselves. */
  readonly hostPersonId?: string;
  readonly actorPersonId: string;
  readonly subjectType: OtherSubjectType;
  readonly subjectId: string;
  readonly rules: unknown;
  readonly requestId: string;
  readonly now: Date;
}): Promise<{
  readonly rules: ParticipationRuleV2 | null;
  readonly issues: readonly string[];
  readonly warnings: readonly ParticipationRevenueCliff[];
}> {
  requireParticipationDatabase();
  const facts = await loadSubjectFacts(input.subjectType, input.subjectId);
  const allowed =
    facts &&
    ((input.organizationId && facts.organizationId === input.organizationId) ||
      (input.hostPersonId &&
        input.subjectType === "pickup-session" &&
        facts.staffPersonIds.includes(input.hostPersonId)));
  if (!facts || !allowed) {
    throw new ParticipationError("NOT_FOUND", "This session was not found.");
  }
  const validation = validateParticipationRuleV2(
    {
      ...(input.rules as Record<string, unknown>),
      unit: input.subjectType === "division" ? "team" : "player",
    },
    { capacity: facts.capacity },
  );
  if (!validation.rule) {
    return { rules: null, issues: validation.issues, warnings: [] };
  }
  const stored = serializeParticipationRule({
    ...validation.rule,
    effectiveFrom: input.now.toISOString(),
  });
  const database = getDatabase();
  if (input.subjectType === "session") {
    await database
      .update(sessions)
      .set({
        participation: stored,
        participationReviewState: "changed",
        updatedAt: input.now,
      })
      .where(eq(sessions.id, input.subjectId));
  } else if (input.subjectType === "division") {
    await database
      .update(divisions)
      .set({ participation: stored, updatedAt: input.now })
      .where(eq(divisions.id, input.subjectId));
  } else {
    await database
      .update(pickupSessions)
      .set({
        participation: stored,
        participationReviewState: "changed",
        updatedAt: input.now,
      })
      .where(eq(pickupSessions.id, input.subjectId));
  }
  await database.insert(auditLog).values({
    organizationId: facts.organizationId,
    actorPersonId: input.actorPersonId,
    actorType: "person",
    action: "participation.subject_rule_saved",
    entityType: input.subjectType,
    entityId: input.subjectId,
    afterHash: stableHash(stored),
    reason: "Group rule saved.",
    traceId: input.requestId,
    createdAt: input.now,
  });
  return { rules: validation.rule, issues: [], warnings: validation.warnings };
}

export async function reviewSubjectParticipationRule(input: {
  readonly actor: ApiActor;
  readonly organizationId: string;
  readonly subjectType: "session" | "pickup-session";
  readonly subjectId: string;
  readonly now: Date;
}): Promise<{ readonly state: "kept" }> {
  requireParticipationDatabase();
  const facts = await loadSubjectFacts(input.subjectType, input.subjectId);
  if (!facts || facts.organizationId !== input.organizationId) {
    throw new ParticipationError("NOT_FOUND", "This session was not found.");
  }
  const database = getDatabase();
  if (input.subjectType === "session") {
    await database
      .update(sessions)
      .set({ participationReviewState: "kept", updatedAt: input.now })
      .where(eq(sessions.id, input.subjectId));
  } else {
    await database
      .update(pickupSessions)
      .set({ participationReviewState: "kept", updatedAt: input.now })
      .where(eq(pickupSessions.id, input.subjectId));
  }
  return { state: "kept" };
}

/** HQ's "Rules to review": backfilled legacy minimums still pending. */
export async function participationRulesToReview(input: {
  readonly organizationId: string;
  readonly now: Date;
}): Promise<
  readonly {
    readonly subjectType: "session" | "pickup-session";
    readonly subjectId: string;
    readonly title: string;
    readonly startsAt: string;
    readonly minParticipants: number;
  }[]
> {
  requireParticipationDatabase();
  const database = getDatabase();
  const sessionRows = await database.execute(sql`
    SELECT s.id, s.title, s.starts_at, s.participation
    FROM sessions s
    LEFT JOIN programs p ON p.id = s.program_id
    LEFT JOIN event_types e ON e.id = s.event_type_id
    WHERE s.participation_review_state = 'pending'
      AND s.starts_at >= ${input.now}
      AND COALESCE(p.organization_id, e.organization_id) = ${input.organizationId}::uuid
    ORDER BY s.starts_at
    LIMIT 200
  `);
  const pickupRows = await database
    .select()
    .from(pickupSessions)
    .where(
      and(
        eq(pickupSessions.organizationId, input.organizationId),
        eq(pickupSessions.participationReviewState, "pending"),
        isNotNull(pickupSessions.participation),
        gte(pickupSessions.startsAt, input.now),
      ),
    )
    .orderBy(asc(pickupSessions.startsAt))
    .limit(200);
  const minimum = (value: unknown) =>
    Number(
      (value as { minParticipants?: number } | null)?.minParticipants ?? 1,
    );
  return [
    ...(
      sessionRows as unknown as {
        rows: {
          id: string;
          title: string;
          starts_at: Date | string;
          participation: unknown;
        }[];
      }
    ).rows.map((row) => ({
      subjectType: "session" as const,
      subjectId: row.id,
      title: row.title,
      startsAt: new Date(row.starts_at).toISOString(),
      minParticipants: minimum(row.participation),
    })),
    ...pickupRows.map((row) => ({
      subjectType: "pickup-session" as const,
      subjectId: row.id,
      title: row.title,
      startsAt: row.startsAt.toISOString(),
      minParticipants: minimum(row.participation),
    })),
  ];
}
