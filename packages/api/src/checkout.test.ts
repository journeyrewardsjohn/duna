import { describe, expect, it } from "vitest";
import {
  CheckoutError,
  type CheckoutPolicy,
  validatePolicyAcceptances,
} from "./checkout";

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
