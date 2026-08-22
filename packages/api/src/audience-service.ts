import {
  audienceSnapshotMembers,
  audienceSnapshots,
  audienceVersionMembers,
  audienceVersions,
  audiences,
  auditLog,
  getDatabase,
  getTransactionalDatabase,
  organizationParticipants,
  people,
  guardianships,
} from "@duna/db";
import {
  audienceRuleHash,
  canonicalizeAudienceRuleAst,
  evaluateAudienceRule,
  audienceRuleRequiresScope,
  type AudienceMode,
  type AudienceRuleAst,
} from "@duna/core";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { ApiActor } from "./context";
import { stableHash } from "./canonical";

export class AudienceServiceError extends Error {
  constructor(
    readonly code:
      "DATABASE_REQUIRED" | "FORBIDDEN" | "NOT_FOUND" | "INVALID_AUDIENCE",
    message: string,
  ) {
    super(message);
    this.name = "AudienceServiceError";
  }
}

export interface AudienceSummary {
  readonly id: string;
  readonly name: string;
  readonly mode: AudienceMode;
  readonly status: "active" | "archived";
  readonly currentVersionId?: string;
  readonly revision: number;
  readonly estimatedSize: number;
  readonly projectionStatus: "complete" | "partial" | "unavailable";
  readonly unavailableFactKeys: readonly string[];
  readonly updatedAt: string;
  readonly members: readonly {
    readonly id: string;
    readonly displayName: string;
    readonly initials: string;
    readonly avatarUrl?: string;
  }[];
}

function organizationId(actor: ApiActor): string {
  if (!actor.organizationId)
    throw new AudienceServiceError(
      "FORBIDDEN",
      "An organization context is required.",
    );
  return actor.organizationId;
}

function canUseDynamic(actor: ApiActor): boolean {
  return (
    actor.scopes.includes("*") ||
    actor.roles.some((role) => role === "owner" || role === "manager")
  );
}

function hasScope(actor: ApiActor, scope: string): boolean {
  return actor.scopes.includes("*") || actor.scopes.includes(scope);
}

function requireAudienceDatabase(actor: ApiActor): void {
  if (!actor.isDemo && !process.env.DATABASE_URL) {
    throw new AudienceServiceError(
      "DATABASE_REQUIRED",
      "Audience changes require the connected Duna database.",
    );
  }
}

function canonicalDefinition(input: {
  mode: AudienceMode;
  ruleAst: AudienceRuleAst;
  includePersonIds: readonly string[];
  excludePersonIds: readonly string[];
}) {
  return {
    mode: input.mode,
    ruleAst: canonicalizeAudienceRuleAst(input.ruleAst),
    includePersonIds: [...input.includePersonIds].sort(),
    excludePersonIds: [...input.excludePersonIds].sort(),
  };
}

async function validateAudienceDefinition(input: {
  actor: ApiActor;
  mode: AudienceMode;
  ruleAst: AudienceRuleAst;
  includePersonIds: readonly string[];
  excludePersonIds: readonly string[];
}) {
  const ruleAst = canonicalizeAudienceRuleAst(input.ruleAst);
  if (
    new Set(input.includePersonIds).size !== input.includePersonIds.length ||
    new Set(input.excludePersonIds).size !== input.excludePersonIds.length
  )
    throw new AudienceServiceError(
      "INVALID_AUDIENCE",
      "Each person may appear only once in an audience revision.",
    );
  if (input.includePersonIds.some((id) => input.excludePersonIds.includes(id)))
    throw new AudienceServiceError(
      "INVALID_AUDIENCE",
      "A person cannot be both included and excluded.",
    );
  if (input.mode !== "static" && !canUseDynamic(input.actor))
    throw new AudienceServiceError(
      "FORBIDDEN",
      "Only managers and owners can create or revise dynamic audiences.",
    );
  if (
    audienceRuleRequiresScope(ruleAst, "payments:read") &&
    !hasScope(input.actor, "payments:read")
  )
    throw new AudienceServiceError(
      "FORBIDDEN",
      "Payment facts require payments:read.",
    );
  requireAudienceDatabase(input.actor);
  if (input.actor.isDemo) return ruleAst;
  const ids = [...input.includePersonIds, ...input.excludePersonIds];
  if (ids.length) {
    const rows = await getDatabase()
      .select({ personId: organizationParticipants.personId })
      .from(organizationParticipants)
      .where(
        and(
          eq(
            organizationParticipants.organizationId,
            organizationId(input.actor),
          ),
          eq(organizationParticipants.status, "active"),
          inArray(organizationParticipants.personId, ids),
        ),
      );
    const foundIds = new Set(rows.map((row) => row.personId));
    if (ids.some((id) => !foundIds.has(id)))
      throw new AudienceServiceError(
        "FORBIDDEN",
        "Audience members must be active participants of this organization.",
      );
  }
  return ruleAst;
}

const demoAudience: AudienceSummary = {
  id: "00000000-0000-4000-8000-000000000091",
  name: "Active players",
  mode: "dynamic",
  status: "active",
  currentVersionId: "00000000-0000-4000-8000-000000000092",
  revision: 1,
  estimatedSize: 3,
  projectionStatus: "complete",
  unavailableFactKeys: [],
  updatedAt: "2026-08-21T12:00:00.000Z",
  members: [
    {
      id: "00000000-0000-4000-8000-000000000001",
      displayName: "Maya Chen",
      initials: "MC",
    },
    {
      id: "00000000-0000-4000-8000-000000000002",
      displayName: "Jordan Lee",
      initials: "JL",
    },
    {
      id: "00000000-0000-4000-8000-000000000003",
      displayName: "Sam Rivera",
      initials: "SR",
    },
  ],
};

async function projectAudience(input: {
  organizationId: string;
  mode: AudienceMode;
  ruleAst: AudienceRuleAst;
  includePersonIds: readonly string[];
  excludePersonIds: readonly string[];
}) {
  const db = getDatabase();
  const candidateRows = await db
    .select({ person: people })
    .from(organizationParticipants)
    .innerJoin(people, eq(organizationParticipants.personId, people.id))
    .where(
      and(
        eq(organizationParticipants.organizationId, input.organizationId),
        eq(organizationParticipants.status, "active"),
      ),
    );
  const candidates = [
    ...new Map(candidateRows.map(({ person }) => [person.id, person])).values(),
  ];
  const candidateIds = candidates.map((person) => person.id);
  const guardianRows = candidateIds.length
    ? await db
        .select()
        .from(guardianships)
        .where(
          and(
            eq(guardianships.verified, true),
            eq(guardianships.reviewStatus, "verified"),
            inArray(guardianships.guardianId, candidateIds),
            inArray(guardianships.minorId, candidateIds),
          ),
        )
    : [];
  const dependents = new Map<string, number>();
  for (const guardian of guardianRows)
    dependents.set(
      guardian.guardianId,
      (dependents.get(guardian.guardianId) ?? 0) + 1,
    );
  const unavailable = new Set<string>();
  const members = candidates.map((person) => {
    const facts = {
      personType: person.isMinor
        ? ("minor" as const)
        : dependents.has(person.id)
          ? ("adult-guardian" as const)
          : ("player" as const),
      verifiedDependentCount: dependents.get(person.id) ?? 0,
    };
    const evaluation =
      input.mode === "static"
        ? { matches: false, unavailable: [], reasons: [] }
        : evaluateAudienceRule(input.ruleAst, facts);
    evaluation.unavailable.forEach((fact) => unavailable.add(fact));
    const included = input.excludePersonIds.includes(person.id)
      ? false
      : input.includePersonIds.includes(person.id)
        ? true
        : evaluation.matches;
    return {
      personId: person.id,
      included,
      reasonCode: input.excludePersonIds.includes(person.id)
        ? ("explicit-exclude" as const)
        : input.includePersonIds.includes(person.id)
          ? ("static-include" as const)
          : evaluation.matches
            ? ("dynamic-match" as const)
            : evaluation.unavailable.length
              ? ("fact-unavailable" as const)
              : ("rule-no-match" as const),
      reasons: input.excludePersonIds.includes(person.id)
        ? ["Explicitly excluded."]
        : input.includePersonIds.includes(person.id)
          ? ["Explicitly included."]
          : evaluation.reasons,
    };
  });
  return {
    members,
    unavailable: [...unavailable],
    status: unavailable.size ? ("partial" as const) : ("complete" as const),
  };
}

export async function listAudiences(
  actor: ApiActor,
): Promise<readonly AudienceSummary[]> {
  requireAudienceDatabase(actor);
  if (actor.isDemo) return [demoAudience];
  const orgId = organizationId(actor);
  const database = getDatabase();
  const rows = await database
    .select({
      audience: audiences,
      version: audienceVersions,
      snapshot: audienceSnapshots,
    })
    .from(audiences)
    .leftJoin(
      audienceVersions,
      and(
        eq(audiences.currentVersionId, audienceVersions.id),
        eq(audienceVersions.audienceId, audiences.id),
      ),
    )
    .leftJoin(
      audienceSnapshots,
      eq(audienceSnapshots.audienceVersionId, audienceVersions.id),
    )
    .where(eq(audiences.organizationId, orgId))
    .orderBy(desc(audiences.updatedAt), desc(audienceSnapshots.evaluatedAt));
  const byAudience = new Map<string, (typeof rows)[number]>();
  for (const row of rows)
    if (!byAudience.has(row.audience.id)) byAudience.set(row.audience.id, row);
  const selected = [...byAudience.values()];
  const snapshotIds = selected.flatMap(({ snapshot }) =>
    snapshot ? [snapshot.id] : [],
  );
  const previewRows = snapshotIds.length
    ? await database
        .select({
          snapshotId: audienceSnapshotMembers.audienceSnapshotId,
          personId: people.id,
          displayName: people.displayName,
          avatarUrl: people.avatarUrl,
        })
        .from(audienceSnapshotMembers)
        .innerJoin(people, eq(audienceSnapshotMembers.personId, people.id))
        .where(
          and(
            inArray(audienceSnapshotMembers.audienceSnapshotId, snapshotIds),
            eq(audienceSnapshotMembers.included, true),
          ),
        )
    : [];
  const previews = new Map<string, AudienceSummary["members"][number][]>();
  for (const row of previewRows) {
    const current = previews.get(row.snapshotId) ?? [];
    if (current.length >= 3) continue;
    current.push({
      id: row.personId,
      displayName: row.displayName,
      initials: row.displayName
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
        .toUpperCase(),
      ...(row.avatarUrl ? { avatarUrl: row.avatarUrl } : {}),
    });
    previews.set(row.snapshotId, current);
  }
  return selected.map(({ audience, version, snapshot }) => ({
    id: audience.id,
    name: audience.name,
    mode: audience.mode as AudienceMode,
    status: audience.status as "active" | "archived",
    currentVersionId: audience.currentVersionId ?? undefined,
    revision: version?.revision ?? 0,
    estimatedSize: snapshot?.memberCount ?? 0,
    projectionStatus:
      (snapshot?.status as AudienceSummary["projectionStatus"] | undefined) ??
      "unavailable",
    unavailableFactKeys: snapshot?.unavailableFactKeys ?? [],
    updatedAt: audience.updatedAt.toISOString(),
    members: snapshot ? (previews.get(snapshot.id) ?? []) : [],
  }));
}

export async function getAudience(
  actor: ApiActor,
  audienceId: string,
): Promise<AudienceSummary> {
  const all = await listAudiences(actor);
  const found = all.find((item) => item.id === audienceId);
  if (!found)
    throw new AudienceServiceError(
      "NOT_FOUND",
      "Audience not found for this organization.",
    );
  return found;
}

export async function getAudienceDetail(actor: ApiActor, audienceId: string) {
  requireAudienceDatabase(actor);
  if (actor.isDemo) {
    return {
      ...(await getAudience(actor, audienceId)),
      ruleAst: {
        version: 1,
        root: {
          kind: "group",
          operator: "all",
          rules: [
            {
              kind: "condition",
              fact: "person-type",
              operator: "is",
              value: "player",
            },
          ],
        },
      },
      includePersonIds: [] as readonly string[],
      excludePersonIds: [] as readonly string[],
      history: [
        { revision: 1, createdAt: demoAudience.updatedAt, current: true },
      ],
    };
  }
  const summary = await getAudience(actor, audienceId);
  if (!summary.currentVersionId)
    throw new AudienceServiceError(
      "NOT_FOUND",
      "Audience has no current revision.",
    );
  const db = getDatabase();
  const [current] = await db
    .select()
    .from(audienceVersions)
    .where(
      and(
        eq(audienceVersions.id, summary.currentVersionId),
        eq(audienceVersions.audienceId, audienceId),
      ),
    );
  if (!current)
    throw new AudienceServiceError("NOT_FOUND", "Audience revision not found.");
  const members = await db
    .select()
    .from(audienceVersionMembers)
    .where(eq(audienceVersionMembers.audienceVersionId, current.id));
  const versions = await db
    .select()
    .from(audienceVersions)
    .where(eq(audienceVersions.audienceId, audienceId))
    .orderBy(desc(audienceVersions.revision));
  return {
    ...summary,
    ruleAst: current.ruleAst,
    includePersonIds: members
      .filter((member) => member.disposition === "include")
      .map((member) => member.personId),
    excludePersonIds: members
      .filter((member) => member.disposition === "exclude")
      .map((member) => member.personId),
    history: versions.map((version) => ({
      revision: version.revision,
      createdAt: version.createdAt.toISOString(),
      current: version.id === current.id,
    })),
  };
}

export async function createAudience(input: {
  readonly actor: ApiActor;
  readonly name: string;
  readonly mode: AudienceMode;
  readonly ruleAst: AudienceRuleAst;
  readonly includePersonIds: readonly string[];
  readonly excludePersonIds: readonly string[];
  readonly now: Date;
}): Promise<AudienceSummary> {
  const orgId = organizationId(input.actor);
  const ruleAst = await validateAudienceDefinition(input);
  if (input.actor.isDemo) {
    return {
      ...demoAudience,
      id: crypto.randomUUID(),
      currentVersionId: crypto.randomUUID(),
      name: input.name,
      mode: input.mode,
      updatedAt: input.now.toISOString(),
    };
  }
  const audienceId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const snapshotId = crypto.randomUUID();
  const memberRows = [
    ...input.includePersonIds
      .filter((id) => !input.excludePersonIds.includes(id))
      .map((personId) => ({
        audienceVersionId: versionId,
        personId,
        disposition: "include" as const,
      })),
    ...input.excludePersonIds.map((personId) => ({
      audienceVersionId: versionId,
      personId,
      disposition: "exclude" as const,
    })),
  ];
  const projection = await projectAudience({
    organizationId: orgId,
    mode: input.mode,
    ruleAst,
    includePersonIds: input.includePersonIds,
    excludePersonIds: input.excludePersonIds,
  });
  const transactional = getTransactionalDatabase();
  await transactional.transaction(async (tx) => {
    await tx.insert(audiences).values({
      id: audienceId,
      organizationId: orgId,
      name: input.name.trim(),
      mode: input.mode,
      currentVersionId: null,
      createdByPersonId: input.actor.personId,
      createdAt: input.now,
      updatedAt: input.now,
    });
    await tx.insert(audienceVersions).values({
      id: versionId,
      audienceId,
      revision: 1,
      ruleVersion: ruleAst.version,
      ruleAst: ruleAst as unknown as Record<string, unknown>,
      ruleHash: stableHash(canonicalDefinition({ ...input, ruleAst })),
      createdByPersonId: input.actor.personId,
      createdAt: input.now,
    });
    await tx.insert(auditLog).values({
      organizationId: orgId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "audience.created",
      entityType: "audience",
      entityId: audienceId,
      afterHash: stableHash(canonicalDefinition({ ...input, ruleAst })),
      reason: "Created immutable audience definition.",
      createdAt: input.now,
    });
    if (memberRows.length)
      await tx.insert(audienceVersionMembers).values(memberRows);
    await tx.insert(audienceSnapshots).values({
      id: snapshotId,
      audienceVersionId: versionId,
      organizationId: orgId,
      status: projection.status,
      memberCount: projection.members.filter((member) => member.included)
        .length,
      unavailableFactKeys: projection.unavailable,
      evaluatedAt: input.now,
      createdAt: input.now,
    });
    if (projection.members.length)
      await tx.insert(audienceSnapshotMembers).values(
        projection.members.map((row) => ({
          audienceSnapshotId: snapshotId,
          personId: row.personId,
          included: row.included,
          reasonCode: row.reasonCode,
          reasons: row.reasons,
          createdAt: input.now,
        })),
      );
    await tx
      .update(audiences)
      .set({ currentVersionId: versionId, updatedAt: input.now })
      .where(eq(audiences.id, audienceId));
  });
  return {
    id: audienceId,
    name: input.name.trim(),
    mode: input.mode,
    status: "active",
    currentVersionId: versionId,
    revision: 1,
    estimatedSize: projection.members.filter((member) => member.included)
      .length,
    projectionStatus: projection.status,
    unavailableFactKeys: projection.unavailable,
    updatedAt: input.now.toISOString(),
    members: [],
  };
}

export async function previewAudienceRule(
  actor: ApiActor,
  ruleAst: AudienceRuleAst,
) {
  const canonical = await validateAudienceDefinition({
    actor,
    mode: "dynamic",
    ruleAst,
    includePersonIds: [],
    excludePersonIds: [],
  });
  if (actor.isDemo)
    return {
      ruleHash: audienceRuleHash(canonical),
      estimatedSize: 0,
      unavailableFactKeys: ["demo-preview"],
      members: [],
      exclusions: [],
    };
  const projection = await projectAudience({
    organizationId: organizationId(actor),
    mode: "dynamic",
    ruleAst: canonical,
    includePersonIds: [],
    excludePersonIds: [],
  });
  return {
    ruleHash: audienceRuleHash(canonical),
    estimatedSize: projection.members.filter((member) => member.included)
      .length,
    unavailableFactKeys: projection.unavailable,
    members: projection.members
      .filter((member) => member.included)
      .slice(0, 10),
    exclusions: projection.members
      .filter((member) => !member.included)
      .slice(0, 10),
  };
}

export async function reviseAudience(input: {
  readonly actor: ApiActor;
  readonly audienceId: string;
  readonly ruleAst: AudienceRuleAst;
  readonly includePersonIds: readonly string[];
  readonly excludePersonIds: readonly string[];
  readonly now: Date;
}): Promise<AudienceSummary> {
  requireAudienceDatabase(input.actor);
  if (input.actor.isDemo)
    return {
      ...demoAudience,
      id: input.audienceId,
      revision: 2,
      currentVersionId: crypto.randomUUID(),
      updatedAt: input.now.toISOString(),
    };
  const orgId = organizationId(input.actor);
  const db = getDatabase();
  const [audience] = await db
    .select()
    .from(audiences)
    .where(
      and(
        eq(audiences.id, input.audienceId),
        eq(audiences.organizationId, orgId),
      ),
    );
  if (!audience || audience.status === "archived")
    throw new AudienceServiceError(
      "NOT_FOUND",
      "Active audience not found for this organization.",
    );
  const ast = await validateAudienceDefinition({
    ...input,
    mode: audience.mode as AudienceMode,
  });
  const versionId = crypto.randomUUID();
  const snapshotId = crypto.randomUUID();
  const included = input.includePersonIds.filter(
    (id) => !input.excludePersonIds.includes(id),
  );
  const projection = await projectAudience({
    organizationId: orgId,
    mode: audience.mode as AudienceMode,
    ruleAst: ast,
    includePersonIds: input.includePersonIds,
    excludePersonIds: input.excludePersonIds,
  });
  const tx = getTransactionalDatabase();
  const revision = await tx.transaction(async (database) => {
    await database.execute(
      sql`select pg_advisory_xact_lock(hashtext(${audience.id}))`,
    );
    const versions = await database
      .select()
      .from(audienceVersions)
      .where(eq(audienceVersions.audienceId, audience.id))
      .orderBy(desc(audienceVersions.revision));
    const nextRevision = (versions[0]?.revision ?? 0) + 1;
    await database.insert(audienceVersions).values({
      id: versionId,
      audienceId: audience.id,
      revision: nextRevision,
      ruleVersion: ast.version,
      ruleAst: ast as unknown as Record<string, unknown>,
      ruleHash: stableHash(
        canonicalDefinition({
          mode: audience.mode as AudienceMode,
          ...input,
          ruleAst: ast,
        }),
      ),
      createdByPersonId: input.actor.personId,
      createdAt: input.now,
    });
    await database.insert(auditLog).values({
      organizationId: orgId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "audience.revised",
      entityType: "audience",
      entityId: audience.id,
      beforeHash: versions[0]?.ruleHash,
      afterHash: stableHash(
        canonicalDefinition({
          mode: audience.mode as AudienceMode,
          ...input,
          ruleAst: ast,
        }),
      ),
      reason: "Created immutable audience revision.",
      createdAt: input.now,
    });
    const memberships = [
      ...included.map((personId) => ({
        audienceVersionId: versionId,
        personId,
        disposition: "include" as const,
      })),
      ...input.excludePersonIds.map((personId) => ({
        audienceVersionId: versionId,
        personId,
        disposition: "exclude" as const,
      })),
    ];
    if (memberships.length)
      await database.insert(audienceVersionMembers).values(memberships);
    await database.insert(audienceSnapshots).values({
      id: snapshotId,
      audienceVersionId: versionId,
      organizationId: orgId,
      status: projection.status,
      memberCount: projection.members.filter((member) => member.included)
        .length,
      unavailableFactKeys: projection.unavailable,
      evaluatedAt: input.now,
      createdAt: input.now,
    });
    if (projection.members.length)
      await database.insert(audienceSnapshotMembers).values(
        projection.members.map((member) => ({
          audienceSnapshotId: snapshotId,
          personId: member.personId,
          included: member.included,
          reasonCode: member.reasonCode,
          reasons: member.reasons,
          createdAt: input.now,
        })),
      );
    await database
      .update(audiences)
      .set({ currentVersionId: versionId, updatedAt: input.now })
      .where(eq(audiences.id, audience.id));
    return nextRevision;
  });
  return {
    id: audience.id,
    name: audience.name,
    mode: audience.mode as AudienceMode,
    status: "active",
    currentVersionId: versionId,
    revision,
    estimatedSize: projection.members.filter((member) => member.included)
      .length,
    projectionStatus: projection.status,
    unavailableFactKeys: projection.unavailable,
    updatedAt: input.now.toISOString(),
    members: [],
  };
}

export async function archiveAudience(
  actor: ApiActor,
  audienceId: string,
  now: Date,
): Promise<AudienceSummary> {
  requireAudienceDatabase(actor);
  if (actor.isDemo)
    return {
      ...demoAudience,
      id: audienceId,
      status: "archived",
      updatedAt: now.toISOString(),
    };
  const orgId = organizationId(actor);
  const tx = getTransactionalDatabase();
  const audience = await tx.transaction(async (database) => {
    const result = await database
      .update(audiences)
      .set({ status: "archived", archivedAt: now, updatedAt: now })
      .where(
        and(eq(audiences.id, audienceId), eq(audiences.organizationId, orgId)),
      )
      .returning();
    const current = result[0];
    if (current)
      await database.insert(auditLog).values({
        organizationId: orgId,
        actorPersonId: actor.personId,
        actorType: "person",
        action: "audience.archived",
        entityType: "audience",
        entityId: audienceId,
        reason: "Archived audience without deleting revisions.",
        createdAt: now,
      });
    return current;
  });
  if (!audience)
    throw new AudienceServiceError(
      "NOT_FOUND",
      "Audience not found for this organization.",
    );
  return {
    id: audience.id,
    name: audience.name,
    mode: audience.mode as AudienceMode,
    status: "archived",
    currentVersionId: audience.currentVersionId ?? undefined,
    revision: 0,
    estimatedSize: 0,
    projectionStatus: "unavailable",
    unavailableFactKeys: [],
    updatedAt: now.toISOString(),
    members: [],
  };
}
