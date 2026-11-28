/**
 * Service seam: fees (owner: B2). The all-in price a buyer sees before
 * committing (defect 4): `player.fees.quote` prices a catalog purchase with
 * the SAME composition checkout charges (`quoteCheckoutFees` in
 * @duna/pricing) and records it in `pay_fee_quotes` as evidence of up-front
 * disclosure. Catalog checkout records the quote it charged, linked to the
 * order, so a receipt can be reproduced.
 *
 * The client never sends amounts: the server reads the catalog price. Sales
 * tax is calculated by the processor at checkout and is shown there; the
 * quote's tax line is 0 and says so.
 */
import {
  catalogItems,
  catalogPrices,
  catalogVariants,
  getDatabase,
  organizations,
  payFeeQuotes,
} from "@duna/db";
import { report } from "@duna/observability";
import {
  quoteCheckoutFees,
  type CheckoutFeeQuote,
  type CurrencyCode,
} from "@duna/pricing";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { z } from "zod";
import { catalogOrderItemKind } from "../../catalog-checkout";
import { currencySchema } from "../../contracts";
import type {
  feesQuoteInputSchema,
  feesQuoteSchema,
} from "../../contracts/fees";
import { hasActiveDunaPlusMembership } from "../../membership";
import { resolveOrganizationCommissionPolicy } from "../../organization-billing";

type FeesQuote = z.infer<typeof feesQuoteSchema>;
type Surface = FeesQuote["surface"];
const QUOTE_VALID_MS = 30 * 60_000;

function money(amountMinor: number, currency: string) {
  return {
    amountMinor: Math.max(0, amountMinor),
    currency: currencySchema.catch("USD").parse(currency.toUpperCase()),
  };
}

/** Record what the buyer was shown (and, from checkout, accepted). */
export async function recordFeeQuote(input: {
  readonly organizationId: string;
  readonly buyerPersonId?: string;
  readonly orderId?: string;
  readonly catalogItemId?: string;
  readonly surface: Surface;
  readonly currency: string;
  readonly itemLabel: string;
  readonly quote: CheckoutFeeQuote;
  readonly premiumApplied: boolean;
  readonly now: Date;
  readonly accepted?: boolean;
}): Promise<FeesQuote> {
  const id = crypto.randomUUID();
  const { priced } = input.quote;
  const currency = input.currency.toUpperCase();
  const expiresAt = new Date(input.now.getTime() + QUOTE_VALID_MS);
  await getDatabase()
    .insert(payFeeQuotes)
    .values({
      id,
      organizationId: input.organizationId,
      buyerPersonId: input.buyerPersonId,
      orderId: input.orderId,
      catalogItemId: input.catalogItemId,
      surface: input.surface,
      currency,
      subtotalMinor: priced.subtotalMinor,
      serviceFeeMinor: input.quote.serviceFeeMinor,
      organizationFeeMinor: input.quote.organizationFee?.amountMinor ?? 0,
      processingEstimateMinor: input.quote.processingFee?.amountMinor ?? 0,
      taxMinor: 0,
      totalMinor: priced.subtotalMinor + input.quote.serviceFeeMinor,
      feeRuleVersion: input.quote.feeRuleVersion,
      premiumApplied: input.premiumApplied,
      shownAt: input.now,
      expiresAt,
      acceptedAt: input.accepted ? input.now : null,
    });
  return {
    id,
    organizationId: input.organizationId,
    catalogItemId: input.catalogItemId,
    surface: input.surface,
    subtotal: money(priced.subtotalMinor, currency),
    serviceFee: money(input.quote.serviceFeeMinor, currency),
    organizationFee: money(
      input.quote.organizationFee?.amountMinor ?? 0,
      currency,
    ),
    processingEstimate: money(
      input.quote.processingFee?.amountMinor ?? 0,
      currency,
    ),
    tax: money(0, currency),
    total: money(priced.subtotalMinor + input.quote.serviceFeeMinor, currency),
    premiumApplied: input.premiumApplied,
    feeRuleVersion: input.quote.feeRuleVersion,
    lines: [
      {
        label: input.itemLabel,
        amount: money(priced.subtotalMinor, currency),
        kind: "item",
      },
      ...priced.fees.map((fee) => ({
        label: "Duna service fee",
        amount: money(fee.amountMinor, currency),
        kind: "service-fee" as const,
      })),
    ],
    shownAt: input.now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}

/** Never fails a checkout: a missing quote is reported, the sale proceeds. */
export async function recordCheckoutFeeQuote(
  input: Parameters<typeof recordFeeQuote>[0],
): Promise<void> {
  try {
    await recordFeeQuote({ ...input, accepted: true });
  } catch (error) {
    report(error, {
      event: "fees.quote.recordFailed",
      fields: { orderId: input.orderId, organizationId: input.organizationId },
    });
  }
}

/** `player.fees.quote`: the all-in price before commitment. */
export async function quoteCatalogPurchase(input: {
  readonly personId: string;
  readonly request: z.infer<typeof feesQuoteInputSchema>;
  readonly now: Date;
}): Promise<FeesQuote> {
  const database = getDatabase();
  const { request } = input;
  const [row] = await database
    .select({ item: catalogItems, organization: organizations })
    .from(catalogItems)
    .innerJoin(organizations, eq(catalogItems.organizationId, organizations.id))
    .where(
      and(
        eq(catalogItems.id, request.catalogItemId),
        eq(catalogItems.organizationId, request.organizationId),
      ),
    )
    .limit(1);
  if (!row || row.item.status === "archived")
    throw new TRPCError({ code: "NOT_FOUND" });
  const [variant] = await database
    .select()
    .from(catalogVariants)
    .where(
      and(
        eq(catalogVariants.catalogItemId, row.item.id),
        request.variantId
          ? eq(catalogVariants.id, request.variantId)
          : undefined,
      ),
    )
    .orderBy(asc(catalogVariants.createdAt))
    .limit(1);
  if (!variant) throw new TRPCError({ code: "NOT_FOUND" });
  // The price a buyer without a membership sees; checkout reprices members.
  const [price] = await database
    .select()
    .from(catalogPrices)
    .where(
      and(
        eq(catalogPrices.catalogVariantId, variant.id),
        eq(catalogPrices.paymentKind, "card"),
        eq(catalogPrices.active, true),
        inArray(catalogPrices.audience, ["everyone", "non-member"]),
      ),
    )
    .limit(1);
  if (!price?.amountMinor || !row.item.allowCard) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "This item cannot be paid by card.",
    });
  }
  const currency = currencySchema
    .catch("USD")
    .parse(row.organization.currency.toUpperCase()) as CurrencyCode;
  const itemKind = catalogOrderItemKind(row.item);
  const premium =
    itemKind !== "merchandise"
      ? await hasActiveDunaPlusMembership(input.personId, input.now)
      : false;
  const commission = resolveOrganizationCommissionPolicy(row.organization);
  const quote = quoteCheckoutFees({
    currency,
    isDunaPlus: premium,
    tender: "online-card",
    items: [
      {
        id: variant.id,
        kind: itemKind,
        description: row.item.title,
        quantity: request.quantity,
        unitAmountMinor: price.amountMinor,
      },
    ],
    commission: {
      rateBps: commission.rateBps,
      organizationId: row.organization.id,
      plan: commission.effectivePlan,
      source: commission.source,
    },
  });
  return recordFeeQuote({
    organizationId: row.organization.id,
    buyerPersonId: input.personId,
    catalogItemId: row.item.id,
    surface: request.surface,
    currency,
    itemLabel: row.item.title,
    quote,
    premiumApplied: premium && quote.priced.dunaPlusSavingsMinor > 0,
    now: input.now,
  });
}
