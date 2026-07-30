import Stripe from "stripe";

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
    maxNetworkRetries: 2,
  });
  return stripeClient;
}

export async function createDunaPlusCheckout(input: {
  readonly personId: string;
  readonly email?: string;
  readonly interval: "month" | "year";
  readonly successUrl: string;
  readonly cancelUrl: string;
  readonly idempotencyKey: string;
}): Promise<{ readonly id: string; readonly url: string | null }> {
  const priceId =
    input.interval === "month"
      ? process.env.STRIPE_DUNA_PLUS_MONTHLY_PRICE_ID
      : process.env.STRIPE_DUNA_PLUS_ANNUAL_PRICE_ID;
  if (!priceId) {
    throw new Error(`Duna+ ${input.interval} price is not configured`);
  }
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
        metadata: { dunaPersonId: input.personId, product: "duna-plus" },
      },
      metadata: { dunaPersonId: input.personId, product: "duna-plus" },
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
  readonly refreshUrl: string;
  readonly returnUrl: string;
}): Promise<{ readonly accountId: string; readonly url: string }> {
  const stripe = getStripeClient();
  const accountId =
    input.accountId ??
    (
      await stripe.accounts.create({
        type: "express",
        metadata: {
          dunaEntityId: input.personOrOrganizationId,
          dunaPartyType: input.partyType,
        },
        capabilities: {
          card_payments: { requested: input.partyType !== "player" },
          transfers: { requested: true },
        },
      })
    ).id;
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: input.refreshUrl,
    return_url: input.returnUrl,
    type: "account_onboarding",
  });
  return { accountId, url: link.url };
}

export async function createTerminalConnectionToken(
  stripeConnectedAccount?: string,
): Promise<{ readonly secret: string }> {
  const token = await getStripeClient().terminal.connectionTokens.create(
    {},
    stripeConnectedAccount
      ? { stripeAccount: stripeConnectedAccount }
      : undefined,
  );
  return { secret: token.secret };
}

export async function createTerminalPaymentIntent(input: {
  readonly orderId: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly connectedAccountId?: string;
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
      metadata: {
        dunaOrderId: input.orderId,
        channel: "terminal",
      },
    },
    {
      idempotencyKey: input.idempotencyKey,
      stripeAccount: input.connectedAccountId,
    },
  );
  return { id: intent.id, clientSecret: intent.client_secret };
}

export async function refundPayment(input: {
  readonly paymentIntentId: string;
  readonly amountMinor?: number;
  readonly reason: "duplicate" | "fraudulent" | "requested_by_customer";
  readonly idempotencyKey: string;
}): Promise<{ readonly id: string; readonly status: string | null }> {
  const refund = await getStripeClient().refunds.create(
    {
      payment_intent: input.paymentIntentId,
      amount: input.amountMinor,
      reason: input.reason,
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
