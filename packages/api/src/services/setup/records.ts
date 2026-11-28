/**
 * Database plumbing for the setup domain: the connection, row → contract
 * mappers, and the club's current records (what a re-read diffs against).
 */
import {
  catalogItems,
  catalogPrices,
  courts,
  getTransactionalDatabase,
  organizationBrandKnowledgeSources,
  organizationProfiles,
  organizationRefundPolicies,
  organizations,
  organizationStaffProfiles,
  organizationThemes,
  people,
  setupProposals,
  setupRunPages,
  setupRuns,
  venues,
} from "@duna/db";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import type { SetupProposal, SetupRun } from "../../contracts/setup";
import type { SetupCurrentRecords } from "./merge";
import { normaliseKey } from "./validate";

export type SetupDatabase = ReturnType<typeof getTransactionalDatabase>;
export type SetupTransaction = Parameters<
  Parameters<SetupDatabase["transaction"]>[0]
>[0];
export type SetupExecutor = SetupDatabase | SetupTransaction;

export function setupDatabase(): SetupDatabase {
  return getTransactionalDatabase();
}

export type SetupRunRow = typeof setupRuns.$inferSelect;
export type SetupRunPageRow = typeof setupRunPages.$inferSelect;
export type SetupProposalRow = typeof setupProposals.$inferSelect;

/** Internal payload keys never shown to a client. */
const internalPayloadKeys = new Set(["mergeKey"]);

export function runToContract(
  run: SetupRunRow,
  pages: readonly SetupRunPageRow[],
): SetupRun {
  return {
    id: run.id,
    sourceKind: run.sourceKind as SetupRun["sourceKind"],
    ...(run.sourceUrl ? { sourceUrl: run.sourceUrl } : {}),
    status: run.status as SetupRun["status"],
    ...(run.outcome ? { outcome: run.outcome as SetupRun["outcome"] } : {}),
    ...(run.failureReason ? { failureReason: run.failureReason } : {}),
    pagesTotal: run.pagesTotal,
    pagesRead: run.pagesRead,
    itemsFound: run.itemsFound,
    pages: [...pages]
      .sort((a, b) => a.position - b.position)
      .map((page) => ({
        id: page.id,
        position: page.position,
        url: page.url,
        ...(page.title ? { title: page.title } : {}),
        status: page.status as SetupRun["pages"][number]["status"],
        itemsFound: page.itemsFound,
      })),
    ...(run.startedAt ? { startedAt: run.startedAt.toISOString() } : {}),
    ...(run.finishedAt ? { finishedAt: run.finishedAt.toISOString() } : {}),
  };
}

export function proposalToContract(row: SetupProposalRow): SetupProposal {
  const payload = Object.fromEntries(
    Object.entries(row.payload).filter(
      ([key]) => !internalPayloadKeys.has(key),
    ),
  );
  return {
    id: row.id,
    runId: row.runId,
    category: row.category as SetupProposal["category"],
    fieldKey: row.fieldKey,
    label: row.label,
    payload,
    candidates: [...row.candidates].map((candidate) => ({ ...candidate })),
    sourcePages: row.sourcePages,
    needsCheck: row.needsCheck,
    ...(row.checkNote ? { checkNote: row.checkNote } : {}),
    decision: row.decision as SetupProposal["decision"],
    ...(row.editedPayload ? { editedPayload: row.editedPayload } : {}),
    ...(row.decidedAt ? { decidedAt: row.decidedAt.toISOString() } : {}),
    ...(row.appliedAt ? { appliedAt: row.appliedAt.toISOString() } : {}),
    ...(row.appliedEntityType && row.appliedEntityId
      ? {
          appliedEntity: {
            type: row.appliedEntityType,
            id: row.appliedEntityId,
          },
        }
      : {}),
  };
}

export async function loadRunWithPages(
  executor: SetupExecutor,
  organizationId: string,
  runId: string,
): Promise<{ run: SetupRunRow; pages: SetupRunPageRow[] } | undefined> {
  const [run] = await executor
    .select()
    .from(setupRuns)
    .where(
      and(
        eq(setupRuns.id, runId),
        eq(setupRuns.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!run) return undefined;
  const pages = await executor
    .select()
    .from(setupRunPages)
    .where(eq(setupRunPages.runId, runId))
    .orderBy(asc(setupRunPages.position));
  return { run, pages };
}

/** The policy kind a knowledge note was saved under ("Policy (weather): …"). */
export function policyNoteTitle(kind: string, title: string): string {
  return `Policy (${kind}): ${title}`.slice(0, 200);
}

const policyNotePattern = /^Policy \(([a-z-]+)\): /;

export async function loadCurrentRecords(
  executor: SetupExecutor,
  organizationId: string,
): Promise<SetupCurrentRecords> {
  const [
    [organization],
    [profile],
    [theme],
    venueRows,
    teamRows,
    offeringRows,
    refundRows,
    noteRows,
  ] = await Promise.all([
    executor
      .select({
        name: organizations.name,
        volleyballTypes: organizations.volleyballTypes,
      })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1),
    executor
      .select()
      .from(organizationProfiles)
      .where(eq(organizationProfiles.organizationId, organizationId))
      .limit(1),
    executor
      .select({
        logoUrl: organizationThemes.logoUrl,
        palette: organizationThemes.palette,
      })
      .from(organizationThemes)
      .where(eq(organizationThemes.organizationId, organizationId))
      .limit(1),
    executor
      .select({
        name: venues.name,
        courtCount: sql<number>`count(${courts.id})::int`,
      })
      .from(venues)
      .leftJoin(courts, eq(courts.venueId, venues.id))
      .where(eq(venues.organizationId, organizationId))
      .groupBy(venues.id, venues.name),
    executor
      .select({ displayName: people.displayName })
      .from(organizationStaffProfiles)
      .innerJoin(people, eq(people.id, organizationStaffProfiles.personId))
      .where(eq(organizationStaffProfiles.organizationId, organizationId)),
    executor
      .select({
        title: catalogItems.title,
        amountMinor: sql<number | null>`min(${catalogPrices.amountMinor})`,
      })
      .from(catalogItems)
      .leftJoin(
        catalogPrices,
        and(
          eq(catalogPrices.catalogItemId, catalogItems.id),
          eq(catalogPrices.paymentKind, "card"),
        ),
      )
      .where(
        and(
          eq(catalogItems.organizationId, organizationId),
          ne(catalogItems.status, "archived"),
        ),
      )
      .groupBy(catalogItems.id, catalogItems.title),
    executor
      .select({
        terms: organizationRefundPolicies.terms,
        refundBeforeMinutes: organizationRefundPolicies.refundBeforeMinutes,
      })
      .from(organizationRefundPolicies)
      .where(eq(organizationRefundPolicies.organizationId, organizationId)),
    executor
      .select({
        title: organizationBrandKnowledgeSources.title,
        contentText: organizationBrandKnowledgeSources.contentText,
      })
      .from(organizationBrandKnowledgeSources)
      .where(
        and(
          eq(organizationBrandKnowledgeSources.organizationId, organizationId),
          ne(organizationBrandKnowledgeSources.status, "archived"),
        ),
      ),
  ]);

  const policies = new Map<
    string,
    { text: string; refundBeforeMinutes?: number | null }
  >();
  for (const row of refundRows) {
    for (const kind of ["cancellation", "refund"]) {
      if (!policies.has(kind)) {
        policies.set(kind, {
          text: row.terms,
          refundBeforeMinutes: row.refundBeforeMinutes,
        });
      }
    }
  }
  for (const note of noteRows) {
    const kind = policyNotePattern.exec(note.title)?.[1];
    if (kind && !policies.has(kind)) {
      policies.set(kind, {
        text: note.contentText ?? "",
        refundBeforeMinutes: null,
      });
    }
  }
  const fieldSources = profile?.fieldSources ?? {};
  return {
    name: organization?.name ?? "",
    volleyballTypes: organization?.volleyballTypes ?? [],
    tagline: profile?.tagline ?? undefined,
    about: profile?.about ?? undefined,
    phoneE164: profile?.phoneE164 ?? undefined,
    email: profile?.email ?? undefined,
    socials: profile?.socials ?? {},
    hours: [...(profile?.hours.weekly ?? [])],
    logoUrl: theme?.logoUrl ?? undefined,
    palette: theme?.palette
      ? { primary: theme.palette.primary, accent: theme.palette.accent }
      : undefined,
    venues: new Map(
      venueRows.map((row) => [normaliseKey(row.name), Number(row.courtCount)]),
    ),
    team: new Set(teamRows.map((row) => normaliseKey(row.displayName))),
    offerings: new Map(
      offeringRows.map((row) => [
        normaliseKey(row.title),
        row.amountMinor === null ? undefined : Number(row.amountMinor),
      ]),
    ),
    policies,
    personFields: new Set(
      Object.entries(fieldSources)
        .filter(([, source]) => source.source === "person" || source.confirmed)
        .map(([field]) => field),
    ),
  };
}
