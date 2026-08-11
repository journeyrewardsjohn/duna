import { describe, expect, it } from "vitest";
import { policyAcceptanceLabel, policyScrollReachedEnd } from "./policy-review";

describe("mobile policy review", () => {
  it("does not unlock before the document is measured", () => {
    expect(
      policyScrollReachedEnd({
        contentHeight: 0,
        offsetY: 0,
        viewportHeight: 640,
      }),
    ).toBe(false);
  });

  it("unlocks a short document when the whole policy is already visible", () => {
    expect(
      policyScrollReachedEnd({
        contentHeight: 520,
        offsetY: 0,
        viewportHeight: 640,
      }),
    ).toBe(true);
  });

  it("keeps a long document locked until the reader reaches the end", () => {
    expect(
      policyScrollReachedEnd({
        contentHeight: 1_800,
        offsetY: 900,
        viewportHeight: 640,
      }),
    ).toBe(false);
    expect(
      policyScrollReachedEnd({
        contentHeight: 1_800,
        offsetY: 1_146,
        viewportHeight: 640,
      }),
    ).toBe(true);
  });

  it("uses the explicit waiver acceptance language", () => {
    expect(policyAcceptanceLabel("waiver")).toBe("I Accept & Waive my Rights");
    expect(policyAcceptanceLabel("policy")).toBe("I Accept this Policy");
  });
});
