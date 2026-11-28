import { createHash } from "node:crypto";
import { getDatabase, guardianships, healthConsents, people } from "@duna/db";
import { healthDemoPeople, healthDemoPerson } from "@duna/core/demo/health";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { ApiActor } from "../../context";
import { isFeatureEnabled } from "../../feature-flag-evaluator";
import { usesDemoData } from "../data-source";
import { HealthServiceError } from "./errors";
import {
  HEALTH_GUARDIAN_LINK_STATUSES,
  HEALTH_JUNIORS_FLAG,
  HEALTH_POLICY_VERSION,
  decideHealthAction,
  healthAgeBand,
  type HealthAction,
  type HealthAgeBand,
  type HealthDecision,
  type HealthPermit,
} from "./policy";

export function healthDisclosureHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export interface HealthConsentRecord {
  readonly actorRole: "subject" | "guardian" | "system";
  readonly actorPersonId: string | null;
  readonly kind: "collection" | "grant";
  readonly decision: "granted" | "denied" | "withdrawn";
  readonly policyVersion: string;
  readonly occurredAt: Date;
}

export interface MinorCollectionConsent {
  readonly teenOptedIn: boolean;
  readonly teenOptedInAt?: Date;
  readonly guardianApproved: boolean;
  readonly guardianApprovedAt?: Date;
  readonly approvingGuardianId?: string;
  readonly withdrawnAt?: Date;
  readonly withdrawnBy?: "subject" | "guardian" | "system";
}

/**
 * Pure: collection consent for a minor from the append-only record. Only acts
 * after the most recent withdrawal or denial count, only under the current
 * policy version, and a guardian's approval counts only while that person is
 * still a linked adult guardian.
 */
export function deriveMinorCollectionConsent(
  records: readonly HealthConsentRecord[],
  input: {
    readonly linkedAdultGuardianIds: readonly string[];
    readonly policyVersion?: string;
  },
): MinorCollectionConsent {
  const version = input.policyVersion ?? HEALTH_POLICY_VERSION;
  const collection = records
    .filter((record) => record.kind === "collection")
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  const resets = collection.filter((record) => record.decision !== "granted");
  const lastReset = resets.at(-1);
  const after = collection.filter(
    (record) =>
      record.decision === "granted" &&
      record.policyVersion === version &&
      (!lastReset || record.occurredAt > lastReset.occurredAt),
  );
  const teen = after.filter((record) => record.actorRole === "subject").at(-1);
  const guardian = after
    .filter(
      (record) =>
        record.actorRole === "guardian" &&
        record.actorPersonId !== null &&
        input.linkedAdultGuardianIds.includes(record.actorPersonId),
    )
    .at(-1);
  return {
    teenOptedIn: Boolean(teen),
    teenOptedInAt: teen?.occurredAt,
    guardianApproved: Boolean(guardian),
    guardianApprovedAt: guardian?.occurredAt,
    approvingGuardianId: guardian?.actorPersonId ?? undefined,
    withdrawnAt: lastReset?.occurredAt,
    withdrawnBy: lastReset?.actorRole,
  };
}

export interface HealthGuardianLink {
  readonly guardianId: string;
  readonly reviewStatus: string;
  readonly guardianBand: HealthAgeBand;
}

/** Everything the policy needs about one Health subject, read at request time. */
export interface HealthSubjectState {
  readonly personId: string;
  readonly birthDate?: string;
  readonly band: HealthAgeBand;
  readonly juniorsEnabled: boolean;
  readonly guardians: readonly HealthGuardianLink[];
  readonly consent: MinorCollectionConsent;
}

export function linkedAdultGuardianIds(
  guardians: readonly HealthGuardianLink[],
): string[] {
  return guardians
    .filter(
      (link) =>
        HEALTH_GUARDIAN_LINK_STATUSES.includes(link.reviewStatus) &&
        link.guardianBand === "adult",
    )
    .map((link) => link.guardianId);
}

const emptyConsent: MinorCollectionConsent = {
  teenOptedIn: false,
  guardianApproved: false,
};

export async function healthJuniorsEnabled(input: {
  readonly organizationId?: string;
  readonly context?: object;
}): Promise<boolean> {
  return isFeatureEnabled(HEALTH_JUNIORS_FLAG, {
    organizationId: input.organizationId,
    context: input.context,
  });
}

function demoSubjectState(
  personId: string,
  now: Date,
  juniorsEnabled: boolean,
): HealthSubjectState {
  const person = healthDemoPerson(personId, now);
  const everyone = healthDemoPeople(now);
  const guardians = (person?.guardians ?? []).map((link) => ({
    guardianId: link.guardianId,
    reviewStatus: link.reviewStatus,
    guardianBand: healthAgeBand(
      everyone.find((candidate) => candidate.personId === link.guardianId)
        ?.birthDate,
      now,
    ),
  }));
  return {
    personId,
    birthDate: person?.birthDate,
    band: healthAgeBand(person?.birthDate, now),
    juniorsEnabled,
    guardians,
    consent: person
      ? {
          teenOptedIn: person.teenOptedIn,
          guardianApproved: person.guardianApproved,
          approvingGuardianId: person.guardianApproved
            ? linkedAdultGuardianIds(guardians)[0]
            : undefined,
        }
      : emptyConsent,
  };
}

/**
 * Reads the subject's birth date, guardians (with each guardian's own band
 * today) and consent record from the primary, plus the kill switch.
 */
export async function loadHealthSubjectState(input: {
  readonly personId: string;
  readonly now: Date;
  readonly organizationId?: string;
  readonly context?: object;
  /** Test seam: skip the flag lookup. */
  readonly juniorsEnabled?: boolean;
}): Promise<HealthSubjectState> {
  const juniorsEnabled =
    input.juniorsEnabled ??
    (await healthJuniorsEnabled({
      organizationId: input.organizationId,
      context: input.context,
    }));
  if (usesDemoData()) {
    return demoSubjectState(input.personId, input.now, juniorsEnabled);
  }
  const database = getDatabase();
  const [person] = await database
    .select({ birthDate: people.birthDate })
    .from(people)
    .where(eq(people.id, input.personId))
    .limit(1);
  const band = healthAgeBand(person?.birthDate, input.now);
  if (band !== "teen" && band !== "under-13") {
    return {
      personId: input.personId,
      birthDate: person?.birthDate ?? undefined,
      band,
      juniorsEnabled,
      guardians: [],
      consent: emptyConsent,
    };
  }
  const [links, records] = await Promise.all([
    database
      .select({
        guardianId: guardianships.guardianId,
        reviewStatus: guardianships.reviewStatus,
        guardianBirthDate: people.birthDate,
      })
      .from(guardianships)
      .innerJoin(people, eq(people.id, guardianships.guardianId))
      .where(eq(guardianships.minorId, input.personId)),
    database
      .select()
      .from(healthConsents)
      .where(
        and(
          eq(healthConsents.subjectPersonId, input.personId),
          eq(healthConsents.kind, "collection"),
        ),
      )
      .orderBy(desc(healthConsents.occurredAt))
      .limit(200),
  ]);
  const guardians = links.map((link) => ({
    guardianId: link.guardianId,
    reviewStatus: link.reviewStatus,
    guardianBand: healthAgeBand(link.guardianBirthDate, input.now),
  }));
  return {
    personId: input.personId,
    birthDate: person?.birthDate ?? undefined,
    band,
    juniorsEnabled,
    guardians,
    consent: deriveMinorCollectionConsent(
      records.map((record) => ({
        actorRole: record.actorRole as HealthConsentRecord["actorRole"],
        actorPersonId: record.actorPersonId,
        kind: record.kind as HealthConsentRecord["kind"],
        decision: record.decision as HealthConsentRecord["decision"],
        policyVersion: record.policyVersion,
        occurredAt: record.occurredAt,
      })),
      { linkedAdultGuardianIds: linkedAdultGuardianIds(guardians) },
    ),
  };
}

export function decideForSubject(
  state: HealthSubjectState,
  action: HealthAction,
  storefront?: string | null,
): HealthDecision {
  return decideHealthAction({
    action,
    band: state.band,
    juniorsEnabled: state.juniorsEnabled,
    storefront,
    teenOptedIn: state.consent.teenOptedIn,
    guardianApproved: state.consent.guardianApproved,
  });
}

/** Throws a typed NOT_ELIGIBLE error, or returns the permit. */
export function requireHealthPermit(decision: HealthDecision): HealthPermit {
  if (!decision.allowed) {
    throw new HealthServiceError(
      "NOT_ELIGIBLE",
      decision.message,
      decision.reason,
    );
  }
  return decision;
}

/**
 * Loads the actor's own state and enforces one action. The single entry point
 * every Health procedure uses in place of the retired adult-only gate.
 */
export async function requireHealthEligibility(input: {
  readonly actor: ApiActor;
  readonly action: HealthAction;
  readonly now: Date;
  readonly storefront?: string | null;
  readonly context?: object;
}): Promise<{
  readonly state: HealthSubjectState;
  readonly permit: HealthPermit;
}> {
  const state = await loadHealthSubjectState({
    personId: input.actor.personId,
    now: input.now,
    organizationId: input.actor.organizationId,
    context: input.context,
  });
  const decision = decideForSubject(state, input.action, input.storefront);
  return { state, permit: requireHealthPermit(decision) };
}

export async function recordHealthConsent(input: {
  readonly subjectPersonId: string;
  readonly actorPersonId: string | null;
  readonly actorRole: "subject" | "guardian" | "system";
  readonly kind: "collection" | "grant";
  readonly decision: "granted" | "denied" | "withdrawn";
  readonly grantId?: string;
  readonly subjectAgeBand: HealthAgeBand;
  readonly disclosureText: string;
  readonly ipAddress?: string;
  readonly now: Date;
}) {
  return getDatabase()
    .insert(healthConsents)
    .values({
      subjectPersonId: input.subjectPersonId,
      actorPersonId: input.actorPersonId,
      actorRole: input.actorRole,
      kind: input.kind,
      decision: input.decision,
      grantId: input.grantId,
      subjectAgeBand: input.subjectAgeBand,
      policyVersion: HEALTH_POLICY_VERSION,
      disclosureTextHash: healthDisclosureHash(input.disclosureText),
      ipAddress: input.ipAddress,
      occurredAt: input.now,
    });
}

/** Minors for whom the actor is a guardian in an accepted review state. */
export async function loadGuardedMinorIds(input: {
  readonly guardianId: string;
  readonly now: Date;
}): Promise<string[]> {
  if (usesDemoData()) {
    return healthDemoPeople(input.now)
      .filter((person) =>
        person.guardians.some(
          (link) =>
            link.guardianId === input.guardianId &&
            HEALTH_GUARDIAN_LINK_STATUSES.includes(link.reviewStatus),
        ),
      )
      .map((person) => person.personId);
  }
  const rows = await getDatabase()
    .select({ minorId: guardianships.minorId })
    .from(guardianships)
    .where(
      and(
        eq(guardianships.guardianId, input.guardianId),
        inArray(guardianships.reviewStatus, [...HEALTH_GUARDIAN_LINK_STATUSES]),
      ),
    );
  return rows.map((row) => row.minorId);
}
