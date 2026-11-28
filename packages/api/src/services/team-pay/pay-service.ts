/**
 * Team pay (B3b): compensation, income goals, pay periods, pay runs and
 * exports behind `operator.teamPay.*`. Duna computes and exports; it pays
 * nobody here (contractor payouts are B3c, off) and computes no tax.
 *
 * Who: every write needs `payments:write` (the router; owners today).
 * Reading one member's compensation: that member, a manager
 * (`members:write`) or anyone with `payments:read`. Reading pay runs: a
 * manager or `payments:read`.
 *
 * Pay run: draft → computing → ready-for-approval → approved → exported;
 * draft | ready-for-approval → cancelled. Recomputing makes a new revision
 * and cancels earlier unapproved revisions. An approved run is immutable;
 * corrections are a new revision of the same period that pays only what is
 * new (an adjustment run).
 */
import {
  auditLog,
  getDatabase,
  getTransactionalDatabase,
  operatorEarningsGoals,
  organizationStaffProfiles,
  people,
  staffCompensation,
  staffConnectedAccounts,
  staffPayExports,
  staffPayPeriods,
  staffPayRunLines,
  staffPayRuns,
} from "@duna/db";
import { log, markExpected } from "@duna/observability";
import { TRPCError } from "@trpc/server";
import { createHash } from "node:crypto";
import { and, desc, eq, gte, inArray, lte, max, ne } from "drizzle-orm";
import type { z } from "zod";
import { stableHash } from "../../canonical";
import type { w3CurrencySchema } from "../../contracts/w3-common";
import type { ApiActor } from "../../context";
import type {
  teamPayAdjustLineInputSchema,
  teamPayApproveRunInputSchema,
  teamPayComputeRunInputSchema,
  teamPayCreatePeriodInputSchema,
  teamPayExportRunInputSchema,
  teamPayRunsInputSchema,
  teamPaySetCompensationInputSchema,
  teamPaySetIncomeGoalInputSchema,
} from "../../contracts/team-pay";
import {
  isR2VideoConfigured,
  presignR2AttachmentDownload,
  storePrivateR2Response,
} from "../../video-providers";
import {
  type CompensationInput,
  type PayFrequency,
  type SalaryPay,
  type SessionPay,
  computePayRun as computeLines,
  paidKey,
  periodEndsOn,
} from "./compute";
import {
  type PayStaffRow,
  loadCompensation,
  loadDeliveredSessions,
  loadOrganization,
  loadPayStaff,
  toCompensationInput,
} from "./data";
import { type ExportLine, payrollCsv } from "./export-file";

export interface PayContext {
  readonly actor: ApiActor;
  readonly organizationId: string;
  readonly requestId: string;
  readonly now: Date;
  readonly ipAddress?: string;
}

type Transaction = Parameters<
  Parameters<ReturnType<typeof getTransactionalDatabase>["transaction"]>[0]
>[0];

const APPROVED_STATUSES = [
  "approved",
  "exported",
  "paying",
  "paid",
  "partially-paid",
];
const OPEN_RUN_STATUSES = ["draft", "computing", "ready-for-approval"];

function fail(code: TRPCError["code"], message: string): never {
  throw new TRPCError({ code, message });
}

function hasScope(actor: ApiActor, scope: string): boolean {
  return actor.scopes.includes("*") || actor.scopes.includes(scope);
}

function canSeePay(actor: ApiActor): boolean {
  return (
    hasScope(actor, "members:write") ||
    hasScope(actor, "payments:read") ||
    hasScope(actor, "payments:write")
  );
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0]!.toUpperCase())
      .join("")
      .slice(0, 2) || "?"
  );
}

function staffRef(row: PayStaffRow) {
  return {
    personId: row.personId,
    displayName: row.displayName,
    initials: initials(row.displayName),
    ...(row.avatarUrl ? { avatarUrl: row.avatarUrl } : {}),
    staffProfileId: row.id,
  };
}

type Currency = z.infer<typeof w3CurrencySchema>;

function money(amountMinor: number, currency: string) {
  return { amountMinor, currency: currency.toUpperCase() as Currency };
}

async function audit(
  executor: Transaction | ReturnType<typeof getDatabase>,
  context: PayContext,
  entry: {
    action: string;
    entityType: string;
    entityId: string;
    before?: unknown;
    after?: unknown;
    reason: string;
  },
) {
  await (executor as Transaction).insert(auditLog).values({
    organizationId: context.organizationId,
    actorPersonId: context.actor.personId,
    actorType: "person",
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    beforeHash: entry.before === undefined ? null : stableHash(entry.before),
    afterHash: entry.after === undefined ? null : stableHash(entry.after),
    reason: entry.reason,
    traceId: context.requestId,
    ipAddress: context.ipAddress ?? null,
    createdAt: context.now,
  });
}

function addDays(date: string, days: number): string {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

/** Local midnight of a date in a zone, as an instant. */
function localMidnight(date: string, timezone: string): Date {
  const guess = new Date(`${date}T00:00:00.000Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(guess);
  const value = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(
    value("year"),
    value("month") - 1,
    value("day"),
    value("hour") % 24,
    value("minute"),
  );
  const offset = asUtc - guess.getTime();
  return new Date(guess.getTime() - offset);
}

// ---------------------------------------------------------------- compensation

function compensationOut(row: typeof staffCompensation.$inferSelect) {
  const currency = row.currency;
  return {
    id: row.id,
    staffProfileId: row.staffProfileId,
    model: row.model as CompensationInput["model"],
    classification: row.classification as CompensationInput["classification"],
    effectiveFrom: row.effectiveFrom,
    ...(row.effectiveTo ? { effectiveTo: row.effectiveTo } : {}),
    ...(row.hourlyRateMinor !== null
      ? { hourlyRate: money(row.hourlyRateMinor, currency) }
      : {}),
    ...(row.perSessionRateMinor !== null
      ? { perSessionRate: money(row.perSessionRateMinor, currency) }
      : {}),
    ...(row.annualSalaryMinor !== null
      ? { annualSalary: money(row.annualSalaryMinor, currency) }
      : {}),
    ...(row.revenueShareBps !== null
      ? { revenueShareBps: row.revenueShareBps }
      : {}),
    revenueShareScope: row.revenueShareScope,
  };
}

async function staffOrThrow(context: PayContext, staffProfileId: string) {
  const [row] = await loadPayStaff(context.organizationId, [staffProfileId]);
  if (!row)
    fail("NOT_FOUND", "This team member is not part of the organisation.");
  return row;
}

/** Same windows as Pro's earnings goal (UTC weeks start Monday). */
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

/** What the member's delivered sessions earned in a window (projected pay). */
async function earnedBetween(
  context: PayContext,
  staff: PayStaffRow,
  startsAt: Date,
  endsAt: Date,
): Promise<number> {
  const organization = await loadOrganization(context.organizationId);
  const models = (
    await loadCompensation(context.organizationId, [staff.id])
  ).map(toCompensationInput);
  if (models.length === 0) return 0;
  const sessions = await loadDeliveredSessions({
    organizationId: context.organizationId,
    staff: [staff],
    startsAt,
    endsAt,
    timezone: organization.timezone,
    now: context.now,
  });
  const startsOn = startsAt.toISOString().slice(0, 10);
  const endsOn = addDays(endsAt.toISOString().slice(0, 10), -1);
  // Salary is counted by elapsed days of the goal window, as a monthly share.
  const elapsedEnd = context.now < endsAt ? context.now : endsAt;
  const result = computeLines(
    { frequency: "monthly", startsOn, endsOn, currency: organization.currency },
    [{ staffProfileId: staff.id, payoutReady: false }],
    sessions,
    models.filter((model) => model.model !== "salary"),
  );
  const salaryModels = models.filter((model) => model.model === "salary");
  let salary = 0;
  for (const model of salaryModels) {
    const from = Math.max(
      Date.parse(`${model.effectiveFrom}T00:00:00Z`),
      startsAt.getTime(),
    );
    const to = Math.min(
      model.effectiveTo
        ? Date.parse(`${addDays(model.effectiveTo, 1)}T00:00:00Z`)
        : Infinity,
      elapsedEnd.getTime(),
    );
    if (to > from) {
      salary += Math.round(
        ((model.annualSalaryMinor ?? 0) * (to - from)) / (365 * 86_400_000),
      );
    }
  }
  return (result.lines[0]?.earningsMinor ?? 0) + salary;
}

export async function staffCompensationPage(
  context: PayContext,
  staffProfileId: string,
) {
  const staff = await staffOrThrow(context, staffProfileId);
  if (staff.personId !== context.actor.personId && !canSeePay(context.actor)) {
    fail(
      "FORBIDDEN",
      "Only this team member, a manager or the owner can see their pay.",
    );
  }
  const rows = (
    await loadCompensation(context.organizationId, [staff.id])
  ).sort((left, right) =>
    right.effectiveFrom.localeCompare(left.effectiveFrom),
  );
  const current = rows.find((row) => row.effectiveTo === null);
  const [goal] = await getDatabase()
    .select()
    .from(operatorEarningsGoals)
    .where(
      and(
        eq(operatorEarningsGoals.organizationId, context.organizationId),
        eq(operatorEarningsGoals.personId, staff.personId),
        eq(operatorEarningsGoals.active, true),
      ),
    );
  let goalOut;
  if (goal) {
    // Goals roll forward: the active goal's period follows today's date.
    const bounds = goalBounds(
      goal.period as "week" | "month" | "quarter" | "year",
      context.now,
    );
    const earned = await earnedBetween(
      context,
      staff,
      bounds.startsAt,
      bounds.endsAt,
    );
    goalOut = {
      id: goal.id,
      target: money(goal.targetMinor, goal.currency),
      period: goal.period as "week" | "month" | "quarter" | "year",
      periodStartsAt: bounds.startsAt.toISOString(),
      periodEndsAt: bounds.endsAt.toISOString(),
      earned: money(earned, goal.currency),
      progressPercent: Math.round((earned / goal.targetMinor) * 1000) / 10,
    };
  }
  return {
    staff: staffRef(staff),
    ...(current ? { current: compensationOut(current) } : {}),
    history: rows.filter((row) => row !== current).map(compensationOut),
    ...(goalOut ? { goal: goalOut } : {}),
  };
}

/**
 * Starts a model on `effectiveFrom` and closes the current one the day
 * before. A model may only start after the current one started; a model
 * starting the same day replaces the current one if no pay run used it.
 */
export async function setCompensation(
  context: PayContext,
  input: z.infer<typeof teamPaySetCompensationInputSchema>,
) {
  const staff = await staffOrThrow(context, input.staffProfileId);
  const organization = await loadOrganization(context.organizationId);
  const amounts = [
    input.hourlyRate,
    input.perSessionRate,
    input.annualSalary,
  ].filter(Boolean);
  if (
    amounts.some(
      (amount) => amount!.currency.toUpperCase() !== organization.currency,
    )
  ) {
    fail(
      "BAD_REQUEST",
      `Rates must be in the club's currency (${organization.currency}).`,
    );
  }
  const keep = <T>(value: T | undefined, models: readonly string[]) =>
    models.includes(input.model) ? (value ?? null) : null;
  const values = {
    model: input.model,
    classification: input.classification,
    effectiveFrom: input.effectiveFrom,
    effectiveTo: input.effectiveTo ?? null,
    currency: organization.currency,
    hourlyRateMinor: keep(input.hourlyRate?.amountMinor, [
      "hourly",
      "hourly-plus-share",
    ]),
    perSessionRateMinor: keep(input.perSessionRate?.amountMinor, [
      "per-session",
    ]),
    annualSalaryMinor: keep(input.annualSalary?.amountMinor, ["salary"]),
    revenueShareBps: keep(input.revenueShareBps, [
      "revenue-share",
      "hourly-plus-share",
    ]),
    revenueShareScope: ["revenue-share", "hourly-plus-share"].includes(
      input.model,
    )
      ? [
          ...new Set(
            input.revenueShareScope
              .map((scope) => scope.trim())
              .filter(Boolean),
          ),
        ]
      : [],
    updatedAt: context.now,
  };
  const saved = await getTransactionalDatabase().transaction(
    async (transaction) => {
      const rows = await transaction
        .select()
        .from(staffCompensation)
        .where(eq(staffCompensation.staffProfileId, staff.id));
      if (rows.some((row) => row.effectiveFrom > input.effectiveFrom)) {
        fail(
          "CONFLICT",
          "A later model is already planned. Start this one after it.",
        );
      }
      const current = rows.find((row) => row.effectiveTo === null);
      let row;
      if (current && current.effectiveFrom === input.effectiveFrom) {
        const [used] = await transaction
          .select({ id: staffPayRunLines.id })
          .from(staffPayRunLines)
          .where(eq(staffPayRunLines.compensationId, current.id))
          .limit(1);
        if (used) {
          fail(
            "CONFLICT",
            "A pay run already used this model. Start the change on a later date.",
          );
        }
        [row] = await transaction
          .update(staffCompensation)
          .set(values)
          .where(eq(staffCompensation.id, current.id))
          .returning();
      } else {
        if (current) {
          await transaction
            .update(staffCompensation)
            .set({
              effectiveTo: addDays(input.effectiveFrom, -1),
              updatedAt: context.now,
            })
            .where(eq(staffCompensation.id, current.id));
        }
        [row] = await transaction
          .insert(staffCompensation)
          .values({
            ...values,
            organizationId: context.organizationId,
            staffProfileId: staff.id,
            createdByPersonId: context.actor.personId,
            createdAt: context.now,
          })
          .returning();
      }
      // The profile keeps the current classification (read by invitations).
      await transaction
        .update(organizationStaffProfiles)
        .set({
          workerClassification: input.classification,
          updatedAt: context.now,
        })
        .where(eq(organizationStaffProfiles.id, staff.id));
      await audit(transaction, context, {
        action: "staff-compensation.set",
        entityType: "staff-compensation",
        entityId: row!.id,
        before: current ? compensationOut(current) : undefined,
        after: values,
        reason: "Compensation model set.",
      });
      return row!;
    },
  );
  log.info("team-pay.compensation.set", {
    organizationId: context.organizationId,
    staffProfileId: staff.id,
    model: input.model,
  });
  return compensationOut(saved);
}

export async function setIncomeGoal(
  context: PayContext,
  input: z.infer<typeof teamPaySetIncomeGoalInputSchema>,
) {
  const staff = await staffOrThrow(context, input.staffProfileId);
  const organization = await loadOrganization(context.organizationId);
  if (input.target.amountMinor <= 0)
    fail("BAD_REQUEST", "Set a goal greater than zero.");
  if (input.target.currency.toUpperCase() !== organization.currency) {
    fail(
      "BAD_REQUEST",
      `Goals are in the club's currency (${organization.currency}).`,
    );
  }
  const bounds = goalBounds(input.period, context.now);
  await getTransactionalDatabase().transaction(async (transaction) => {
    await transaction
      .update(operatorEarningsGoals)
      .set({ active: false, updatedAt: context.now })
      .where(
        and(
          eq(operatorEarningsGoals.organizationId, context.organizationId),
          eq(operatorEarningsGoals.personId, staff.personId),
          eq(operatorEarningsGoals.active, true),
        ),
      );
    const [goal] = await transaction
      .insert(operatorEarningsGoals)
      .values({
        organizationId: context.organizationId,
        personId: staff.personId,
        targetMinor: input.target.amountMinor,
        currency: organization.currency,
        period: input.period,
        periodStartsAt: bounds.startsAt,
        periodEndsAt: bounds.endsAt,
        active: true,
        createdAt: context.now,
        updatedAt: context.now,
      })
      .returning({ id: operatorEarningsGoals.id });
    await audit(transaction, context, {
      action: "staff-income-goal.set",
      entityType: "operator-earnings-goal",
      entityId: goal!.id,
      after: { target: input.target.amountMinor, period: input.period },
      reason: "Income goal set.",
    });
  });
  return staffCompensationPage(context, staff.id);
}

// ---------------------------------------------------------------- periods

function periodOut(row: typeof staffPayPeriods.$inferSelect) {
  return {
    id: row.id,
    frequency: row.frequency as
      "weekly" | "every-2-weeks" | "twice-monthly" | "monthly",
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    ...(row.approveBy ? { approveBy: row.approveBy } : {}),
    status: row.status as "open" | "closed",
  };
}

export async function payPeriods(context: PayContext) {
  const rows = await getDatabase()
    .select()
    .from(staffPayPeriods)
    .where(eq(staffPayPeriods.organizationId, context.organizationId))
    .orderBy(desc(staffPayPeriods.startsOn))
    .limit(200);
  return { periods: rows.map(periodOut) };
}

export async function createPayPeriod(
  context: PayContext,
  input: z.infer<typeof teamPayCreatePeriodInputSchema>,
) {
  let endsOn: string;
  try {
    endsOn = periodEndsOn(input.frequency, input.startsOn);
  } catch (error) {
    fail(
      "BAD_REQUEST",
      error instanceof Error ? error.message : "Invalid period.",
    );
  }
  if (input.approveBy && input.approveBy < input.startsOn) {
    fail(
      "BAD_REQUEST",
      "The approval date cannot be before the period starts.",
    );
  }
  const [overlap] = await getDatabase()
    .select({ id: staffPayPeriods.id })
    .from(staffPayPeriods)
    .where(
      and(
        eq(staffPayPeriods.organizationId, context.organizationId),
        lte(staffPayPeriods.startsOn, endsOn),
        gte(staffPayPeriods.endsOn, input.startsOn),
      ),
    )
    .limit(1);
  if (overlap) fail("CONFLICT", "This period overlaps another pay period.");
  const [row] = await getDatabase()
    .insert(staffPayPeriods)
    .values({
      organizationId: context.organizationId,
      frequency: input.frequency,
      startsOn: input.startsOn,
      endsOn,
      approveBy: input.approveBy ?? null,
      status: "open",
      createdAt: context.now,
      updatedAt: context.now,
    })
    .returning();
  log.info("team-pay.period.created", {
    organizationId: context.organizationId,
    payPeriodId: row!.id,
    frequency: input.frequency,
  });
  return periodOut(row!);
}

// ---------------------------------------------------------------- runs

interface LineDetails {
  sessions?: readonly SessionPay[];
  salary?: readonly SalaryPay[];
  adjustments?: readonly { label: string; amountMinor: number }[];
}

async function runsOut(
  context: PayContext,
  runs: (typeof staffPayRuns.$inferSelect)[],
) {
  if (runs.length === 0) return [];
  const database = getDatabase();
  const runIds = runs.map((run) => run.id);
  const [periods, lines, exports, staff] = await Promise.all([
    database
      .select()
      .from(staffPayPeriods)
      .where(
        inArray(staffPayPeriods.id, [
          ...new Set(runs.map((run) => run.payPeriodId)),
        ]),
      ),
    database
      .select()
      .from(staffPayRunLines)
      .where(inArray(staffPayRunLines.payRunId, runIds)),
    database
      .select()
      .from(staffPayExports)
      .where(inArray(staffPayExports.payRunId, runIds)),
    loadPayStaff(context.organizationId),
  ]);
  const personIds = [
    ...new Set([
      ...runs.flatMap((run) =>
        run.approvedByPersonId ? [run.approvedByPersonId] : [],
      ),
      ...exports.map((row) => row.createdByPersonId),
    ]),
  ];
  const peopleRows =
    personIds.length === 0
      ? []
      : await database
          .select({
            id: people.id,
            displayName: people.displayName,
            avatarUrl: people.avatarUrl,
          })
          .from(people)
          .where(inArray(people.id, personIds));
  const personRef = (id: string) => {
    const row = peopleRows.find((candidate) => candidate.id === id);
    return {
      personId: id,
      displayName: row?.displayName ?? "Team member",
      initials: initials(row?.displayName ?? "?"),
      ...(row?.avatarUrl ? { avatarUrl: row.avatarUrl } : {}),
    };
  };
  const staffById = new Map(staff.map((row) => [row.id, row]));
  const accounts =
    staff.length === 0
      ? []
      : await database
          .select({
            personId: staffConnectedAccounts.personId,
            status: staffConnectedAccounts.status,
            payoutsEnabled: staffConnectedAccounts.payoutsEnabled,
          })
          .from(staffConnectedAccounts)
          .where(
            inArray(
              staffConnectedAccounts.personId,
              staff.map((row) => row.personId),
            ),
          );
  const ready = new Set(
    accounts
      .filter((account) => account.status === "ready" && account.payoutsEnabled)
      .map((account) => account.personId),
  );
  return runs.map((run) => {
    const period = periods.find((row) => row.id === run.payPeriodId)!;
    return {
      id: run.id,
      payPeriod: periodOut(period),
      revision: run.revision,
      status: run.status as
        | "draft"
        | "computing"
        | "ready-for-approval"
        | "approved"
        | "exported"
        | "paying"
        | "paid"
        | "partially-paid"
        | "cancelled",
      contractorTotal: money(run.contractorTotalMinor, run.currency),
      employeeTotal: money(run.employeeTotalMinor, run.currency),
      ...(run.computedAt ? { computedAt: run.computedAt.toISOString() } : {}),
      ...(run.approvedAt ? { approvedAt: run.approvedAt.toISOString() } : {}),
      ...(run.approvedByPersonId
        ? { approvedBy: personRef(run.approvedByPersonId) }
        : {}),
      lines: lines
        .filter((line) => line.payRunId === run.id)
        .flatMap((line) => {
          const member = staffById.get(line.staffProfileId);
          if (!member) return [];
          return [lineOut(line, member, ready.has(member.personId))];
        })
        .sort((left, right) =>
          left.staff.displayName.localeCompare(right.staff.displayName),
        ),
      exports: exports
        .filter((row) => row.payRunId === run.id)
        .map((row) => ({
          id: row.id,
          format: row.format as "csv" | "gusto" | "adp" | "quickbooks",
          rowCount: row.rowCount,
          sha256: row.sha256,
          createdAt: row.createdAt.toISOString(),
          createdBy: personRef(row.createdByPersonId),
        })),
    };
  });
}

function lineOut(
  line: typeof staffPayRunLines.$inferSelect,
  member: PayStaffRow,
  payoutReady: boolean,
) {
  const details = line.details as LineDetails;
  return {
    id: line.id,
    staff: staffRef(member),
    classification: line.classification as CompensationInput["classification"],
    compensationModel: lineModel(line),
    method: line.method as "duna-pay" | "export" | "none",
    status: line.status as
      | "computed"
      | "adjusted"
      | "approved"
      | "exported"
      | "paying"
      | "paid"
      | "failed"
      | "excluded",
    sessionsCount: line.sessionsCount,
    minutesWorked: line.minutesWorked,
    earnings: money(line.earningsMinor, line.currency),
    adjustments: (details.adjustments ?? []).map((adjustment) => ({
      label: adjustment.label,
      amount: money(adjustment.amountMinor, line.currency),
    })),
    total: money(line.totalMinor, line.currency),
    payoutReady: line.classification === "1099-contractor" && payoutReady,
  };
}

function lineModel(line: typeof staffPayRunLines.$inferSelect) {
  const details = line.details as LineDetails & {
    model?: CompensationInput["model"];
  };
  return details.model ?? details.sessions?.at(-1)?.model ?? "hourly";
}

async function loadRun(context: PayContext, payRunId: string) {
  const [run] = await getDatabase()
    .select()
    .from(staffPayRuns)
    .where(
      and(
        eq(staffPayRuns.id, payRunId),
        eq(staffPayRuns.organizationId, context.organizationId),
      ),
    );
  if (!run) fail("NOT_FOUND", "This pay run was not found.");
  return run;
}

async function runOut(context: PayContext, payRunId: string) {
  const [out] = await runsOut(context, [await loadRun(context, payRunId)]);
  return out!;
}

function assertCanSeeRuns(context: PayContext) {
  if (!canSeePay(context.actor)) {
    fail("FORBIDDEN", "Only a manager or the owner can see pay runs.");
  }
}

export async function payRuns(
  context: PayContext,
  input: z.infer<typeof teamPayRunsInputSchema>,
) {
  assertCanSeeRuns(context);
  const rows = await getDatabase()
    .select()
    .from(staffPayRuns)
    .where(
      and(
        eq(staffPayRuns.organizationId, context.organizationId),
        input.payPeriodId
          ? eq(staffPayRuns.payPeriodId, input.payPeriodId)
          : undefined,
        input.status && input.status.length > 0
          ? inArray(staffPayRuns.status, input.status)
          : undefined,
      ),
    )
    .orderBy(desc(staffPayRuns.createdAt))
    .limit(100);
  return { runs: await runsOut(context, rows) };
}

export async function payRun(context: PayContext, payRunId: string) {
  assertCanSeeRuns(context);
  return runOut(context, payRunId);
}

async function recomputeTotals(
  transaction: Transaction,
  payRunId: string,
  now: Date,
) {
  const lines = await transaction
    .select()
    .from(staffPayRunLines)
    .where(
      and(
        eq(staffPayRunLines.payRunId, payRunId),
        ne(staffPayRunLines.status, "excluded"),
      ),
    );
  const total = (classification: string) =>
    lines
      .filter((line) => line.classification === classification)
      .reduce((sum, line) => sum + line.totalMinor, 0);
  await transaction
    .update(staffPayRuns)
    .set({
      contractorTotalMinor: total("1099-contractor"),
      employeeTotalMinor: total("w2-employee"),
      updatedAt: now,
    })
    .where(eq(staffPayRuns.id, payRunId));
}

/**
 * Computes a new revision of a period (idempotent by key). Earlier
 * unapproved revisions are cancelled; approved ones stay and their sessions
 * and salary are not paid again, so a run after an approved one is an
 * adjustment run.
 */
export async function computePayRun(
  context: PayContext,
  input: z.infer<typeof teamPayComputeRunInputSchema>,
) {
  const database = getDatabase();
  const [existing] = await database
    .select({ id: staffPayRuns.id, payPeriodId: staffPayRuns.payPeriodId })
    .from(staffPayRuns)
    .where(
      and(
        eq(staffPayRuns.organizationId, context.organizationId),
        eq(staffPayRuns.idempotencyKey, input.idempotencyKey),
      ),
    );
  if (existing) {
    if (existing.payPeriodId !== input.payPeriodId) {
      fail("CONFLICT", "This idempotency key was used for another period.");
    }
    return runOut(context, existing.id);
  }
  const [period] = await database
    .select()
    .from(staffPayPeriods)
    .where(
      and(
        eq(staffPayPeriods.id, input.payPeriodId),
        eq(staffPayPeriods.organizationId, context.organizationId),
      ),
    );
  if (!period) fail("NOT_FOUND", "This pay period was not found.");
  const organization = await loadOrganization(context.organizationId);
  const staff = await loadPayStaff(context.organizationId);
  const compensation = await loadCompensation(context.organizationId);
  const startsAt = localMidnight(period.startsOn, organization.timezone);
  const endsAt = localMidnight(
    addDays(period.endsOn, 1),
    organization.timezone,
  );
  const sessions = await loadDeliveredSessions({
    organizationId: context.organizationId,
    staff,
    startsAt,
    endsAt,
    timezone: organization.timezone,
    now: context.now,
  });
  const approvedRuns = await database
    .select({ id: staffPayRuns.id, payPeriodId: staffPayRuns.payPeriodId })
    .from(staffPayRuns)
    .where(
      and(
        eq(staffPayRuns.organizationId, context.organizationId),
        inArray(staffPayRuns.status, APPROVED_STATUSES),
      ),
    );
  const approvedLines =
    approvedRuns.length === 0
      ? []
      : await database
          .select()
          .from(staffPayRunLines)
          .where(
            and(
              inArray(
                staffPayRunLines.payRunId,
                approvedRuns.map((run) => run.id),
              ),
              ne(staffPayRunLines.status, "excluded"),
            ),
          );
  const alreadyPaidSessionKeys = new Set(
    approvedLines.flatMap((line) =>
      ((line.details as LineDetails).sessions ?? []).map((pay) =>
        paidKey(line.staffProfileId, pay.key),
      ),
    ),
  );
  const samePeriod = new Set(
    approvedRuns
      .filter((run) => run.payPeriodId === period.id)
      .map((run) => run.id),
  );
  const salaryAlreadyPaidStaffIds = new Set(
    approvedLines
      .filter(
        (line) =>
          samePeriod.has(line.payRunId) &&
          ((line.details as LineDetails).salary ?? []).length > 0,
      )
      .map((line) => line.staffProfileId),
  );
  const computation = computeLines(
    {
      frequency: period.frequency as PayFrequency,
      startsOn: period.startsOn,
      endsOn: period.endsOn,
      currency: organization.currency,
    },
    staff.map((row) => ({ staffProfileId: row.id, payoutReady: false })),
    sessions,
    compensation.map(toCompensationInput),
    { alreadyPaidSessionKeys, salaryAlreadyPaidStaffIds },
  );
  const runId = await getTransactionalDatabase().transaction(
    async (transaction) => {
      const [{ revision } = { revision: 0 }] = await transaction
        .select({ revision: max(staffPayRuns.revision) })
        .from(staffPayRuns)
        .where(eq(staffPayRuns.payPeriodId, period.id));
      await transaction
        .update(staffPayRuns)
        .set({ status: "cancelled", updatedAt: context.now })
        .where(
          and(
            eq(staffPayRuns.payPeriodId, period.id),
            inArray(staffPayRuns.status, OPEN_RUN_STATUSES),
          ),
        );
      const [run] = await transaction
        .insert(staffPayRuns)
        .values({
          organizationId: context.organizationId,
          payPeriodId: period.id,
          revision: (revision ?? 0) + 1,
          idempotencyKey: input.idempotencyKey,
          status: "computing",
          currency: organization.currency,
          createdAt: context.now,
          updatedAt: context.now,
        })
        .onConflictDoNothing()
        .returning({ id: staffPayRuns.id });
      if (!run) fail("CONFLICT", "This pay run is already being computed.");
      if (computation.lines.length > 0) {
        await transaction.insert(staffPayRunLines).values(
          computation.lines.map((line) => ({
            organizationId: context.organizationId,
            payRunId: run.id,
            staffProfileId: line.staffProfileId,
            compensationId: line.compensationId,
            classification: line.classification,
            method: line.method,
            status: "computed",
            sessionsCount: line.sessionsCount,
            minutesWorked: line.minutesWorked,
            currency: organization.currency,
            earningsMinor: line.earningsMinor,
            adjustmentsMinor: 0,
            totalMinor: line.earningsMinor,
            details: {
              model: line.compensationModel,
              sessions: line.sessions,
              salary: line.salary,
              adjustments: [],
            } as never,
            createdAt: context.now,
            updatedAt: context.now,
          })),
        );
      }
      await transaction
        .update(staffPayRuns)
        .set({
          status: "ready-for-approval",
          contractorTotalMinor: computation.contractorTotalMinor,
          employeeTotalMinor: computation.employeeTotalMinor,
          computedAt: context.now,
          updatedAt: context.now,
        })
        .where(eq(staffPayRuns.id, run.id));
      if (period.status === "closed") {
        await transaction
          .update(staffPayPeriods)
          .set({ status: "open", updatedAt: context.now })
          .where(eq(staffPayPeriods.id, period.id));
      }
      await audit(transaction, context, {
        action: "staff-pay-run.computed",
        entityType: "staff-pay-run",
        entityId: run.id,
        after: {
          lines: computation.lines.length,
          contractorTotalMinor: computation.contractorTotalMinor,
          employeeTotalMinor: computation.employeeTotalMinor,
        },
        reason: `Computed revision ${(revision ?? 0) + 1} of the pay period ${period.startsOn} to ${period.endsOn}.`,
      });
      return run.id;
    },
  );
  log.info("team-pay.run.computed", {
    organizationId: context.organizationId,
    payRunId: runId,
    lines: computation.lines.length,
    unpaidSessions: computation.unpaidSessions.length,
  });
  return runOut(context, runId);
}

export async function adjustLine(
  context: PayContext,
  input: z.infer<typeof teamPayAdjustLineInputSchema>,
) {
  const [line] = await getDatabase()
    .select()
    .from(staffPayRunLines)
    .where(
      and(
        eq(staffPayRunLines.id, input.lineId),
        eq(staffPayRunLines.organizationId, context.organizationId),
      ),
    );
  if (!line) fail("NOT_FOUND", "This pay line was not found.");
  const run = await loadRun(context, line.payRunId);
  if (run.status !== "ready-for-approval" && run.status !== "draft") {
    fail(
      "CONFLICT",
      `A ${run.status} pay run cannot change. Compute a new revision to correct it.`,
    );
  }
  if (
    input.adjustments.some(
      (adjustment) =>
        adjustment.amount.currency.toUpperCase() !== line.currency,
    )
  ) {
    fail("BAD_REQUEST", `Adjustments must be in ${line.currency}.`);
  }
  if (input.method === "duna-pay") {
    fail(
      "CONFLICT",
      line.classification === "w2-employee"
        ? "Duna never pays a W-2 employee. Export this line for your payroll system."
        : "Paying contractors through Duna Pay is not switched on yet. Export this line.",
    );
  }
  const adjustments = input.adjustments.map((adjustment) => ({
    label: adjustment.label.trim(),
    amountMinor: adjustment.amount.amountMinor,
  }));
  const adjustmentsMinor = adjustments.reduce(
    (sum, adjustment) => sum + adjustment.amountMinor,
    0,
  );
  const totalMinor = line.earningsMinor + adjustmentsMinor;
  if (totalMinor < 0)
    fail("BAD_REQUEST", "Adjustments cannot take a line below zero.");
  const details = line.details as LineDetails;
  const method = input.method ?? line.method;
  await getTransactionalDatabase().transaction(async (transaction) => {
    await transaction
      .update(staffPayRunLines)
      .set({
        adjustmentsMinor,
        totalMinor,
        method,
        status: method === "none" ? "excluded" : "adjusted",
        details: { ...details, adjustments } as never,
        updatedAt: context.now,
      })
      .where(eq(staffPayRunLines.id, line.id));
    await recomputeTotals(transaction, run.id, context.now);
    await audit(transaction, context, {
      action: "staff-pay-line.adjusted",
      entityType: "staff-pay-run-line",
      entityId: line.id,
      before: { adjustments: details.adjustments ?? [], method: line.method },
      after: { adjustments, method },
      reason: "Pay line adjusted.",
    });
  });
  const out = await runOut(context, run.id);
  return out.lines.find((candidate) => candidate.id === line.id)!;
}

export async function approvePayRun(
  context: PayContext,
  input: z.infer<typeof teamPayApproveRunInputSchema>,
) {
  const run = await loadRun(context, input.payRunId);
  if (APPROVED_STATUSES.includes(run.status)) return runOut(context, run.id); // idempotent
  if (run.status !== "ready-for-approval") {
    fail("CONFLICT", `A ${run.status} pay run cannot be approved.`);
  }
  await getTransactionalDatabase().transaction(async (transaction) => {
    const [updated] = await transaction
      .update(staffPayRuns)
      .set({
        status: "approved",
        approvedAt: context.now,
        approvedByPersonId: context.actor.personId,
        updatedAt: context.now,
      })
      .where(
        and(
          eq(staffPayRuns.id, run.id),
          eq(staffPayRuns.status, "ready-for-approval"),
        ),
      )
      .returning({ id: staffPayRuns.id });
    if (!updated)
      fail("CONFLICT", "This pay run changed while you were approving it.");
    await transaction
      .update(staffPayRunLines)
      .set({ status: "approved", updatedAt: context.now })
      .where(
        and(
          eq(staffPayRunLines.payRunId, run.id),
          inArray(staffPayRunLines.status, ["computed", "adjusted"]),
        ),
      );
    await audit(transaction, context, {
      action: "staff-pay-run.approved",
      entityType: "staff-pay-run",
      entityId: run.id,
      after: {
        contractorTotalMinor: run.contractorTotalMinor,
        employeeTotalMinor: run.employeeTotalMinor,
        idempotencyKey: input.idempotencyKey,
      },
      reason: "Pay run approved.",
    });
  });
  log.info("team-pay.run.approved", {
    organizationId: context.organizationId,
    payRunId: run.id,
  });
  return runOut(context, run.id);
}

export async function cancelPayRun(context: PayContext, payRunId: string) {
  const run = await loadRun(context, payRunId);
  if (run.status !== "draft" && run.status !== "ready-for-approval") {
    fail("CONFLICT", `A ${run.status} pay run cannot be cancelled.`);
  }
  await getTransactionalDatabase().transaction(async (transaction) => {
    await transaction
      .update(staffPayRuns)
      .set({ status: "cancelled", updatedAt: context.now })
      .where(eq(staffPayRuns.id, run.id));
    await audit(transaction, context, {
      action: "staff-pay-run.cancelled",
      entityType: "staff-pay-run",
      entityId: run.id,
      reason: "Pay run cancelled.",
    });
  });
  log.info("team-pay.run.cancelled", {
    organizationId: context.organizationId,
    payRunId: run.id,
  });
  return runOut(context, run.id);
}

/** Storage seam (Duna Hosting private files); replaced in tests. */
export interface PayExportStorage {
  configured(): boolean;
  put(input: { key: string; body: string; contentType: string }): Promise<void>;
  signedUrl(input: { key: string; fileName: string }): Promise<string>;
}

export const r2PayExportStorage: PayExportStorage = {
  configured: () => isR2VideoConfigured(),
  put: ({ key, body, contentType }) =>
    storePrivateR2Response({
      objectKey: key,
      response: new Response(body, {
        headers: { "content-length": String(Buffer.byteLength(body, "utf-8")) },
      }),
      contentType,
      metadata: { purpose: "team-pay-export" },
    }),
  signedUrl: async ({ key, fileName }) =>
    (
      await presignR2AttachmentDownload({
        objectKey: key,
        contentType: "text/csv",
        fileName,
        inline: false,
        expiresInSeconds: 15 * 60,
      })
    ).url,
};

let storage: PayExportStorage = r2PayExportStorage;
export function setPayExportStorageForTests(next: PayExportStorage) {
  storage = next;
}

function notConfigured(message: string): never {
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message,
    cause: markExpected(new Error(message), "provider-not-configured"),
  });
}

/**
 * Writes the payroll file for an approved run and marks the run and its
 * lines exported, with who and when (the export row). Lines with method
 * `export` are in the file. Only the generic CSV exists; named payroll
 * layouts answer "not configured" until a club's import template is
 * confirmed.
 */
export async function exportPayRun(
  context: PayContext,
  input: z.infer<typeof teamPayExportRunInputSchema>,
) {
  const run = await loadRun(context, input.payRunId);
  if (run.status !== "approved" && run.status !== "exported") {
    fail("CONFLICT", "Approve the pay run before exporting it.");
  }
  if (input.format !== "csv") {
    notConfigured(
      "This payroll layout is not available yet. Download the CSV and import it into your payroll system.",
    );
  }
  if (!storage.configured()) {
    notConfigured(
      "File storage is not configured yet, so the payroll file cannot be saved.",
    );
  }
  const out = await runOut(context, run.id);
  const staff = await loadPayStaff(context.organizationId);
  const lines = await getDatabase()
    .select()
    .from(staffPayRunLines)
    .where(
      and(
        eq(staffPayRunLines.payRunId, run.id),
        eq(staffPayRunLines.method, "export"),
      ),
    );
  const exportLines: ExportLine[] = lines
    .filter((line) => line.status !== "excluded")
    .flatMap((line) => {
      const member = staff.find((row) => row.id === line.staffProfileId);
      if (!member) return [];
      return [
        {
          staffProfileId: member.id,
          personId: member.personId,
          name: member.displayName,
          classification: line.classification,
          compensationModel: lineModel(line),
          sessionsCount: line.sessionsCount,
          minutesWorked: line.minutesWorked,
          currency: line.currency,
          earningsMinor: line.earningsMinor,
          adjustmentsMinor: line.adjustmentsMinor,
          totalMinor: line.totalMinor,
          adjustments: (line.details as LineDetails).adjustments ?? [],
        },
      ];
    })
    .sort((left, right) => left.name.localeCompare(right.name));
  const csv = payrollCsv({
    payRunId: run.id,
    revision: run.revision,
    periodStart: out.payPeriod.startsOn,
    periodEnd: out.payPeriod.endsOn,
    lines: exportLines,
  });
  const sha256 = createHash("sha256").update(csv).digest("hex");
  const exportId = crypto.randomUUID();
  const key = `team-pay/${context.organizationId}/${run.id}/${exportId}.csv`;
  await storage.put({ key, body: csv, contentType: "text/csv; charset=utf-8" });
  await getTransactionalDatabase().transaction(async (transaction) => {
    await transaction.insert(staffPayExports).values({
      id: exportId,
      organizationId: context.organizationId,
      payRunId: run.id,
      format: input.format,
      storageKey: key,
      sha256,
      rowCount: exportLines.length,
      createdByPersonId: context.actor.personId,
      createdAt: context.now,
    });
    await transaction
      .update(staffPayRuns)
      .set({ status: "exported", updatedAt: context.now })
      .where(eq(staffPayRuns.id, run.id));
    await transaction
      .update(staffPayRunLines)
      .set({ status: "exported", updatedAt: context.now })
      .where(
        and(
          eq(staffPayRunLines.payRunId, run.id),
          eq(staffPayRunLines.method, "export"),
          eq(staffPayRunLines.status, "approved"),
        ),
      );
    // The period closes when its last run is exported.
    const [open] = await transaction
      .select({ id: staffPayRuns.id })
      .from(staffPayRuns)
      .where(
        and(
          eq(staffPayRuns.payPeriodId, run.payPeriodId),
          inArray(staffPayRuns.status, [
            ...OPEN_RUN_STATUSES,
            "approved",
            "paying",
          ]),
          ne(staffPayRuns.id, run.id),
        ),
      )
      .limit(1);
    if (!open) {
      await transaction
        .update(staffPayPeriods)
        .set({ status: "closed", updatedAt: context.now })
        .where(eq(staffPayPeriods.id, run.payPeriodId));
    }
    await audit(transaction, context, {
      action: "staff-pay-run.exported",
      entityType: "staff-pay-run",
      entityId: run.id,
      after: { format: input.format, sha256, rows: exportLines.length },
      reason: "Payroll file exported.",
    });
  });
  log.info("team-pay.run.exported", {
    organizationId: context.organizationId,
    payRunId: run.id,
    rows: exportLines.length,
  });
  return {
    id: exportId,
    payRunId: run.id,
    format: input.format,
    rowCount: exportLines.length,
    sha256,
    downloadUrl: await storage.signedUrl({
      key,
      fileName: `pay-run-${out.payPeriod.startsOn}-r${run.revision}.csv`,
    }),
    createdAt: context.now.toISOString(),
  };
}
