/**
 * The legacy compensation and income-goal columns on
 * `organization_staff_profiles` (compensation_model, hourly_rate_minor,
 * profit_share_bps, income_goal_minor, income_goal_period) and the B3b
 * tables (`staff_compensation`, `operator_earnings_goals`).
 *
 * - `copyLegacyCompensation` is the idempotent data step (audit marker plus
 *   an advisory lock): a set model becomes an effective-dated
 *   `staff_compensation` row from the member's start date, and a legacy goal
 *   becomes the active `operator_earnings_goals` row when there is none.
 *   Models: hourly → hourly, profit-share → revenue-share,
 *   hourly-plus-profit-share → hourly-plus-share. A member whose
 *   classification is "not set" has no row (a model needs one).
 * - Nothing writes those columns any more. The old HQ Team editor reads the
 *   tables in the legacy shape and its changes become a new model from
 *   today (owner only, like every compensation write).
 * - `worker_classification` stays as the current-value column (invitations
 *   write it); `setCompensation` keeps it in sync.
 */
import {
  auditLog,
  getDatabase,
  getTransactionalDatabase,
  operatorEarningsGoals,
  organizationStaffProfiles,
  organizations,
  staffCompensation,
} from "@duna/db";
import { log } from "@duna/observability";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { ApiActor } from "../../context";

export const LEGACY_COMPENSATION_COPIED = "staff-compensation.legacy-copied";

type Transaction = Parameters<
  Parameters<ReturnType<typeof getTransactionalDatabase>["transaction"]>[0]
>[0];
type ProfileRow = typeof organizationStaffProfiles.$inferSelect;

const legacyToModel = {
  hourly: "hourly",
  "profit-share": "revenue-share",
  "hourly-plus-profit-share": "hourly-plus-share",
} as const;
const modelToLegacy: Record<string, LegacyCompensation["compensationModel"]> = {
  hourly: "hourly",
  "revenue-share": "profit-share",
  "hourly-plus-share": "hourly-plus-profit-share",
};

export interface LegacyCompensation {
  readonly workerClassification: "not-set" | "1099-contractor" | "w2-employee";
  readonly compensationModel:
    "not-set" | "hourly" | "profit-share" | "hourly-plus-profit-share";
  readonly hourlyRateMinor?: number;
  readonly profitShareBps?: number;
  readonly incomeGoalMinor?: number;
  readonly incomeGoalPeriod?: "week" | "month" | "quarter" | "year";
}

function classification(
  value: string,
): LegacyCompensation["workerClassification"] {
  return value === "w2-employee" || value === "1099-contractor"
    ? value
    : "not-set";
}

function legacyModel(value: string): LegacyCompensation["compensationModel"] {
  return value === "hourly" ||
    value === "profit-share" ||
    value === "hourly-plus-profit-share"
    ? value
    : "not-set";
}

function goalPeriod(
  value: string | null,
): LegacyCompensation["incomeGoalPeriod"] {
  return value === "week" ||
    value === "month" ||
    value === "quarter" ||
    value === "year"
    ? value
    : undefined;
}

function goalBounds(period: "week" | "month" | "quarter" | "year", now: Date) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  if (period === "week") {
    const startsAt = new Date(Date.UTC(year, month, now.getUTCDate()));
    const weekday = startsAt.getUTCDay() || 7;
    startsAt.setUTCDate(startsAt.getUTCDate() - weekday + 1);
    return { startsAt, endsAt: new Date(startsAt.getTime() + 7 * 86_400_000) };
  }
  if (period === "month") {
    return {
      startsAt: new Date(Date.UTC(year, month, 1)),
      endsAt: new Date(Date.UTC(year, month + 1, 1)),
    };
  }
  if (period === "quarter") {
    const first = Math.floor(month / 3) * 3;
    return {
      startsAt: new Date(Date.UTC(year, first, 1)),
      endsAt: new Date(Date.UTC(year, first + 3, 1)),
    };
  }
  return {
    startsAt: new Date(Date.UTC(year, 0, 1)),
    endsAt: new Date(Date.UTC(year + 1, 0, 1)),
  };
}

/** Copies one member's legacy compensation and goal, once. */
export async function copyLegacyCompensation(
  transaction: Transaction,
  input: {
    readonly profile: ProfileRow;
    readonly currency: string;
    readonly now: Date;
    readonly actorPersonId?: string;
  },
): Promise<boolean> {
  const { profile } = input;
  await transaction.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`staff-compensation:${profile.id}`}))`,
  );
  const [marker] = await transaction
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.entityType, "staff-profile"),
        eq(auditLog.entityId, profile.id),
        eq(auditLog.action, LEGACY_COMPENSATION_COPIED),
      ),
    )
    .limit(1);
  if (marker) return false;
  const model = legacyModel(profile.compensationModel);
  const kind = classification(profile.workerClassification);
  let copiedModel = false;
  const [existing] = await transaction
    .select({ id: staffCompensation.id })
    .from(staffCompensation)
    .where(eq(staffCompensation.staffProfileId, profile.id))
    .limit(1);
  if (!existing && model !== "not-set" && kind !== "not-set") {
    const mapped = legacyToModel[model];
    const needsHourly = mapped !== "revenue-share";
    const needsShare = mapped !== "hourly";
    if (
      (!needsHourly || profile.hourlyRateMinor !== null) &&
      (!needsShare || profile.profitShareBps !== null)
    ) {
      await transaction.insert(staffCompensation).values({
        organizationId: profile.organizationId,
        staffProfileId: profile.id,
        model: mapped,
        classification: kind,
        effectiveFrom:
          profile.startedAt ?? profile.createdAt.toISOString().slice(0, 10),
        currency: (profile.currency || input.currency).toUpperCase(),
        hourlyRateMinor: needsHourly ? profile.hourlyRateMinor : null,
        revenueShareBps: needsShare ? profile.profitShareBps : null,
        createdByPersonId: input.actorPersonId ?? null,
        createdAt: input.now,
        updatedAt: input.now,
      });
      copiedModel = true;
    }
  }
  let copiedGoal = false;
  const period = goalPeriod(profile.incomeGoalPeriod);
  if (profile.incomeGoalMinor && profile.incomeGoalMinor > 0 && period) {
    const [active] = await transaction
      .select({ id: operatorEarningsGoals.id })
      .from(operatorEarningsGoals)
      .where(
        and(
          eq(operatorEarningsGoals.organizationId, profile.organizationId),
          eq(operatorEarningsGoals.personId, profile.personId),
          eq(operatorEarningsGoals.active, true),
        ),
      );
    if (!active) {
      const bounds = goalBounds(period, input.now);
      await transaction.insert(operatorEarningsGoals).values({
        organizationId: profile.organizationId,
        personId: profile.personId,
        targetMinor: profile.incomeGoalMinor,
        currency: (profile.currency || input.currency).toUpperCase(),
        period,
        periodStartsAt: bounds.startsAt,
        periodEndsAt: bounds.endsAt,
        active: true,
        createdAt: input.now,
        updatedAt: input.now,
      });
      copiedGoal = true;
    }
  }
  await transaction.insert(auditLog).values({
    organizationId: profile.organizationId,
    actorPersonId: input.actorPersonId ?? null,
    actorType: input.actorPersonId ? "person" : "system",
    action: LEGACY_COMPENSATION_COPIED,
    entityType: "staff-profile",
    entityId: profile.id,
    reason: `Copied legacy compensation (model: ${copiedModel ? "yes" : "no"}, goal: ${copiedGoal ? "yes" : "no"}).`,
    createdAt: input.now,
  });
  log.info("team-pay.legacy.copied", {
    organizationId: profile.organizationId,
    staffProfileId: profile.id,
    model: copiedModel,
    goal: copiedGoal,
  });
  return true;
}

/** The data step over every member with legacy compensation or a goal. */
export async function migrateLegacyStaffCompensation(input: {
  readonly organizationId?: string;
  readonly now?: Date;
}): Promise<{ copied: number; alreadyCopied: number }> {
  const now = input.now ?? new Date();
  const rows = await getDatabase()
    .select({
      profile: organizationStaffProfiles,
      currency: organizations.currency,
    })
    .from(organizationStaffProfiles)
    .innerJoin(
      organizations,
      eq(organizations.id, organizationStaffProfiles.organizationId),
    )
    .where(
      and(
        or(
          sql`${organizationStaffProfiles.compensationModel} <> 'not-set'`,
          sql`${organizationStaffProfiles.incomeGoalMinor} IS NOT NULL`,
        ),
        input.organizationId
          ? eq(organizationStaffProfiles.organizationId, input.organizationId)
          : undefined,
      ),
    );
  let copied = 0;
  let alreadyCopied = 0;
  for (const row of rows) {
    const done = await getTransactionalDatabase().transaction((transaction) =>
      copyLegacyCompensation(transaction, {
        profile: row.profile,
        currency: row.currency,
        now,
      }),
    );
    if (done) copied += 1;
    else alreadyCopied += 1;
  }
  log.info("team-pay.legacy.migrated", {
    organizationId: input.organizationId ?? "all",
    copied,
    alreadyCopied,
  });
  return { copied, alreadyCopied };
}

/** The tables in the legacy shape (the HQ workspace still reads it). */
export async function legacyCompensationView(
  organizationId: string,
  profiles: readonly ProfileRow[],
): Promise<Map<string, LegacyCompensation>> {
  const view = new Map<string, LegacyCompensation>();
  if (profiles.length === 0) return view;
  const database = getDatabase();
  const [current, goals, markers] = await Promise.all([
    database
      .select()
      .from(staffCompensation)
      .where(
        and(
          inArray(
            staffCompensation.staffProfileId,
            profiles.map((profile) => profile.id),
          ),
          isNull(staffCompensation.effectiveTo),
        ),
      ),
    database
      .select()
      .from(operatorEarningsGoals)
      .where(
        and(
          eq(operatorEarningsGoals.organizationId, organizationId),
          inArray(
            operatorEarningsGoals.personId,
            profiles.map((profile) => profile.personId),
          ),
          eq(operatorEarningsGoals.active, true),
        ),
      ),
    database
      .select({ entityId: auditLog.entityId })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.entityType, "staff-profile"),
          eq(auditLog.action, LEGACY_COMPENSATION_COPIED),
          inArray(
            auditLog.entityId,
            profiles.map((profile) => profile.id),
          ),
        ),
      ),
  ]);
  const copied = new Set(markers.map((row) => row.entityId));
  for (const profile of profiles) {
    const model = current.find((row) => row.staffProfileId === profile.id);
    const goal = goals.find((row) => row.personId === profile.personId);
    if (!model && !goal && !copied.has(profile.id)) {
      // Not copied yet: the legacy columns are still the truth.
      view.set(profile.id, {
        workerClassification: classification(profile.workerClassification),
        compensationModel: legacyModel(profile.compensationModel),
        ...(profile.hourlyRateMinor !== null
          ? { hourlyRateMinor: profile.hourlyRateMinor }
          : {}),
        ...(profile.profitShareBps !== null
          ? { profitShareBps: profile.profitShareBps }
          : {}),
        ...(profile.incomeGoalMinor !== null
          ? { incomeGoalMinor: profile.incomeGoalMinor }
          : {}),
        ...(goalPeriod(profile.incomeGoalPeriod)
          ? { incomeGoalPeriod: goalPeriod(profile.incomeGoalPeriod) }
          : {}),
      });
      continue;
    }
    view.set(profile.id, {
      workerClassification: model
        ? classification(model.classification)
        : classification(profile.workerClassification),
      compensationModel: model
        ? (modelToLegacy[model.model] ?? "not-set")
        : "not-set",
      ...(model?.hourlyRateMinor != null
        ? { hourlyRateMinor: model.hourlyRateMinor }
        : {}),
      ...(model?.revenueShareBps != null
        ? { profitShareBps: model.revenueShareBps }
        : {}),
      ...(goal ? { incomeGoalMinor: goal.targetMinor } : {}),
      ...(goal ? { incomeGoalPeriod: goalPeriod(goal.period) } : {}),
    });
  }
  return view;
}

/**
 * What the old editor sent, compared with the tables. Returns the changes
 * to apply (or nothing). "Not set" never clears a model: models the old
 * editor cannot show (per session, salary) look "not set" to it.
 */
export function legacyEditorChanges(
  current: LegacyCompensation,
  sent: LegacyCompensation,
): {
  readonly model?: {
    readonly model: "hourly" | "revenue-share" | "hourly-plus-share";
    readonly classification: "1099-contractor" | "w2-employee";
    readonly hourlyRateMinor?: number;
    readonly revenueShareBps?: number;
  };
  readonly goal?: {
    readonly targetMinor: number;
    readonly period: "week" | "month" | "quarter" | "year";
  };
} {
  const changes: {
    model?: {
      model: "hourly" | "revenue-share" | "hourly-plus-share";
      classification: "1099-contractor" | "w2-employee";
      hourlyRateMinor?: number;
      revenueShareBps?: number;
    };
    goal?: {
      targetMinor: number;
      period: "week" | "month" | "quarter" | "year";
    };
  } = {};
  if (
    sent.compensationModel !== "not-set" &&
    sent.workerClassification !== "not-set" &&
    (sent.compensationModel !== current.compensationModel ||
      sent.workerClassification !== current.workerClassification ||
      (sent.compensationModel !== "profit-share" &&
        sent.hourlyRateMinor !== current.hourlyRateMinor) ||
      (sent.compensationModel !== "hourly" &&
        sent.profitShareBps !== current.profitShareBps))
  ) {
    const model = legacyToModel[sent.compensationModel];
    changes.model = {
      model,
      classification: sent.workerClassification,
      ...(model !== "revenue-share" && sent.hourlyRateMinor !== undefined
        ? { hourlyRateMinor: sent.hourlyRateMinor }
        : {}),
      ...(model !== "hourly" && sent.profitShareBps !== undefined
        ? { revenueShareBps: sent.profitShareBps }
        : {}),
    };
  }
  if (
    sent.incomeGoalMinor !== undefined &&
    sent.incomeGoalMinor > 0 &&
    (sent.incomeGoalMinor !== current.incomeGoalMinor ||
      (sent.incomeGoalPeriod ?? "month") !==
        (current.incomeGoalPeriod ?? "month"))
  ) {
    changes.goal = {
      targetMinor: sent.incomeGoalMinor,
      period: sent.incomeGoalPeriod ?? "month",
    };
  }
  return changes;
}

export function canWriteMoney(actor: ApiActor): boolean {
  return actor.scopes.includes("*") || actor.scopes.includes("payments:write");
}
