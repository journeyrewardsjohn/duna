import { demoBookings, demoEvents } from "@duna/core/demo";
import { describe, expect, it } from "vitest";
import { linkedHomeEvent } from "./home-v3-data";

describe("Home v3 event routing", () => {
  it.each([
    ["booking-pickup", "event-pickup"],
    ["booking-clinic", "event-clinic"],
    ["booking-league", "event-summer-series"],
  ])("opens the linked event for %s", (bookingId, eventId) => {
    const booking = demoBookings.find((item) => item.id === bookingId);
    expect(booking).toBeDefined();
    expect(linkedHomeEvent(booking!, demoEvents)?.id).toBe(eventId);
  });

  it("leaves a standalone court reservation on its booking route", () => {
    const booking = {
      ...demoBookings[0]!,
      id: "standalone-court",
      sessionId: undefined,
      title: "Court 2 reservation",
    };
    expect(linkedHomeEvent(booking, demoEvents)).toBeUndefined();
  });
});
