import { describe, expect, it } from "vitest";
import {
  eventCaptainPaymentComplete,
  operatorEventPaymentTreatment,
} from "./event-entry-payment";

describe("operator event entry payment truth", () => {
  it("keeps an organizer-reserved entry unpaid until an order is paid", () => {
    expect(
      eventCaptainPaymentComplete({
        eligibilityDecision: { paymentTreatment: "to-be-paid" },
        registrationStatus: "confirmed",
      }),
    ).toBe(false);
  });

  it("treats a complimentary grant as covered without inventing an order", () => {
    expect(
      eventCaptainPaymentComplete({
        eligibilityDecision: { paymentTreatment: "complimentary" },
        registrationStatus: "confirmed",
      }),
    ).toBe(true);
  });

  it("lets a paid order settle a previously payment-due entry", () => {
    expect(
      eventCaptainPaymentComplete({
        eligibilityDecision: { paymentTreatment: "to-be-paid" },
        orderStatus: "paid",
        registrationStatus: "confirmed",
      }),
    ).toBe(true);
  });

  it("ignores unrecognized metadata", () => {
    expect(operatorEventPaymentTreatment({ paymentTreatment: "cash" })).toBe(
      undefined,
    );
  });
});
