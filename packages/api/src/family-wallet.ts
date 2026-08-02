import {
  getDatabase,
  guardianships,
  organizationWallets,
  organizations,
  people,
} from "@duna/db";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { ensureLedgerAccount } from "./catalog-service";
import type { ApiActor } from "./context";

export class FamilyWalletError extends Error {
  constructor(
    readonly code:
      | "DATABASE_REQUIRED"
      | "ADULT_REQUIRED"
      | "DEPENDENT_NOT_FOUND"
      | "VERIFIED_GUARDIAN_REQUIRED"
      | "WALLET_UNAVAILABLE"
      | "INSUFFICIENT_CREDITS"
      | "TRANSFER_CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "FamilyWalletError";
  }
}

function requireDatabase(): void {
  if (!process.env.DATABASE_URL) {
    throw new FamilyWalletError(
      "DATABASE_REQUIRED",
      "Family wallets require the connected Duna database.",
    );
  }
}

export async function loadFamilyWallets(actor: ApiActor) {
  requireDatabase();
  const database = getDatabase();
  const relationships = await database
    .select({
      dependentId: guardianships.minorId,
      dependentName: people.displayName,
      verified: guardianships.verified,
      reviewStatus: guardianships.reviewStatus,
      canApproveSpending: guardianships.canApproveSpending,
    })
    .from(guardianships)
    .innerJoin(people, eq(guardianships.minorId, people.id))
    .where(eq(guardianships.guardianId, actor.personId))
    .orderBy(asc(people.displayName));
  if (relationships.length === 0) return [];

  const dependentIds = relationships.map((row) => row.dependentId);
  const walletRows = await database
    .select({
      personId: organizationWallets.personId,
      organizationId: organizationWallets.organizationId,
      organizationName: organizations.name,
      organizationSlug: organizations.slug,
      credits: organizationWallets.cachedAvailableCredits,
      status: organizationWallets.status,
    })
    .from(organizationWallets)
    .innerJoin(
      organizations,
      eq(organizationWallets.organizationId, organizations.id),
    )
    .where(
      inArray(organizationWallets.personId, [actor.personId, ...dependentIds]),
    )
    .orderBy(asc(organizations.name));
  const guardianWalletByOrganization = new Map(
    walletRows
      .filter((row) => row.personId === actor.personId)
      .map((row) => [row.organizationId, row] as const),
  );
  const dependentWalletByKey = new Map(
    walletRows
      .filter((row) => row.personId !== actor.personId)
      .map((row) => [`${row.personId}:${row.organizationId}`, row] as const),
  );
  return relationships.flatMap((relationship) =>
    [...guardianWalletByOrganization.values()].map((guardianWallet) => {
      const dependentWallet = dependentWalletByKey.get(
        `${relationship.dependentId}:${guardianWallet.organizationId}`,
      );
      return {
        dependentPersonId: relationship.dependentId,
        dependentName: relationship.dependentName,
        organizationId: guardianWallet.organizationId,
        organizationName: guardianWallet.organizationName,
        organizationSlug: guardianWallet.organizationSlug,
        guardianCredits: guardianWallet.credits,
        dependentCredits: dependentWallet?.credits ?? 0,
        fundingEnabled:
          relationship.verified &&
          relationship.reviewStatus === "verified" &&
          relationship.canApproveSpending &&
          guardianWallet.status === "active",
        relationshipStatus:
          relationship.reviewStatus === "verified"
            ? ("verified" as const)
            : relationship.reviewStatus === "rejected"
              ? ("rejected" as const)
              : ("pending" as const),
      };
    }),
  );
}

export async function transferFamilyCredits(input: {
  readonly actor: ApiActor;
  readonly dependentPersonId: string;
  readonly organizationId: string;
  readonly credits: number;
  readonly idempotencyKey: string;
  readonly requestId: string;
  readonly now: Date;
}) {
  requireDatabase();
  if (input.actor.ageBand !== "adult") {
    throw new FamilyWalletError(
      "ADULT_REQUIRED",
      "Only an adult parent or guardian can fund a child wallet.",
    );
  }
  const database = getDatabase();
  const relationship = await database.query.guardianships.findFirst({
    where: and(
      eq(guardianships.guardianId, input.actor.personId),
      eq(guardianships.minorId, input.dependentPersonId),
    ),
  });
  if (!relationship) {
    throw new FamilyWalletError(
      "DEPENDENT_NOT_FOUND",
      "This child is not connected to your household.",
    );
  }
  if (
    !relationship.verified ||
    relationship.reviewStatus !== "verified" ||
    !relationship.canApproveSpending
  ) {
    throw new FamilyWalletError(
      "VERIFIED_GUARDIAN_REQUIRED",
      "Guardian review must be complete before funding this child wallet.",
    );
  }
  const unit = `${input.organizationId}:CREDIT`;
  const childAccountId = await ensureLedgerAccount({
    organizationId: input.organizationId,
    ownerPersonId: input.dependentPersonId,
    code: `MEMBER_CREDITS_${input.dependentPersonId}`,
    name: "Member credit wallet",
    accountType: "liability",
    normalSide: "credit",
    unitKind: "organization-credit",
    unit,
  });
  await database
    .insert(organizationWallets)
    .values({
      organizationId: input.organizationId,
      personId: input.dependentPersonId,
      creditLedgerAccountId: childAccountId,
      unit,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .onConflictDoNothing();

  try {
    const result = await database.execute(sql`
      SELECT *
      FROM duna_transfer_family_credits(
        ${input.organizationId}::uuid,
        ${input.actor.personId}::uuid,
        ${input.dependentPersonId}::uuid,
        ${input.credits}::integer,
        ${input.idempotencyKey}::text,
        ${input.requestId}::text,
        ${input.now}::timestamptz
      )
    `);
    const row = result.rows[0] as
      | {
          transfer_id?: string;
          journal_id?: string;
          result_status?: string;
        }
      | undefined;
    if (
      !row?.transfer_id ||
      !row.journal_id ||
      row.result_status !== "posted"
    ) {
      throw new Error("Family credit transfer returned an invalid result.");
    }
    return {
      transferId: row.transfer_id,
      journalId: row.journal_id,
      status: "posted" as const,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("family_credit_balance_insufficient")) {
      throw new FamilyWalletError(
        "INSUFFICIENT_CREDITS",
        "There are not enough available credits in your wallet.",
      );
    }
    if (message.includes("verified_guardian_required")) {
      throw new FamilyWalletError(
        "VERIFIED_GUARDIAN_REQUIRED",
        "Guardian review must be complete before funding this child wallet.",
      );
    }
    if (message.includes("family_credit_transfer_conflict")) {
      throw new FamilyWalletError(
        "TRANSFER_CONFLICT",
        "This transfer key was already used for a different request.",
      );
    }
    if (
      message.includes("family_credit_wallet_unavailable") ||
      message.includes("family_credit_balance_changed")
    ) {
      throw new FamilyWalletError(
        "WALLET_UNAVAILABLE",
        "The wallet changed while funding. Refresh and try again.",
      );
    }
    throw error;
  }
}
