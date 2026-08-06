import {
  auditLog,
  getDatabase,
  guardianConsents,
  guardianships,
  identityVerificationSessions,
  people,
  playerPublicProfiles,
} from "@duna/db";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { stableHash } from "./canonical";
import type { ApiActor, ApiAgeBand } from "./context";

export const GUARDIAN_CONSENT_DISCLOSURE_VERSION = "guardian-v2";
export const GUARDIAN_CONSENT_DISCLOSURE =
  "I certify that I am this child's parent or legal guardian and authorize Duna to create and operate this dependent profile for sports participation. I agree, on this dependent's behalf, to the same waivers, releases, policies, and terms that I previously accepted or later accept through Duna for activities in which this dependent participates. I understand that emergency-contact permission allows an organization to contact me about an urgent health or safety issue, while spending permission allows me to approve purchases for this dependent using an authorized guardian payment method or wallet. The relationship remains pending until Duna completes identity and relationship review. Duna will retain an immutable electronic record of this consent, including its exact text and version, date and time, actor identity, IP address, and device information.";

type ProfileVisibility = "public" | "members" | "private";
type MeasurementSystem = "imperial" | "metric";

export class IdentityError extends Error {
  constructor(
    readonly code:
      | "DATABASE_REQUIRED"
      | "PERSON_NOT_FOUND"
      | "HANDLE_UNAVAILABLE"
      | "PHONE_UNAVAILABLE"
      | "INVALID_BIRTH_DATE"
      | "BIRTH_DATE_LOCKED"
      | "ADULT_REQUIRED"
      | "DEPENDENT_MUST_BE_MINOR"
      | "PUBLIC_MINOR_PROFILE_BLOCKED"
      | "VERIFIED_PRO_REQUIRED"
      | "GUARDIANSHIP_NOT_FOUND"
      | "GUARDIANSHIP_ALREADY_REVIEWED"
      | "GUARDIAN_CONSENT_REQUIRED"
      | "INVALID_GUARDIANSHIP",
    message: string,
  ) {
    super(message);
    this.name = "IdentityError";
  }
}

export type PlayerAccentId =
  | "dune-gold"
  | "marine"
  | "deep-coral"
  | "moss"
  | "terracotta"
  | "slate-blue"
  | "ochre"
  | "plum"
  | "sea-green"
  | "ink";

export async function updateOwnProfileAccent(input: {
  readonly actor: ApiActor;
  readonly accentId: PlayerAccentId;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{ readonly personId: string; readonly accentId: PlayerAccentId }> {
  requireDatabase();
  const database = getDatabase();
  const [person, verification, profile] = await Promise.all([
    database.query.people.findFirst({
      where: eq(people.id, input.actor.personId),
    }),
    database.query.identityVerificationSessions.findFirst({
      where: and(
        eq(identityVerificationSessions.personId, input.actor.personId),
        eq(identityVerificationSessions.status, "verified"),
      ),
    }),
    database.query.playerPublicProfiles.findFirst({
      where: eq(playerPublicProfiles.personId, input.actor.personId),
    }),
  ]);
  if (!person) {
    throw new IdentityError(
      "PERSON_NOT_FOUND",
      "Player profile was not found.",
    );
  }
  if (!person.isProfessional || !verification) {
    throw new IdentityError(
      "VERIFIED_PRO_REQUIRED",
      "A verified professional identity is required to select a profile accent.",
    );
  }
  await database.batch([
    database
      .insert(playerPublicProfiles)
      .values({
        personId: person.id,
        accentId: input.accentId,
        updatedAt: input.now,
      })
      .onConflictDoUpdate({
        target: playerPublicProfiles.personId,
        set: { accentId: input.accentId, updatedAt: input.now },
      }),
    database.insert(auditLog).values({
      actorPersonId: person.id,
      actorType: "person",
      action: "player.public_identity_accent_updated",
      entityType: "player-public-profile",
      entityId: person.id,
      beforeHash: stableHash({ accentId: profile?.accentId ?? "dune-gold" }),
      afterHash: stableHash({ accentId: input.accentId }),
      reason:
        "Verified professional selected a curated public identity accent.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  return { personId: person.id, accentId: input.accentId };
}

function requireDatabase(): void {
  if (!process.env.DATABASE_URL) {
    throw new IdentityError(
      "DATABASE_REQUIRED",
      "Identity changes require the connected Duna database.",
    );
  }
}

function ageOnDate(birthDate: string, now: Date): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    throw new IdentityError(
      "INVALID_BIRTH_DATE",
      "Birth date must use YYYY-MM-DD.",
    );
  }
  const date = new Date(`${birthDate}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== birthDate
  ) {
    throw new IdentityError("INVALID_BIRTH_DATE", "Enter a valid birth date.");
  }
  let age = now.getUTCFullYear() - date.getUTCFullYear();
  const birthdayOccurred =
    now.getUTCMonth() > date.getUTCMonth() ||
    (now.getUTCMonth() === date.getUTCMonth() &&
      now.getUTCDate() >= date.getUTCDate());
  if (!birthdayOccurred) age -= 1;
  if (age < 0 || age > 120) {
    throw new IdentityError("INVALID_BIRTH_DATE", "Enter a valid birth date.");
  }
  return age;
}

function ageBandForAge(age: number): Exclude<ApiAgeBand, "unknown"> {
  if (age < 13) return "under-13";
  if (age < 18) return "teen";
  return "adult";
}

function dependentHandle(displayName: string): string {
  const base =
    displayName
      .normalize("NFKD")
      .replaceAll(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, "-")
      .replaceAll(/(^-|-$)/g, "")
      .slice(0, 32) || "player";
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

export async function checkOwnHandleAvailability(input: {
  readonly actor: ApiActor;
  readonly handle: string;
}): Promise<{
  readonly handle: string;
  readonly available: boolean;
  readonly isCurrent: boolean;
  readonly message: string;
}> {
  requireDatabase();
  const normalizedHandle = input.handle.trim().toLowerCase();
  const database = getDatabase();
  const handleOwner = await database.query.people.findFirst({
    where: eq(people.handle, normalizedHandle),
    columns: { id: true },
  });
  const isCurrent = handleOwner?.id === input.actor.personId;
  const available = !handleOwner || isCurrent;
  return {
    handle: normalizedHandle,
    available,
    isCurrent,
    message: isCurrent
      ? "This is your current Duna handle."
      : available
        ? `@${normalizedHandle} is available.`
        : `@${normalizedHandle} is already taken.`,
  };
}

export async function updateOwnProfile(input: {
  readonly actor: ApiActor;
  readonly displayName: string;
  readonly handle: string;
  readonly email?: string | null;
  readonly phoneE164?: string | null;
  readonly homeMarket?: string | null;
  readonly visibility: ProfileVisibility;
  readonly locale: string;
  readonly measurementSystem: MeasurementSystem;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{
  readonly personId: string;
  readonly displayName: string;
  readonly handle: string;
  readonly visibility: ProfileVisibility;
}> {
  requireDatabase();
  const database = getDatabase();
  const person = await database.query.people.findFirst({
    where: eq(people.id, input.actor.personId),
  });
  if (!person) {
    throw new IdentityError(
      "PERSON_NOT_FOUND",
      "Player profile was not found.",
    );
  }
  if (person.isMinor && input.visibility === "public") {
    throw new IdentityError(
      "PUBLIC_MINOR_PROFILE_BLOCKED",
      "Minor profiles cannot be public.",
    );
  }
  const normalizedHandle = input.handle.toLowerCase();
  const handleOwner = await database.query.people.findFirst({
    where: and(
      eq(people.handle, normalizedHandle),
      ne(people.id, input.actor.personId),
    ),
  });
  if (handleOwner) {
    throw new IdentityError(
      "HANDLE_UNAVAILABLE",
      "That Duna handle is already in use.",
    );
  }
  if (input.phoneE164) {
    const phoneOwner = await database.query.people.findFirst({
      where: and(
        eq(people.phoneE164, input.phoneE164),
        ne(people.id, input.actor.personId),
      ),
    });
    if (phoneOwner) {
      throw new IdentityError(
        "PHONE_UNAVAILABLE",
        "That phone number is already connected to another Duna account.",
      );
    }
  }
  const visibility: ProfileVisibility = person.isMinor
    ? "private"
    : input.visibility;
  const before = {
    displayName: person.displayName,
    handle: person.handle,
    email: person.email,
    phoneE164: person.phoneE164,
    homeMarket: person.homeMarket,
    visibility: person.profileVisibility,
    locale: person.locale,
    measurementSystem: person.measurementSystem,
  };
  const after = {
    displayName: input.displayName,
    handle: normalizedHandle,
    email: input.email ?? null,
    phoneE164: input.phoneE164 ?? null,
    homeMarket: input.homeMarket ?? null,
    visibility,
    locale: input.locale,
    measurementSystem: input.measurementSystem,
  };
  await database.batch([
    database
      .update(people)
      .set({
        displayName: after.displayName,
        handle: after.handle,
        email: after.email,
        phoneE164: after.phoneE164,
        homeMarket: after.homeMarket,
        profileVisibility: after.visibility,
        locale: after.locale,
        measurementSystem: after.measurementSystem,
        updatedAt: input.now,
      })
      .where(eq(people.id, input.actor.personId)),
    database.insert(auditLog).values({
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "profile.updated",
      entityType: "person",
      entityId: input.actor.personId,
      beforeHash: stableHash(before),
      afterHash: stableHash(after),
      reason: "Account holder updated profile and display preferences.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  return {
    personId: input.actor.personId,
    displayName: after.displayName,
    handle: after.handle,
    visibility,
  };
}

export async function recordOwnBirthDate(input: {
  readonly actor: ApiActor;
  readonly birthDate: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{
  readonly personId: string;
  readonly ageBand: ApiAgeBand;
  readonly isMinor: boolean;
  readonly requiresGuardian: boolean;
}> {
  requireDatabase();
  const database = getDatabase();
  const person = await database.query.people.findFirst({
    where: eq(people.id, input.actor.personId),
  });
  if (!person) {
    throw new IdentityError(
      "PERSON_NOT_FOUND",
      "Player profile was not found.",
    );
  }
  if (person.birthDate && person.birthDate !== input.birthDate) {
    throw new IdentityError(
      "BIRTH_DATE_LOCKED",
      "Birth date is locked after it is recorded. Contact support to correct it.",
    );
  }
  const age = ageOnDate(input.birthDate, input.now);
  const ageBand = ageBandForAge(age);
  const isMinor = ageBand !== "adult";
  await database.batch([
    database
      .update(people)
      .set({
        birthDate: input.birthDate,
        ageBand,
        isMinor,
        ageVerifiedAt: input.now,
        profileVisibility: isMinor ? "private" : person.profileVisibility,
        updatedAt: input.now,
      })
      .where(eq(people.id, input.actor.personId)),
    database.insert(auditLog).values({
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "identity.birth_date_recorded",
      entityType: "person",
      entityId: input.actor.personId,
      beforeHash: stableHash({
        birthDate: person.birthDate,
        ageBand: person.ageBand,
        isMinor: person.isMinor,
      }),
      afterHash: stableHash({ birthDate: input.birthDate, ageBand, isMinor }),
      reason:
        "Account holder recorded a date of birth; minors remain in guardian-gated flows.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  return {
    personId: input.actor.personId,
    ageBand,
    isMinor,
    requiresGuardian: isMinor,
  };
}

export async function addDependent(input: {
  readonly actor: ApiActor;
  readonly displayName: string;
  readonly birthDate: string;
  readonly relationship: string;
  readonly emergencyContact: boolean;
  readonly canApproveSpending: boolean;
  readonly consentConfirmed: true;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly now: Date;
}): Promise<{
  readonly personId: string;
  readonly handle: string;
  readonly ageBand: "under-13" | "teen";
  readonly relationshipVerified: false;
  readonly parentalConsentRecorded: true;
}> {
  requireDatabase();
  const database = getDatabase();
  const guardian = await database.query.people.findFirst({
    where: eq(people.id, input.actor.personId),
  });
  if (!guardian) {
    throw new IdentityError(
      "PERSON_NOT_FOUND",
      "Guardian profile was not found.",
    );
  }
  if (guardian.ageBand !== "adult" || guardian.isMinor) {
    throw new IdentityError(
      "ADULT_REQUIRED",
      "Only an adult account can add a dependent.",
    );
  }
  const age = ageOnDate(input.birthDate, input.now);
  const ageBand = ageBandForAge(age);
  if (ageBand === "adult") {
    throw new IdentityError(
      "DEPENDENT_MUST_BE_MINOR",
      "Adults create their own Duna account instead of a dependent profile.",
    );
  }
  const personId = crypto.randomUUID();
  const handle = dependentHandle(input.displayName);
  const consentId = crypto.randomUUID();
  await database.batch([
    database.insert(people).values({
      id: personId,
      displayName: input.displayName,
      handle,
      birthDate: input.birthDate,
      isMinor: true,
      ageBand,
      ageVerifiedAt: input.now,
      parentalConsentAt: input.now,
      profileVisibility: "private",
      status: "active",
      createdAt: input.now,
      updatedAt: input.now,
    }),
    database.insert(guardianships).values({
      guardianId: input.actor.personId,
      minorId: personId,
      relationship: input.relationship,
      verified: false,
      emergencyContact: input.emergencyContact,
      canApproveSpending: input.canApproveSpending,
      createdAt: input.now,
    }),
    database.insert(guardianConsents).values({
      id: consentId,
      guardianId: input.actor.personId,
      minorId: personId,
      disclosureVersion: GUARDIAN_CONSENT_DISCLOSURE_VERSION,
      disclosureText: GUARDIAN_CONSENT_DISCLOSURE,
      disclosureTextHash: stableHash({
        version: GUARDIAN_CONSENT_DISCLOSURE_VERSION,
        text: GUARDIAN_CONSENT_DISCLOSURE,
      }),
      granted: input.consentConfirmed,
      method: "signed-attestation",
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      occurredAt: input.now,
    }),
    database.insert(auditLog).values({
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "guardianship.dependent_created",
      entityType: "guardianship",
      entityId: `${input.actor.personId}:${personId}`,
      afterHash: stableHash({
        minorId: personId,
        relationship: input.relationship,
        ageBand,
        consentId,
        disclosureVersion: GUARDIAN_CONSENT_DISCLOSURE_VERSION,
      }),
      reason:
        "Adult account created a private dependent profile and recorded parental consent; relationship verification remains pending.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  return {
    personId,
    handle,
    ageBand,
    relationshipVerified: false,
    parentalConsentRecorded: true,
  };
}

export async function loadGuardianReviewQueue(input?: {
  readonly includeReviewed?: boolean;
}) {
  requireDatabase();
  const database = getDatabase();
  const relationshipRows = await database
    .select()
    .from(guardianships)
    .where(
      input?.includeReviewed
        ? undefined
        : eq(guardianships.reviewStatus, "pending"),
    )
    .orderBy(guardianships.createdAt);
  if (relationshipRows.length === 0) return [];

  const personIds = [
    ...new Set(
      relationshipRows.flatMap((row) => [row.guardianId, row.minorId]),
    ),
  ];
  const [personRows, consentRows] = await Promise.all([
    database
      .select({
        id: people.id,
        displayName: people.displayName,
        ageBand: people.ageBand,
        isMinor: people.isMinor,
      })
      .from(people)
      .where(inArray(people.id, personIds)),
    database
      .select()
      .from(guardianConsents)
      .where(inArray(guardianConsents.minorId, personIds))
      .orderBy(desc(guardianConsents.occurredAt)),
  ]);
  const peopleById = new Map(personRows.map((person) => [person.id, person]));
  const latestConsentByRelationship = new Map<
    string,
    (typeof consentRows)[number]
  >();
  for (const consent of consentRows) {
    const key = `${consent.guardianId}:${consent.minorId}`;
    if (!latestConsentByRelationship.has(key)) {
      latestConsentByRelationship.set(key, consent);
    }
  }

  return relationshipRows.flatMap((relationship) => {
    const guardian = peopleById.get(relationship.guardianId);
    const minor = peopleById.get(relationship.minorId);
    if (
      !guardian ||
      !minor ||
      !minor.isMinor ||
      !["under-13", "teen"].includes(minor.ageBand)
    ) {
      return [];
    }
    const consent = latestConsentByRelationship.get(
      `${relationship.guardianId}:${relationship.minorId}`,
    );
    return [
      {
        guardianId: relationship.guardianId,
        guardianName: guardian.displayName,
        minorId: relationship.minorId,
        minorName: minor.displayName,
        minorAgeBand: minor.ageBand as "under-13" | "teen",
        relationship: relationship.relationship,
        emergencyContact: relationship.emergencyContact,
        canApproveSpending: relationship.canApproveSpending,
        status: relationship.reviewStatus as
          "pending" | "verified" | "rejected",
        createdAt: relationship.createdAt.toISOString(),
        reviewedAt: relationship.reviewedAt?.toISOString(),
        reviewReason: relationship.reviewReason ?? undefined,
        consent: consent
          ? {
              granted: consent.granted,
              method: consent.method as
                "signed-attestation" | "identity-provider" | "admin-review",
              disclosureVersion: consent.disclosureVersion,
              occurredAt: consent.occurredAt.toISOString(),
            }
          : undefined,
      },
    ];
  });
}

export async function reviewGuardianship(input: {
  readonly actor: ApiActor;
  readonly guardianId: string;
  readonly minorId: string;
  readonly decision: "verified" | "rejected";
  readonly reason: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{
  readonly guardianId: string;
  readonly minorId: string;
  readonly status: "verified" | "rejected";
  readonly reviewedAt: string;
}> {
  requireDatabase();
  const database = getDatabase();
  const relationship = await database.query.guardianships.findFirst({
    where: and(
      eq(guardianships.guardianId, input.guardianId),
      eq(guardianships.minorId, input.minorId),
    ),
  });
  if (!relationship) {
    throw new IdentityError(
      "GUARDIANSHIP_NOT_FOUND",
      "Guardian relationship was not found.",
    );
  }
  if (relationship.reviewStatus !== "pending") {
    throw new IdentityError(
      "GUARDIANSHIP_ALREADY_REVIEWED",
      `Guardian relationship is already ${relationship.reviewStatus}.`,
    );
  }
  const [guardian, minor, consent] = await Promise.all([
    database.query.people.findFirst({
      where: eq(people.id, input.guardianId),
    }),
    database.query.people.findFirst({ where: eq(people.id, input.minorId) }),
    database.query.guardianConsents.findFirst({
      where: and(
        eq(guardianConsents.guardianId, input.guardianId),
        eq(guardianConsents.minorId, input.minorId),
        eq(guardianConsents.granted, true),
      ),
      orderBy: desc(guardianConsents.occurredAt),
    }),
  ]);
  if (
    !guardian ||
    guardian.isMinor ||
    guardian.ageBand !== "adult" ||
    !minor ||
    !minor.isMinor ||
    !["under-13", "teen"].includes(minor.ageBand)
  ) {
    throw new IdentityError(
      "INVALID_GUARDIANSHIP",
      "The relationship no longer joins an adult guardian to a minor.",
    );
  }
  if (input.decision === "verified" && !consent) {
    throw new IdentityError(
      "GUARDIAN_CONSENT_REQUIRED",
      "Recorded parental or legal-guardian consent is required before relationship verification.",
    );
  }
  const before = {
    verified: relationship.verified,
    reviewStatus: relationship.reviewStatus,
    reviewedAt: relationship.reviewedAt?.toISOString(),
  };
  const after = {
    verified: input.decision === "verified",
    reviewStatus: input.decision,
    reviewedAt: input.now.toISOString(),
    reviewedByPersonId: input.actor.personId,
  };
  await database.batch([
    database
      .update(guardianships)
      .set({
        verified: after.verified,
        verifiedAt: after.verified ? input.now : null,
        reviewStatus: after.reviewStatus,
        reviewReason: input.reason,
        reviewedByPersonId: input.actor.personId,
        reviewedAt: input.now,
      })
      .where(
        and(
          eq(guardianships.guardianId, input.guardianId),
          eq(guardianships.minorId, input.minorId),
          eq(guardianships.reviewStatus, "pending"),
        ),
      ),
    database.insert(auditLog).values({
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: `guardianship.${input.decision}`,
      entityType: "guardianship",
      entityId: `${input.guardianId}:${input.minorId}`,
      beforeHash: stableHash(before),
      afterHash: stableHash(after),
      reason: input.reason,
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  return {
    guardianId: input.guardianId,
    minorId: input.minorId,
    status: input.decision,
    reviewedAt: input.now.toISOString(),
  };
}
