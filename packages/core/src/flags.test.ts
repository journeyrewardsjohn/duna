import { describe, expect, it } from "vitest";
import {
  clientVisibleFeatureFlagKeys,
  featureFlagDefault,
  featureFlagKeys,
  featureFlagRegistry,
  isFeatureFlagKey,
} from "./flags";

describe("feature flag registry", () => {
  it("lists every planned flag, all on by default (kill switches)", () => {
    expect([...featureFlagKeys].sort()).toEqual(
      [
        "ai.onDeviceVideo",
        "concierge.channel.email",
        "concierge.channel.imessage",
        "concierge.channel.whatsapp",
        "facility.owners",
        "health.juniors",
        "invites.sms",
        "pay.embeddedOnboarding",
        "team.contractorPayouts",
        "training.scene3d",
        "training.storefront",
        "website.workspace",
      ].sort(),
    );
    for (const key of featureFlagKeys) {
      expect(featureFlagDefault(key)).toBe(true);
      expect(featureFlagRegistry[key].description.length).toBeGreaterThan(10);
    }
  });

  it("uses keys the Super Admin editor and feature_flags.key accept", () => {
    for (const key of featureFlagKeys) {
      expect(key).toMatch(/^[a-z0-9][a-zA-Z0-9._-]*$/);
      expect(key.length).toBeLessThanOrEqual(96);
    }
  });

  it("recognises registry keys only", () => {
    expect(isFeatureFlagKey("website.workspace")).toBe(true);
    expect(isFeatureFlagKey("toString")).toBe(false);
    expect(isFeatureFlagKey("website.unknown")).toBe(false);
    expect(clientVisibleFeatureFlagKeys.every(isFeatureFlagKey)).toBe(true);
  });
});
