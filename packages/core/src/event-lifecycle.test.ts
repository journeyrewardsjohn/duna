import { describe, expect, it } from "vitest";
import { eventPhase, withEventLifecycle } from "./event-lifecycle";

const now = new Date("2026-08-17T16:00:00.000Z");

describe("event lifecycle", () => {
  it("derives upcoming, live, and completed states from the scheduled window", () => {
    expect(
      eventPhase(
        {
          startsAt: "2026-08-17T18:00:00.000Z",
          endsAt: "2026-08-17T19:30:00.000Z",
        },
        now,
      ),
    ).toBe("upcoming");
    expect(
      eventPhase(
        {
          startsAt: "2026-08-17T15:00:00.000Z",
          endsAt: "2026-08-17T17:00:00.000Z",
        },
        now,
      ),
    ).toBe("live");
    expect(
      eventPhase(
        {
          startsAt: "2026-08-17T13:00:00.000Z",
          endsAt: "2026-08-17T15:00:00.000Z",
        },
        now,
      ),
    ).toBe("completed");
  });

  it("keeps stored terminal states terminal", () => {
    expect(
      eventPhase(
        {
          startsAt: "2026-08-17T15:00:00.000Z",
          endsAt: "2026-08-17T17:00:00.000Z",
          lifecycleStatus: "cancelled",
        },
        now,
      ),
    ).toBe("cancelled");
    expect(
      withEventLifecycle(
        {
          startsAt: "2026-08-17T13:00:00.000Z",
          endsAt: "2026-08-17T15:00:00.000Z",
          lifecycleStatus: "active",
        },
        now,
      ),
    ).toMatchObject({ lifecycleStatus: "completed", live: false });
  });
});
