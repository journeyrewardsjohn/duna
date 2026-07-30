import { loadEnvFile } from "node:process";
import Stripe from "stripe";

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
  maxNetworkRetries: 3,
});

type PriceDefinition = {
  readonly key: string;
  readonly productName: string;
  readonly productDescription: string;
  readonly amountMinor: number;
  readonly recurring?: "month" | "year";
};

const definitions: readonly PriceDefinition[] = [
  {
    key: "duna_plus_monthly",
    productName: "Duna+",
    productDescription:
      "No platform fees, deeper player insight, guest passes, and enhanced convenience.",
    amountMinor: 799,
    recurring: "month",
  },
  {
    key: "duna_plus_annual",
    productName: "Duna+",
    productDescription:
      "No platform fees, deeper player insight, guest passes, and enhanced convenience.",
    amountMinor: 5900,
    recurring: "year",
  },
  {
    key: "operator_small_club_monthly",
    productName: "Duna HQ — Small Club",
    productDescription:
      "Complete club operations for a growing program or single-location club.",
    amountMinor: 19_900,
    recurring: "month",
  },
  {
    key: "operator_club_monthly",
    productName: "Duna HQ — Club",
    productDescription:
      "Full club and facility operating system with advanced reporting and controls.",
    amountMinor: 49_900,
    recurring: "month",
  },
  {
    key: "registration_service_2",
    productName: "Duna Registration Service",
    productDescription:
      "Organizer-side league or tournament registration service fee.",
    amountMinor: 200,
  },
  {
    key: "registration_service_3",
    productName: "Duna Registration Service",
    productDescription:
      "Organizer-side league or tournament registration service fee.",
    amountMinor: 300,
  },
  {
    key: "registration_service_4",
    productName: "Duna Registration Service",
    productDescription:
      "Organizer-side league or tournament registration service fee.",
    amountMinor: 400,
  },
];

async function findOrCreateProduct(definition: PriceDefinition) {
  const productKey =
    definition.productName === "Duna+"
      ? "duna_plus"
      : definition.productName.includes("Small Club")
        ? "operator_small_club"
        : definition.productName === "Duna HQ — Club"
          ? "operator_club"
          : "registration_service";
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
        testClock: testClock.id,
      },
      null,
      2,
    ),
  );
}

void main();
