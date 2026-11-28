/**
 * Training drills (B5): the library, versions, scope, review, listings,
 * the store and purchases; scenes (B6a) are stored and validated here with
 * `@duna/core/training-scene` and never executed.
 *
 * - Every save is a new immutable `training_drill_versions` row; plans pin
 *   a version (see ../training-programs/plans-service.ts).
 * - A scene is one `training_drill_scenes` row per version. A save without
 *   a scene carries the previous version's scene forward, re-validated. An
 *   invalid scene is stored with its issues (the coach fixes it); a scene
 *   over the size cap is refused.
 * - Legacy drills keep their v1 scene in `training_drills.choreography`.
 *   Reads convert it on the fly (`source: converted`, nothing written); the
 *   first write copies it into `training_drill_scenes` once (advisory lock,
 *   audit marker `training-drill.legacy-scene-converted`).
 * - Club drills: the author or a manager edits them. Personal drills: only
 *   the owner. Duna and purchased drills are read-only.
 * - The store and purchases honour the `training.storefront` kill switch.
 *   Paid purchases stay pending until checkout; this service takes no money.
 */
import {
  auditLog,
  getDatabase,
  getTransactionalDatabase,
  organizations,
  trainingDrillListings,
  trainingDrillPurchases,
  trainingDrillReviewChecks,
  trainingDrillScenes,
  trainingDrillTags,
  trainingDrillVersions,
  trainingDrills,
  trainingEvents,
  trainingPracticePlanBlocks,
  trainingPracticePlanVersions,
  trainingPracticePlans,
  trainingProgramParticipants,
  trainingTags,
} from "@duna/db";
import {
  convertLegacyTrainingScene,
  deriveTrainingSceneEstimates,
  TRAINING_SCENE_MAX_BYTES,
  TRAINING_SCENE_MODEL_VERSION,
  TRAINING_SCENE_VALIDATOR_VERSION,
  validateTrainingScene,
} from "@duna/core/training-scene";
import { log } from "@duna/observability";
import { TRPCError } from "@trpc/server";
import {
  and,
  arrayContains,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { z } from "zod";
import type {
  trainingDrillsDetailSchema,
  trainingDrillsFiltersSchema,
  trainingDrillsLibraryScopeSchema,
  trainingDrillsListingSchema,
  trainingDrillsPurchaseSchema,
  trainingDrillsSaveListingInputSchema,
  trainingDrillsSaveVersionInputSchema,
  trainingDrillsSceneSchema,
  trainingDrillsSummarySchema,
} from "../../contracts/training-drills";
import type { ApiActor } from "../../context";
import { executeIdempotent } from "../../idempotency";
import { blockLoad } from "../training-programs/plan-timeline";
import {
  audit,
  badRequest,
  conflict,
  forbidden,
  hasScope,
  isTrainingManager,
  loadPeople,
  notFound,
  type PersonRef,
  slugify,
  stableUuid,
  type TrainingContext,
  type Transaction,
} from "../training-programs/shared";
import { purchasedCondition, visibleDrillCondition } from "./access";

type DrillRow = typeof trainingDrills.$inferSelect;
type Summary = z.infer<typeof trainingDrillsSummarySchema>;
type Detail = z.infer<typeof trainingDrillsDetailSchema>;
type Scene = z.infer<typeof trainingDrillsSceneSchema>;
type Listing = z.infer<typeof trainingDrillsListingSchema>;
type Purchase = z.infer<typeof trainingDrillsPurchaseSchema>;
type Filters = z.infer<typeof trainingDrillsFiltersSchema>;

export const LIBRARY_LIMIT = 200;
export const STORE_LIMIT = 100;
export const LEGACY_SCENE_CONVERTED = "training-drill.legacy-scene-converted";
const ACTIVE_LISTING = ["draft", "pending-review", "listed"] as const;

/** Duna's marketplace fee is the owner's decision: read from configuration. */
export function marketplaceFeeBps(): number | undefined {
  const raw = process.env.TRAINING_MARKETPLACE_FEE_BPS?.trim();
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 && value <= 10_000 ? value : undefined;
}

function titleCase(value: string): string {
  return value
    .split(/[-\s]+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(" ");
}

function escapeLike(value: string): string {
  return value.replaceAll(/[\\%_]/g, (match) => `\\${match}`);
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function strings(value: unknown, max = 20): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => item.slice(0, 300))
        .slice(0, max)
    : [];
}

// ------------------------------------------------------------------ filters

function filterConditions(filters: Filters): (SQL | undefined)[] {
  const query = filters.query?.trim();
  return [
    query
      ? or(
          ilike(trainingDrills.title, `%${escapeLike(query)}%`),
          ilike(trainingDrills.summary, `%${escapeLike(query)}%`),
        )
      : undefined,
    filters.focus?.trim()
      ? sql`exists (select 1 from ${trainingDrillTags} inner join ${trainingTags} on ${trainingTags.id} = ${trainingDrillTags.tagId} where ${trainingDrillTags.drillId} = ${trainingDrills.id} and ${trainingDrillTags.isFocusArea} = true and lower(${trainingTags.label}) = ${filters.focus.trim().toLowerCase()})`
      : undefined,
    filters.players
      ? and(
          lte(trainingDrills.minPlayers, filters.players),
          gte(trainingDrills.maxPlayers, filters.players),
        )
      : undefined,
    filters.level?.trim()
      ? or(
          ilike(trainingDrills.skillLevel, `%${escapeLike(filters.level.trim())}%`),
          eq(trainingDrills.skillLevel, "all-levels"),
        )
      : undefined,
    filters.equipment?.length
      ? arrayContains(trainingDrills.equipment, filters.equipment)
      : undefined,
    filters.maxMinutes ? lte(trainingDrills.durationMinutes, filters.maxMinutes) : undefined,
  ];
}

// ----------------------------------------------------------------- summaries

/**
 * Summaries for drill rows in a fixed number of queries: versions, focus
 * tags, plan usage (this club's plans only), purchases, people, sellers.
 */
async function summaries(
  viewer: { readonly actor?: ApiActor; readonly organizationId?: string },
  rows: readonly DrillRow[],
): Promise<Summary[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const versionIds = rows.flatMap((row) => (row.currentVersionId ? [row.currentVersionId] : []));
  const database = getDatabase();
  const [versions, focusRows, usage, purchased, listings] = await Promise.all([
    versionIds.length
      ? database
          .select({ id: trainingDrillVersions.id, version: trainingDrillVersions.version })
          .from(trainingDrillVersions)
          .where(inArray(trainingDrillVersions.id, versionIds))
      : Promise.resolve([]),
    database
      .select({ drillId: trainingDrillTags.drillId, label: trainingTags.label })
      .from(trainingDrillTags)
      .innerJoin(trainingTags, eq(trainingTags.id, trainingDrillTags.tagId))
      .where(and(inArray(trainingDrillTags.drillId, ids), eq(trainingDrillTags.isFocusArea, true))),
    viewer.organizationId
      ? database
          .select({
            drillId: trainingDrillVersions.drillId,
            plans: sql<number>`count(distinct ${trainingPracticePlanVersions.practicePlanId})::int`,
          })
          .from(trainingPracticePlanBlocks)
          .innerJoin(
            trainingDrillVersions,
            eq(trainingDrillVersions.id, trainingPracticePlanBlocks.drillVersionId),
          )
          .innerJoin(
            trainingPracticePlanVersions,
            eq(trainingPracticePlanVersions.id, trainingPracticePlanBlocks.practicePlanVersionId),
          )
          .innerJoin(
            trainingPracticePlans,
            eq(trainingPracticePlans.id, trainingPracticePlanVersions.practicePlanId),
          )
          .where(
            and(
              inArray(trainingDrillVersions.drillId, ids),
              eq(trainingPracticePlans.organizationId, viewer.organizationId),
              ne(trainingPracticePlans.status, "archived"),
            ),
          )
          .groupBy(trainingDrillVersions.drillId)
      : Promise.resolve([]),
    viewer.organizationId && viewer.actor
      ? database
          .select({ id: trainingDrills.id })
          .from(trainingDrills)
          .where(
            and(
              inArray(trainingDrills.id, ids),
              purchasedCondition({ actor: viewer.actor, organizationId: viewer.organizationId }),
            ),
          )
      : Promise.resolve([]),
    database
      .select({ drillId: trainingDrillListings.drillId, listedAs: trainingDrillListings.listedAs })
      .from(trainingDrillListings)
      .where(
        and(inArray(trainingDrillListings.drillId, ids), eq(trainingDrillListings.status, "listed")),
      ),
  ]);
  const peopleById = await loadPeople(
    rows.map((row) => row.ownerPersonId ?? row.createdByPersonId),
  );
  const versionNumber = new Map(versions.map((row) => [row.id, row.version]));
  const focusByDrill = new Map(focusRows.map((row) => [row.drillId, row.label]));
  const usageByDrill = new Map(usage.map((row) => [row.drillId, row.plans]));
  const purchasedIds = new Set(purchased.map((row) => row.id));
  const sellerByDrill = new Map(listings.map((row) => [row.drillId, row.listedAs]));
  return rows.map((row) => {
    const own = row.organizationId === viewer.organizationId && viewer.organizationId !== undefined;
    const isPurchased = !own && purchasedIds.has(row.id);
    const author = peopleById.get(row.ownerPersonId ?? row.createdByPersonId ?? "");
    const sourceLabel =
      row.scope === "duna"
        ? "Duna library"
        : !own
          ? sellerByDrill.get(row.id) ?? row.sourceAttribution ?? undefined
          : row.sourceAttribution ?? undefined;
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      scope: row.scope as Summary["scope"],
      purchased: isPurchased,
      status: row.status,
      reviewState: row.reviewState as Summary["reviewState"],
      focus: focusByDrill.get(row.id) ?? titleCase(row.activityKind),
      players: {
        min: row.minPlayers,
        max: row.maxPlayers,
        recommended: row.recommendedPlayers,
      },
      durationMinutes: row.durationMinutes,
      level: titleCase(row.skillLevel),
      equipment: row.equipment,
      load: blockLoad(row.intensity),
      touches: row.touchEstimateTypical,
      jumps: row.jumpEstimateTypical,
      ...(author && (own || row.scope !== "duna") ? { author: author as PersonRef } : {}),
      ...(sourceLabel ? { sourceLabel: sourceLabel.slice(0, 160) } : {}),
      version: row.currentVersionId ? (versionNumber.get(row.currentVersionId) ?? 1) : 1,
      usedInPlans: usageByDrill.get(row.id) ?? 0,
      updatedAt: row.updatedAt.toISOString(),
    };
  });
}

// --------------------------------------------------------------------- reads

export async function library(
  context: TrainingContext,
  input: Filters & { readonly scope: z.infer<typeof trainingDrillsLibraryScopeSchema> },
): Promise<{ scope: typeof input.scope; items: Summary[] }> {
  if (!hasScope(context.actor, "training:write")) {
    forbidden("The drill library is for coaches.");
  }
  const scopeCondition =
    input.scope === "personal"
      ? and(
          eq(trainingDrills.organizationId, context.organizationId),
          eq(trainingDrills.scope, "personal"),
          eq(trainingDrills.ownerPersonId, context.actor.personId),
        )
      : input.scope === "club"
        ? and(
            eq(trainingDrills.organizationId, context.organizationId),
            eq(trainingDrills.scope, "club"),
          )
        : input.scope === "duna"
          ? and(
              isNull(trainingDrills.organizationId),
              eq(trainingDrills.scope, "duna"),
              eq(trainingDrills.status, "published"),
            )
          : and(
              or(
                isNull(trainingDrills.organizationId),
                ne(trainingDrills.organizationId, context.organizationId),
              ),
              purchasedCondition(context),
            );
  const rows = await getDatabase()
    .select()
    .from(trainingDrills)
    .where(and(scopeCondition, ...filterConditions(input)))
    .orderBy(desc(trainingDrills.updatedAt), asc(trainingDrills.title))
    .limit(LIBRARY_LIMIT);
  return { scope: input.scope, items: await summaries(context, rows) };
}

async function loadVisibleDrill(context: TrainingContext, drillId: string): Promise<DrillRow> {
  const [row] = await getDatabase()
    .select()
    .from(trainingDrills)
    .where(and(eq(trainingDrills.id, drillId), visibleDrillCondition(context)));
  if (!row) notFound("This drill was not found.");
  return row;
}

function sceneOut(row: typeof trainingDrillScenes.$inferSelect): Scene {
  return {
    id: row.id,
    drillVersionId: row.drillVersionId,
    modelVersion: row.modelVersion,
    document: row.document,
    derived: row.derived,
    validationStatus: row.validationStatus as Scene["validationStatus"],
    validationIssues: row.validationIssues.map((issue) => ({
      rule: issue.rule,
      message: issue.message,
    })),
    ...(row.validatorVersion ? { validatorVersion: row.validatorVersion } : {}),
    ...(row.validatedAt ? { validatedAt: row.validatedAt.toISOString() } : {}),
    source: row.source as Scene["source"],
    hasPinnedEdits: row.hasPinnedEdits,
  };
}

/** A legacy v1 scene, converted for reading only (nothing is written). */
function convertedScene(row: DrillRow, versionId: string, now: Date): Scene | undefined {
  const document = convertLegacyTrainingScene(row.choreography, {
    title: row.title,
    objective: row.purpose || row.summary,
    durationMinutes: row.durationMinutes,
  });
  if (!document) return undefined;
  const validation = validateTrainingScene(document);
  return {
    id: stableUuid(versionId, "legacy-scene"),
    drillVersionId: versionId,
    modelVersion: TRAINING_SCENE_MODEL_VERSION,
    document,
    derived: deriveTrainingSceneEstimates(document),
    validationStatus: validation.ok ? "valid" : "invalid",
    validationIssues: validation.issues
      .filter((issue) => issue.level === "error")
      .map((issue) => ({ rule: issue.rule, message: issue.message })),
    validatorVersion: TRAINING_SCENE_VALIDATOR_VERSION,
    validatedAt: now.toISOString(),
    source: "converted",
    hasPinnedEdits: false,
  };
}

function listingOut(
  row: typeof trainingDrillListings.$inferSelect,
  sellerName: string,
): Listing {
  return {
    id: row.id,
    drillId: row.drillId,
    drillVersionId: row.drillVersionId,
    status: row.status as Listing["status"],
    pricing: row.pricing as Listing["pricing"],
    price: {
      amountMinor: row.priceMinor,
      currency: row.currency as Listing["price"]["currency"],
    },
    licenseTerms: row.licenseTerms,
    listedAs: row.listedAs,
    seller: row.sellerOrganizationId
      ? { kind: "organization", id: row.sellerOrganizationId, displayName: sellerName }
      : { kind: "person", id: row.sellerPersonId!, displayName: sellerName },
    marketplaceFeeBps: row.pricing === "paid" ? (marketplaceFeeBps() ?? 0) : 0,
    ...(row.listedAt ? { listedAt: row.listedAt.toISOString() } : {}),
    ...(row.delistedAt ? { delistedAt: row.delistedAt.toISOString() } : {}),
  };
}

async function sellerNames(rows: readonly (typeof trainingDrillListings.$inferSelect)[]) {
  const orgIds = [...new Set(rows.flatMap((row) => (row.sellerOrganizationId ? [row.sellerOrganizationId] : [])))];
  const [orgs, peopleById] = await Promise.all([
    orgIds.length
      ? getDatabase()
          .select({ id: organizations.id, name: organizations.name })
          .from(organizations)
          .where(inArray(organizations.id, orgIds))
      : Promise.resolve([]),
    loadPeople(rows.map((row) => row.sellerPersonId)),
  ]);
  const byOrg = new Map(orgs.map((row) => [row.id, row.name]));
  return (row: typeof trainingDrillListings.$inferSelect) =>
    row.sellerOrganizationId
      ? (byOrg.get(row.sellerOrganizationId) ?? row.listedAs)
      : (peopleById.get(row.sellerPersonId ?? "")?.displayName ?? row.listedAs);
}

async function detailOf(
  context: TrainingContext,
  row: DrillRow,
  options: { readonly forPlayer?: boolean } = {},
): Promise<Detail> {
  const [summary] = await summaries(context, [row]);
  const database = getDatabase();
  const own = row.organizationId === context.organizationId;
  const [versions, scenes, checks, listings] = await Promise.all([
    database
      .select()
      .from(trainingDrillVersions)
      .where(eq(trainingDrillVersions.drillId, row.id))
      .orderBy(asc(trainingDrillVersions.version))
      .limit(200),
    row.currentVersionId
      ? database
          .select()
          .from(trainingDrillScenes)
          .where(eq(trainingDrillScenes.drillVersionId, row.currentVersionId))
      : Promise.resolve([]),
    row.currentVersionId && own && !options.forPlayer
      ? database
          .select()
          .from(trainingDrillReviewChecks)
          .where(eq(trainingDrillReviewChecks.drillVersionId, row.currentVersionId))
      : Promise.resolve([]),
    own && !options.forPlayer
      ? database
          .select()
          .from(trainingDrillListings)
          .where(
            and(
              eq(trainingDrillListings.drillId, row.id),
              inArray(trainingDrillListings.status, [...ACTIVE_LISTING]),
            ),
          )
          .limit(1)
      : Promise.resolve([]),
  ]);
  const peopleById = await loadPeople(versions.map((version) => version.createdByPersonId));
  const coaching = record(row.coaching);
  const scoring = record(row.scoring);
  const currentVersionId = row.currentVersionId ?? versions.at(-1)?.id;
  if (!currentVersionId) notFound("This drill has no saved version.");
  const scene = scenes[0]
    ? sceneOut(scenes[0])
    : convertedScene(row, currentVersionId, context.now);
  const name = listings[0] ? (await sellerNames(listings))(listings[0]) : "";
  const visibleVersions = options.forPlayer
    ? versions.filter((version) => version.id === currentVersionId)
    : versions;
  return {
    ...summary!,
    summary: row.summary,
    purpose: row.purpose,
    targetAudience: row.targetAudience,
    descriptionMarkdown: row.descriptionMarkdown,
    coachingCues: strings(coaching.cues),
    ...(typeof coaching.rotationRule === "string" && coaching.rotationRule
      ? { rotationRule: coaching.rotationRule.slice(0, 500) }
      : {}),
    ...(typeof scoring.successCriteria === "string" && scoring.successCriteria
      ? { successCriteria: scoring.successCriteria.slice(0, 500) }
      : typeof scoring.instructions === "string" && scoring.instructions
        ? { successCriteria: scoring.instructions.slice(0, 500) }
        : {}),
    currentVersionId,
    versions: visibleVersions.map((version) => {
      const createdBy = peopleById.get(version.createdByPersonId ?? "");
      return {
        id: version.id,
        version: version.version,
        ...(version.changeNote ? { changeNote: version.changeNote } : {}),
        ...(createdBy ? { createdBy } : {}),
        createdAt: version.createdAt.toISOString(),
      };
    }),
    ...(scene ? { scene } : {}),
    reviewChecks: checks.map((check) => ({
      kind: check.kind as Detail["reviewChecks"][number]["kind"],
      status: check.status as Detail["reviewChecks"][number]["status"],
      ...(check.note ? { note: check.note } : {}),
      ...(check.decidedAt ? { decidedAt: check.decidedAt.toISOString() } : {}),
    })),
    ...(listings[0] ? { listing: listingOut(listings[0], name) } : {}),
  };
}

export async function drillDetail(context: TrainingContext, drillId: string): Promise<Detail> {
  if (!hasScope(context.actor, "training:write")) {
    forbidden("The drill library is for coaches.");
  }
  const row = await loadVisibleDrill(context, drillId);
  return detailOf(context, row);
}

// -------------------------------------------------------------------- writes

/** Who may change a drill: the owner of a personal one; the author or a manager of a club one. */
function assertCanEdit(context: TrainingContext, row: DrillRow) {
  if (row.organizationId !== context.organizationId) {
    forbidden("Duna and purchased drills are read-only. Copy it to change it.");
  }
  if (row.scope === "personal") {
    if (row.ownerPersonId !== context.actor.personId) notFound("This drill was not found.");
    return;
  }
  if (isTrainingManager(context.actor)) return;
  if (row.createdByPersonId !== context.actor.personId) {
    forbidden("Only the drill's author or a manager can change it.");
  }
}

interface SceneWrite {
  readonly document: Record<string, unknown>;
  readonly source: "coach" | "converted";
}

function sceneValues(scene: SceneWrite, versionId: string, context: TrainingContext) {
  const size = JSON.stringify(scene.document).length;
  if (size > TRAINING_SCENE_MAX_BYTES) {
    badRequest(`A scene can be at most ${Math.floor(TRAINING_SCENE_MAX_BYTES / 1024)} KB.`);
  }
  const validation = validateTrainingScene(scene.document);
  return {
    drillVersionId: versionId,
    modelVersion: TRAINING_SCENE_MODEL_VERSION,
    document: scene.document,
    derived: validation.ok ? deriveTrainingSceneEstimates(scene.document) : {},
    validationStatus: validation.ok ? "valid" : "invalid",
    validationIssues: validation.issues
      .filter((issue) => issue.level === "error")
      .slice(0, 50)
      .map((issue) => ({ rule: issue.rule, message: issue.message })),
    validatorVersion: TRAINING_SCENE_VALIDATOR_VERSION,
    validatedAt: context.now,
    source: scene.source,
    hasPinnedEdits: false,
    createdByPersonId: context.actor.personId,
    createdAt: context.now,
    updatedAt: context.now,
  };
}

/**
 * Copies a legacy drill's v1 scene into `training_drill_scenes` for its
 * current version, once (advisory lock + audit marker). Never touches the
 * legacy `choreography` column.
 */
export async function copyLegacyScene(
  transaction: Transaction,
  context: TrainingContext,
  row: DrillRow,
): Promise<boolean> {
  if (!row.currentVersionId) return false;
  await transaction.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`training-drill-scene:${row.currentVersionId}`}))`,
  );
  const [existing] = await transaction
    .select({ id: trainingDrillScenes.id })
    .from(trainingDrillScenes)
    .where(eq(trainingDrillScenes.drillVersionId, row.currentVersionId));
  if (existing) return false;
  const [marker] = await transaction
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.action, LEGACY_SCENE_CONVERTED),
        eq(auditLog.entityId, row.currentVersionId),
      ),
    )
    .limit(1);
  if (marker) return false;
  const document = convertLegacyTrainingScene(row.choreography, {
    title: row.title,
    objective: row.purpose || row.summary,
    durationMinutes: row.durationMinutes,
  });
  if (document) {
    await transaction
      .insert(trainingDrillScenes)
      .values(sceneValues({ document, source: "converted" }, row.currentVersionId, context));
  }
  await transaction.insert(auditLog).values({
    organizationId: row.organizationId,
    actorPersonId: context.actor.personId,
    actorType: "person",
    action: LEGACY_SCENE_CONVERTED,
    entityType: "training-drill-version",
    entityId: row.currentVersionId,
    reason: document
      ? "Converted the legacy v1 scene to a v2 scene; the legacy column is kept."
      : "The legacy scene could not be converted; nothing was written.",
    traceId: context.requestId,
    createdAt: context.now,
  });
  log.info("training-drills.legacy-scene.copied", {
    organizationId: row.organizationId ?? undefined,
    drillId: row.id,
    converted: Boolean(document),
  });
  return Boolean(document);
}

async function upsertFocusTag(
  transaction: Transaction,
  context: TrainingContext,
  drillId: string,
  focus: string,
) {
  const label = focus.trim().slice(0, 120);
  const slug = label
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .slice(0, 80) || "focus";
  const [found] = await transaction
    .select({ id: trainingTags.id })
    .from(trainingTags)
    .where(
      and(
        eq(trainingTags.slug, slug),
        or(isNull(trainingTags.organizationId), eq(trainingTags.organizationId, context.organizationId)),
      ),
    )
    .orderBy(sql`${trainingTags.organizationId} nulls first`)
    .limit(1);
  let tagId = found?.id;
  if (!tagId) {
    const [created] = await transaction
      .insert(trainingTags)
      .values({
        organizationId: context.organizationId,
        slug,
        label,
        category: "focus",
        isFocusArea: true,
        createdByPersonId: context.actor.personId,
        createdAt: context.now,
        updatedAt: context.now,
      })
      .returning({ id: trainingTags.id });
    tagId = created!.id;
  }
  await transaction
    .delete(trainingDrillTags)
    .where(and(eq(trainingDrillTags.drillId, drillId), eq(trainingDrillTags.isFocusArea, true)));
  await transaction
    .insert(trainingDrillTags)
    .values({ drillId, tagId, isFocusArea: true, createdAt: context.now })
    .onConflictDoUpdate({
      target: [trainingDrillTags.drillId, trainingDrillTags.tagId],
      set: { isFocusArea: true },
    });
}

export async function saveVersion(
  context: TrainingContext,
  input: z.infer<typeof trainingDrillsSaveVersionInputSchema>,
): Promise<Detail> {
  if (input.players.min > input.players.max ||
      input.players.recommended < input.players.min ||
      input.players.recommended > input.players.max) {
    badRequest("Players: minimum ≤ recommended ≤ maximum.");
  }
  if (input.scene && JSON.stringify(input.scene).length > TRAINING_SCENE_MAX_BYTES) {
    badRequest(`A scene can be at most ${Math.floor(TRAINING_SCENE_MAX_BYTES / 1024)} KB.`);
  }
  const existing = input.drillId ? await loadVisibleDrill(context, input.drillId) : undefined;
  if (existing) {
    assertCanEdit(context, existing);
    if (existing.status === "archived") conflict("An archived drill cannot be changed.");
    if (input.scope !== existing.scope) {
      badRequest("Change who can see a drill with setScope.");
    }
  }
  const { idempotencyKey, ...request } = input;
  const { result } = await executeIdempotent({
    key: `${context.organizationId}:${idempotencyKey}`,
    procedure: "trainingDrills.saveVersion",
    personId: context.actor.personId,
    organizationId: context.organizationId,
    request,
    now: context.now,
    execute: async () => {
      const drillId = existing?.id ?? crypto.randomUUID();
      const versionId = crypto.randomUUID();
      const validity = await getTransactionalDatabase().transaction(async (transaction) => {
        let previousScene: Record<string, unknown> | undefined;
        if (existing) {
          const [locked] = await transaction
            .select()
            .from(trainingDrills)
            .where(eq(trainingDrills.id, existing.id))
            .for("update");
          await copyLegacyScene(transaction, context, locked!);
          if (!input.scene && locked!.currentVersionId) {
            const [scene] = await transaction
              .select({ document: trainingDrillScenes.document })
              .from(trainingDrillScenes)
              .where(eq(trainingDrillScenes.drillVersionId, locked!.currentVersionId));
            previousScene = scene?.document;
          }
        }
        const values = {
          title: input.title.trim(),
          purpose: input.purpose,
          targetAudience: input.targetAudience,
          summary: input.summary,
          descriptionMarkdown: input.descriptionMarkdown,
          minPlayers: input.players.min,
          maxPlayers: input.players.max,
          recommendedPlayers: input.players.recommended,
          durationMinutes: input.durationMinutes,
          skillLevel: input.level.trim().toLowerCase().replaceAll(/\s+/g, "-").slice(0, 32),
          equipment: input.equipment.map((item) => item.trim()).filter(Boolean),
          coaching: {
            ...record(existing?.coaching),
            cues: input.coachingCues,
            ...(input.rotationRule ? { rotationRule: input.rotationRule } : {}),
          },
          scoring: {
            ...record(existing?.scoring),
            ...(input.successCriteria ? { successCriteria: input.successCriteria } : {}),
          },
          currentVersionId: versionId,
          updatedAt: context.now,
        };
        if (existing) {
          await transaction.update(trainingDrills).set(values).where(eq(trainingDrills.id, drillId));
        } else {
          await transaction.insert(trainingDrills).values({
            ...values,
            id: drillId,
            organizationId: context.organizationId,
            slug: slugify(input.title, drillId),
            status: input.scope === "club" ? "published" : "draft",
            scope: input.scope,
            ownerPersonId: input.scope === "personal" ? context.actor.personId : null,
            createdByPersonId: context.actor.personId,
            createdAt: context.now,
          });
        }
        const [max] = await transaction
          .select({ max: sql<number>`coalesce(max(${trainingDrillVersions.version}), 0)::int` })
          .from(trainingDrillVersions)
          .where(eq(trainingDrillVersions.drillId, drillId));
        const number = (max?.max ?? 0) + 1;
        await transaction.insert(trainingDrillVersions).values({
          id: versionId,
          drillId,
          version: number,
          snapshot: { kind: "training-drill/w3", ...request },
          changeNote: input.changeNote?.trim() || null,
          createdByPersonId: context.actor.personId,
          createdAt: context.now,
        });
        const document = input.scene ?? previousScene;
        let sceneStatus: string | undefined;
        if (document) {
          const scene = sceneValues({ document, source: "coach" }, versionId, context);
          sceneStatus = scene.validationStatus;
          await transaction.insert(trainingDrillScenes).values(scene);
          const derived = scene.derived;
          if (derived.touchesPerRep !== undefined || derived.jumpsPerRep !== undefined) {
            // Estimates from the scene: reps per drill ≈ one every 20 seconds of work.
            const reps = Math.max(1, Math.round((input.durationMinutes * 60) / 20));
            const touches = Math.round((derived.touchesPerRep ?? 0) * reps);
            await transaction
              .update(trainingDrills)
              .set({
                touchEstimateLow: Math.round(touches * 0.8),
                touchEstimateTypical: touches,
                touchEstimateHigh: Math.round(touches * 1.2),
                jumpEstimateTypical: Math.round((derived.jumpsPerRep ?? 0) * reps),
              })
              .where(eq(trainingDrills.id, drillId));
          }
        }
        await upsertFocusTag(transaction, context, drillId, input.focus);
        if (existing && existing.reviewState !== "not-submitted" && existing.reviewState !== "rejected") {
          // A new version needs its own review before it can be listed.
          await transaction
            .update(trainingDrills)
            .set({ reviewState: "not-submitted" })
            .where(eq(trainingDrills.id, drillId));
        }
        await audit(transaction, context, {
          action: existing ? "training-drill.versioned" : "training-drill.created",
          entityType: "training-drill",
          entityId: drillId,
          after: { version: number, scope: input.scope },
          reason: `Saved drill version ${number}${document ? ` with a ${sceneStatus} scene` : ""}.`,
        });
        return { number, sceneStatus };
      });
      log.info("training-drills.drill.saved", {
        organizationId: context.organizationId,
        drillId,
        version: validity.number,
        scene: validity.sceneStatus ?? "none",
      });
      return { id: drillId };
    },
    serializeResult: (value) => value,
  });
  return detailOf(context, await loadVisibleDrill(context, result.id));
}

export async function setScope(
  context: TrainingContext,
  input: { readonly drillId: string; readonly scope: "personal" | "club" },
): Promise<Detail> {
  const row = await loadVisibleDrill(context, input.drillId);
  assertCanEdit(context, row);
  if (row.scope === input.scope) return detailOf(context, row);
  if (input.scope === "personal" && row.createdByPersonId !== context.actor.personId) {
    forbidden("Only the author can make a club drill theirs again.");
  }
  await getTransactionalDatabase().transaction(async (transaction) => {
    await transaction
      .update(trainingDrills)
      .set({
        scope: input.scope,
        ownerPersonId: input.scope === "personal" ? context.actor.personId : null,
        ...(input.scope === "club" && row.status === "draft" ? { status: "published" } : {}),
        updatedAt: context.now,
      })
      .where(eq(trainingDrills.id, row.id));
    await audit(transaction, context, {
      action: "training-drill.scope-changed",
      entityType: "training-drill",
      entityId: row.id,
      before: { scope: row.scope },
      after: { scope: input.scope },
      reason: input.scope === "club" ? "Shared with the club." : "Made private.",
    });
  });
  log.info("training-drills.drill.scope-changed", {
    organizationId: context.organizationId,
    drillId: row.id,
    scope: input.scope,
  });
  return detailOf(context, await loadVisibleDrill(context, row.id));
}

const PERSONAL_DATA = [
  { pattern: /[\w.+-]+@[\w-]+\.[\w.]+/, note: "an email address" },
  { pattern: /(?:\+?\d[\s().-]?){9,}/, note: "a phone number" },
  { pattern: /(^|\s)@[a-z0-9_.]{3,}/i, note: "a social handle" },
  { pattern: /https?:\/\/\S+\.(?:jpe?g|png|heic|webp|gif|mp4|mov)\b/i, note: "a link to a photo or video" },
];

/** Text a public listing would show, scanned for personal data. */
export function personalDataFindings(texts: readonly string[]): string[] {
  const joined = texts.join("\n");
  return PERSONAL_DATA.filter((rule) => rule.pattern.test(joined)).map((rule) => rule.note);
}

export async function submitForReview(
  context: TrainingContext,
  input: { readonly drillId: string; readonly drillVersionId: string },
): Promise<Detail> {
  const row = await loadVisibleDrill(context, input.drillId);
  assertCanEdit(context, row);
  if (row.currentVersionId !== input.drillVersionId) {
    conflict("Submit the drill's latest version.");
  }
  if (row.reviewState === "checks-running" || row.reviewState === "in-review" || row.reviewState === "approved") {
    return detailOf(context, row);
  }
  const outcome = await getTransactionalDatabase().transaction(async (transaction) => {
    await copyLegacyScene(transaction, context, row);
    const [scene] = await transaction
      .select()
      .from(trainingDrillScenes)
      .where(eq(trainingDrillScenes.drillVersionId, input.drillVersionId));
    const sceneOk = scene?.validationStatus === "valid";
    const people = Array.isArray(scene?.document?.people) ? scene!.document.people : [];
    const findings = personalDataFindings([
      row.title,
      row.summary,
      row.purpose,
      row.targetAudience,
      row.descriptionMarkdown,
      ...strings(record(row.coaching).cues),
      JSON.stringify(record(scene?.document).teaching ?? {}),
      ...people.map((person) => JSON.stringify(person)),
    ]);
    const checks = [
      {
        kind: "scene-valid",
        status: sceneOk ? "ok" : "failed",
        note: sceneOk
          ? null
          : scene
            ? (scene.validationIssues[0]?.message ?? "The scene has problems.")
            : "Add a scene that passes the checks.",
      },
      {
        kind: "no-personal-data",
        status: findings.length === 0 ? "ok" : "failed",
        note: findings.length === 0 ? null : `Remove ${findings.join(", ")}.`,
      },
      { kind: "duna-review", status: "waiting", note: null },
    ];
    for (const check of checks) {
      await transaction
        .insert(trainingDrillReviewChecks)
        .values({
          drillVersionId: input.drillVersionId,
          kind: check.kind,
          status: check.status,
          note: check.note,
          decidedAt: check.status === "waiting" ? null : context.now,
          createdAt: context.now,
          updatedAt: context.now,
        })
        .onConflictDoUpdate({
          target: [trainingDrillReviewChecks.drillVersionId, trainingDrillReviewChecks.kind],
          set: {
            status: check.status,
            note: check.note,
            decidedAt: check.status === "waiting" ? null : context.now,
            updatedAt: context.now,
          },
        });
    }
    const passed = sceneOk && findings.length === 0;
    const reviewState = passed ? "in-review" : "changes-requested";
    await transaction
      .update(trainingDrills)
      .set({ reviewState, status: passed ? "review" : row.status, updatedAt: context.now })
      .where(eq(trainingDrills.id, row.id));
    await audit(transaction, context, {
      action: "training-drill.review-submitted",
      entityType: "training-drill",
      entityId: row.id,
      after: { reviewState, versionId: input.drillVersionId },
      reason: passed
        ? "Automatic checks passed; waiting for Duna review."
        : "Automatic checks found problems; changes requested.",
    });
    return { reviewState, sceneOk, findings: findings.length };
  });
  log.info("training-drills.drill.review-submitted", {
    organizationId: context.organizationId,
    drillId: row.id,
    reviewState: outcome.reviewState,
    sceneOk: outcome.sceneOk,
    personalDataFindings: outcome.findings,
  });
  return detailOf(context, await loadVisibleDrill(context, row.id));
}

// ------------------------------------------------------------------ listings

function storefrontOff(): never {
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message: "The drill store is switched off.",
  });
}

export async function saveListing(
  context: TrainingContext,
  input: z.infer<typeof trainingDrillsSaveListingInputSchema>,
  storefrontEnabled: boolean,
): Promise<Listing> {
  if (!storefrontEnabled) storefrontOff();
  const row = await loadVisibleDrill(context, input.drillId);
  assertCanEdit(context, row);
  if (input.sellAs === "organization" && (row.scope !== "club" || !isTrainingManager(context.actor))) {
    forbidden("A manager lists the club's drills for the club.");
  }
  if (input.sellAs === "person" && row.createdByPersonId !== context.actor.personId) {
    forbidden("Only the author can list a drill in their own name.");
  }
  const [version] = await getDatabase()
    .select({ id: trainingDrillVersions.id })
    .from(trainingDrillVersions)
    .where(and(eq(trainingDrillVersions.id, input.drillVersionId), eq(trainingDrillVersions.drillId, row.id)));
  if (!version) notFound("This drill version was not found.");
  if (input.pricing === "paid" && marketplaceFeeBps() === undefined) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Paid listings are not configured yet.",
    });
  }
  const approved = row.reviewState === "approved" && row.currentVersionId === input.drillVersionId;
  const status = approved ? "listed" : "pending-review";
  const values = {
    drillVersionId: input.drillVersionId,
    sellerOrganizationId: input.sellAs === "organization" ? context.organizationId : null,
    sellerPersonId: input.sellAs === "person" ? context.actor.personId : null,
    status,
    pricing: input.pricing,
    priceMinor: input.price.amountMinor,
    currency: input.price.currency,
    licenseTerms: input.licenseTerms.trim(),
    listedAs: input.listedAs.trim(),
    listedAt: approved ? context.now : null,
    delistedAt: null,
    updatedAt: context.now,
  };
  const saved = await getTransactionalDatabase().transaction(async (transaction) => {
    const [current] = await transaction
      .select()
      .from(trainingDrillListings)
      .where(
        and(
          eq(trainingDrillListings.drillId, row.id),
          inArray(trainingDrillListings.status, [...ACTIVE_LISTING]),
        ),
      )
      .for("update");
    const [listing] = current
      ? await transaction
          .update(trainingDrillListings)
          .set(values)
          .where(eq(trainingDrillListings.id, current.id))
          .returning()
      : await transaction
          .insert(trainingDrillListings)
          .values({ ...values, drillId: row.id, createdAt: context.now })
          .returning();
    await audit(transaction, context, {
      action: approved ? "training-drill.listed" : "training-drill.listing-saved",
      entityType: "training-drill-listing",
      entityId: listing!.id,
      ...(current ? { before: { status: current.status } } : {}),
      after: { status, pricing: input.pricing, priceMinor: input.price.amountMinor },
      reason: approved
        ? "Listed in the drill store (review approved)."
        : "Listing saved; it goes live once Duna review approves the drill.",
    });
    return listing!;
  });
  log.info("training-drills.listing.saved", {
    organizationId: context.organizationId,
    drillId: row.id,
    listingId: saved.id,
    status,
    pricing: input.pricing,
  });
  return listingOut(saved, (await sellerNames([saved]))(saved));
}

async function loadOwnListing(context: TrainingContext, listingId: string) {
  const [row] = await getDatabase()
    .select()
    .from(trainingDrillListings)
    .where(
      and(
        eq(trainingDrillListings.id, listingId),
        or(
          eq(trainingDrillListings.sellerOrganizationId, context.organizationId),
          eq(trainingDrillListings.sellerPersonId, context.actor.personId),
        ),
      ),
    );
  if (!row) notFound("This listing was not found.");
  return row;
}

export async function delist(context: TrainingContext, listingId: string): Promise<Listing> {
  const listing = await loadOwnListing(context, listingId);
  if (listing.sellerOrganizationId && !isTrainingManager(context.actor)) {
    forbidden("A manager takes the club's listings down.");
  }
  if (listing.status === "delisted" || listing.status === "rejected") {
    return listingOut(listing, (await sellerNames([listing]))(listing));
  }
  const [saved] = await getTransactionalDatabase().transaction(async (transaction) => {
    const rows = await transaction
      .update(trainingDrillListings)
      .set({ status: "delisted", delistedAt: context.now, updatedAt: context.now })
      .where(eq(trainingDrillListings.id, listing.id))
      .returning();
    await audit(transaction, context, {
      action: "training-drill.delisted",
      entityType: "training-drill-listing",
      entityId: listing.id,
      before: { status: listing.status },
      after: { status: "delisted" },
      reason: "Taken out of the drill store; existing purchases keep access.",
    });
    return rows;
  });
  log.info("training-drills.listing.delisted", {
    organizationId: context.organizationId,
    listingId: listing.id,
  });
  return listingOut(saved!, (await sellerNames([saved!]))(saved!));
}

/** Listed drills, optionally excluding the viewer's own club's listings. */
export async function store(
  viewer: { readonly actor?: ApiActor; readonly organizationId?: string },
  filters: Filters,
  enabled: boolean,
): Promise<{ enabled: boolean; items: { listing: Listing; drill: Summary }[] }> {
  if (!enabled) return { enabled: false, items: [] };
  const rows = await getDatabase()
    .select({ listing: trainingDrillListings, drill: trainingDrills })
    .from(trainingDrillListings)
    .innerJoin(trainingDrills, eq(trainingDrills.id, trainingDrillListings.drillId))
    .where(
      and(
        eq(trainingDrillListings.status, "listed"),
        ne(trainingDrills.status, "archived"),
        viewer.organizationId
          ? or(
              isNull(trainingDrillListings.sellerOrganizationId),
              ne(trainingDrillListings.sellerOrganizationId, viewer.organizationId),
            )
          : undefined,
        ...filterConditions(filters),
      ),
    )
    .orderBy(desc(trainingDrillListings.listedAt))
    .limit(STORE_LIMIT);
  const drillSummaries = await summaries(
    viewer,
    rows.map((row) => row.drill),
  );
  const name = await sellerNames(rows.map((row) => row.listing));
  return {
    enabled: true,
    items: rows.map((row, index) => ({
      listing: listingOut(row.listing, name(row.listing)),
      drill: drillSummaries[index]!,
    })),
  };
}

export async function publicListing(listingId: string, enabled: boolean) {
  if (!enabled) notFound("This listing was not found.");
  const [row] = await getDatabase()
    .select({ listing: trainingDrillListings, drill: trainingDrills })
    .from(trainingDrillListings)
    .innerJoin(trainingDrills, eq(trainingDrills.id, trainingDrillListings.drillId))
    .where(and(eq(trainingDrillListings.id, listingId), eq(trainingDrillListings.status, "listed")));
  if (!row) notFound("This listing was not found.");
  const [summary] = await summaries({}, [row.drill]);
  return {
    listing: listingOut(row.listing, (await sellerNames([row.listing]))(row.listing)),
    drill: summary!,
  };
}

// ----------------------------------------------------------------- purchases

function purchaseOut(row: typeof trainingDrillPurchases.$inferSelect, drillId: string): Purchase {
  return {
    id: row.id,
    listingId: row.listingId,
    drillId,
    status: row.status as Purchase["status"],
    price: {
      amountMinor: row.priceMinor,
      currency: row.currency as Listing["price"]["currency"],
    },
    buyer: row.buyerOrganizationId
      ? { kind: "organization", id: row.buyerOrganizationId }
      : { kind: "person", id: row.buyerPersonId! },
    checkoutRequired: row.status === "pending" && row.priceMinor > 0,
    ...(row.orderId ? { orderId: row.orderId } : {}),
    ...(row.licenseId ? { licenseId: row.licenseId } : {}),
    ...(row.completedAt ? { completedAt: row.completedAt.toISOString() } : {}),
  };
}

export async function purchase(
  context: TrainingContext,
  input: { readonly listingId: string; readonly buyAs: "organization" | "person"; readonly idempotencyKey: string },
  enabled: boolean,
): Promise<Purchase> {
  if (!enabled) storefrontOff();
  if (input.buyAs === "organization" && !isTrainingManager(context.actor)) {
    forbidden("A manager buys drills for the club.");
  }
  const [listing] = await getDatabase()
    .select()
    .from(trainingDrillListings)
    .where(and(eq(trainingDrillListings.id, input.listingId), eq(trainingDrillListings.status, "listed")));
  if (!listing) notFound("This listing was not found.");
  if (
    listing.sellerOrganizationId === context.organizationId ||
    listing.sellerPersonId === context.actor.personId
  ) {
    conflict("This drill is already yours.");
  }
  const buyer =
    input.buyAs === "organization"
      ? { buyerOrganizationId: context.organizationId, buyerPersonId: null }
      : { buyerOrganizationId: null, buyerPersonId: context.actor.personId };
  const { result } = await executeIdempotent({
    key: `${context.organizationId}:${input.idempotencyKey}`,
    procedure: "trainingDrills.purchase",
    personId: context.actor.personId,
    organizationId: context.organizationId,
    request: { listingId: input.listingId, buyAs: input.buyAs },
    now: context.now,
    execute: async () => {
      const free = listing.priceMinor === 0;
      const id = await getTransactionalDatabase().transaction(async (transaction) => {
        const [held] = await transaction
          .select({ id: trainingDrillPurchases.id })
          .from(trainingDrillPurchases)
          .where(
            and(
              eq(trainingDrillPurchases.listingId, listing.id),
              inArray(trainingDrillPurchases.status, ["pending", "complete"]),
              buyer.buyerOrganizationId
                ? eq(trainingDrillPurchases.buyerOrganizationId, buyer.buyerOrganizationId)
                : eq(trainingDrillPurchases.buyerPersonId, buyer.buyerPersonId!),
            ),
          )
          .limit(1);
        if (held) return held.id;
        const [created] = await transaction
          .insert(trainingDrillPurchases)
          .values({
            listingId: listing.id,
            ...buyer,
            status: free ? "complete" : "pending",
            priceMinor: listing.priceMinor,
            currency: listing.currency,
            purchasedByPersonId: context.actor.personId,
            completedAt: free ? context.now : null,
            createdAt: context.now,
            updatedAt: context.now,
          })
          .returning({ id: trainingDrillPurchases.id });
        await audit(transaction, context, {
          action: free ? "training-drill.purchase-completed" : "training-drill.purchase-started",
          entityType: "training-drill-purchase",
          entityId: created!.id,
          after: { listingId: listing.id, buyAs: input.buyAs, priceMinor: listing.priceMinor },
          reason: free
            ? "Took a free drill from the store."
            : "Started a paid drill purchase; it completes when the person finishes checkout.",
        });
        return created!.id;
      });
      log.info("training-drills.purchase.recorded", {
        organizationId: context.organizationId,
        purchaseId: id,
        listingId: listing.id,
        free,
      });
      return { id };
    },
    serializeResult: (value) => value,
  });
  const [row] = await getDatabase()
    .select()
    .from(trainingDrillPurchases)
    .where(eq(trainingDrillPurchases.id, result.id));
  return purchaseOut(row!, listing.drillId);
}

export async function purchases(context: TrainingContext): Promise<{ items: Purchase[] }> {
  const rows = await getDatabase()
    .select({ purchase: trainingDrillPurchases, drillId: trainingDrillListings.drillId })
    .from(trainingDrillPurchases)
    .innerJoin(trainingDrillListings, eq(trainingDrillListings.id, trainingDrillPurchases.listingId))
    .where(
      or(
        eq(trainingDrillPurchases.buyerOrganizationId, context.organizationId),
        eq(trainingDrillPurchases.buyerPersonId, context.actor.personId),
      ),
    )
    .orderBy(desc(trainingDrillPurchases.createdAt))
    .limit(200);
  return { items: rows.map((row) => purchaseOut(row.purchase, row.drillId)) };
}

// ------------------------------------------------------------------- player

/**
 * A drill an athlete may open: published, and either from the Duna library,
 * listed in the store, or used in a plan attached to a session of a program
 * the athlete (or their junior) is on. Review details and listings are not
 * shown; only the current version is.
 */
export async function playerDrill(
  actor: ApiActor,
  drillId: string,
  followedPersonIds: readonly string[],
  now: Date,
): Promise<Detail> {
  const [row] = await getDatabase()
    .select()
    .from(trainingDrills)
    .where(and(eq(trainingDrills.id, drillId), eq(trainingDrills.status, "published")));
  if (!row) notFound("This drill was not found.");
  let allowed = row.scope === "duna" && row.organizationId === null;
  if (!allowed) {
    const [listed] = await getDatabase()
      .select({ id: trainingDrillListings.id })
      .from(trainingDrillListings)
      .where(and(eq(trainingDrillListings.drillId, row.id), eq(trainingDrillListings.status, "listed")))
      .limit(1);
    allowed = Boolean(listed);
  }
  if (!allowed && followedPersonIds.length > 0) {
    const [used] = await getDatabase()
      .select({ id: trainingEvents.id })
      .from(trainingEvents)
      .innerJoin(
        trainingProgramParticipants,
        eq(trainingProgramParticipants.programId, trainingEvents.programId),
      )
      .innerJoin(
        trainingPracticePlanBlocks,
        eq(trainingPracticePlanBlocks.practicePlanVersionId, trainingEvents.practicePlanVersionId),
      )
      .innerJoin(trainingDrillVersions, eq(trainingDrillVersions.id, trainingPracticePlanBlocks.drillVersionId))
      .where(
        and(
          eq(trainingDrillVersions.drillId, row.id),
          inArray(trainingProgramParticipants.personId, [...followedPersonIds]),
          inArray(trainingProgramParticipants.status, ["active", "invited", "completed"]),
          ne(trainingEvents.status, "cancelled"),
        ),
      )
      .limit(1);
    allowed = Boolean(used);
  }
  if (!allowed) notFound("This drill was not found.");
  return detailOf(
    {
      actor,
      organizationId: row.organizationId ?? "00000000-0000-4000-8000-000000000000",
      requestId: "player",
      now,
    },
    row,
    { forPlayer: true },
  );
}
