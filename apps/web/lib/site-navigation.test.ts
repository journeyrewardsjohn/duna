import { describe, expect, it } from "vitest";
import {
  selectHqNavigationQuickAction,
  selectPlayerNavigationQuickAction,
} from "./site-navigation";

const now = new Date("2026-08-08T10:00:00.000Z").getTime();

function event(
  overrides: Partial<{
    id: string;
    title: string;
    startsAt: string;
    venueName: string;
    organizationName: string;
    lifecycleStatus: "active" | "cancelled" | "completed";
    host: { id: string };
  }> = {},
) {
  return {
    id: "event-1",
    title: "Golden Hour 4s",
    startsAt: "2026-08-09T18:00:00.000Z",
    venueName: "Hermosa Pier",
    organizationName: "South Bay Volleyball Club",
    lifecycleStatus: "active" as const,
    ...overrides,
  };
}

describe("site navigation quick actions", () => {
  it("routes a player's nearest future booking into Duna Player", () => {
    const action = selectPlayerNavigationQuickAction(
      {
        player: { id: "player-1" },
        bookings: [
          {
            title: "Past pickup",
            startsAt: "2026-08-07T18:00:00.000Z",
            venueName: "Past court",
          },
          {
            title: "Saturday pairs",
            startsAt: "2026-08-09T14:00:00.000Z",
            venueName: "Center Court",
          },
        ],
        events: [],
      },
      now,
    );

    expect(action).toMatchObject({
      product: "Duna Player",
      title: "Saturday pairs",
      href: "/app/play",
    });
  });

  it("falls back to a future hosted event and ignores cancelled events", () => {
    const action = selectPlayerNavigationQuickAction(
      {
        player: { id: "player-1" },
        bookings: [],
        events: [
          event({
            id: "cancelled",
            lifecycleStatus: "cancelled",
            host: { id: "player-1" },
          }),
          event({ id: "hosted", host: { id: "player-1" } }),
        ],
      },
      now,
    );

    expect(action).toMatchObject({
      product: "Duna Player",
      title: "Golden Hour 4s",
      href: "/app",
    });
  });

  it("deep-links the next authorized operator event into Duna HQ", () => {
    const action = selectHqNavigationQuickAction(
      {
        organization: { name: "South Bay Volleyball Club" },
        events: [event({ id: "session-42" })],
      },
      "https://hq.duna.coach/",
      now,
    );

    expect(action).toMatchObject({
      product: "Duna HQ",
      href: "https://hq.duna.coach/events/session-42",
    });
  });
});
