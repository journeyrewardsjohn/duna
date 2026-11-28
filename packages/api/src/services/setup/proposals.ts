/**
 * Review and apply. A person decides every proposal (Keep / Edit / Skip, or
 * keep a whole group); only kept and edited proposals are written to the
 * club's real records, one transaction per group, each write audited (who,
 * when, which run and proposal). Applying is idempotent: a proposal moves
 * kept|edited → applied exactly once, and a replayed idempotency key returns
 * the first report. Prices and policies are written as drafts, never
 * published; people named on a site become draft staff, never invited.
 */
import { createHash, randomBytes } from "node:crypto";
import {
  auditLog,
  catalogItems,
  catalogItemVersions,
  catalogPrices,
  catalogVariants,
  courts,
  organizationBrandKnowledgeSources,
  organizationProfiles,
  organizationRefundPolicies,
  organizations,
  organizationStaffProfiles,
  organizationThemes,
  people,
  setupProposals,
  setupRuns,
  venues,
} from "@duna/db";
import { log } from "@duna/observability";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { stableHash } from "../../canonical";
import type { SetupProposal } from "../../contracts/setup";
import { executeIdempotent } from "../../idempotency";
import { SetupDecisionError, validateDecisionPayload } from "./decision-rules";
import {
  policyNoteTitle,
  proposalToContract,
  setupDatabase,
  type SetupProposalRow,
  type SetupTransaction,
} from "./records";
import { normaliseKey, type SetupCategory } from "./validate";

const nanpCountries = new Set(["US", "CA", "PR", "GU", "VI", "AS", "MP"]);

async function callingCodeFor(organizationId: string): Promise<string> {
  const [organization] = await setupDatabase()
    .select({ countryCode: organizations.countryCode })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  return nanpCountries.has(organization?.countryCode ?? "US") ? "1" : "";
}

async function runFor(organizationId: string, runId: string) {
  const [run] = await setupDatabase()
    .select()
    .from(setupRuns)
    .where(
      and(
        eq(setupRuns.id, runId),
        eq(setupRuns.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!run)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "That setup run was not found.",
    });
  return run;
}

export async function listSetupProposals(input: {
  readonly organizationId: string;
  readonly runId: string;
}): Promise<{ runId: string; proposals: SetupProposal[] }> {
  await runFor(input.organizationId, input.runId);
  const rows = await setupDatabase()
    .select()
    .from(setupProposals)
    .where(
      and(
        eq(setupProposals.runId, input.runId),
        eq(setupProposals.organizationId, input.organizationId),
      ),
    )
    .orderBy(asc(setupProposals.createdAt), asc(setupProposals.id));
  return { runId: input.runId, proposals: rows.map(proposalToContract) };
}

const decidable = ["pending", "kept", "edited", "skipped"] as const;

function decisionError(error: unknown): never {
  if (error instanceof SetupDecisionError) {
    throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
  }
  throw error;
}

export type SetupDecision =
  | { readonly proposalId: string; readonly decision: "kept" | "skipped" }
  | {
      readonly proposalId: string;
      readonly decision: "edited";
      readonly editedPayload: Record<string, unknown>;
    };

/** Keep, Edit or Skip one proposal. Edits pass the same rules as the model's values. */
export async function decideSetupProposal(input: {
  readonly organizationId: string;
  readonly personId: string;
  readonly decision: SetupDecision;
  readonly now: Date;
}): Promise<SetupProposal> {
  const database = setupDatabase();
  const [row] = await database
    .select()
    .from(setupProposals)
    .where(
      and(
        eq(setupProposals.id, input.decision.proposalId),
        eq(setupProposals.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  if (!row)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "That item was not found.",
    });
  const run = await runFor(input.organizationId, row.runId);
  if (run.status !== "review" && run.status !== "applied") {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Duna is still reading. You can review once it has finished.",
    });
  }
  if (!(decidable as readonly string[]).includes(row.decision)) {
    throw new TRPCError({
      code: "CONFLICT",
      message:
        row.decision === "applied"
          ? "This item is already part of your club."
          : "A newer read replaced this item.",
    });
  }
  const callingCode = await callingCodeFor(input.organizationId);
  let editedPayload: Record<string, unknown> | null = null;
  try {
    if (input.decision.decision === "edited") {
      editedPayload = validateDecisionPayload(
        row.fieldKey,
        input.decision.editedPayload,
        callingCode,
      );
    } else if (input.decision.decision === "kept") {
      validateDecisionPayload(row.fieldKey, row.payload, callingCode);
    }
  } catch (error) {
    decisionError(error);
  }
  const [updated] = await database
    .update(setupProposals)
    .set({
      decision: input.decision.decision,
      editedPayload,
      decidedByPersonId: input.personId,
      decidedAt: input.now,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(setupProposals.id, row.id),
        inArray(setupProposals.decision, [...decidable]),
      ),
    )
    .returning();
  if (!updated) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "This item changed meanwhile. Reload and try again.",
    });
  }
  return proposalToContract(updated);
}

/**
 * Bulk Keep (or Skip) for one group. Items that would not pass the rules as
 * they are (a phone that is not a full number, two conflicting values) are
 * left for the person and reported back still pending.
 */
export async function decideSetupProposalGroup(input: {
  readonly organizationId: string;
  readonly personId: string;
  readonly runId: string;
  readonly category: SetupCategory;
  readonly decision: "kept" | "skipped";
  readonly now: Date;
}): Promise<{ runId: string; proposals: SetupProposal[] }> {
  const rows = await setupDatabase()
    .select()
    .from(setupProposals)
    .where(
      and(
        eq(setupProposals.runId, input.runId),
        eq(setupProposals.organizationId, input.organizationId),
        eq(setupProposals.category, input.category),
        eq(setupProposals.decision, "pending"),
      ),
    );
  for (const row of rows) {
    if (input.decision === "kept" && row.candidates.length > 1) continue;
    try {
      await decideSetupProposal({
        organizationId: input.organizationId,
        personId: input.personId,
        decision: { proposalId: row.id, decision: input.decision },
        now: input.now,
      });
    } catch (error) {
      if (error instanceof TRPCError && error.code === "BAD_REQUEST") continue;
      throw error;
    }
  }
  return listSetupProposals(input);
}

interface AppliedEntity {
  readonly type: string;
  readonly id: string;
}

interface ApplyContext {
  readonly tx: SetupTransaction;
  readonly organizationId: string;
  readonly personId: string;
  readonly run: typeof setupRuns.$inferSelect;
  readonly now: Date;
}

const sourceFor = (run: ApplyContext["run"]) =>
  run.sourceKind === "description"
    ? ("description" as const)
    : run.sourceKind === "google-listing"
      ? ("google-listing" as const)
      : ("website" as const);

async function ensureProfile(context: ApplyContext) {
  const [existing] = await context.tx
    .select()
    .from(organizationProfiles)
    .where(eq(organizationProfiles.organizationId, context.organizationId))
    .for("update");
  if (existing) return existing;
  const [created] = await context.tx
    .insert(organizationProfiles)
    .values({
      organizationId: context.organizationId,
      createdAt: context.now,
      updatedAt: context.now,
    })
    .returning();
  return created!;
}

/** Writes one profile field with its provenance ("From your website" until confirmed). */
async function writeProfileField(
  context: ApplyContext,
  row: SetupProposalRow,
  field: "tagline" | "about" | "phoneE164" | "email" | "hours" | "socials",
  value: unknown,
): Promise<AppliedEntity> {
  const profile = await ensureProfile(context);
  const edited = row.decision === "edited";
  const fieldSources = {
    ...profile.fieldSources,
    [field]: edited
      ? { source: "person" as const, confirmed: true }
      : {
          source: sourceFor(context.run),
          page: row.sourcePages[0],
          confirmed: false,
        },
  };
  const websiteFacts =
    context.run.sourceKind === "website" && context.run.sourceUrl
      ? {
          websiteUrl: profile.websiteUrl ?? context.run.sourceUrl,
          websiteLastReadAt: context.run.finishedAt ?? context.now,
        }
      : {};
  await context.tx
    .update(organizationProfiles)
    .set({
      [field]: value,
      fieldSources,
      ...websiteFacts,
      updatedByPersonId: context.personId,
      updatedAt: context.now,
    })
    .where(eq(organizationProfiles.organizationId, context.organizationId));
  return { type: "organization_profile", id: context.organizationId };
}

async function ensureTheme(context: ApplyContext) {
  await context.tx
    .insert(organizationThemes)
    .values({
      organizationId: context.organizationId,
      createdAt: context.now,
      updatedAt: context.now,
    })
    .onConflictDoNothing();
  const [theme] = await context.tx
    .select()
    .from(organizationThemes)
    .where(eq(organizationThemes.organizationId, context.organizationId))
    .for("update");
  return theme!;
}

function slugify(value: string, fallback: string): string {
  const slug = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || fallback;
}

const randomSuffix = () => randomBytes(3).toString("hex");

async function applyVenue(
  context: ApplyContext,
  value: Record<string, unknown>,
): Promise<AppliedEntity> {
  const name = String(value.name);
  const address = (value.address ?? {}) as Record<string, string | undefined>;
  const courtCount =
    typeof value.courtCount === "number" ? value.courtCount : 0;
  const surface = typeof value.surface === "string" ? value.surface : "sand";
  const existingVenues = await context.tx
    .select({ id: venues.id, name: venues.name })
    .from(venues)
    .where(eq(venues.organizationId, context.organizationId));
  const match = existingVenues.find(
    (venue) => normaliseKey(venue.name) === normaliseKey(name),
  );
  const [organization] = await context.tx
    .select()
    .from(organizations)
    .where(eq(organizations.id, context.organizationId))
    .for("update");
  let venueId = match?.id;
  if (!venueId) {
    const [venue] = await context.tx
      .insert(venues)
      .values({
        organizationId: context.organizationId,
        slug: `${slugify(name, "venue")}-${randomSuffix()}`,
        name,
        status: "draft",
        environment: value.environment === "indoor" ? "indoor" : "outdoor",
        addressLine1: address.line1 ?? null,
        locality: address.locality ?? null,
        administrativeArea: address.administrativeArea ?? null,
        postalCode: address.postalCode ?? null,
        countryCode: address.countryCode ?? organization?.countryCode ?? "US",
        timezone: organization?.timezone ?? "America/New_York",
        createdAt: context.now,
        updatedAt: context.now,
      })
      .returning({ id: venues.id });
    venueId = venue!.id;
  }
  // Courts are only ever added, never removed or renamed.
  const existingCourts = await context.tx
    .select({ name: courts.name })
    .from(courts)
    .where(eq(courts.venueId, venueId));
  const names = new Set(existingCourts.map((court) => court.name));
  const toAdd: string[] = [];
  for (let n = 1; names.size + toAdd.length < courtCount && n <= 200; n += 1) {
    const courtName = `Court ${n}`;
    if (!names.has(courtName)) toAdd.push(courtName);
  }
  if (toAdd.length) {
    await context.tx.insert(courts).values(
      toAdd.map((courtName) => ({
        venueId: venueId!,
        name: courtName,
        surface:
          surface === "wood" || surface === "synthetic" ? "indoor" : surface,
        status: "draft" as const,
        qrToken: randomBytes(24).toString("hex"),
        createdAt: context.now,
        updatedAt: context.now,
      })),
    );
  }
  // The club's own address is filled only when it has none.
  if (organization && !organization.addressLine1 && address.line1) {
    await context.tx
      .update(organizations)
      .set({
        addressLine1: address.line1,
        locality: address.locality ?? organization.locality,
        administrativeArea:
          address.administrativeArea ?? organization.administrativeArea,
        postalCode: address.postalCode ?? organization.postalCode,
        updatedAt: context.now,
      })
      .where(eq(organizations.id, context.organizationId));
  }
  return { type: "venue", id: venueId };
}

async function applyOffering(
  context: ApplyContext,
  row: SetupProposalRow,
  value: Record<string, unknown>,
): Promise<AppliedEntity> {
  const title = String(value.title);
  const [type, subtype] = String(value.kind).split("/") as [string, string];
  const price = value.price as {
    amountMinor: number;
    currency: string;
    wording?: string;
    per?: string;
  } | null;
  const existing = (
    await context.tx
      .select({
        id: catalogItems.id,
        title: catalogItems.title,
        configuration: catalogItems.configuration,
      })
      .from(catalogItems)
      .where(eq(catalogItems.organizationId, context.organizationId))
  ).find((item) => normaliseKey(item.title) === normaliseKey(title));
  const suggestion = {
    runId: context.run.id,
    proposalId: row.id,
    ...(price ? { price } : {}),
    decidedAt: context.now.toISOString(),
  };
  if (existing) {
    // A live offering's price never changes from a website read: the
    // suggestion is stored on the offering for its owner to review.
    await context.tx
      .update(catalogItems)
      .set({
        configuration: {
          ...existing.configuration,
          setupSuggestion: suggestion,
        },
        updatedAt: context.now,
      })
      .where(eq(catalogItems.id, existing.id));
    return { type: "catalog_item", id: existing.id };
  }
  const itemId = crypto.randomUUID();
  const variantId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const configuration = {
    ...(typeof value.durationMinutes === "number"
      ? { durationMinutes: value.durationMinutes }
      : {}),
    setupSource: suggestion,
    ...(type === "good" ? { saleEnabled: false } : {}),
  };
  await context.tx.insert(catalogItems).values({
    id: itemId,
    organizationId: context.organizationId,
    type: type as typeof catalogItems.$inferInsert.type,
    subtype,
    slug: `${slugify(title, "offering")}-${randomSuffix()}`,
    title,
    shortSummary:
      typeof value.description === "string"
        ? value.description.slice(0, 280)
        : null,
    description:
      typeof value.description === "string" ? value.description : null,
    status: "draft",
    visibility: "private",
    allowCard: true,
    configuration,
    currentVersionId: versionId,
    createdByPersonId: context.personId,
    createdAt: context.now,
    updatedAt: context.now,
  });
  await context.tx.insert(catalogVariants).values({
    id: variantId,
    organizationId: context.organizationId,
    catalogItemId: itemId,
    title,
    status: "active",
    createdAt: context.now,
    updatedAt: context.now,
  });
  if (price) {
    await context.tx.insert(catalogPrices).values({
      organizationId: context.organizationId,
      catalogItemId: itemId,
      catalogVariantId: variantId,
      audience: "everyone",
      paymentKind: "card",
      amountMinor: price.amountMinor,
      currency: price.currency,
      active: true,
      createdAt: context.now,
      updatedAt: context.now,
    });
  }
  await context.tx.insert(catalogItemVersions).values({
    id: versionId,
    organizationId: context.organizationId,
    catalogItemId: itemId,
    version: 1,
    snapshot: { type, subtype, title, status: "draft", configuration, price },
    createdByPersonId: context.personId,
    createdAt: context.now,
  });
  return { type: "catalog_item", id: itemId };
}

async function applyTeamMember(
  context: ApplyContext,
  value: Record<string, unknown>,
): Promise<AppliedEntity> {
  const displayName = String(value.displayName);
  const [person] = await context.tx
    .insert(people)
    .values({
      displayName,
      handle: `${slugify(displayName, "staff").slice(0, 32)}-${randomSuffix()}`,
      profileClaimStatus: "unclaimed",
      createdAt: context.now,
      updatedAt: context.now,
    })
    .returning({ id: people.id });
  const [profile] = await context.tx
    .insert(organizationStaffProfiles)
    .values({
      organizationId: context.organizationId,
      personId: person!.id,
      staffRole: String(value.role),
      active: false,
      createdAt: context.now,
      updatedAt: context.now,
    })
    .returning({ id: organizationStaffProfiles.id });
  return { type: "organization_staff_profile", id: profile!.id };
}

async function applyPolicy(
  context: ApplyContext,
  row: SetupProposalRow,
  value: Record<string, unknown>,
): Promise<AppliedEntity> {
  const kind = String(value.kind);
  const title = String(value.title);
  const summary = String(value.summary);
  const refundBeforeMinutes =
    typeof value.refundBeforeMinutes === "number"
      ? value.refundBeforeMinutes
      : null;
  if (
    (kind === "cancellation" || kind === "refund") &&
    refundBeforeMinutes !== null
  ) {
    const [{ version }] = (await context.tx
      .select({
        version: sql<number>`coalesce(max(${organizationRefundPolicies.version}), 0)::int + 1`,
      })
      .from(organizationRefundPolicies)
      .where(
        and(
          eq(organizationRefundPolicies.organizationId, context.organizationId),
          eq(organizationRefundPolicies.name, title),
        ),
      )) as [{ version: number }];
    const [policy] = await context.tx
      .insert(organizationRefundPolicies)
      .values({
        organizationId: context.organizationId,
        name: title,
        mode: "refundable",
        refundBeforeMinutes,
        terms: summary,
        version,
        isDefault: false,
        // A draft: never applied to a sale until a person turns it on.
        active: false,
        createdAt: context.now,
        updatedAt: context.now,
      })
      .returning({ id: organizationRefundPolicies.id });
    return { type: "organization_refund_policy", id: policy!.id };
  }
  const contentText = `${summary}\n\nFrom your website (${row.sourcePages[0] ?? "/"}), reviewed in Club setup.`;
  const [note] = await context.tx
    .insert(organizationBrandKnowledgeSources)
    .values({
      organizationId: context.organizationId,
      scope: "organization",
      kind: "note",
      title: policyNoteTitle(kind, title),
      contentText,
      contentHash: createHash("sha256").update(contentText).digest("hex"),
      status: "ready",
      approvedByPersonId: context.personId,
      approvedAt: context.now,
      createdAt: context.now,
      updatedAt: context.now,
    })
    .returning({ id: organizationBrandKnowledgeSources.id });
  return { type: "organization_knowledge_note", id: note!.id };
}

async function applyOne(
  context: ApplyContext,
  row: SetupProposalRow,
  callingCode: string,
): Promise<AppliedEntity> {
  const value = validateDecisionPayload(
    row.fieldKey,
    row.decision === "edited" && row.editedPayload
      ? row.editedPayload
      : row.payload,
    callingCode,
  );
  switch (row.fieldKey) {
    case "identity.name":
      await context.tx
        .update(organizations)
        .set({ name: String(value.value), updatedAt: context.now })
        .where(eq(organizations.id, context.organizationId));
      return { type: "organization", id: context.organizationId };
    case "identity.tagline":
      return writeProfileField(context, row, "tagline", value.value);
    case "identity.about":
      return writeProfileField(context, row, "about", value.value);
    case "identity.sports": {
      const [organization] = await context.tx
        .select({ volleyballTypes: organizations.volleyballTypes })
        .from(organizations)
        .where(eq(organizations.id, context.organizationId));
      const merged = [
        ...new Set([
          ...(organization?.volleyballTypes ?? []),
          ...(value.values as string[]),
        ]),
      ]
        .filter((type) => type === "beach" || type === "indoor")
        .sort();
      await context.tx
        .update(organizations)
        .set({ volleyballTypes: merged, updatedAt: context.now })
        .where(eq(organizations.id, context.organizationId));
      return { type: "organization", id: context.organizationId };
    }
    case "identity.logo": {
      await ensureTheme(context);
      await context.tx
        .update(organizationThemes)
        .set({ logoUrl: String(value.url), updatedAt: context.now })
        .where(eq(organizationThemes.organizationId, context.organizationId));
      return { type: "organization_theme", id: context.organizationId };
    }
    case "identity.colors": {
      const theme = await ensureTheme(context);
      await context.tx
        .update(organizationThemes)
        .set({
          palette: {
            ...theme.palette,
            primary: String(value.primary),
            ...(value.accent ? { accent: String(value.accent) } : {}),
          },
          updatedAt: context.now,
        })
        .where(eq(organizationThemes.organizationId, context.organizationId));
      return { type: "organization_theme", id: context.organizationId };
    }
    case "contact.phone":
      return writeProfileField(context, row, "phoneE164", value.value);
    case "contact.email":
      return writeProfileField(context, row, "email", value.value);
    case "contact.social": {
      const profile = await ensureProfile(context);
      return writeProfileField(context, row, "socials", {
        ...profile.socials,
        [String(value.network)]: String(value.url),
      });
    }
    case "places.hours": {
      const profile = await ensureProfile(context);
      return writeProfileField(context, row, "hours", {
        ...profile.hours,
        weekly: value.weekly,
      });
    }
    case "places.venue":
      return applyVenue(context, value);
    case "offerings.item":
      return applyOffering(context, row, value);
    case "team.member":
      return applyTeamMember(context, value);
    default:
      if (row.fieldKey.startsWith("policies."))
        return applyPolicy(context, row, value);
      throw new SetupDecisionError("This item cannot be applied.");
  }
}

const groupOrder: readonly SetupCategory[] = [
  "identity",
  "contact",
  "places",
  "offerings",
  "team",
  "policies",
];

export interface SetupApplyReport {
  readonly runId: string;
  readonly applied: number;
  readonly skipped: number;
  readonly proposals: SetupProposal[];
}

async function applyRun(input: {
  readonly organizationId: string;
  readonly personId: string;
  readonly runId: string;
  readonly requestId: string;
  readonly now: Date;
}): Promise<SetupApplyReport> {
  const run = await runFor(input.organizationId, input.runId);
  if (run.status !== "review" && run.status !== "applied") {
    throw new TRPCError({
      code: "CONFLICT",
      message: "There is nothing to apply until Duna has finished reading.",
    });
  }
  const callingCode = await callingCodeFor(input.organizationId);
  let applied = 0;
  for (const category of groupOrder) {
    // One transaction per group: a failing group leaves the others applied.
    applied += await setupDatabase().transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(setupProposals)
        .where(
          and(
            eq(setupProposals.runId, input.runId),
            eq(setupProposals.organizationId, input.organizationId),
            eq(setupProposals.category, category),
            inArray(setupProposals.decision, ["kept", "edited"]),
          ),
        )
        .orderBy(asc(setupProposals.createdAt), asc(setupProposals.id))
        .for("update");
      const context: ApplyContext = {
        tx,
        organizationId: input.organizationId,
        personId: input.personId,
        run,
        now: input.now,
      };
      for (const row of rows) {
        let entity: AppliedEntity;
        try {
          entity = await applyOne(context, row, callingCode);
        } catch (error) {
          if (error instanceof SetupDecisionError) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `${row.label}: ${error.message}`,
            });
          }
          throw error;
        }
        await tx
          .update(setupProposals)
          .set({
            decision: "applied",
            appliedAt: input.now,
            appliedEntityType: entity.type,
            appliedEntityId: entity.id,
            updatedAt: input.now,
          })
          .where(
            and(
              eq(setupProposals.id, row.id),
              inArray(setupProposals.decision, ["kept", "edited"]),
            ),
          );
        await tx.insert(auditLog).values({
          organizationId: input.organizationId,
          actorPersonId: input.personId,
          actorType: "person",
          action: "setup.proposal.applied",
          entityType: entity.type,
          entityId: entity.id,
          afterHash: stableHash(
            row.decision === "edited" ? row.editedPayload : row.payload,
          ),
          reason: `Club setup: run ${input.runId}, proposal ${row.id} (${row.fieldKey}, ${row.decision})`,
          traceId: input.requestId.slice(0, 128),
          createdAt: input.now,
        });
      }
      return rows.length;
    });
  }
  const remaining = await setupDatabase()
    .select({ count: sql<number>`count(*)::int` })
    .from(setupProposals)
    .where(
      and(
        eq(setupProposals.runId, input.runId),
        eq(setupProposals.decision, "pending"),
      ),
    );
  if (Number(remaining[0]?.count ?? 0) === 0) {
    await setupDatabase()
      .update(setupRuns)
      .set({ status: "applied", updatedAt: input.now })
      .where(
        and(eq(setupRuns.id, input.runId), eq(setupRuns.status, "review")),
      );
  }
  const { proposals } = await listSetupProposals(input);
  log.info("setup.run.applied", { runId: input.runId, applied });
  return {
    runId: input.runId,
    applied,
    skipped: proposals.filter((proposal) => proposal.decision === "skipped")
      .length,
    proposals,
  };
}

/** Applies every kept or edited proposal of a run; replay-safe by key. */
export async function applySetupProposals(input: {
  readonly organizationId: string;
  readonly personId: string;
  readonly runId: string;
  readonly idempotencyKey: string;
  readonly requestId: string;
  readonly now: Date;
}): Promise<SetupApplyReport> {
  const { result } = await executeIdempotent({
    key: input.idempotencyKey,
    procedure: "operator.setup.applyProposals",
    personId: input.personId,
    organizationId: input.organizationId,
    request: { runId: input.runId },
    now: input.now,
    execute: () => applyRun(input),
    serializeResult: (report) => ({ ...report }),
  });
  return result;
}
