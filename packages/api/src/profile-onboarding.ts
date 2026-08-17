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
import { z } from "zod";
import { stableHash } from "./canonical";
import { canonicalPublicWebUrl } from "./public-web-url";
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
  readonly collegeName?: string | null;
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
    collegeName: subject.collegeName,
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
    collegeName:
      input.playingExperience === "collegiate"
        ? input.collegeName?.trim() || null
        : null,
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
  readonly collegeName?: string;
  readonly summary: string;
  readonly confidence: "low" | "medium" | "high";
  readonly learnedFacts: readonly string[];
  readonly missingFields: readonly string[];
  readonly modelUsed: "guided-fallback";
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
  const collegeName =
    summary
      .match(
        /\b(?:played|studied|went)\s+(?:at|for|to)\s+([A-Z][A-Za-z0-9&.' -]{1,80}(?:University|College|State|Tech|Institute))/,
      )?.[1]
      ?.trim() ??
    summary
      .match(
        /\b(?:college|collegiate)\s+(?:at|for)\s+([A-Z][A-Za-z0-9&.' -]{1,80})/,
      )?.[1]
      ?.trim() ??
    (playingExperience === "collegiate"
      ? summary
          .match(
            /\b(?:at|for|to)\s+([A-Z][A-Za-z0-9&.' -]{1,80}?(?:University|College|State|Tech|Institute))\b/,
          )?.[1]
          ?.trim()
      : undefined);
  const inferred = [
    playingExperience,
    playedIndoorPrior,
    yearsPlaying,
    heightMillimeters,
    collegeName,
  ].filter((value) => value !== undefined).length;
  const learnedFacts = [
    playingExperience
      ? `Highest playing level: ${playingExperience.replace("-", " ")}`
      : undefined,
    playedIndoorPrior === undefined
      ? undefined
      : playedIndoorPrior
        ? "Has played indoor volleyball"
        : "Has not played indoor volleyball",
    yearsPlaying === undefined ? undefined : `${yearsPlaying} years playing`,
    heightMillimeters === undefined
      ? undefined
      : `Height: ${Math.round(heightMillimeters / 10)} cm`,
    collegeName ? `College: ${collegeName}` : undefined,
  ].filter((value): value is string => Boolean(value));
  const missingFields = [
    playingExperience ? undefined : "playingExperience",
    playedIndoorPrior === undefined ? "playedIndoorPrior" : undefined,
    yearsPlaying === undefined ? "yearsPlaying" : undefined,
    heightMillimeters === undefined ? "heightMillimeters" : undefined,
    playingExperience === "collegiate" && !collegeName
      ? "collegeName"
      : undefined,
  ].filter((value): value is string => Boolean(value));
  return {
    playingExperience,
    playedIndoorPrior,
    yearsPlaying,
    heightMillimeters,
    collegeName,
    summary,
    confidence: inferred >= 3 ? "high" : inferred >= 2 ? "medium" : "low",
    learnedFacts,
    missingFields,
    modelUsed: "guided-fallback",
  };
}

const playingProfileSynthesisSchema = z.object({
  playingExperience: z
    .enum(["amateur", "high-school", "collegiate", "professional"])
    .nullable(),
  playedIndoorPrior: z.boolean().nullable(),
  yearsPlaying: z.number().int().min(0).max(100).nullable(),
  heightMillimeters: z.number().int().min(600).max(2600).nullable(),
  collegeName: z.string().trim().min(1).max(120).nullable(),
  summary: z.string().trim().min(1).max(1_500),
  learnedFacts: z.array(z.string().trim().min(1).max(160)).max(12),
  missingFields: z.array(
    z.enum([
      "playingExperience",
      "playedIndoorPrior",
      "yearsPlaying",
      "heightMillimeters",
      "collegeName",
    ]),
  ),
  confidence: z.enum(["low", "medium", "high"]),
});

export async function synthesizePlayingExperienceNarrative(
  narrative: string,
  now = new Date(),
) {
  const fallback = inferPlayingExperienceNarrative(narrative, now);
  const gatewayCredential =
    process.env.AI_GATEWAY_API_KEY?.trim() ||
    process.env.VERCEL_OIDC_TOKEN?.trim();
  if (!gatewayCredential) return fallback;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch("https://ai-gateway.vercel.sh/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${gatewayCredential}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model:
          process.env.AI_GATEWAY_PROFILE_MODEL?.trim() || "openai/gpt-5.6-luna",
        store: false,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: "Extract a draft volleyball player profile from the user's own words. Never invent facts. Use null for anything not explicitly stated or safely implied. Collegiate includes college club, junior college, NAIA, or NCAA. Professional requires explicit professional, federation, AVP, FIVB, world-tour, paid, or ranked-pro experience. Convert clearly stated height to millimeters. collegeName is only the named college or university. learnedFacts must be short, friendly statements shown to the user. missingFields lists facts that still need to be asked. The result is a draft and must never claim it was saved.",
              },
            ],
          },
          {
            role: "user",
            content: [{ type: "input_text", text: narrative }],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "playing_profile_draft",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                playingExperience: {
                  anyOf: [
                    {
                      type: "string",
                      enum: [
                        "amateur",
                        "high-school",
                        "collegiate",
                        "professional",
                      ],
                    },
                    { type: "null" },
                  ],
                },
                playedIndoorPrior: {
                  anyOf: [{ type: "boolean" }, { type: "null" }],
                },
                yearsPlaying: {
                  anyOf: [
                    { type: "integer", minimum: 0, maximum: 100 },
                    { type: "null" },
                  ],
                },
                heightMillimeters: {
                  anyOf: [
                    { type: "integer", minimum: 600, maximum: 2600 },
                    { type: "null" },
                  ],
                },
                collegeName: {
                  anyOf: [
                    { type: "string", minLength: 1, maxLength: 120 },
                    { type: "null" },
                  ],
                },
                summary: {
                  type: "string",
                  minLength: 1,
                  maxLength: 1500,
                },
                learnedFacts: {
                  type: "array",
                  maxItems: 12,
                  items: { type: "string", minLength: 1, maxLength: 160 },
                },
                missingFields: {
                  type: "array",
                  items: {
                    type: "string",
                    enum: [
                      "playingExperience",
                      "playedIndoorPrior",
                      "yearsPlaying",
                      "heightMillimeters",
                      "collegeName",
                    ],
                  },
                },
                confidence: {
                  type: "string",
                  enum: ["low", "medium", "high"],
                },
              },
              required: [
                "playingExperience",
                "playedIndoorPrior",
                "yearsPlaying",
                "heightMillimeters",
                "collegeName",
                "summary",
                "learnedFacts",
                "missingFields",
                "confidence",
              ],
            },
          },
        },
      }),
      signal: controller.signal,
    });
    if (!response.ok) return fallback;
    const payload = (await response.json()) as {
      output_text?: string;
      output?: readonly {
        content?: readonly {
          type?: string;
          text?: string;
        }[];
      }[];
    };
    const outputText =
      payload.output_text ??
      payload.output
        ?.flatMap((item) => item.content ?? [])
        .find(
          (item) =>
            (item.type === "output_text" || item.type === "text") &&
            typeof item.text === "string",
        )?.text;
    const parsed = playingProfileSynthesisSchema.safeParse(
      JSON.parse(outputText ?? "{}"),
    );
    if (!parsed.success) return fallback;
    return {
      playingExperience: parsed.data.playingExperience ?? undefined,
      playedIndoorPrior: parsed.data.playedIndoorPrior ?? undefined,
      yearsPlaying: parsed.data.yearsPlaying ?? undefined,
      heightMillimeters: parsed.data.heightMillimeters ?? undefined,
      collegeName: parsed.data.collegeName ?? undefined,
      summary: parsed.data.summary,
      learnedFacts: parsed.data.learnedFacts,
      missingFields: parsed.data.missingFields,
      confidence: parsed.data.confidence,
      modelUsed: "openai" as const,
    };
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer);
  }
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
    inviteUrl: canonicalPublicWebUrl(
      `/join/guardian/${token}`,
      input.applicationOrigin,
    ),
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
