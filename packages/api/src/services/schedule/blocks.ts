/**
 * Removing a block from the calendar (SCHED-API). Blocks live in two
 * places, both written by existing procedures:
 *
 * - one-off blocks, closures and weather holds: `schedule_overrides`
 *   (`operator.createCalendarBlock`, `operator.blockCourtTime`);
 * - weekly blocks: `schedule_blocks` rows with mode `blocked` /
 *   `maintenance` (`operator.createRecurringCalendarBlocks`), one row per
 *   weekday window with effective dates.
 *
 * A weekly block can be removed for one date (the row is split around it),
 * from a date on (its end date moves back) or entirely. Opening hours are
 * never removed here. A closure that sessions or bookings were cancelled
 * under is refused until the person acknowledges them: removing the block
 * does not bring them back. Every removal writes an audit row.
 */
import {
  auditLog,
  courtBookings,
  getTransactionalDatabase,
  scheduleBlocks,
  scheduleOverrides,
  schedules,
  sessions,
} from "@duna/db";
import { log } from "@duna/observability";
import {
  addCalendarDays,
  wallTimeToInstant,
  weekdayOfDate,
} from "@duna/scheduling";
import { and, eq, gt, gte, lt, or } from "drizzle-orm";
import { stableHash } from "../../canonical";
import type { Transaction } from "./court-situation";
import { requireDatabase, ScheduleError, type ScheduleCaller } from "./shared";

type Scope = "this" | "this-occurrence" | "this-and-following" | "all";

const closedModes = ["blocked", "maintenance"] as const;

interface LoadedBlock {
  readonly kind: "one-off" | "weekly";
  readonly id: string;
  readonly resourceType: "court" | "coach";
  readonly resourceId: string;
  readonly timeZone: string;
  readonly mode: string;
  readonly reason?: string;
  readonly startsAt?: Date;
  readonly endsAt?: Date;
  readonly createdAt: Date;
  readonly weekly?: typeof scheduleBlocks.$inferSelect;
}

async function loadBlock(
  tx: Transaction,
  organizationId: string,
  id: string,
  lock: boolean,
): Promise<LoadedBlock> {
  const overrideQuery = tx
    .select({ override: scheduleOverrides, schedule: schedules })
    .from(scheduleOverrides)
    .innerJoin(schedules, eq(scheduleOverrides.scheduleId, schedules.id))
    .where(
      and(
        eq(scheduleOverrides.id, id),
        eq(schedules.organizationId, organizationId),
      ),
    )
    .limit(1);
  const [override] = lock
    ? await overrideQuery.for("update")
    : await overrideQuery;
  if (override) {
    if (!(closedModes as readonly string[]).includes(override.override.mode)) {
      throw new ScheduleError(
        "BAD_REQUEST",
        "That is extra opening time, not a block. Change it in Club setup.",
      );
    }
    return {
      kind: "one-off",
      id,
      resourceType:
        override.schedule.resourceType === "coach" ? "coach" : "court",
      resourceId: override.schedule.resourceId,
      timeZone: override.schedule.timezone,
      mode: override.override.mode,
      reason: override.override.reason,
      startsAt: override.override.startsAt,
      endsAt: override.override.endsAt,
      createdAt: override.override.createdAt,
    };
  }
  const blockQuery = tx
    .select({ block: scheduleBlocks, schedule: schedules })
    .from(scheduleBlocks)
    .innerJoin(schedules, eq(scheduleBlocks.scheduleId, schedules.id))
    .where(
      and(
        eq(scheduleBlocks.id, id),
        eq(schedules.organizationId, organizationId),
      ),
    )
    .limit(1);
  const [weekly] = lock ? await blockQuery.for("update") : await blockQuery;
  if (!weekly) throw new ScheduleError("NOT_FOUND", "Block was not found.");
  if (!(closedModes as readonly string[]).includes(weekly.block.mode)) {
    throw new ScheduleError(
      "BAD_REQUEST",
      "Those are opening hours, not a block. Change them in Club setup.",
    );
  }
  return {
    kind: "weekly",
    id,
    resourceType: weekly.schedule.resourceType === "coach" ? "coach" : "court",
    resourceId: weekly.schedule.resourceId,
    timeZone: weekly.schedule.timezone,
    mode: weekly.block.mode,
    createdAt: weekly.block.createdAt,
    weekly: weekly.block,
  };
}

/** Sessions and bookings cancelled under a one-off closure, after it was made. */
async function cancelledUnder(tx: Transaction, block: LoadedBlock) {
  if (block.kind !== "one-off" || !block.startsAt || !block.endsAt) return [];
  const overlapping = (table: typeof sessions | typeof courtBookings) =>
    and(lt(table.startsAt, block.endsAt!), gt(table.endsAt, block.startsAt!));
  const [sessionRows, bookingRows] = await Promise.all([
    tx
      .select({
        id: sessions.id,
        title: sessions.title,
        startsAt: sessions.startsAt,
      })
      .from(sessions)
      .where(
        and(
          block.resourceType === "court"
            ? eq(sessions.courtId, block.resourceId)
            : eq(sessions.coachPersonId, block.resourceId),
          eq(sessions.status, "cancelled"),
          gte(sessions.updatedAt, block.createdAt),
          overlapping(sessions),
        ),
      ),
    block.resourceType === "court"
      ? tx
          .select({ id: courtBookings.id, startsAt: courtBookings.startsAt })
          .from(courtBookings)
          .where(
            and(
              eq(courtBookings.courtId, block.resourceId),
              or(
                eq(courtBookings.status, "cancelled"),
                eq(courtBookings.status, "refunded"),
              ),
              gte(courtBookings.updatedAt, block.createdAt),
              overlapping(courtBookings),
            ),
          )
      : Promise.resolve([] as { id: string; startsAt: Date }[]),
  ]);
  return [
    ...sessionRows.map((row) => ({
      id: row.id,
      kind: "session" as const,
      title: row.title,
      startsAt: row.startsAt.toISOString(),
    })),
    ...bookingRows.map((row) => ({
      id: row.id,
      kind: "booking" as const,
      title: "Court booking",
      startsAt: row.startsAt.toISOString(),
    })),
  ].sort((left, right) => left.startsAt.localeCompare(right.startsAt));
}

function assertScope(block: LoadedBlock, scope: Scope, date?: string): void {
  if (block.kind === "one-off") {
    if (scope !== "this" && scope !== "all") {
      throw new ScheduleError(
        "BAD_REQUEST",
        "This block happens once; remove it as a whole.",
      );
    }
    return;
  }
  if (scope === "this") {
    throw new ScheduleError(
      "BAD_REQUEST",
      "This block repeats weekly: remove this date, this and following dates, or all of them.",
    );
  }
  if (scope === "all") return;
  const weekly = block.weekly!;
  if (!date) {
    throw new ScheduleError("BAD_REQUEST", "Choose the date to remove from.");
  }
  if (
    weekdayOfDate(date) !== weekly.weekday ||
    (weekly.effectiveFrom && date < weekly.effectiveFrom) ||
    (weekly.effectiveTo && date > weekly.effectiveTo)
  ) {
    throw new ScheduleError(
      "BAD_REQUEST",
      "That date is not one of this block's dates.",
    );
  }
}

export async function previewRemoveCalendarBlock(
  caller: ScheduleCaller,
  input: { readonly id: string; readonly date?: string; readonly scope: Scope },
) {
  requireDatabase();
  return getTransactionalDatabase().transaction(async (tx) => {
    const block = await loadBlock(tx, caller.organizationId, input.id, false);
    assertScope(block, input.scope, input.date);
    const occurrence =
      block.kind === "weekly" && input.date
        ? {
            startsAt: new Date(
              wallTimeToInstant(
                input.date,
                block.weekly!.startsAtMinute,
                block.timeZone,
              ),
            ),
            endsAt: new Date(
              wallTimeToInstant(
                input.date,
                block.weekly!.endsAtMinute,
                block.timeZone,
              ),
            ),
          }
        : undefined;
    const startsAt = block.startsAt ?? occurrence?.startsAt;
    const endsAt = block.endsAt ?? occurrence?.endsAt;
    return {
      id: block.id,
      kind: block.kind,
      scope: input.scope,
      resourceType: block.resourceType,
      resourceId: block.resourceId,
      ...(block.reason ? { reason: block.reason } : {}),
      ...(startsAt ? { startsAt: startsAt.toISOString() } : {}),
      ...(endsAt ? { endsAt: endsAt.toISOString() } : {}),
      cancelledUnder: await cancelledUnder(tx, block),
    };
  });
}

export async function removeCalendarBlock(
  caller: ScheduleCaller,
  input: {
    readonly id: string;
    readonly reason: string;
    readonly date?: string;
    readonly scope: Scope;
    readonly acknowledgeCancelled?: boolean;
    readonly idempotencyKey: string;
  },
) {
  requireDatabase();
  const result = await getTransactionalDatabase().transaction(async (tx) => {
    const block = await loadBlock(tx, caller.organizationId, input.id, true);
    assertScope(block, input.scope, input.date);
    const cancelled = await cancelledUnder(tx, block);
    if (cancelled.length > 0 && input.acknowledgeCancelled !== true) {
      throw new ScheduleError(
        "PRECONDITION_FAILED",
        `${cancelled.length} ${cancelled.length === 1 ? "session or booking was" : "sessions or bookings were"} cancelled under this closure. Removing it does not bring them back; acknowledge that to remove it. Nothing was removed.`,
      );
    }
    let removed = true;
    if (block.kind === "one-off" || input.scope === "all") {
      if (block.kind === "one-off") {
        await tx
          .delete(scheduleOverrides)
          .where(eq(scheduleOverrides.id, block.id));
      } else {
        await tx.delete(scheduleBlocks).where(eq(scheduleBlocks.id, block.id));
      }
    } else {
      const weekly = block.weekly!;
      const date = input.date!;
      const before = addCalendarDays(date, -1);
      const after = addCalendarDays(date, 1);
      const hasEarlier =
        !weekly.effectiveFrom || before >= weekly.effectiveFrom;
      if (input.scope === "this-and-following") {
        if (hasEarlier) {
          await tx
            .update(scheduleBlocks)
            .set({ effectiveTo: before })
            .where(eq(scheduleBlocks.id, block.id));
        } else {
          await tx
            .delete(scheduleBlocks)
            .where(eq(scheduleBlocks.id, block.id));
        }
      } else {
        // This date only: keep the dates before and after it.
        const hasLater = !weekly.effectiveTo || after <= weekly.effectiveTo;
        if (hasEarlier) {
          await tx
            .update(scheduleBlocks)
            .set({ effectiveTo: before })
            .where(eq(scheduleBlocks.id, block.id));
        } else {
          await tx
            .delete(scheduleBlocks)
            .where(eq(scheduleBlocks.id, block.id));
        }
        if (hasLater) {
          await tx.insert(scheduleBlocks).values({
            scheduleId: weekly.scheduleId,
            weekday: weekly.weekday,
            startsAtMinute: weekly.startsAtMinute,
            endsAtMinute: weekly.endsAtMinute,
            mode: weekly.mode,
            effectiveFrom: after,
            effectiveTo: weekly.effectiveTo,
          });
        }
      }
      removed = true;
    }
    await tx.insert(auditLog).values({
      organizationId: caller.organizationId,
      actorPersonId: caller.actor.personId,
      actorType: "person",
      action: "calendar.block-removed",
      entityType:
        block.kind === "one-off" ? "schedule-override" : "schedule-block",
      entityId: block.id,
      beforeHash: stableHash({
        resourceType: block.resourceType,
        resourceId: block.resourceId,
        startsAt: block.startsAt ?? null,
        endsAt: block.endsAt ?? null,
        weekly: block.weekly ?? null,
      }),
      afterHash: stableHash({
        scope: input.scope,
        date: input.date ?? null,
        cancelledUnder: cancelled.length,
      }),
      reason: input.reason,
      traceId: caller.requestId,
      ipAddress: caller.ipAddress,
      createdAt: caller.now,
    });
    return { block, removed, cancelled: cancelled.length };
  });
  log.info("schedule.block.removed", {
    blockId: result.block.id,
    kind: result.block.kind,
    scope: input.scope,
    cancelledUnder: result.cancelled,
  });
  return {
    id: result.block.id,
    removed: result.removed,
    scope: input.scope,
    stillCancelled: result.cancelled,
  };
}
