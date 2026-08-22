import type {
  MembershipBillingInterval,
  OrganizationBillingInterval,
  OrganizationPlanId,
  PaidMembershipPlanId,
  PaidOrganizationPlanId,
} from "@duna/core";
import { ORGANIZATION_FEE_POLICY_VERSION } from "@duna/core";
import type { MembershipSubscriptionPolicy } from "@duna/core";
import Stripe from "stripe";
import {
  connectAccountMetadataEntityId,
  connectAccountMoneyReady,
} from "./stripe-connect";
import { STRIPE_TAX_CODES, marketplaceAutomaticTax } from "./tax-policy";

let stripeClient: Stripe | undefined;

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getStripeClient(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  stripeClient ??= new Stripe(secretKey, {
    appInfo: { name: "Duna", version: "0.1.0" },
    apiVersion: "2026-07-29.dahlia",
    maxNetworkRetries: 2,
  });
  return stripeClient;
}

export function getStripePublishableKey(): string {
  const publishableKey =
    process.env.STRIPE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!publishableKey?.startsWith("pk_")) {
    throw new Error("STRIPE_PUBLISHABLE_KEY is not configured");
  }
  return publishableKey;
}

export async function retrieveMarketplaceTaxReadiness(): Promise<{
  readonly status: "active" | "pending";
  readonly headOfficeConfigured: boolean;
  readonly activeRegistrationCount: number;
  readonly missingFields: readonly string[];
}> {
  const stripe = getStripeClient();
  const [settings, registrations] = await Promise.all([
    stripe.tax.settings.retrieve(),
    stripe.tax.registrations.list({ status: "active", limit: 100 }),
  ]);
  const missingFields =
    settings.status === "pending"
      ? (settings.status_details.pending?.missing_fields ?? [])
      : [];
  const headOfficeConfigured = Boolean(settings.head_office?.address);
  const activeRegistrationCount = registrations.data.length;
  return {
    status:
      settings.status === "active" &&
      headOfficeConfigured &&
      activeRegistrationCount > 0
        ? "active"
        : "pending",
    headOfficeConfigured,
    activeRegistrationCount,
    missingFields,
  };
}

export async function getOrCreatePlayerStripeCustomer(input: {
  readonly personId: string;
  readonly existingCustomerId?: string;
  readonly email?: string;
  readonly displayName?: string;
}): Promise<string> {
  if (input.existingCustomerId) return input.existingCustomerId;

  const stripe = getStripeClient();
  const matchingCustomers = await stripe.customers.search({
    query: `metadata['dunaPersonId']:'${input.personId}'`,
    limit: 1,
  });
  const existingCustomer = matchingCustomers.data[0];
  if (existingCustomer) return existingCustomer.id;

  const customer = await stripe.customers.create(
    {
      email: input.email,
      name: input.displayName,
      metadata: { dunaPersonId: input.personId },
    },
    { idempotencyKey: `duna-player-customer:${input.personId}` },
  );
  return customer.id;
}

export async function createMobilePaymentCustomerSession(
  customerId: string,
): Promise<string> {
  const session = await getStripeClient().customerSessions.create({
    customer: customerId,
    components: {
      mobile_payment_element: {
        enabled: true,
        features: {
          payment_method_save: "enabled",
          payment_method_redisplay: "enabled",
          payment_method_remove: "enabled",
        },
      },
    },
  });
  return session.client_secret;
}

export function membershipPriceId(
  plan: PaidMembershipPlanId,
  interval: MembershipBillingInterval,
): string | undefined {
  if (plan === "premium-plus") {
    return interval === "month"
      ? process.env.STRIPE_DUNA_PREMIUM_PLUS_MONTHLY_PRICE_ID
      : process.env.STRIPE_DUNA_PREMIUM_PLUS_ANNUAL_PRICE_ID;
  }
  return interval === "month"
    ? (process.env.STRIPE_DUNA_PREMIUM_MONTHLY_PRICE_ID ??
        process.env.STRIPE_DUNA_PLUS_MONTHLY_PRICE_ID)
    : (process.env.STRIPE_DUNA_PREMIUM_ANNUAL_PRICE_ID ??
        process.env.STRIPE_DUNA_PLUS_ANNUAL_PRICE_ID);
}

export function isMembershipPriceConfigured(
  plan: PaidMembershipPlanId,
  interval: MembershipBillingInterval,
): boolean {
  return Boolean(membershipPriceId(plan, interval));
}

export function organizationPlanPriceId(
  plan: PaidOrganizationPlanId,
  interval: OrganizationBillingInterval,
): string | undefined {
  if (plan === "small-club") {
    return interval === "month"
      ? (process.env.STRIPE_HQ_CLUB_MONTHLY_PRICE_ID ??
          process.env.STRIPE_SMALL_CLUB_MONTHLY_PRICE_ID)
      : (process.env.STRIPE_HQ_CLUB_ANNUAL_PRICE_ID ??
          process.env.STRIPE_SMALL_CLUB_ANNUAL_PRICE_ID);
  }
  if (plan === "club") {
    return interval === "month"
      ? (process.env.STRIPE_HQ_FACILITY_MONTHLY_PRICE_ID ??
          process.env.STRIPE_CLUB_MONTHLY_PRICE_ID)
      : (process.env.STRIPE_HQ_FACILITY_ANNUAL_PRICE_ID ??
          process.env.STRIPE_CLUB_ANNUAL_PRICE_ID);
  }
  return undefined;
}

export function isOrganizationPlanPriceConfigured(
  plan: PaidOrganizationPlanId,
  interval: OrganizationBillingInterval,
): boolean {
  return Boolean(organizationPlanPriceId(plan, interval));
}

export type OrganizationVideoPriceKind =
  "upload-pack" | "live-pack" | "upload-payg" | "live-payg";

export function organizationVideoPriceId(
  kind: OrganizationVideoPriceKind,
  interval: OrganizationBillingInterval,
): string | undefined {
  if (kind === "upload-pack") {
    return interval === "month"
      ? process.env.STRIPE_HQ_UPLOAD_PACK_MONTHLY_PRICE_ID
      : process.env.STRIPE_HQ_UPLOAD_PACK_ANNUAL_PRICE_ID;
  }
  if (kind === "live-pack") {
    return interval === "month"
      ? process.env.STRIPE_HQ_LIVE_PACK_MONTHLY_PRICE_ID
      : process.env.STRIPE_HQ_LIVE_PACK_ANNUAL_PRICE_ID;
  }
  return kind === "upload-payg"
    ? process.env.STRIPE_HQ_UPLOAD_PAYG_PRICE_ID
    : process.env.STRIPE_HQ_LIVE_PAYG_PRICE_ID;
}

export function organizationVideoPriceKindForPriceId(
  priceId: string,
): OrganizationVideoPriceKind | undefined {
  for (const kind of [
    "upload-pack",
    "live-pack",
    "upload-payg",
    "live-payg",
  ] as const) {
    for (const interval of ["month", "year"] as const) {
      if (organizationVideoPriceId(kind, interval) === priceId) return kind;
    }
  }
  return undefined;
}

export async function recordOrganizationVideoMeterEvent(input: {
  readonly customerId: string;
  readonly kind: "upload" | "live";
  readonly overageSeconds: number;
  readonly videoId: string;
  readonly occurredAt: Date;
}): Promise<void> {
  if (input.overageSeconds <= 0) return;
  await getStripeClient().billing.meterEvents.create({
    event_name: `duna_hq_${input.kind}_overage_seconds`,
    identifier: `duna-hq-${input.kind}-${input.videoId}`,
    payload: {
      stripe_customer_id: input.customerId,
      value: String(input.overageSeconds),
    },
    timestamp: Math.floor(input.occurredAt.getTime() / 1_000),
  });
}

export function organizationPlanForPriceId(priceId: string):
  | {
      readonly plan: PaidOrganizationPlanId;
      readonly interval: OrganizationBillingInterval;
    }
  | undefined {
  const plans: readonly PaidOrganizationPlanId[] = ["small-club", "club"];
  const intervals: readonly OrganizationBillingInterval[] = ["month", "year"];
  for (const plan of plans) {
    for (const interval of intervals) {
      if (organizationPlanPriceId(plan, interval) === priceId) {
        return { plan, interval };
      }
    }
  }
  return undefined;
}

export async function createDunaPlusCheckout(input: {
  readonly personId: string;
  readonly email?: string;
  readonly plan: PaidMembershipPlanId;
  readonly interval: MembershipBillingInterval;
  readonly successUrl: string;
  readonly cancelUrl: string;
  readonly idempotencyKey: string;
}): Promise<{ readonly id: string; readonly url: string | null }> {
  const priceId = membershipPriceId(input.plan, input.interval);
  if (!priceId) {
    throw new Error(
      `${input.plan === "premium-plus" ? "Premium+" : "Premium"} ${input.interval} price is not configured`,
    );
  }
  const metadata = {
    dunaPersonId: input.personId,
    dunaPlan: input.plan,
    product: "duna-membership",
  };
  const session = await getStripeClient().checkout.sessions.create(
    {
      mode: "subscription",
      customer_email: input.email,
      client_reference_id: input.personId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      automatic_tax: {
        enabled: process.env.STRIPE_AUTOMATIC_TAX_ENABLED === "true",
      },
      tax_id_collection: { enabled: true },
      subscription_data: {
        metadata,
      },
      metadata,
    },
    { idempotencyKey: input.idempotencyKey },
  );
  return { id: session.id, url: session.url };
}

export async function createOrganizationPlanCheckout(input: {
  readonly organizationId: string;
  readonly customerId?: string;
  readonly email?: string;
  readonly plan: PaidOrganizationPlanId;
  readonly interval: OrganizationBillingInterval;
  readonly uploadPackQuantity?: number;
  readonly livePackQuantity?: number;
  readonly payAsYouGo?: boolean;
  readonly successUrl: string;
  readonly cancelUrl: string;
  readonly idempotencyKey: string;
}): Promise<{ readonly id: string; readonly url: string | null }> {
  const priceId = organizationPlanPriceId(input.plan, input.interval);
  if (!priceId) {
    throw new Error(
      `${input.plan} ${input.interval} organization price is not configured`,
    );
  }
  const metadata = {
    dunaOrganizationId: input.organizationId,
    dunaPlan: input.plan,
    product: "duna-hq",
    dunaUploadPackQuantity: String(input.uploadPackQuantity ?? 0),
    dunaLivePackQuantity: String(input.livePackQuantity ?? 0),
    dunaVideoPayg: String(input.payAsYouGo ?? false),
  };
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    { price: priceId, quantity: 1 },
  ];
  for (const [kind, quantity] of [
    ["upload-pack", input.uploadPackQuantity ?? 0],
    ["live-pack", input.livePackQuantity ?? 0],
  ] as const) {
    if (quantity <= 0) continue;
    const addOnPriceId = organizationVideoPriceId(kind, input.interval);
    if (!addOnPriceId) throw new Error(`${kind} price is not configured`);
    lineItems.push({ price: addOnPriceId, quantity });
  }
  if (input.payAsYouGo) {
    for (const kind of ["upload-payg", "live-payg"] as const) {
      const paygPriceId = organizationVideoPriceId(kind, "month");
      if (!paygPriceId) throw new Error(`${kind} price is not configured`);
      lineItems.push({ price: paygPriceId });
    }
  }
  const session = await getStripeClient().checkout.sessions.create(
    {
      mode: "subscription",
      ...(input.customerId
        ? { customer: input.customerId }
        : { customer_email: input.email }),
      client_reference_id: input.organizationId,
      line_items: lineItems,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      allow_promotion_codes: true,
      billing_address_collection: "required",
      automatic_tax: {
        enabled: process.env.STRIPE_AUTOMATIC_TAX_ENABLED === "true",
      },
      tax_id_collection: { enabled: true },
      subscription_data: {
        metadata,
        billing_mode: { type: "flexible" },
      },
      metadata,
    },
    { idempotencyKey: input.idempotencyKey },
  );
  return { id: session.id, url: session.url };
}

export async function createEventCheckoutSession(input: {
  readonly orderId: string;
  readonly personId: string;
  readonly customerEmail?: string;
  readonly eventId: string;
  readonly eventTitle: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly applicationFeeMinor: number;
  readonly organizationCommissionMinor: number;
  readonly organizationCommissionRateBps: number;
  readonly connectedAccountId: string;
  readonly automaticTaxEnabled: boolean;
  readonly stripeTaxCode: string;
  readonly successUrl: string;
  readonly cancelUrl: string;
  readonly expiresAt: Date;
  readonly idempotencyKey: string;
}): Promise<{
  readonly id: string;
  readonly url: string | null;
  readonly expiresAt: string;
}> {
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new Error("Checkout amount must be a positive minor-unit integer");
  }
  if (
    !Number.isSafeInteger(input.applicationFeeMinor) ||
    input.applicationFeeMinor < 0 ||
    input.applicationFeeMinor > input.amountMinor
  ) {
    throw new Error("Connected checkout application fee is invalid");
  }
  const session = await getStripeClient().checkout.sessions.create(
    {
      mode: "payment",
      client_reference_id: input.personId,
      customer_email: input.customerEmail,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: input.currency.toLowerCase(),
            unit_amount: input.amountMinor,
            product_data: {
              name: input.eventTitle,
              tax_code: input.stripeTaxCode,
              metadata: { dunaEventId: input.eventId },
            },
            tax_behavior: "exclusive",
          },
        },
      ],
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      expires_at: Math.floor(input.expiresAt.getTime() / 1_000),
      automatic_tax: marketplaceAutomaticTax(input.automaticTaxEnabled),
      payment_intent_data: {
        application_fee_amount: input.applicationFeeMinor,
        on_behalf_of: input.connectedAccountId,
        transfer_data: { destination: input.connectedAccountId },
        metadata: {
          dunaOrderId: input.orderId,
          dunaEventId: input.eventId,
          dunaPersonId: input.personId,
          dunaOrganizationCommissionMinor: String(
            input.organizationCommissionMinor,
          ),
          dunaOrganizationCommissionRateBps: String(
            input.organizationCommissionRateBps,
          ),
        },
      },
      metadata: {
        dunaOrderId: input.orderId,
        dunaEventId: input.eventId,
        dunaPersonId: input.personId,
      },
    },
    { idempotencyKey: input.idempotencyKey },
  );
  return {
    id: session.id,
    url: session.url,
    expiresAt: new Date(session.expires_at * 1_000).toISOString(),
  };
}

export async function createEventPaymentIntent(input: {
  readonly orderId: string;
  readonly personId: string;
  readonly customerId: string;
  readonly customerEmail?: string;
  readonly eventId: string;
  readonly eventTitle: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly applicationFeeMinor: number;
  readonly organizationCommissionMinor: number;
  readonly organizationCommissionRateBps: number;
  readonly connectedAccountId: string;
  readonly idempotencyKey: string;
}): Promise<{
  readonly id: string;
  readonly clientSecret: string;
}> {
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new Error("Payment amount must be a positive minor-unit integer");
  }
  if (
    !Number.isSafeInteger(input.applicationFeeMinor) ||
    input.applicationFeeMinor < 0 ||
    input.applicationFeeMinor > input.amountMinor
  ) {
    throw new Error("Connected payment application fee is invalid");
  }

  const intent = await getStripeClient().paymentIntents.create(
    {
      amount: input.amountMinor,
      currency: input.currency.toLowerCase(),
      customer: input.customerId,
      receipt_email: input.customerEmail,
      description: input.eventTitle,
      automatic_payment_methods: { enabled: true },
      application_fee_amount: input.applicationFeeMinor,
      on_behalf_of: input.connectedAccountId,
      transfer_data: { destination: input.connectedAccountId },
      metadata: {
        dunaOrderId: input.orderId,
        dunaEventId: input.eventId,
        dunaPersonId: input.personId,
        dunaOrganizationCommissionMinor: String(
          input.organizationCommissionMinor,
        ),
        dunaOrganizationCommissionRateBps: String(
          input.organizationCommissionRateBps,
        ),
        channel: "native-payment-sheet",
      },
    },
    { idempotencyKey: `${input.idempotencyKey}:native-payment` },
  );
  if (!intent.client_secret) {
    throw new Error("Stripe did not return a PaymentIntent client secret");
  }
  return { id: intent.id, clientSecret: intent.client_secret };
}

export async function createCourtBookingPaymentIntent(input: {
  readonly orderId: string;
  readonly bookingId: string;
  readonly personId: string;
  readonly customerId: string;
  readonly customerEmail?: string;
  readonly description: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly applicationFeeMinor: number;
  readonly organizationCommissionMinor: number;
  readonly organizationCommissionRateBps: number;
  readonly connectedAccountId: string;
  readonly idempotencyKey: string;
}): Promise<{
  readonly id: string;
  readonly clientSecret: string;
}> {
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new Error("Court payment amount must be a positive integer");
  }
  if (
    !Number.isSafeInteger(input.applicationFeeMinor) ||
    input.applicationFeeMinor < 0 ||
    input.applicationFeeMinor > input.amountMinor
  ) {
    throw new Error("Court payment application fee is invalid");
  }

  const intent = await getStripeClient().paymentIntents.create(
    {
      amount: input.amountMinor,
      currency: input.currency.toLowerCase(),
      customer: input.customerId,
      receipt_email: input.customerEmail,
      description: input.description,
      automatic_payment_methods: { enabled: true },
      application_fee_amount: input.applicationFeeMinor,
      on_behalf_of: input.connectedAccountId,
      transfer_data: { destination: input.connectedAccountId },
      metadata: {
        dunaOrderId: input.orderId,
        dunaBookingId: input.bookingId,
        dunaPersonId: input.personId,
        dunaOrganizationCommissionMinor: String(
          input.organizationCommissionMinor,
        ),
        dunaOrganizationCommissionRateBps: String(
          input.organizationCommissionRateBps,
        ),
        channel: "native-payment-sheet",
      },
    },
    { idempotencyKey: `${input.idempotencyKey}:native-payment` },
  );
  if (!intent.client_secret) {
    throw new Error("Stripe did not return a PaymentIntent client secret");
  }
  return { id: intent.id, clientSecret: intent.client_secret };
}

interface CatalogNativePaymentInput {
  readonly orderId: string;
  readonly personId: string;
  readonly customerId: string;
  readonly customerEmail?: string;
  readonly organizationId: string;
  readonly catalogItemId: string;
  readonly catalogVariantId: string;
  readonly title: string;
  readonly stripePriceId: string;
  readonly quantity: number;
  readonly subtotalMinor: number;
  readonly serviceFeeMinor: number;
  readonly currency: string;
  readonly applicationFeeMinor: number;
  readonly organizationCommissionMinor: number;
  readonly organizationCommissionRateBps: number;
  readonly connectedAccountId: string;
  readonly recurringInterval?: "week" | "month" | "year";
  readonly recurringIntervalCount?: number;
  readonly subscriptionPolicy?: MembershipSubscriptionPolicy;
  readonly idempotencyKey: string;
}

function catalogPaymentMetadata(input: CatalogNativePaymentInput) {
  return {
    dunaOrderId: input.orderId,
    dunaPersonId: input.personId,
    dunaOrganizationId: input.organizationId,
    dunaCatalogItemId: input.catalogItemId,
    dunaCatalogVariantId: input.catalogVariantId,
    product: "organization-catalog",
    channel: "native-payment-sheet",
    dunaOrganizationCommissionMinor: String(input.organizationCommissionMinor),
    dunaOrganizationCommissionRateBps: String(
      input.organizationCommissionRateBps,
    ),
    dunaApplicationFeeMinor: String(input.applicationFeeMinor),
  };
}

async function getOrCreateDunaServiceFeeProduct(): Promise<string> {
  const stripe = getStripeClient();
  const configured = process.env.STRIPE_DUNA_SERVICE_FEE_PRODUCT_ID;
  if (configured?.startsWith("prod_")) return configured;

  const products = await stripe.products.search({
    query: "metadata['dunaProduct']:'catalog-service-fee'",
    limit: 1,
  });
  const existing = products.data[0];
  if (existing) return existing.id;

  const product = await stripe.products.create(
    {
      name: "Duna service fee",
      description: "Platform service fee for an organization purchase.",
      metadata: { dunaProduct: "catalog-service-fee" },
    },
    { idempotencyKey: "duna-catalog-service-fee-product" },
  );
  return product.id;
}

/**
 * Creates the server-side payment objects consumed by Stripe PaymentSheet.
 * Recurring plans use an incomplete Subscription and its first invoice secret;
 * one-time products use a normal PaymentIntent.
 */
export async function createCatalogNativePayment(
  input: CatalogNativePaymentInput,
): Promise<{ readonly id: string; readonly clientSecret: string }> {
  const totalAmountMinor = input.subtotalMinor + input.serviceFeeMinor;
  if (!Number.isSafeInteger(totalAmountMinor) || totalAmountMinor <= 0) {
    throw new Error("Catalog payment amount must be positive");
  }
  if (
    !Number.isSafeInteger(input.applicationFeeMinor) ||
    input.applicationFeeMinor < 0 ||
    input.applicationFeeMinor > totalAmountMinor
  ) {
    throw new Error("Catalog payment application fee is invalid");
  }
  const metadata = catalogPaymentMetadata(input);
  if (!input.recurringInterval) {
    const intent = await getStripeClient().paymentIntents.create(
      {
        amount: totalAmountMinor,
        currency: input.currency.toLowerCase(),
        customer: input.customerId,
        receipt_email: input.customerEmail,
        description: input.title,
        automatic_payment_methods: { enabled: true },
        application_fee_amount: input.applicationFeeMinor,
        on_behalf_of: input.connectedAccountId,
        transfer_data: { destination: input.connectedAccountId },
        metadata,
      },
      { idempotencyKey: `${input.idempotencyKey}:native-payment` },
    );
    if (!intent.client_secret) {
      throw new Error("Stripe did not return a PaymentIntent client secret");
    }
    return { id: intent.id, clientSecret: intent.client_secret };
  }

  if (input.quantity !== 1) {
    throw new Error("Recurring plans must be purchased one at a time");
  }
  const serviceFeeProductId =
    input.serviceFeeMinor > 0
      ? await getOrCreateDunaServiceFeeProduct()
      : undefined;
  const applicationFeePercent =
    Math.round((input.applicationFeeMinor / totalAmountMinor) * 10_000) / 100;
  const subscription = await getStripeClient().subscriptions.create(
    {
      customer: input.customerId,
      items: [
        { price: input.stripePriceId, quantity: 1 },
        ...(serviceFeeProductId
          ? [
              {
                price_data: {
                  currency: input.currency.toLowerCase(),
                  product: serviceFeeProductId,
                  recurring: {
                    interval: input.recurringInterval,
                    interval_count: input.recurringIntervalCount ?? 1,
                  },
                  unit_amount: input.serviceFeeMinor,
                },
                quantity: 1,
              } as const,
            ]
          : []),
      ],
      application_fee_percent: applicationFeePercent,
      on_behalf_of: input.connectedAccountId,
      transfer_data: { destination: input.connectedAccountId },
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      metadata,
      expand: ["latest_invoice.confirmation_secret"],
    },
    { idempotencyKey: `${input.idempotencyKey}:native-subscription` },
  );
  const invoice =
    typeof subscription.latest_invoice === "object"
      ? subscription.latest_invoice
      : undefined;
  const clientSecret = invoice?.confirmation_secret?.client_secret;
  if (!clientSecret) {
    throw new Error("Stripe did not return the first invoice payment secret");
  }
  const paymentIntentId = clientSecret.split("_secret_")[0];
  if (!paymentIntentId?.startsWith("pi_")) {
    throw new Error("Stripe returned an invalid invoice payment secret");
  }
  return { id: paymentIntentId, clientSecret };
}

export async function createCourtCheckoutSession(input: {
  readonly orderId: string;
  readonly bookingId: string;
  readonly personId: string;
  readonly customerEmail?: string;
  readonly description: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly applicationFeeMinor: number;
  readonly organizationCommissionMinor: number;
  readonly organizationCommissionRateBps: number;
  readonly connectedAccountId: string;
  readonly automaticTaxEnabled: boolean;
  readonly successUrl: string;
  readonly cancelUrl: string;
  readonly expiresAt: Date;
  readonly idempotencyKey: string;
}): Promise<{
  readonly id: string;
  readonly url: string | null;
  readonly expiresAt: string;
}> {
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new Error("Court checkout amount must be a positive integer");
  }
  if (
    !Number.isSafeInteger(input.applicationFeeMinor) ||
    input.applicationFeeMinor < 0 ||
    input.applicationFeeMinor > input.amountMinor
  ) {
    throw new Error("Court checkout application fee is invalid");
  }
  const session = await getStripeClient().checkout.sessions.create(
    {
      mode: "payment",
      client_reference_id: input.personId,
      customer_email: input.customerEmail,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: input.currency.toLowerCase(),
            unit_amount: input.amountMinor,
            product_data: {
              name: input.description,
              tax_code: STRIPE_TAX_CODES.singleUseFacilityAccess,
              metadata: { dunaBookingId: input.bookingId },
            },
            tax_behavior: "exclusive",
          },
        },
      ],
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      expires_at: Math.floor(input.expiresAt.getTime() / 1_000),
      automatic_tax: marketplaceAutomaticTax(input.automaticTaxEnabled),
      payment_intent_data: {
        application_fee_amount: input.applicationFeeMinor,
        on_behalf_of: input.connectedAccountId,
        transfer_data: { destination: input.connectedAccountId },
        metadata: {
          dunaOrderId: input.orderId,
          dunaBookingId: input.bookingId,
          dunaPersonId: input.personId,
          dunaOrganizationCommissionMinor: String(
            input.organizationCommissionMinor,
          ),
          dunaOrganizationCommissionRateBps: String(
            input.organizationCommissionRateBps,
          ),
        },
      },
      metadata: {
        dunaOrderId: input.orderId,
        dunaBookingId: input.bookingId,
        dunaPersonId: input.personId,
      },
    },
    { idempotencyKey: input.idempotencyKey },
  );
  return {
    id: session.id,
    url: session.url,
    expiresAt: new Date(session.expires_at * 1_000).toISOString(),
  };
}

export async function createCatalogCheckoutSession(input: {
  readonly orderId: string;
  readonly personId: string;
  readonly customerEmail?: string;
  readonly organizationId: string;
  readonly catalogItemId: string;
  readonly catalogVariantId: string;
  readonly title: string;
  readonly stripePriceId: string;
  readonly quantity: number;
  readonly subtotalMinor: number;
  readonly serviceFeeMinor: number;
  readonly currency: string;
  readonly applicationFeeMinor: number;
  readonly organizationCommissionMinor: number;
  readonly organizationCommissionRateBps: number;
  readonly connectedAccountId: string;
  readonly recurringInterval?: "week" | "month" | "year";
  readonly recurringIntervalCount?: number;
  readonly subscriptionPolicy?: MembershipSubscriptionPolicy;
  readonly automaticTaxEnabled: boolean;
  readonly stripeTaxCode: string;
  readonly collectShippingAddress: boolean;
  readonly successUrl: string;
  readonly cancelUrl: string;
  readonly expiresAt: Date;
  readonly idempotencyKey: string;
  readonly discountCouponId?: string;
  readonly promoCode?: string;
  readonly installmentPlan?: {
    readonly count: number;
    readonly installmentAmountMinor: number;
    readonly totalMinor: number;
  };
}): Promise<{
  readonly id: string;
  readonly url: string | null;
  readonly expiresAt: string;
}> {
  if (!Number.isSafeInteger(input.quantity) || input.quantity < 1) {
    throw new Error("Catalog checkout quantity must be a positive integer");
  }
  if (!Number.isSafeInteger(input.subtotalMinor) || input.subtotalMinor <= 0) {
    throw new Error("Catalog checkout subtotal must be positive");
  }
  if (
    !Number.isSafeInteger(input.serviceFeeMinor) ||
    input.serviceFeeMinor < 0
  ) {
    throw new Error("Catalog checkout service fee is invalid");
  }
  const totalAmountMinor = input.subtotalMinor + input.serviceFeeMinor;
  if (
    !Number.isSafeInteger(input.applicationFeeMinor) ||
    input.applicationFeeMinor < 0 ||
    input.applicationFeeMinor > totalAmountMinor
  ) {
    throw new Error("Catalog checkout application fee is invalid");
  }
  const recurring = Boolean(input.recurringInterval || input.installmentPlan);
  if (recurring && input.quantity !== 1) {
    throw new Error("Recurring plans must be purchased one at a time");
  }
  if (
    input.recurringIntervalCount !== undefined &&
    (!Number.isSafeInteger(input.recurringIntervalCount) ||
      input.recurringIntervalCount < 1)
  ) {
    throw new Error("Catalog checkout recurring interval count is invalid");
  }
  const metadata = {
    dunaOrderId: input.orderId,
    dunaPersonId: input.personId,
    dunaOrganizationId: input.organizationId,
    dunaCatalogItemId: input.catalogItemId,
    dunaCatalogVariantId: input.catalogVariantId,
    product: "organization-catalog",
    dunaOrganizationCommissionMinor: String(input.organizationCommissionMinor),
    dunaOrganizationCommissionRateBps: String(
      input.organizationCommissionRateBps,
    ),
    dunaApplicationFeeMinor: String(input.applicationFeeMinor),
    ...(input.promoCode ? { dunaPromoCode: input.promoCode } : {}),
    ...(input.installmentPlan
      ? {
          dunaPaymentOption: "installments",
          dunaInstallmentCount: String(input.installmentPlan.count),
          dunaInstallmentTotalMinor: String(input.installmentPlan.totalMinor),
          dunaInstallmentFirstInvoiceMinor: String(
            input.installmentPlan.installmentAmountMinor +
              input.serviceFeeMinor,
          ),
        }
      : {}),
    ...(input.subscriptionPolicy
      ? {
          dunaMembershipPolicyVersion: input.subscriptionPolicy.version,
          dunaMembershipInitialTermMonths: String(
            input.subscriptionPolicy.initialTermMonths ?? 0,
          ),
          dunaMembershipRenewalBehavior:
            input.subscriptionPolicy.renewalBehavior,
        }
      : {}),
  };
  if (input.automaticTaxEnabled) {
    await ensureStripePriceTaxCode(input.stripePriceId, input.stripeTaxCode);
  }
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    input.installmentPlan
      ? {
          quantity: 1,
          price_data: {
            currency: input.currency.toLowerCase(),
            unit_amount: input.installmentPlan.installmentAmountMinor,
            product_data: {
              name: input.title,
              description: `${input.installmentPlan.count} fixed monthly payments through Duna`,
              metadata: { dunaCatalogItemId: input.catalogItemId },
            },
            recurring: { interval: "month", interval_count: 1 },
          },
        }
      : { price: input.stripePriceId, quantity: input.quantity },
  ];
  if (input.serviceFeeMinor > 0) {
    lineItems.push({
      quantity: 1,
      price_data: {
        currency: input.currency.toLowerCase(),
        unit_amount: input.serviceFeeMinor,
        product_data: {
          name: "Duna service fee",
          description:
            "Platform service fee for this organization transaction.",
          tax_code: STRIPE_TAX_CODES.generalServices,
          metadata: { dunaOrderId: input.orderId },
        },
        tax_behavior: "exclusive",
        recurring:
          input.recurringInterval && !input.installmentPlan
            ? {
                interval: input.recurringInterval,
                interval_count: input.recurringIntervalCount ?? 1,
              }
            : undefined,
      },
    });
  }
  const session = await getStripeClient().checkout.sessions.create(
    {
      mode: recurring ? "subscription" : "payment",
      client_reference_id: input.personId,
      customer_email: input.customerEmail,
      line_items: lineItems,
      discounts: input.discountCouponId
        ? [{ coupon: input.discountCouponId }]
        : undefined,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      expires_at: Math.floor(input.expiresAt.getTime() / 1_000),
      billing_address_collection: input.automaticTaxEnabled
        ? "required"
        : "auto",
      shipping_address_collection: input.collectShippingAddress
        ? {
            allowed_countries: [
              "US",
              "CA",
              "AU",
              "BR",
              "GB",
              "FR",
              "DE",
              "ES",
              "IT",
              "NL",
            ],
          }
        : undefined,
      automatic_tax: marketplaceAutomaticTax(input.automaticTaxEnabled),
      payment_intent_data: recurring
        ? undefined
        : {
            application_fee_amount: input.applicationFeeMinor,
            on_behalf_of: input.connectedAccountId,
            transfer_data: { destination: input.connectedAccountId },
            metadata,
          },
      subscription_data: recurring
        ? {
            on_behalf_of: input.connectedAccountId,
            transfer_data: { destination: input.connectedAccountId },
            ...(input.installmentPlan && input.applicationFeeMinor > 0
              ? {
                  application_fee_percent: Number(
                    (
                      (input.applicationFeeMinor / totalAmountMinor) *
                      100
                    ).toFixed(2),
                  ),
                }
              : {}),
            invoice_settings: input.automaticTaxEnabled
              ? { issuer: { type: "self" } }
              : undefined,
            metadata,
            trial_period_days: input.subscriptionPolicy?.trialDays || undefined,
            trial_settings: input.subscriptionPolicy?.trialDays
              ? {
                  end_behavior: {
                    missing_payment_method:
                      input.subscriptionPolicy.trialPaymentMethod === "optional"
                        ? "cancel"
                        : "create_invoice",
                  },
                }
              : undefined,
          }
        : undefined,
      payment_method_collection:
        recurring &&
        input.subscriptionPolicy?.trialDays &&
        input.subscriptionPolicy.trialPaymentMethod === "optional"
          ? "if_required"
          : "always",
      metadata,
    },
    { idempotencyKey: input.idempotencyKey },
  );
  return {
    id: session.id,
    url: session.url,
    expiresAt: new Date(session.expires_at * 1_000).toISOString(),
  };
}

export async function capCatalogInstallmentSubscription(input: {
  readonly subscriptionId: string;
  readonly installmentCount: number;
  readonly idempotencyKey: string;
}): Promise<string> {
  if (
    !Number.isSafeInteger(input.installmentCount) ||
    input.installmentCount < 2 ||
    input.installmentCount > 24
  ) {
    throw new Error("Installment count must be between 2 and 24");
  }
  const stripe = getStripeClient();
  const schedule = await stripe.subscriptionSchedules.create(
    { from_subscription: input.subscriptionId },
    { idempotencyKey: `${input.idempotencyKey}:create-schedule` },
  );
  const phase = schedule.phases[0];
  if (!phase) throw new Error("Stripe did not return an installment phase");
  await stripe.subscriptionSchedules.update(
    schedule.id,
    {
      end_behavior: "cancel",
      phases: [
        {
          start_date: phase.start_date,
          duration: {
            interval: "month",
            interval_count: input.installmentCount,
          },
          items: phase.items.map((item) => ({
            price: typeof item.price === "string" ? item.price : item.price.id,
            quantity: item.quantity ?? 1,
          })),
          ...(phase.application_fee_percent !== null
            ? { application_fee_percent: phase.application_fee_percent }
            : {}),
          ...(phase.on_behalf_of
            ? {
                on_behalf_of:
                  typeof phase.on_behalf_of === "string"
                    ? phase.on_behalf_of
                    : phase.on_behalf_of.id,
              }
            : {}),
          ...(phase.transfer_data?.destination
            ? {
                transfer_data: {
                  destination:
                    typeof phase.transfer_data.destination === "string"
                      ? phase.transfer_data.destination
                      : phase.transfer_data.destination.id,
                },
              }
            : {}),
        },
      ],
    },
    { idempotencyKey: `${input.idempotencyKey}:cap-schedule` },
  );
  return schedule.id;
}

async function ensureStripePriceTaxCode(
  stripePriceId: string,
  stripeTaxCode: string,
): Promise<void> {
  const stripe = getStripeClient();
  const price = await stripe.prices.retrieve(stripePriceId, {
    expand: ["product"],
  });
  const product =
    typeof price.product === "string"
      ? await stripe.products.retrieve(price.product)
      : price.product;
  if ("deleted" in product && product.deleted) {
    throw new Error("The Stripe product for this catalog item was deleted.");
  }
  const currentTaxCode =
    typeof product.tax_code === "string"
      ? product.tax_code
      : product.tax_code?.id;
  if (currentTaxCode === stripeTaxCode) return;
  await stripe.products.update(product.id, { tax_code: stripeTaxCode });
}

export async function withholdDestinationChargeTax(input: {
  readonly paymentIntentId: string;
  readonly latestChargeId?: string;
  readonly taxAmountMinor: number;
  readonly orderId: string;
  readonly idempotencyKey: string;
}): Promise<string | undefined> {
  if (!Number.isSafeInteger(input.taxAmountMinor) || input.taxAmountMinor < 0) {
    throw new Error("Tax withholding amount is invalid");
  }
  if (input.taxAmountMinor === 0) return undefined;
  const stripe = getStripeClient();
  const paymentIntent = input.latestChargeId
    ? undefined
    : await stripe.paymentIntents.retrieve(input.paymentIntentId, {
        expand: ["latest_charge"],
      });
  const latestCharge = input.latestChargeId ?? paymentIntent?.latest_charge;
  const charge =
    typeof latestCharge === "string"
      ? await stripe.charges.retrieve(latestCharge)
      : latestCharge;
  if (!charge || ("deleted" in charge && charge.deleted)) {
    throw new Error("Stripe charge is unavailable for tax withholding");
  }
  const transferId =
    typeof charge.transfer === "string" ? charge.transfer : charge.transfer?.id;
  if (!transferId) {
    throw new Error("Destination transfer is unavailable for tax withholding");
  }
  const reversal = await stripe.transfers.createReversal(
    transferId,
    {
      amount: input.taxAmountMinor,
      metadata: {
        dunaOrderId: input.orderId,
        purpose: "marketplace-tax-withholding",
      },
    },
    { idempotencyKey: input.idempotencyKey },
  );
  return reversal.id;
}

export async function withholdDestinationChargePlatformFee(input: {
  readonly paymentIntentId: string;
  readonly amountMinor: number;
  readonly invoiceId: string;
  readonly idempotencyKey: string;
}): Promise<string | undefined> {
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor < 0) {
    throw new Error("Platform fee withholding amount is invalid");
  }
  if (input.amountMinor === 0) return undefined;
  const stripe = getStripeClient();
  const paymentIntent = await stripe.paymentIntents.retrieve(
    input.paymentIntentId,
    { expand: ["latest_charge"] },
  );
  const latestCharge = paymentIntent.latest_charge;
  const charge =
    typeof latestCharge === "string"
      ? await stripe.charges.retrieve(latestCharge)
      : latestCharge;
  const chargeTransfer = charge?.transfer;
  const transferId =
    typeof chargeTransfer === "string" ? chargeTransfer : chargeTransfer?.id;
  if (!transferId) {
    throw new Error("Destination transfer is unavailable for fee withholding");
  }
  const reversal = await stripe.transfers.createReversal(
    transferId,
    {
      amount: input.amountMinor,
      metadata: {
        dunaInvoiceId: input.invoiceId,
        purpose: "platform-fee-withholding",
      },
    },
    { idempotencyKey: input.idempotencyKey },
  );
  return reversal.id;
}

export async function createBillingPortalSession(input: {
  readonly customerId: string;
  readonly returnUrl: string;
}): Promise<{ readonly id: string; readonly url: string }> {
  const stripe = getStripeClient();
  const configuration = await stripe.billingPortal.configurations.create(
    {
      name: "Duna managed membership policies",
      business_profile: {
        headline:
          "Update payment details and view invoices. Membership cancellation is handled in Duna using the terms accepted at signup.",
        privacy_policy_url: "https://duna.coach/legal/privacy",
        terms_of_service_url: "https://duna.coach/legal/terms",
      },
      features: {
        customer_update: {
          enabled: true,
          allowed_updates: ["address", "email", "name", "phone", "tax_id"],
        },
        invoice_history: { enabled: true },
        payment_method_update: { enabled: true },
        subscription_cancel: { enabled: false },
        subscription_update: { enabled: false },
      },
      metadata: { dunaPolicy: "managed-memberships-v1" },
    },
    { idempotencyKey: "duna-billing-portal-managed-memberships-v1" },
  );
  const session = await stripe.billingPortal.sessions.create({
    customer: input.customerId,
    configuration: configuration.id,
    return_url: input.returnUrl,
  });
  return { id: session.id, url: session.url };
}

export async function ensureMembershipSubscriptionSchedule(input: {
  readonly subscriptionId: string;
  readonly policy: MembershipSubscriptionPolicy;
  readonly idempotencyKey: string;
}): Promise<{
  readonly scheduleId?: string;
  readonly initialTermEndsAt?: Date;
}> {
  if (!input.policy.initialTermMonths) return {};
  const stripe = getStripeClient();
  const subscription = await stripe.subscriptions.retrieve(
    input.subscriptionId,
    { expand: ["schedule"] },
  );
  const items = subscription.items.data.map((item) => ({
    price: typeof item.price === "string" ? item.price : item.price.id,
    quantity: item.quantity ?? 1,
  }));
  if (items.length === 0) {
    throw new Error("Membership subscription schedule has no prices.");
  }
  const existingScheduleId =
    typeof subscription.schedule === "string"
      ? subscription.schedule
      : subscription.schedule?.id;
  const schedule = existingScheduleId
    ? await stripe.subscriptionSchedules.retrieve(existingScheduleId)
    : await stripe.subscriptionSchedules.create(
        { from_subscription: subscription.id },
        { idempotencyKey: `${input.idempotencyKey}:create` },
      );
  const trialEnd = subscription.trial_end ?? undefined;
  const phaseStart =
    schedule.current_phase?.start_date ??
    subscription.items.data[0]?.current_period_start ??
    subscription.start_date;
  const paidPhaseStart =
    trialEnd && trialEnd > phaseStart ? trialEnd : phaseStart;
  const phases: Stripe.SubscriptionScheduleUpdateParams.Phase[] = [
    ...(trialEnd && trialEnd > phaseStart
      ? [
          {
            start_date: phaseStart,
            end_date: trialEnd,
            items,
            trial_end: trialEnd,
            proration_behavior: "none" as const,
          },
        ]
      : []),
    {
      start_date: paidPhaseStart,
      duration: {
        interval: "month",
        interval_count: input.policy.initialTermMonths,
      },
      items,
      metadata: {
        dunaMembershipPolicyVersion: input.policy.version,
        dunaMembershipInitialTermMonths: String(input.policy.initialTermMonths),
      },
      proration_behavior: "none",
    },
  ];
  const updated = await stripe.subscriptionSchedules.update(
    schedule.id,
    {
      end_behavior:
        input.policy.renewalBehavior === "ends-after-term"
          ? "cancel"
          : "release",
      phases,
      proration_behavior: "none",
    },
    { idempotencyKey: `${input.idempotencyKey}:configure` },
  );
  const finalPhase = updated.phases.at(-1);
  return {
    scheduleId: updated.id,
    initialTermEndsAt: finalPhase
      ? new Date(finalPhase.end_date * 1_000)
      : undefined,
  };
}

export async function cancelMembershipSubscription(input: {
  readonly subscriptionId: string;
  readonly policy: MembershipSubscriptionPolicy;
  readonly idempotencyKey: string;
  readonly now: Date;
  readonly earliestEffectiveAt?: Date;
}): Promise<{
  readonly cancelAtPeriodEnd: boolean;
  readonly effectiveAt?: Date;
  readonly refundId?: string;
  readonly invoiceId?: string;
  readonly refundAmountMinor: number;
}> {
  const stripe = getStripeClient();
  const subscription = await stripe.subscriptions.retrieve(
    input.subscriptionId,
    { expand: ["latest_invoice", "schedule"] },
  );
  const currentPeriodEnd = subscription.items.data[0]?.current_period_end;
  const commitmentEnd = input.earliestEffectiveAt;
  if (
    commitmentEnd &&
    commitmentEnd.getTime() > input.now.getTime() &&
    (!currentPeriodEnd || commitmentEnd.getTime() > currentPeriodEnd * 1_000)
  ) {
    const scheduleId =
      typeof subscription.schedule === "string"
        ? subscription.schedule
        : subscription.schedule?.id;
    if (scheduleId) {
      await stripe.subscriptionSchedules.update(
        scheduleId,
        { end_behavior: "cancel" },
        { idempotencyKey: `${input.idempotencyKey}:term-end` },
      );
    } else {
      await stripe.subscriptions.update(
        subscription.id,
        {
          cancel_at: Math.floor(commitmentEnd.getTime() / 1_000),
          proration_behavior: "none",
        },
        { idempotencyKey: `${input.idempotencyKey}:term-end` },
      );
    }
    return {
      cancelAtPeriodEnd: true,
      effectiveAt: commitmentEnd,
      refundAmountMinor: 0,
    };
  }
  if (input.policy.cancellationTiming === "period-end") {
    await stripe.subscriptions.update(
      subscription.id,
      { cancel_at_period_end: true },
      { idempotencyKey: `${input.idempotencyKey}:period-end` },
    );
    return {
      cancelAtPeriodEnd: true,
      effectiveAt: currentPeriodEnd
        ? new Date(currentPeriodEnd * 1_000)
        : undefined,
      refundAmountMinor: 0,
    };
  }

  const invoiceId =
    typeof subscription.latest_invoice === "string"
      ? subscription.latest_invoice
      : subscription.latest_invoice?.id;
  const invoice = invoiceId
    ? await stripe.invoices.retrieve(invoiceId)
    : undefined;
  const paidInvoicePayment = invoiceId
    ? (
        await stripe.invoicePayments.list({
          invoice: invoiceId,
          status: "paid",
          limit: 10,
        })
      ).data.find(
        (payment) =>
          payment.payment.type === "payment_intent" &&
          payment.amount_paid &&
          payment.amount_paid > 0,
      )
    : undefined;
  const paymentIntentId =
    typeof paidInvoicePayment?.payment.payment_intent === "string"
      ? paidInvoicePayment.payment.payment_intent
      : paidInvoicePayment?.payment.payment_intent?.id;
  const amountPaidMinor = paidInvoicePayment?.amount_paid ?? 0;
  let refundAmountMinor = 0;
  if (
    input.policy.refundBehavior === "full-within-window" &&
    invoice?.status_transitions.paid_at &&
    input.now.getTime() - invoice.status_transitions.paid_at * 1_000 <=
      (input.policy.refundWindowDays ?? 7) * 86_400_000
  ) {
    refundAmountMinor = amountPaidMinor;
  } else if (
    input.policy.refundBehavior === "prorated" &&
    amountPaidMinor > 0
  ) {
    const preview = await stripe.invoices.createPreview({
      subscription: subscription.id,
      subscription_details: {
        cancel_now: true,
        proration_behavior: "create_prorations",
      },
    });
    refundAmountMinor = Math.min(amountPaidMinor, Math.max(0, -preview.total));
  }

  await stripe.subscriptions.cancel(
    subscription.id,
    {
      invoice_now: input.policy.refundBehavior === "prorated",
      prorate: input.policy.refundBehavior === "prorated",
      cancellation_details: {
        comment: "Customer canceled online under the accepted Duna policy.",
      },
    },
    { idempotencyKey: `${input.idempotencyKey}:cancel` },
  );
  let refundId: string | undefined;
  if (refundAmountMinor > 0 && paymentIntentId && invoice) {
    const invoiceTaxMinor = [...(invoice.total_taxes ?? [])].reduce(
      (sum, tax) => sum + tax.amount,
      0,
    );
    const applicationFeeMinor = Number(
      subscription.metadata.dunaApplicationFeeMinor ?? 0,
    );
    const proportionalTaxMinor = Math.round(
      (invoiceTaxMinor * refundAmountMinor) / Math.max(1, amountPaidMinor),
    );
    const proportionalApplicationFeeMinor = Math.round(
      (applicationFeeMinor * refundAmountMinor) / Math.max(1, amountPaidMinor),
    );
    const refund = await stripe.refunds.create(
      {
        payment_intent: paymentIntentId,
        amount: refundAmountMinor,
        reason: "requested_by_customer",
        reverse_transfer: false,
        refund_application_fee: false,
        metadata: {
          dunaMembershipSubscriptionId: subscription.id,
          dunaInvoiceId: invoice.id,
          refundPolicy: input.policy.refundBehavior,
        },
      },
      { idempotencyKey: `${input.idempotencyKey}:refund` },
    );
    refundId = refund.id;
    const paymentIntent = await stripe.paymentIntents.retrieve(
      paymentIntentId,
      { expand: ["latest_charge"] },
    );
    const latestCharge = paymentIntent.latest_charge;
    const charge =
      typeof latestCharge === "string"
        ? await stripe.charges.retrieve(latestCharge)
        : latestCharge;
    const chargeTransfer = charge?.transfer;
    const transferId =
      typeof chargeTransfer === "string" ? chargeTransfer : chargeTransfer?.id;
    const organizationRefundShareMinor = Math.max(
      0,
      refundAmountMinor -
        proportionalTaxMinor -
        proportionalApplicationFeeMinor,
    );
    if (transferId && organizationRefundShareMinor > 0) {
      await stripe.transfers.createReversal(
        transferId,
        {
          amount: organizationRefundShareMinor,
          metadata: {
            dunaMembershipSubscriptionId: subscription.id,
            dunaInvoiceId: invoice.id,
            dunaRefundId: refund.id,
          },
        },
        { idempotencyKey: `${input.idempotencyKey}:transfer-reversal` },
      );
    }
    if (input.policy.refundBehavior === "prorated") {
      const customerId =
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer.id;
      await stripe.customers.createBalanceTransaction(
        customerId,
        {
          amount: refundAmountMinor,
          currency: invoice.currency,
          description:
            "Offset prorated membership credit refunded to original payment method",
          metadata: { dunaMembershipSubscriptionId: subscription.id },
        },
        { idempotencyKey: `${input.idempotencyKey}:offset-credit` },
      );
    }
  }
  return {
    cancelAtPeriodEnd: false,
    effectiveAt: input.now,
    refundId,
    invoiceId: invoice?.id,
    refundAmountMinor,
  };
}

export async function resumeMembershipSubscription(input: {
  readonly subscriptionId: string;
  readonly policy: MembershipSubscriptionPolicy;
  readonly idempotencyKey: string;
}): Promise<void> {
  const stripe = getStripeClient();
  const subscription = await stripe.subscriptions.retrieve(
    input.subscriptionId,
    { expand: ["schedule"] },
  );
  const scheduleId =
    typeof subscription.schedule === "string"
      ? subscription.schedule
      : subscription.schedule?.id;
  if (scheduleId) {
    await stripe.subscriptionSchedules.update(
      scheduleId,
      {
        end_behavior:
          input.policy.renewalBehavior === "ends-after-term"
            ? "cancel"
            : "release",
      },
      { idempotencyKey: `${input.idempotencyKey}:schedule` },
    );
  }
  await stripe.subscriptions.update(
    subscription.id,
    { cancel_at_period_end: false, cancel_at: "" },
    { idempotencyKey: `${input.idempotencyKey}:subscription` },
  );
}

export async function createBookingPaymentIntent(input: {
  readonly orderId: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly applicationFeeMinor?: number;
  readonly connectedAccountId?: string;
  readonly idempotencyKey: string;
}): Promise<{
  readonly id: string;
  readonly clientSecret: string | null;
}> {
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new Error("Payment amount must be a positive minor-unit integer");
  }
  const intent = await getStripeClient().paymentIntents.create(
    {
      amount: input.amountMinor,
      currency: input.currency.toLowerCase(),
      automatic_payment_methods: { enabled: true },
      application_fee_amount: input.connectedAccountId
        ? input.applicationFeeMinor
        : undefined,
      on_behalf_of: input.connectedAccountId,
      transfer_data: input.connectedAccountId
        ? { destination: input.connectedAccountId }
        : undefined,
      metadata: { dunaOrderId: input.orderId },
    },
    { idempotencyKey: input.idempotencyKey },
  );
  return { id: intent.id, clientSecret: intent.client_secret };
}

export async function createConnectOnboarding(input: {
  readonly accountId?: string;
  readonly personOrOrganizationId: string;
  readonly partyType: "club" | "coach" | "player";
  readonly contactEmail: string;
  readonly displayName: string;
  readonly countryCode: string;
  readonly refreshUrl: string;
  readonly returnUrl: string;
  readonly feePolicy?: {
    readonly rateBps: number;
    readonly source: "plan-default" | "admin-override";
    readonly plan: OrganizationPlanId;
  };
}): Promise<{ readonly accountId: string; readonly url: string }> {
  const stripe = getStripeClient();
  const accountId =
    input.accountId ??
    (
      await stripe.v2.core.accounts.create({
        contact_email: input.contactEmail,
        display_name: input.displayName,
        dashboard: "express",
        defaults: {
          responsibilities: {
            fees_collector: "application",
            losses_collector: "application",
          },
        },
        identity: {
          country: input.countryCode.toLowerCase(),
        },
        configuration: {
          merchant: {
            capabilities: {
              card_payments: { requested: true },
            },
          },
          recipient: {
            capabilities: {
              stripe_balance: {
                stripe_transfers: { requested: true },
              },
            },
          },
        },
        include: ["configuration.recipient", "identity", "requirements"],
        metadata: {
          dunaEntityId: input.personOrOrganizationId,
          dunaPartyType: input.partyType,
          ...(input.feePolicy
            ? {
                dunaOperatorCommissionBps: String(input.feePolicy.rateBps),
                dunaOperatorCommissionSource: input.feePolicy.source,
                dunaOrganizationPlan: input.feePolicy.plan,
                dunaFeePolicyVersion: ORGANIZATION_FEE_POLICY_VERSION,
              }
            : {}),
        },
      })
    ).id;
  if (input.accountId) {
    await stripe.v2.core.accounts.update(accountId, {
      configuration: {
        merchant: {
          capabilities: {
            card_payments: { requested: true },
          },
        },
        recipient: {
          capabilities: {
            stripe_balance: {
              stripe_transfers: { requested: true },
            },
          },
        },
      },
    });
  }
  if (input.accountId && input.feePolicy) {
    await updateConnectAccountFeeMetadata({
      accountId,
      organizationId: input.personOrOrganizationId,
      ...input.feePolicy,
    });
  }
  const link = await stripe.v2.core.accountLinks.create({
    account: accountId,
    use_case: {
      type: "account_onboarding",
      account_onboarding: {
        configurations: ["merchant", "recipient"],
        refresh_url: input.refreshUrl,
        return_url: input.returnUrl,
        collection_options: {
          fields: "eventually_due",
          future_requirements: "include",
        },
      },
    },
  });
  return { accountId, url: link.url };
}

export async function updateConnectAccountFeeMetadata(input: {
  readonly accountId: string;
  readonly organizationId: string;
  readonly rateBps: number;
  readonly source: "plan-default" | "admin-override";
  readonly plan: OrganizationPlanId;
}): Promise<void> {
  await getStripeClient().v2.core.accounts.update(input.accountId, {
    metadata: {
      dunaEntityId: input.organizationId,
      dunaOperatorCommissionBps: String(input.rateBps),
      dunaOperatorCommissionSource: input.source,
      dunaOrganizationPlan: input.plan,
      dunaFeePolicyVersion: ORGANIZATION_FEE_POLICY_VERSION,
    },
  });
}

export async function retrieveConnectAccountReadiness(
  accountId: string,
): Promise<{
  readonly accountId: string;
  readonly accountType: "v2-recipient";
  readonly chargesEnabled: boolean;
  readonly metadataEntityId?: string;
}> {
  const account = await getStripeClient().v2.core.accounts.retrieve(accountId, {
    include: ["configuration.recipient", "requirements"],
  });
  const object = account as unknown as Readonly<Record<string, unknown>>;
  return {
    accountId: account.id,
    accountType: "v2-recipient",
    chargesEnabled: connectAccountMoneyReady(object),
    metadataEntityId: connectAccountMetadataEntityId(object),
  };
}

function objectRecord(
  value: unknown,
): Readonly<Record<string, unknown>> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}

export async function loadConnectedAccountMoney(input: {
  readonly accountId: string;
  readonly currency: string;
}): Promise<{
  readonly accountId: string;
  readonly connected: boolean;
  readonly chargesEnabled: boolean;
  readonly payoutsEnabled: boolean;
  readonly bankStatus: "connected" | "missing" | "unverified" | "unavailable";
  readonly bankName?: string;
  readonly bankLast4?: string;
  readonly stripeAvailableMinor?: number;
  readonly stripePendingMinor?: number;
  readonly stripeInstantAvailableMinor?: number;
  readonly stripeReservedMinor?: number;
  readonly stripePayoutInterval?: "manual" | "daily" | "weekly" | "monthly";
  readonly earnings30d: {
    readonly grossMinor: number;
    readonly netMinor: number;
    readonly feesMinor: number;
    readonly payoutsMinor: number;
    readonly points: readonly {
      readonly date: string;
      readonly grossMinor: number;
      readonly netMinor: number;
    }[];
  };
  readonly bankAccounts: readonly {
    readonly id: string;
    readonly type: "bank-account" | "debit-card";
    readonly name: string;
    readonly last4: string;
    readonly currency?: "USD" | "CAD" | "AUD" | "BRL" | "EUR";
    readonly status: "connected" | "unverified" | "unavailable";
    readonly defaultForCurrency: boolean;
  }[];
  readonly activity: readonly {
    readonly id: string;
    readonly type: string;
    readonly reportingCategory: string;
    readonly description: string;
    readonly amountMinor: number;
    readonly feeMinor: number;
    readonly netMinor: number;
    readonly status: "available" | "pending";
    readonly availableAt: string;
    readonly occurredAt: string;
  }[];
  readonly disputes: readonly {
    readonly id: string;
    readonly kind: string;
    readonly status: string;
    readonly amountMinor: number;
    readonly currency: "USD" | "CAD" | "AUD" | "BRL" | "EUR";
    readonly dueAt?: string;
    readonly createdAt: string;
  }[];
  readonly requirementsDue: readonly string[];
  readonly settingsUrl?: string;
  readonly liveData: boolean;
  readonly livemode?: boolean;
}> {
  const stripe = getStripeClient();
  const [
    account,
    balance,
    externalAccounts,
    balanceTransactions,
    earningsBalanceTransactions,
    balanceSettings,
    stripeDisputes,
    v2Account,
    loginLink,
  ] = await Promise.all([
    stripe.accounts.retrieve(input.accountId),
    stripe.balance.retrieve({}, { stripeAccount: input.accountId }),
    stripe.accounts.listExternalAccounts(input.accountId, {
      limit: 10,
    }),
    stripe.balanceTransactions.list(
      { limit: 50 },
      { stripeAccount: input.accountId },
    ),
    stripe.balanceTransactions
      .list(
        {
          created: {
            gte: Math.floor(Date.now() / 1_000) - 30 * 24 * 60 * 60,
          },
          limit: 100,
        },
        { stripeAccount: input.accountId },
      )
      .autoPagingToArray({ limit: 500 }),
    stripe.balanceSettings.retrieve({}, { stripeAccount: input.accountId }),
    stripe.disputes.list({ limit: 100 }, { stripeAccount: input.accountId }),
    stripe.v2.core.accounts.retrieve(input.accountId, {
      include: [
        "configuration.merchant",
        "configuration.recipient",
        "requirements",
      ],
    }),
    stripe.accounts.createLoginLink(input.accountId).catch(() => undefined),
  ]);
  const requestedCurrency = input.currency.toLowerCase();
  const supportedCurrencies = ["USD", "CAD", "AUD", "BRL", "EUR"] as const;
  const normalizeCurrency = (
    value: string,
  ): (typeof supportedCurrencies)[number] => {
    const normalized = value.toUpperCase();
    return supportedCurrencies.includes(
      normalized as (typeof supportedCurrencies)[number],
    )
      ? (normalized as (typeof supportedCurrencies)[number])
      : "USD";
  };
  const amountFor = (
    amounts: readonly { readonly amount: number; readonly currency: string }[],
  ) =>
    amounts
      .filter((amount) => amount.currency === requestedCurrency)
      .reduce((total, amount) => total + amount.amount, 0);
  const payoutAccounts = externalAccounts.data.map((externalAccount) => {
    const isBank = externalAccount.object === "bank_account";
    const bankStatus = isBank ? externalAccount.status : undefined;
    const supportedCurrency = externalAccount.currency?.toUpperCase() ?? "";
    const normalizedCurrency = ["USD", "CAD", "AUD", "BRL", "EUR"].includes(
      supportedCurrency,
    )
      ? (supportedCurrency as "USD" | "CAD" | "AUD" | "BRL" | "EUR")
      : undefined;
    return {
      id: externalAccount.id,
      type: isBank ? ("bank-account" as const) : ("debit-card" as const),
      name: isBank
        ? (externalAccount.bank_name ?? "Bank account")
        : `${externalAccount.brand ?? "Debit"} card`,
      last4: externalAccount.last4,
      currency: normalizedCurrency,
      status: isBank
        ? bankStatus === "verified" || bankStatus === "new"
          ? ("connected" as const)
          : ("unverified" as const)
        : ("connected" as const),
      defaultForCurrency: externalAccount.default_for_currency ?? false,
    };
  });
  const bank = externalAccounts.data.find(
    (externalAccount) => externalAccount.object === "bank_account",
  );
  const requirements = objectRecord(
    v2Account as unknown as Readonly<Record<string, unknown>>,
  )?.requirements;
  const requirementsRecord = objectRecord(requirements);
  const currentlyDue = Array.isArray(requirementsRecord?.currently_due)
    ? requirementsRecord.currently_due.filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  const relevantEarningsCategories = new Set([
    "charge",
    "refund",
    "dispute",
    "dispute_reversal",
  ]);
  const earningsTransactions = earningsBalanceTransactions.filter(
    (transaction) => transaction.currency === requestedCurrency,
  );
  const chartStart = new Date();
  chartStart.setUTCHours(0, 0, 0, 0);
  chartStart.setUTCDate(chartStart.getUTCDate() - 29);
  const earningsPoints = Array.from({ length: 30 }, (_, index) => {
    const point = new Date(chartStart);
    point.setUTCDate(point.getUTCDate() + index);
    const date = point.toISOString().slice(0, 10);
    const transactions = earningsTransactions.filter(
      (transaction) =>
        new Date(transaction.created * 1_000).toISOString().slice(0, 10) ===
        date,
    );
    return {
      date,
      grossMinor: transactions
        .filter((transaction) => transaction.reporting_category === "charge")
        .reduce((sum, transaction) => sum + Math.max(0, transaction.amount), 0),
      netMinor: Math.max(
        0,
        transactions
          .filter((transaction) =>
            relevantEarningsCategories.has(transaction.reporting_category),
          )
          .reduce((sum, transaction) => sum + transaction.net, 0),
      ),
    };
  });
  const payoutInterval =
    balanceSettings.payments.payouts?.schedule?.interval ?? undefined;
  return {
    accountId: input.accountId,
    connected: true,
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    bankStatus: bank
      ? bank.object === "bank_account" &&
        (bank.status === "verified" || bank.status === "new")
        ? "connected"
        : "unverified"
      : "missing",
    bankName:
      bank?.object === "bank_account"
        ? (bank.bank_name ?? undefined)
        : undefined,
    bankLast4: bank?.last4,
    stripeAvailableMinor: Math.max(0, amountFor(balance.available)),
    stripePendingMinor: Math.max(0, amountFor(balance.pending)),
    stripeInstantAvailableMinor: Math.max(
      0,
      amountFor(balance.instant_available ?? []),
    ),
    stripeReservedMinor: Math.max(0, amountFor(balance.connect_reserved ?? [])),
    stripePayoutInterval:
      payoutInterval &&
      ["manual", "daily", "weekly", "monthly"].includes(payoutInterval)
        ? (payoutInterval as "manual" | "daily" | "weekly" | "monthly")
        : undefined,
    earnings30d: {
      grossMinor: earningsTransactions
        .filter((transaction) => transaction.reporting_category === "charge")
        .reduce((sum, transaction) => sum + Math.max(0, transaction.amount), 0),
      netMinor: Math.max(
        0,
        earningsTransactions
          .filter((transaction) =>
            relevantEarningsCategories.has(transaction.reporting_category),
          )
          .reduce((sum, transaction) => sum + transaction.net, 0),
      ),
      feesMinor: earningsTransactions
        .filter((transaction) => transaction.reporting_category === "charge")
        .reduce((sum, transaction) => sum + Math.max(0, transaction.fee), 0),
      payoutsMinor: earningsTransactions
        .filter((transaction) => transaction.reporting_category === "payout")
        .reduce((sum, transaction) => sum + Math.abs(transaction.net), 0),
      points: earningsPoints,
    },
    bankAccounts: payoutAccounts,
    activity: balanceTransactions.data.map((transaction) => ({
      id: transaction.id,
      type: transaction.type,
      reportingCategory: transaction.reporting_category,
      description:
        transaction.description ??
        transaction.reporting_category.replaceAll("_", " "),
      amountMinor: transaction.amount,
      feeMinor: Math.max(0, transaction.fee),
      netMinor: transaction.net,
      status:
        transaction.status === "available"
          ? ("available" as const)
          : ("pending" as const),
      availableAt: new Date(transaction.available_on * 1_000).toISOString(),
      occurredAt: new Date(transaction.created * 1_000).toISOString(),
    })),
    disputes: stripeDisputes.data.map((dispute) => ({
      id: dispute.id,
      kind: dispute.reason.replaceAll("_", " "),
      status: dispute.status,
      amountMinor: Math.max(0, dispute.amount),
      currency: normalizeCurrency(dispute.currency),
      dueAt: dispute.evidence_details.due_by
        ? new Date(dispute.evidence_details.due_by * 1_000).toISOString()
        : undefined,
      createdAt: new Date(dispute.created * 1_000).toISOString(),
    })),
    requirementsDue: currentlyDue,
    settingsUrl: loginLink?.url,
    liveData: true,
    livemode: process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_") ?? false,
  };
}

export async function configureConnectedAccountMoney(input: {
  readonly accountId: string;
  readonly statementDescriptor?: string;
  readonly payoutStatementDescriptor?: string;
}): Promise<void> {
  const stripe = getStripeClient();
  await Promise.all([
    stripe.balanceSettings.update(
      {
        payments: {
          payouts: {
            // Duna's per-order release ledger controls the user-selected
            // frequency. Stripe must stay manual so refundable funds cannot
            // reach the bank before their cancellation window closes.
            schedule: { interval: "manual" },
            ...(input.payoutStatementDescriptor
              ? { statement_descriptor: input.payoutStatementDescriptor }
              : {}),
          },
        },
      },
      { stripeAccount: input.accountId },
    ),
    input.statementDescriptor
      ? stripe.accounts.update(input.accountId, {
          settings: {
            payments: { statement_descriptor: input.statementDescriptor },
            card_payments: {
              statement_descriptor_prefix: input.statementDescriptor,
            },
          },
        })
      : Promise.resolve(),
  ]);
}

export async function createConnectedAccountPayout(input: {
  readonly accountId: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly idempotencyKey: string;
}): Promise<{
  readonly id: string;
  readonly status: string;
  readonly method: string;
  readonly destinationId?: string;
  readonly statementDescriptor?: string;
  readonly livemode: boolean;
  readonly traceId?: string;
  readonly traceStatus?: string;
  readonly failureCode?: string;
  readonly failureMessage?: string;
  readonly expectedArrivalAt?: Date;
}> {
  const payout = await getStripeClient().payouts.create(
    {
      amount: input.amountMinor,
      currency: input.currency.toLowerCase(),
      metadata: { dunaRelease: "eligible-funds-only" },
    },
    { stripeAccount: input.accountId, idempotencyKey: input.idempotencyKey },
  );
  return {
    id: payout.id,
    status: payout.status,
    method: payout.method,
    destinationId:
      typeof payout.destination === "string"
        ? payout.destination
        : payout.destination?.id,
    statementDescriptor: payout.statement_descriptor ?? undefined,
    livemode: payout.livemode,
    traceId: payout.trace_id?.value ?? undefined,
    traceStatus: payout.trace_id?.status,
    failureCode: payout.failure_code ?? undefined,
    failureMessage: payout.failure_message ?? undefined,
    expectedArrivalAt: payout.arrival_date
      ? new Date(payout.arrival_date * 1_000)
      : undefined,
  };
}

export async function retrieveConnectedAccountPayout(input: {
  readonly accountId: string;
  readonly payoutId: string;
}): Promise<{
  readonly id: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly status: string;
  readonly method: string;
  readonly destinationId?: string;
  readonly statementDescriptor?: string;
  readonly livemode: boolean;
  readonly traceId?: string;
  readonly traceStatus?: string;
  readonly failureCode?: string;
  readonly failureMessage?: string;
  readonly expectedArrivalAt?: Date;
  readonly createdAt: Date;
}> {
  const payout = await getStripeClient().payouts.retrieve(
    input.payoutId,
    {},
    { stripeAccount: input.accountId },
  );
  return {
    id: payout.id,
    amountMinor: payout.amount,
    currency: payout.currency,
    status: payout.status,
    method: payout.method,
    destinationId:
      typeof payout.destination === "string"
        ? payout.destination
        : payout.destination?.id,
    statementDescriptor: payout.statement_descriptor ?? undefined,
    livemode: payout.livemode,
    traceId: payout.trace_id?.value ?? undefined,
    traceStatus: payout.trace_id?.status,
    failureCode: payout.failure_code ?? undefined,
    failureMessage: payout.failure_message ?? undefined,
    expectedArrivalAt: payout.arrival_date
      ? new Date(payout.arrival_date * 1_000)
      : undefined,
    createdAt: new Date(payout.created * 1_000),
  };
}

export async function retrieveChargeSettlementAvailableAt(
  chargeId: string,
): Promise<Date | undefined> {
  const charge = await getStripeClient().charges.retrieve(chargeId, {
    expand: ["balance_transaction"],
  });
  const balanceTransaction =
    typeof charge.balance_transaction === "object"
      ? charge.balance_transaction
      : undefined;
  return balanceTransaction?.available_on
    ? new Date(balanceTransaction.available_on * 1_000)
    : undefined;
}

export interface StripePaymentLineage {
  readonly stripePaymentIntentId: string;
  readonly stripeChargeId: string;
  readonly stripeTransferId?: string;
  readonly stripeDestinationPaymentId?: string;
  readonly stripeBalanceTransactionId?: string;
  readonly stripeApplicationFeeId?: string;
  readonly grossMinor: number;
  readonly feeMinor: number;
  readonly netMinor: number;
  readonly currency: string;
  readonly availableAt?: Date;
  readonly livemode: boolean;
}

export async function retrieveStripePaymentLineage(input: {
  readonly paymentIntentId: string;
  readonly connectedAccountId: string;
}): Promise<StripePaymentLineage> {
  const stripe = getStripeClient();
  const intent = await stripe.paymentIntents.retrieve(input.paymentIntentId, {
    expand: [
      "latest_charge",
      "latest_charge.transfer",
      "latest_charge.application_fee",
    ],
  });
  const charge =
    typeof intent.latest_charge === "object" ? intent.latest_charge : undefined;
  if (!charge || charge.status !== "succeeded") {
    throw new Error("Stripe payment lineage requires a succeeded charge");
  }
  const transfer =
    typeof charge.transfer === "object"
      ? charge.transfer
      : typeof charge.transfer === "string"
        ? await stripe.transfers.retrieve(charge.transfer)
        : undefined;
  const destinationPayment = transfer?.destination_payment;
  const destinationPaymentId =
    typeof destinationPayment === "string"
      ? destinationPayment
      : destinationPayment?.id;
  const connectedCharge = destinationPaymentId
    ? await stripe.charges.retrieve(
        destinationPaymentId,
        { expand: ["balance_transaction"] },
        { stripeAccount: input.connectedAccountId },
      )
    : undefined;
  const balanceTransaction =
    connectedCharge && typeof connectedCharge.balance_transaction === "object"
      ? connectedCharge.balance_transaction
      : undefined;
  const applicationFeeId =
    typeof charge.application_fee === "string"
      ? charge.application_fee
      : charge.application_fee?.id;
  return {
    stripePaymentIntentId: intent.id,
    stripeChargeId: charge.id,
    stripeTransferId: transfer?.id,
    stripeDestinationPaymentId: destinationPaymentId,
    stripeBalanceTransactionId: balanceTransaction?.id,
    stripeApplicationFeeId: applicationFeeId,
    grossMinor: connectedCharge?.amount ?? charge.amount,
    feeMinor: Math.max(0, balanceTransaction?.fee ?? 0),
    netMinor: Math.max(
      0,
      balanceTransaction?.net ?? connectedCharge?.amount ?? charge.amount,
    ),
    currency: (connectedCharge?.currency ?? charge.currency).toUpperCase(),
    availableAt: balanceTransaction?.available_on
      ? new Date(balanceTransaction.available_on * 1_000)
      : undefined,
    livemode: charge.livemode,
  };
}

export async function createTerminalLocation(input: {
  readonly organizationId: string;
  readonly displayName: string;
  readonly address: {
    readonly line1: string;
    readonly line2?: string;
    readonly city: string;
    readonly state?: string;
    readonly postalCode: string;
    readonly country: string;
  };
  readonly idempotencyKey: string;
}): Promise<{ readonly id: string }> {
  const location = await getStripeClient().terminal.locations.create(
    {
      display_name: input.displayName,
      address: {
        line1: input.address.line1,
        line2: input.address.line2,
        city: input.address.city,
        state: input.address.state,
        postal_code: input.address.postalCode,
        country: input.address.country,
      },
      metadata: { dunaOrganizationId: input.organizationId },
    },
    { idempotencyKey: input.idempotencyKey },
  );
  return { id: location.id };
}

export async function createTerminalConnectionToken(
  locationId: string,
): Promise<{ readonly secret: string }> {
  const token = await getStripeClient().terminal.connectionTokens.create({
    location: locationId,
  });
  return { secret: token.secret };
}

export async function createTerminalPaymentIntent(input: {
  readonly orderId: string;
  readonly collectionId: string;
  readonly organizationId: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly connectedAccountId: string;
  readonly applicationFeeMinor: number;
  readonly payerPersonId: string;
  readonly operatorPersonId: string;
  readonly referenceType: string;
  readonly referenceId?: string;
  readonly idempotencyKey: string;
}): Promise<{
  readonly id: string;
  readonly clientSecret: string | null;
}> {
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new Error("Terminal amount must be a positive minor-unit integer");
  }
  const intent = await getStripeClient().paymentIntents.create(
    {
      amount: input.amountMinor,
      currency: input.currency.toLowerCase(),
      capture_method: "automatic",
      payment_method_types: ["card_present"],
      application_fee_amount: input.applicationFeeMinor,
      on_behalf_of: input.connectedAccountId,
      transfer_data: { destination: input.connectedAccountId },
      metadata: {
        dunaOrderId: input.orderId,
        dunaCollectionId: input.collectionId,
        dunaOrganizationId: input.organizationId,
        dunaPayerPersonId: input.payerPersonId,
        dunaOperatorPersonId: input.operatorPersonId,
        dunaReferenceType: input.referenceType,
        ...(input.referenceId ? { dunaReferenceId: input.referenceId } : {}),
        channel: "terminal",
      },
    },
    { idempotencyKey: input.idempotencyKey },
  );
  return { id: intent.id, clientSecret: intent.client_secret };
}

export async function retrieveTerminalPaymentIntent(
  paymentIntentId: string,
): Promise<{
  readonly id: string;
  readonly status: Stripe.PaymentIntent.Status;
  readonly amountMinor: number;
  readonly amountReceivedMinor: number;
  readonly currency: string;
  readonly orderId?: string;
  readonly collectionId?: string;
  readonly clientSecret?: string;
  readonly chargeId?: string;
  readonly receiptUrl?: string;
  readonly failureCode?: string;
  readonly declineCode?: string;
  readonly failureMessage?: string;
}> {
  const intent = await getStripeClient().paymentIntents.retrieve(
    paymentIntentId,
    { expand: ["latest_charge"] },
  );
  const charge =
    typeof intent.latest_charge === "object" && intent.latest_charge
      ? intent.latest_charge
      : undefined;
  return {
    id: intent.id,
    status: intent.status,
    amountMinor: intent.amount,
    amountReceivedMinor: intent.amount_received,
    currency: intent.currency.toUpperCase(),
    orderId: intent.metadata.dunaOrderId,
    collectionId: intent.metadata.dunaCollectionId,
    clientSecret: intent.client_secret ?? undefined,
    chargeId: charge?.id,
    receiptUrl: charge?.receipt_url ?? undefined,
    failureCode: intent.last_payment_error?.code,
    declineCode: intent.last_payment_error?.decline_code ?? undefined,
    failureMessage: intent.last_payment_error?.message,
  };
}

export async function refundPayment(input: {
  readonly paymentIntentId: string;
  readonly amountMinor?: number;
  readonly reason: "duplicate" | "fraudulent" | "requested_by_customer";
  readonly idempotencyKey: string;
  readonly reverseTransfer?: boolean;
  readonly refundApplicationFee?: boolean;
}): Promise<{ readonly id: string; readonly status: string | null }> {
  const refund = await getStripeClient().refunds.create(
    {
      payment_intent: input.paymentIntentId,
      amount: input.amountMinor,
      reason: input.reason,
      reverse_transfer: input.reverseTransfer,
      refund_application_fee: input.refundApplicationFee,
      metadata: { initiatedBy: "duna" },
    },
    { idempotencyKey: input.idempotencyKey },
  );
  return { id: refund.id, status: refund.status };
}

export async function transferPrize(input: {
  readonly connectedAccountId: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly matchOrEventId: string;
  readonly idempotencyKey: string;
}): Promise<{ readonly id: string; readonly amountMinor: number }> {
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new Error("Prize must be a positive minor-unit integer");
  }
  const transfer = await getStripeClient().transfers.create(
    {
      amount: input.amountMinor,
      currency: input.currency.toLowerCase(),
      destination: input.connectedAccountId,
      metadata: {
        dunaReferenceId: input.matchOrEventId,
        taxCharacter: "prize",
      },
    },
    { idempotencyKey: input.idempotencyKey },
  );
  return { id: transfer.id, amountMinor: transfer.amount };
}

export function constructStripeEvent(
  payload: string | Buffer,
  signature: string,
): Stripe.Event {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  }
  return getStripeClient().webhooks.constructEvent(
    payload,
    signature,
    webhookSecret,
  );
}
