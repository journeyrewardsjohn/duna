import { loadEnvFile } from "node:process";
import { eq } from "drizzle-orm";
import Stripe from "stripe";
import {
  MEMBERSHIP_PLANS,
  ORGANIZATION_PLANS,
  ORGANIZATION_VIDEO_ADD_ONS,
  ORGANIZATION_VIDEO_RATES,
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
  readonly amountMinor?: number;
  readonly amountDecimal?: string;
  readonly taxCode: string;
  readonly recurring?: "month" | "year";
  readonly meterEventName?: string;
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
    taxCode: "txcd_10103000",
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
    taxCode: "txcd_10103000",
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
    taxCode: "txcd_10103000",
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
    taxCode: "txcd_10103000",
    recurring: "year",
    membership: { plan: "premium-plus", interval: "year" },
  },
  {
    key: "duna_hq_club_monthly",
    productKey: "duna_hq_club",
    productName: ORGANIZATION_PLANS["small-club"].productName,
    productDescription: ORGANIZATION_PLANS["small-club"].tagline,
    amountMinor: ORGANIZATION_PLANS["small-club"].monthlyPriceMinor,
    taxCode: "txcd_10103001",
    recurring: "month",
    organization: { plan: "small-club", interval: "month" },
  },
  {
    key: "duna_hq_club_annual",
    productKey: "duna_hq_club",
    productName: ORGANIZATION_PLANS["small-club"].productName,
    productDescription: ORGANIZATION_PLANS["small-club"].tagline,
    amountMinor: ORGANIZATION_PLANS["small-club"].annualPriceMinor,
    taxCode: "txcd_10103001",
    recurring: "year",
    organization: { plan: "small-club", interval: "year" },
  },
  {
    key: "duna_hq_facility_monthly",
    productKey: "duna_hq_facility",
    productName: ORGANIZATION_PLANS.club.productName,
    productDescription: ORGANIZATION_PLANS.club.tagline,
    amountMinor: ORGANIZATION_PLANS.club.monthlyPriceMinor,
    taxCode: "txcd_10103001",
    recurring: "month",
    organization: { plan: "club", interval: "month" },
  },
  {
    key: "duna_hq_facility_annual",
    productKey: "duna_hq_facility",
    productName: ORGANIZATION_PLANS.club.productName,
    productDescription: ORGANIZATION_PLANS.club.tagline,
    amountMinor: ORGANIZATION_PLANS.club.annualPriceMinor,
    taxCode: "txcd_10103001",
    recurring: "year",
    organization: { plan: "club", interval: "year" },
  },
  ...(["month", "year"] as const).flatMap((interval) => [
    {
      key: `duna_hq_upload_pack_${interval}ly`,
      productKey: "duna_hq_upload_pack",
      productName: "Duna HQ Upload Video Pack",
      productDescription:
        "Adds 10 uploaded-video hours to each monthly allowance.",
      amountMinor:
        ORGANIZATION_VIDEO_ADD_ONS.upload.monthlyPriceMinor *
        (interval === "month" ? 1 : 10),
      taxCode: "txcd_10103001",
      recurring: interval,
    },
    {
      key: `duna_hq_live_pack_${interval}ly`,
      productKey: "duna_hq_live_pack",
      productName: "Duna HQ Live Video Pack",
      productDescription: "Adds 2 live-video hours to each monthly allowance.",
      amountMinor:
        ORGANIZATION_VIDEO_ADD_ONS.live.monthlyPriceMinor *
        (interval === "month" ? 1 : 10),
      taxCode: "txcd_10103001",
      recurring: interval,
    },
  ]),
  {
    key: "duna_hq_upload_payg",
    productKey: "duna_hq_upload_payg",
    productName: "Duna HQ Uploaded Video PAYG",
    productDescription:
      "Uploaded-video seconds beyond the included monthly allowance.",
    amountDecimal: (
      ORGANIZATION_VIDEO_RATES.upload.customerPriceMinor / 3_600
    ).toFixed(12),
    taxCode: "txcd_10103001",
    recurring: "month",
    meterEventName: "duna_hq_upload_overage_seconds",
  },
  {
    key: "duna_hq_live_payg",
    productKey: "duna_hq_live_payg",
    productName: "Duna HQ Live Video PAYG",
    productDescription:
      "Live-video seconds beyond the included monthly allowance.",
    amountDecimal: (
      ORGANIZATION_VIDEO_RATES.live.customerPriceMinor / 3_600
    ).toFixed(12),
    taxCode: "txcd_10103001",
    recurring: "month",
    meterEventName: "duna_hq_live_overage_seconds",
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
    return stripe.products.update(existing.id, {
      name: definition.productName,
      description: definition.productDescription,
      tax_code: definition.taxCode,
      metadata: {
        ...existing.metadata,
        duna_product: productKey,
        provisioned_by: "duna-bootstrap",
      },
    });
  }
  return stripe.products.create(
    {
      name: definition.productName,
      description: definition.productDescription,
      tax_code: definition.taxCode,
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
  meterId?: string,
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
      ...(definition.amountMinor === undefined
        ? {
            unit_amount_decimal: Stripe.Decimal.from(
              definition.amountDecimal ?? "0",
            ),
          }
        : { unit_amount: definition.amountMinor }),
      recurring: definition.recurring
        ? {
            interval: definition.recurring,
            ...(meterId
              ? { usage_type: "metered" as const, meter: meterId }
              : {}),
          }
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

async function findOrCreateMeter(eventName: string) {
  const meters = await stripe.billing.meters.list({ limit: 100 });
  const existing = meters.data.find((meter) => meter.event_name === eventName);
  if (existing) return existing;
  return stripe.billing.meters.create({
    display_name: eventName.replaceAll("_", " "),
    event_name: eventName,
    default_aggregation: { formula: "sum" },
    customer_mapping: {
      type: "by_id",
      event_payload_key: "stripe_customer_id",
    },
    value_settings: { event_payload_key: "value" },
  });
}

async function archiveRetiredNetworkPlan() {
  const products = await stripe.products.list({ active: true, limit: 100 });
  for (const product of products.data.filter(
    (candidate) => candidate.metadata.duna_product === "duna_hq_network",
  )) {
    const prices = await stripe.prices.list({
      active: true,
      product: product.id,
      limit: 100,
    });
    for (const price of prices.data) {
      await stripe.prices.update(price.id, { active: false });
    }
    await stripe.products.update(product.id, { active: false });
  }
}

async function main() {
  const account = await stripe.accounts.retrieve(null);
  if (!account.id) {
    throw new Error("Stripe sandbox account could not be resolved.");
  }

  const resources: Record<string, string> = {};
  for (const definition of definitions) {
    const product = await findOrCreateProduct(definition);
    const meter = definition.meterEventName
      ? await findOrCreateMeter(definition.meterEventName)
      : undefined;
    const price = await findOrCreatePrice(definition, product.id, meter?.id);
    resources[definition.key] = price.id;
  }
  await archiveRetiredNetworkPlan();

  if (process.env.DATABASE_URL) {
    const database = getDatabase();
    const membershipDefinitions = definitions.filter(
      (definition) => definition.membership,
    );
    for (const definition of membershipDefinitions) {
      const membership = definition.membership;
      if (!membership) continue;
      if (definition.amountMinor === undefined) {
        throw new Error(`${definition.key} is missing its fixed amount.`);
      }
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
          STRIPE_HQ_UPLOAD_PACK_MONTHLY_PRICE_ID:
            resources.duna_hq_upload_pack_monthly,
          STRIPE_HQ_UPLOAD_PACK_ANNUAL_PRICE_ID:
            resources.duna_hq_upload_pack_yearly,
          STRIPE_HQ_LIVE_PACK_MONTHLY_PRICE_ID:
            resources.duna_hq_live_pack_monthly,
          STRIPE_HQ_LIVE_PACK_ANNUAL_PRICE_ID:
            resources.duna_hq_live_pack_yearly,
          STRIPE_HQ_UPLOAD_PAYG_PRICE_ID: resources.duna_hq_upload_payg,
          STRIPE_HQ_LIVE_PAYG_PRICE_ID: resources.duna_hq_live_payg,
        },
        testClock: testClock.id,
      },
      null,
      2,
    ),
  );
}

void main();
