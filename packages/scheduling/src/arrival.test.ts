import { describe, expect, it } from "vitest";
import {
  ARRIVAL_GEOFENCE_RADIUS_METERS,
  arrivalSharingWindow,
  arrivalStatus,
  distanceMeters,
  fallbackTravelDurationSeconds,
  leaveByTime,
} from "./arrival";

describe("arrival privacy window", () => {
  const startsAt = "2026-08-05T18:00:00.000Z";

  it("opens exactly 60 minutes before and closes 30 minutes after", () => {
    expect(
      arrivalSharingWindow(startsAt, new Date("2026-08-05T16:59:59Z")),
    ).toMatchObject({
      active: false,
      phase: "early",
    });
    expect(
      arrivalSharingWindow(startsAt, new Date("2026-08-05T17:00:00Z")),
    ).toMatchObject({
      active: true,
      phase: "active",
    });
    expect(
      arrivalSharingWindow(startsAt, new Date("2026-08-05T18:30:00Z")),
    ).toMatchObject({
      active: false,
      phase: "closed",
    });
  });
});

describe("arrival estimates", () => {
  it("recognizes a player inside the venue geofence", () => {
    expect(
      arrivalStatus({
        distanceMeters: ARRIVAL_GEOFENCE_RADIUS_METERS - 1,
        travelDurationSeconds: 0,
        startsAt: "2026-08-05T18:00:00Z",
        now: new Date("2026-08-05T17:50:00Z"),
      }),
    ).toBe("arrived");
  });

  it("distinguishes leave-now and running-late states", () => {
    expect(
      arrivalStatus({
        distanceMeters: 5_000,
        travelDurationSeconds: 15 * 60,
        startsAt: "2026-08-05T18:00:00Z",
        now: new Date("2026-08-05T17:43:00Z"),
      }),
    ).toBe("leave-now");
    expect(
      arrivalStatus({
        distanceMeters: 5_000,
        travelDurationSeconds: 20 * 60,
        startsAt: "2026-08-05T18:00:00Z",
        now: new Date("2026-08-05T17:45:00Z"),
      }),
    ).toBe("running-late");
  });

  it("computes stable distance, fallback ETA, and leave-by time", () => {
    const distance = distanceMeters(
      { latitude: 33.8847, longitude: -118.4109 },
      { latitude: 33.8622, longitude: -118.3995 },
    );
    expect(distance).toBeGreaterThan(2_000);
    expect(fallbackTravelDurationSeconds(distance)).toBeGreaterThan(240);
    expect(
      leaveByTime({
        startsAt: "2026-08-05T18:00:00Z",
        travelDurationSeconds: 15 * 60,
      }),
    ).toBe("2026-08-05T17:40:00.000Z");
  });
});
