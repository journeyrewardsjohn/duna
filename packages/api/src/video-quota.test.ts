import { describe, expect, it } from "vitest";
import { resolveMembershipVideoQuota } from "./video-service";

describe("membership video quota resolution", () => {
  it("enforces the launch allowance for every plan", () => {
    expect(resolveMembershipVideoQuota({ plan: "free" })).toMatchObject({
      monthlyLiveSeconds: 0,
      monthlyUploadSeconds: 4 * 60 * 60,
      enforceLiveLimit: true,
      enforceUploadLimit: true,
    });
    expect(resolveMembershipVideoQuota({ plan: "premium" })).toMatchObject({
      monthlyLiveSeconds: 2 * 60 * 60,
      monthlyUploadSeconds: 8 * 60 * 60,
    });
    expect(resolveMembershipVideoQuota({ plan: "premium-plus" })).toMatchObject(
      {
        monthlyLiveSeconds: 8 * 60 * 60,
        monthlyUploadSeconds: 30 * 60 * 60,
      },
    );
  });

  it("applies global safety ceilings without replacing plan allowances", () => {
    expect(
      resolveMembershipVideoQuota({
        plan: "premium-plus",
        globalPolicy: {
          monthlyLiveSeconds: 4 * 60 * 60,
          monthlyUploadSeconds: 20 * 60 * 60,
          enforceLiveLimit: true,
          enforceUploadLimit: true,
        },
      }),
    ).toMatchObject({
      monthlyLiveSeconds: 4 * 60 * 60,
      monthlyUploadSeconds: 20 * 60 * 60,
    });
  });

  it("lets an audited person override take precedence", () => {
    expect(
      resolveMembershipVideoQuota({
        plan: "premium",
        personPolicy: {
          monthlyLiveSeconds: 3 * 60 * 60,
          monthlyUploadSeconds: 12 * 60 * 60,
          enforceLiveLimit: true,
          enforceUploadLimit: false,
        },
      }),
    ).toMatchObject({
      monthlyLiveSeconds: 3 * 60 * 60,
      monthlyUploadSeconds: 12 * 60 * 60,
      enforceUploadLimit: false,
    });
  });
});
