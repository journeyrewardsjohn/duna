/**
 * Practice plans (B4): the club's plans, one plan with its blocks and
 * totals, saving a new immutable version, and a proposal to start from.
 *
 * Every save is a new `training_practice_plan_versions` row with its own
 * blocks; sessions keep the version they were given. Blocks pin a drill
 * version: naming only a drill pins its current version. Totals are
 * computed on read (never trusted from the client) and the plan row keeps
 * the duration and load for lists.
 */
import {
  getDatabase,
  getTransactionalDatabase,
  trainingDrillScenes,
  trainingDrillVersions,
  trainingDrills,
  trainingEvents,
  trainingPracticePlanBlocks,
  trainingPracticePlanVersions,
  trainingPracticePlans,
  trainingProgramWeeks,
} from "@duna/db";
import { log } from "@duna/observability";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import type { z } from "zod";
import type {
  trainingProgramsPlanAssumptionsSchema,
  trainingProgramsPracticePlanSchema,
  trainingProgramsPracticePlanSummarySchema,
  trainingProgramsProposePracticePlanInputSchema,
  trainingProgramsSavePracticePlanInputSchema,
} from "../../contracts/training-programs";
import { executeIdempotent } from "../../idempotency";
import {
  pinDrillVersions,
  visibleDrillCondition,
} from "../training-drills/access";
import {
  BLOCK_KINDS,
  type BlockKind,
  blockLoad,
  checkTimeline,
  planTotals,
  proposeBlocks,
  timelineMinutes,
} from "./plan-timeline";
import { daysBetween } from "./schedule";
import { loadEvent } from "./sessions-service";
import {
  assertContentReader,
  audit,
  badRequest,
  conflict,
  forbidden,
  hasScope,
  isoDate,
  isTrainingManager,
  notFound,
  slugify,
  type TrainingContext,
} from "./shared";

type PlanRow = typeof trainingPracticePlans.$inferSelect;
type BlockRow = typeof trainingPracticePlanBlocks.$inferSelect;
type Plan = z.infer<typeof trainingProgramsPracticePlanSchema>;
type Summary = z.infer<typeof trainingProgramsPracticePlanSummarySchema>;
type Assumptions = z.infer<typeof trainingProgramsPlanAssumptionsSchema>;

export const PLAN_LIST_LIMIT = 200;

function kindOf(value: string): BlockKind {
  return (BLOCK_KINDS as readonly string[]).includes(value)
    ? (value as BlockKind)
    : value === "cooldown"
      ? "cool-down"
      : "custom";
}

/** Legacy plans stored `{}`: fall back to what the plan itself says. */
export function assumptionsOf(
  row: Pick<PlanRow, "assumptions" | "targetLoad">,
): Assumptions {
  const raw = row.assumptions ?? {};
  const number = (value: unknown, fallback: number, minimum: number) =>
    typeof value === "number" && Number.isInteger(value) && value >= minimum
      ? value
      : fallback;
  const level =
    typeof raw.level === "string" && raw.level.trim()
      ? raw.level.trim().slice(0, 80)
      : "All levels";
  const seasonWeek = number(raw.seasonWeek, 0, 1);
  const targetLoad =
    typeof raw.targetLoad === "number"
      ? raw.targetLoad
      : (row.targetLoad ?? undefined);
  return {
    athletes: number(raw.athletes, 8, 1),
    courts: number(raw.courts, 1, 1),
    ballsPerCourt: number(raw.ballsPerCourt, 3, 0),
    level,
    ...(seasonWeek > 0 ? { seasonWeek } : {}),
    ...(targetLoad !== undefined && targetLoad >= 0 && targetLoad <= 100
      ? { targetLoad: Math.round(targetLoad) }
      : {}),
  };
}

async function canEdit(context: TrainingContext, plan: PlanRow) {
  if (isTrainingManager(context.actor)) return;
  if (!hasScope(context.actor, "training:write")) {
    forbidden("Only a coach or a manager can change practice plans.");
  }
  if (plan.createdByPersonId !== context.actor.personId) {
    forbidden("Only the plan's author or a manager can change it.");
  }
}

async function loadPlan(
  organizationId: string,
  planId: string,
): Promise<PlanRow> {
  const [row] = await getDatabase()
    .select()
    .from(trainingPracticePlans)
    .where(
      and(
        eq(trainingPracticePlans.id, planId),
        eq(trainingPracticePlans.organizationId, organizationId),
      ),
    );
  if (!row) notFound("This practice plan was not found.");
  return row;
}

export async function listPracticePlans(
  context: TrainingContext,
  input: { readonly status?: Summary["status"] },
): Promise<{ items: Summary[] }> {
  assertContentReader(context);
  const rows = await getDatabase()
    .select({
      plan: trainingPracticePlans,
      version: trainingPracticePlanVersions.version,
    })
    .from(trainingPracticePlans)
    .leftJoin(
      trainingPracticePlanVersions,
      eq(
        trainingPracticePlanVersions.id,
        trainingPracticePlans.currentVersionId,
      ),
    )
    .where(
      and(
        eq(trainingPracticePlans.organizationId, context.organizationId),
        input.status
          ? eq(trainingPracticePlans.status, input.status)
          : undefined,
      ),
    )
    .orderBy(desc(trainingPracticePlans.updatedAt))
    .limit(PLAN_LIST_LIMIT);
  return {
    items: rows.map(({ plan, version }) => ({
      id: plan.id,
      slug: plan.slug,
      title: plan.title,
      status: plan.status,
      durationMinutes: plan.durationMinutes,
      plannedLoad: plan.plannedLoad,
      version: version ?? 1,
      updatedAt: plan.updatedAt.toISOString(),
    })),
  };
}

function blockOut(
  block: BlockRow,
  drillIdByVersion: ReadonlyMap<string, string>,
) {
  const drillId = block.drillVersionId
    ? drillIdByVersion.get(block.drillVersionId)
    : undefined;
  return {
    id: block.id,
    sequence: block.sequence,
    lane: block.lane,
    title: block.title,
    kind: kindOf(block.kind),
    startsAtMinute: block.startsAtMinute,
    durationMinutes: block.durationMinutes,
    transitionMinutes: block.transitionMinutes,
    intensity: block.intensity,
    plannedLoad: block.plannedLoad,
    ...(block.focus ? { focus: block.focus } : {}),
    ...(drillId ? { drillId, drillVersionId: block.drillVersionId! } : {}),
    ...(block.estimatedTouches !== null
      ? { estimatedTouches: block.estimatedTouches }
      : {}),
    ...(block.estimatedJumps !== null
      ? { estimatedJumps: block.estimatedJumps }
      : {}),
    ...(block.estimatedMetres !== null
      ? { estimatedMetres: block.estimatedMetres }
      : {}),
    estimateSource:
      block.estimateSource as Plan["blocks"][number]["estimateSource"],
    locked: block.locked,
    ...(block.instructionsMarkdown
      ? { instructionsMarkdown: block.instructionsMarkdown }
      : {}),
  };
}

export async function practicePlanDetail(
  context: TrainingContext,
  planId: string,
): Promise<Plan> {
  assertContentReader(context);
  const plan = await loadPlan(context.organizationId, planId);
  return planFromRow(context, plan);
}

async function planFromRow(
  context: TrainingContext,
  plan: PlanRow,
): Promise<Plan> {
  const database = getDatabase();
  const [version] = plan.currentVersionId
    ? await database
        .select()
        .from(trainingPracticePlanVersions)
        .where(eq(trainingPracticePlanVersions.id, plan.currentVersionId))
    : [];
  if (!version) notFound("This practice plan has no saved version.");
  const [blocks, usage] = await Promise.all([
    database
      .select()
      .from(trainingPracticePlanBlocks)
      .where(eq(trainingPracticePlanBlocks.practicePlanVersionId, version.id))
      .orderBy(
        trainingPracticePlanBlocks.startsAtMinute,
        trainingPracticePlanBlocks.sequence,
      )
      .limit(200),
    database
      .select({
        id: trainingEvents.id,
        programId: trainingEvents.programId,
        startsAt: trainingEvents.startsAt,
        timezone: trainingEvents.timezone,
      })
      .from(trainingEvents)
      .innerJoin(
        trainingPracticePlanVersions,
        eq(
          trainingPracticePlanVersions.id,
          trainingEvents.practicePlanVersionId,
        ),
      )
      .where(
        and(
          eq(trainingPracticePlanVersions.practicePlanId, plan.id),
          eq(trainingEvents.organizationId, context.organizationId),
          ne(trainingEvents.status, "cancelled"),
        ),
      )
      .orderBy(desc(trainingEvents.startsAt))
      .limit(1),
  ]);
  const versionIds = [
    ...new Set(
      blocks.flatMap((block) =>
        block.drillVersionId ? [block.drillVersionId] : [],
      ),
    ),
  ];
  const drillVersions = versionIds.length
    ? await database
        .select({
          id: trainingDrillVersions.id,
          drillId: trainingDrillVersions.drillId,
        })
        .from(trainingDrillVersions)
        .where(inArray(trainingDrillVersions.id, versionIds))
    : [];
  const drillIdByVersion = new Map(
    drillVersions.map((row) => [row.id, row.drillId]),
  );
  const used = usage[0];
  let phase: Plan["phase"];
  if (used?.programId) {
    const weeks = await database
      .select()
      .from(trainingProgramWeeks)
      .where(eq(trainingProgramWeeks.programId, used.programId));
    const date = isoDate(used.startsAt, used.timezone);
    const week = weeks.find(
      (candidate) =>
        date >= candidate.startsOn && daysBetween(candidate.startsOn, date) < 7,
    );
    phase = week?.phase as Plan["phase"];
  }
  const assumptions = assumptionsOf(plan);
  const outBlocks = blocks.map((block) => blockOut(block, drillIdByVersion));
  const totals = planTotals({
    blocks: outBlocks,
    plannedMinutes: plan.durationMinutes,
    targetLoad: plan.targetLoad ?? assumptions.targetLoad,
  });
  return {
    id: plan.id,
    slug: plan.slug,
    title: plan.title,
    status: plan.status,
    durationMinutes: plan.durationMinutes,
    plannedLoad: plan.plannedLoad,
    version: version.version,
    updatedAt: plan.updatedAt.toISOString(),
    purpose: plan.purpose,
    targetAudience: plan.targetAudience,
    versionId: version.id,
    ...(plan.targetLoad !== null ? { targetLoad: plan.targetLoad } : {}),
    assumptions,
    blocks: outBlocks,
    totals,
    ...(used?.programId ? { programId: used.programId } : {}),
    ...(phase ? { phase } : {}),
    ...(used ? { sessionId: used.id } : {}),
  };
}

/** draft → review → published → archived; an archived plan comes back as a draft. */
function assertTransition(from: PlanRow["status"], to: PlanRow["status"]) {
  if (from === "archived" && to !== "draft" && to !== "archived") {
    conflict("Restore an archived plan as a draft first.");
  }
}

export async function savePracticePlan(
  context: TrainingContext,
  input: z.infer<typeof trainingProgramsSavePracticePlanInputSchema>,
): Promise<Plan> {
  if (!hasScope(context.actor, "training:write")) {
    forbidden("Only a coach or a manager can save practice plans.");
  }
  const existing = input.practicePlanId
    ? await loadPlan(context.organizationId, input.practicePlanId)
    : undefined;
  if (existing) {
    await canEdit(context, existing);
    assertTransition(existing.status, input.status);
  }
  const check = checkTimeline(input.blocks);
  if (check.errors.length > 0) badRequest(check.errors[0]!);
  const pins = await pinDrillVersions(context, input.blocks);
  input.blocks.forEach((block, index) => {
    if ((block.drillId || block.drillVersionId) && !pins[index]) {
      notFound(`The drill in "${block.title}" was not found.`);
    }
  });
  const { idempotencyKey, ...request } = input;
  const { result } = await executeIdempotent({
    key: `${context.organizationId}:${idempotencyKey}`,
    procedure: "trainingPrograms.savePracticePlan",
    personId: context.actor.personId,
    organizationId: context.organizationId,
    request,
    now: context.now,
    execute: async () => {
      const planId = existing?.id ?? crypto.randomUUID();
      const versionId = crypto.randomUUID();
      const durationMinutes = Math.min(
        720,
        Math.max(1, timelineMinutes(input.blocks)),
      );
      const totals = planTotals({
        blocks: input.blocks,
        plannedMinutes: durationMinutes,
        targetLoad: input.targetLoad,
      });
      const version = await getTransactionalDatabase().transaction(
        async (transaction) => {
          if (existing) {
            const [locked] = await transaction
              .select()
              .from(trainingPracticePlans)
              .where(eq(trainingPracticePlans.id, existing.id))
              .for("update");
            assertTransition(locked!.status, input.status);
          } else {
            await transaction.insert(trainingPracticePlans).values({
              id: planId,
              organizationId: context.organizationId,
              slug: slugify(input.title, planId),
              title: input.title.trim(),
              purpose: input.purpose,
              targetAudience: input.targetAudience,
              status: "draft",
              durationMinutes,
              plannedLoad: totals.load,
              createdByPersonId: context.actor.personId,
              createdAt: context.now,
              updatedAt: context.now,
            });
          }
          const [max] = await transaction
            .select({
              max: sql<number>`coalesce(max(${trainingPracticePlanVersions.version}), 0)::int`,
            })
            .from(trainingPracticePlanVersions)
            .where(eq(trainingPracticePlanVersions.practicePlanId, planId));
          const number = (max?.max ?? 0) + 1;
          await transaction.insert(trainingPracticePlanVersions).values({
            id: versionId,
            practicePlanId: planId,
            version: number,
            snapshot: { ...request, totals },
            changeNote: input.changeNote?.trim() || null,
            createdByPersonId: context.actor.personId,
            createdAt: context.now,
          });
          if (input.blocks.length > 0) {
            await transaction.insert(trainingPracticePlanBlocks).values(
              input.blocks.map((block, index) => ({
                practicePlanVersionId: versionId,
                drillVersionId: pins[index]?.drillVersionId ?? null,
                sequence: block.sequence,
                lane: block.lane,
                title: block.title.trim(),
                kind: block.kind,
                startsAtMinute: block.startsAtMinute,
                durationMinutes: block.durationMinutes,
                transitionMinutes: block.transitionMinutes,
                intensity: block.intensity,
                plannedLoad: blockLoad(block.intensity),
                instructionsMarkdown:
                  block.instructionsMarkdown?.trim() || null,
                focus: block.focus?.trim() || null,
                estimatedTouches: block.estimatedTouches ?? null,
                estimatedJumps: block.estimatedJumps ?? null,
                estimatedMetres: block.estimatedMetres ?? null,
                estimateSource: block.estimateSource,
                locked: block.locked,
                createdAt: context.now,
              })),
            );
          }
          await transaction
            .update(trainingPracticePlans)
            .set({
              title: input.title.trim(),
              purpose: input.purpose,
              targetAudience: input.targetAudience,
              status: input.status,
              durationMinutes,
              plannedLoad: totals.load,
              assumptions: input.assumptions,
              targetLoad: input.targetLoad ?? null,
              currentVersionId: versionId,
              ...(input.status === "published" &&
              existing?.status !== "published"
                ? { publishedAt: context.now }
                : {}),
              ...(input.status === "archived"
                ? { archivedAt: context.now }
                : {}),
              updatedAt: context.now,
            })
            .where(eq(trainingPracticePlans.id, planId));
          const transition =
            existing && existing.status !== input.status
              ? input.status === "published"
                ? "training-plan.published"
                : input.status === "archived"
                  ? "training-plan.archived"
                  : "training-plan.status-changed"
              : existing
                ? "training-plan.versioned"
                : "training-plan.created";
          await audit(transaction, context, {
            action: transition,
            entityType: "training-practice-plan",
            entityId: planId,
            ...(existing ? { before: { status: existing.status } } : {}),
            after: { status: input.status, version: number },
            reason: `Saved version ${number} (${input.blocks.length} blocks, ${durationMinutes} minutes).`,
          });
          return number;
        },
      );
      log.info("training-programs.plan.saved", {
        organizationId: context.organizationId,
        practicePlanId: planId,
        version,
        blocks: input.blocks.length,
        status: input.status,
        warnings: check.warnings.length,
      });
      return { id: planId };
    },
    serializeResult: (value) => value,
  });
  return practicePlanDetail(context, result.id);
}

/** A draft from the coach's assumptions and the club's drills; nothing saved. */
export async function proposePracticePlan(
  context: TrainingContext,
  input: z.infer<typeof trainingProgramsProposePracticePlanInputSchema>,
): Promise<Plan> {
  assertContentReader(context);
  const session = input.sessionId
    ? await loadEvent(context.organizationId, input.sessionId)
    : undefined;
  const candidates = await getDatabase()
    .select({
      drillId: trainingDrills.id,
      versionId: trainingDrills.currentVersionId,
      title: trainingDrills.title,
      skillLevel: trainingDrills.skillLevel,
      durationMinutes: trainingDrills.durationMinutes,
      intensity: trainingDrills.intensity,
      minPlayers: trainingDrills.minPlayers,
      touches: trainingDrills.touchEstimateTypical,
      jumps: trainingDrills.jumpEstimateTypical,
      summary: trainingDrills.summary,
      purpose: trainingDrills.purpose,
      sceneId: trainingDrillScenes.id,
    })
    .from(trainingDrills)
    .leftJoin(
      trainingDrillScenes,
      and(
        eq(trainingDrillScenes.drillVersionId, trainingDrills.currentVersionId),
        eq(trainingDrillScenes.validationStatus, "valid"),
      ),
    )
    .where(
      and(
        visibleDrillCondition(context),
        ne(trainingDrills.status, "archived"),
        eq(trainingDrills.activityKind, "drill"),
      ),
    )
    .orderBy(desc(trainingDrills.updatedAt))
    .limit(200);
  const blocks = proposeBlocks({
    durationMinutes: input.durationMinutes,
    athletes: input.assumptions.athletes,
    focus: input.focus,
    drills: candidates.flatMap((drill) =>
      drill.versionId
        ? [
            {
              drillId: drill.drillId,
              drillVersionId: drill.versionId,
              title: drill.title,
              focus: drill.purpose || drill.summary || drill.title,
              durationMinutes: drill.durationMinutes,
              intensity: drill.intensity,
              minPlayers: drill.minPlayers,
              touches: drill.touches,
              jumps: drill.jumps,
              fromScene: Boolean(drill.sceneId),
            },
          ]
        : [],
    ),
  });
  const targetLoad = input.assumptions.targetLoad;
  const totals = planTotals({
    blocks,
    plannedMinutes: input.durationMinutes,
    targetLoad,
  });
  const id = crypto.randomUUID();
  log.info("training-programs.plan.proposed", {
    organizationId: context.organizationId,
    blocks: blocks.length,
    candidates: candidates.length,
    hasSession: Boolean(session),
  });
  return {
    id,
    slug: "proposal",
    title: input.focus?.trim()
      ? `${input.focus.trim()} practice`
      : "New practice",
    status: "draft",
    durationMinutes: input.durationMinutes,
    plannedLoad: totals.load,
    version: 1,
    updatedAt: context.now.toISOString(),
    purpose: "",
    targetAudience: input.assumptions.level,
    versionId: crypto.randomUUID(),
    ...(targetLoad !== undefined ? { targetLoad } : {}),
    assumptions: input.assumptions,
    blocks: blocks.map((block) => ({
      id: crypto.randomUUID(),
      sequence: block.sequence,
      lane: block.lane,
      title: block.title,
      kind: block.kind,
      startsAtMinute: block.startsAtMinute,
      durationMinutes: block.durationMinutes,
      transitionMinutes: block.transitionMinutes,
      intensity: block.intensity,
      plannedLoad: block.plannedLoad,
      ...(block.focus ? { focus: block.focus } : {}),
      ...(block.drillId
        ? { drillId: block.drillId, drillVersionId: block.drillVersionId! }
        : {}),
      ...(block.estimatedTouches !== undefined
        ? { estimatedTouches: block.estimatedTouches }
        : {}),
      ...(block.estimatedJumps !== undefined
        ? { estimatedJumps: block.estimatedJumps }
        : {}),
      estimateSource: block.estimateSource,
      locked: false,
    })),
    totals,
    ...(session?.programId ? { programId: session.programId } : {}),
    ...(session ? { sessionId: session.id } : {}),
  };
}
