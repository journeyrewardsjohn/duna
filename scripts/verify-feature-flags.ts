import { loadEnvFile } from "node:process";
import { and, eq, inArray } from "drizzle-orm";
import {
  auditLog,
  featureFlags,
  getDatabase,
  people,
} from "../packages/db/src";
import {
  createFeatureFlag,
  FeatureFlagError,
  loadFeatureFlags,
  scopesForRoles,
  updateFeatureFlag,
  type ApiActor,
} from "../packages/api/src";

try {
  loadEnvFile(".env.local");
} catch {
  // CI and deployment checks may provide configuration through the environment.
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
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

async function main() {
  assert(process.env.DATABASE_URL, "DATABASE_URL is required");
  const database = getDatabase();
  const actorPersonId = crypto.randomUUID();
  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
  const key = `verification.feature.${suffix}`;
  const requestIds = [crypto.randomUUID(), crypto.randomUUID()];
  const actor: ApiActor = {
    personId: actorPersonId,
    displayName: "Feature Flag Verification Admin",
    roles: ["super-admin"],
    scopes: scopesForRoles(["super-admin"]),
    ageBand: "adult",
    isDemo: false,
  };
  let flagId: string | undefined;

  try {
    await database.insert(people).values({
      id: actorPersonId,
      displayName: actor.displayName,
      handle: `flag-verification-${suffix}`,
      status: "active",
      roles: ["super-admin"],
      isMinor: false,
      visibility: "private",
    });

    const created = await createFeatureFlag({
      actor,
      key,
      enabled: false,
      configuration: { rolloutPercent: 0 },
      reason: "Create an isolated connected verification control.",
      requestId: requestIds[0]!,
      now: new Date("2026-07-30T22:30:00.000Z"),
    });
    flagId = created.id;
    assert(!created.enabled, "Feature flag should start disabled");

    let duplicateScopeBlocked = false;
    try {
      await database.insert(featureFlags).values({
        id: crypto.randomUUID(),
        key,
        enabled: false,
        configuration: {},
        updatedByPersonId: actorPersonId,
      });
    } catch (error) {
      duplicateScopeBlocked = postgresCode(error) === "23505";
    }
    assert(
      duplicateScopeBlocked,
      "Database must reject a duplicate global feature flag scope",
    );

    const collection = await loadFeatureFlags(actor);
    assert(collection.canManage, "Super-admin capability should be exposed");
    assert(
      collection.flags.some((flag) => flag.id === created.id),
      "Created feature flag should be readable",
    );

    const updated = await updateFeatureFlag({
      actor,
      flagId: created.id,
      enabled: true,
      configuration: { rolloutPercent: 5 },
      reason: "Verify an explicit audited rollout state transition.",
      requestId: requestIds[1]!,
      now: new Date("2026-07-30T22:31:00.000Z"),
    });
    assert(updated.enabled, "Feature flag should be enabled after update");
    assert(
      updated.configuration.rolloutPercent === 5,
      "Feature flag configuration should persist",
    );

    const adminActor: ApiActor = {
      ...actor,
      roles: ["admin"],
      scopes: scopesForRoles(["admin"]),
    };
    let authorizationBlocked = false;
    try {
      await updateFeatureFlag({
        actor: adminActor,
        flagId: created.id,
        enabled: false,
        configuration: {},
        reason: "This write must be rejected before database mutation.",
        requestId: crypto.randomUUID(),
        now: new Date("2026-07-30T22:32:00.000Z"),
      });
    } catch (error) {
      authorizationBlocked =
        error instanceof FeatureFlagError &&
        error.code === "SUPER_ADMIN_REQUIRED";
    }
    assert(
      authorizationBlocked,
      "Non-super-admin rollout mutation should be rejected",
    );

    const auditRows = await database
      .select({
        action: auditLog.action,
        beforeHash: auditLog.beforeHash,
        afterHash: auditLog.afterHash,
      })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.entityType, "feature-flag"),
          eq(auditLog.entityId, created.id),
        ),
      );
    assert(auditRows.length === 2, "Create and update should both be audited");
    assert(
      auditRows.some(
        (row) =>
          row.action === "feature-flag.enabled" &&
          Boolean(row.beforeHash) &&
          Boolean(row.afterHash),
      ),
      "Rollout transition should preserve before and after hashes",
    );

    console.log(
      JSON.stringify(
        {
          status: "ok",
          scope: "global",
          created: true,
          updated: true,
          duplicateScopeBlocked: true,
          authorizationBlocked: true,
          auditEvents: auditRows.length,
        },
        null,
        2,
      ),
    );
  } finally {
    if (flagId) {
      await database
        .delete(auditLog)
        .where(
          and(
            eq(auditLog.entityType, "feature-flag"),
            eq(auditLog.entityId, flagId),
          ),
        );
      await database.delete(featureFlags).where(eq(featureFlags.id, flagId));
    }
    await database
      .delete(auditLog)
      .where(inArray(auditLog.traceId, requestIds));
    await database.delete(people).where(eq(people.id, actorPersonId));
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
