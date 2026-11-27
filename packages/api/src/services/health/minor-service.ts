/**
 * H1 service: eligibility, teen opt-in, guardian approval, grant approval and
 * withdrawal for Duna Health. Every write is one batch with its audit entry;
 * audit reasons carry no Health values and no personal data beyond the ids
 * the audit row already holds.
 */
import {
  auditLog,
  getDatabase,
  healthConnections,
  healthConsents,
  healthSharingGrants,
  organizations,
  people,
} from "@duna/db";
import {
  healthDemoGrants,
  healthDemoPerson,
  healthDemoSamples,
} from "@duna/core/demo/health";
import { and, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import type { ApiActor } from "../../context";
import type {
  HealthGuardianOverview,
  HealthPolicyEligibility,
} from "../../contracts/health";
import { usesDemoData } from "../data-source";
import {
  decideForSubject,
  healthDisclosureHash,
  linkedAdultGuardianIds,
  loadGuardedMinorIds,
  loadHealthSubjectState,
  requireHealthPermit,
  type HealthSubjectState,
} from "./consent";
import { HealthServiceError } from "./errors";
import {
  HEALTH_ACTIONS,
  HEALTH_GUARDIAN_APPROVAL_TEXT,
  HEALTH_GUARDIAN_GRANT_APPROVAL_TEXT,
  HEALTH_MINOR_GRANT_MAX_DAYS,
  HEALTH_POLICY_VERSION,
  HEALTH_TEEN_OPT_IN_TEXT,
  decideGuardianApproval,
  isMinorBand,
  normalizeStorefront,
  storefrontAllowsHealth,
  type HealthAction,
  type HealthGrantApprovalStatus,
} from "./policy";

type WriteContext = {
  readonly actor: ApiActor;
  readonly now: Date;
  readonly requestId?: string;
  readonly ipAddress?: string;
  readonly context?: object;
};

function requireCurrentPolicy(policyVersion: string): void {
  if (policyVersion !== HEALTH_POLICY_VERSION) {
    throw new HealthServiceError(
      "POLICY_VERSION_MISMATCH",
      "Duna Health's terms changed since this screen loaded. Review the current wording and try again.",
    );
  }
}

function auditRow(input: {
  readonly ctx: WriteContext;
  readonly action: string;
  readonly entityType: "health-consent" | "health-grant" | "health-connection";
  readonly entityId: string;
  readonly reason: string;
}) {
  return getDatabase().insert(auditLog).values({
    actorPersonId: input.ctx.actor.personId,
    actorType: "person",
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    reason: input.reason,
    traceId: input.ctx.requestId,
    ipAddress: input.ctx.ipAddress,
    createdAt: input.ctx.now,
  });
}

function consentRow(input: {
  readonly ctx: WriteContext;
  readonly subjectPersonId: string;
  readonly actorRole: "subject" | "guardian";
  readonly kind: "collection" | "grant";
  readonly decision: "granted" | "denied" | "withdrawn";
  readonly grantId?: string;
  readonly subjectBand: string;
  readonly disclosureText: string;
}) {
  return getDatabase()
    .insert(healthConsents)
    .values({
      subjectPersonId: input.subjectPersonId,
      actorPersonId: input.ctx.actor.personId,
      actorRole: input.actorRole,
      kind: input.kind,
      decision: input.decision,
      grantId: input.grantId,
      subjectAgeBand: input.subjectBand,
      policyVersion: HEALTH_POLICY_VERSION,
      disclosureTextHash: healthDisclosureHash(input.disclosureText),
      ipAddress: input.ctx.ipAddress,
      occurredAt: input.ctx.now,
    });
}

async function hasConnection(personId: string, now: Date): Promise<boolean> {
  if (usesDemoData()) return healthDemoSamples(personId, now).length > 0;
  const [row] = await getDatabase()
    .select({ personId: healthConnections.personId })
    .from(healthConnections)
    .where(eq(healthConnections.personId, personId))
    .limit(1);
  return Boolean(row);
}

/** Pure projection of the policy for the app; exported for tests. */
export function describeEligibility(
  state: HealthSubjectState,
  storefront: string | null | undefined,
): HealthPolicyEligibility {
  const actions = Object.fromEntries(
    HEALTH_ACTIONS.map((action) => {
      const decision = decideForSubject(state, action, storefront);
      return [
        action,
        decision.allowed
          ? { allowed: true }
          : {
              allowed: false,
              reason: decision.reason,
              message: decision.message,
            },
      ];
    }),
  ) as Record<HealthAction, HealthPolicyEligibility["actions"][HealthAction]>;
  const view = decideForSubject(state, "view-own", storefront);
  const minor = isMinorBand(state.band);
  return {
    policyVersion: HEALTH_POLICY_VERSION,
    band: state.band,
    minor,
    juniorsEnabled: state.juniorsEnabled,
    storefront: {
      reported: normalizeStorefront(storefront),
      allowed: storefrontAllowsHealth(storefront),
    },
    actions,
    allowedMetrics: view.allowed ? [...view.allowedMetrics] : [],
    allowedCategories: view.allowed ? [...view.allowedCategories] : [],
    grantAudiences: view.allowed ? [...view.allowedAudiences] : [],
    maxGrantDays: view.allowed
      ? view.maxGrantDays
      : HEALTH_MINOR_GRANT_MAX_DAYS,
    consent: {
      required: state.band === "teen",
      teenOptedIn: state.consent.teenOptedIn,
      guardianApproved: state.consent.guardianApproved,
      linkedGuardian: linkedAdultGuardianIds(state.guardians).length > 0,
    },
    disclosure:
      state.band === "teen"
        ? {
            policyVersion: HEALTH_POLICY_VERSION,
            text: HEALTH_TEEN_OPT_IN_TEXT,
          }
        : undefined,
  };
}

export async function loadHealthEligibility(input: {
  readonly actor: ApiActor;
  readonly storefront?: string | null;
  readonly now: Date;
  readonly context?: object;
}): Promise<HealthPolicyEligibility & { readonly hasConnection: boolean }> {
  const state = await loadHealthSubjectState({
    personId: input.actor.personId,
    now: input.now,
    organizationId: input.actor.organizationId,
    context: input.context,
  });
  return {
    ...describeEligibility(state, input.storefront),
    hasConnection: await hasConnection(input.actor.personId, input.now),
  };
}

/** The teen's own opt-in, on their own signed-in session. */
export async function recordTeenOptIn(
  input: WriteContext & { readonly policyVersion: string },
): Promise<{
  readonly recorded: boolean;
  readonly teenOptedIn: boolean;
  readonly guardianApproved: boolean;
}> {
  requireCurrentPolicy(input.policyVersion);
  const state = await loadHealthSubjectState({
    personId: input.actor.personId,
    now: input.now,
    organizationId: input.actor.organizationId,
    context: input.context,
  });
  requireHealthPermit(decideForSubject(state, "opt-in"));
  if (state.band !== "teen") {
    // Adults consent through the existing Apple Health connect flow.
    return { recorded: false, teenOptedIn: false, guardianApproved: false };
  }
  if (usesDemoData()) {
    return {
      recorded: true,
      teenOptedIn: true,
      guardianApproved: state.consent.guardianApproved,
    };
  }
  await getDatabase().batch([
    consentRow({
      ctx: input,
      subjectPersonId: input.actor.personId,
      actorRole: "subject",
      kind: "collection",
      decision: "granted",
      subjectBand: state.band,
      disclosureText: HEALTH_TEEN_OPT_IN_TEXT,
    }),
    auditRow({
      ctx: input,
      action: "health.teen_opted_in",
      entityType: "health-consent",
      entityId: input.actor.personId,
      reason: `A player aged 13 to 17 opted in to Duna Health on their own session under ${HEALTH_POLICY_VERSION}; collection waits for a linked adult guardian's approval.`,
    }),
  ]);
  return {
    recorded: true,
    teenOptedIn: true,
    guardianApproved: state.consent.guardianApproved,
  };
}

/**
 * Withdrawal by the teen or a guardian: consent resets at once (sync stops on
 * the next call), every grant is revoked now, and the imported data is
 * scheduled for deletion by the daily retention job.
 */
async function withdrawForSubject(input: {
  readonly ctx: WriteContext;
  readonly subjectPersonId: string;
  readonly subjectBand: string;
  readonly actorRole: "subject" | "guardian";
}): Promise<{
  readonly withdrawn: true;
  readonly revokedGrants: number;
  readonly purgeScheduled: boolean;
}> {
  if (usesDemoData()) {
    return {
      withdrawn: true,
      revokedGrants: healthDemoGrants(input.ctx.now).filter(
        (grant) => grant.ownerPersonId === input.subjectPersonId,
      ).length,
      purgeScheduled:
        healthDemoSamples(input.subjectPersonId, input.ctx.now).length > 0,
    };
  }
  const database = getDatabase();
  const [revoked, purged] = await database.batch([
    database
      .update(healthSharingGrants)
      .set({ revokedAt: input.ctx.now, updatedAt: input.ctx.now })
      .where(
        and(
          eq(healthSharingGrants.ownerPersonId, input.subjectPersonId),
          isNull(healthSharingGrants.revokedAt),
        ),
      )
      .returning({ id: healthSharingGrants.id }),
    database
      .update(healthConnections)
      .set({
        status: "paused",
        purgeRequestedAt: input.ctx.now,
        updatedAt: input.ctx.now,
      })
      .where(eq(healthConnections.personId, input.subjectPersonId))
      .returning({ personId: healthConnections.personId }),
    consentRow({
      ctx: input.ctx,
      subjectPersonId: input.subjectPersonId,
      actorRole: input.actorRole,
      kind: "collection",
      decision: "withdrawn",
      subjectBand: input.subjectBand,
      disclosureText:
        input.actorRole === "guardian"
          ? HEALTH_GUARDIAN_APPROVAL_TEXT
          : HEALTH_TEEN_OPT_IN_TEXT,
    }),
    auditRow({
      ctx: input.ctx,
      action: "health.consent_withdrawn",
      entityType: "health-consent",
      entityId: input.subjectPersonId,
      reason: `${input.actorRole === "guardian" ? "A guardian" : "The player"} withdrew Duna Health consent under ${HEALTH_POLICY_VERSION}; sync stopped, active grants were revoked and imported data was scheduled for deletion.`,
    }),
  ]);
  return {
    withdrawn: true,
    revokedGrants: revoked.length,
    purgeScheduled: purged.length > 0,
  };
}

export async function withdrawOwnHealthConsent(input: WriteContext) {
  const state = await loadHealthSubjectState({
    personId: input.actor.personId,
    now: input.now,
    juniorsEnabled: true,
  });
  return withdrawForSubject({
    ctx: input,
    subjectPersonId: input.actor.personId,
    subjectBand: state.band,
    actorRole: "subject",
  });
}

async function requireGuardianFor(
  input: WriteContext & { readonly minorId: string },
): Promise<HealthSubjectState> {
  const minor = await loadHealthSubjectState({
    personId: input.minorId,
    now: input.now,
    organizationId: input.actor.organizationId,
    context: input.context,
  });
  const link = minor.guardians.find(
    (candidate) => candidate.guardianId === input.actor.personId,
  );
  if (!link) {
    throw new HealthServiceError(
      "ACCESS_DENIED",
      "You are not a linked guardian for this player.",
    );
  }
  return minor;
}

async function requireApprovingGuardian(
  input: WriteContext & { readonly minorId: string },
): Promise<HealthSubjectState> {
  const minor = await requireGuardianFor(input);
  const link = minor.guardians.find(
    (candidate) => candidate.guardianId === input.actor.personId,
  )!;
  const decision = decideGuardianApproval({
    subjectBand: minor.band,
    guardianBand: link.guardianBand,
    guardianshipStatus: link.reviewStatus,
    juniorsEnabled: minor.juniorsEnabled,
  });
  if (!decision.allowed) {
    throw new HealthServiceError(
      decision.reason === "juniors-paused" ||
        decision.reason === "subject-not-eligible"
        ? "NOT_ELIGIBLE"
        : "ACCESS_DENIED",
      {
        "not-a-linked-guardian":
          "Your guardian link to this player must be verified before you can approve Duna Health.",
        "guardian-must-be-adult":
          "Only an adult guardian with a recorded date of birth can approve Duna Health.",
        "subject-not-eligible":
          minor.band === "under-13"
            ? "Duna Health is not available for players under 13 yet."
            : "Duna Health approval applies only to players aged 13 to 17.",
        "juniors-paused":
          "Duna Health for players under 18 is paused right now.",
      }[decision.reason],
      decision.reason === "juniors-paused"
        ? "juniors-paused"
        : decision.reason === "subject-not-eligible" &&
            minor.band === "under-13"
          ? "under-13"
          : undefined,
    );
  }
  return minor;
}

export async function approveMinorHealth(
  input: WriteContext & {
    readonly minorId: string;
    readonly policyVersion: string;
  },
): Promise<{ readonly approved: true; readonly teenOptedIn: boolean }> {
  requireCurrentPolicy(input.policyVersion);
  const minor = await requireApprovingGuardian(input);
  if (usesDemoData()) {
    return { approved: true, teenOptedIn: minor.consent.teenOptedIn };
  }
  await getDatabase().batch([
    consentRow({
      ctx: input,
      subjectPersonId: input.minorId,
      actorRole: "guardian",
      kind: "collection",
      decision: "granted",
      subjectBand: minor.band,
      disclosureText: HEALTH_GUARDIAN_APPROVAL_TEXT,
    }),
    auditRow({
      ctx: input,
      action: "health.guardian_approved",
      entityType: "health-consent",
      entityId: input.minorId,
      reason: `A linked adult guardian approved Duna Health collection for a player aged 13 to 17 under ${HEALTH_POLICY_VERSION}.`,
    }),
  ]);
  return { approved: true, teenOptedIn: minor.consent.teenOptedIn };
}

export async function withdrawMinorHealth(
  input: WriteContext & { readonly minorId: string },
) {
  // Any linked guardian may withdraw, whatever the flag, age or region.
  const minor = await requireGuardianFor(input);
  return withdrawForSubject({
    ctx: input,
    subjectPersonId: input.minorId,
    subjectBand: minor.band,
    actorRole: "guardian",
  });
}

export async function decideMinorHealthGrant(
  input: WriteContext & {
    readonly minorId: string;
    readonly grantId: string;
    readonly decision: "approve" | "deny" | "revoke";
    readonly policyVersion: string;
  },
): Promise<{
  readonly grantId: string;
  readonly approvalStatus: HealthGrantApprovalStatus;
  readonly revoked: boolean;
}> {
  requireCurrentPolicy(input.policyVersion);
  const minor =
    input.decision === "approve"
      ? await requireApprovingGuardian(input)
      : await requireGuardianFor(input);
  if (usesDemoData()) {
    const grant = healthDemoGrants(input.now).find(
      (candidate) =>
        candidate.id === input.grantId &&
        candidate.ownerPersonId === input.minorId,
    );
    if (!grant) {
      throw new HealthServiceError(
        "GRANT_NOT_FOUND",
        "That Health sharing request was not found.",
      );
    }
    return input.decision === "approve"
      ? { grantId: grant.id, approvalStatus: "approved", revoked: false }
      : {
          grantId: grant.id,
          approvalStatus:
            input.decision === "deny" ? "denied" : grant.approvalStatus,
          revoked: true,
        };
  }
  const database = getDatabase();
  const [grant] = await database
    .select()
    .from(healthSharingGrants)
    .where(
      and(
        eq(healthSharingGrants.id, input.grantId),
        eq(healthSharingGrants.ownerPersonId, input.minorId),
        isNull(healthSharingGrants.revokedAt),
        gte(healthSharingGrants.expiresAt, input.now),
      ),
    )
    .limit(1);
  if (!grant) {
    throw new HealthServiceError(
      "GRANT_NOT_FOUND",
      "That active Health sharing request was not found.",
    );
  }
  if (input.decision === "approve" && grant.approvalStatus !== "pending") {
    throw new HealthServiceError(
      "INVALID_GRANT",
      "Only a pending Health sharing request can be approved.",
    );
  }
  if (input.decision === "approve") {
    await database.batch([
      database
        .update(healthSharingGrants)
        .set({
          approvalStatus: "approved",
          approvedByGuardianId: input.actor.personId,
          approvedAt: input.now,
          updatedAt: input.now,
        })
        .where(
          and(
            eq(healthSharingGrants.id, grant.id),
            eq(healthSharingGrants.approvalStatus, "pending"),
            isNull(healthSharingGrants.revokedAt),
          ),
        ),
      consentRow({
        ctx: input,
        subjectPersonId: input.minorId,
        actorRole: "guardian",
        kind: "grant",
        decision: "granted",
        grantId: grant.id,
        subjectBand: minor.band,
        disclosureText: HEALTH_GUARDIAN_GRANT_APPROVAL_TEXT,
      }),
      auditRow({
        ctx: input,
        action: "health.sharing_approved",
        entityType: "health-grant",
        entityId: grant.id,
        reason: `A linked adult guardian approved a ${grant.audienceKind} Health grant until ${grant.expiresAt.toISOString()} under ${HEALTH_POLICY_VERSION}.`,
      }),
    ]);
    return { grantId: grant.id, approvalStatus: "approved", revoked: false };
  }
  const approvalStatus: HealthGrantApprovalStatus =
    input.decision === "deny" && grant.approvalStatus === "pending"
      ? "denied"
      : (grant.approvalStatus as HealthGrantApprovalStatus);
  await database.batch([
    database
      .update(healthSharingGrants)
      .set({ approvalStatus, revokedAt: input.now, updatedAt: input.now })
      .where(eq(healthSharingGrants.id, grant.id)),
    consentRow({
      ctx: input,
      subjectPersonId: input.minorId,
      actorRole: "guardian",
      kind: "grant",
      decision: input.decision === "deny" ? "denied" : "withdrawn",
      grantId: grant.id,
      subjectBand: minor.band,
      disclosureText: HEALTH_GUARDIAN_GRANT_APPROVAL_TEXT,
    }),
    auditRow({
      ctx: input,
      action:
        input.decision === "deny"
          ? "health.sharing_denied"
          : "health.sharing_revoked_by_guardian",
      entityType: "health-grant",
      entityId: grant.id,
      reason: `A linked guardian ${input.decision === "deny" ? "declined" : "revoked"} a ${grant.audienceKind} Health grant under ${HEALTH_POLICY_VERSION}.`,
    }),
  ]);
  return { grantId: grant.id, approvalStatus, revoked: true };
}

/** Status and grants for every minor the guardian is linked to; no values. */
export async function loadGuardianHealthOverview(
  input: WriteContext,
): Promise<HealthGuardianOverview> {
  const minorIds = await loadGuardedMinorIds({
    guardianId: input.actor.personId,
    now: input.now,
  });
  const base = {
    policyVersion: HEALTH_POLICY_VERSION,
    approvalDisclosure: {
      policyVersion: HEALTH_POLICY_VERSION,
      text: HEALTH_GUARDIAN_APPROVAL_TEXT,
    },
    grantDisclosure: {
      policyVersion: HEALTH_POLICY_VERSION,
      text: HEALTH_GUARDIAN_GRANT_APPROVAL_TEXT,
    },
  };
  const states = await Promise.all(
    minorIds.map((personId) =>
      loadHealthSubjectState({
        personId,
        now: input.now,
        organizationId: input.actor.organizationId,
        context: input.context,
      }),
    ),
  );
  const minors = states.filter((state) => isMinorBand(state.band));
  if (usesDemoData()) {
    return {
      ...base,
      minors: minors.map((state) => {
        const samples = healthDemoSamples(state.personId, input.now);
        const eligible = decideForSubject(state, "view-own");
        return {
          personId: state.personId,
          displayName:
            healthDemoPerson(state.personId, input.now)?.displayName ??
            "Junior player",
          band: state.band,
          eligible: eligible.allowed
            ? { allowed: true }
            : {
                allowed: false,
                reason: eligible.reason,
                message: eligible.message,
              },
          consent: {
            teenOptedIn: state.consent.teenOptedIn,
            guardianApproved: state.consent.guardianApproved,
            approvedByYou:
              state.consent.approvingGuardianId === input.actor.personId,
          },
          connection:
            samples.length > 0
              ? {
                  status: "active" as const,
                  enabledCategories: ["heart", "activity"] as const,
                  lastSyncedAt: input.now.toISOString(),
                  purgePending: false,
                }
              : undefined,
          grants: healthDemoGrants(input.now)
            .filter((grant) => grant.ownerPersonId === state.personId)
            .map((grant) => ({
              id: grant.id,
              audienceKind: grant.audienceKind,
              audienceLabel: grant.audienceLabel,
              categories: grant.categories,
              scopes: grant.scopes,
              approvalStatus: grant.approvalStatus,
              createdAt: grant.createdAt,
              expiresAt: grant.expiresAt,
            })),
        };
      }),
    };
  }
  if (minors.length === 0) return { ...base, minors: [] };
  const database = getDatabase();
  const ids = minors.map((state) => state.personId);
  const [personRows, connectionRows, grantRows] = await Promise.all([
    database
      .select({ id: people.id, displayName: people.displayName })
      .from(people)
      .where(inArray(people.id, ids)),
    database
      .select({
        personId: healthConnections.personId,
        status: healthConnections.status,
        enabledCategories: healthConnections.enabledCategories,
        lastSyncedAt: healthConnections.lastSyncedAt,
        purgeRequestedAt: healthConnections.purgeRequestedAt,
      })
      .from(healthConnections)
      .where(inArray(healthConnections.personId, ids)),
    database
      .select({
        id: healthSharingGrants.id,
        ownerPersonId: healthSharingGrants.ownerPersonId,
        audienceKind: healthSharingGrants.audienceKind,
        audiencePersonId: healthSharingGrants.audiencePersonId,
        organizationId: healthSharingGrants.organizationId,
        categories: healthSharingGrants.categories,
        scopes: healthSharingGrants.scopes,
        approvalStatus: healthSharingGrants.approvalStatus,
        createdAt: healthSharingGrants.createdAt,
        expiresAt: healthSharingGrants.expiresAt,
      })
      .from(healthSharingGrants)
      .where(
        and(
          inArray(healthSharingGrants.ownerPersonId, ids),
          isNull(healthSharingGrants.revokedAt),
          gte(healthSharingGrants.expiresAt, input.now),
        ),
      )
      .orderBy(desc(healthSharingGrants.createdAt)),
  ]);
  const audiencePeople = [
    ...new Set(
      grantRows
        .map((row) => row.audiencePersonId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const audienceOrganizations = [
    ...new Set(
      grantRows
        .map((row) => row.organizationId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const [audiencePersonRows, audienceOrganizationRows] = await Promise.all([
    audiencePeople.length === 0
      ? Promise.resolve([])
      : database
          .select({ id: people.id, displayName: people.displayName })
          .from(people)
          .where(inArray(people.id, audiencePeople)),
    audienceOrganizations.length === 0
      ? Promise.resolve([])
      : database
          .select({ id: organizations.id, name: organizations.name })
          .from(organizations)
          .where(inArray(organizations.id, audienceOrganizations)),
  ]);
  const labels = new Map<string, string>([
    ...audiencePersonRows.map((row) => [row.id, row.displayName] as const),
    ...audienceOrganizationRows.map((row) => [row.id, row.name] as const),
  ]);
  return {
    ...base,
    minors: minors.map((state) => {
      const connection = connectionRows.find(
        (row) => row.personId === state.personId,
      );
      const eligible = decideForSubject(state, "view-own");
      return {
        personId: state.personId,
        displayName:
          personRows.find((row) => row.id === state.personId)?.displayName ??
          "Junior player",
        band: state.band,
        eligible: eligible.allowed
          ? { allowed: true }
          : {
              allowed: false,
              reason: eligible.reason,
              message: eligible.message,
            },
        consent: {
          teenOptedIn: state.consent.teenOptedIn,
          guardianApproved: state.consent.guardianApproved,
          approvedByYou:
            state.consent.approvingGuardianId === input.actor.personId,
        },
        connection: connection
          ? {
              status: connection.status as "active" | "paused" | "revoked",
              enabledCategories:
                connection.enabledCategories as HealthGuardianOverview["minors"][number]["grants"][number]["categories"],
              lastSyncedAt: connection.lastSyncedAt?.toISOString(),
              purgePending: Boolean(connection.purgeRequestedAt),
            }
          : undefined,
        grants: grantRows
          .filter((row) => row.ownerPersonId === state.personId)
          .map((row) => ({
            id: row.id,
            audienceKind: row.audienceKind as
              "player" | "coach" | "organization",
            audienceLabel:
              labels.get(row.audiencePersonId ?? row.organizationId ?? "") ??
              "Unavailable recipient",
            categories:
              row.categories as HealthGuardianOverview["minors"][number]["grants"][number]["categories"],
            scopes:
              row.scopes as HealthGuardianOverview["minors"][number]["grants"][number]["scopes"],
            approvalStatus: row.approvalStatus as HealthGrantApprovalStatus,
            createdAt: row.createdAt.toISOString(),
            expiresAt: row.expiresAt.toISOString(),
          })),
      };
    }),
  };
}
