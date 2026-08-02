import { randomBytes } from "node:crypto";
import {
  auditLog,
  getDatabase,
  guardianConsents,
  guardianInvitations,
  guardianships,
  people,
} from "@duna/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { stableHash } from "./canonical";
import type { ApiActor } from "./context";
import {
  GUARDIAN_CONSENT_DISCLOSURE,
  GUARDIAN_CONSENT_DISCLOSURE_VERSION,
} from "./identity";

export type PlayingExperience =
  "amateur" | "high-school" | "collegiate" | "professional";

export class ProfileOnboardingError extends Error {
  constructor(
    readonly code:
      | "DATABASE_REQUIRED"
      | "PERSON_NOT_FOUND"
      | "SUBJECT_NOT_ALLOWED"
      | "MINOR_REQUIRED"
      | "ADULT_REQUIRED"
      | "INVITATION_NOT_FOUND"
      | "INVITATION_EXPIRED"
      | "INVITATION_ALREADY_CLAIMED",
    message: string,
  ) {
    super(message);
    this.name = "ProfileOnboardingError";
  }
}

function requireDatabase(): void {
  if (!process.env.DATABASE_URL) {
    throw new ProfileOnboardingError(
      "DATABASE_REQUIRED",
      "Profile onboarding requires the connected Duna database.",
    );
  }
}

export async function assertProfileSubjectAuthority(input: {
  readonly actor: ApiActor;
  readonly subjectPersonId?: string;
}) {
  const database = getDatabase();
  const subjectPersonId = input.subjectPersonId ?? input.actor.personId;
  const subject = await database.query.people.findFirst({
    where: eq(people.id, subjectPersonId),
  });
  if (!subject) {
    throw new ProfileOnboardingError(
      "PERSON_NOT_FOUND",
      "The player profile was not found.",
    );
  }
  if (subject.id === input.actor.personId) return subject;
  const guardian = await database.query.guardianships.findFirst({
    where: and(
      eq(guardianships.guardianId, input.actor.personId),
      eq(guardianships.minorId, subject.id),
      inArray(guardianships.reviewStatus, ["pending", "verified"]),
    ),
  });
  if (!guardian || input.actor.ageBand !== "adult") {
    throw new ProfileOnboardingError(
      "SUBJECT_NOT_ALLOWED",
      "Only the player or their connected parent or guardian can update this profile.",
    );
  }
  return subject;
}

function completedStatus(input: {
  readonly isMinor: boolean;
  readonly guardianConnected: boolean;
}): "complete" | "guardian-required" {
  return input.isMinor && !input.guardianConnected
    ? "guardian-required"
    : "complete";
}

export async function updatePlayingProfile(input: {
  readonly actor: ApiActor;
  readonly subjectPersonId?: string;
  readonly legalGivenName: string;
  readonly legalMiddleName?: string | null;
  readonly legalFamilyName: string;
  readonly heightMillimeters?: number | null;
  readonly playingExperience: PlayingExperience;
  readonly playedIndoorPrior: boolean;
  readonly yearsPlaying: number;
  readonly experienceSummary?: string | null;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}) {
  requireDatabase();
  const database = getDatabase();
  const subject = await assertProfileSubjectAuthority(input);
  const guardianConnected = subject.isMinor
    ? Boolean(
        await database.query.guardianships.findFirst({
          where: and(
            eq(guardianships.minorId, subject.id),
            inArray(guardianships.reviewStatus, ["pending", "verified"]),
          ),
        }),
      )
    : true;
  const profileOnboardingStatus = completedStatus({
    isMinor: subject.isMinor,
    guardianConnected,
  });
  const before = {
    legalGivenName: subject.legalGivenName,
    legalMiddleName: subject.legalMiddleName,
    legalFamilyName: subject.legalFamilyName,
    heightMillimeters: subject.heightMillimeters,
    playingExperience: subject.playingExperience,
    playedIndoorPrior: subject.playedIndoorPrior,
    yearsPlaying: subject.yearsPlaying,
    experienceSummary: subject.experienceSummary,
    profileOnboardingStatus: subject.profileOnboardingStatus,
  };
  const after = {
    legalGivenName: input.legalGivenName.trim(),
    legalMiddleName: input.legalMiddleName?.trim() || null,
    legalFamilyName: input.legalFamilyName.trim(),
    heightMillimeters: input.heightMillimeters ?? null,
    playingExperience: input.playingExperience,
    playedIndoorPrior: input.playedIndoorPrior,
    yearsPlaying: input.yearsPlaying,
    experienceSummary: input.experienceSummary?.trim() || null,
    profileOnboardingStatus,
  };
  await database.batch([
    database
      .update(people)
      .set({
        ...after,
        isProfessional:
          subject.isProfessional || input.playingExperience === "professional",
        professionalDefinition:
          input.playingExperience === "professional" &&
          !subject.professionalDefinition
            ? "Self-reported professional experience; external competition history pending review."
            : subject.professionalDefinition,
        profileOnboardingCompletedAt:
          profileOnboardingStatus === "complete" ? input.now : null,
        updatedAt: input.now,
      })
      .where(eq(people.id, subject.id)),
    database.insert(auditLog).values({
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "profile.playing-experience.updated",
      entityType: "person",
      entityId: subject.id,
      beforeHash: stableHash(before),
      afterHash: stableHash(after),
      reason:
        subject.id === input.actor.personId
          ? "Player completed structured playing-experience onboarding."
          : "Connected parent or guardian completed playing-experience onboarding for a dependent.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  return {
    personId: subject.id,
    status: profileOnboardingStatus,
    guardianRequired: profileOnboardingStatus === "guardian-required",
  };
}

function numberFromWords(value: string): number | undefined {
  const words: Readonly<Record<string, number>> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    fifteen: 15,
    twenty: 20,
  };
  return words[value.toLowerCase()];
}

export function inferPlayingExperienceNarrative(
  narrative: string,
  now = new Date(),
): {
  readonly playingExperience?: PlayingExperience;
  readonly playedIndoorPrior?: boolean;
  readonly yearsPlaying?: number;
  readonly heightMillimeters?: number;
  readonly summary: string;
  readonly confidence: "low" | "medium" | "high";
} {
  const summary = narrative.replaceAll(/\s+/g, " ").trim().slice(0, 1_500);
  const normalized = summary.toLowerCase();
  const playingExperience: PlayingExperience | undefined =
    /\b(pro|professional|avp|fivb|world tour)\b/.test(normalized)
      ? "professional"
      : /\b(college|collegiate|ncaa|university)\b/.test(normalized)
        ? "collegiate"
        : /\b(high school|varsity|junior varsity|\bjv\b)\b/.test(normalized)
          ? "high-school"
          : /\b(amateur|recreational|rec league|pickup|club)\b/.test(normalized)
            ? "amateur"
            : undefined;
  const negativeIndoor =
    /\b(never|have not|haven't|did not|didn't|no)\b[^.]{0,28}\bindoor\b/.test(
      normalized,
    );
  const playedIndoorPrior = negativeIndoor
    ? false
    : /\bindoor\b/.test(normalized)
      ? true
      : undefined;
  const yearMatch = normalized.match(
    /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty)\s*(?:\+|plus)?\s*years?\b/,
  );
  const sinceMatch = normalized.match(/\bsince\s+(19\d{2}|20\d{2})\b/);
  const parsedYear = yearMatch
    ? Number.parseInt(yearMatch[1] ?? "", 10) ||
      numberFromWords(yearMatch[1] ?? "")
    : undefined;
  const yearsPlaying =
    parsedYear !== undefined
      ? Math.min(100, parsedYear)
      : sinceMatch
        ? Math.max(
            0,
            Math.min(
              100,
              now.getUTCFullYear() - Number.parseInt(sinceMatch[1] ?? "", 10),
            ),
          )
        : undefined;
  const metricHeight = normalized.match(
    /\b(1\d{2}|2[0-4]\d)\s*(?:cm|centimeters?)\b/,
  );
  const imperialHeight = normalized.match(
    /\b([3-7])\s*(?:feet|foot|ft|')\s*(?:(\d{1,2})\s*(?:inches|inch|in|"))?/,
  );
  const heightMillimeters = metricHeight
    ? Number.parseInt(metricHeight[1] ?? "", 10) * 10
    : imperialHeight
      ? Math.round(
          (Number.parseInt(imperialHeight[1] ?? "", 10) * 12 +
            Number.parseInt(imperialHeight[2] ?? "0", 10)) *
            25.4,
        )
      : undefined;
  const inferred = [
    playingExperience,
    playedIndoorPrior,
    yearsPlaying,
    heightMillimeters,
  ].filter((value) => value !== undefined).length;
  return {
    playingExperience,
    playedIndoorPrior,
    yearsPlaying,
    heightMillimeters,
    summary,
    confidence: inferred >= 3 ? "high" : inferred >= 2 ? "medium" : "low",
  };
}

function invitationTokenHash(token: string): string {
  return stableHash({ purpose: "guardian-invitation", token });
}

export async function createGuardianInvitation(input: {
  readonly actor: ApiActor;
  readonly subjectPersonId?: string;
  readonly relationship: string;
  readonly applicationOrigin: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}) {
  requireDatabase();
  const database = getDatabase();
  const subject = await assertProfileSubjectAuthority(input);
  if (!subject.isMinor) {
    throw new ProfileOnboardingError(
      "MINOR_REQUIRED",
      "Guardian links are only created for a child or teen account.",
    );
  }
  const token = randomBytes(32).toString("base64url");
  const tokenHash = invitationTokenHash(token);
  const expiresAt = new Date(input.now.getTime() + 14 * 24 * 60 * 60 * 1_000);
  await database
    .update(guardianInvitations)
    .set({
      status: "cancelled",
      cancelledAt: input.now,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(guardianInvitations.minorId, subject.id),
        eq(guardianInvitations.status, "pending"),
      ),
    );
  const [invitation] = await database
    .insert(guardianInvitations)
    .values({
      minorId: subject.id,
      createdByPersonId: input.actor.personId,
      tokenHash,
      relationship: input.relationship,
      expiresAt,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .returning({ id: guardianInvitations.id });
  if (!invitation) throw new Error("Guardian invitation could not be created");
  await database.batch([
    database
      .update(people)
      .set({
        profileOnboardingStatus: "guardian-required",
        updatedAt: input.now,
      })
      .where(eq(people.id, subject.id)),
    database.insert(auditLog).values({
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "guardianship.invitation.created",
      entityType: "guardian-invitation",
      entityId: invitation.id,
      afterHash: stableHash({
        minorId: subject.id,
        expiresAt,
        relationship: input.relationship,
      }),
      reason: "A protected guardian invitation link was created.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  return {
    invitationId: invitation.id,
    minorId: subject.id,
    inviteUrl: `${input.applicationOrigin.replace(/\/$/, "")}/join/guardian/${token}`,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function loadGuardianInvitation(token: string, now: Date) {
  requireDatabase();
  const database = getDatabase();
  const invitation = await database.query.guardianInvitations.findFirst({
    where: eq(guardianInvitations.tokenHash, invitationTokenHash(token)),
  });
  if (!invitation) return undefined;
  const minor = await database.query.people.findFirst({
    where: eq(people.id, invitation.minorId),
  });
  if (!minor) return undefined;
  const storedStatus: "pending" | "claimed" | "expired" | "cancelled" = [
    "pending",
    "claimed",
    "expired",
    "cancelled",
  ].includes(invitation.status)
    ? (invitation.status as "pending" | "claimed" | "expired" | "cancelled")
    : "expired";
  const status: "pending" | "claimed" | "expired" | "cancelled" =
    storedStatus === "pending" && invitation.expiresAt <= now
      ? "expired"
      : storedStatus;
  return {
    invitationId: invitation.id,
    childDisplayName: minor.displayName,
    relationship: invitation.relationship,
    status,
    expiresAt: invitation.expiresAt.toISOString(),
  };
}

export async function claimGuardianInvitation(input: {
  readonly actor: ApiActor;
  readonly token: string;
  readonly consentConfirmed: true;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly now: Date;
}) {
  requireDatabase();
  const database = getDatabase();
  const guardian = await database.query.people.findFirst({
    where: eq(people.id, input.actor.personId),
  });
  if (!guardian || guardian.isMinor || guardian.ageBand !== "adult") {
    throw new ProfileOnboardingError(
      "ADULT_REQUIRED",
      "A parent or legal guardian must complete adult age setup before accepting.",
    );
  }
  const invitation = await database.query.guardianInvitations.findFirst({
    where: eq(guardianInvitations.tokenHash, invitationTokenHash(input.token)),
  });
  if (!invitation) {
    throw new ProfileOnboardingError(
      "INVITATION_NOT_FOUND",
      "This guardian invitation was not found.",
    );
  }
  if (invitation.expiresAt <= input.now) {
    throw new ProfileOnboardingError(
      "INVITATION_EXPIRED",
      "This guardian invitation has expired. Ask the child to create a new link.",
    );
  }
  if (invitation.status === "claimed") {
    if (invitation.claimedByPersonId === guardian.id) {
      return {
        guardianId: guardian.id,
        minorId: invitation.minorId,
        status: "pending-review" as const,
      };
    }
    throw new ProfileOnboardingError(
      "INVITATION_ALREADY_CLAIMED",
      "This guardian invitation has already been accepted.",
    );
  }
  if (invitation.status !== "pending") {
    throw new ProfileOnboardingError(
      "INVITATION_NOT_FOUND",
      "This guardian invitation is no longer active.",
    );
  }
  const minor = await database.query.people.findFirst({
    where: eq(people.id, invitation.minorId),
  });
  if (!minor?.isMinor || minor.id === guardian.id) {
    throw new ProfileOnboardingError(
      "MINOR_REQUIRED",
      "This invitation is not connected to an active child profile.",
    );
  }
  const disclosureHash = stableHash(GUARDIAN_CONSENT_DISCLOSURE);
  await database.batch([
    database
      .insert(guardianships)
      .values({
        guardianId: guardian.id,
        minorId: minor.id,
        relationship: invitation.relationship,
        verified: false,
        emergencyContact: true,
        canApproveSpending: true,
        reviewStatus: "pending",
        createdAt: input.now,
      })
      .onConflictDoUpdate({
        target: [guardianships.guardianId, guardianships.minorId],
        set: {
          relationship: invitation.relationship,
          verified: false,
          reviewStatus: "pending",
          reviewReason: null,
          reviewedByPersonId: null,
          reviewedAt: null,
          verifiedAt: null,
        },
      }),
    database.insert(guardianConsents).values({
      guardianId: guardian.id,
      minorId: minor.id,
      disclosureVersion: GUARDIAN_CONSENT_DISCLOSURE_VERSION,
      disclosureText: GUARDIAN_CONSENT_DISCLOSURE,
      disclosureTextHash: disclosureHash,
      granted: input.consentConfirmed,
      method: "signed-attestation",
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      occurredAt: input.now,
    }),
    database
      .update(guardianInvitations)
      .set({
        status: "claimed",
        claimedByPersonId: guardian.id,
        claimedAt: input.now,
        updatedAt: input.now,
      })
      .where(eq(guardianInvitations.id, invitation.id)),
    database
      .update(people)
      .set({
        parentalConsentAt: input.now,
        profileOnboardingStatus:
          minor.playingExperience === "not-set" ? "in-progress" : "complete",
        profileOnboardingCompletedAt:
          minor.playingExperience === "not-set" ? null : input.now,
        updatedAt: input.now,
      })
      .where(eq(people.id, minor.id)),
    database.insert(auditLog).values({
      actorPersonId: guardian.id,
      actorType: "person",
      action: "guardianship.invitation.claimed",
      entityType: "guardianship",
      entityId: `${guardian.id}:${minor.id}`,
      afterHash: stableHash({
        guardianId: guardian.id,
        minorId: minor.id,
        disclosureHash,
        reviewStatus: "pending",
      }),
      reason:
        "Adult accepted the guardian invitation and recorded parental or legal-guardian consent; relationship review remains pending.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  return {
    guardianId: guardian.id,
    minorId: minor.id,
    status: "pending-review" as const,
  };
}

export async function latestGuardianInvitationForMinor(minorId: string) {
  requireDatabase();
  const invitation = await getDatabase().query.guardianInvitations.findFirst({
    where: eq(guardianInvitations.minorId, minorId),
    orderBy: desc(guardianInvitations.createdAt),
  });
  return invitation
    ? {
        status: invitation.status,
        expiresAt: invitation.expiresAt.toISOString(),
      }
    : undefined;
}
