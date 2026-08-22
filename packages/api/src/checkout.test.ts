import { describe, expect, it } from "vitest";
import {
  CheckoutError,
  normalizeDivisionTeamRoster,
  resolveRegistrationUnitAmount,
  type CheckoutPolicy,
  validatePickupCoverPayment,
  validatePolicyAcceptances,
} from "./checkout";
import { eventCheckoutResultSchema } from "./contracts";

const policy: CheckoutPolicy = {
  id: "weather-policy",
  kind: "policy",
  title: "Weather policy",
  markdown: "Play pauses when conditions are unsafe.",
  required: true,
  requireFullScroll: false,
};

const waiver: CheckoutPolicy = {
  id: "participation-waiver",
  kind: "waiver",
  title: "Participation waiver",
  markdown: "Participation involves physical activity and uneven surfaces.",
  required: true,
  requireFullScroll: true,
};

describe("event policy acceptance", () => {
  it("returns the exact accepted documents after all safeguards pass", () => {
    expect(
      validatePolicyAcceptances({
        policies: [policy, waiver],
        acceptedPolicyIds: [policy.id, waiver.id],
        readPolicyIds: [waiver.id],
      }),
    ).toEqual([policy, waiver]);
  });

  it("rejects a missing required agreement", () => {
    expect(() =>
      validatePolicyAcceptances({
        policies: [policy],
        acceptedPolicyIds: [],
        readPolicyIds: [],
      }),
    ).toThrowError(
      new CheckoutError(
        "EVENT_NOT_CHECKOUT_ELIGIBLE",
        "Weather policy must be accepted before checkout.",
      ),
    );
  });

  it("rejects a waiver that was not read to the end", () => {
    expect(() =>
      validatePolicyAcceptances({
        policies: [waiver],
        acceptedPolicyIds: [waiver.id],
        readPolicyIds: [],
      }),
    ).toThrow(/must be read to the end/);
  });

  it("rejects stale or invented policy identifiers", () => {
    expect(() =>
      validatePolicyAcceptances({
        policies: [policy],
        acceptedPolicyIds: [policy.id, "old-policy"],
        readPolicyIds: [],
      }),
    ).toThrow(/policy changed/);
  });
});

describe("native event payment contract", () => {
  const nativeResult = {
    mode: "stripe" as const,
    orderId: "7ca11da7-6ddb-4956-bce3-d2f2f5a450e9",
    paymentSheet: {
      publishableKey: "pk_test_duna",
      paymentIntentId: "pi_duna",
      paymentIntentClientSecret: "pi_duna_secret_test",
      customerId: "cus_duna",
      customerSessionClientSecret: "cuss_test_duna",
    },
    expiresAt: "2026-08-05T20:00:00.000Z",
    pricing: {
      subtotalMinor: 4500,
      feeTotalMinor: 350,
      totalMinor: 4850,
      currency: "USD" as const,
    },
  };

  it("returns one complete PaymentSheet credential bundle", () => {
    expect(eventCheckoutResultSchema.parse(nativeResult)).toEqual(nativeResult);
  });

  it("rejects a partial PaymentSheet credential bundle", () => {
    const partialPaymentSheet = Object.fromEntries(
      Object.entries(nativeResult.paymentSheet).filter(
        ([key]) => key !== "customerSessionClientSecret",
      ),
    );
    expect(() =>
      eventCheckoutResultSchema.parse({
        ...nativeResult,
        paymentSheet: partialPaymentSheet,
      }),
    ).toThrow();
  });
});

describe("division roster normalization", () => {
  it("does not count the primary player twice when an older client resends the captain", () => {
    expect(
      normalizeDivisionTeamRoster(
        [
          { personId: "captain", displayName: "Captain" },
          { personId: "teammate", displayName: "Teammate" },
        ],
        "captain",
      ),
    ).toEqual([{ personId: "teammate", displayName: "Teammate" }]);
  });
});

describe("event registration price protection", () => {
  it("uses the current price when no paid registration snapshot exists", () => {
    expect(
      resolveRegistrationUnitAmount({ currentUnitAmountMinor: 7_500 }),
    ).toBe(7_500);
  });

  it("grandfathers a teammate attached to a paid registration", () => {
    expect(
      resolveRegistrationUnitAmount({
        currentUnitAmountMinor: 9_500,
        paidRegistration: true,
        paidRegistrationUnitAmountMinor: 7_500,
      }),
    ).toBe(7_500);
  });

  it("keeps a paid free registration free after a later price increase", () => {
    expect(
      resolveRegistrationUnitAmount({
        currentUnitAmountMinor: 5_000,
        paidRegistration: true,
        paidRegistrationUnitAmountMinor: 0,
      }),
    ).toBe(0);
  });

  it("fails closed when a paid registration has no price snapshot", () => {
    expect(() =>
      resolveRegistrationUnitAmount({
        currentUnitAmountMinor: 9_500,
        paidRegistration: true,
      }),
    ).toThrow(/No new amount was charged/);
  });
});

describe("hosted-match covered places", () => {
  it("keeps free additions unconfirmed until each invited player accepts", () => {
    expect(() =>
      validatePickupCoverPayment({
        pickup: true,
        actorPersonId: "player-1",
        subjectPersonIds: ["player-2"],
        perPersonAmountMinor: 0,
      }),
    ).toThrow(/Each player confirms their own place/);
  });

  it("allows another player's place to be covered when payment is required", () => {
    expect(() =>
      validatePickupCoverPayment({
        pickup: true,
        actorPersonId: "player-1",
        subjectPersonIds: ["player-2"],
        perPersonAmountMinor: 1800,
      }),
    ).not.toThrow();
  });
});
