import {
  demoBookings,
  demoEvents,
  demoMatches,
  demoPlayer,
} from "@duna/core/demo";
import { describe, expect, it } from "vitest";
import {
  buildHomeModel,
  greetingFor,
  linkedHomeEvent,
  shiftPreviewSchedule,
} from "./home-model";

const now = Date.UTC(2026, 10, 26, 21, 40); // Thu 26 Nov, 1:40 PM in Los Angeles
const timeZone = "America/Los_Angeles";

describe("Home model", () => {
  it.each([
    ["booking-pickup", "event-pickup"],
    ["booking-clinic", "event-clinic"],
    ["booking-league", "event-summer-series"],
  ])("opens the linked event for %s", (bookingId, eventId) => {
    const booking = demoBookings.find((item) => item.id === bookingId)!;
    expect(linkedHomeEvent(booking, demoEvents)?.id).toBe(eventId);
  });

  it("leaves a standalone court reservation on its booking", () => {
    const booking = {
      ...demoBookings[0]!,
      id: "standalone-court",
      sessionId: undefined,
      title: "Court 2 reservation",
    };
    expect(linkedHomeEvent(booking, demoEvents)).toBeUndefined();
  });

  it("Next up is the next FUTURE booking only, with its state", () => {
    const bookings = shiftPreviewSchedule(demoBookings, now);
    const past = {
      ...bookings[0]!,
      id: "past",
      startsAt: new Date(now - 3 * 3_600_000).toISOString(),
      endsAt: new Date(now - 3_600_000).toISOString(),
    };
    const model = buildHomeModel({
      player: demoPlayer,
      bookings: [past, ...bookings],
      events: shiftPreviewSchedule(demoEvents, now),
      recentMatches: demoMatches,
      now,
      timeZone,
    });
    expect(model.nextUp?.bookingId).not.toBe("past");
    expect(model.nextUp?.bookingId).toBe("booking-pickup");
    expect(model.nextUp?.day).toBe("Today");
    expect(model.nextUp?.countdown).toMatch(/^Starts in /);
    expect(["Confirmed", "On the waitlist", "Needs you"]).toContain(
      model.nextUp?.stateLabel,
    );
    expect(model.week.some((item) => item.bookingId === "booking-pickup")).toBe(
      false,
    );
  });

  it("no future booking: no Next up (the screen shows the empty state)", () => {
    const model = buildHomeModel({
      player: demoPlayer,
      bookings: [],
      events: [],
      recentMatches: [],
      now,
      timeZone,
    });
    expect(model.nextUp).toBeNull();
    expect(model.conditions).toBeNull();
    expect(model.week).toEqual([]);
  });

  it("greets by the time of day and names the player", () => {
    expect(greetingFor(8)).toBe("Good morning");
    expect(greetingFor(13)).toBe("Good afternoon");
    expect(greetingFor(20)).toBe("Good evening");
    const model = buildHomeModel({
      player: demoPlayer,
      bookings: [],
      events: [],
      recentMatches: [],
      now,
      timeZone,
      region: "South Bay",
    });
    expect(model.greeting).toMatch(/^Good afternoon, /);
    expect(model.dateLine).toBe("Thu, Nov 26 · South Bay");
  });

  it("the rating snapshot maps confidence to the reliability band", () => {
    const model = buildHomeModel({
      player: {
        ...demoPlayer,
        rating: { ...demoPlayer.rating, confidence: "Developing", delta: 0.08 },
      },
      bookings: [],
      events: [],
      recentMatches: demoMatches,
      now,
      timeZone,
    });
    expect(model.rating.reliability).toBe(2);
    expect(model.rating.value).toBe(demoPlayer.rating.display);
    expect(model.rating.summary).toBe("Up 0.08 since your last result");
    const provisional = buildHomeModel({
      player: {
        ...demoPlayer,
        rating: { ...demoPlayer.rating, confidence: "Provisional" },
      },
      bookings: [],
      events: [],
      recentMatches: [],
      now,
      timeZone,
    });
    expect(provisional.rating.value).toBeNull();
  });
});
