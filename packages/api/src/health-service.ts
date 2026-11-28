import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import {
  auditLog,
  follows,
  getDatabase,
  healthConnections,
  healthConsents,
  healthDailyCheckIns,
  healthSamples,
  healthSharingGrants,
  matches,
  memberships,
  membershipTiers,
  organizationMemberships,
  organizations,
  people,
  privacyRequests,
  teamMembers,
  teams,
} from "@duna/db";
import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import {
  healthDemoGrants,
  healthDemoPerson,
  healthDemoSamples,
} from "@duna/core/demo/health";
import type { ApiActor } from "./context";
import type {
  HealthCategory,
  HealthCheckIn,
  HealthCheckInInput,
  HealthCorrelation,
  HealthDashboard,
  HealthIntelligence,
  HealthMetric,
  HealthProfile,
  HealthSampleInput,
  HealthSharingCandidate,
  HealthSharingGrant,
  HealthSharingScope,
  HealthTimelineEntry,
  HealthVideoOverlay,
} from "./contracts";
import { buildHealthIntelligence } from "./health-intelligence";
import { usesDemoData } from "./services/data-source";
import {
  decideForSubject,
  loadHealthSubjectState,
  recordHealthConsent,
  requireHealthEligibility,
  type HealthSubjectState,
} from "./services/health/consent";
import { HealthServiceError } from "./services/health/errors";
import {
  HEALTH_ADULT_AGE,
  HEALTH_METRIC_CATEGORY,
  HEALTH_POLICY_VERSION,
  HEALTH_REFUSAL_MESSAGES,
  checkHealthGrantRequest,
  filterSamplesForBand,
  healthGrantIsEffective,
  isMinorBand,
  normalizeStorefront,
  organizationViewerRolesFor,
  subtractMonths,
  type HealthAgeBand,
  type HealthGrantApprovalStatus,
  type HealthPermit,
} from "./services/health/policy";

export { HealthServiceError };

export const HEALTH_CONSENT_VERSION = "duna-health-v1";
export const HEALTH_CONSENT_TEXT =
  "I direct Duna to import the Apple Health categories I select for my private performance timeline. Duna will not use health data for advertising or sell it. I choose each Duna audience, data category, use, and expiration separately, and I can revoke Duna sharing or delete imported data at any time. Apple Health source permissions remain controlled in Apple Health and Settings.";

const ALL_CATEGORIES: readonly HealthCategory[] = [
  "heart",
  "recovery",
  "activity",
  "body",
];
const ALL_SCOPES: readonly HealthSharingScope[] = [
  "summary",
  "timeline",
  "video-overlay",
];
const STAFF_HEALTH_ROLES = ["owner", "manager", "coach"] as const;

const METRIC_CATEGORY = HEALTH_METRIC_CATEGORY;

const ALL_HEALTH_METRICS = Object.keys(METRIC_CATEGORY) as HealthMetric[];
// HealthKit can produce tens of thousands of heart-rate samples for one
// player. Profile views need a representative recent window for summaries,
// not a bulk export. Per-metric caps prevent a high-volume metric from both
// starving lower-volume recovery data and forcing a serverless request to
// decrypt an unbounded history. Longer-lived, low-frequency metrics retain
// enough history for personalized baselines while dense heart-rate data stays
// bounded to the recent analysis window.
const HEALTH_PROFILE_METRIC_LIMITS = [
  ["heart-rate", 120, 8_192],
  ["resting-heart-rate", 400, 512],
  ["heart-rate-variability", 400, 512],
  ["walking-heart-rate", 400, 512],
  ["vo2-max", 400, 256],
  ["respiratory-rate", 400, 512],
  ["oxygen-saturation", 400, 512],
  ["body-temperature", 400, 512],
  ["sleep", 400, 4_096],
  ["active-energy", 400, 1_024],
  ["basal-energy", 400, 1_024],
  ["steps", 400, 512],
  ["distance", 400, 1_024],
  ["exercise-minutes", 400, 512],
  ["stand-minutes", 400, 512],
  ["workout", 400, 1_024],
  ["weight", 730, 256],
  ["body-fat", 730, 256],
  ["lean-body-mass", 730, 256],
] as const satisfies readonly (readonly [HealthMetric, number, number])[];

type HealthPayload = Pick<
  HealthSampleInput,
  "value" | "unit" | "categoryValue" | "source" | "workout"
>;

type EncryptedHealthPayload = {
  readonly encryptedPayload: string;
  readonly encryptionIv: string;
  readonly authTag: string;
  readonly keyVersion: number;
};

const COMPRESSED_HEALTH_PAYLOAD_PREFIX = "z1:";
type HealthCheckInPayload = Omit<HealthCheckInInput, "date">;

type HealthAccess = {
  readonly owner: boolean;
  readonly categories: readonly HealthCategory[];
  readonly scopes: readonly HealthSharingScope[];
  /** Metrics this owner's band may hold; reads filter to them. */
  readonly metrics?: readonly HealthMetric[];
  /** The owner's age band today (from their birth date). */
  readonly ownerBand?: HealthAgeBand;
  /** Newest grant that gives this viewer access (non-owners only). */
  readonly grantedAt?: Date;
};

export function healthGrantAllows(input: {
  readonly audienceKind: "player" | "coach" | "organization";
  readonly audiencePersonId?: string | null;
  readonly viewerPersonId: string;
  readonly expiresAt: Date;
  readonly revokedAt?: Date | null;
  readonly relationshipActive: boolean;
  readonly now: Date;
}): boolean {
  if (
    input.revokedAt ||
    input.expiresAt <= input.now ||
    !input.relationshipActive
  ) {
    return false;
  }
  return input.audienceKind === "organization"
    ? true
    : input.audiencePersonId === input.viewerPersonId;
}

export function healthAccessAllows(
  access: HealthAccess | undefined,
  category: HealthCategory,
  scope: HealthSharingScope,
): boolean {
  return Boolean(
    access?.categories.includes(category) &&
    (access.owner || access.scopes.includes(scope)),
  );
}

export function healthCheckInContextAllowed(access: HealthAccess): boolean {
  return access.owner || access.categories.includes("recovery");
}

export function redactHealthIntelligenceForViewer(
  intelligence: HealthIntelligence,
  owner: boolean,
): HealthIntelligence {
  if (owner) return intelligence;
  return {
    ...intelligence,
    readiness: {
      ...intelligence.readiness,
      factors: intelligence.readiness.factors.map((factor) =>
        factor.id === "self-report"
          ? {
              ...factor,
              summary:
                factor.score === undefined
                  ? "No athlete-reported context contributed to this summary."
                  : "An athlete-reported context signal contributed to this derived factor; the private answers and note are not shared.",
            }
          : factor,
      ),
    },
  };
}

function requireDatabase(): void {
  if (!process.env.DATABASE_URL) {
    throw new HealthServiceError(
      "DATABASE_REQUIRED",
      "Duna Health requires the connected Duna database.",
    );
  }
}

/** Region refusals are audited (no storefront value, no Health values). */
async function auditRegionRefusal(input: {
  readonly actor: ApiActor;
  readonly action: string;
  readonly error: unknown;
  readonly requestId?: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<void> {
  if (
    !(input.error instanceof HealthServiceError) ||
    (input.error.healthReason !== "region-not-supported" &&
      input.error.healthReason !== "region-unknown") ||
    usesDemoData()
  ) {
    return;
  }
  await recordHealthAudit({
    actorPersonId: input.actor.personId,
    action: "health.refused_region",
    entityType: "health-connection",
    entityId: input.actor.personId,
    reason: `Duna Health refused ${input.action}: the App Store storefront was ${input.error.healthReason === "region-unknown" ? "not reported" : "outside the United States"} under ${HEALTH_POLICY_VERSION}.`,
    requestId: input.requestId,
    ipAddress: input.ipAddress,
    now: input.now,
  });
}

/** Stores the last storefront claim on an existing connection. */
async function recordStorefrontClaim(input: {
  readonly personId: string;
  readonly storefront?: string | null;
  readonly now: Date;
}): Promise<void> {
  if (usesDemoData()) return;
  await getDatabase()
    .update(healthConnections)
    .set({
      storefrontCountry: normalizeStorefront(input.storefront) ?? null,
      storefrontReportedAt: input.now,
      updatedAt: input.now,
    })
    .where(eq(healthConnections.personId, input.personId));
}

/**
 * Runs the policy for the signed-in owner. Region refusals are audited and
 * the reported storefront is stored either way.
 */
async function requireOwnHealthAction(input: {
  readonly actor: ApiActor;
  readonly action: "sync" | "check-in" | "create-grant";
  readonly storefront?: string | null;
  readonly now: Date;
  readonly requestId?: string;
  readonly ipAddress?: string;
}): Promise<{
  readonly state: HealthSubjectState;
  readonly permit: HealthPermit;
}> {
  if (input.action !== "sync") {
    await recordStorefrontClaim({
      personId: input.actor.personId,
      storefront: input.storefront,
      now: input.now,
    });
  }
  try {
    return await requireHealthEligibility({
      actor: input.actor,
      action: input.action,
      storefront: input.storefront,
      now: input.now,
    });
  } catch (error) {
    if (input.action === "sync") {
      await recordStorefrontClaim({
        personId: input.actor.personId,
        storefront: input.storefront,
        now: input.now,
      });
    }
    await auditRegionRefusal({ ...input, error });
    throw error;
  }
}

function adultBornOnOrBefore(now: Date): string {
  return subtractMonths(now, HEALTH_ADULT_AGE * 12)
    .toISOString()
    .slice(0, 10);
}

/** SQL twin of currentAgeBand(...) === "adult" for recipient lists. */
function personIsAdultNow(now: Date) {
  return sql`((${people.birthDate} IS NOT NULL AND ${people.birthDate} <= ${adultBornOnOrBefore(now)}::date) OR (${people.birthDate} IS NULL AND ${people.ageBand} = 'adult'))`;
}

async function requireNoPendingAccountDeletion(
  personId: string,
): Promise<void> {
  const activeRequest = await getDatabase().query.privacyRequests.findFirst({
    where: and(
      eq(privacyRequests.personId, personId),
      eq(privacyRequests.kind, "account-deletion"),
      inArray(privacyRequests.status, [
        "queued",
        "identity-review",
        "legal-hold",
      ]),
    ),
  });
  if (activeRequest) {
    throw new HealthServiceError(
      "ACCESS_DENIED",
      "Apple Health sync and new sharing are disabled while account deletion is pending.",
    );
  }
}

function masterKey(): Buffer {
  const encoded = process.env.HEALTH_DATA_ENCRYPTION_KEY?.trim();
  if (!encoded) {
    throw new HealthServiceError(
      "ENCRYPTION_REQUIRED",
      "Health encryption is not configured.",
    );
  }
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new HealthServiceError(
      "ENCRYPTION_REQUIRED",
      "HEALTH_DATA_ENCRYPTION_KEY must be a base64-encoded 32-byte key.",
    );
  }
  return key;
}

function derivedKey(purpose: "payload" | "external-id"): Buffer {
  return createHmac("sha256", masterKey())
    .update(`duna-health-${purpose}-v1`)
    .digest();
}

function encryptHealthJson(payload: unknown): EncryptedHealthPayload {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", derivedKey("payload"), iv);
  const cleartext = Buffer.from(JSON.stringify(payload), "utf8");
  const compressed = deflateRawSync(cleartext);
  const useCompression =
    compressed.length + COMPRESSED_HEALTH_PAYLOAD_PREFIX.length <
    cleartext.length;
  const encrypted = Buffer.concat([
    cipher.update(useCompression ? compressed : cleartext),
    cipher.final(),
  ]);
  return {
    encryptedPayload: `${useCompression ? COMPRESSED_HEALTH_PAYLOAD_PREFIX : ""}${encrypted.toString("base64")}`,
    encryptionIv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    keyVersion: 1,
  };
}

export function encryptHealthPayload(
  payload: HealthPayload,
): EncryptedHealthPayload {
  return encryptHealthJson(payload);
}

function decryptHealthJson<Value>(encrypted: EncryptedHealthPayload): Value {
  if (encrypted.keyVersion !== 1) {
    throw new HealthServiceError(
      "ENCRYPTION_REQUIRED",
      "This health record requires an unavailable encryption key version.",
    );
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    derivedKey("payload"),
    Buffer.from(encrypted.encryptionIv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"));
  const compressed = encrypted.encryptedPayload.startsWith(
    COMPRESSED_HEALTH_PAYLOAD_PREFIX,
  );
  const ciphertext = compressed
    ? encrypted.encryptedPayload.slice(COMPRESSED_HEALTH_PAYLOAD_PREFIX.length)
    : encrypted.encryptedPayload;
  const decoded = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]);
  const cleartext = (compressed ? inflateRawSync(decoded) : decoded).toString(
    "utf8",
  );
  return JSON.parse(cleartext) as Value;
}

export function decryptHealthPayload(
  encrypted: EncryptedHealthPayload,
): HealthPayload {
  return decryptHealthJson<HealthPayload>(encrypted);
}

function externalIdHash(personId: string, externalId: string): string {
  return createHmac("sha256", derivedKey("external-id"))
    .update(`${personId}:${externalId}`)
    .digest("hex");
}

function consentTextHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function metricCategory(metric: HealthMetric): HealthCategory {
  return METRIC_CATEGORY[metric];
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

async function recordHealthAudit(input: {
  readonly actorPersonId: string;
  readonly action: string;
  readonly entityType: "health-connection" | "health-grant" | "health-profile";
  readonly entityId: string;
  readonly reason: string;
  readonly requestId?: string;
  readonly ipAddress?: string;
  readonly now: Date;
}) {
  await getDatabase().insert(auditLog).values({
    actorPersonId: input.actorPersonId,
    actorType: "person",
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    reason: input.reason,
    traceId: input.requestId,
    ipAddress: input.ipAddress,
    createdAt: input.now,
  });
}

async function ownerOrganizationIds(personId: string): Promise<string[]> {
  const database = getDatabase();
  const [memberRows, staffRows] = await Promise.all([
    database
      .select({ organizationId: membershipTiers.organizationId })
      .from(memberships)
      .innerJoin(membershipTiers, eq(memberships.tierId, membershipTiers.id))
      .where(
        and(
          eq(memberships.personId, personId),
          inArray(memberships.status, ["active", "trialing"]),
          isNotNull(membershipTiers.organizationId),
        ),
      ),
    database
      .select({ organizationId: organizationMemberships.organizationId })
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.personId, personId),
          eq(organizationMemberships.active, true),
        ),
      ),
  ]);
  return unique(
    [...memberRows, ...staffRows]
      .map((row) => row.organizationId)
      .filter((value): value is string => Boolean(value)),
  );
}

async function playerRelationshipExists(
  ownerPersonId: string,
  otherPersonId: string,
): Promise<boolean> {
  const database = getDatabase();
  const direct = await database
    .select({ entityId: follows.entityId })
    .from(follows)
    .where(
      and(
        eq(follows.followerPersonId, ownerPersonId),
        eq(follows.entityType, "person"),
        eq(follows.entityId, otherPersonId),
      ),
    )
    .limit(1);
  if (direct.length > 0) return true;
  const ownerTeams = await database
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .where(eq(teamMembers.personId, ownerPersonId));
  if (ownerTeams.length === 0) return false;
  const teammate = await database
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.personId, otherPersonId),
        inArray(
          teamMembers.teamId,
          ownerTeams.map((row) => row.teamId),
        ),
      ),
    )
    .limit(1);
  return teammate.length > 0;
}

async function activeCoachRelationshipExists(
  ownerPersonId: string,
  coachPersonId: string,
): Promise<boolean> {
  const organizationIds = await ownerOrganizationIds(ownerPersonId);
  if (organizationIds.length === 0) return false;
  const row = await getDatabase()
    .select({ id: organizationMemberships.id })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.personId, coachPersonId),
        eq(organizationMemberships.role, "coach"),
        eq(organizationMemberships.active, true),
        inArray(organizationMemberships.organizationId, organizationIds),
      ),
    )
    .limit(1);
  return row.length > 0;
}

async function activeOrganizationViewer(
  ownerPersonId: string,
  viewerPersonId: string,
  organizationId: string,
  roles: readonly string[] = STAFF_HEALTH_ROLES,
): Promise<boolean> {
  const ownerOrganizations = await ownerOrganizationIds(ownerPersonId);
  if (!ownerOrganizations.includes(organizationId)) return false;
  const rows = await getDatabase()
    .select({ role: organizationMemberships.role })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.organizationId, organizationId),
        eq(organizationMemberships.personId, viewerPersonId),
        eq(organizationMemberships.active, true),
        inArray(
          organizationMemberships.role,
          roles as (typeof STAFF_HEALTH_ROLES)[number][],
        ),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

async function resolveHealthAccess(input: {
  readonly ownerPersonId: string;
  readonly viewerPersonId: string;
  readonly now: Date;
  readonly ownerState?: HealthSubjectState;
  /**
   * Read inside one club's workspace: an organization grant counts only when
   * it names this club, and a coach grant only when the viewer coaches the
   * owner at this club. Omitted for the person-to-person reads.
   */
  readonly organizationId?: string;
}): Promise<HealthAccess | undefined> {
  const ownerState =
    input.ownerState ??
    (await loadHealthSubjectState({
      personId: input.ownerPersonId,
      now: input.now,
    }));
  const ownerPermit = decideForSubject(ownerState, "view-own");
  if (!ownerPermit.allowed) return undefined;
  const allowedCategories = ownerPermit.allowedCategories;
  if (input.ownerPersonId === input.viewerPersonId) {
    return {
      owner: true,
      categories: ALL_CATEGORIES.filter((category) =>
        allowedCategories.includes(category),
      ),
      scopes: ALL_SCOPES,
      metrics: ownerPermit.allowedMetrics,
      ownerBand: ownerState.band,
    };
  }
  const grants = await getDatabase()
    .select()
    .from(healthSharingGrants)
    .where(
      and(
        eq(healthSharingGrants.ownerPersonId, input.ownerPersonId),
        isNull(healthSharingGrants.revokedAt),
        gte(healthSharingGrants.expiresAt, input.now),
        or(
          eq(healthSharingGrants.audiencePersonId, input.viewerPersonId),
          isNotNull(healthSharingGrants.organizationId),
        ),
      ),
    );
  const valid = [] as typeof grants;
  for (const grant of grants) {
    const audienceKind = grant.audienceKind as
      "player" | "coach" | "organization";
    if (
      !healthGrantIsEffective({
        audienceKind,
        approvalStatus: grant.approvalStatus as HealthGrantApprovalStatus,
        expiresAt: grant.expiresAt,
        revokedAt: grant.revokedAt,
        ownerBand: ownerState.band,
        juniorsEnabled: ownerState.juniorsEnabled,
        now: input.now,
      })
    ) {
      continue;
    }
    const baseGrant = {
      audienceKind,
      audiencePersonId: grant.audiencePersonId,
      viewerPersonId: input.viewerPersonId,
      expiresAt: grant.expiresAt,
      revokedAt: grant.revokedAt,
      now: input.now,
    };
    if (
      grant.audienceKind === "player" &&
      !input.organizationId &&
      healthGrantAllows({
        ...baseGrant,
        relationshipActive: await playerRelationshipExists(
          input.ownerPersonId,
          input.viewerPersonId,
        ),
      })
    ) {
      valid.push(grant);
    }
    if (
      grant.audienceKind === "coach" &&
      healthGrantAllows({
        ...baseGrant,
        relationshipActive: input.organizationId
          ? await activeOrganizationViewer(
              input.ownerPersonId,
              input.viewerPersonId,
              input.organizationId,
              ["coach"],
            )
          : await activeCoachRelationshipExists(
              input.ownerPersonId,
              input.viewerPersonId,
            ),
      })
    ) {
      valid.push(grant);
    }
    if (
      grant.audienceKind === "organization" &&
      grant.organizationId &&
      (!input.organizationId ||
        grant.organizationId === input.organizationId) &&
      healthGrantAllows({
        ...baseGrant,
        relationshipActive: await activeOrganizationViewer(
          input.ownerPersonId,
          input.viewerPersonId,
          grant.organizationId,
          organizationViewerRolesFor(ownerState.band),
        ),
      })
    ) {
      valid.push(grant);
    }
  }
  if (valid.length === 0) return undefined;
  return {
    owner: false,
    categories: unique(
      valid.flatMap((grant) => grant.categories as HealthCategory[]),
    ).filter((category) => allowedCategories.includes(category)),
    scopes: unique(
      valid.flatMap((grant) => grant.scopes as HealthSharingScope[]),
    ),
    metrics: ownerPermit.allowedMetrics,
    ownerBand: ownerState.band,
    grantedAt: new Date(
      Math.max(...valid.map((grant) => grant.createdAt.getTime())),
    ),
  };
}

export async function syncHealthSamples(input: {
  readonly actor: ApiActor;
  readonly categories: readonly HealthCategory[];
  readonly timezone: string;
  readonly earliestAuthorizedAt?: Date;
  readonly samples: readonly HealthSampleInput[];
  readonly deletedExternalIds: readonly string[];
  readonly storefront?: string | null;
  readonly syncedAt: Date;
  readonly requestId?: string;
  readonly ipAddress?: string;
}): Promise<{
  readonly imported: number;
  readonly deleted: number;
  readonly dropped: number;
  readonly protocolVersion: 2;
}> {
  const { permit } = await requireOwnHealthAction({
    actor: input.actor,
    action: "sync",
    storefront: input.storefront,
    now: input.syncedAt,
    requestId: input.requestId,
    ipAddress: input.ipAddress,
  });
  // A minor may sync only the minimal categories; anything else selected on
  // an older client is ignored rather than stored.
  const categories = unique(input.categories).filter((category) =>
    permit.allowedCategories.includes(category),
  );
  if (categories.length === 0) {
    throw new HealthServiceError(
      "INVALID_GRANT",
      "Select at least one Apple Health category to sync.",
    );
  }
  const disallowed = input.samples.find(
    (sample) =>
      permit.allowedMetrics.includes(sample.metric) &&
      !categories.includes(metricCategory(sample.metric)),
  );
  if (disallowed) {
    throw new HealthServiceError(
      "ACCESS_DENIED",
      "A sample was outside the Health categories selected by the player.",
    );
  }
  // Metrics outside the band's allowlist are dropped before encryption and
  // never stored; the count is returned and audited, never the values.
  const { kept: samples, dropped } = filterSamplesForBand(
    input.samples,
    permit.allowedMetrics,
  );
  if (usesDemoData()) {
    return {
      imported: samples.length,
      deleted: input.deletedExternalIds.length,
      dropped,
      protocolVersion: 2,
    };
  }
  requireDatabase();
  await requireNoPendingAccountDeletion(input.actor.personId);
  masterKey();
  const database = getDatabase();
  const [existingConnection] = await database
    .select({ purgeRequestedAt: healthConnections.purgeRequestedAt })
    .from(healthConnections)
    .where(eq(healthConnections.personId, input.actor.personId))
    .limit(1);
  if (existingConnection?.purgeRequestedAt) {
    throw new HealthServiceError(
      "ACCESS_DENIED",
      "Duna is deleting previously imported Health data after a withdrawal. Syncing can start again once that finishes (within a day).",
    );
  }
  const storefrontCountry = normalizeStorefront(input.storefront) ?? null;
  const deletionHashes = input.deletedExternalIds.map((externalId) =>
    externalIdHash(input.actor.personId, externalId),
  );
  const rows = samples.map((sample) => ({
    personId: input.actor.personId,
    externalIdHash: externalIdHash(input.actor.personId, sample.externalId),
    metric: sample.metric,
    sampleKind: sample.kind,
    startedAt: new Date(sample.startedAt),
    endedAt: new Date(sample.endedAt),
    ...encryptHealthPayload({
      value: sample.value,
      unit: sample.unit,
      categoryValue: sample.categoryValue,
      source: sample.source,
      workout: sample.workout,
    }),
    createdAt: input.syncedAt,
    updatedAt: input.syncedAt,
  }));
  const deletionQuery = database
    .delete(healthSamples)
    .where(
      and(
        eq(healthSamples.personId, input.actor.personId),
        inArray(healthSamples.externalIdHash, deletionHashes),
      ),
    )
    .returning({ id: healthSamples.id });
  const connectionQuery = database
    .insert(healthConnections)
    .values({
      personId: input.actor.personId,
      provider: "apple-health",
      status: "active",
      consentVersion: HEALTH_CONSENT_VERSION,
      enabledCategories: categories,
      timezone: input.timezone,
      earliestAuthorizedAt: input.earliestAuthorizedAt,
      lastSyncedAt: input.syncedAt,
      revokedAt: null,
      storefrontCountry,
      storefrontReportedAt: input.syncedAt,
      createdAt: input.syncedAt,
      updatedAt: input.syncedAt,
    })
    .onConflictDoUpdate({
      target: healthConnections.personId,
      set: {
        status: "active",
        consentVersion: HEALTH_CONSENT_VERSION,
        enabledCategories: categories,
        timezone: input.timezone,
        earliestAuthorizedAt: sql`COALESCE(LEAST(${healthConnections.earliestAuthorizedAt}, excluded.earliest_authorized_at), ${healthConnections.earliestAuthorizedAt}, excluded.earliest_authorized_at)`,
        lastSyncedAt: input.syncedAt,
        revokedAt: null,
        storefrontCountry,
        storefrontReportedAt: input.syncedAt,
        updatedAt: input.syncedAt,
      },
    });
  const auditQuery = database.insert(auditLog).values({
    actorPersonId: input.actor.personId,
    actorType: "person",
    action: "health.sync_completed",
    entityType: "health-connection",
    entityId: input.actor.personId,
    reason: `The player synchronized ${rows.length} encrypted Apple Health records, dropped ${dropped} outside their age band's metric allowlist, and submitted ${deletionHashes.length} deletion tombstones under ${HEALTH_CONSENT_VERSION} and ${HEALTH_POLICY_VERSION}.`,
    traceId: input.requestId,
    ipAddress: input.ipAddress,
    createdAt: input.syncedAt,
  });
  let deleted: number;
  if (rows.length > 0) {
    const [, removed] = await database.batch([
      database
        .insert(healthSamples)
        .values(rows)
        .onConflictDoUpdate({
          target: [healthSamples.personId, healthSamples.externalIdHash],
          set: {
            metric: sql`excluded.metric`,
            sampleKind: sql`excluded.sample_kind`,
            startedAt: sql`excluded.started_at`,
            endedAt: sql`excluded.ended_at`,
            encryptedPayload: sql`excluded.encrypted_payload`,
            encryptionIv: sql`excluded.encryption_iv`,
            authTag: sql`excluded.auth_tag`,
            keyVersion: sql`excluded.key_version`,
            updatedAt: input.syncedAt,
          },
        }),
      deletionQuery,
      connectionQuery,
      auditQuery,
    ]);
    deleted = removed.length;
  } else {
    const [removed] = await database.batch([
      deletionQuery,
      connectionQuery,
      auditQuery,
    ]);
    deleted = removed.length;
  }
  return { imported: rows.length, deleted, dropped, protocolVersion: 2 };
}

function serializeHealthCheckIn(
  row: typeof healthDailyCheckIns.$inferSelect,
): HealthCheckIn {
  const payload = decryptHealthJson<HealthCheckInPayload>({
    encryptedPayload: row.encryptedPayload,
    encryptionIv: row.encryptionIv,
    authTag: row.authTag,
    keyVersion: row.keyVersion,
  });
  return {
    date: row.localDate,
    ...payload,
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function loadHealthCheckIns(
  personId: string,
  limit = 90,
): Promise<HealthCheckIn[]> {
  const rows = await getDatabase()
    .select()
    .from(healthDailyCheckIns)
    .where(eq(healthDailyCheckIns.personId, personId))
    .orderBy(desc(healthDailyCheckIns.localDate))
    .limit(limit);
  return rows.map(serializeHealthCheckIn);
}

export async function saveHealthCheckIn(input: {
  readonly actor: ApiActor;
  readonly checkIn: HealthCheckInInput;
  readonly storefront?: string | null;
  readonly requestId?: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{ readonly saved: true }> {
  await requireOwnHealthAction({
    actor: input.actor,
    action: "check-in",
    storefront: input.storefront,
    now: input.now,
    requestId: input.requestId,
    ipAddress: input.ipAddress,
  });
  if (usesDemoData()) return { saved: true };
  requireDatabase();
  await requireNoPendingAccountDeletion(input.actor.personId);
  masterKey();
  const dateAtNoon = new Date(`${input.checkIn.date}T12:00:00.000Z`);
  if (
    Number.isNaN(dateAtNoon.getTime()) ||
    dateAtNoon.getTime() > input.now.getTime() + 24 * 60 * 60 * 1_000 ||
    dateAtNoon.getTime() < input.now.getTime() - 7 * 24 * 60 * 60 * 1_000
  ) {
    throw new HealthServiceError(
      "INVALID_GRANT",
      "A Duna Health check-in must describe today or one of the last seven days.",
    );
  }
  const { date, ...payload } = input.checkIn;
  const encrypted = encryptHealthJson(payload);
  const database = getDatabase();
  await database.batch([
    database
      .insert(healthDailyCheckIns)
      .values({
        personId: input.actor.personId,
        localDate: date,
        ...encrypted,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .onConflictDoUpdate({
        target: [healthDailyCheckIns.personId, healthDailyCheckIns.localDate],
        set: {
          ...encrypted,
          updatedAt: input.now,
        },
      }),
    database.insert(auditLog).values({
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "health.check_in_saved",
      entityType: "health-profile",
      entityId: input.actor.personId,
      reason:
        "The player saved an encrypted private daily check-in for personalized readiness context.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  return { saved: true };
}

async function loadSharingCandidates(
  ownerPersonId: string,
  options: {
    readonly now: Date;
    readonly audiences: readonly ("player" | "coach" | "organization")[];
    readonly minor?: boolean;
  },
): Promise<HealthSharingCandidate[]> {
  const database = getDatabase();
  const adultNow = personIsAdultNow(options.now);
  const organizationIds = await ownerOrganizationIds(ownerPersonId);
  const ownerTeamRows = await database
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .where(eq(teamMembers.personId, ownerPersonId));
  const [followRows, teammateRows, coachRows, organizationRows] =
    await Promise.all([
      database
        .select({
          id: people.id,
          displayName: people.displayName,
          handle: people.handle,
        })
        .from(follows)
        .innerJoin(people, eq(follows.entityId, people.id))
        .where(
          and(
            eq(follows.followerPersonId, ownerPersonId),
            eq(follows.entityType, "person"),
            adultNow,
            eq(people.status, "active"),
          ),
        ),
      ownerTeamRows.length === 0
        ? Promise.resolve([])
        : database
            .selectDistinct({
              id: people.id,
              displayName: people.displayName,
              handle: people.handle,
            })
            .from(teamMembers)
            .innerJoin(people, eq(teamMembers.personId, people.id))
            .where(
              and(
                inArray(
                  teamMembers.teamId,
                  ownerTeamRows.map((row) => row.teamId),
                ),
                ne(people.id, ownerPersonId),
                adultNow,
                eq(people.status, "active"),
              ),
            ),
      organizationIds.length === 0
        ? Promise.resolve([])
        : database
            .selectDistinct({
              id: people.id,
              displayName: people.displayName,
              handle: people.handle,
            })
            .from(organizationMemberships)
            .innerJoin(people, eq(organizationMemberships.personId, people.id))
            .where(
              and(
                inArray(
                  organizationMemberships.organizationId,
                  organizationIds,
                ),
                eq(organizationMemberships.role, "coach"),
                eq(organizationMemberships.active, true),
                adultNow,
                eq(people.status, "active"),
              ),
            ),
      organizationIds.length === 0
        ? Promise.resolve([])
        : database
            .select({ id: organizations.id, name: organizations.name })
            .from(organizations)
            .where(inArray(organizations.id, organizationIds)),
    ]);
  const players = new Map(
    options.audiences.includes("player")
      ? [...followRows, ...teammateRows].map((row) => [row.id, row])
      : [],
  );
  return [
    ...[...players.values()].map((person) => ({
      id: `player:${person.id}`,
      kind: "player" as const,
      label: person.displayName,
      detail: `Duna player · @${person.handle}`,
      personId: person.id,
    })),
    ...coachRows.map((person) => ({
      id: `coach:${person.id}`,
      kind: "coach" as const,
      label: person.displayName,
      detail: `Coach · @${person.handle}`,
      personId: person.id,
    })),
    ...organizationRows.map((organization) => ({
      id: `organization:${organization.id}`,
      kind: "organization" as const,
      label: organization.name,
      detail: options.minor
        ? "Club coaching staff"
        : "Authorized owner, manager, and coach staff",
      organizationId: organization.id,
    })),
  ].sort((a, b) => a.label.localeCompare(b.label));
}

async function serializeActiveGrants(input: {
  readonly ownerPersonId: string;
  readonly now: Date;
  readonly candidates: readonly HealthSharingCandidate[];
  readonly includePending?: boolean;
}): Promise<HealthSharingGrant[]> {
  const rows = await getDatabase()
    .select()
    .from(healthSharingGrants)
    .where(
      and(
        eq(healthSharingGrants.ownerPersonId, input.ownerPersonId),
        isNull(healthSharingGrants.revokedAt),
        gte(healthSharingGrants.expiresAt, input.now),
      ),
    )
    .orderBy(desc(healthSharingGrants.createdAt));
  const candidateMap = new Map(input.candidates.map((item) => [item.id, item]));
  const personIds = unique(
    rows
      .map((row) => row.audiencePersonId)
      .filter((id): id is string => Boolean(id)),
  );
  const organizationIds = unique(
    rows
      .map((row) => row.organizationId)
      .filter((id): id is string => Boolean(id)),
  );
  const [personRows, organizationRows] = await Promise.all([
    personIds.length === 0
      ? Promise.resolve([])
      : getDatabase()
          .select({
            id: people.id,
            displayName: people.displayName,
            handle: people.handle,
          })
          .from(people)
          .where(inArray(people.id, personIds)),
    organizationIds.length === 0
      ? Promise.resolve([])
      : getDatabase()
          .select({ id: organizations.id, name: organizations.name })
          .from(organizations)
          .where(inArray(organizations.id, organizationIds)),
  ]);
  const peopleMap = new Map(personRows.map((row) => [row.id, row]));
  const organizationMap = new Map(organizationRows.map((row) => [row.id, row]));
  return rows.map((row) => {
    const targetId =
      row.audienceKind === "organization"
        ? `organization:${row.organizationId}`
        : `${row.audienceKind}:${row.audiencePersonId}`;
    let audience = candidateMap.get(targetId);
    if (!audience && row.audiencePersonId) {
      const person = peopleMap.get(row.audiencePersonId);
      audience = {
        id: targetId,
        kind: row.audienceKind as "player" | "coach",
        label: person?.displayName ?? "Unavailable person",
        detail: person
          ? `@${person.handle}`
          : "Relationship is no longer active",
        personId: row.audiencePersonId,
      };
    }
    if (!audience && row.organizationId) {
      const organization = organizationMap.get(row.organizationId);
      audience = {
        id: targetId,
        kind: "organization",
        label: organization?.name ?? "Unavailable organization",
        detail: organization
          ? "Authorized owner, manager, and coach staff"
          : "Organization is no longer available",
        organizationId: row.organizationId,
      };
    }
    return {
      id: row.id,
      audience: audience!,
      categories: row.categories as HealthCategory[],
      scopes: row.scopes as HealthSharingScope[],
      expiresAt: row.expiresAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      approvalStatus: row.approvalStatus as HealthGrantApprovalStatus,
      approvedAt: row.approvedAt?.toISOString(),
    };
  });
}

export async function createHealthSharingGrant(input: {
  readonly actor: ApiActor;
  readonly candidate: {
    readonly kind: "player" | "coach" | "organization";
    readonly personId?: string;
    readonly organizationId?: string;
  };
  readonly categories: readonly HealthCategory[];
  readonly scopes: readonly HealthSharingScope[];
  readonly expiresAt: Date;
  readonly storefront?: string | null;
  readonly requestId?: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{
  readonly id: string;
  readonly approvalStatus: HealthGrantApprovalStatus;
}> {
  const { state, permit } = await requireOwnHealthAction({
    actor: input.actor,
    action: "create-grant",
    storefront: input.storefront,
    now: input.now,
    requestId: input.requestId,
    ipAddress: input.ipAddress,
  });
  const categories = unique(input.categories);
  const scopes = unique(input.scopes);
  const violation = checkHealthGrantRequest({
    permit,
    audienceKind: input.candidate.kind,
    categories,
    scopes,
    expiresAt: input.expiresAt,
    now: input.now,
  });
  if (violation) {
    throw new HealthServiceError(
      "INVALID_GRANT",
      {
        "audience-not-allowed":
          "Players under 18 can share Health only with a coach or their club's coaching staff.",
        "no-categories":
          "Choose both Health categories and how the recipient may use them.",
        "category-not-allowed":
          "That Health category is not collected for players under 18.",
        "video-overlay-needs-heart":
          "Video overlays require explicit access to the Heart category.",
        "expiry-in-past": `Health sharing must expire within ${permit.maxGrantDays} days.`,
        "expiry-too-long": permit.minor
          ? `Health sharing for players under 18 lasts at most ${permit.maxGrantDays} days.`
          : "Health sharing must expire within one year.",
      }[violation],
    );
  }
  const approvalStatus: HealthGrantApprovalStatus =
    permit.grantRequiresGuardianApproval ? "pending" : "not-required";
  if (usesDemoData()) {
    return { id: randomUUID(), approvalStatus };
  }
  requireDatabase();
  await requireNoPendingAccountDeletion(input.actor.personId);
  const candidates = await loadSharingCandidates(input.actor.personId, {
    now: input.now,
    audiences: permit.allowedAudiences,
    minor: permit.minor,
  });
  const candidate = candidates.find(
    (item) =>
      item.kind === input.candidate.kind &&
      item.personId === input.candidate.personId &&
      item.organizationId === input.candidate.organizationId,
  );
  if (!candidate) {
    throw new HealthServiceError(
      "INVALID_GRANT",
      "That person or organization is no longer an eligible Health recipient.",
    );
  }
  const consent = [
    HEALTH_CONSENT_TEXT,
    `owner=${input.actor.personId}`,
    `audience=${candidate.id}`,
    `categories=${[...categories].sort().join(",")}`,
    `scopes=${[...scopes].sort().join(",")}`,
    `expires=${input.expiresAt.toISOString()}`,
    `policy=${HEALTH_POLICY_VERSION}`,
  ].join("\n");
  const id = randomUUID();
  const database = getDatabase();
  await database.batch([
    database
      .update(healthSharingGrants)
      .set({ revokedAt: input.now, updatedAt: input.now })
      .where(
        and(
          eq(healthSharingGrants.ownerPersonId, input.actor.personId),
          eq(healthSharingGrants.audienceKind, input.candidate.kind),
          input.candidate.personId
            ? eq(healthSharingGrants.audiencePersonId, input.candidate.personId)
            : eq(
                healthSharingGrants.organizationId,
                input.candidate.organizationId!,
              ),
          isNull(healthSharingGrants.revokedAt),
        ),
      ),
    database.insert(healthSharingGrants).values({
      id,
      ownerPersonId: input.actor.personId,
      audienceKind: input.candidate.kind,
      audiencePersonId: input.candidate.personId,
      organizationId: input.candidate.organizationId,
      categories,
      scopes,
      consentVersion: HEALTH_CONSENT_VERSION,
      consentTextHash: consentTextHash(consent),
      approvalStatus,
      expiresAt: input.expiresAt,
      createdAt: input.now,
      updatedAt: input.now,
    }),
    database.insert(auditLog).values({
      actorPersonId: input.actor.personId,
      actorType: "person",
      action:
        approvalStatus === "pending"
          ? "health.sharing_requested"
          : "health.sharing_granted",
      entityType: "health-grant",
      entityId: id,
      reason:
        approvalStatus === "pending"
          ? `A ${state.band} player asked to share Health with a ${candidate.kind} until ${input.expiresAt.toISOString()}; it stays unreadable until a linked adult guardian approves, under ${HEALTH_POLICY_VERSION}.`
          : `The player explicitly granted ${candidate.kind} access until ${input.expiresAt.toISOString()} under ${HEALTH_CONSENT_VERSION}.`,
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  return { id, approvalStatus };
}

export async function revokeHealthSharingGrant(input: {
  readonly actor: ApiActor;
  readonly grantId: string;
  readonly requestId?: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{ readonly revoked: true }> {
  // Stopping a grant is never gated by age, region or the juniors switch.
  if (usesDemoData()) return { revoked: true };
  requireDatabase();
  const updated = await getDatabase()
    .update(healthSharingGrants)
    .set({ revokedAt: input.now, updatedAt: input.now })
    .where(
      and(
        eq(healthSharingGrants.id, input.grantId),
        eq(healthSharingGrants.ownerPersonId, input.actor.personId),
        isNull(healthSharingGrants.revokedAt),
      ),
    )
    .returning({ id: healthSharingGrants.id });
  if (updated.length === 0) {
    throw new HealthServiceError(
      "GRANT_NOT_FOUND",
      "That active Health sharing grant was not found.",
    );
  }
  await recordHealthAudit({
    actorPersonId: input.actor.personId,
    action: "health.sharing_revoked",
    entityType: "health-grant",
    entityId: input.grantId,
    reason: "The player revoked Duna Health display access immediately.",
    requestId: input.requestId,
    ipAddress: input.ipAddress,
    now: input.now,
  });
  return { revoked: true };
}

function localDate(value: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function average(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number | undefined, digits = 1): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function isAsleepSample(sample: HealthTimelineEntry): boolean {
  return (
    sample.metric === "sleep" &&
    Boolean(sample.categoryValue?.startsWith("asleep"))
  );
}

function unionDurationHours(samples: readonly HealthTimelineEntry[]): number {
  const intervals = samples
    .map((sample) => ({
      start: new Date(sample.startedAt).getTime(),
      end: new Date(sample.endedAt).getTime(),
    }))
    .filter((interval) => interval.end > interval.start)
    .sort((left, right) => left.start - right.start);
  let total = 0;
  let currentStart: number | undefined;
  let currentEnd: number | undefined;
  for (const interval of intervals) {
    if (currentStart === undefined || currentEnd === undefined) {
      currentStart = interval.start;
      currentEnd = interval.end;
    } else if (interval.start <= currentEnd) {
      currentEnd = Math.max(currentEnd, interval.end);
    } else {
      total += currentEnd - currentStart;
      currentStart = interval.start;
      currentEnd = interval.end;
    }
  }
  if (currentStart !== undefined && currentEnd !== undefined) {
    total += currentEnd - currentStart;
  }
  return total / 3_600_000;
}

function sleepDurationHours(samples: readonly HealthTimelineEntry[]): number {
  const asleep = samples.filter(isAsleepSample);
  const bySource = new Map<string, HealthTimelineEntry[]>();
  for (const sample of asleep) {
    const key = [
      sample.source?.bundleIdentifier ?? "unknown",
      sample.source?.device?.model ?? sample.source?.productType ?? "device",
    ].join(":");
    bySource.set(key, [...(bySource.get(key) ?? []), sample]);
  }
  const candidates = [...bySource.values()].map((sourceSamples) => {
    const staged = sourceSamples.filter((sample) =>
      ["asleep-core", "asleep-deep", "asleep-rem"].includes(
        sample.categoryValue ?? "",
      ),
    );
    return {
      staged: staged.length > 0,
      duration: unionDurationHours(staged.length > 0 ? staged : sourceSamples),
    };
  });
  return (
    candidates.sort(
      (left, right) =>
        Number(right.staged) - Number(left.staged) ||
        right.duration - left.duration,
    )[0]?.duration ?? 0
  );
}

function latestValue(
  samples: readonly HealthTimelineEntry[],
  metric: HealthMetric,
): number | undefined {
  return samples.find((sample) => sample.metric === metric)?.value;
}

function pearson(
  pairs: readonly { readonly x: number; readonly y: number }[],
): number | undefined {
  if (pairs.length < 5) return undefined;
  const xMean = average(pairs.map((pair) => pair.x))!;
  const yMean = average(pairs.map((pair) => pair.y))!;
  const numerator = pairs.reduce(
    (sum, pair) => sum + (pair.x - xMean) * (pair.y - yMean),
    0,
  );
  const xVariance = pairs.reduce((sum, pair) => sum + (pair.x - xMean) ** 2, 0);
  const yVariance = pairs.reduce((sum, pair) => sum + (pair.y - yMean) ** 2, 0);
  if (xVariance === 0 || yVariance === 0) return undefined;
  return Math.max(
    -1,
    Math.min(1, numerator / Math.sqrt(xVariance * yVariance)),
  );
}

export function computeHealthCorrelations(
  contexts: HealthProfile["matches"],
): HealthCorrelation[] {
  const configurations: readonly {
    metric: HealthCorrelation["metric"];
    value: (context: HealthProfile["matches"][number]) => number | undefined;
    label: string;
  }[] = [
    { metric: "sleep-hours", value: (item) => item.sleepHours, label: "sleep" },
    {
      metric: "active-energy-before",
      value: (item) => item.activeEnergyKcalBefore,
      label: "pre-match energy expenditure",
    },
    {
      metric: "resting-heart-rate",
      value: (item) => item.restingHeartRate,
      label: "resting heart rate",
    },
    {
      metric: "heart-rate-variability",
      value: (item) => item.heartRateVariabilityMs,
      label: "heart-rate variability",
    },
    {
      metric: "match-heart-rate",
      value: (item) => item.averageMatchHeartRate,
      label: "match heart rate",
    },
  ];
  return configurations.flatMap((configuration) => {
    const pairs = contexts.flatMap((context) => {
      const value = configuration.value(context);
      return value === undefined || context.result === "unknown"
        ? []
        : [{ x: value, y: context.result === "won" ? 1 : 0 }];
    });
    const coefficient = pearson(pairs);
    if (coefficient === undefined) return [];
    const direction =
      Math.abs(coefficient) < 0.2
        ? "showed little relationship with"
        : coefficient > 0
          ? "was associated with more wins in"
          : "was associated with fewer wins in";
    return [
      {
        metric: configuration.metric,
        coefficient: round(coefficient, 2)!,
        sampleSize: pairs.length,
        interpretation: `Your ${configuration.label} ${direction} this ${pairs.length}-match sample. This is an association, not a cause or medical conclusion.`,
      },
    ];
  });
}

function decryptRows(
  rows: readonly (typeof healthSamples.$inferSelect)[],
  categories: readonly HealthCategory[],
  metrics?: readonly HealthMetric[],
): HealthTimelineEntry[] {
  return rows.flatMap((row) => {
    const metric = row.metric as HealthMetric;
    const category = metricCategory(metric);
    if (!categories.includes(category)) return [];
    if (metrics && !metrics.includes(metric)) return [];
    const payload = decryptHealthPayload({
      encryptedPayload: row.encryptedPayload,
      encryptionIv: row.encryptionIv,
      authTag: row.authTag,
      keyVersion: row.keyVersion,
    });
    return [
      {
        id: row.id,
        metric,
        category,
        kind: row.sampleKind as HealthTimelineEntry["kind"],
        startedAt: row.startedAt.toISOString(),
        endedAt: row.endedAt.toISOString(),
        ...payload,
      },
    ];
  });
}

async function loadBoundedProfileSampleRows(input: {
  readonly personId: string;
  readonly categories: readonly HealthCategory[];
  readonly now: Date;
}): Promise<(typeof healthSamples.$inferSelect)[]> {
  const allowedMetrics = ALL_HEALTH_METRICS.filter((metric) =>
    input.categories.includes(metricCategory(metric)),
  );
  if (allowedMetrics.length === 0) return [];

  const database = getDatabase();
  const rows = await Promise.all(
    HEALTH_PROFILE_METRIC_LIMITS.filter(([metric]) =>
      allowedMetrics.includes(metric),
    ).map(([metric, lookbackDays, limit]) =>
      database
        .select()
        .from(healthSamples)
        .where(
          and(
            eq(healthSamples.personId, input.personId),
            eq(healthSamples.metric, metric),
            gte(
              healthSamples.startedAt,
              new Date(
                input.now.getTime() - lookbackDays * 24 * 60 * 60 * 1_000,
              ),
            ),
          ),
        )
        .orderBy(desc(healthSamples.startedAt))
        .limit(limit),
    ),
  );
  return rows
    .flat()
    .sort(
      (left, right) => right.startedAt.getTime() - left.startedAt.getTime(),
    );
}

function buildDaily(
  samples: readonly HealthTimelineEntry[],
  timezone: string,
): HealthProfile["daily"] {
  const groups = new Map<string, HealthTimelineEntry[]>();
  for (const sample of samples) {
    const date = localDate(new Date(sample.endedAt), timezone);
    groups.set(date, [...(groups.get(date) ?? []), sample]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 31)
    .map(([date, day]) => {
      const values = (metric: HealthMetric) =>
        day
          .filter((sample) => sample.metric === metric)
          .flatMap((sample) =>
            sample.value === undefined ? [] : [sample.value],
          );
      const total = (metric: HealthMetric) => {
        const entries = values(metric);
        return entries.length === 0
          ? undefined
          : entries.reduce((sum, value) => sum + value, 0);
      };
      const sleep = sleepDurationHours(day);
      return {
        date,
        sleepHours: sleep > 0 ? round(sleep, 1) : undefined,
        averageHeartRate: round(average(values("heart-rate")), 0),
        restingHeartRate: round(average(values("resting-heart-rate")), 0),
        heartRateVariabilityMs: round(
          average(values("heart-rate-variability")),
          0,
        ),
        activeEnergyKcal: round(total("active-energy"), 0),
        steps: round(total("steps"), 0),
        weightKilograms: round(
          day.find((item) => item.metric === "weight")?.value,
          1,
        ),
      };
    });
}

function valueBefore(
  samples: readonly HealthTimelineEntry[],
  metric: HealthMetric,
  at: Date,
  lookbackHours: number,
): number | undefined {
  const earliest = at.getTime() - lookbackHours * 3_600_000;
  return samples.find((sample) => {
    const timestamp = new Date(sample.endedAt).getTime();
    return (
      sample.metric === metric &&
      timestamp <= at.getTime() &&
      timestamp >= earliest
    );
  })?.value;
}

async function buildMatchContexts(
  personId: string,
  samples: readonly HealthTimelineEntry[],
): Promise<HealthProfile["matches"]> {
  const database = getDatabase();
  const playerTeams = await database
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .where(eq(teamMembers.personId, personId));
  if (playerTeams.length === 0) return [];
  const teamIds = playerTeams.map((row) => row.teamId);
  const matchRows = await database
    .select()
    .from(matches)
    .where(
      and(
        or(
          inArray(matches.teamAId, teamIds),
          inArray(matches.teamBId, teamIds),
        ),
        inArray(matches.status, ["complete", "forfeit", "verified"]),
      ),
    )
    .orderBy(desc(matches.completedAt))
    .limit(30);
  const referencedTeamIds = unique(
    matchRows.flatMap((match) =>
      [match.teamAId, match.teamBId].filter((id): id is string => Boolean(id)),
    ),
  );
  const teamRows =
    referencedTeamIds.length === 0
      ? []
      : await database
          .select({ id: teams.id, name: teams.name })
          .from(teams)
          .where(inArray(teams.id, referencedTeamIds));
  const teamNames = new Map(teamRows.map((team) => [team.id, team.name]));
  return matchRows.flatMap((match) => {
    const occurredAt =
      match.startedAt ?? match.scheduledAt ?? match.completedAt;
    if (!occurredAt) return [];
    const endedAt =
      match.completedAt ?? new Date(occurredAt.getTime() + 3 * 60 * 60 * 1_000);
    const sleepHours = sleepDurationHours(
      samples.filter(
        (sample) =>
          isAsleepSample(sample) &&
          new Date(sample.endedAt) <= occurredAt &&
          new Date(sample.endedAt).getTime() >=
            occurredAt.getTime() - 36 * 3_600_000,
      ),
    );
    const energy = samples
      .filter(
        (sample) =>
          sample.metric === "active-energy" &&
          sample.value !== undefined &&
          new Date(sample.endedAt) <= occurredAt &&
          new Date(sample.endedAt).getTime() >=
            occurredAt.getTime() - 24 * 3_600_000,
      )
      .reduce((sum, sample) => sum + (sample.value ?? 0), 0);
    const matchHeart = samples
      .filter(
        (sample) =>
          sample.metric === "heart-rate" &&
          sample.value !== undefined &&
          new Date(sample.startedAt) >= occurredAt &&
          new Date(sample.startedAt) <= endedAt,
      )
      .map((sample) => sample.value!);
    const playerTeamIds = [match.teamAId, match.teamBId].filter(
      (id): id is string => Boolean(id) && teamIds.includes(id!),
    );
    return [
      {
        matchId: match.id,
        label: `${teamNames.get(match.teamAId ?? "") ?? "Team A"} vs ${teamNames.get(match.teamBId ?? "") ?? "Team B"}`,
        occurredAt: occurredAt.toISOString(),
        result:
          !match.winnerTeamId || playerTeamIds.length === 0
            ? ("unknown" as const)
            : playerTeamIds.includes(match.winnerTeamId)
              ? ("won" as const)
              : ("lost" as const),
        sleepHours: sleepHours > 0 ? round(sleepHours, 1) : undefined,
        activeEnergyKcalBefore: energy > 0 ? round(energy, 0) : undefined,
        restingHeartRate: round(
          valueBefore(samples, "resting-heart-rate", occurredAt, 36),
          0,
        ),
        heartRateVariabilityMs: round(
          valueBefore(samples, "heart-rate-variability", occurredAt, 36),
          0,
        ),
        averageMatchHeartRate: round(average(matchHeart), 0),
        weightKilograms: round(
          valueBefore(samples, "weight", occurredAt, 30 * 24),
          1,
        ),
      },
    ];
  });
}

/** A summary read needs access and, for anyone but the owner, the summary scope. */
function healthSummaryAccessible(
  access: HealthAccess | undefined,
): access is HealthAccess {
  return Boolean(access && (access.owner || access.scopes.includes("summary")));
}

/**
 * The Health service's own viewer rule, for reads that sit inside a club
 * workspace (operator.memberProfile, PRIV-1). Returns the categories the
 * viewer may see in a summary, or undefined: never throws, never reads a
 * value. Same rule as `loadHealthProfile` (adult viewer; an effective grant
 * to this viewer, to them as the person's coach, or to the club for the roles
 * `organizationViewerRolesFor` names), narrowed to one club: a grant to
 * another club, a peer-player grant and a coach relationship at another club
 * do not count here.
 */
export async function healthSummaryVisibleTo(input: {
  readonly subjectPersonId: string;
  readonly viewer: ApiActor;
  readonly organizationId: string;
  readonly now: Date;
}): Promise<
  | {
      readonly categories: readonly HealthCategory[];
      readonly grantedAt: string;
    }
  | undefined
> {
  if (input.viewer.ageBand !== "adult") return undefined;
  if (usesDemoData()) return undefined;
  const access = await resolveHealthAccess({
    ownerPersonId: input.subjectPersonId,
    viewerPersonId: input.viewer.personId,
    now: input.now,
    organizationId: input.organizationId,
  });
  if (!healthSummaryAccessible(access) || access.categories.length === 0) {
    return undefined;
  }
  return {
    categories: access.categories,
    grantedAt: (access.grantedAt ?? input.now).toISOString(),
  };
}

async function buildProfile(input: {
  readonly subjectPersonId: string;
  readonly viewer: ApiActor;
  readonly now: Date;
  readonly audit?: boolean;
  readonly requestId?: string;
  readonly ipAddress?: string;
  readonly ownerState?: HealthSubjectState;
}): Promise<HealthProfile> {
  const viewerIsOwner = input.subjectPersonId === input.viewer.personId;
  let ownerState: HealthSubjectState | undefined;
  if (viewerIsOwner && input.ownerState) {
    ownerState = input.ownerState;
  } else if (viewerIsOwner) {
    ownerState = (
      await requireHealthEligibility({
        actor: input.viewer,
        action: "view-own",
        now: input.now,
      })
    ).state;
  } else if (input.viewer.ageBand !== "adult") {
    // Reading someone else's Health stays adult-only (coaches, club staff).
    throw new HealthServiceError(
      "NOT_ELIGIBLE",
      HEALTH_REFUSAL_MESSAGES["adult-viewer-required"],
      "adult-viewer-required",
    );
  }
  if (usesDemoData()) {
    if (!viewerIsOwner || !ownerState) {
      throw new HealthServiceError(
        "ACCESS_DENIED",
        "This player has not shared Duna Health with you.",
      );
    }
    return buildDemoProfile(ownerState, input.viewer.displayName, input.now);
  }
  requireDatabase();
  const access = await resolveHealthAccess({
    ownerPersonId: input.subjectPersonId,
    viewerPersonId: input.viewer.personId,
    now: input.now,
    ownerState,
  });
  if (!healthSummaryAccessible(access)) {
    throw new HealthServiceError(
      "ACCESS_DENIED",
      "This player has not shared Duna Health with you.",
    );
  }
  const database = getDatabase();
  const [subject, connection, rows, checkIns] = await Promise.all([
    database
      .select({ id: people.id, displayName: people.displayName })
      .from(people)
      .where(eq(people.id, input.subjectPersonId))
      .limit(1),
    database
      .select()
      .from(healthConnections)
      .where(eq(healthConnections.personId, input.subjectPersonId))
      .limit(1),
    loadBoundedProfileSampleRows({
      personId: input.subjectPersonId,
      categories: access.categories,
      now: input.now,
    }),
    loadHealthCheckIns(input.subjectPersonId),
  ]);
  if (!subject[0]) {
    throw new HealthServiceError("HEALTH_NOT_FOUND", "Player not found.");
  }
  const samples = decryptRows(rows, access.categories, access.metrics);
  const matches = await buildMatchContexts(input.subjectPersonId, samples);
  const timezone = connection[0]?.timezone ?? "UTC";
  const profile = assembleProfile({
    subject: subject[0],
    access,
    samples,
    checkIns: healthCheckInContextAllowed(access) ? checkIns : [],
    matches,
    timezone,
    now: input.now,
    // A minor's Readiness and Strain stay visible only to the minor.
    hideDerivedScores:
      !access.owner && isMinorBand(access.ownerBand ?? "unknown"),
  });
  if (!access.owner && input.audit !== false) {
    await recordHealthAudit({
      actorPersonId: input.viewer.personId,
      action: "health.profile_viewed",
      entityType: "health-profile",
      entityId: input.subjectPersonId,
      reason:
        "A permitted Duna recipient viewed a player Health profile after the grant and current relationship were revalidated.",
      requestId: input.requestId,
      ipAddress: input.ipAddress,
      now: input.now,
    });
  }
  return profile;
}

/** The common read model for a profile once samples are authorized. */
function assembleProfile(input: {
  readonly subject: { readonly id: string; readonly displayName: string };
  readonly access: HealthAccess;
  readonly samples: readonly HealthTimelineEntry[];
  readonly checkIns: readonly HealthCheckIn[];
  readonly matches: HealthProfile["matches"];
  readonly timezone: string;
  readonly now: Date;
  readonly hideDerivedScores?: boolean;
}): HealthProfile {
  const { access, samples, matches, timezone } = input;
  const timeline =
    access.owner || access.scopes.includes("timeline")
      ? samples.slice(0, 500)
      : [];
  const heartValues = samples
    .filter((sample) => sample.metric === "heart-rate")
    .flatMap((sample) => (sample.value === undefined ? [] : [sample.value]));
  const sevenDaysAgo = input.now.getTime() - 7 * 24 * 3_600_000;
  const activeEnergy = samples
    .filter(
      (sample) =>
        sample.metric === "active-energy" &&
        sample.value !== undefined &&
        new Date(sample.endedAt).getTime() >= sevenDaysAgo,
    )
    .reduce((sum, sample) => sum + (sample.value ?? 0), 0);
  const intelligence = buildHealthIntelligence({
    samples: input.hideDerivedScores ? [] : samples,
    checkIns: input.hideDerivedScores ? [] : input.checkIns,
    timezone,
    now: input.now,
  });
  const intelligenceForViewer = redactHealthIntelligenceForViewer(
    intelligence,
    access.owner,
  );
  const readiness = intelligence.readiness;
  return {
    subject: input.subject,
    access: {
      owner: access.owner,
      categories: access.categories,
      scopes: access.scopes,
    },
    summary: {
      latestHeartRate: round(heartValues[0], 0),
      restingHeartRate: round(latestValue(samples, "resting-heart-rate"), 0),
      heartRateVariabilityMs: round(
        latestValue(samples, "heart-rate-variability"),
        0,
      ),
      lastSleepHours: intelligence.sleep?.durationHours,
      sevenDayActiveEnergyKcal:
        activeEnergy > 0 ? round(activeEnergy, 0) : undefined,
      weightKilograms: round(latestValue(samples, "weight"), 1),
      recoveryContext:
        readiness.score === undefined
          ? undefined
          : {
              score: Math.round(readiness.score * 10),
              label:
                readiness.confidence === "low"
                  ? ("limited-data" as const)
                  : readiness.score < 4.5
                    ? ("below-baseline" as const)
                    : readiness.score >= 7.8
                      ? ("above-baseline" as const)
                      : ("near-baseline" as const),
              inputs: readiness.factors
                .filter((factor) => factor.score !== undefined)
                .map((factor) => factor.label),
            },
    },
    daily: buildDaily(samples, timezone),
    timeline,
    matches,
    correlations: input.hideDerivedScores
      ? []
      : computeHealthCorrelations(matches),
    intelligence: intelligenceForViewer,
    disclaimer:
      "Duna Readiness and Strain are individualized performance context—not medical advice, diagnosis, injury prediction, or a direction to train. Wearable sleep stages are estimates. Correlations describe this player's available sample and do not establish cause.",
  };
}

function buildDemoProfile(
  state: HealthSubjectState,
  fallbackName: string,
  now: Date,
): HealthProfile {
  const permit = decideForSubject(state, "view-own");
  const metrics = permit.allowed ? permit.allowedMetrics : [];
  const categories = permit.allowed ? permit.allowedCategories : [];
  const samples: HealthTimelineEntry[] = healthDemoSamples(state.personId, now)
    .filter((sample) => metrics.includes(sample.metric))
    .map((sample) => ({
      id: sample.id,
      metric: sample.metric,
      category: metricCategory(sample.metric),
      kind: sample.kind,
      startedAt: sample.startedAt,
      endedAt: sample.endedAt,
      value: sample.value,
      unit: sample.unit,
      categoryValue: sample.categoryValue,
    }))
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  return assembleProfile({
    subject: {
      id: state.personId,
      displayName:
        healthDemoPerson(state.personId, now)?.displayName ?? fallbackName,
    },
    access: {
      owner: true,
      categories: ALL_CATEGORIES.filter((category) =>
        categories.includes(category),
      ),
      scopes: ALL_SCOPES,
      metrics,
    },
    samples,
    checkIns: [],
    matches: [],
    timezone: "UTC",
    now,
  });
}

function buildDemoDashboard(
  state: HealthSubjectState,
  permit: HealthPermit,
  profile: HealthProfile,
  now: Date,
): HealthDashboard {
  const grants = healthDemoGrants(now)
    .filter((grant) => grant.ownerPersonId === state.personId)
    .map((grant) => ({
      id: grant.id,
      audience: {
        id:
          grant.audienceKind === "organization"
            ? `organization:${grant.organizationId}`
            : `${grant.audienceKind}:${grant.audiencePersonId}`,
        kind: grant.audienceKind,
        label: grant.audienceLabel,
        detail:
          grant.audienceKind === "organization"
            ? "Club coaching staff"
            : "Coach",
        personId: grant.audiencePersonId,
        organizationId: grant.organizationId,
      },
      categories: [...grant.categories],
      scopes: [...grant.scopes],
      expiresAt: grant.expiresAt,
      createdAt: grant.createdAt,
      approvalStatus: grant.approvalStatus,
    }));
  const samples = healthDemoSamples(state.personId, now);
  return {
    ...profile,
    connection:
      samples.length > 0
        ? {
            provider: "apple-health",
            status: "active",
            enabledCategories: [...permit.allowedCategories],
            consentVersion: HEALTH_CONSENT_VERSION,
            timezone: "UTC",
            lastSyncedAt: now.toISOString(),
            importedSampleCount: samples.length,
            purgePending: false,
          }
        : undefined,
    grants,
    candidates: grants.map((grant) => grant.audience),
  };
}

export async function loadHealthDashboard(input: {
  readonly actor: ApiActor;
  readonly now: Date;
  readonly requestId?: string;
  readonly ipAddress?: string;
}): Promise<HealthDashboard> {
  const { state, permit } = await requireHealthEligibility({
    actor: input.actor,
    action: "view-own",
    now: input.now,
  });
  const profile = await buildProfile({
    subjectPersonId: input.actor.personId,
    viewer: input.actor,
    now: input.now,
    requestId: input.requestId,
    ipAddress: input.ipAddress,
    ownerState: state,
  });
  if (usesDemoData())
    return buildDemoDashboard(state, permit, profile, input.now);
  const database = getDatabase();
  const [connectionRows, sampleStats, checkInRows] = await Promise.all([
    database
      .select()
      .from(healthConnections)
      .where(eq(healthConnections.personId, input.actor.personId))
      .limit(1),
    database
      .select({
        importedSampleCount: sql<number>`count(*)::int`,
        earliestSampleAt: sql<
          string | null
        >`min(${healthSamples.startedAt})::text`,
        latestSampleAt: sql<
          string | null
        >`max(${healthSamples.startedAt})::text`,
      })
      .from(healthSamples)
      .where(eq(healthSamples.personId, input.actor.personId)),
    database
      .select()
      .from(healthDailyCheckIns)
      .where(eq(healthDailyCheckIns.personId, input.actor.personId))
      .orderBy(desc(healthDailyCheckIns.localDate))
      .limit(1),
  ]);
  const candidates = await loadSharingCandidates(input.actor.personId, {
    now: input.now,
    audiences: permit.allowedAudiences,
    minor: permit.minor,
  });
  const grants = await serializeActiveGrants({
    ownerPersonId: input.actor.personId,
    now: input.now,
    candidates,
  });
  const connection = connectionRows[0];
  return {
    ...profile,
    connection: connection
      ? {
          provider: "apple-health",
          status: connection.status as "active" | "paused" | "revoked",
          enabledCategories: connection.enabledCategories as HealthCategory[],
          consentVersion: connection.consentVersion,
          timezone: connection.timezone,
          earliestAuthorizedAt: connection.earliestAuthorizedAt?.toISOString(),
          lastSyncedAt: connection.lastSyncedAt?.toISOString(),
          importedSampleCount: sampleStats[0]?.importedSampleCount ?? 0,
          earliestSampleAt: sampleStats[0]?.earliestSampleAt
            ? new Date(sampleStats[0].earliestSampleAt).toISOString()
            : undefined,
          latestSampleAt: sampleStats[0]?.latestSampleAt
            ? new Date(sampleStats[0].latestSampleAt).toISOString()
            : undefined,
          purgePending: Boolean(connection.purgeRequestedAt),
        }
      : undefined,
    grants,
    candidates,
    latestCheckIn: checkInRows[0]
      ? serializeHealthCheckIn(checkInRows[0])
      : undefined,
  };
}

export async function loadHealthProfile(input: {
  readonly actor: ApiActor;
  readonly subjectPersonId: string;
  readonly now: Date;
  readonly requestId?: string;
  readonly ipAddress?: string;
}): Promise<HealthProfile> {
  return buildProfile({
    subjectPersonId: input.subjectPersonId,
    viewer: input.actor,
    now: input.now,
    requestId: input.requestId,
    ipAddress: input.ipAddress,
  });
}

export async function loadHealthVideoOverlay(input: {
  readonly ownerPersonId: string;
  readonly actor?: ApiActor;
  readonly startedAt?: Date | null;
  readonly endedAt?: Date | null;
  readonly durationSeconds?: number | null;
  readonly now: Date;
  readonly requestId?: string;
  readonly ipAddress?: string;
}): Promise<HealthVideoOverlay | undefined> {
  if (!input.actor || !input.startedAt) return undefined;
  const access = await resolveHealthAccess({
    ownerPersonId: input.ownerPersonId,
    viewerPersonId: input.actor.personId,
    now: input.now,
  });
  if (!access || !healthAccessAllows(access, "heart", "video-overlay")) {
    return undefined;
  }
  const endedAt =
    input.endedAt ??
    new Date(
      input.startedAt.getTime() +
        Math.max(1, input.durationSeconds ?? 3 * 60 * 60) * 1_000,
    );
  const rows = await getDatabase()
    .select()
    .from(healthSamples)
    .where(
      and(
        eq(healthSamples.personId, input.ownerPersonId),
        eq(healthSamples.metric, "heart-rate"),
        gte(healthSamples.startedAt, input.startedAt),
        lte(healthSamples.startedAt, endedAt),
      ),
    )
    .orderBy(healthSamples.startedAt)
    .limit(10_000);
  const samples = decryptRows(rows, ["heart"], access.metrics);
  const points = samples.flatMap((sample) =>
    sample.value === undefined
      ? []
      : [
          {
            elapsedMs: Math.max(
              0,
              new Date(sample.startedAt).getTime() - input.startedAt!.getTime(),
            ),
            beatsPerMinute: sample.value,
          },
        ],
  );
  if (points.length === 0) return undefined;
  if (!access.owner) {
    await recordHealthAudit({
      actorPersonId: input.actor.personId,
      action: "health.video_overlay_viewed",
      entityType: "health-profile",
      entityId: input.ownerPersonId,
      reason:
        "A permitted recipient viewed timestamp-aligned heart-rate points after video-overlay consent and the current relationship were revalidated.",
      requestId: input.requestId,
      ipAddress: input.ipAddress,
      now: input.now,
    });
  }
  return {
    subjectPersonId: input.ownerPersonId,
    points,
    averageBeatsPerMinute: round(
      average(points.map((point) => point.beatsPerMinute)),
      0,
    ),
  };
}

export async function disconnectHealth(input: {
  readonly actor: ApiActor;
  readonly requestId?: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{
  readonly deletedSamples: number;
  readonly deletedCheckIns: number;
  readonly revokedGrants: number;
}> {
  // Deleting imported data is never gated by age, region or the switch.
  if (usesDemoData()) {
    return { deletedSamples: 0, deletedCheckIns: 0, revokedGrants: 0 };
  }
  requireDatabase();
  const state = await loadHealthSubjectState({
    personId: input.actor.personId,
    now: input.now,
    juniorsEnabled: true,
  });
  const database = getDatabase();
  const [deleted, deletedCheckIns, revoked] = await database.batch([
    database
      .delete(healthSamples)
      .where(eq(healthSamples.personId, input.actor.personId))
      .returning({ id: healthSamples.id }),
    database
      .delete(healthDailyCheckIns)
      .where(eq(healthDailyCheckIns.personId, input.actor.personId))
      .returning({ id: healthDailyCheckIns.id }),
    database
      .update(healthSharingGrants)
      .set({ revokedAt: input.now, updatedAt: input.now })
      .where(
        and(
          eq(healthSharingGrants.ownerPersonId, input.actor.personId),
          isNull(healthSharingGrants.revokedAt),
        ),
      )
      .returning({ id: healthSharingGrants.id }),
    database
      .insert(healthConnections)
      .values({
        personId: input.actor.personId,
        provider: "apple-health",
        status: "revoked",
        consentVersion: HEALTH_CONSENT_VERSION,
        enabledCategories: [],
        timezone: "UTC",
        revokedAt: input.now,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .onConflictDoUpdate({
        target: healthConnections.personId,
        set: {
          status: "revoked",
          enabledCategories: [],
          revokedAt: input.now,
          purgeRequestedAt: null,
          updatedAt: input.now,
        },
      }),
    database.insert(auditLog).values({
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "health.disconnected",
      entityType: "health-connection",
      entityId: input.actor.personId,
      reason:
        "The player disconnected Duna Health, requested deletion of every imported record and private check-in, and revoked every active display grant.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  if (isMinorBand(state.band)) {
    // A minor's disconnect is also a withdrawal of collection consent, so a
    // later reconnect needs a fresh opt-in and guardian approval.
    await recordHealthConsent({
      subjectPersonId: input.actor.personId,
      actorPersonId: input.actor.personId,
      actorRole: "subject",
      kind: "collection",
      decision: "withdrawn",
      subjectAgeBand: state.band,
      disclosureText: HEALTH_DISCONNECT_NOTICE,
      ipAddress: input.ipAddress,
      now: input.now,
    });
  }
  return {
    deletedSamples: deleted.length,
    deletedCheckIns: deletedCheckIns.length,
    revokedGrants: revoked.length,
  };
}

const HEALTH_DISCONNECT_NOTICE =
  "Duna will delete every imported Health record and revoke every Duna sharing grant. Apple Health permissions are managed separately in Settings.";

export async function exportHealthDataForPerson(
  personId: string,
): Promise<Record<string, unknown>> {
  requireDatabase();
  const [connection, sampleRows, checkInRows, grantRows, consentRows] =
    await Promise.all([
      getDatabase()
        .select()
        .from(healthConnections)
        .where(eq(healthConnections.personId, personId))
        .limit(1),
      getDatabase()
        .select()
        .from(healthSamples)
        .where(eq(healthSamples.personId, personId))
        .orderBy(desc(healthSamples.startedAt)),
      getDatabase()
        .select()
        .from(healthDailyCheckIns)
        .where(eq(healthDailyCheckIns.personId, personId))
        .orderBy(desc(healthDailyCheckIns.localDate)),
      getDatabase()
        .select()
        .from(healthSharingGrants)
        .where(eq(healthSharingGrants.ownerPersonId, personId))
        .orderBy(desc(healthSharingGrants.createdAt)),
      getDatabase()
        .select()
        .from(healthConsents)
        .where(eq(healthConsents.subjectPersonId, personId))
        .orderBy(desc(healthConsents.occurredAt)),
    ]);
  return {
    connection: connection[0] ?? null,
    samples: decryptRows(sampleRows, ALL_CATEGORIES),
    dailyCheckIns: checkInRows.map(serializeHealthCheckIn),
    sharingGrants: grantRows.map((grant) => ({
      id: grant.id,
      audienceKind: grant.audienceKind,
      audiencePersonId: grant.audiencePersonId,
      organizationId: grant.organizationId,
      categories: grant.categories,
      scopes: grant.scopes,
      consentVersion: grant.consentVersion,
      consentTextHash: grant.consentTextHash,
      approvalStatus: grant.approvalStatus,
      approvedAt: grant.approvedAt,
      expiresAt: grant.expiresAt,
      revokedAt: grant.revokedAt,
      createdAt: grant.createdAt,
      updatedAt: grant.updatedAt,
    })),
    consents: consentRows.map((consent) => ({
      actorRole: consent.actorRole,
      kind: consent.kind,
      decision: consent.decision,
      grantId: consent.grantId,
      policyVersion: consent.policyVersion,
      disclosureTextHash: consent.disclosureTextHash,
      occurredAt: consent.occurredAt,
    })),
  };
}

export function healthKeysMatch(left: Buffer, right: Buffer): boolean {
  return left.length === right.length && timingSafeEqual(left, right);
}
