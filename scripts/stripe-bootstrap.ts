import { loadEnvFile } from "node:process";
import { eq } from "drizzle-orm";
import Stripe from "stripe";
import {
  MEMBERSHIP_PLANS,
  ORGANIZATION_PLANS,
  membershipTierCode,
  type MembershipBillingInterval,
  type PaidMembershipPlanId,
  type PaidOrganizationPlanId,
} from "../packages/core/src/index.ts";
import { getDatabase, membershipTiers } from "../packages/db/src/index.ts";

try {
  loadEnvFile(".env.local");
} catch {
  // CI and one-off invocations may provide the key through the environment.
}

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  throw new Error("Set STRIPE_SECRET_KEY in .env.local before bootstrapping.");
}
if (!key.startsWith("sk_test_")) {
  throw new Error("Duna bootstrap only accepts Stripe sandbox secret keys.");
}

const stripe = new Stripe(key, {
  appInfo: { name: "Duna bootstrap", version: "0.1.0" },
  apiVersion: "2026-07-29.dahlia",
  maxNetworkRetries: 3,
});

type PriceDefinition = {
  readonly key: string;
  readonly productKey: string;
  readonly productName: string;
  readonly productDescription: string;
  readonly amountMinor: number;
  readonly recurring?: "month" | "year";
  readonly membership?: {
    readonly plan: PaidMembershipPlanId;
    readonly interval: MembershipBillingInterval;
  };
  readonly organization?: {
    readonly plan: PaidOrganizationPlanId;
    readonly interval: MembershipBillingInterval;
  };
};

const definitions: readonly PriceDefinition[] = [
  {
    key: "duna_premium_monthly",
    productKey: "duna_premium",
    productName: "Duna Premium",
    productDescription:
      "No Duna service fees, 8 upload hours, and 2 live-broadcast hours each month.",
    amountMinor: 999,
    recurring: "month",
    membership: { plan: "premium", interval: "month" },
  },
  {
    key: "duna_premium_annual",
    productKey: "duna_premium",
    productName: "Duna Premium",
    productDescription:
      "No Duna service fees, 8 upload hours, and 2 live-broadcast hours each month.",
    amountMinor: 9_900,
    recurring: "year",
    membership: { plan: "premium", interval: "year" },
  },
  {
    key: "duna_premium_plus_monthly",
    productKey: "duna_premium_plus",
    productName: "Duna Premium+",
    productDescription:
      "No Duna service fees, 30 upload hours, 8 live-broadcast hours, and advanced video insights.",
    amountMinor: 2_999,
    recurring: "month",
    membership: { plan: "premium-plus", interval: "month" },
  },
  {
    key: "duna_premium_plus_annual",
    productKey: "duna_premium_plus",
    productName: "Duna Premium+",
    productDescription:
      "No Duna service fees, 30 upload hours, 8 live-broadcast hours, and advanced video insights.",
    amountMinor: 29_900,
    recurring: "year",
    membership: { plan: "premium-plus", interval: "year" },
  },
  {
    key: "duna_hq_club_monthly",
    productKey: "duna_hq_club",
    productName: ORGANIZATION_PLANS["small-club"].productName,
    productDescription: ORGANIZATION_PLANS["small-club"].tagline,
    amountMinor: ORGANIZATION_PLANS["small-club"].monthlyPriceMinor,
    recurring: "month",
    organization: { plan: "small-club", interval: "month" },
  },
  {
    key: "duna_hq_club_annual",
    productKey: "duna_hq_club",
    productName: ORGANIZATION_PLANS["small-club"].productName,
    productDescription: ORGANIZATION_PLANS["small-club"].tagline,
    amountMinor: ORGANIZATION_PLANS["small-club"].annualPriceMinor,
    recurring: "year",
    organization: { plan: "small-club", interval: "year" },
  },
  {
    key: "duna_hq_facility_monthly",
    productKey: "duna_hq_facility",
    productName: ORGANIZATION_PLANS.club.productName,
    productDescription: ORGANIZATION_PLANS.club.tagline,
    amountMinor: ORGANIZATION_PLANS.club.monthlyPriceMinor,
    recurring: "month",
    organization: { plan: "club", interval: "month" },
  },
  {
    key: "duna_hq_facility_annual",
    productKey: "duna_hq_facility",
    productName: ORGANIZATION_PLANS.club.productName,
    productDescription: ORGANIZATION_PLANS.club.tagline,
    amountMinor: ORGANIZATION_PLANS.club.annualPriceMinor,
    recurring: "year",
    organization: { plan: "club", interval: "year" },
  },
  {
    key: "duna_hq_network_monthly",
    productKey: "duna_hq_network",
    productName: ORGANIZATION_PLANS["multi-venue"].productName,
    productDescription: ORGANIZATION_PLANS["multi-venue"].tagline,
    amountMinor: ORGANIZATION_PLANS["multi-venue"].monthlyPriceMinor,
    recurring: "month",
    organization: { plan: "multi-venue", interval: "month" },
  },
  {
    key: "duna_hq_network_annual",
    productKey: "duna_hq_network",
    productName: ORGANIZATION_PLANS["multi-venue"].productName,
    productDescription: ORGANIZATION_PLANS["multi-venue"].tagline,
    amountMinor: ORGANIZATION_PLANS["multi-venue"].annualPriceMinor,
    recurring: "year",
    organization: { plan: "multi-venue", interval: "year" },
  },
];

async function findOrCreateProduct(definition: PriceDefinition) {
  const productKey = definition.productKey;
  const products = await stripe.products.list({
    active: true,
    limit: 100,
  });
  const existing = products.data.find(
    (product) =>
      product.metadata.duna_product === productKey ||
      product.name === definition.productName,
  );
  if (existing) {
    if (existing.metadata.duna_product !== productKey) {
      return stripe.products.update(existing.id, {
        metadata: {
          ...existing.metadata,
          duna_product: productKey,
          provisioned_by: "duna-bootstrap",
        },
      });
    }
    return existing;
  }
  return stripe.products.create(
    {
      name: definition.productName,
      description: definition.productDescription,
      metadata: {
        duna_product: productKey,
        provisioned_by: "duna-bootstrap",
      },
    },
    { idempotencyKey: `duna-product-${productKey}` },
  );
}

async function findOrCreatePrice(
  definition: PriceDefinition,
  productId: string,
) {
  const prices = await stripe.prices.list({
    active: true,
    limit: 100,
  });
  const existing = prices.data.find(
    (price) => price.metadata.duna_key === definition.key,
  );
  if (existing) return existing;
  return stripe.prices.create(
    {
      product: productId,
      currency: "usd",
      unit_amount: definition.amountMinor,
      recurring: definition.recurring
        ? { interval: definition.recurring }
        : undefined,
      tax_behavior: "exclusive",
      metadata: {
        duna_key: definition.key,
        provisioned_by: "duna-bootstrap",
      },
    },
    { idempotencyKey: `duna-price-${definition.key}-${productId}` },
  );
}

async function main() {
  const account = await stripe.accounts.retrieve();
  if (!account.id) {
    throw new Error("Stripe sandbox account could not be resolved.");
  }

  const resources: Record<string, string> = {};
  for (const definition of definitions) {
    const product = await findOrCreateProduct(definition);
    const price = await findOrCreatePrice(definition, product.id);
    resources[definition.key] = price.id;
  }

  if (process.env.DATABASE_URL) {
    const database = getDatabase();
    const membershipDefinitions = definitions.filter(
      (definition) => definition.membership,
    );
    for (const definition of membershipDefinitions) {
      const membership = definition.membership;
      if (!membership) continue;
      const { plan, interval } = membership;
      const planDefinition = MEMBERSHIP_PLANS[plan];
      const code = membershipTierCode(plan, interval);
      const existing = await database.query.membershipTiers.findFirst({
        where: eq(membershipTiers.code, code),
      });
      const values = {
        code,
        name: `${planDefinition.name} ${interval === "month" ? "Monthly" : "Annual"}`,
        priceMinor: definition.amountMinor,
        currency: "USD",
        interval,
        stripePriceId: resources[definition.key],
        benefits: planDefinition.benefits,
        active: true,
        updatedAt: new Date(),
      };
      if (existing) {
        await database
          .update(membershipTiers)
          .set(values)
          .where(eq(membershipTiers.id, existing.id));
      } else {
        await database.insert(membershipTiers).values(values);
      }
    }
  }

  const existingClocks = await stripe.testHelpers.testClocks.list({
    limit: 100,
  });
  const testClock =
    existingClocks.data.find(
      (clock) =>
        clock.name === "Duna subscription lifecycle" &&
        clock.status !== "internal_failure",
    ) ??
    (await stripe.testHelpers.testClocks.create({
      frozen_time: Math.floor(Date.now() / 1000),
      name: "Duna subscription lifecycle",
    }));

  process.stdout.write(
    JSON.stringify(
      {
        mode: "sandbox",
        account: account.id,
        resources,
        environment: {
          STRIPE_DUNA_PREMIUM_MONTHLY_PRICE_ID: resources.duna_premium_monthly,
          STRIPE_DUNA_PREMIUM_ANNUAL_PRICE_ID: resources.duna_premium_annual,
          STRIPE_DUNA_PREMIUM_PLUS_MONTHLY_PRICE_ID:
            resources.duna_premium_plus_monthly,
          STRIPE_DUNA_PREMIUM_PLUS_ANNUAL_PRICE_ID:
            resources.duna_premium_plus_annual,
          STRIPE_HQ_CLUB_MONTHLY_PRICE_ID: resources.duna_hq_club_monthly,
          STRIPE_HQ_CLUB_ANNUAL_PRICE_ID: resources.duna_hq_club_annual,
          STRIPE_HQ_FACILITY_MONTHLY_PRICE_ID:
            resources.duna_hq_facility_monthly,
          STRIPE_HQ_FACILITY_ANNUAL_PRICE_ID: resources.duna_hq_facility_annual,
          STRIPE_HQ_NETWORK_MONTHLY_PRICE_ID: resources.duna_hq_network_monthly,
          STRIPE_HQ_NETWORK_ANNUAL_PRICE_ID: resources.duna_hq_network_annual,
        },
        testClock: testClock.id,
      },
      null,
      2,
    ),
  );
}

void main();
