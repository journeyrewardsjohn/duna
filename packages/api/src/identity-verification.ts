import {
  auditLog,
  getDatabase,
  identityVerificationSessions,
  people,
  walletAccounts,
} from "@duna/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import type Stripe from "stripe";
import { stableHash } from "./canonical";
import type { ApiActor } from "./context";
import { getStripeClient, isStripeConfigured } from "./payments";

export type IdentityVerificationStatus =
  "requires-input" | "processing" | "verified" | "canceled" | "redacted";

export class IdentityVerificationError extends Error {
  constructor(
    readonly code:
      | "DATABASE_REQUIRED"
      | "STRIPE_REQUIRED"
      | "ADULT_REQUIRED"
      | "PROFILE_INCOMPLETE"
      | "VERIFICATION_NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "IdentityVerificationError";
  }
}

function requireConfiguration(): void {
  if (!process.env.DATABASE_URL) {
    throw new IdentityVerificationError(
      "DATABASE_REQUIRED",
      "Identity verification requires the connected Duna database.",
    );
  }
  if (!isStripeConfigured()) {
    throw new IdentityVerificationError(
      "STRIPE_REQUIRED",
      "Identity verification is not configured yet.",
    );
  }
}

function storedStatus(
  status: Stripe.Identity.VerificationSession.Status,
  eventType?: string,
): IdentityVerificationStatus {
  if (eventType === "identity.verification_session.redacted") {
    return "redacted";
  }
  if (status === "requires_input") return "requires-input";
  if (status === "verified") return "verified";
  if (status === "processing") return "processing";
  if (status === "canceled") return "canceled";
  return "requires-input";
}

export async function startStripeIdentityVerification(input: {
  readonly actor: ApiActor;
  readonly idempotencyKey: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}) {
  requireConfiguration();
  if (input.actor.ageBand !== "adult") {
    throw new IdentityVerificationError(
      "ADULT_REQUIRED",
      "Payout identity verification is completed by an adult. A minor uses their connected guardian's verified payout account.",
    );
  }
  const database = getDatabase();
  const person = await database.query.people.findFirst({
    where: eq(people.id, input.actor.personId),
  });
  if (!person?.birthDate || !person.legalGivenName || !person.legalFamilyName) {
    throw new IdentityVerificationError(
      "PROFILE_INCOMPLETE",
      "Add your legal name and birth date before starting identity verification.",
    );
  }
  const current = await database.query.identityVerificationSessions.findFirst({
    where: and(
      eq(identityVerificationSessions.personId, person.id),
      inArray(identityVerificationSessions.status, [
        "requires-input",
        "processing",
        "verified",
      ]),
    ),
    orderBy: desc(identityVerificationSessions.createdAt),
  });
  if (current?.status === "verified") {
    return {
      verificationId: current.id,
      status: "verified" as const,
      url: undefined,
    };
  }
  if (current) {
    const stripeSession =
      await getStripeClient().identity.verificationSessions.retrieve(
        current.providerSessionId,
      );
    const status = storedStatus(stripeSession.status);
    await database
      .update(identityVerificationSessions)
      .set({
        status,
        lastErrorCode: stripeSession.last_error?.code,
        updatedAt: input.now,
      })
      .where(eq(identityVerificationSessions.id, current.id));
    return {
      verificationId: current.id,
      status,
      url: stripeSession.url ?? undefined,
    };
  }
  const stripeSession =
    await getStripeClient().identity.verificationSessions.create(
      {
        type: "document",
        provided_details: person.email ? { email: person.email } : undefined,
        options: {
          document: {
            require_matching_selfie:
              process.env.STRIPE_IDENTITY_REQUIRE_SELFIE !== "false",
          },
        },
        metadata: {
          dunaPersonId: person.id,
          purpose: "payouts",
        },
      },
      { idempotencyKey: `duna-identity-${person.id}-${input.idempotencyKey}` },
    );
  const verificationId = crypto.randomUUID();
  await database.batch([
    database.insert(identityVerificationSessions).values({
      id: verificationId,
      personId: person.id,
      requestedByPersonId: input.actor.personId,
      provider: "stripe",
      providerSessionId: stripeSession.id,
      purpose: "payouts",
      status: storedStatus(stripeSession.status),
      livemode: stripeSession.livemode,
      lastErrorCode: stripeSession.last_error?.code,
      createdAt: input.now,
      updatedAt: input.now,
    }),
    database
      .insert(walletAccounts)
      .values({
        personId: person.id,
        kycStatus: "requires-input",
        payoutHeld: true,
        spendingBlocked: false,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .onConflictDoUpdate({
        target: walletAccounts.personId,
        set: {
          kycStatus: "requires-input",
          payoutHeld: true,
          updatedAt: input.now,
        },
      }),
    database.insert(auditLog).values({
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "identity.stripe-verification.started",
      entityType: "identity-verification",
      entityId: verificationId,
      afterHash: stableHash({
        provider: "stripe",
        providerSessionId: stripeSession.id,
        purpose: "payouts",
        livemode: stripeSession.livemode,
      }),
      reason:
        "Adult started Stripe-hosted identity verification for payout eligibility.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  return {
    verificationId,
    status: storedStatus(stripeSession.status),
    url: stripeSession.url ?? undefined,
  };
}

export async function loadIdentityVerification(personId: string) {
  if (!process.env.DATABASE_URL) {
    return {
      configured: isStripeConfigured(),
      status: "not-started" as const,
    };
  }
  const row = await getDatabase().query.identityVerificationSessions.findFirst({
    where: eq(identityVerificationSessions.personId, personId),
    orderBy: desc(identityVerificationSessions.createdAt),
  });
  return row
    ? {
        configured: isStripeConfigured(),
        verificationId: row.id,
        status: row.status as IdentityVerificationStatus,
        livemode: row.livemode,
        verifiedAt: row.verifiedAt?.toISOString(),
        lastErrorCode: row.lastErrorCode ?? undefined,
      }
    : {
        configured: isStripeConfigured(),
        status: "not-started" as const,
      };
}

export async function synchronizeIdentityVerification(input: {
  readonly object: Readonly<Record<string, unknown>>;
  readonly eventType: string;
  readonly occurredAt: Date;
  readonly traceId: string;
}) {
  const providerSessionId =
    typeof input.object.id === "string" ? input.object.id : undefined;
  if (!providerSessionId) {
    throw new IdentityVerificationError(
      "VERIFICATION_NOT_FOUND",
      "Stripe Identity event is missing its verification session ID.",
    );
  }
  const database = getDatabase();
  const verification =
    await database.query.identityVerificationSessions.findFirst({
      where: eq(
        identityVerificationSessions.providerSessionId,
        providerSessionId,
      ),
    });
  if (!verification) {
    throw new IdentityVerificationError(
      "VERIFICATION_NOT_FOUND",
      "Stripe Identity session is not mapped to a Duna profile.",
    );
  }
  const rawStatus =
    typeof input.object.status === "string"
      ? (input.object.status as Stripe.Identity.VerificationSession.Status)
      : "requires_input";
  const status = storedStatus(rawStatus, input.eventType);
  const lastError =
    input.object.last_error &&
    typeof input.object.last_error === "object" &&
    !Array.isArray(input.object.last_error)
      ? (input.object.last_error as Readonly<Record<string, unknown>>)
      : undefined;
  const lastErrorCode =
    typeof lastError?.code === "string" ? lastError.code : undefined;
  const verifiedAt = status === "verified" ? input.occurredAt : null;
  const submittedAt =
    status === "processing" || status === "verified"
      ? input.occurredAt
      : undefined;
  await database.batch([
    database
      .update(identityVerificationSessions)
      .set({
        status,
        lastErrorCode,
        ...(submittedAt ? { submittedAt } : {}),
        verifiedAt,
        redactedAt: status === "redacted" ? input.occurredAt : null,
        updatedAt: input.occurredAt,
      })
      .where(eq(identityVerificationSessions.id, verification.id)),
    database
      .update(walletAccounts)
      .set({
        kycStatus: status,
        payoutHeld: status !== "verified",
        updatedAt: input.occurredAt,
      })
      .where(eq(walletAccounts.personId, verification.personId)),
    database
      .update(people)
      .set({
        ...(status === "verified" ? { ageVerifiedAt: input.occurredAt } : {}),
        updatedAt: input.occurredAt,
      })
      .where(eq(people.id, verification.personId)),
    database.insert(auditLog).values({
      actorType: "system",
      action: `identity.stripe-verification.${status}`,
      entityType: "identity-verification",
      entityId: verification.id,
      afterHash: stableHash({
        providerSessionId,
        status,
        lastErrorCode,
      }),
      reason:
        status === "verified"
          ? "Stripe confirmed the adult identity for payout eligibility."
          : "Stripe Identity verification status changed.",
      traceId: input.traceId,
      createdAt: input.occurredAt,
    }),
  ]);
}
