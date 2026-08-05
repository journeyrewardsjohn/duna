import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import {
  auditLog,
  follows,
  getDatabase,
  healthConnections,
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
import type { ApiActor } from "./context";
import type {
  HealthCategory,
  HealthCorrelation,
  HealthDashboard,
  HealthMetric,
  HealthProfile,
  HealthSampleInput,
  HealthSharingCandidate,
  HealthSharingGrant,
  HealthSharingScope,
  HealthTimelineEntry,
  HealthVideoOverlay,
} from "./contracts";

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

const METRIC_CATEGORY: Readonly<Record<HealthMetric, HealthCategory>> = {
  "heart-rate": "heart",
  "resting-heart-rate": "heart",
  "heart-rate-variability": "heart",
  "walking-heart-rate": "heart",
  "vo2-max": "heart",
  "respiratory-rate": "recovery",
  "oxygen-saturation": "recovery",
  "body-temperature": "recovery",
  sleep: "recovery",
  "active-energy": "activity",
  "basal-energy": "activity",
  steps: "activity",
  distance: "activity",
  "exercise-minutes": "activity",
  "stand-minutes": "activity",
  workout: "activity",
  weight: "body",
  "body-fat": "body",
  "lean-body-mass": "body",
};

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

type HealthAccess = {
  readonly owner: boolean;
  readonly categories: readonly HealthCategory[];
  readonly scopes: readonly HealthSharingScope[];
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

export class HealthServiceError extends Error {
  constructor(
    readonly code:
      | "DATABASE_REQUIRED"
      | "ENCRYPTION_REQUIRED"
      | "ADULT_REQUIRED"
      | "HEALTH_NOT_FOUND"
      | "ACCESS_DENIED"
      | "INVALID_GRANT"
      | "GRANT_NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "HealthServiceError";
  }
}

function requireDatabase(): void {
  if (!process.env.DATABASE_URL) {
    throw new HealthServiceError(
      "DATABASE_REQUIRED",
      "Duna Health requires the connected Duna database.",
    );
  }
}

function requireAdult(actor: ApiActor): void {
  if (actor.ageBand !== "adult") {
    throw new HealthServiceError(
      "ADULT_REQUIRED",
      "Duna Health sharing is currently available only to verified adults.",
    );
  }
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

export function encryptHealthPayload(
  payload: HealthPayload,
): EncryptedHealthPayload {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", derivedKey("payload"), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  return {
    encryptedPayload: encrypted.toString("base64"),
    encryptionIv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    keyVersion: 1,
  };
}

export function decryptHealthPayload(
  encrypted: EncryptedHealthPayload,
): HealthPayload {
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
  const cleartext = Buffer.concat([
    decipher.update(Buffer.from(encrypted.encryptedPayload, "base64")),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(cleartext) as HealthPayload;
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
        inArray(organizationMemberships.role, [...STAFF_HEALTH_ROLES]),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

async function resolveHealthAccess(input: {
  readonly ownerPersonId: string;
  readonly viewerPersonId: string;
  readonly now: Date;
}): Promise<HealthAccess | undefined> {
  if (input.ownerPersonId === input.viewerPersonId) {
    return { owner: true, categories: ALL_CATEGORIES, scopes: ALL_SCOPES };
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
    const baseGrant = {
      audienceKind: grant.audienceKind as "player" | "coach" | "organization",
      audiencePersonId: grant.audiencePersonId,
      viewerPersonId: input.viewerPersonId,
      expiresAt: grant.expiresAt,
      revokedAt: grant.revokedAt,
      now: input.now,
    };
    if (
      grant.audienceKind === "player" &&
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
        relationshipActive: await activeCoachRelationshipExists(
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
      healthGrantAllows({
        ...baseGrant,
        relationshipActive: await activeOrganizationViewer(
          input.ownerPersonId,
          input.viewerPersonId,
          grant.organizationId,
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
    ),
    scopes: unique(
      valid.flatMap((grant) => grant.scopes as HealthSharingScope[]),
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
  readonly syncedAt: Date;
  readonly requestId?: string;
  readonly ipAddress?: string;
}): Promise<{
  readonly imported: number;
  readonly deleted: number;
  readonly protocolVersion: 2;
}> {
  requireDatabase();
  requireAdult(input.actor);
  await requireNoPendingAccountDeletion(input.actor.personId);
  masterKey();
  const categories = unique(input.categories);
  if (categories.length === 0) {
    throw new HealthServiceError(
      "INVALID_GRANT",
      "Select at least one Apple Health category to sync.",
    );
  }
  const disallowed = input.samples.find(
    (sample) => !categories.includes(metricCategory(sample.metric)),
  );
  if (disallowed) {
    throw new HealthServiceError(
      "ACCESS_DENIED",
      "A sample was outside the Health categories selected by the player.",
    );
  }
  const database = getDatabase();
  const deletionHashes = input.deletedExternalIds.map((externalId) =>
    externalIdHash(input.actor.personId, externalId),
  );
  const rows = input.samples.map((sample) => ({
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
        earliestAuthorizedAt: sql`LEAST(${healthConnections.earliestAuthorizedAt}, excluded.earliest_authorized_at)`,
        lastSyncedAt: input.syncedAt,
        revokedAt: null,
        updatedAt: input.syncedAt,
      },
    });
  const auditQuery = database.insert(auditLog).values({
    actorPersonId: input.actor.personId,
    actorType: "person",
    action: "health.sync_completed",
    entityType: "health-connection",
    entityId: input.actor.personId,
    reason: `The player synchronized ${rows.length} encrypted Apple Health records and submitted ${deletionHashes.length} deletion tombstones under ${HEALTH_CONSENT_VERSION}.`,
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
  return { imported: rows.length, deleted, protocolVersion: 2 };
}

async function loadSharingCandidates(
  ownerPersonId: string,
): Promise<HealthSharingCandidate[]> {
  const database = getDatabase();
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
            eq(people.ageBand, "adult"),
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
                eq(people.ageBand, "adult"),
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
                eq(people.ageBand, "adult"),
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
    [...followRows, ...teammateRows].map((row) => [row.id, row]),
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
      detail: "Authorized owner, manager, and coach staff",
      organizationId: organization.id,
    })),
  ].sort((a, b) => a.label.localeCompare(b.label));
}

async function serializeActiveGrants(input: {
  readonly ownerPersonId: string;
  readonly now: Date;
  readonly candidates: readonly HealthSharingCandidate[];
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
  readonly requestId?: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{ readonly id: string }> {
  requireDatabase();
  requireAdult(input.actor);
  await requireNoPendingAccountDeletion(input.actor.personId);
  const categories = unique(input.categories);
  const scopes = unique(input.scopes);
  if (categories.length === 0 || scopes.length === 0) {
    throw new HealthServiceError(
      "INVALID_GRANT",
      "Choose both Health categories and how the recipient may use them.",
    );
  }
  if (scopes.includes("video-overlay") && !categories.includes("heart")) {
    throw new HealthServiceError(
      "INVALID_GRANT",
      "Video overlays require explicit access to the Heart category.",
    );
  }
  const maximum = new Date(input.now.getTime() + 366 * 24 * 60 * 60 * 1_000);
  if (input.expiresAt <= input.now || input.expiresAt > maximum) {
    throw new HealthServiceError(
      "INVALID_GRANT",
      "Health sharing must expire within one year.",
    );
  }
  const candidates = await loadSharingCandidates(input.actor.personId);
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
      expiresAt: input.expiresAt,
      createdAt: input.now,
      updatedAt: input.now,
    }),
    database.insert(auditLog).values({
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "health.sharing_granted",
      entityType: "health-grant",
      entityId: id,
      reason: `The player explicitly granted ${candidate.kind} access until ${input.expiresAt.toISOString()} under ${HEALTH_CONSENT_VERSION}.`,
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  return { id };
}

export async function revokeHealthSharingGrant(input: {
  readonly actor: ApiActor;
  readonly grantId: string;
  readonly requestId?: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{ readonly revoked: true }> {
  requireDatabase();
  requireAdult(input.actor);
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

function sampleDurationHours(sample: HealthTimelineEntry): number {
  return (
    (new Date(sample.endedAt).getTime() -
      new Date(sample.startedAt).getTime()) /
    3_600_000
  );
}

function isAsleepSample(sample: HealthTimelineEntry): boolean {
  return (
    sample.metric === "sleep" &&
    Boolean(sample.categoryValue?.startsWith("asleep"))
  );
}

function latestValue(
  samples: readonly HealthTimelineEntry[],
  metric: HealthMetric,
): number | undefined {
  return samples.find((sample) => sample.metric === metric)?.value;
}

function recoveryContext(samples: readonly HealthTimelineEntry[]) {
  const sleep = samples.find(isAsleepSample);
  const resting = latestValue(samples, "resting-heart-rate");
  const hrv = latestValue(samples, "heart-rate-variability");
  const inputs: string[] = [];
  let score = 50;
  if (sleep) {
    const hours = sampleDurationHours(sleep);
    inputs.push("recent sleep duration");
    score += hours >= 8 ? 20 : hours >= 7 ? 10 : hours < 6 ? -20 : -5;
  }
  const restingValues = samples
    .filter((sample) => sample.metric === "resting-heart-rate")
    .slice(0, 7)
    .flatMap((sample) => (sample.value === undefined ? [] : [sample.value]));
  const restingBaseline = average(restingValues);
  if (resting !== undefined && restingBaseline !== undefined) {
    inputs.push("resting heart rate versus recent baseline");
    score +=
      resting <= restingBaseline
        ? 10
        : resting > restingBaseline * 1.05
          ? -10
          : 0;
  }
  const hrvValues = samples
    .filter((sample) => sample.metric === "heart-rate-variability")
    .slice(0, 7)
    .flatMap((sample) => (sample.value === undefined ? [] : [sample.value]));
  const hrvBaseline = average(hrvValues);
  if (hrv !== undefined && hrvBaseline !== undefined) {
    inputs.push("heart-rate variability versus recent baseline");
    score += hrv >= hrvBaseline ? 10 : -10;
  }
  if (inputs.length === 0) return undefined;
  const bounded = Math.max(0, Math.min(100, Math.round(score)));
  return {
    score: bounded,
    label:
      inputs.length < 2
        ? ("limited-data" as const)
        : bounded < 40
          ? ("below-baseline" as const)
          : bounded > 65
            ? ("above-baseline" as const)
            : ("near-baseline" as const),
    inputs,
  };
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
): HealthTimelineEntry[] {
  return rows.flatMap((row) => {
    const metric = row.metric as HealthMetric;
    const category = metricCategory(metric);
    if (!categories.includes(category)) return [];
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
      const sleep = day
        .filter(isAsleepSample)
        .reduce((sum, sample) => sum + sampleDurationHours(sample), 0);
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
    const sleepHours = samples
      .filter(
        (sample) =>
          isAsleepSample(sample) &&
          new Date(sample.endedAt) <= occurredAt &&
          new Date(sample.endedAt).getTime() >=
            occurredAt.getTime() - 36 * 3_600_000,
      )
      .reduce((sum, sample) => sum + sampleDurationHours(sample), 0);
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

async function buildProfile(input: {
  readonly subjectPersonId: string;
  readonly viewer: ApiActor;
  readonly now: Date;
  readonly audit?: boolean;
  readonly requestId?: string;
  readonly ipAddress?: string;
}): Promise<HealthProfile> {
  requireDatabase();
  requireAdult(input.viewer);
  const access = await resolveHealthAccess({
    ownerPersonId: input.subjectPersonId,
    viewerPersonId: input.viewer.personId,
    now: input.now,
  });
  if (!access || (!access.owner && !access.scopes.includes("summary"))) {
    throw new HealthServiceError(
      "ACCESS_DENIED",
      "This player has not shared Duna Health with you.",
    );
  }
  const database = getDatabase();
  const [subject, connection, rows] = await Promise.all([
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
    database
      .select()
      .from(healthSamples)
      .where(eq(healthSamples.personId, input.subjectPersonId))
      .orderBy(desc(healthSamples.startedAt))
      .limit(10_000),
  ]);
  if (!subject[0]) {
    throw new HealthServiceError("HEALTH_NOT_FOUND", "Player not found.");
  }
  const samples = decryptRows(rows, access.categories);
  const timeline =
    access.owner || access.scopes.includes("timeline")
      ? samples.slice(0, 500)
      : [];
  const matches = await buildMatchContexts(input.subjectPersonId, samples);
  const heartValues = samples
    .filter((sample) => sample.metric === "heart-rate")
    .flatMap((sample) => (sample.value === undefined ? [] : [sample.value]));
  const sleep = samples.find(isAsleepSample);
  const sevenDaysAgo = input.now.getTime() - 7 * 24 * 3_600_000;
  const activeEnergy = samples
    .filter(
      (sample) =>
        sample.metric === "active-energy" &&
        sample.value !== undefined &&
        new Date(sample.endedAt).getTime() >= sevenDaysAgo,
    )
    .reduce((sum, sample) => sum + (sample.value ?? 0), 0);
  const timezone = connection[0]?.timezone ?? "UTC";
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
  return {
    subject: subject[0],
    access,
    summary: {
      latestHeartRate: round(heartValues[0], 0),
      restingHeartRate: round(latestValue(samples, "resting-heart-rate"), 0),
      heartRateVariabilityMs: round(
        latestValue(samples, "heart-rate-variability"),
        0,
      ),
      lastSleepHours: sleep ? round(sampleDurationHours(sleep), 1) : undefined,
      sevenDayActiveEnergyKcal:
        activeEnergy > 0 ? round(activeEnergy, 0) : undefined,
      weightKilograms: round(latestValue(samples, "weight"), 1),
      recoveryContext: recoveryContext(samples),
    },
    daily: buildDaily(samples, timezone),
    timeline,
    matches,
    correlations: computeHealthCorrelations(matches),
    disclaimer:
      "Duna shows descriptive performance context, not medical advice or a diagnosis. Correlations describe this player's available sample and do not establish cause.",
  };
}

export async function loadHealthDashboard(input: {
  readonly actor: ApiActor;
  readonly now: Date;
  readonly requestId?: string;
  readonly ipAddress?: string;
}): Promise<HealthDashboard> {
  const profile = await buildProfile({
    subjectPersonId: input.actor.personId,
    viewer: input.actor,
    now: input.now,
    requestId: input.requestId,
    ipAddress: input.ipAddress,
  });
  const database = getDatabase();
  const [connectionRows, sampleStats] = await Promise.all([
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
  ]);
  const candidates = await loadSharingCandidates(input.actor.personId);
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
        }
      : undefined,
    grants,
    candidates,
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
  const samples = decryptRows(rows, ["heart"]);
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
  readonly revokedGrants: number;
}> {
  requireDatabase();
  requireAdult(input.actor);
  const database = getDatabase();
  const [deleted, revoked] = await database.batch([
    database
      .delete(healthSamples)
      .where(eq(healthSamples.personId, input.actor.personId))
      .returning({ id: healthSamples.id }),
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
        "The player disconnected Duna Health, requested deletion of every imported record, and revoked every active display grant.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  return {
    deletedSamples: deleted.length,
    revokedGrants: revoked.length,
  };
}

export async function exportHealthDataForPerson(
  personId: string,
): Promise<Record<string, unknown>> {
  requireDatabase();
  const [connection, sampleRows, grantRows] = await Promise.all([
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
      .from(healthSharingGrants)
      .where(eq(healthSharingGrants.ownerPersonId, personId))
      .orderBy(desc(healthSharingGrants.createdAt)),
  ]);
  return {
    connection: connection[0] ?? null,
    samples: decryptRows(sampleRows, ALL_CATEGORIES),
    sharingGrants: grantRows.map((grant) => ({
      id: grant.id,
      audienceKind: grant.audienceKind,
      audiencePersonId: grant.audiencePersonId,
      organizationId: grant.organizationId,
      categories: grant.categories,
      scopes: grant.scopes,
      consentVersion: grant.consentVersion,
      consentTextHash: grant.consentTextHash,
      expiresAt: grant.expiresAt,
      revokedAt: grant.revokedAt,
      createdAt: grant.createdAt,
      updatedAt: grant.updatedAt,
    })),
  };
}

export function healthKeysMatch(left: Buffer, right: Buffer): boolean {
  return left.length === right.length && timingSafeEqual(left, right);
}
