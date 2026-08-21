import type { EventSummary } from "@duna/core";
import { describe, expect, it } from "vitest";
import { isPlayerPlayableEvent, selectPlayerPickups } from "./player-pickups";

const now = new Date("2026-08-21T16:00:00.000Z");

function pickup(overrides: Partial<EventSummary>): EventSummary {
  return {
    id: "pickup-id",
    slug: "pickup-id",
    title: "Golden Hour 4s",
    kind: "pickup",
    organizationName: "Beach Elite",
    venueName: "Hermosa Beach — Pier Courts",
    startsAt: "2026-08-21T18:00:00.000Z",
    endsAt: "2026-08-21T19:30:00.000Z",
    timezone: "America/New_York",
    price: { amountMinor: 0, currency: "USD" },
    spotsRemaining: 3,
    capacity: 4,
    tags: ["Pickup"],
    ...overrides,
  };
}

describe("selectPlayerPickups", () => {
  it("keeps completed and cancelled events out of player planning surfaces", () => {
    expect(
      isPlayerPlayableEvent(
        pickup({
          endsAt: "2026-08-21T15:59:00.000Z",
        }),
        now,
      ),
    ).toBe(false);
    expect(
      isPlayerPlayableEvent(pickup({ lifecycleStatus: "cancelled" }), now),
    ).toBe(false);
  });

  it("does not promote a completed pickup as a current match", () => {
    const selection = selectPlayerPickups(
      [
        pickup({
          id: "golden-hour-aug-3",
          slug: "pickup-29b45270-9fef-4561-a91a-690bb242b08c",
          startsAt: "2026-08-03T22:00:00.000Z",
          endsAt: "2026-08-03T23:30:00.000Z",
        }),
        pickup({
          id: "next-pickup",
          slug: "pickup-next",
          title: "Sunset 4s",
          startsAt: "2026-08-22T22:00:00.000Z",
          endsAt: "2026-08-22T23:30:00.000Z",
        }),
      ],
      now,
    );

    expect(selection.pickups.map((event) => event.id)).toEqual(["next-pickup"]);
    expect(selection.featuredPickup?.id).toBe("next-pickup");
    expect(selection.featuredPickupPhase).toBe("upcoming");
  });

  it("prioritizes a match in progress over a later upcoming pickup", () => {
    const selection = selectPlayerPickups(
      [
        pickup({
          id: "later-pickup",
          startsAt: "2026-08-21T18:00:00.000Z",
          endsAt: "2026-08-21T19:30:00.000Z",
        }),
        pickup({
          id: "playing-now",
          startsAt: "2026-08-21T15:00:00.000Z",
          endsAt: "2026-08-21T17:00:00.000Z",
        }),
      ],
      now,
    );

    expect(selection.featuredPickup?.id).toBe("playing-now");
    expect(selection.featuredPickupPhase).toBe("live");
  });
});
