/**
 * `operator.fees.quote` (PART-B): the all-in preview a club sees on its price
 * screens: what a player pays and what the club receives. The SAME
 * composition checkout charges (`quoteCheckoutFees`, the club's plan from
 * `resolveOrganizationCommissionPolicy`) and the same tender choice
 * (`catalog-checkout.ts`: card is an online card payment; credits and cash
 * at the club carry no Duna fees). Nothing is recorded; no fee is invented:
 * anything Duna cannot price answers `status: "unavailable"` with a reason.
 */
import {
  catalogItems,
  catalogPrices,
  catalogVariants,
  getDatabase,
  organizations,
} from "@duna/db";
import { quoteCheckoutFees, type CurrencyCode } from "@duna/pricing";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { z } from "zod";
import { catalogOrderItemKind } from "../../catalog-checkout";
import { currencySchema } from "../../contracts";
import type {
  FeesOperatorQuote,
  feesOperatorQuoteInputSchema,
} from "../../contracts/fees";
import { resolveOrganizationCommissionPolicy } from "../../organization-billing";

type Input = z.infer<typeof feesOperatorQuoteInputSchema>;

function unavailable(
  reason: Extract<FeesOperatorQuote, { status: "unavailable" }>["reason"],
  message: string,
): FeesOperatorQuote {
  return { status: "unavailable", reason, message };
}

export async function quoteOperatorPrice(input: {
  readonly organizationId: string;
  readonly request: Input;
}): Promise<FeesOperatorQuote> {
  const { request } = input;
  const database = getDatabase();
  const organization = await database.query.organizations.findFirst({
    where: eq(organizations.id, input.organizationId),
  });
  if (!organization) throw new TRPCError({ code: "NOT_FOUND" });
  const currency = currencySchema.safeParse(request.currency.toUpperCase());
  if (!currency.success) {
    return unavailable(
      "currency-not-supported",
      `Duna Pay does not price ${request.currency.toUpperCase()} yet.`,
    );
  }
  if (currency.data !== organization.currency.toUpperCase()) {
    return unavailable(
      "currency-mismatch",
      `This club sells in ${organization.currency.toUpperCase()}.`,
    );
  }

  let title = "Price";
  // A draft price is priced as the kind of offering being edited.
  let kind = catalogOrderItemKind({
    type: request.offeringType,
    subtype: request.offeringSubtype ?? "",
  });
  let unitPriceMinor = request.priceMinor;
  let unitCredits: number | undefined;
  if (request.offeringId) {
    const [item] = await database
      .select()
      .from(catalogItems)
      .where(
        and(
          eq(catalogItems.id, request.offeringId),
          eq(catalogItems.organizationId, input.organizationId),
        ),
      )
      .limit(1);
    if (!item || item.status === "archived") {
      throw new TRPCError({ code: "NOT_FOUND" });
    }
    title = item.title;
    kind = catalogOrderItemKind(item);
    if (request.method === "card" && !item.allowCard) {
      return unavailable(
        "card-not-accepted",
        "This offering does not take card payments.",
      );
    }
    if (request.method === "credits" && !item.allowCredits) {
      return unavailable(
        "credits-not-accepted",
        "This offering does not take credits.",
      );
    }
    // The everyday price of the first variant, as player.fees.quote reads it.
    const [variant] = await database
      .select()
      .from(catalogVariants)
      .where(eq(catalogVariants.catalogItemId, item.id))
      .orderBy(asc(catalogVariants.createdAt))
      .limit(1);
    const prices = variant
      ? await database
          .select()
          .from(catalogPrices)
          .where(
            and(
              eq(catalogPrices.catalogVariantId, variant.id),
              eq(catalogPrices.active, true),
              inArray(catalogPrices.audience, ["everyone", "non-member"]),
            ),
          )
      : [];
    if (request.method === "credits") {
      unitCredits =
        prices.find((price) => price.paymentKind === "credit")?.creditAmount ??
        undefined;
      if (!unitCredits) {
        return unavailable(
          "no-credit-price",
          "Set a credit price for this offering first.",
        );
      }
    } else {
      unitPriceMinor =
        prices.find((price) => price.paymentKind === "card")?.amountMinor ??
        undefined;
      if (unitPriceMinor === undefined || unitPriceMinor === null) {
        return unavailable(
          "no-card-price",
          "Set a price for this offering first.",
        );
      }
    }
  }

  if (request.method === "credits") {
    if (unitCredits === undefined) {
      return unavailable(
        "price-needed",
        "Credit prices are read from a saved offering.",
      );
    }
    const credits = unitCredits * request.quantity;
    return {
      status: "ok",
      unit: "credits",
      method: "credits",
      quantity: request.quantity,
      playerPaysCredits: credits,
      clubReceivesCredits: credits,
      lines: [],
    };
  }

  const commission = resolveOrganizationCommissionPolicy(organization);
  return composeOperatorQuote({
    currency: currency.data as CurrencyCode,
    method: request.method,
    title,
    kind,
    offeringId: request.offeringId,
    unitPriceMinor: unitPriceMinor ?? 0,
    quantity: request.quantity,
    commission: {
      rateBps: commission.rateBps,
      organizationId: organization.id,
      plan: commission.effectivePlan,
      source: commission.source,
    },
  });
}

/** Pure: the money quote from a price and the club's plan (also the demo answer). */
export function composeOperatorQuote(input: {
  readonly currency: CurrencyCode;
  readonly method: "card" | "cash";
  readonly title: string;
  readonly kind: ReturnType<typeof catalogOrderItemKind>;
  readonly offeringId?: string;
  readonly unitPriceMinor: number;
  readonly quantity: number;
  readonly commission: {
    readonly rateBps: number;
    readonly organizationId: string;
    readonly plan: string;
    readonly source: "plan-default" | "admin-override";
  };
}): FeesOperatorQuote {
  const code = input.currency;
  const quote = quoteCheckoutFees({
    currency: code,
    // The price a buyer without Duna Premium sees.
    isDunaPlus: false,
    // Checkout's own choice: cash at the club carries no Duna fees.
    tender: input.method === "card" ? "online-card" : "credits",
    items: [
      {
        id: input.offeringId ?? "draft-price",
        kind: input.kind,
        description: input.title,
        quantity: input.quantity,
        unitAmountMinor: input.unitPriceMinor,
      },
    ],
    commission: input.commission,
  });
  const amount = (amountMinor: number) => ({
    amountMinor: Math.max(0, amountMinor),
    currency: code,
  });
  const processing = quote.processingFee?.amountMinor ?? 0;
  const organizationFee = quote.organizationFee?.amountMinor ?? 0;
  const lines = [
    {
      kind: "item" as const,
      label: input.title,
      amount: amount(quote.priced.subtotalMinor),
      payer: "player" as const,
    },
    ...(quote.serviceFeeMinor > 0
      ? [
          {
            kind: "service-fee" as const,
            label: "Duna service fee",
            amount: amount(quote.serviceFeeMinor),
            payer: "player" as const,
          },
        ]
      : []),
    ...(processing > 0
      ? [
          {
            kind: "processing" as const,
            label: "Card processing",
            amount: amount(processing),
            payer: "club" as const,
          },
        ]
      : []),
    ...(organizationFee > 0
      ? [
          {
            kind: "organization-fee" as const,
            label: "Duna organization fee",
            amount: amount(organizationFee),
            payer: "club" as const,
          },
        ]
      : []),
  ];
  return {
    status: "ok",
    unit: "money",
    method: input.method,
    quantity: input.quantity,
    price: amount(quote.priced.subtotalMinor),
    playerPays: amount(quote.priced.totalMinor),
    clubReceives: amount(quote.priced.totalMinor - quote.applicationFeeMinor),
    dunaFees: amount(quote.applicationFeeMinor),
    lines,
    planKey: input.commission.plan,
    organizationFeeBps: input.commission.rateBps,
    premiumWaivesServiceFee: quote.serviceFeeMinor > 0,
    feeRuleVersion: quote.feeRuleVersion,
  };
}
