import { loadEnvFile } from "node:process";
import {
  createBookingPaymentIntent,
  createDunaPlusCheckout,
  createTerminalConnectionToken,
  getStripeClient,
} from "../packages/api/src/payments";

loadEnvFile(".env.local");

async function main() {
  const checkout = await createDunaPlusCheckout({
    personId: "10000000-0000-4000-8000-000000000010",
    email: "duna-sandbox@example.com",
    interval: "year",
    successUrl: "http://localhost:3000/app/settings?checkout=success",
    cancelUrl: "http://localhost:3000/app/settings?checkout=cancelled",
    idempotencyKey: "duna-smoke-checkout-annual-v2",
  });
  const paymentIntent = await createBookingPaymentIntent({
    orderId: "duna-smoke-order-v1",
    amountMinor: 4_944,
    currency: "USD",
    idempotencyKey: "duna-smoke-payment-v2",
  });
  const terminal = await createTerminalConnectionToken();
  const stripe = getStripeClient();
  const [session, intent] = await Promise.all([
    stripe.checkout.sessions.retrieve(checkout.id),
    stripe.paymentIntents.retrieve(paymentIntent.id),
  ]);
  process.stdout.write(
    JSON.stringify(
      {
        mode: "sandbox",
        checkout: {
          created: Boolean(session.id && session.url),
          mode: session.mode,
          automaticTax: session.automatic_tax?.enabled,
        },
        paymentIntent: {
          created: Boolean(intent.id && intent.client_secret),
          amountMinor: intent.amount,
          applicationFeeMinor: intent.application_fee_amount ?? 0,
        },
        terminal: { connectionTokenCreated: Boolean(terminal.secret) },
      },
      null,
      2,
    ),
  );
}

void main();
