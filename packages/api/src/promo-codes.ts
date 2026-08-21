import {
  auditLog,
  catalogItems,
  catalogVariants,
  getDatabase,
  getTransactionalDatabase,
  organizationParticipants,
  organizations,
  people,
  promoCodeCatalogItems,
  promoCodeMembers,
  promoCodeRedemptions,
  promoCodes,
} from "@duna/db";
import { and, asc, count, eq, inArray, or, sql, sum } from "drizzle-orm";
import type { ApiActor } from "./context";
import { getStripeClient, isStripeConfigured } from "./payments";

export type PromoDiscountType = "percent" | "amount";

export interface PromoCodeInput {
  readonly name: string;
  readonly code: string;
  readonly discountType: PromoDiscountType;
  /** Basis points for percent discounts; minor currency units for amount. */
  readonly discountValue: number;
  readonly currency: string;
  readonly minimumPurchaseMinor?: number;
  readonly maximumDiscountMinor?: number;
  readonly redemptionCap?: number;
  readonly perPersonLimit?: number;
  readonly startsAt?: Date;
  readonly endsAt?: Date;
  readonly appliesToAllPlans: boolean;
  readonly appliesToAllProducts: boolean;
  readonly appliesToAllServices: boolean;
  readonly catalogItemIds: readonly string[];
  readonly memberPersonIds: readonly string[];
}

export interface PromoCheckoutQuote {
  readonly promoCodeId: string;
  readonly code: string;
  readonly name: string;
  readonly discountMinor: number;
  readonly originalSubtotalMinor: number;
  readonly netSubtotalMinor: number;
}

function organizationId(actor: ApiActor): string {
  if (!actor.organizationId) {
    throw new Error("Choose an organization before managing promo codes.");
  }
  return actor.organizationId;
}

export function normalizePromoCode(value: string): string {
  return value.trim().toUpperCase().replaceAll(/\s+/g, "-");
}

export function promoDiscountMinor(input: {
  readonly discountType: PromoDiscountType;
  readonly discountValue: number;
  readonly eligibleSubtotalMinor: number;
  readonly maximumDiscountMinor?: number | null;
}): number {
  const calculated =
    input.discountType === "percent"
      ? Math.floor((input.eligibleSubtotalMinor * input.discountValue) / 10_000)
      : input.discountValue;
  return Math.max(
    0,
    Math.min(
      input.eligibleSubtotalMinor,
      input.maximumDiscountMinor
        ? Math.min(calculated, input.maximumDiscountMinor)
        : calculated,
    ),
  );
}

function validateInput(input: PromoCodeInput): void {
  const code = normalizePromoCode(input.code);
  if (!/^[A-Z0-9-]{3,48}$/.test(code)) {
    throw new Error("Use 3–48 letters, numbers, or dashes for the promo code.");
  }
  if (!input.name.trim()) throw new Error("Add a name for this promotion.");
  if (!Number.isSafeInteger(input.discountValue) || input.discountValue <= 0) {
    throw new Error("Add a valid discount value.");
  }
  if (input.discountType === "percent" && input.discountValue > 10_000) {
    throw new Error("Percentage discounts cannot exceed 100%.");
  }
  for (const [label, value] of [
    ["minimum purchase", input.minimumPurchaseMinor],
    ["maximum discount", input.maximumDiscountMinor],
    ["redemption limit", input.redemptionCap],
    ["per-member limit", input.perPersonLimit],
  ] as const) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value <= 0)) {
      throw new Error(`Add a positive ${label}.`);
    }
  }
  if (input.startsAt && input.endsAt && input.endsAt <= input.startsAt) {
    throw new Error("The promo end date must be after its start date.");
  }
  if (
    !input.appliesToAllPlans &&
    !input.appliesToAllProducts &&
    !input.appliesToAllServices &&
    input.catalogItemIds.length === 0
  ) {
    throw new Error("Choose at least one eligible plan, product, or service.");
  }
}

function categoryEligible(
  itemType: string,
  promo: typeof promoCodes.$inferSelect,
): boolean {
  if (itemType === "plan") return promo.appliesToAllPlans;
  if (itemType === "service") return promo.appliesToAllServices;
  return promo.appliesToAllProducts;
}

async function currentStripeProductIds(
  organizationIdValue: string,
  input: PromoCodeInput,
): Promise<readonly string[]> {
  const selected = [...new Set(input.catalogItemIds)];
  const rows = await getDatabase()
    .select({
      catalogItemId: catalogVariants.catalogItemId,
      stripeProductId: catalogVariants.stripeProductId,
      type: catalogItems.type,
    })
    .from(catalogVariants)
    .innerJoin(catalogItems, eq(catalogItems.id, catalogVariants.catalogItemId))
    .where(
      and(
        eq(catalogItems.organizationId, organizationIdValue),
        or(
          selected.length ? inArray(catalogItems.id, selected) : undefined,
          input.appliesToAllPlans ? eq(catalogItems.type, "plan") : undefined,
          input.appliesToAllServices
            ? eq(catalogItems.type, "service")
            : undefined,
          input.appliesToAllProducts
            ? inArray(catalogItems.type, ["good", "event"])
            : undefined,
        ),
      ),
    );
  return [
    ...new Set(
      rows
        .map((row) => row.stripeProductId)
        .filter((id): id is string => Boolean(id)),
    ),
  ].slice(0, 100);
}

async function syncPromoToStripe(
  id: string,
  organizationIdValue: string,
  input: PromoCodeInput,
  now: Date,
): Promise<void> {
  if (!isStripeConfigured()) {
    await getDatabase()
      .update(promoCodes)
      .set({
        stripeSyncStatus: "not-applicable",
        stripeSyncError: "Stripe is not configured in this environment.",
        updatedAt: now,
      })
      .where(eq(promoCodes.id, id));
    return;
  }
  try {
    const stripe = getStripeClient();
    const productIds = await currentStripeProductIds(
      organizationIdValue,
      input,
    );
    if (productIds.length === 0) {
      throw new Error(
        "Publish at least one eligible Stripe-backed offer before syncing this promo code.",
      );
    }
    const coupon = await stripe.coupons.create(
      {
        duration: "once",
        name: input.name.trim(),
        ...(input.discountType === "percent"
          ? { percent_off: input.discountValue / 100 }
          : {
              amount_off: input.discountValue,
              currency: input.currency.toLowerCase(),
            }),
        ...(productIds.length > 0
          ? { applies_to: { products: [...productIds] } }
          : {}),
        metadata: {
          dunaPromoCodeId: id,
          dunaOrganizationId: organizationIdValue,
          dunaManaged: "true",
        },
      },
      { idempotencyKey: `duna-promo:${id}:coupon` },
    );
    const promotion = await stripe.promotionCodes.create(
      {
        promotion: { type: "coupon", coupon: coupon.id },
        code: normalizePromoCode(input.code),
        active: true,
        max_redemptions: input.redemptionCap,
        expires_at: input.endsAt
          ? Math.floor(input.endsAt.getTime() / 1_000)
          : undefined,
        restrictions: input.minimumPurchaseMinor
          ? {
              minimum_amount: input.minimumPurchaseMinor,
              minimum_amount_currency: input.currency.toLowerCase(),
            }
          : undefined,
        metadata: {
          dunaPromoCodeId: id,
          dunaOrganizationId: organizationIdValue,
          dunaManaged: "true",
        },
      },
      { idempotencyKey: `duna-promo:${id}:promotion-code` },
    );
    await getDatabase()
      .update(promoCodes)
      .set({
        stripeCouponId: coupon.id,
        stripePromotionCodeId: promotion.id,
        stripeSyncStatus: "synced",
        stripeSyncError: null,
        stripeSyncedAt: now,
        updatedAt: now,
      })
      .where(eq(promoCodes.id, id));
  } catch (error) {
    await getDatabase()
      .update(promoCodes)
      .set({
        stripeSyncStatus: "failed",
        stripeSyncError:
          error instanceof Error ? error.message.slice(0, 1_000) : "Unknown",
        updatedAt: now,
      })
      .where(eq(promoCodes.id, id));
  }
}

async function validateRelationships(
  organizationIdValue: string,
  input: PromoCodeInput,
): Promise<void> {
  if (input.catalogItemIds.length > 0) {
    const items = await getDatabase()
      .select({ id: catalogItems.id })
      .from(catalogItems)
      .where(
        and(
          eq(catalogItems.organizationId, organizationIdValue),
          inArray(catalogItems.id, [...new Set(input.catalogItemIds)]),
        ),
      );
    if (items.length !== new Set(input.catalogItemIds).size) {
      throw new Error("One or more eligible offers no longer exist.");
    }
  }
  if (input.memberPersonIds.length > 0) {
    const members = await getDatabase()
      .selectDistinct({ personId: organizationParticipants.personId })
      .from(organizationParticipants)
      .where(
        and(
          eq(organizationParticipants.organizationId, organizationIdValue),
          eq(organizationParticipants.status, "active"),
          inArray(organizationParticipants.personId, [
            ...new Set(input.memberPersonIds),
          ]),
        ),
      );
    if (members.length !== new Set(input.memberPersonIds).size) {
      throw new Error("One or more selected members are not active here.");
    }
  }
}

export async function createPromoCode(input: {
  readonly actor: ApiActor;
  readonly promotion: PromoCodeInput;
  readonly requestId: string;
  readonly now: Date;
}): Promise<{
  readonly id: string;
  readonly code: string;
  readonly stripeSyncStatus: "pending" | "synced" | "failed" | "not-applicable";
}> {
  const organizationIdValue = organizationId(input.actor);
  validateInput(input.promotion);
  await validateRelationships(organizationIdValue, input.promotion);
  const id = crypto.randomUUID();
  const code = normalizePromoCode(input.promotion.code);
  await getDatabase().batch([
    getDatabase().insert(promoCodes).values({
      id,
      organizationId: organizationIdValue,
      name: input.promotion.name.trim(),
      code,
      discountType: input.promotion.discountType,
      discountValue: input.promotion.discountValue,
      currency: input.promotion.currency.toUpperCase(),
      minimumPurchaseMinor: input.promotion.minimumPurchaseMinor,
      maximumDiscountMinor: input.promotion.maximumDiscountMinor,
      redemptionCap: input.promotion.redemptionCap,
      perPersonLimit: input.promotion.perPersonLimit,
      appliesToAllPlans: input.promotion.appliesToAllPlans,
      appliesToAllProducts: input.promotion.appliesToAllProducts,
      appliesToAllServices: input.promotion.appliesToAllServices,
      startsAt: input.promotion.startsAt,
      endsAt: input.promotion.endsAt,
      createdAt: input.now,
      updatedAt: input.now,
    }),
    ...[...new Set(input.promotion.catalogItemIds)].map((catalogItemId) =>
      getDatabase().insert(promoCodeCatalogItems).values({
        promoCodeId: id,
        catalogItemId,
        createdAt: input.now,
      }),
    ),
    ...[...new Set(input.promotion.memberPersonIds)].map((personId) =>
      getDatabase().insert(promoCodeMembers).values({
        promoCodeId: id,
        personId,
        createdAt: input.now,
      }),
    ),
    getDatabase()
      .insert(auditLog)
      .values({
        organizationId: organizationIdValue,
        actorPersonId: input.actor.personId,
        actorType: "operator",
        action: "promo_code.created",
        entityType: "promo-code",
        entityId: id,
        reason: `Created ${code} with explicit eligibility and redemption controls.`,
        traceId: input.requestId,
        createdAt: input.now,
      }),
  ]);
  await syncPromoToStripe(id, organizationIdValue, input.promotion, input.now);
  const synchronized = await getDatabase().query.promoCodes.findFirst({
    where: eq(promoCodes.id, id),
    columns: { stripeSyncStatus: true },
  });
  return {
    id,
    code,
    stripeSyncStatus:
      (synchronized?.stripeSyncStatus as
        "pending" | "synced" | "failed" | "not-applicable") ?? "failed",
  };
}

export async function deactivatePromoCode(input: {
  readonly actor: ApiActor;
  readonly promoCodeId: string;
  readonly requestId: string;
  readonly now: Date;
}): Promise<{ readonly id: string; readonly active: false }> {
  const organizationIdValue = organizationId(input.actor);
  const promo = await getDatabase().query.promoCodes.findFirst({
    where: and(
      eq(promoCodes.id, input.promoCodeId),
      eq(promoCodes.organizationId, organizationIdValue),
    ),
  });
  if (!promo) throw new Error("Promo code was not found.");
  if (promo.stripePromotionCodeId && isStripeConfigured()) {
    await getStripeClient().promotionCodes.update(promo.stripePromotionCodeId, {
      active: false,
    });
  }
  await getDatabase().batch([
    getDatabase()
      .update(promoCodes)
      .set({ active: false, deactivatedAt: input.now, updatedAt: input.now })
      .where(eq(promoCodes.id, promo.id)),
    getDatabase()
      .insert(auditLog)
      .values({
        organizationId: organizationIdValue,
        actorPersonId: input.actor.personId,
        actorType: "operator",
        action: "promo_code.deactivated",
        entityType: "promo-code",
        entityId: promo.id,
        reason: `Deactivated ${promo.code} in Duna and Stripe.`,
        traceId: input.requestId,
        createdAt: input.now,
      }),
  ]);
  return { id: promo.id, active: false };
}

export async function duplicatePromoCode(input: {
  readonly actor: ApiActor;
  readonly promoCodeId: string;
  readonly code: string;
  readonly name?: string;
  readonly requestId: string;
  readonly now: Date;
}): Promise<{
  readonly id: string;
  readonly code: string;
  readonly stripeSyncStatus: "pending" | "synced" | "failed" | "not-applicable";
}> {
  const organizationIdValue = organizationId(input.actor);
  const [promo, itemRows, memberRows] = await Promise.all([
    getDatabase().query.promoCodes.findFirst({
      where: and(
        eq(promoCodes.id, input.promoCodeId),
        eq(promoCodes.organizationId, organizationIdValue),
      ),
    }),
    getDatabase()
      .select({ id: promoCodeCatalogItems.catalogItemId })
      .from(promoCodeCatalogItems)
      .where(eq(promoCodeCatalogItems.promoCodeId, input.promoCodeId)),
    getDatabase()
      .select({ id: promoCodeMembers.personId })
      .from(promoCodeMembers)
      .where(eq(promoCodeMembers.promoCodeId, input.promoCodeId)),
  ]);
  if (!promo) throw new Error("Promo code was not found.");
  const created = await createPromoCode({
    actor: input.actor,
    promotion: {
      name: input.name?.trim() || `${promo.name} copy`,
      code: input.code,
      discountType: promo.discountType as PromoDiscountType,
      discountValue: promo.discountValue,
      currency: promo.currency,
      minimumPurchaseMinor: promo.minimumPurchaseMinor ?? undefined,
      maximumDiscountMinor: promo.maximumDiscountMinor ?? undefined,
      redemptionCap: promo.redemptionCap ?? undefined,
      perPersonLimit: promo.perPersonLimit ?? undefined,
      startsAt: promo.startsAt ?? undefined,
      endsAt: promo.endsAt ?? undefined,
      appliesToAllPlans: promo.appliesToAllPlans,
      appliesToAllProducts: promo.appliesToAllProducts,
      appliesToAllServices: promo.appliesToAllServices,
      catalogItemIds: itemRows.map((row) => row.id),
      memberPersonIds: memberRows.map((row) => row.id),
    },
    requestId: input.requestId,
    now: input.now,
  });
  await getDatabase()
    .update(promoCodes)
    .set({ duplicatedFromId: promo.id, updatedAt: input.now })
    .where(eq(promoCodes.id, created.id));
  return created;
}

export async function loadPromoCodeWorkspace(input: {
  readonly actor: ApiActor;
  readonly now: Date;
}) {
  const organizationIdValue = organizationId(input.actor);
  const [
    organization,
    codes,
    itemLinks,
    memberLinks,
    metrics,
    catalog,
    members,
  ] = await Promise.all([
    getDatabase().query.organizations.findFirst({
      where: eq(organizations.id, organizationIdValue),
    }),
    getDatabase()
      .select()
      .from(promoCodes)
      .where(eq(promoCodes.organizationId, organizationIdValue))
      .orderBy(asc(promoCodes.code)),
    getDatabase()
      .select()
      .from(promoCodeCatalogItems)
      .innerJoin(
        catalogItems,
        eq(catalogItems.id, promoCodeCatalogItems.catalogItemId),
      )
      .where(eq(catalogItems.organizationId, organizationIdValue)),
    getDatabase()
      .select()
      .from(promoCodeMembers)
      .innerJoin(people, eq(people.id, promoCodeMembers.personId))
      .innerJoin(
        organizationParticipants,
        and(
          eq(organizationParticipants.personId, people.id),
          eq(organizationParticipants.organizationId, organizationIdValue),
        ),
      ),
    getDatabase()
      .select({
        promoCodeId: promoCodeRedemptions.promoCodeId,
        redemptions: count(),
        grossSalesMinor: sum(promoCodeRedemptions.originalSubtotalMinor),
        netSalesMinor: sum(promoCodeRedemptions.netSubtotalMinor),
        discountsMinor: sum(promoCodeRedemptions.discountMinor),
      })
      .from(promoCodeRedemptions)
      .where(
        and(
          eq(promoCodeRedemptions.organizationId, organizationIdValue),
          eq(promoCodeRedemptions.status, "redeemed"),
        ),
      )
      .groupBy(promoCodeRedemptions.promoCodeId),
    getDatabase()
      .select({
        id: catalogItems.id,
        title: catalogItems.title,
        type: catalogItems.type,
        subtype: catalogItems.subtype,
        status: catalogItems.status,
      })
      .from(catalogItems)
      .where(eq(catalogItems.organizationId, organizationIdValue))
      .orderBy(asc(catalogItems.title)),
    getDatabase()
      .selectDistinct({
        id: people.id,
        displayName: people.displayName,
        email: people.email,
      })
      .from(organizationParticipants)
      .innerJoin(people, eq(people.id, organizationParticipants.personId))
      .where(
        and(
          eq(organizationParticipants.organizationId, organizationIdValue),
          eq(organizationParticipants.status, "active"),
        ),
      )
      .orderBy(asc(people.displayName)),
  ]);
  if (!organization) throw new Error("Organization was not found.");
  const metricByCode = new Map(
    metrics.map((entry) => [entry.promoCodeId, entry]),
  );
  return {
    organization: {
      id: organization.id,
      name: organization.name,
      currency: organization.currency,
    },
    catalog,
    members,
    promoCodes: codes.map((promo) => {
      const metric = metricByCode.get(promo.id);
      const activeNow =
        promo.active &&
        (!promo.startsAt || promo.startsAt <= input.now) &&
        (!promo.endsAt || promo.endsAt > input.now);
      const lifecycle = !promo.active
        ? "inactive"
        : promo.startsAt && promo.startsAt > input.now
          ? "scheduled"
          : promo.endsAt && promo.endsAt <= input.now
            ? "expired"
            : "active";
      return {
        ...promo,
        activeNow,
        lifecycle,
        startsAt: promo.startsAt?.toISOString(),
        endsAt: promo.endsAt?.toISOString(),
        stripeSyncedAt: promo.stripeSyncedAt?.toISOString(),
        deactivatedAt: promo.deactivatedAt?.toISOString(),
        createdAt: promo.createdAt.toISOString(),
        updatedAt: promo.updatedAt.toISOString(),
        catalogItems: itemLinks
          .filter(
            (row) => row.promo_code_catalog_items.promoCodeId === promo.id,
          )
          .map((row) => ({
            id: row.catalog_items.id,
            title: row.catalog_items.title,
            type: row.catalog_items.type,
          })),
        members: memberLinks
          .filter((row) => row.promo_code_members.promoCodeId === promo.id)
          .map((row) => ({
            id: row.people.id,
            displayName: row.people.displayName,
          })),
        metrics: {
          redemptions: Number(metric?.redemptions ?? 0),
          grossSalesMinor: Number(metric?.grossSalesMinor ?? 0),
          netSalesMinor: Number(metric?.netSalesMinor ?? 0),
          discountsMinor: Number(metric?.discountsMinor ?? 0),
        },
      };
    }),
  };
}

export type PromoCodeWorkspace = Awaited<
  ReturnType<typeof loadPromoCodeWorkspace>
>;

export async function quotePromoCode(input: {
  readonly organizationId: string;
  readonly code: string;
  readonly personId: string;
  readonly catalogItemId: string;
  readonly subtotalMinor: number;
  readonly currency: string;
  readonly now: Date;
}): Promise<PromoCheckoutQuote> {
  const code = normalizePromoCode(input.code);
  const promo = await getDatabase().query.promoCodes.findFirst({
    where: and(
      eq(promoCodes.organizationId, input.organizationId),
      eq(promoCodes.code, code),
    ),
  });
  if (!promo || !promo.active)
    throw new Error("That promo code is not active.");
  if (promo.startsAt && promo.startsAt > input.now) {
    throw new Error("That promo code has not started yet.");
  }
  if (promo.endsAt && promo.endsAt <= input.now) {
    throw new Error("That promo code has expired.");
  }
  if (promo.currency !== input.currency.toUpperCase()) {
    throw new Error("That promo code uses a different currency.");
  }
  if (
    promo.minimumPurchaseMinor &&
    input.subtotalMinor < promo.minimumPurchaseMinor
  ) {
    throw new Error("This purchase does not meet the promo minimum.");
  }
  const item = await getDatabase().query.catalogItems.findFirst({
    where: and(
      eq(catalogItems.id, input.catalogItemId),
      eq(catalogItems.organizationId, input.organizationId),
    ),
  });
  if (!item) throw new Error("This offer is no longer available.");
  const specificItem =
    await getDatabase().query.promoCodeCatalogItems.findFirst({
      where: and(
        eq(promoCodeCatalogItems.promoCodeId, promo.id),
        eq(promoCodeCatalogItems.catalogItemId, item.id),
      ),
    });
  if (!specificItem && !categoryEligible(item.type, promo)) {
    throw new Error("That promo code does not apply to this offer.");
  }
  const memberRestrictions = await getDatabase()
    .select({ personId: promoCodeMembers.personId })
    .from(promoCodeMembers)
    .where(eq(promoCodeMembers.promoCodeId, promo.id));
  if (
    memberRestrictions.length > 0 &&
    !memberRestrictions.some((entry) => entry.personId === input.personId)
  ) {
    throw new Error("That promo code is reserved for selected members.");
  }
  const redemptionRows = await getDatabase()
    .select({ personId: promoCodeRedemptions.personId })
    .from(promoCodeRedemptions)
    .where(
      and(
        eq(promoCodeRedemptions.promoCodeId, promo.id),
        inArray(promoCodeRedemptions.status, ["pending", "redeemed"]),
      ),
    );
  if (promo.redemptionCap && redemptionRows.length >= promo.redemptionCap) {
    throw new Error("That promo code has reached its redemption limit.");
  }
  if (
    promo.perPersonLimit &&
    redemptionRows.filter((entry) => entry.personId === input.personId)
      .length >= promo.perPersonLimit
  ) {
    throw new Error(
      "You have already used this promo code the maximum number of times.",
    );
  }
  const discountMinor = promoDiscountMinor({
    discountType: promo.discountType as PromoDiscountType,
    discountValue: promo.discountValue,
    eligibleSubtotalMinor: input.subtotalMinor,
    maximumDiscountMinor: promo.maximumDiscountMinor,
  });
  if (discountMinor <= 0) throw new Error("That promo code has no value here.");
  return {
    promoCodeId: promo.id,
    code: promo.code,
    name: promo.name,
    discountMinor,
    originalSubtotalMinor: input.subtotalMinor,
    netSubtotalMinor: input.subtotalMinor - discountMinor,
  };
}

export async function reservePromoRedemption(input: {
  readonly quote: PromoCheckoutQuote;
  readonly organizationId: string;
  readonly personId: string;
  readonly orderId: string;
  readonly currency: string;
  readonly now: Date;
}): Promise<void> {
  await getTransactionalDatabase().transaction(async (tx) => {
    await tx.execute(
      sql`select id from promo_codes where id = ${input.quote.promoCodeId}::uuid for update`,
    );
    const promo = await tx.query.promoCodes.findFirst({
      where: eq(promoCodes.id, input.quote.promoCodeId),
    });
    if (!promo?.active) throw new Error("That promo code is no longer active.");
    const rows = await tx
      .select({ personId: promoCodeRedemptions.personId })
      .from(promoCodeRedemptions)
      .where(
        and(
          eq(promoCodeRedemptions.promoCodeId, promo.id),
          inArray(promoCodeRedemptions.status, ["pending", "redeemed"]),
        ),
      );
    if (promo.redemptionCap && rows.length >= promo.redemptionCap) {
      throw new Error("That promo code has reached its redemption limit.");
    }
    if (
      promo.perPersonLimit &&
      rows.filter((row) => row.personId === input.personId).length >=
        promo.perPersonLimit
    ) {
      throw new Error(
        "You have already used this promo code the maximum number of times.",
      );
    }
    await tx.insert(promoCodeRedemptions).values({
      promoCodeId: promo.id,
      organizationId: input.organizationId,
      personId: input.personId,
      orderId: input.orderId,
      status: "pending",
      originalSubtotalMinor: input.quote.originalSubtotalMinor,
      eligibleSubtotalMinor: input.quote.originalSubtotalMinor,
      discountMinor: input.quote.discountMinor,
      netSubtotalMinor: input.quote.netSubtotalMinor,
      currency: input.currency.toUpperCase(),
      createdAt: input.now,
      updatedAt: input.now,
    });
  });
}

export async function createPromoCheckoutCoupon(input: {
  readonly promoCodeId: string;
  readonly orderId: string;
  readonly discountMinor: number;
  readonly currency: string;
  readonly stripeProductId: string;
}): Promise<string> {
  const coupon = await getStripeClient().coupons.create(
    {
      duration: "once",
      amount_off: input.discountMinor,
      currency: input.currency.toLowerCase(),
      applies_to: { products: [input.stripeProductId] },
      name: "Duna promo code",
      metadata: {
        dunaPromoCodeId: input.promoCodeId,
        dunaOrderId: input.orderId,
        dunaCheckoutScoped: "true",
      },
    },
    { idempotencyKey: `duna-order:${input.orderId}:promo-coupon` },
  );
  await getDatabase()
    .update(promoCodeRedemptions)
    .set({ stripeCouponId: coupon.id, updatedAt: new Date() })
    .where(eq(promoCodeRedemptions.orderId, input.orderId));
  return coupon.id;
}

export async function redeemPromoCodeForOrder(
  orderId: string,
  now: Date,
): Promise<void> {
  await getTransactionalDatabase().transaction(async (tx) => {
    await tx.execute(
      sql`select id from promo_code_redemptions where order_id = ${orderId}::uuid for update`,
    );
    const redemption = await tx.query.promoCodeRedemptions.findFirst({
      where: eq(promoCodeRedemptions.orderId, orderId),
    });
    if (!redemption || redemption.status === "redeemed") return;
    await tx
      .update(promoCodeRedemptions)
      .set({ status: "redeemed", redeemedAt: now, updatedAt: now })
      .where(eq(promoCodeRedemptions.id, redemption.id));
    await tx
      .update(promoCodes)
      .set({
        redeemedCount: sql`${promoCodes.redeemedCount} + 1`,
        updatedAt: now,
      })
      .where(eq(promoCodes.id, redemption.promoCodeId));
  });
}

export async function releasePromoCodeForOrder(
  orderId: string,
  now: Date,
): Promise<void> {
  await getDatabase()
    .update(promoCodeRedemptions)
    .set({ status: "released", releasedAt: now, updatedAt: now })
    .where(
      and(
        eq(promoCodeRedemptions.orderId, orderId),
        eq(promoCodeRedemptions.status, "pending"),
      ),
    );
}
