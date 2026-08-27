import { describe, expect, it } from "vitest";
import {
  activeVideoAllowanceTotals,
  resolveMembershipVideoQuota,
} from "./video-service";

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

describe("Super Admin video allowance grants", () => {
  const now = new Date("2026-08-27T12:00:00.000Z");

  it("adds only active, unrevoked upload and live grants", () => {
    expect(
      activeVideoAllowanceTotals(
        [
          {
            uploadSeconds: 10 * 3_600,
            liveSeconds: 2 * 3_600,
            startsAt: new Date("2026-08-01T00:00:00.000Z"),
            endsAt: new Date("2026-09-01T00:00:00.000Z"),
            revokedAt: null,
          },
          {
            uploadSeconds: 25 * 3_600,
            liveSeconds: 5 * 3_600,
            startsAt: new Date("2026-08-20T00:00:00.000Z"),
            endsAt: null,
            revokedAt: null,
          },
          {
            uploadSeconds: 100 * 3_600,
            liveSeconds: 100 * 3_600,
            startsAt: new Date("2026-08-01T00:00:00.000Z"),
            endsAt: null,
            revokedAt: new Date("2026-08-25T00:00:00.000Z"),
          },
          {
            uploadSeconds: 50 * 3_600,
            liveSeconds: 10 * 3_600,
            startsAt: new Date("2026-09-01T00:00:00.000Z"),
            endsAt: null,
            revokedAt: null,
          },
        ],
        now,
      ),
    ).toEqual({ uploadSeconds: 35 * 3_600, liveSeconds: 7 * 3_600 });
  });

  it("expires a current-period grant exactly at the next UTC month", () => {
    const grant = {
      uploadSeconds: 3_600,
      liveSeconds: 3_600,
      startsAt: new Date("2026-08-27T12:00:00.000Z"),
      endsAt: new Date("2026-09-01T00:00:00.000Z"),
      revokedAt: null,
    };
    expect(activeVideoAllowanceTotals([grant], now)).toEqual({
      uploadSeconds: 3_600,
      liveSeconds: 3_600,
    });
    expect(
      activeVideoAllowanceTotals([grant], new Date("2026-09-01T00:00:00.000Z")),
    ).toEqual({ uploadSeconds: 0, liveSeconds: 0 });
  });
});
