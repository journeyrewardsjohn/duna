import {
  appliedFees,
  auditLog,
  calendarBusyBlocks,
  calendarConnections,
  catalogEntitlements,
  catalogFulfillments,
  catalogItems,
  catalogItemVersions,
  catalogPrices,
  catalogSessionOccurrences,
  catalogVariants,
  getDatabase,
  inventoryMovements,
  inventoryReservations,
  inventoryStockItems,
  ledgerEntries,
  ledgerJournals,
  membershipTiers,
  memberships,
  membershipPolicyAcceptances,
  orderItems,
  orders,
  orderTaxContexts,
  payments,
  organizationCreditGrants,
  organizationParticipants,
  organizationStaffProfiles,
  organizationWallets,
  organizations,
  people,
  trainingDrillLicenses,
  venues,
} from "@duna/db";
import {
  allocateOrganizationCredits,
  assertBalancedJournal,
  membershipEntitlementMultiplier,
  membershipSubscriptionDisclosure,
  membershipSubscriptionPolicy,
  validateMembershipSubscriptionPolicy,
  type LedgerPosting,
} from "@duna/core";
import {
  calculateOrganizationCommissionFee,
  calculateOperatorProcessingFee,
  priceConsumerOrder,
  type CurrencyCode,
  type OrderItemKind,
} from "@duna/pricing";
import { and, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { stableHash } from "./canonical";
import {
  ensureLedgerAccount,
  issueOrganizationCredits,
} from "./catalog-service";
import type { ApiActor } from "./context";
import { hasActiveDunaPlusMembership } from "./membership";
import {
  createInstallmentPaymentSchedule,
  loadCustomerPaymentSchedule,
} from "./payment-schedules";
import { resolveOrganizationCommissionPolicy } from "./organization-billing";
import {
  createCatalogCheckoutSession,
  createCatalogNativePayment,
  createMobilePaymentCustomerSession,
  getOrCreatePlayerStripeCustomer,
  getStripePublishableKey,
} from "./payments";
import {
  createPromoCheckoutCoupon,
  quotePromoCode,
  redeemPromoCodeForOrder,
  releasePromoCodeForOrder,
  reservePromoRedemption,
} from "./promo-codes";
import { queueVirtualSessionDelivery } from "./virtual-session-service";
import {
  generateBookableSessionOccurrences,
  parseSessionDeliveryConfiguration,
} from "./session-delivery";
import {
  MARKETPLACE_TAX_POLICY_VERSION,
  resolveCatalogTaxCode,
} from "./tax-policy";

async function resolveAvailableOccurrenceCoaches(input: {
  readonly organizationId: string;
  readonly itemConfiguration: Readonly<Record<string, unknown>>;
  readonly startsAt: Date;
  readonly now: Date;
}): Promise<readonly string[]> {
  const configuration = parseSessionDeliveryConfiguration(
    input.itemConfiguration,
  );
  if (!configuration?.sessionSchedule) return [];
  const database = getDatabase();
  const [staff, busy] = await Promise.all([
    database
      .select({
        personId: organizationStaffProfiles.personId,
        displayName: people.displayName,
        email: people.email,
        availability: organizationStaffProfiles.availability,
      })
      .from(organizationStaffProfiles)
      .innerJoin(people, eq(organizationStaffProfiles.personId, people.id))
      .where(
        and(
          eq(organizationStaffProfiles.organizationId, input.organizationId),
          eq(organizationStaffProfiles.staffRole, "coach"),
          eq(organizationStaffProfiles.active, true),
        ),
      ),
    database
      .select({
        personId: calendarConnections.personId,
        startsAt: calendarBusyBlocks.startsAt,
        endsAt: calendarBusyBlocks.endsAt,
      })
      .from(calendarBusyBlocks)
      .innerJoin(
        calendarConnections,
        eq(calendarBusyBlocks.calendarConnectionId, calendarConnections.id),
      )
      .where(
        and(
          eq(calendarBusyBlocks.organizationId, input.organizationId),
          eq(calendarBusyBlocks.transparency, "busy"),
          eq(calendarConnections.status, "active"),
          gt(calendarBusyBlocks.endsAt, input.now),
        ),
      )
      .limit(10_000),
  ]);
  const assignedCoachIds =
    configuration.coachAssignmentMode === "selected" &&
    configuration.coachPersonIds.length > 0
      ? configuration.coachPersonIds
      : staff.map((coach) => coach.personId);
  const occurrences = generateBookableSessionOccurrences({
    configuration,
    coaches: staff
      .filter((coach) => assignedCoachIds.includes(coach.personId))
      .map((coach) => ({
        ...coach,
        email: coach.email ?? undefined,
        busyRanges: busy
          .filter((range) => range.personId === coach.personId)
          .map((range) => ({
            startsAt: range.startsAt.toISOString(),
            endsAt: range.endsAt.toISOString(),
          })),
      })),
    now: input.now,
    horizonDays: 730,
    limit: 2_000,
  });
  return (
    occurrences
      .find((candidate) => candidate.startsAt === input.startsAt.toISOString())
      ?.availableCoaches.slice(0, configuration.requiredCoachCount)
      .map((coach) => coach.personId) ?? []
  );
}

export class CatalogCheckoutError extends Error {
  constructor(
    readonly code:
      | "CATALOG_ITEM_NOT_FOUND"
      | "CATALOG_ITEM_UNAVAILABLE"
      | "MEMBERSHIP_REQUIRED"
      | "PRICE_UNAVAILABLE"
      | "INSUFFICIENT_CREDITS"
      | "INVENTORY_UNAVAILABLE"
      | "CHECKOUT_UNAVAILABLE",
    message: string,
  ) {
    super(message);
    this.name = "CatalogCheckoutError";
  }
}

export interface CatalogCheckoutResult {
  readonly mode:
    | "stripe"
    | "organization-credit"
    | "cash-reservation"
    | "free"
    | "unavailable";
  readonly orderId: string;
  readonly orderStatus: "pending" | "paid";
  readonly checkoutSessionId?: string;
  readonly checkoutUrl?: string;
  readonly paymentSheet?: {
    readonly publishableKey: string;
    readonly paymentIntentId: string;
    readonly paymentIntentClientSecret: string;
    readonly customerId: string;
    readonly customerSessionClientSecret: string;
  };
  readonly expiresAt?: string;
  readonly paymentMethod: "card" | "credit" | "cash";
  readonly paymentOption?: "upfront" | "installments";
  readonly quantity: number;
  readonly amountMinor: number;
  readonly creditsApplied: number;
  readonly currency: CurrencyCode;
}

export interface CatalogCheckoutStatus {
  readonly orderId: string;
  readonly orderStatus:
    | "draft"
    | "pending"
    | "paid"
    | "partially-refunded"
    | "refunded"
    | "failed"
    | "disputed"
    | "cancelled";
  readonly fulfillmentStatus?:
    "held" | "pending" | "ready" | "fulfilled" | "cancelled" | "refunded";
  readonly complete: boolean;
  readonly paymentSchedule?: Awaited<
    ReturnType<typeof loadCustomerPaymentSchedule>
  >;
}

function currency(value: string): CurrencyCode {
  if (
    value !== "USD" &&
    value !== "CAD" &&
    value !== "AUD" &&
    value !== "BRL" &&
    value !== "EUR"
  ) {
    throw new CatalogCheckoutError(
      "PRICE_UNAVAILABLE",
      "This organization currency is not supported.",
    );
  }
  return value;
}

export function catalogOrderItemKind(input: {
  readonly type: "event" | "service" | "good" | "plan";
  readonly subtype: string;
}): OrderItemKind {
  if (input.type === "event") return "registration";
  if (input.type === "service") return "booking";
  if (input.type === "good") return "merchandise";
  return input.subtype === "membership" ? "membership" : "package";
}

export function calculateCatalogInstallmentQuote(input: {
  readonly upfrontAmountMinor: number;
  readonly installmentCount: number;
  readonly priceIncreasePercent: number;
}): {
  readonly installmentAmountMinor: number;
  readonly totalAmountMinor: number;
  readonly savingsAmountMinor: number;
} {
  if (
    !Number.isSafeInteger(input.upfrontAmountMinor) ||
    input.upfrontAmountMinor < 1
  ) {
    throw new Error("Upfront amount must be a positive minor-unit amount");
  }
  if (
    !Number.isSafeInteger(input.installmentCount) ||
    input.installmentCount < 2 ||
    input.installmentCount > 24
  ) {
    throw new Error("Installment count must be between 2 and 24");
  }
  if (
    !Number.isFinite(input.priceIncreasePercent) ||
    input.priceIncreasePercent < 0 ||
    input.priceIncreasePercent > 100
  ) {
    throw new Error("Installment price increase must be between 0 and 100");
  }
  const upliftedAmountMinor = Math.round(
    input.upfrontAmountMinor * (1 + input.priceIncreasePercent / 100),
  );
  const installmentAmountMinor = Math.ceil(
    upliftedAmountMinor / input.installmentCount,
  );
  const totalAmountMinor = installmentAmountMinor * input.installmentCount;
  return {
    installmentAmountMinor,
    totalAmountMinor,
    savingsAmountMinor: totalAmountMinor - input.upfrontAmountMinor,
  };
}

function fulfillmentKind(
  item: typeof catalogItems.$inferSelect,
):
  | "registration"
  | "appointment"
  | "pickup"
  | "rental"
  | "digital-content"
  | "membership"
  | "credit-grant"
  | "package" {
  if (item.type === "event") return "registration";
  if (item.type === "service") return "appointment";
  if (item.type === "good") {
    if (item.subtype === "digital-content") return "digital-content";
    return item.subtype === "rental" ? "rental" : "pickup";
  }
  if (item.subtype === "credit-pack") return "credit-grant";
  return item.subtype === "bundle" ? "package" : "membership";
}

async function hasOrganizationMembership(
  personId: string,
  organizationId: string,
): Promise<boolean> {
  const database = getDatabase();
  const [subscription, relationship] = await Promise.all([
    database
      .select({ id: memberships.id })
      .from(memberships)
      .innerJoin(membershipTiers, eq(memberships.tierId, membershipTiers.id))
      .where(
        and(
          eq(memberships.personId, personId),
          eq(membershipTiers.organizationId, organizationId),
          inArray(memberships.status, ["active", "trialing"]),
        ),
      )
      .limit(1),
    database.query.organizationParticipants.findFirst({
      where: and(
        eq(organizationParticipants.organizationId, organizationId),
        eq(organizationParticipants.personId, personId),
        eq(organizationParticipants.relationship, "member"),
        eq(organizationParticipants.status, "active"),
      ),
    }),
  ]);
  return Boolean(subscription[0] || relationship);
}

async function membershipIncludedOffer(input: {
  readonly personId: string;
  readonly organizationId: string;
  readonly targetCatalogItemId: string;
  readonly now: Date;
}): Promise<
  | {
      readonly planCatalogItemId: string;
      readonly membershipId: string;
      readonly remainingBookings?: number;
    }
  | undefined
> {
  const database = getDatabase();
  const activeMembership = await database
    .select({
      membership: memberships,
      tier: membershipTiers,
      planCatalogItemId: catalogPrices.catalogItemId,
    })
    .from(memberships)
    .innerJoin(membershipTiers, eq(memberships.tierId, membershipTiers.id))
    .innerJoin(
      catalogPrices,
      eq(membershipTiers.stripePriceId, catalogPrices.stripePriceId),
    )
    .where(
      and(
        eq(memberships.personId, input.personId),
        eq(membershipTiers.organizationId, input.organizationId),
        inArray(memberships.status, ["active", "trialing"]),
      ),
    )
    .limit(1)
    .then((rows) => rows[0]);
  if (!activeMembership) return undefined;
  if (
    activeMembership.membership.currentPeriodEndsAt &&
    activeMembership.membership.currentPeriodEndsAt <= input.now
  ) {
    return undefined;
  }
  const includedItems = await database
    .select({
      targetCatalogItemId: catalogEntitlements.targetCatalogItemId,
    })
    .from(catalogEntitlements)
    .where(
      and(
        eq(
          catalogEntitlements.planCatalogItemId,
          activeMembership.planCatalogItemId,
        ),
        eq(catalogEntitlements.kind, "included-item"),
      ),
    );
  const includedItemIds = includedItems
    .map((entry) => entry.targetCatalogItemId)
    .filter((id): id is string => Boolean(id));
  if (!includedItemIds.includes(input.targetCatalogItemId)) return undefined;
  const accessLimit = await database.query.catalogEntitlements.findFirst({
    where: and(
      eq(
        catalogEntitlements.planCatalogItemId,
        activeMembership.planCatalogItemId,
      ),
      eq(catalogEntitlements.kind, "membership-access"),
    ),
  });
  if (!accessLimit?.quantity) {
    return {
      planCatalogItemId: activeMembership.planCatalogItemId,
      membershipId: activeMembership.membership.id,
    };
  }
  const cycleStart =
    activeMembership.membership.currentPeriodStartsAt ??
    activeMembership.membership.createdAt;
  const countResult = await database
    .select({ count: sql<number>`count(*)::integer` })
    .from(catalogFulfillments)
    .where(
      and(
        eq(catalogFulfillments.organizationId, input.organizationId),
        eq(catalogFulfillments.personId, input.personId),
        inArray(catalogFulfillments.catalogItemId, includedItemIds),
        inArray(catalogFulfillments.status, [
          "held",
          "pending",
          "ready",
          "fulfilled",
        ]),
        sql`${catalogFulfillments.createdAt} >= ${cycleStart}`,
      ),
    );
  const cycleBookingAllowance =
    accessLimit.quantity *
    membershipEntitlementMultiplier(activeMembership.tier.interval, 1);
  const remainingBookings =
    cycleBookingAllowance - (countResult[0]?.count ?? 0);
  if (remainingBookings <= 0) return undefined;
  return {
    planCatalogItemId: activeMembership.planCatalogItemId,
    membershipId: activeMembership.membership.id,
    remainingBookings,
  };
}

export async function getCatalogOfferEligibility(input: {
  readonly actor: ApiActor;
  readonly catalogItemId: string;
  readonly now: Date;
}): Promise<{
  readonly isMember: boolean;
  readonly included: boolean;
  readonly remainingBookings?: number;
}> {
  if (!process.env.DATABASE_URL) {
    return { isMember: false, included: false };
  }
  const item = await getDatabase().query.catalogItems.findFirst({
    where: eq(catalogItems.id, input.catalogItemId),
  });
  if (!item) {
    throw new CatalogCheckoutError(
      "CATALOG_ITEM_NOT_FOUND",
      "This product was not found.",
    );
  }
  const isMember = await hasOrganizationMembership(
    input.actor.personId,
    item.organizationId,
  );
  if (!isMember) return { isMember: false, included: false };
  const inclusion = await membershipIncludedOffer({
    personId: input.actor.personId,
    organizationId: item.organizationId,
    targetCatalogItemId: item.id,
    now: input.now,
  });
  return {
    isMember: true,
    included: Boolean(inclusion),
    remainingBookings: inclusion?.remainingBookings,
  };
}

async function holdSaleInventory(input: {
  readonly organizationId: string;
  readonly catalogVariantId: string;
  readonly orderId: string;
  readonly purpose: "sale" | "rental";
  readonly quantity: number;
  readonly now: Date;
  readonly expiresAt: Date;
}): Promise<void> {
  try {
    await getDatabase().execute(sql`
      SELECT duna_reserve_catalog_inventory(
        ${input.organizationId}::uuid,
        ${input.catalogVariantId}::uuid,
        ${input.orderId}::uuid,
        ${input.purpose}::text,
        ${input.quantity}::integer,
        ${input.now}::timestamptz,
        ${input.expiresAt}::timestamptz
      )
    `);
  } catch {
    throw new CatalogCheckoutError(
      "INVENTORY_UNAVAILABLE",
      "The requested quantity is no longer available.",
    );
  }
}

export async function releaseCatalogOrderInventory(
  organizationId: string,
  orderId: string,
  now: Date,
): Promise<void> {
  const database = getDatabase();
  const reservations = await database
    .select()
    .from(inventoryReservations)
    .where(
      and(
        eq(inventoryReservations.organizationId, organizationId),
        eq(inventoryReservations.sourceType, "catalog-order"),
        eq(inventoryReservations.sourceId, orderId),
        eq(inventoryReservations.status, "held"),
      ),
    );
  if (reservations.length === 0) return;
  for (const reservation of reservations) {
    await database
      .update(inventoryStockItems)
      .set({
        quantityReserved: sql`greatest(0, ${inventoryStockItems.quantityReserved} - ${reservation.quantity})`,
        updatedAt: now,
      })
      .where(eq(inventoryStockItems.id, reservation.inventoryStockItemId));
  }
  await database
    .update(inventoryReservations)
    .set({ status: "released", heldUntil: null, updatedAt: now })
    .where(
      and(
        eq(inventoryReservations.organizationId, organizationId),
        eq(inventoryReservations.sourceType, "catalog-order"),
        eq(inventoryReservations.sourceId, orderId),
        eq(inventoryReservations.status, "held"),
      ),
    );
}

async function versionForCatalogCheckout(input: {
  readonly item: typeof catalogItems.$inferSelect;
  readonly variant: typeof catalogVariants.$inferSelect;
  readonly price: typeof catalogPrices.$inferSelect;
  readonly now: Date;
}): Promise<string> {
  if (input.item.currentVersionId) return input.item.currentVersionId;
  const database = getDatabase();
  const id = crypto.randomUUID();
  // A one-time compatibility snapshot for catalog rows created before product
  // versioning. New edits and creations create richer revisions at save time.
  await database.batch([
    database.insert(catalogItemVersions).values({
      id,
      organizationId: input.item.organizationId,
      catalogItemId: input.item.id,
      version: 1,
      snapshot: {
        item: input.item,
        variants: [input.variant],
        prices: [input.price],
        migration: "checkout-backfill",
      },
      createdAt: input.now,
    }),
    database
      .update(catalogItems)
      .set({ currentVersionId: id, updatedAt: input.now })
      .where(
        and(
          eq(catalogItems.id, input.item.id),
          isNull(catalogItems.currentVersionId),
        ),
      ),
  ]);
  return id;
}

export async function startCatalogCheckout(input: {
  readonly actor: ApiActor;
  readonly catalogItemId: string;
  readonly catalogVariantId: string;
  readonly catalogPriceId?: string;
  readonly paymentMethod: "card" | "credit" | "cash";
  readonly paymentOption?: "upfront" | "installments";
  readonly paymentSurface?: "hosted" | "native";
  readonly promoCode?: string;
  readonly quantity: number;
  readonly catalogSessionOccurrenceId?: string;
  readonly recordingConsentAccepted?: boolean;
  readonly successUrl: string;
  readonly cancelUrl: string;
  readonly idempotencyKey: string;
  readonly membershipPolicyAccepted?: boolean;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<CatalogCheckoutResult> {
  if (!process.env.DATABASE_URL) {
    throw new CatalogCheckoutError(
      "CHECKOUT_UNAVAILABLE",
      "Catalog checkout requires the connected Duna database.",
    );
  }
  const database = getDatabase();
  const row = await database
    .select({
      item: catalogItems,
      variant: catalogVariants,
      organization: organizations,
    })
    .from(catalogItems)
    .innerJoin(
      catalogVariants,
      eq(catalogVariants.catalogItemId, catalogItems.id),
    )
    .innerJoin(organizations, eq(catalogItems.organizationId, organizations.id))
    .where(
      and(
        eq(catalogItems.id, input.catalogItemId),
        eq(catalogVariants.id, input.catalogVariantId),
      ),
    )
    .limit(1)
    .then((rows) => rows[0]);
  if (!row) {
    throw new CatalogCheckoutError(
      "CATALOG_ITEM_NOT_FOUND",
      "This product was not found.",
    );
  }
  if (
    row.item.status !== "active" ||
    row.variant.status !== "active" ||
    row.item.visibility === "private"
  ) {
    throw new CatalogCheckoutError(
      "CATALOG_ITEM_UNAVAILABLE",
      "This product is not available for checkout.",
    );
  }
  if (row.item.type === "good" && row.item.subtype === "digital-content") {
    if (!input.actor.organizationId) {
      throw new CatalogCheckoutError(
        "CATALOG_ITEM_UNAVAILABLE",
        "Choose an organization before purchasing this drill.",
      );
    }
    if (input.actor.organizationId === row.organization.id) {
      throw new CatalogCheckoutError(
        "CATALOG_ITEM_UNAVAILABLE",
        "Your organization already owns this drill.",
      );
    }
  }
  if (
    !Number.isSafeInteger(input.quantity) ||
    input.quantity < 1 ||
    input.quantity > 50
  ) {
    throw new CatalogCheckoutError(
      "CATALOG_ITEM_UNAVAILABLE",
      "Choose a quantity from 1 to 50.",
    );
  }
  if (row.item.type === "plan" && input.quantity !== 1) {
    throw new CatalogCheckoutError(
      "CATALOG_ITEM_UNAVAILABLE",
      "Plans must be purchased one at a time.",
    );
  }
  const scheduleConfiguration =
    row.item.configuration.sessionSchedule &&
    typeof row.item.configuration.sessionSchedule === "object" &&
    !Array.isArray(row.item.configuration.sessionSchedule)
      ? (row.item.configuration.sessionSchedule as Readonly<
          Record<string, unknown>
        >)
      : undefined;
  const fixedSession =
    row.item.type === "service" &&
    (scheduleConfiguration?.mode === "one-off" ||
      scheduleConfiguration?.mode === "recurring");
  const virtualDeliveryConfiguration =
    row.item.configuration.virtualDelivery &&
    typeof row.item.configuration.virtualDelivery === "object" &&
    !Array.isArray(row.item.configuration.virtualDelivery)
      ? (row.item.configuration.virtualDelivery as Readonly<
          Record<string, unknown>
        >)
      : undefined;
  const recordingConsentRequired =
    row.item.type === "service" &&
    row.item.configuration.deliveryMode === "online" &&
    (virtualDeliveryConfiguration?.autoRecord === true ||
      virtualDeliveryConfiguration?.autoTranscribe === true);
  if (recordingConsentRequired && !input.recordingConsentAccepted) {
    throw new CatalogCheckoutError(
      "CHECKOUT_UNAVAILABLE",
      "Acknowledge the recording and transcript notice before purchasing this virtual session.",
    );
  }
  let occurrence = input.catalogSessionOccurrenceId
    ? await database.query.catalogSessionOccurrences.findFirst({
        where: and(
          eq(catalogSessionOccurrences.id, input.catalogSessionOccurrenceId),
          eq(catalogSessionOccurrences.catalogItemId, row.item.id),
          eq(catalogSessionOccurrences.organizationId, row.organization.id),
          eq(catalogSessionOccurrences.status, "scheduled"),
          gt(catalogSessionOccurrences.startsAt, input.now),
        ),
      })
    : undefined;
  if (fixedSession && !occurrence) {
    throw new CatalogCheckoutError(
      "CATALOG_ITEM_UNAVAILABLE",
      "Choose an upcoming session that still has coach availability.",
    );
  }
  if (occurrence) {
    const existing = await database
      .select({ details: catalogFulfillments.details })
      .from(catalogFulfillments)
      .where(
        and(
          eq(catalogFulfillments.catalogSessionOccurrenceId, occurrence.id),
          inArray(catalogFulfillments.status, [
            "held",
            "pending",
            "ready",
            "fulfilled",
          ]),
        ),
      );
    const reserved = existing.reduce((total, entry) => {
      const quantity = Number(entry.details.quantity ?? 1);
      return (
        total + (Number.isSafeInteger(quantity) && quantity > 0 ? quantity : 1)
      );
    }, 0);
    if (reserved + input.quantity > occurrence.capacity) {
      throw new CatalogCheckoutError(
        "CATALOG_ITEM_UNAVAILABLE",
        "That session no longer has enough open places.",
      );
    }
    if (reserved === 0) {
      const coachPersonIds = [
        ...(await resolveAvailableOccurrenceCoaches({
          organizationId: row.organization.id,
          itemConfiguration: row.item.configuration,
          startsAt: occurrence.startsAt,
          now: input.now,
        })),
      ];
      if (coachPersonIds.length === 0) {
        throw new CatalogCheckoutError(
          "CATALOG_ITEM_UNAVAILABLE",
          "That session no longer overlaps an assigned coach's availability.",
        );
      }
      await database
        .update(catalogSessionOccurrences)
        .set({ coachPersonIds, updatedAt: input.now })
        .where(eq(catalogSessionOccurrences.id, occurrence.id));
      occurrence = { ...occurrence, coachPersonIds, updatedAt: input.now };
    }
  }
  // Participation waivers are intentionally collected after a successful
  // purchase. They protect participation, never the ability to pay.
  const isMember = await hasOrganizationMembership(
    input.actor.personId,
    row.organization.id,
  );
  const membershipInclusion = isMember
    ? await membershipIncludedOffer({
        personId: input.actor.personId,
        organizationId: row.organization.id,
        targetCatalogItemId: row.item.id,
        now: input.now,
      })
    : undefined;
  if (
    (row.item.membershipRequired || row.item.visibility === "members") &&
    !isMember
  ) {
    throw new CatalogCheckoutError(
      "MEMBERSHIP_REQUIRED",
      "An active organization membership is required.",
    );
  }
  const prices = await database
    .select()
    .from(catalogPrices)
    .where(
      and(
        eq(catalogPrices.catalogVariantId, row.variant.id),
        input.catalogPriceId
          ? eq(catalogPrices.id, input.catalogPriceId)
          : undefined,
        eq(catalogPrices.paymentKind, input.paymentMethod),
        eq(catalogPrices.active, true),
        inArray(catalogPrices.audience, [
          "everyone",
          isMember ? "member" : "non-member",
        ]),
      ),
    )
    .orderBy(
      sql`case when ${catalogPrices.audience} = ${isMember ? "member" : "non-member"} then 0 else 1 end`,
    )
    .limit(1);
  const price = prices[0];
  if (!price) {
    throw new CatalogCheckoutError(
      "PRICE_UNAVAILABLE",
      `This product does not accept ${
        input.paymentMethod === "credit"
          ? "organization credits"
          : input.paymentMethod === "cash"
            ? "pay-in-person reservations"
            : "card payment"
      }.`,
    );
  }
  const paymentPlanConfiguration =
    row.item.configuration.paymentPlan &&
    typeof row.item.configuration.paymentPlan === "object" &&
    !Array.isArray(row.item.configuration.paymentPlan)
      ? (row.item.configuration.paymentPlan as Readonly<
          Record<string, unknown>
        >)
      : undefined;
  const installmentCount =
    typeof paymentPlanConfiguration?.installmentCount === "number"
      ? Math.trunc(paymentPlanConfiguration.installmentCount)
      : 0;
  const priceIncreasePercent =
    typeof paymentPlanConfiguration?.priceIncreasePercent === "number"
      ? Math.min(
          100,
          Math.max(0, paymentPlanConfiguration.priceIncreasePercent),
        )
      : 0;
  const installmentsRequested = input.paymentOption === "installments";
  if (
    installmentsRequested &&
    (paymentPlanConfiguration?.enabled !== true ||
      installmentCount < 2 ||
      installmentCount > 24 ||
      input.paymentMethod !== "card" ||
      input.quantity !== 1 ||
      price.recurringInterval)
  ) {
    throw new CatalogCheckoutError(
      "PRICE_UNAVAILABLE",
      "This offer is not eligible for the selected installment plan.",
    );
  }
  const isMembershipPlan =
    row.item.type === "plan" && row.item.subtype === "membership";
  const subscriptionPolicy = isMembershipPlan
    ? membershipSubscriptionPolicy(row.item.configuration)
    : undefined;
  if (isMembershipPlan && !input.membershipPolicyAccepted) {
    throw new CatalogCheckoutError(
      "CHECKOUT_UNAVAILABLE",
      "Review and accept the membership renewal and cancellation terms before continuing.",
    );
  }
  if (
    subscriptionPolicy &&
    (price.recurringInterval === "month" || price.recurringInterval === "year")
  ) {
    validateMembershipSubscriptionPolicy({
      policy: subscriptionPolicy,
      billingInterval: price.recurringInterval,
      billingIntervalCount: price.recurringIntervalCount ?? undefined,
    });
  }
  const orderCurrency = currency(row.organization.currency);
  const baseUnitAmountMinor = price.amountMinor ?? 0;
  const installmentQuote = installmentsRequested
    ? calculateCatalogInstallmentQuote({
        upfrontAmountMinor: baseUnitAmountMinor,
        installmentCount,
        priceIncreasePercent,
      })
    : undefined;
  const installmentAmountMinor = installmentQuote?.installmentAmountMinor ?? 0;
  const checkoutUnitAmountMinor = installmentsRequested
    ? (installmentQuote?.totalAmountMinor ?? baseUnitAmountMinor)
    : baseUnitAmountMinor;
  const amountMinor = membershipInclusion
    ? 0
    : checkoutUnitAmountMinor * input.quantity;
  const creditsApplied = membershipInclusion
    ? 0
    : (price.creditAmount ?? 0) * input.quantity;
  if (
    input.paymentMethod === "card" &&
    (!row.item.allowCard || !price.stripePriceId)
  ) {
    throw new CatalogCheckoutError(
      "PRICE_UNAVAILABLE",
      "Card checkout has not been provisioned for this product.",
    );
  }
  if (input.paymentMethod === "credit" && !row.item.allowCredits) {
    throw new CatalogCheckoutError(
      "PRICE_UNAVAILABLE",
      "This product does not accept organization credits.",
    );
  }
  if (input.paymentMethod === "cash" && !row.item.allowCash) {
    throw new CatalogCheckoutError(
      "PRICE_UNAVAILABLE",
      "This product does not accept pay-in-person reservations.",
    );
  }
  if (input.promoCode && input.paymentMethod !== "card") {
    throw new CatalogCheckoutError(
      "PRICE_UNAVAILABLE",
      "Promo codes apply to card purchases.",
    );
  }
  if (input.promoCode && installmentsRequested) {
    throw new CatalogCheckoutError(
      "PRICE_UNAVAILABLE",
      "Choose the upfront payment option to use a promo code.",
    );
  }
  const configuredVenueId =
    typeof row.item.configuration.venueId === "string"
      ? row.item.configuration.venueId
      : undefined;
  const venue = configuredVenueId
    ? await database.query.venues.findFirst({
        where: and(
          eq(venues.id, configuredVenueId),
          eq(venues.organizationId, row.organization.id),
        ),
      })
    : undefined;
  if (
    (row.item.configuration.deliveryMode === "venue" || configuredVenueId) &&
    !venue
  ) {
    throw new CatalogCheckoutError(
      "CATALOG_ITEM_UNAVAILABLE",
      "The venue for this offering is no longer available.",
    );
  }
  const taxLocation = venue ?? row.organization;
  const itemKind = catalogOrderItemKind(row.item);
  const hasDunaPlus =
    input.paymentMethod === "card" &&
    amountMinor > 0 &&
    itemKind !== "merchandise"
      ? await hasActiveDunaPlusMembership(input.actor.personId, input.now)
      : false;
  let promoQuote;
  if (input.promoCode && amountMinor > 0 && !membershipInclusion) {
    try {
      promoQuote = await quotePromoCode({
        organizationId: row.organization.id,
        code: input.promoCode,
        personId: input.actor.personId,
        catalogItemId: row.item.id,
        subtotalMinor: amountMinor,
        currency: orderCurrency,
        now: input.now,
      });
    } catch (error) {
      throw new CatalogCheckoutError(
        "PRICE_UNAVAILABLE",
        error instanceof Error ? error.message : "That promo code is invalid.",
      );
    }
  }
  const chargeableSubtotalMinor = promoQuote?.netSubtotalMinor ?? amountMinor;
  const priced =
    input.paymentMethod === "card"
      ? priceConsumerOrder({
          currency: orderCurrency,
          isDunaPlus: hasDunaPlus,
          items: [
            {
              id: row.variant.id,
              kind: itemKind,
              description: row.item.title,
              quantity: 1,
              unitAmountMinor: chargeableSubtotalMinor,
            },
          ],
        })
      : {
          subtotalMinor: amountMinor,
          fees: [],
          totalMinor: amountMinor,
          currency: orderCurrency,
          dunaPlusSavingsMinor: 0,
        };
  const serviceFeeMinor = priced.fees.reduce(
    (total, fee) => total + fee.amountMinor,
    0,
  );
  const operatorFee =
    input.paymentMethod === "card" && priced.subtotalMinor > 0
      ? calculateOperatorProcessingFee({
          amountMinor: priced.subtotalMinor,
          currency: orderCurrency,
          method: "online-card",
        })
      : undefined;
  const commissionPolicy = resolveOrganizationCommissionPolicy(
    row.organization,
  );
  const organizationCommissionFee =
    input.paymentMethod === "card" && priced.subtotalMinor > 0
      ? calculateOrganizationCommissionFee({
          amountMinor: priced.subtotalMinor,
          currency: orderCurrency,
          rateBps: commissionPolicy.rateBps,
          organizationId: row.organization.id,
          plan: commissionPolicy.effectivePlan,
          source: commissionPolicy.source,
        })
      : undefined;
  const applicationFeeMinor = Math.min(
    priced.totalMinor,
    serviceFeeMinor +
      (operatorFee?.amountMinor ?? 0) +
      (organizationCommissionFee?.amountMinor ?? 0),
  );

  const orderId = crypto.randomUUID();
  const orderItemId = crypto.randomUUID();
  const fulfillmentId = crypto.randomUUID();
  const checkoutExpiresAt = new Date(input.now.getTime() + 30 * 60_000);
  const cashReservationExpiresAt = new Date(
    input.now.getTime() + 24 * 60 * 60_000,
  );
  const reservationExpiresAt =
    input.paymentMethod === "cash"
      ? cashReservationExpiresAt
      : checkoutExpiresAt;
  const catalogItemVersionId = await versionForCatalogCheckout({
    item: row.item,
    variant: row.variant,
    price,
    now: input.now,
  });
  const tracksInventory =
    row.item.type === "good" &&
    row.item.configuration.inventoryTracked !== false;
  const membershipDisclosure =
    subscriptionPolicy &&
    (price.recurringInterval === "month" || price.recurringInterval === "year")
      ? membershipSubscriptionDisclosure({
          organizationName: row.organization.name,
          priceLabel: new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: orderCurrency,
          }).format((price.amountMinor ?? 0) / 100),
          billingInterval: price.recurringInterval,
          policy: subscriptionPolicy,
        })
      : undefined;
  await database.batch([
    row.item.type === "good" && row.item.subtype === "digital-content"
      ? database
          .update(organizationParticipants)
          .set({ updatedAt: input.now })
          .where(sql`false`)
      : database
          .insert(organizationParticipants)
          .values({
            organizationId: row.organization.id,
            personId: input.actor.personId,
            relationship: "player",
            status: "active",
            addedByPersonId: input.actor.personId,
          })
          .onConflictDoNothing(),
    database.insert(orders).values({
      id: orderId,
      organizationId: row.organization.id,
      buyerPersonId: input.actor.personId,
      status: "pending",
      currency: orderCurrency,
      subtotalMinor: priced.subtotalMinor,
      feeTotalMinor: serviceFeeMinor,
      totalMinor: priced.totalMinor,
      idempotencyKey: input.idempotencyKey,
      expiresAt:
        input.paymentMethod === "card" || input.paymentMethod === "cash"
          ? reservationExpiresAt
          : undefined,
    }),
    database.insert(orderItems).values({
      id: orderItemId,
      orderId,
      kind: `catalog-${row.item.type}`,
      referenceId: row.variant.id,
      description: row.item.title,
      quantity: input.quantity,
      unitAmountMinor: checkoutUnitAmountMinor,
      totalAmountMinor: amountMinor,
    }),
    database.insert(catalogFulfillments).values({
      id: fulfillmentId,
      organizationId: row.organization.id,
      orderId,
      orderItemId,
      catalogItemId: row.item.id,
      catalogItemVersionId,
      catalogVariantId: row.variant.id,
      catalogSessionOccurrenceId: occurrence?.id,
      personId: input.actor.personId,
      kind: fulfillmentKind(row.item),
      status: tracksInventory ? "held" : "pending",
      details: {
        paymentMethod: input.paymentMethod,
        creditsApplied,
        quantity: input.quantity,
        applicationFeeMinor,
        consumerServiceFeeMinor: serviceFeeMinor,
        operatorProcessingFeeMinor: operatorFee?.amountMinor ?? 0,
        organizationCommissionMinor:
          organizationCommissionFee?.amountMinor ?? 0,
        organizationCommissionRateBps: commissionPolicy.rateBps,
        organizationCommissionSource: commissionPolicy.source,
        dunaPlusSavingsMinor: priced.dunaPlusSavingsMinor,
        membershipIncluded: Boolean(membershipInclusion),
        membershipId: membershipInclusion?.membershipId,
        membershipPlanCatalogItemId: membershipInclusion?.planCatalogItemId,
        sessionOccurrenceId: occurrence?.id,
        sessionStartsAt: occurrence?.startsAt.toISOString(),
        sessionEndsAt: occurrence?.endsAt.toISOString(),
        sessionTimezone: occurrence?.timezone,
        coachPersonIds: occurrence?.coachPersonIds,
        deliveryMode: row.item.configuration.deliveryMode,
        purchaserOrganizationId: input.actor.organizationId,
        virtualDelivery: row.item.configuration.virtualDelivery,
        recordingConsentAccepted: recordingConsentRequired,
        recordingConsentAcceptedAt: recordingConsentRequired
          ? input.now.toISOString()
          : undefined,
        paymentOption: installmentsRequested ? "installments" : "upfront",
        installmentCount: installmentsRequested ? installmentCount : undefined,
        installmentAmountMinor: installmentsRequested
          ? installmentAmountMinor
          : undefined,
        upfrontPriceMinor: installmentsRequested
          ? baseUnitAmountMinor
          : undefined,
        priceIncreasePercent: installmentsRequested
          ? priceIncreasePercent
          : undefined,
      },
    }),
    database.insert(orderTaxContexts).values({
      orderId,
      organizationId: row.organization.id,
      source:
        row.item.type === "good" && row.item.subtype === "digital-content"
          ? "online"
          : row.item.type === "good"
            ? "shipping"
            : venue
              ? "venue"
              : row.item.configuration.deliveryMode === "online"
                ? "online"
                : "organization",
      venueId: venue?.id,
      addressSnapshot: {
        line1: taxLocation.addressLine1 ?? undefined,
        line2: taxLocation.addressLine2 ?? undefined,
        city: taxLocation.locality ?? undefined,
        region: taxLocation.administrativeArea ?? undefined,
        postalCode: taxLocation.postalCode ?? undefined,
        country: taxLocation.countryCode,
      },
      itemTaxCodes: [
        {
          orderItemId,
          stripeTaxCode: resolveCatalogTaxCode({
            type: row.item.type,
            subtype: row.item.subtype,
            taxable: row.item.taxable,
            explicitTaxCode: row.item.stripeTaxCode ?? undefined,
          }),
        },
      ],
      policyVersion: MARKETPLACE_TAX_POLICY_VERSION,
      currency: orderCurrency,
    }),
    ...(subscriptionPolicy && membershipDisclosure
      ? [
          database.insert(membershipPolicyAcceptances).values({
            acceptanceKey: stableHash({
              orderId,
              personId: input.actor.personId,
              policyVersion: subscriptionPolicy.version,
              disclosure: membershipDisclosure,
            }),
            orderId,
            organizationId: row.organization.id,
            catalogItemId: row.item.id,
            personId: input.actor.personId,
            policyVersion: subscriptionPolicy.version,
            policySnapshot: subscriptionPolicy,
            disclosureText: membershipDisclosure,
            disclosureTextHash: stableHash(membershipDisclosure),
            affirmativeConsent: true,
            ipAddress: input.ipAddress,
            acceptedAt: input.now,
          }),
        ]
      : []),
    ...[
      ...priced.fees,
      ...(operatorFee ? [operatorFee] : []),
      ...(organizationCommissionFee ? [organizationCommissionFee] : []),
    ]
      .filter((fee) => fee.amountMinor > 0)
      .map((fee) =>
        database.insert(appliedFees).values({
          orderId,
          ruleId: fee.id,
          payer: fee.payer,
          amountMinor: fee.amountMinor,
          currency: fee.currency,
          ruleInputs: fee.ruleInputs,
        }),
      ),
  ]);

  if (promoQuote) {
    try {
      await reservePromoRedemption({
        quote: promoQuote,
        organizationId: row.organization.id,
        personId: input.actor.personId,
        orderId,
        currency: orderCurrency,
        now: input.now,
      });
    } catch (error) {
      await releasePromoCodeForOrder(orderId, input.now);
      await database
        .update(orders)
        .set({ status: "cancelled", updatedAt: input.now })
        .where(eq(orders.id, orderId));
      throw new CatalogCheckoutError(
        "PRICE_UNAVAILABLE",
        error instanceof Error ? error.message : "That promo code is invalid.",
      );
    }
  }

  if (tracksInventory) {
    try {
      await holdSaleInventory({
        organizationId: row.organization.id,
        catalogVariantId: row.variant.id,
        orderId,
        purpose: row.item.subtype === "rental" ? "rental" : "sale",
        quantity: input.quantity,
        now: input.now,
        expiresAt: reservationExpiresAt,
      });
    } catch (error) {
      await releasePromoCodeForOrder(orderId, input.now);
      await database
        .update(orders)
        .set({ status: "cancelled", updatedAt: input.now })
        .where(eq(orders.id, orderId));
      throw error;
    }
  }

  if (input.paymentMethod === "credit" && !membershipInclusion) {
    const wallet = await database.query.organizationWallets.findFirst({
      where: and(
        eq(organizationWallets.organizationId, row.organization.id),
        eq(organizationWallets.personId, input.actor.personId),
        eq(organizationWallets.status, "active"),
      ),
    });
    const grants = wallet
      ? await database
          .select()
          .from(organizationCreditGrants)
          .where(
            and(
              eq(organizationCreditGrants.organizationWalletId, wallet.id),
              eq(organizationCreditGrants.status, "active"),
            ),
          )
      : [];
    const allocation = allocateOrganizationCredits({
      credits: creditsApplied,
      grants: grants.map((grant) => ({
        id: grant.id,
        remainingCredits: grant.remainingCredits,
        expiresAt: grant.expiresAt?.toISOString(),
        createdAt: grant.createdAt.toISOString(),
      })),
      now: input.now.toISOString(),
    });
    if (
      !wallet ||
      creditsApplied <= 0 ||
      allocation.remainingUnfundedCredits > 0
    ) {
      await releaseCatalogOrderInventory(
        row.organization.id,
        orderId,
        input.now,
      );
      await database
        .update(orders)
        .set({ status: "cancelled", updatedAt: input.now })
        .where(eq(orders.id, orderId));
      throw new CatalogCheckoutError(
        "INSUFFICIENT_CREDITS",
        `You need ${creditsApplied} ${row.organization.name} credits for this purchase.`,
      );
    }
    const unit = `${row.organization.id}:CREDIT`;
    const revenueCode =
      row.item.type === "event"
        ? "EVENT_REVENUE"
        : row.item.type === "service"
          ? "SERVICE_REVENUE"
          : row.item.type === "good"
            ? "GOODS_REVENUE"
            : "MEMBERSHIP_REVENUE";
    const [
      controlAccountId,
      walletAccountId,
      deferredRevenueAccountId,
      earnedRevenueAccountId,
    ] = await Promise.all([
      ensureLedgerAccount({
        organizationId: row.organization.id,
        code: "CREDIT_REDEMPTION_CONTROL",
        name: "Credit redemption control",
        accountType: "memo",
        normalSide: "credit",
        unitKind: "organization-credit",
        unit,
      }),
      ensureLedgerAccount({
        organizationId: row.organization.id,
        ownerPersonId: input.actor.personId,
        code: `MEMBER_CREDITS_${input.actor.personId}`,
        name: "Member credit wallet",
        accountType: "liability",
        normalSide: "credit",
        unitKind: "organization-credit",
        unit,
      }),
      ensureLedgerAccount({
        organizationId: row.organization.id,
        code: "DEFERRED_CREDIT_REVENUE",
        name: "Deferred organization-credit revenue",
        accountType: "liability",
        normalSide: "credit",
        unitKind: "money",
        unit: orderCurrency,
        currency: orderCurrency,
      }),
      ensureLedgerAccount({
        organizationId: row.organization.id,
        code: revenueCode,
        name: revenueCode
          .toLowerCase()
          .replaceAll("_", " ")
          .replace(/^\w/, (value) => value.toUpperCase()),
        accountType: "revenue",
        normalSide: "credit",
        unitKind: "money",
        unit: orderCurrency,
        currency: orderCurrency,
      }),
    ]);
    const journalId = crypto.randomUUID();
    const moneyJournalId = crypto.randomUUID();
    try {
      await database.execute(sql`
        SELECT duna_redeem_organization_credits(
          ${row.organization.id}::uuid,
          ${input.actor.personId}::uuid,
          ${orderId}::uuid,
          ${creditsApplied}::integer,
          ${walletAccountId}::uuid,
          ${controlAccountId}::uuid,
          ${journalId}::uuid,
          ${deferredRevenueAccountId}::uuid,
          ${earnedRevenueAccountId}::uuid,
          ${moneyJournalId}::uuid,
          ${orderCurrency}::text,
          ${input.requestId}::text,
          ${input.now}::timestamptz
        )
      `);
    } catch (error) {
      await releaseCatalogOrderInventory(
        row.organization.id,
        orderId,
        input.now,
      );
      await database
        .update(orders)
        .set({ status: "cancelled", updatedAt: input.now })
        .where(eq(orders.id, orderId));
      throw new CatalogCheckoutError(
        "INSUFFICIENT_CREDITS",
        error instanceof Error
          ? error.message
          : "Organization credits could not be applied.",
      );
    }
    await fulfillPaidCatalogOrder(orderId, input.now);
    return {
      mode: "organization-credit",
      orderId,
      orderStatus: "paid",
      paymentMethod: "credit",
      quantity: input.quantity,
      amountMinor: 0,
      creditsApplied,
      currency: orderCurrency,
    };
  }

  if (input.paymentMethod === "cash" && amountMinor > 0) {
    return {
      mode: "cash-reservation",
      orderId,
      orderStatus: "pending",
      expiresAt: cashReservationExpiresAt.toISOString(),
      paymentMethod: "cash",
      quantity: input.quantity,
      amountMinor,
      creditsApplied: 0,
      currency: orderCurrency,
    };
  }

  if (amountMinor === 0) {
    await database
      .update(orders)
      .set({ status: "paid", updatedAt: input.now })
      .where(eq(orders.id, orderId));
    await fulfillPaidCatalogOrder(orderId, input.now);
    return {
      mode: "free",
      orderId,
      orderStatus: "paid",
      paymentMethod: input.paymentMethod,
      quantity: input.quantity,
      amountMinor: 0,
      creditsApplied: 0,
      currency: orderCurrency,
    };
  }
  if (priced.totalMinor === 0) {
    await database
      .update(orders)
      .set({ status: "paid", updatedAt: input.now })
      .where(eq(orders.id, orderId));
    await redeemPromoCodeForOrder(orderId, input.now);
    await fulfillPaidCatalogOrder(orderId, input.now);
    return {
      mode: "free",
      orderId,
      orderStatus: "paid",
      paymentMethod: "card",
      quantity: input.quantity,
      amountMinor: 0,
      creditsApplied: 0,
      currency: orderCurrency,
    };
  }
  if (
    !row.organization.stripeAccountId ||
    !row.organization.stripeChargesEnabled
  ) {
    await releaseCatalogOrderInventory(row.organization.id, orderId, input.now);
    await releasePromoCodeForOrder(orderId, input.now);
    await database
      .update(orders)
      .set({ status: "cancelled", updatedAt: input.now })
      .where(eq(orders.id, orderId));
    throw new CatalogCheckoutError(
      "CHECKOUT_UNAVAILABLE",
      "This organization is not ready to accept online payments.",
    );
  }
  const buyer = await database.query.people.findFirst({
    where: eq(people.id, input.actor.personId),
  });
  try {
    const nativePaymentEligible =
      input.paymentSurface === "native" &&
      !promoQuote &&
      !installmentsRequested &&
      !isMembershipPlan &&
      row.item.type !== "good" &&
      !(row.item.taxable && row.organization.stripeTaxEnabled);
    if (nativePaymentEligible) {
      const publishableKey = getStripePublishableKey();
      const customerId = await getOrCreatePlayerStripeCustomer({
        personId: input.actor.personId,
        existingCustomerId: buyer?.stripeCustomerId ?? undefined,
        email: buyer?.email ?? undefined,
        displayName: buyer?.displayName,
      });
      if (buyer?.stripeCustomerId !== customerId) {
        await database
          .update(people)
          .set({ stripeCustomerId: customerId, updatedAt: input.now })
          .where(eq(people.id, input.actor.personId));
      }
      const [paymentIntent, customerSessionClientSecret] = await Promise.all([
        createCatalogNativePayment({
          orderId,
          personId: input.actor.personId,
          customerId,
          customerEmail: buyer?.email ?? undefined,
          organizationId: row.organization.id,
          catalogItemId: row.item.id,
          catalogVariantId: row.variant.id,
          title: row.item.title,
          stripePriceId: price.stripePriceId!,
          quantity: input.quantity,
          subtotalMinor: priced.subtotalMinor,
          serviceFeeMinor,
          currency: orderCurrency,
          applicationFeeMinor,
          organizationCommissionMinor:
            organizationCommissionFee?.amountMinor ?? 0,
          organizationCommissionRateBps: commissionPolicy.rateBps,
          connectedAccountId: row.organization.stripeAccountId,
          recurringInterval:
            price.recurringInterval === "week" ||
            price.recurringInterval === "month" ||
            price.recurringInterval === "year"
              ? price.recurringInterval
              : undefined,
          recurringIntervalCount: price.recurringIntervalCount ?? undefined,
          idempotencyKey: input.idempotencyKey,
        }),
        createMobilePaymentCustomerSession(customerId),
      ]);
      await database
        .update(orders)
        .set({
          stripePaymentIntentId: paymentIntent.id,
          expiresAt: checkoutExpiresAt,
          updatedAt: input.now,
        })
        .where(eq(orders.id, orderId));
      return {
        mode: "stripe",
        orderId,
        orderStatus: "pending",
        paymentSheet: {
          publishableKey,
          paymentIntentId: paymentIntent.id,
          paymentIntentClientSecret: paymentIntent.clientSecret,
          customerId,
          customerSessionClientSecret,
        },
        expiresAt: checkoutExpiresAt.toISOString(),
        paymentMethod: "card",
        quantity: input.quantity,
        amountMinor: priced.totalMinor,
        creditsApplied: 0,
        currency: orderCurrency,
      };
    }
    if (promoQuote && !row.variant.stripeProductId) {
      throw new Error("The Stripe product for this offer is not ready.");
    }
    const promoCouponId = promoQuote
      ? await createPromoCheckoutCoupon({
          promoCodeId: promoQuote.promoCodeId,
          orderId,
          discountMinor: promoQuote.discountMinor,
          currency: orderCurrency,
          stripeProductId: row.variant.stripeProductId!,
        })
      : undefined;
    const checkout = await createCatalogCheckoutSession({
      orderId,
      personId: input.actor.personId,
      customerEmail: buyer?.email ?? undefined,
      organizationId: row.organization.id,
      catalogItemId: row.item.id,
      catalogVariantId: row.variant.id,
      title: row.item.title,
      stripePriceId: price.stripePriceId!,
      quantity: input.quantity,
      subtotalMinor: priced.subtotalMinor,
      serviceFeeMinor,
      currency: orderCurrency,
      applicationFeeMinor,
      organizationCommissionMinor: organizationCommissionFee?.amountMinor ?? 0,
      organizationCommissionRateBps: commissionPolicy.rateBps,
      connectedAccountId: row.organization.stripeAccountId,
      recurringInterval:
        price.recurringInterval === "week" ||
        price.recurringInterval === "month" ||
        price.recurringInterval === "year"
          ? price.recurringInterval
          : undefined,
      recurringIntervalCount: price.recurringIntervalCount ?? undefined,
      subscriptionPolicy,
      automaticTaxEnabled:
        row.item.taxable && row.organization.stripeTaxEnabled,
      stripeTaxCode: resolveCatalogTaxCode({
        type: row.item.type,
        subtype: row.item.subtype,
        taxable: row.item.taxable,
        explicitTaxCode: row.item.stripeTaxCode ?? undefined,
      }),
      collectShippingAddress: row.item.type === "good",
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      expiresAt: checkoutExpiresAt,
      idempotencyKey: input.idempotencyKey,
      discountCouponId: promoCouponId,
      promoCode: promoQuote?.code,
      ...(installmentsRequested
        ? {
            installmentPlan: {
              count: installmentCount,
              installmentAmountMinor,
              totalMinor: priced.totalMinor,
            },
          }
        : {}),
    });
    if (!checkout.url) {
      throw new Error("The payment processor did not return a checkout URL.");
    }
    await database
      .update(orders)
      .set({
        stripeCheckoutSessionId: checkout.id,
        expiresAt: new Date(checkout.expiresAt),
        updatedAt: input.now,
      })
      .where(eq(orders.id, orderId));
    if (installmentsRequested) {
      await createInstallmentPaymentSchedule({
        orderId,
        organizationId: row.organization.id,
        buyerPersonId: input.actor.personId,
        installmentCount,
        installmentAmountMinor,
        firstInvoiceMinor: installmentAmountMinor + serviceFeeMinor,
        totalMinor: priced.totalMinor,
        currency: orderCurrency,
        now: input.now,
      });
    }
    return {
      mode: "stripe",
      orderId,
      orderStatus: "pending",
      checkoutSessionId: checkout.id,
      checkoutUrl: checkout.url,
      expiresAt: checkout.expiresAt,
      paymentMethod: "card",
      quantity: input.quantity,
      amountMinor: priced.totalMinor,
      creditsApplied: 0,
      currency: orderCurrency,
    };
  } catch (error) {
    await releaseCatalogOrderInventory(row.organization.id, orderId, input.now);
    await releasePromoCodeForOrder(orderId, input.now);
    await database
      .update(orders)
      .set({ status: "cancelled", updatedAt: input.now })
      .where(eq(orders.id, orderId));
    throw new CatalogCheckoutError(
      "CHECKOUT_UNAVAILABLE",
      error instanceof Error ? error.message : "Checkout could not start.",
    );
  }
}

export async function postCapturedCatalogPaymentJournal(input: {
  readonly order: typeof orders.$inferSelect;
  readonly payment: typeof payments.$inferSelect;
  readonly fulfillment: typeof catalogFulfillments.$inferSelect;
  readonly item: typeof catalogItems.$inferSelect;
  readonly now: Date;
}): Promise<void> {
  if (
    !input.order.organizationId ||
    input.order.totalMinor <= 0 ||
    input.order.status !== "paid"
  ) {
    return;
  }
  const database = getDatabase();
  const idempotencyKey = `catalog-payment:${input.payment.id}:money`;
  const existing = await database.query.ledgerJournals.findFirst({
    where: and(
      eq(ledgerJournals.organizationId, input.order.organizationId),
      eq(ledgerJournals.idempotencyKey, idempotencyKey),
    ),
  });
  if (existing) return;

  const captureRatio = Math.min(
    1,
    input.payment.amountMinor / input.order.totalMinor,
  );
  const configuredFee = input.fulfillment.details.applicationFeeMinor;
  const applicationFeeMinor =
    typeof configuredFee === "number" &&
    Number.isSafeInteger(configuredFee) &&
    configuredFee > 0
      ? Math.min(
          input.payment.amountMinor,
          Math.round(configuredFee * captureRatio),
        )
      : 0;
  const configuredConsumerServiceFee =
    input.fulfillment.details.consumerServiceFeeMinor;
  const consumerServiceFeeMinor =
    typeof configuredConsumerServiceFee === "number" &&
    Number.isSafeInteger(configuredConsumerServiceFee) &&
    configuredConsumerServiceFee >= 0
      ? Math.min(
          applicationFeeMinor,
          Math.round(configuredConsumerServiceFee * captureRatio),
        )
      : Math.min(
          applicationFeeMinor,
          Math.round(input.order.feeTotalMinor * captureRatio),
        );
  const configuredOperatorProcessingFee =
    input.fulfillment.details.operatorProcessingFeeMinor;
  const remainingOperatorFees = applicationFeeMinor - consumerServiceFeeMinor;
  const operatorProcessingFeeMinor =
    typeof configuredOperatorProcessingFee === "number" &&
    Number.isSafeInteger(configuredOperatorProcessingFee) &&
    configuredOperatorProcessingFee >= 0
      ? Math.min(
          remainingOperatorFees,
          Math.round(configuredOperatorProcessingFee * captureRatio),
        )
      : remainingOperatorFees;
  const configuredOrganizationCommission =
    input.fulfillment.details.organizationCommissionMinor;
  const organizationCommissionMinor =
    typeof configuredOrganizationCommission === "number" &&
    Number.isSafeInteger(configuredOrganizationCommission) &&
    configuredOrganizationCommission >= 0
      ? Math.min(
          remainingOperatorFees - operatorProcessingFeeMinor,
          Math.round(configuredOrganizationCommission * captureRatio),
        )
      : 0;
  const capturedTaxMinor = Math.min(
    input.payment.amountMinor,
    Math.round(input.order.taxTotalMinor * captureRatio),
  );
  const capturedSubtotalMinor = Math.max(
    0,
    input.payment.amountMinor - consumerServiceFeeMinor - capturedTaxMinor,
  );
  const clearingMinor = input.payment.amountMinor - applicationFeeMinor;
  const creditPack =
    input.item.type === "plan" && input.item.subtype === "credit-pack";
  const revenueCode =
    input.item.type === "event"
      ? "EVENT_REVENUE"
      : input.item.type === "service"
        ? "SERVICE_REVENUE"
        : input.item.type === "good"
          ? "GOODS_REVENUE"
          : input.item.subtype === "membership"
            ? "MEMBERSHIP_REVENUE"
            : "PLAN_REVENUE";
  const [
    clearingId,
    processingFeeExpenseId,
    organizationFeeExpenseId,
    revenueId,
    taxPayableId,
  ] = await Promise.all([
    clearingMinor > 0
      ? ensureLedgerAccount({
          organizationId: input.order.organizationId,
          code: "STRIPE_CLEARING",
          name: "Payment processor clearing",
          accountType: "asset",
          normalSide: "debit",
          unitKind: "money",
          unit: input.order.currency,
          currency: input.order.currency,
        })
      : Promise.resolve(undefined),
    operatorProcessingFeeMinor > 0
      ? ensureLedgerAccount({
          organizationId: input.order.organizationId,
          code: "PAYMENT_PROCESSING_FEES",
          name: "Payment processing fees",
          accountType: "expense",
          normalSide: "debit",
          unitKind: "money",
          unit: input.order.currency,
          currency: input.order.currency,
        })
      : Promise.resolve(undefined),
    organizationCommissionMinor > 0
      ? ensureLedgerAccount({
          organizationId: input.order.organizationId,
          code: "DUNA_PLATFORM_FEES",
          name: "Duna platform fees",
          accountType: "expense",
          normalSide: "debit",
          unitKind: "money",
          unit: input.order.currency,
          currency: input.order.currency,
        })
      : Promise.resolve(undefined),
    ensureLedgerAccount({
      organizationId: input.order.organizationId,
      code: creditPack ? "DEFERRED_CREDIT_REVENUE" : revenueCode,
      name: creditPack
        ? "Deferred organization-credit revenue"
        : revenueCode
            .toLowerCase()
            .replaceAll("_", " ")
            .replace(/^\w/, (value) => value.toUpperCase()),
      accountType: creditPack ? "liability" : "revenue",
      normalSide: "credit",
      unitKind: "money",
      unit: input.order.currency,
      currency: input.order.currency,
    }),
    capturedTaxMinor > 0
      ? ensureLedgerAccount({
          organizationId: input.order.organizationId,
          code: "SALES_TAX_PAYABLE",
          name: "Sales tax payable",
          accountType: "liability",
          normalSide: "credit",
          unitKind: "money",
          unit: input.order.currency,
          currency: input.order.currency,
        })
      : Promise.resolve(undefined),
  ]);
  const postings: LedgerPosting[] = [];
  if (clearingId && clearingMinor > 0) {
    postings.push({
      accountId: clearingId,
      side: "debit",
      amount: clearingMinor,
      unit: input.order.currency,
      unitKind: "money",
      currency: input.order.currency,
    });
  }
  if (processingFeeExpenseId && operatorProcessingFeeMinor > 0) {
    postings.push({
      accountId: processingFeeExpenseId,
      side: "debit",
      amount: operatorProcessingFeeMinor,
      unit: input.order.currency,
      unitKind: "money",
      currency: input.order.currency,
    });
  }
  if (organizationFeeExpenseId && organizationCommissionMinor > 0) {
    postings.push({
      accountId: organizationFeeExpenseId,
      side: "debit",
      amount: organizationCommissionMinor,
      unit: input.order.currency,
      unitKind: "money",
      currency: input.order.currency,
    });
  }
  if (capturedSubtotalMinor > 0) {
    postings.push({
      accountId: revenueId,
      side: "credit",
      amount: capturedSubtotalMinor,
      unit: input.order.currency,
      unitKind: "money",
      currency: input.order.currency,
    });
  }
  if (taxPayableId && capturedTaxMinor > 0) {
    postings.push({
      accountId: taxPayableId,
      side: "credit",
      amount: capturedTaxMinor,
      unit: input.order.currency,
      unitKind: "money",
      currency: input.order.currency,
    });
  }
  assertBalancedJournal(postings);
  const journalId = crypto.randomUUID();
  await database.batch([
    database.insert(ledgerJournals).values({
      id: journalId,
      organizationId: input.order.organizationId,
      idempotencyKey,
      sourceType: "payment-capture",
      sourceId: input.payment.id,
      description: `Payment captured · ${input.item.title}`,
      status: "draft",
      actorPersonId: input.order.buyerPersonId,
      occurredAt: input.now,
      metadata: {
        catalogItemId: input.item.id,
        catalogVariantId: input.fulfillment.catalogVariantId,
        applicationFeeMinor,
        consumerServiceFeeMinor,
        operatorProcessingFeeMinor,
        organizationCommissionMinor,
        orderId: input.order.id,
        paymentId: input.payment.id,
        capturedMinor: input.payment.amountMinor,
        taxTotalMinor: capturedTaxMinor,
        deferredRevenue: creditPack,
      },
    }),
    database.insert(ledgerEntries).values(
      postings.map((posting, sequence) => ({
        id: crypto.randomUUID(),
        organizationId: input.order.organizationId!,
        journalId,
        sequence,
        ...posting,
      })),
    ),
    database
      .update(ledgerJournals)
      .set({ status: "posted", postedAt: input.now })
      .where(eq(ledgerJournals.id, journalId)),
  ]);
}

export async function postCatalogPaymentCapture(
  orderId: string,
  paymentId: string,
  now = new Date(),
): Promise<void> {
  const database = getDatabase();
  const [order, payment, fulfillment] = await Promise.all([
    database.query.orders.findFirst({ where: eq(orders.id, orderId) }),
    database.query.payments.findFirst({ where: eq(payments.id, paymentId) }),
    database.query.catalogFulfillments.findFirst({
      where: eq(catalogFulfillments.orderId, orderId),
    }),
  ]);
  if (!order?.organizationId || !payment || !fulfillment) return;
  const legacyJournal = await database.query.ledgerJournals.findFirst({
    where: and(
      eq(ledgerJournals.organizationId, order.organizationId),
      eq(ledgerJournals.idempotencyKey, `catalog-order:${order.id}:money`),
    ),
  });
  if (legacyJournal) return;
  const item = await database.query.catalogItems.findFirst({
    where: eq(catalogItems.id, fulfillment.catalogItemId),
  });
  if (!item) return;
  await postCapturedCatalogPaymentJournal({
    order,
    payment,
    fulfillment,
    item,
    now,
  });
}

export async function fulfillPaidCatalogOrder(
  orderId: string,
  now = new Date(),
): Promise<void> {
  const database = getDatabase();
  const order = await database.query.orders.findFirst({
    where: eq(orders.id, orderId),
  });
  if (!order || order.status !== "paid" || !order.organizationId) return;
  const fulfillment = await database.query.catalogFulfillments.findFirst({
    where: eq(catalogFulfillments.orderId, order.id),
  });
  if (!fulfillment) return;
  const item = await database.query.catalogItems.findFirst({
    where: eq(catalogItems.id, fulfillment.catalogItemId),
  });
  if (!item) throw new Error("Paid catalog item was not found.");
  if (fulfillment.status === "fulfilled" || fulfillment.status === "ready") {
    if (item.type === "service" && fulfillment.catalogSessionOccurrenceId) {
      await queueVirtualSessionDelivery({ fulfillmentId: fulfillment.id, now });
    }
    return;
  }
  const payment = await database.query.payments.findFirst({
    where: and(
      eq(payments.orderId, order.id),
      eq(payments.status, "succeeded"),
    ),
    orderBy: [desc(payments.createdAt)],
  });
  if (payment) {
    await postCatalogPaymentCapture(order.id, payment.id, now);
  }

  if (item.type === "good" && item.subtype === "digital-content") {
    const trainingDrillId =
      typeof item.configuration.trainingDrillId === "string"
        ? item.configuration.trainingDrillId
        : undefined;
    const purchaserOrganizationId =
      typeof fulfillment.details.purchaserOrganizationId === "string"
        ? fulfillment.details.purchaserOrganizationId
        : undefined;
    if (!trainingDrillId || !purchaserOrganizationId) {
      throw new Error(
        "A drill marketplace purchase requires an active buyer organization.",
      );
    }
    if (purchaserOrganizationId === order.organizationId) {
      throw new Error("The publisher organization already owns this drill.");
    }
    await database.batch([
      database
        .insert(trainingDrillLicenses)
        .values({
          drillId: trainingDrillId,
          sellerOrganizationId: order.organizationId!,
          buyerOrganizationId: purchaserOrganizationId,
          catalogFulfillmentId: fulfillment.id,
          status: "active",
          grantedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            trainingDrillLicenses.drillId,
            trainingDrillLicenses.buyerOrganizationId,
          ],
          set: {
            catalogFulfillmentId: fulfillment.id,
            status: "active",
            grantedAt: now,
            revokedAt: null,
            updatedAt: now,
          },
        }),
      database
        .update(catalogFulfillments)
        .set({ status: "fulfilled", fulfilledAt: now, updatedAt: now })
        .where(eq(catalogFulfillments.id, fulfillment.id)),
    ]);
  } else if (item.type === "good") {
    const reservations = await database
      .select({
        reservation: inventoryReservations,
        stock: inventoryStockItems,
      })
      .from(inventoryReservations)
      .innerJoin(
        inventoryStockItems,
        eq(inventoryReservations.inventoryStockItemId, inventoryStockItems.id),
      )
      .where(
        and(
          eq(inventoryReservations.organizationId, order.organizationId),
          eq(inventoryReservations.sourceType, "catalog-order"),
          eq(inventoryReservations.sourceId, order.id),
          eq(inventoryReservations.status, "held"),
        ),
      );
    for (const { reservation, stock } of reservations) {
      await database.batch([
        database
          .update(inventoryStockItems)
          .set({
            quantityOnHand: sql`${inventoryStockItems.quantityOnHand} - ${reservation.quantity}`,
            quantityReserved: sql`${inventoryStockItems.quantityReserved} - ${reservation.quantity}`,
            updatedAt: now,
          })
          .where(eq(inventoryStockItems.id, reservation.inventoryStockItemId)),
        database
          .insert(inventoryMovements)
          .values({
            organizationId: order.organizationId!,
            inventoryStockItemId: reservation.inventoryStockItemId,
            kind: item.subtype === "rental" ? "rent-out" : "sale",
            quantityDelta: -reservation.quantity,
            unitCostMinor: stock.unitCostMinor,
            totalCostMinor:
              stock.unitCostMinor === null
                ? undefined
                : stock.unitCostMinor * reservation.quantity,
            currency: stock.currency,
            sourceType: "catalog-order",
            sourceId: order.id,
            idempotencyKey: `${order.id}:${reservation.id}:fulfill`,
            actorPersonId: order.buyerPersonId,
            reason:
              item.subtype === "rental"
                ? "Equipment checked out through a paid catalog order."
                : "Inventory fulfilled through a paid catalog order.",
            occurredAt: now,
          })
          .onConflictDoNothing(),
      ]);
    }
    await database.batch([
      database
        .update(inventoryReservations)
        .set({ status: "confirmed", heldUntil: null, updatedAt: now })
        .where(
          and(
            eq(inventoryReservations.organizationId, order.organizationId),
            eq(inventoryReservations.sourceType, "catalog-order"),
            eq(inventoryReservations.sourceId, order.id),
            eq(inventoryReservations.status, "held"),
          ),
        ),
      database
        .update(catalogFulfillments)
        .set({
          status: item.subtype === "rental" ? "fulfilled" : "ready",
          fulfilledAt: item.subtype === "rental" ? now : undefined,
          updatedAt: now,
        })
        .where(eq(catalogFulfillments.id, fulfillment.id)),
    ]);
  } else if (item.type === "plan" && item.subtype === "credit-pack") {
    const entitlement = await database.query.catalogEntitlements.findFirst({
      where: and(
        eq(catalogEntitlements.planCatalogItemId, item.id),
        eq(catalogEntitlements.kind, "credit-grant"),
      ),
    });
    if (!entitlement?.quantity) {
      throw new Error("Paid credit pack is missing its credit grant.");
    }
    const buyer = await database.query.people.findFirst({
      where: eq(people.id, order.buyerPersonId),
    });
    const grant = await issueOrganizationCredits({
      actor: {
        personId: order.buyerPersonId,
        displayName: buyer?.displayName ?? "Duna member",
        roles: ["player"],
        organizationId: order.organizationId,
        scopes: ["wallet:write"],
        ageBand: "adult",
        isDemo: false,
      },
      personId: order.buyerPersonId,
      credits: entitlement.quantity,
      valueMinor: order.subtotalMinor,
      currency: order.currency,
      valueSource: "paid-credit-pack",
      sourceOrderId: order.id,
      reason: `Credit pack fulfilled from order ${order.id}.`,
      requestId: `catalog-order:${order.id}:credit-grant`,
      now,
    });
    await database.batch([
      database
        .update(organizationCreditGrants)
        .set({ catalogItemId: item.id, updatedAt: now })
        .where(eq(organizationCreditGrants.id, grant.id)),
      database
        .update(catalogFulfillments)
        .set({ status: "fulfilled", fulfilledAt: now, updatedAt: now })
        .where(eq(catalogFulfillments.id, fulfillment.id)),
    ]);
  } else if (item.type === "plan" && item.subtype === "membership") {
    await database
      .update(catalogFulfillments)
      .set({ status: "pending", updatedAt: now })
      .where(eq(catalogFulfillments.id, fulfillment.id));
  } else {
    await database
      .update(catalogFulfillments)
      .set({ status: "ready", updatedAt: now })
      .where(eq(catalogFulfillments.id, fulfillment.id));
  }

  await database.insert(auditLog).values({
    organizationId: order.organizationId,
    actorType: "system",
    action: "catalog.order_fulfilled",
    entityType: "catalog-fulfillment",
    entityId: fulfillment.id,
    afterHash: stableHash({
      orderId: order.id,
      catalogItemId: item.id,
      kind: fulfillment.kind,
    }),
    reason: "Paid catalog order projected into its fulfillment rail.",
    traceId: order.id,
    createdAt: now,
  });

  if (item.type === "service" && fulfillment.catalogSessionOccurrenceId) {
    await queueVirtualSessionDelivery({
      fulfillmentId: fulfillment.id,
      now,
    });
  }
}

export async function getCatalogCheckoutStatus(
  input: {
    readonly checkoutSessionId?: string;
    readonly orderId?: string;
  },
  personId: string,
): Promise<CatalogCheckoutStatus> {
  const database = getDatabase();
  const order = await database.query.orders.findFirst({
    where: and(
      or(
        input.checkoutSessionId
          ? eq(orders.stripeCheckoutSessionId, input.checkoutSessionId)
          : undefined,
        input.orderId ? eq(orders.id, input.orderId) : undefined,
      ),
      eq(orders.buyerPersonId, personId),
    ),
  });
  if (!order) {
    throw new CatalogCheckoutError(
      "CATALOG_ITEM_NOT_FOUND",
      "Catalog checkout was not found.",
    );
  }
  const fulfillment = await database.query.catalogFulfillments.findFirst({
    where: eq(catalogFulfillments.orderId, order.id),
  });
  const paymentSchedule = await loadCustomerPaymentSchedule({
    orderId: order.id,
    buyerPersonId: personId,
  });
  return {
    orderId: order.id,
    orderStatus: order.status,
    fulfillmentStatus:
      fulfillment?.status === "held" ||
      fulfillment?.status === "pending" ||
      fulfillment?.status === "ready" ||
      fulfillment?.status === "fulfilled" ||
      fulfillment?.status === "cancelled" ||
      fulfillment?.status === "refunded"
        ? fulfillment.status
        : undefined,
    complete:
      order.status === "paid" &&
      (!paymentSchedule || paymentSchedule.paidMinor > 0) &&
      Boolean(
        fulfillment &&
        ["ready", "fulfilled", "pending"].includes(fulfillment.status),
      ),
    paymentSchedule,
  };
}
