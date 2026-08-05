import type {
  MembershipBillingInterval,
  OrganizationBillingInterval,
  OrganizationPlanId,
  PaidMembershipPlanId,
  PaidOrganizationPlanId,
} from "@duna/core";
import { ORGANIZATION_FEE_POLICY_VERSION } from "@duna/core";
import Stripe from "stripe";
import {
  connectAccountMetadataEntityId,
  connectAccountMoneyReady,
} from "./stripe-connect";

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
  return interval === "month"
    ? process.env.STRIPE_HQ_NETWORK_MONTHLY_PRICE_ID
    : process.env.STRIPE_HQ_NETWORK_ANNUAL_PRICE_ID;
}

export function isOrganizationPlanPriceConfigured(
  plan: PaidOrganizationPlanId,
  interval: OrganizationBillingInterval,
): boolean {
  return Boolean(organizationPlanPriceId(plan, interval));
}

export function organizationPlanForPriceId(priceId: string):
  | {
      readonly plan: PaidOrganizationPlanId;
      readonly interval: OrganizationBillingInterval;
    }
  | undefined {
  const plans: readonly PaidOrganizationPlanId[] = [
    "small-club",
    "club",
    "multi-venue",
  ];
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
  };
  const session = await getStripeClient().checkout.sessions.create(
    {
      mode: "subscription",
      ...(input.customerId
        ? { customer: input.customerId }
        : { customer_email: input.email }),
      client_reference_id: input.organizationId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      allow_promotion_codes: true,
      billing_address_collection: "required",
      automatic_tax: {
        enabled: process.env.STRIPE_AUTOMATIC_TAX_ENABLED === "true",
      },
      tax_id_collection: { enabled: true },
      subscription_data: { metadata },
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
              metadata: { dunaEventId: input.eventId },
            },
          },
        },
      ],
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      expires_at: Math.floor(input.expiresAt.getTime() / 1_000),
      automatic_tax: {
        enabled: process.env.STRIPE_AUTOMATIC_TAX_ENABLED === "true",
      },
      payment_intent_data: {
        application_fee_amount: input.applicationFeeMinor,
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
              metadata: { dunaBookingId: input.bookingId },
            },
          },
        },
      ],
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      expires_at: Math.floor(input.expiresAt.getTime() / 1_000),
      automatic_tax: {
        enabled: process.env.STRIPE_AUTOMATIC_TAX_ENABLED === "true",
      },
      payment_intent_data: {
        application_fee_amount: input.applicationFeeMinor,
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
  readonly automaticTaxEnabled: boolean;
  readonly collectShippingAddress: boolean;
  readonly successUrl: string;
  readonly cancelUrl: string;
  readonly expiresAt: Date;
  readonly idempotencyKey: string;
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
  const recurring = Boolean(input.recurringInterval);
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
  };
  const applicationFeePercent =
    Math.round((input.applicationFeeMinor / totalAmountMinor) * 10_000) / 100;
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    { price: input.stripePriceId, quantity: input.quantity },
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
          metadata: { dunaOrderId: input.orderId },
        },
        recurring: input.recurringInterval
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
      automatic_tax: {
        enabled: input.automaticTaxEnabled,
        liability: input.automaticTaxEnabled
          ? {
              type: "account",
              account: input.connectedAccountId,
            }
          : undefined,
      },
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
            application_fee_percent: applicationFeePercent,
            on_behalf_of: input.connectedAccountId,
            transfer_data: { destination: input.connectedAccountId },
            metadata,
          }
        : undefined,
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

export async function createBillingPortalSession(input: {
  readonly customerId: string;
  readonly returnUrl: string;
}): Promise<{ readonly id: string; readonly url: string }> {
  const session = await getStripeClient().billingPortal.sessions.create({
    customer: input.customerId,
    return_url: input.returnUrl,
  });
  return { id: session.id, url: session.url };
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
        configurations: ["recipient"],
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
