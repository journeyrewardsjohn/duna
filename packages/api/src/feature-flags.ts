import {
  auditLog,
  featureFlags,
  getDatabase,
  organizations,
  people,
} from "@duna/db";
import { and, asc, eq, isNull } from "drizzle-orm";
import { stableHash } from "./canonical";
import type { ApiActor } from "./context";
import type { FeatureFlagCollection, FeatureFlagSummary } from "./contracts";

export class FeatureFlagError extends Error {
  constructor(
    readonly code:
      | "DATABASE_REQUIRED"
      | "SUPER_ADMIN_REQUIRED"
      | "FLAG_NOT_FOUND"
      | "FLAG_ALREADY_EXISTS"
      | "ORGANIZATION_NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "FeatureFlagError";
  }
}

function requireDatabase(): void {
  if (!process.env.DATABASE_URL) {
    throw new FeatureFlagError(
      "DATABASE_REQUIRED",
      "Feature flag administration requires the connected Duna database.",
    );
  }
}

function requireSuperAdmin(actor: ApiActor): void {
  if (!actor.roles.includes("super-admin")) {
    throw new FeatureFlagError(
      "SUPER_ADMIN_REQUIRED",
      "Only a verified Duna super administrator can change rollout controls.",
    );
  }
}

function normalizeMarket(value?: string): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function postgresCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (
      typeof current === "object" &&
      "code" in current &&
      typeof current.code === "string"
    ) {
      return current.code;
    }
    current =
      typeof current === "object" && "cause" in current
        ? current.cause
        : undefined;
  }
  return undefined;
}

async function loadFlag(flagId: string): Promise<FeatureFlagSummary> {
  const database = getDatabase();
  const [row] = await database
    .select({
      id: featureFlags.id,
      key: featureFlags.key,
      enabled: featureFlags.enabled,
      organizationId: featureFlags.organizationId,
      organizationName: organizations.name,
      market: featureFlags.market,
      configuration: featureFlags.configuration,
      updatedAt: featureFlags.updatedAt,
      updatedByName: people.displayName,
    })
    .from(featureFlags)
    .leftJoin(organizations, eq(featureFlags.organizationId, organizations.id))
    .leftJoin(people, eq(featureFlags.updatedByPersonId, people.id))
    .where(eq(featureFlags.id, flagId))
    .limit(1);
  if (!row) {
    throw new FeatureFlagError("FLAG_NOT_FOUND", "Feature flag was not found.");
  }
  return {
    id: row.id,
    key: row.key,
    enabled: row.enabled,
    organizationId: row.organizationId ?? undefined,
    organizationName: row.organizationName ?? undefined,
    market: row.market ?? undefined,
    configuration: row.configuration,
    updatedAt: row.updatedAt.toISOString(),
    updatedByName: row.updatedByName ?? undefined,
  };
}

export async function loadFeatureFlags(
  actor: ApiActor,
): Promise<FeatureFlagCollection> {
  if (!process.env.DATABASE_URL) {
    return {
      flags: [],
      canManage: actor.roles.includes("super-admin"),
    };
  }
  const database = getDatabase();
  const rows = await database
    .select({
      id: featureFlags.id,
      key: featureFlags.key,
      enabled: featureFlags.enabled,
      organizationId: featureFlags.organizationId,
      organizationName: organizations.name,
      market: featureFlags.market,
      configuration: featureFlags.configuration,
      updatedAt: featureFlags.updatedAt,
      updatedByName: people.displayName,
    })
    .from(featureFlags)
    .leftJoin(organizations, eq(featureFlags.organizationId, organizations.id))
    .leftJoin(people, eq(featureFlags.updatedByPersonId, people.id))
    .orderBy(
      asc(featureFlags.key),
      asc(organizations.name),
      asc(featureFlags.market),
    );
  return {
    flags: rows.map((row) => ({
      id: row.id,
      key: row.key,
      enabled: row.enabled,
      organizationId: row.organizationId ?? undefined,
      organizationName: row.organizationName ?? undefined,
      market: row.market ?? undefined,
      configuration: row.configuration,
      updatedAt: row.updatedAt.toISOString(),
      updatedByName: row.updatedByName ?? undefined,
    })),
    canManage: actor.roles.includes("super-admin"),
  };
}

export async function createFeatureFlag(input: {
  readonly actor: ApiActor;
  readonly key: string;
  readonly organizationId?: string;
  readonly market?: string;
  readonly enabled: boolean;
  readonly configuration: Readonly<Record<string, unknown>>;
  readonly reason: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<FeatureFlagSummary> {
  requireSuperAdmin(input.actor);
  requireDatabase();
  const database = getDatabase();
  const market = normalizeMarket(input.market);
  if (input.organizationId) {
    const organization = await database.query.organizations.findFirst({
      where: eq(organizations.id, input.organizationId),
    });
    if (!organization) {
      throw new FeatureFlagError(
        "ORGANIZATION_NOT_FOUND",
        "The selected organization was not found.",
      );
    }
  }
  const existing = await database
    .select({ id: featureFlags.id })
    .from(featureFlags)
    .where(
      and(
        eq(featureFlags.key, input.key),
        input.organizationId
          ? eq(featureFlags.organizationId, input.organizationId)
          : isNull(featureFlags.organizationId),
        market ? eq(featureFlags.market, market) : isNull(featureFlags.market),
      ),
    )
    .limit(1);
  if (existing.length > 0) {
    throw new FeatureFlagError(
      "FLAG_ALREADY_EXISTS",
      "A feature flag already exists for this exact scope.",
    );
  }
  const id = crypto.randomUUID();
  const values = {
    key: input.key,
    organizationId: input.organizationId,
    market,
    enabled: input.enabled,
    configuration: input.configuration,
  };
  try {
    await database.batch([
      database.insert(featureFlags).values({
        id,
        ...values,
        updatedByPersonId: input.actor.personId,
        createdAt: input.now,
        updatedAt: input.now,
      }),
      database.insert(auditLog).values({
        actorPersonId: input.actor.personId,
        actorType: "person",
        action: "feature-flag.created",
        entityType: "feature-flag",
        entityId: id,
        afterHash: stableHash(values),
        reason: input.reason,
        traceId: input.requestId,
        ipAddress: input.ipAddress,
        createdAt: input.now,
      }),
    ]);
  } catch (error) {
    if (postgresCode(error) === "23505") {
      throw new FeatureFlagError(
        "FLAG_ALREADY_EXISTS",
        "A feature flag already exists for this exact scope.",
      );
    }
    throw error;
  }
  return loadFlag(id);
}

export async function updateFeatureFlag(input: {
  readonly actor: ApiActor;
  readonly flagId: string;
  readonly enabled: boolean;
  readonly configuration: Readonly<Record<string, unknown>>;
  readonly reason: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<FeatureFlagSummary> {
  requireSuperAdmin(input.actor);
  requireDatabase();
  const database = getDatabase();
  const current = await database.query.featureFlags.findFirst({
    where: eq(featureFlags.id, input.flagId),
  });
  if (!current) {
    throw new FeatureFlagError("FLAG_NOT_FOUND", "Feature flag was not found.");
  }
  const before = {
    enabled: current.enabled,
    configuration: current.configuration,
  };
  const after = {
    enabled: input.enabled,
    configuration: input.configuration,
  };
  await database.batch([
    database
      .update(featureFlags)
      .set({
        ...after,
        updatedByPersonId: input.actor.personId,
        updatedAt: input.now,
      })
      .where(eq(featureFlags.id, input.flagId)),
    database.insert(auditLog).values({
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: input.enabled ? "feature-flag.enabled" : "feature-flag.disabled",
      entityType: "feature-flag",
      entityId: input.flagId,
      beforeHash: stableHash(before),
      afterHash: stableHash(after),
      reason: input.reason,
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  return loadFlag(input.flagId);
}
