import {
  auditLog,
  getDatabase,
  healthConnections,
  healthDailyCheckIns,
  healthRetentionRuns,
  healthSamples,
  healthSharingGrants,
  people,
} from "@duna/db";
import { and, eq, gt, inArray, isNotNull, isNull, lt, lte } from "drizzle-orm";
import { refreshStoredAgeBands } from "../../age-band";
import { usesDemoData } from "../data-source";
import {
  HEALTH_POLICY_VERSION,
  HEALTH_RETENTION_BATCH_SIZE,
  HEALTH_RETENTION_MAX_BATCHES,
  healthRetentionCutoffs,
} from "./policy";

export interface HealthRetentionResult {
  readonly expiredSamplesDeleted: number;
  readonly expiredCheckInsDeleted: number;
  readonly withdrawnSamplesDeleted: number;
  readonly withdrawnConnectionsPurged: number;
  readonly ageBandsRefreshed: number;
  readonly batches: number;
  /** False when the batch budget ran out; the next run continues. */
  readonly complete: boolean;
}

const emptyResult: HealthRetentionResult = {
  expiredSamplesDeleted: 0,
  expiredCheckInsDeleted: 0,
  withdrawnSamplesDeleted: 0,
  withdrawnConnectionsPurged: 0,
  ageBandsRefreshed: 0,
  batches: 0,
  complete: true,
};

/**
 * Daily Health maintenance (cron: /api/cron/health-retention).
 *
 * 1. Corrects stored age bands from birth dates (so SQL readers of
 *    `people.age_band` / `is_minor` are at most a day stale).
 * 2. Deletes samples older than 24 months, and older than 12 months for
 *    anyone under 18 today; the same windows apply to daily check-ins.
 * 3. Finishes withdrawals: deletes every imported sample and check-in of a
 *    connection whose purge was requested, then marks it revoked.
 *
 * Every step is a bounded delete of rows that still match, so overlapping or
 * repeated runs are safe. Logs and the audit entry carry counts only.
 */
export async function runHealthRetention(input: {
  readonly now: Date;
  readonly batchSize?: number;
  readonly maxBatches?: number;
}): Promise<HealthRetentionResult> {
  if (usesDemoData()) return emptyResult;
  const batchSize = Math.max(1, input.batchSize ?? HEALTH_RETENTION_BATCH_SIZE);
  const maxBatches = Math.max(
    1,
    input.maxBatches ?? HEALTH_RETENTION_MAX_BATCHES,
  );
  const database = getDatabase();
  const cutoffs = healthRetentionCutoffs(input.now);
  const [run] = await database
    .insert(healthRetentionRuns)
    .values({ startedAt: input.now, policyVersion: HEALTH_POLICY_VERSION })
    .returning({ id: healthRetentionRuns.id });
  let batches = 0;
  let exhausted = false;
  const counts = {
    expiredSamplesDeleted: 0,
    expiredCheckInsDeleted: 0,
    withdrawnSamplesDeleted: 0,
    withdrawnConnectionsPurged: 0,
    ageBandsRefreshed: 0,
  };

  // Runs one bounded step until it deletes less than a full batch.
  async function drain(step: () => Promise<number>): Promise<number> {
    let total = 0;
    while (batches < maxBatches) {
      batches += 1;
      const deleted = await step();
      total += deleted;
      if (deleted < batchSize) return total;
    }
    exhausted = true;
    return total;
  }

  counts.ageBandsRefreshed = await drain(async () => {
    const result = await refreshStoredAgeBands({
      now: input.now,
      limit: batchSize,
    });
    return result.updated;
  });

  counts.expiredSamplesDeleted += await drain(async () => {
    const ids = database
      .select({ id: healthSamples.id })
      .from(healthSamples)
      .where(lt(healthSamples.startedAt, cutoffs.adultStartedBefore))
      .limit(batchSize);
    const removed = await database
      .delete(healthSamples)
      .where(inArray(healthSamples.id, ids))
      .returning({ id: healthSamples.id });
    return removed.length;
  });

  counts.expiredSamplesDeleted += await drain(async () => {
    const ids = database
      .select({ id: healthSamples.id })
      .from(healthSamples)
      .innerJoin(people, eq(people.id, healthSamples.personId))
      .where(
        and(
          lt(healthSamples.startedAt, cutoffs.minorStartedBefore),
          isNotNull(people.birthDate),
          gt(people.birthDate, cutoffs.minorBornAfter),
        ),
      )
      .limit(batchSize);
    const removed = await database
      .delete(healthSamples)
      .where(inArray(healthSamples.id, ids))
      .returning({ id: healthSamples.id });
    return removed.length;
  });

  counts.expiredCheckInsDeleted += await drain(async () => {
    const ids = database
      .select({ id: healthDailyCheckIns.id })
      .from(healthDailyCheckIns)
      .where(lt(healthDailyCheckIns.localDate, cutoffs.adultCheckInsBefore))
      .limit(batchSize);
    const removed = await database
      .delete(healthDailyCheckIns)
      .where(inArray(healthDailyCheckIns.id, ids))
      .returning({ id: healthDailyCheckIns.id });
    return removed.length;
  });

  counts.expiredCheckInsDeleted += await drain(async () => {
    const ids = database
      .select({ id: healthDailyCheckIns.id })
      .from(healthDailyCheckIns)
      .innerJoin(people, eq(people.id, healthDailyCheckIns.personId))
      .where(
        and(
          lt(healthDailyCheckIns.localDate, cutoffs.minorCheckInsBefore),
          isNotNull(people.birthDate),
          gt(people.birthDate, cutoffs.minorBornAfter),
        ),
      )
      .limit(batchSize);
    const removed = await database
      .delete(healthDailyCheckIns)
      .where(inArray(healthDailyCheckIns.id, ids))
      .returning({ id: healthDailyCheckIns.id });
    return removed.length;
  });

  const withdrawn = await database
    .select({ personId: healthConnections.personId })
    .from(healthConnections)
    .where(lte(healthConnections.purgeRequestedAt, input.now))
    .limit(batchSize);
  for (const connection of withdrawn) {
    if (batches >= maxBatches) {
      exhausted = true;
      break;
    }
    counts.withdrawnSamplesDeleted += await drain(async () => {
      const ids = database
        .select({ id: healthSamples.id })
        .from(healthSamples)
        .where(eq(healthSamples.personId, connection.personId))
        .limit(batchSize);
      const removed = await database
        .delete(healthSamples)
        .where(inArray(healthSamples.id, ids))
        .returning({ id: healthSamples.id });
      return removed.length;
    });
    if (exhausted) break;
    await database.batch([
      database
        .delete(healthDailyCheckIns)
        .where(eq(healthDailyCheckIns.personId, connection.personId)),
      database
        .update(healthSharingGrants)
        .set({ revokedAt: input.now, updatedAt: input.now })
        .where(
          and(
            eq(healthSharingGrants.ownerPersonId, connection.personId),
            isNull(healthSharingGrants.revokedAt),
          ),
        ),
      database
        .update(healthConnections)
        .set({
          status: "revoked",
          enabledCategories: [],
          revokedAt: input.now,
          purgeRequestedAt: null,
          updatedAt: input.now,
        })
        .where(
          and(
            eq(healthConnections.personId, connection.personId),
            lte(healthConnections.purgeRequestedAt, input.now),
          ),
        ),
    ]);
    counts.withdrawnConnectionsPurged += 1;
  }

  const result: HealthRetentionResult = {
    ...counts,
    batches,
    complete: !exhausted,
  };
  await database.batch([
    database
      .update(healthRetentionRuns)
      .set({ ...result, finishedAt: new Date() })
      .where(eq(healthRetentionRuns.id, run!.id)),
    database.insert(auditLog).values({
      actorType: "system",
      action: "health.retention_purged",
      entityType: "health-retention-run",
      entityId: run!.id,
      reason: `Health retention under ${HEALTH_POLICY_VERSION}: ${result.expiredSamplesDeleted} expired samples, ${result.expiredCheckInsDeleted} expired check-ins, ${result.withdrawnSamplesDeleted} withdrawn samples, ${result.withdrawnConnectionsPurged} withdrawn connections, ${result.ageBandsRefreshed} age bands refreshed${result.complete ? "" : "; batch budget reached, continuing next run"}.`,
      createdAt: input.now,
    }),
  ]);
  return result;
}
