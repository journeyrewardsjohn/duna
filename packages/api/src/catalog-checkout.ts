import {
  auditLog,
  catalogEntitlements,
  catalogFulfillments,
  catalogItems,
  catalogPrices,
  catalogVariants,
  getDatabase,
  inventoryMovements,
  inventoryReservations,
  inventoryStockItems,
  ledgerEntries,
  ledgerJournals,
  membershipTiers,
  memberships,
  orderItems,
  orders,
  orderTaxContexts,
  organizationCreditGrants,
  organizationParticipants,
  organizationWallets,
  organizations,
  people,
  venues,
} from "@duna/db";
import {
  allocateOrganizationCredits,
  assertBalancedJournal,
  type LedgerPosting,
} from "@duna/core";
import {
  calculateOperatorProcessingFee,
  type CurrencyCode,
} from "@duna/pricing";
import { and, eq, inArray, sql } from "drizzle-orm";
import { stableHash } from "./canonical";
import {
  ensureLedgerAccount,
  issueOrganizationCredits,
} from "./catalog-service";
import type { ApiActor } from "./context";
import { createCatalogCheckoutSession } from "./payments";

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
  readonly expiresAt?: string;
  readonly paymentMethod: "card" | "credit" | "cash";
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

function fulfillmentKind(
  item: typeof catalogItems.$inferSelect,
):
  | "registration"
  | "appointment"
  | "pickup"
  | "rental"
  | "membership"
  | "credit-grant" {
  if (item.type === "event") return "registration";
  if (item.type === "service") return "appointment";
  if (item.type === "good") {
    return item.subtype === "rental" ? "rental" : "pickup";
  }
  return item.subtype === "credit-pack" ? "credit-grant" : "membership";
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
  const remainingBookings = accessLimit.quantity - (countResult[0]?.count ?? 0);
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

export async function startCatalogCheckout(input: {
  readonly actor: ApiActor;
  readonly catalogItemId: string;
  readonly catalogVariantId: string;
  readonly catalogPriceId?: string;
  readonly paymentMethod: "card" | "credit" | "cash";
  readonly quantity: number;
  readonly successUrl: string;
  readonly cancelUrl: string;
  readonly idempotencyKey: string;
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
  const orderCurrency = currency(row.organization.currency);
  const amountMinor = membershipInclusion
    ? 0
    : (price.amountMinor ?? 0) * input.quantity;
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
  const operatorFee =
    input.paymentMethod === "card" && amountMinor > 0
      ? calculateOperatorProcessingFee({
          amountMinor,
          currency: orderCurrency,
          method: "online-card",
        })
      : undefined;

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
  await database.batch([
    database
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
      subtotalMinor: amountMinor,
      totalMinor: amountMinor,
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
      unitAmountMinor: price.amountMinor ?? 0,
      totalAmountMinor: amountMinor,
    }),
    database.insert(catalogFulfillments).values({
      id: fulfillmentId,
      organizationId: row.organization.id,
      orderId,
      orderItemId,
      catalogItemId: row.item.id,
      catalogVariantId: row.variant.id,
      personId: input.actor.personId,
      kind: fulfillmentKind(row.item),
      status: row.item.type === "good" ? "held" : "pending",
      details: {
        paymentMethod: input.paymentMethod,
        creditsApplied,
        quantity: input.quantity,
        applicationFeeMinor: operatorFee?.amountMinor ?? 0,
        membershipIncluded: Boolean(membershipInclusion),
        membershipId: membershipInclusion?.membershipId,
        membershipPlanCatalogItemId: membershipInclusion?.planCatalogItemId,
      },
    }),
    database.insert(orderTaxContexts).values({
      orderId,
      organizationId: row.organization.id,
      source:
        row.item.type === "good"
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
        { orderItemId, stripeTaxCode: row.item.stripeTaxCode ?? undefined },
      ],
      currency: orderCurrency,
    }),
  ]);

  if (row.item.type === "good") {
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
  if (
    !row.organization.stripeAccountId ||
    !row.organization.stripeChargesEnabled
  ) {
    await releaseCatalogOrderInventory(row.organization.id, orderId, input.now);
    throw new CatalogCheckoutError(
      "CHECKOUT_UNAVAILABLE",
      "This organization is not ready to accept online payments.",
    );
  }
  const buyer = await database.query.people.findFirst({
    where: eq(people.id, input.actor.personId),
  });
  try {
    const checkout = await createCatalogCheckoutSession({
      orderId,
      personId: input.actor.personId,
      customerEmail: buyer?.email ?? undefined,
      organizationId: row.organization.id,
      catalogItemId: row.item.id,
      catalogVariantId: row.variant.id,
      stripePriceId: price.stripePriceId!,
      quantity: input.quantity,
      amountMinor,
      applicationFeeMinor: Math.min(amountMinor, operatorFee?.amountMinor ?? 0),
      connectedAccountId: row.organization.stripeAccountId,
      recurring: Boolean(price.recurringInterval),
      automaticTaxEnabled:
        row.item.taxable && row.organization.stripeTaxEnabled,
      collectShippingAddress: row.item.type === "good",
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      expiresAt: checkoutExpiresAt,
      idempotencyKey: input.idempotencyKey,
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
    return {
      mode: "stripe",
      orderId,
      orderStatus: "pending",
      checkoutSessionId: checkout.id,
      checkoutUrl: checkout.url,
      expiresAt: checkout.expiresAt,
      paymentMethod: "card",
      quantity: input.quantity,
      amountMinor,
      creditsApplied: 0,
      currency: orderCurrency,
    };
  } catch (error) {
    await releaseCatalogOrderInventory(row.organization.id, orderId, input.now);
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

async function postPaidCatalogOrderJournal(input: {
  readonly order: typeof orders.$inferSelect;
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
  const idempotencyKey = `catalog-order:${input.order.id}:money`;
  const existing = await database.query.ledgerJournals.findFirst({
    where: and(
      eq(ledgerJournals.organizationId, input.order.organizationId),
      eq(ledgerJournals.idempotencyKey, idempotencyKey),
    ),
  });
  if (existing) return;

  const configuredFee = input.fulfillment.details.applicationFeeMinor;
  const applicationFeeMinor =
    typeof configuredFee === "number" &&
    Number.isSafeInteger(configuredFee) &&
    configuredFee > 0
      ? Math.min(input.order.totalMinor, configuredFee)
      : 0;
  const clearingMinor = input.order.totalMinor - applicationFeeMinor;
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
  const [clearingId, feeExpenseId, revenueId, taxPayableId] = await Promise.all(
    [
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
      applicationFeeMinor > 0
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
      input.order.taxTotalMinor > 0
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
    ],
  );
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
  if (feeExpenseId && applicationFeeMinor > 0) {
    postings.push({
      accountId: feeExpenseId,
      side: "debit",
      amount: applicationFeeMinor,
      unit: input.order.currency,
      unitKind: "money",
      currency: input.order.currency,
    });
  }
  if (input.order.subtotalMinor > 0) {
    postings.push({
      accountId: revenueId,
      side: "credit",
      amount: input.order.subtotalMinor,
      unit: input.order.currency,
      unitKind: "money",
      currency: input.order.currency,
    });
  }
  if (taxPayableId && input.order.taxTotalMinor > 0) {
    postings.push({
      accountId: taxPayableId,
      side: "credit",
      amount: input.order.taxTotalMinor,
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
      sourceType: "catalog-order",
      sourceId: input.order.id,
      description: `Catalog sale · ${input.item.title}`,
      status: "draft",
      actorPersonId: input.order.buyerPersonId,
      occurredAt: input.now,
      metadata: {
        catalogItemId: input.item.id,
        catalogVariantId: input.fulfillment.catalogVariantId,
        applicationFeeMinor,
        taxTotalMinor: input.order.taxTotalMinor,
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
  if (
    !fulfillment ||
    fulfillment.status === "fulfilled" ||
    fulfillment.status === "ready"
  ) {
    return;
  }
  const item = await database.query.catalogItems.findFirst({
    where: eq(catalogItems.id, fulfillment.catalogItemId),
  });
  if (!item) throw new Error("Paid catalog item was not found.");
  await postPaidCatalogOrderJournal({ order, fulfillment, item, now });

  if (item.type === "good") {
    const reservations = await database
      .select()
      .from(inventoryReservations)
      .where(
        and(
          eq(inventoryReservations.organizationId, order.organizationId),
          eq(inventoryReservations.sourceType, "catalog-order"),
          eq(inventoryReservations.sourceId, order.id),
          eq(inventoryReservations.status, "held"),
        ),
      );
    for (const reservation of reservations) {
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
}

export async function getCatalogCheckoutStatus(
  checkoutSessionId: string,
  personId: string,
): Promise<CatalogCheckoutStatus> {
  const database = getDatabase();
  const order = await database.query.orders.findFirst({
    where: and(
      eq(orders.stripeCheckoutSessionId, checkoutSessionId),
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
      Boolean(
        fulfillment &&
        ["ready", "fulfilled", "pending"].includes(fulfillment.status),
      ),
  };
}
