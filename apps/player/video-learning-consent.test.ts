import { describe, expect, it } from "vitest";
import {
  acknowledgeLegacyVisionConsentRevocation,
  createVisionLearningConsentReceipt,
  legacyVisionConsentRevocationLocator,
  normalizeVisionLearningConsent,
  resetVisionLearningConsent,
} from "./video-learning-consent";

describe("video learning consent", () => {
  it("rejects a legacy true draft without a current affirmative receipt", () => {
    expect(
      normalizeVisionLearningConsent({ requested: true, receipt: undefined }),
    ).toBe(false);
  });

  it("preserves only a current versioned affirmative receipt", () => {
    const receipt = createVisionLearningConsentReceipt(
      true,
      "2026-08-22T05:20:00.000Z",
    );
    expect(normalizeVisionLearningConsent({ requested: true, receipt })).toBe(
      true,
    );
    expect(
      normalizeVisionLearningConsent({
        requested: true,
        receipt: { version: 0, consentedAt: "2026-08-22T05:20:00.000Z" },
      }),
    ).toBe(false);
  });

  it("does not create a receipt for an opt-out", () => {
    expect(createVisionLearningConsentReceipt(false)).toBeUndefined();
  });

  it("prevents unknown legacy capture defaults from turning consent on", () => {
    expect(
      resetVisionLearningConsent({
        title: "Legacy draft",
        contributeCalibration: true,
      }).contributeCalibration,
    ).toBe(false);
  });

  it("reconciles a markerless legacy draft that has not persisted a server upload", () => {
    expect(
      legacyVisionConsentRevocationLocator({
        requested: true,
        receipt: undefined,
        beginIdempotencyKey: "begin-key",
      }),
    ).toEqual({ beginIdempotencyKey: "begin-key" });
  });

  it("targets the persisted server upload for markerless legacy consent", () => {
    expect(
      legacyVisionConsentRevocationLocator({
        requested: true,
        receipt: undefined,
        beginIdempotencyKey: "begin-key",
        uploadVideoId: "upload-video",
      }),
    ).toEqual({
      beginIdempotencyKey: "begin-key",
      videoId: "upload-video",
    });
  });

  it("targets a completed server video before retrying its Vision attachment", () => {
    expect(
      legacyVisionConsentRevocationLocator({
        requested: true,
        receipt: undefined,
        beginIdempotencyKey: "begin-key",
        uploadVideoId: "upload-video",
        completedVideoId: "completed-video",
      }),
    ).toEqual({
      beginIdempotencyKey: "begin-key",
      videoId: "completed-video",
    });
  });

  it("keeps revocation retryable until the server acknowledges it", async () => {
    const locator = { beginIdempotencyKey: "begin-key" };
    const order: string[] = [];
    let attempts = 0;
    const revoke = async () => {
      order.push(`revoke-${++attempts}`);
      if (attempts === 1) throw new Error("offline");
      return { revoked: false };
    };
    const persistNormalizedConsent = async () => {
      order.push("persist-false");
    };

    const transfer = async () => {
      await acknowledgeLegacyVisionConsentRevocation({
        locator,
        revoke,
        persistNormalizedConsent,
      });
      order.push("resume");
    };

    await expect(transfer()).rejects.toThrow("offline");
    expect(order).toEqual(["revoke-1"]);

    await transfer();
    expect(order).toEqual(["revoke-1", "revoke-2", "persist-false", "resume"]);
  });
});
