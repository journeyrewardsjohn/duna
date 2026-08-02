import { describe, expect, it } from "vitest";

import { courtAvailabilityLabel } from "./schedule-calendar-helpers";

const schedule = [
  {
    id: "30000000-0000-4000-8000-000000000001",
    weekday: 1,
    startsAtMinute: 8 * 60,
    endsAtMinute: 12 * 60,
    mode: "rentals-only" as const,
  },
  {
    id: "30000000-0000-4000-8000-000000000002",
    weekday: 1,
    startsAtMinute: 13 * 60,
    endsAtMinute: 22 * 60,
    mode: "open" as const,
  },
  {
    id: "30000000-0000-4000-8000-000000000003",
    weekday: 2,
    startsAtMinute: 8 * 60,
    endsAtMinute: 22 * 60,
    mode: "maintenance" as const,
  },
] as const;

describe("court calendar availability", () => {
  it("summarizes the full bookable window for an operating day", () => {
    expect(
      courtAvailabilityLabel(schedule, new Date("2026-08-03T12:00:00Z")),
    ).toBe("8 AM–10 PM");
  });

  it("marks days without a bookable schedule as closed", () => {
    expect(
      courtAvailabilityLabel(schedule, new Date("2026-08-04T12:00:00Z")),
    ).toBe("Closed");
  });
});
