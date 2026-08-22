import { beforeEach, describe, expect, it, vi } from "vitest";

const stripeMocks = vi.hoisted(() => ({
  accountsRetrieve: vi.fn(),
  paymentIntentsCreate: vi.fn(),
}));

vi.mock("stripe", () => ({
  default: class MockStripe {
    accounts = { retrieve: stripeMocks.accountsRetrieve };
    paymentIntents = { create: stripeMocks.paymentIntentsCreate };
  },
}));

import { createEventPaymentIntent } from "./payments";

const paymentInput = {
  orderId: "order-1",
  personId: "person-1",
  customerId: "cus_1",
  customerEmail: "player@example.com",
  eventId: "event-1",
  eventTitle: "Saturday KOB",
  amountMinor: 2_000,
  currency: "USD",
  applicationFeeMinor: 200,
  organizationCommissionMinor: 1_800,
  organizationCommissionRateBps: 9_000,
  connectedAccountId: "acct_recipient",
  idempotencyKey: "checkout-1",
} as const;

describe("destination charge routing", () => {
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = "sk_test_duna";
    stripeMocks.accountsRetrieve.mockReset();
    stripeMocks.paymentIntentsCreate.mockReset();
    stripeMocks.paymentIntentsCreate.mockResolvedValue({
      id: "pi_1",
      client_secret: "pi_1_secret_test",
    });
  });

  it("keeps the destination transfer but omits on_behalf_of for recipient-only accounts", async () => {
    stripeMocks.accountsRetrieve.mockResolvedValue({
      charges_enabled: true,
      capabilities: { transfers: "active" },
    });

    await createEventPaymentIntent(paymentInput);

    const params = stripeMocks.paymentIntentsCreate.mock.calls[0]?.[0];
    expect(params).toMatchObject({
      amount: 2_000,
      application_fee_amount: 200,
      transfer_data: { destination: "acct_recipient" },
    });
    expect(params).not.toHaveProperty("on_behalf_of");
  });

  it("uses on_behalf_of when card payments are active", async () => {
    stripeMocks.accountsRetrieve.mockResolvedValue({
      charges_enabled: true,
      capabilities: { card_payments: "active", transfers: "active" },
    });

    await createEventPaymentIntent(paymentInput);

    expect(stripeMocks.paymentIntentsCreate.mock.calls[0]?.[0]).toMatchObject({
      on_behalf_of: "acct_recipient",
      transfer_data: { destination: "acct_recipient" },
    });
  });
});
