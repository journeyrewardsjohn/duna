import type { BookingSummary } from "@duna/core";
import { describe, expect, it } from "vitest";
import {
  buildAgenda,
  catalogCancellationLine,
  icsFor,
  localDay,
  registrationCancellationLine,
  yourTimeNote,
} from "./agenda-model";
import type { CatalogBooking } from "./api-types";

const NOW = Date.parse("2026-11-28T18:00:00.000Z"); // Sat 10:00 AM in Los Angeles
const ME = { id: "p-me", displayName: "Mara Lewis" };

function booking(over: Partial<BookingSummary> = {}): BookingSummary {
  return {
    id: "b1",
    source: "registration",
    sessionId: "s1",
    title: "Sunset Open",
    kind: "tournament",
    startsAt: "2026-11-30T17:00:00.000Z",
    endsAt: "2026-11-30T20:00:00.000Z",
    venueName: "Hermosa Beach",
    venueTimezone: "America/Los_Angeles",
    status: "confirmed",
    amount: { amountMinor: 6000, currency: "USD" },
    paymentStatus: "paid",
    participantNames: ["Mara Lewis"],
    ...over,
  };
}

function catalog(over: Partial<CatalogBooking> = {}): CatalogBooking {
  return {
    bookingId: "c1",
    orderId: "o1",
    status: "confirmed",
    catalogItemId: "i1",
    catalogItemSlug: "serve-receive-lab",
    title: "Serve + Receive Lab",
    subtype: "clinic",
    organization: { id: "org", slug: "club", name: "South Bay Beach Club" },
    startsAt: "2026-12-01T01:00:00.000Z",
    endsAt: "2026-12-01T02:30:00.000Z",
    timezone: "America/Los_Angeles",
    sessionStatus: "scheduled",
    deliveryMode: "venue",
    coaches: [],
    participant: { personId: ME.id, displayName: ME.displayName, isSelf: true },
    bookedBy: { personId: ME.id, displayName: ME.displayName, isSelf: true },
    paidByPersonId: ME.id,
    quantity: 1,
    creditsReserved: 3,
    cancellable: true,
    refundIfCancelledNow: true,
    refundableUntil: "2026-11-30T01:00:00.000Z",
    bookedAt: "2026-11-20T00:00:00.000Z",
    ...over,
  } as CatalogBooking;
}

const base = {
  person: ME,
  actingFor: null,
  dependents: [],
  now: NOW,
  viewerTimeZone: "America/Los_Angeles",
  adult: true,
};

describe("agenda grouping across time zones", () => {
  it("puts a plan on the day it happens where it happens, not the viewer's day", () => {
    // 9 PM Sunday in Honolulu is 07:00 UTC Monday and 11 PM Sunday in LA.
    const honolulu = catalog({
      bookingId: "c-hnl",
      title: "Waikiki Clinic",
      startsAt: "2026-11-30T07:00:00.000Z",
      endsAt: "2026-11-30T08:00:00.000Z",
      timezone: "Pacific/Honolulu",
    });
    expect(localDay(Date.parse(honolulu.startsAt), "Pacific/Honolulu")).toBe(
      "2026-11-29",
    );
    expect(localDay(Date.parse(honolulu.startsAt), "America/Los_Angeles")).toBe(
      "2026-11-29",
    );
    const sydney = catalog({
      bookingId: "c-syd",
      title: "Bondi Pickup",
      startsAt: "2026-11-30T22:00:00.000Z",
      endsAt: "2026-11-30T23:00:00.000Z",
      timezone: "Australia/Sydney",
    });
    // Tuesday 9 AM in Sydney is still Monday afternoon in LA.
    const agenda = buildAgenda({
      ...base,
      bookings: [],
      catalog: [sydney, honolulu],
    });
    const sydneyDay = agenda.upcoming.find((day) =>
      day.items.some((item) => item.title === "Bondi Pickup"),
    );
    expect(sydneyDay?.key).toBe("2026-12-01");
    expect(
      agenda.upcoming.find((day) =>
        day.items.some((item) => item.title === "Bondi Pickup"),
      )?.items[0]?.yourTime,
    ).toBe("(Mon 2:00 PM your time)");
  });

  it("orders days by the first plan and plans by start, and says Today and Tomorrow", () => {
    const agenda = buildAgenda({
      ...base,
      bookings: [
        booking({
          id: "late",
          title: "Later today",
          startsAt: "2026-11-28T23:00:00.000Z",
          endsAt: "2026-11-29T00:00:00.000Z",
        }),
        booking({
          id: "early",
          title: "Earlier today",
          startsAt: "2026-11-28T19:00:00.000Z",
          endsAt: "2026-11-28T20:00:00.000Z",
        }),
        booking({
          id: "tomorrow",
          title: "Tomorrow's",
          startsAt: "2026-11-29T19:00:00.000Z",
          endsAt: "2026-11-29T20:00:00.000Z",
        }),
      ],
      catalog: [],
    });
    expect(agenda.upcoming.map((day) => day.label)).toEqual([
      "Today",
      "Tomorrow",
    ]);
    expect(agenda.upcoming[0]!.items.map((item) => item.title)).toEqual([
      "Earlier today",
      "Later today",
    ]);
    expect(agenda.count).toBe(3);
  });

  it("adds no note when the viewer's clock shows the same time", () => {
    expect(
      yourTimeNote(
        Date.parse("2026-11-30T17:00:00.000Z"),
        "America/Los_Angeles",
        "America/Los_Angeles",
      ),
    ).toBeUndefined();
    expect(
      yourTimeNote(
        Date.parse("2026-11-30T17:00:00.000Z"),
        "America/New_York",
        "America/Los_Angeles",
      ),
    ).toBe("(9:00 AM your time)");
  });

  it("moves finished plans to Past, newest first, and leaves cancelled ones out", () => {
    const agenda = buildAgenda({
      ...base,
      bookings: [
        booking({
          id: "old",
          title: "Old",
          startsAt: "2026-11-20T17:00:00.000Z",
          endsAt: "2026-11-20T18:00:00.000Z",
        }),
        booking({
          id: "older",
          title: "Older",
          startsAt: "2026-11-10T17:00:00.000Z",
          endsAt: "2026-11-10T18:00:00.000Z",
        }),
      ],
      catalog: [catalog({ bookingId: "gone", status: "cancelled" })],
    });
    expect(agenda.upcoming).toEqual([]);
    expect(agenda.past.map((item) => item.title)).toEqual(["Old", "Older"]);
  });

  it("shows only the junior's plans while acting for them, labelled for them", () => {
    const remy = {
      personId: "p-remy",
      firstName: "Remy",
      displayName: "Remy Lewis",
    };
    const agenda = buildAgenda({
      ...base,
      actingFor: remy,
      dependents: [remy],
      bookings: [booking()],
      catalog: [
        catalog({ bookingId: "mine" }),
        catalog({
          bookingId: "his",
          title: "Junior Sand Skills",
          participant: {
            personId: "p-remy",
            displayName: "Remy Lewis",
            isSelf: false,
          },
        }),
      ],
    });
    const items = agenda.upcoming.flatMap((day) => day.items);
    expect(items.map((item) => item.title)).toEqual(["Junior Sand Skills"]);
    expect(items[0]!.forName).toBe("Remy");
    // The guardian acts: no share links from a junior's view.
    expect(items[0]!.actions.invite).toBeUndefined();
    expect(items[0]!.actions.cancel).toBeDefined();
  });
});

describe("the cancellation window, from the backend's fields", () => {
  it("free until the backend's refund time, in the shared words", () => {
    expect(catalogCancellationLine(catalog(), NOW, "America/Los_Angeles")).toBe(
      "Free cancellation until Sun 5:00 PM",
    );
    expect(catalogCancellationLine(catalog(), NOW, "America/New_York")).toBe(
      "Free cancellation until Sun 5:00 PM PST (8:00 PM your time)",
    );
  });

  it("a late cancellation states its cost, or that nothing comes back", () => {
    expect(
      catalogCancellationLine(
        catalog({ refundIfCancelledNow: false, lateCancelCharge: 3 }),
        NOW,
      ),
    ).toBe(
      "Cancelling now costs 3 credits. You get them back if someone takes your place.",
    );
    expect(
      catalogCancellationLine(catalog({ refundIfCancelledNow: false }), NOW),
    ).toBe("Cancelling now returns nothing.");
  });

  it("says when cancellation closed, and nothing when the backend allows none ahead", () => {
    expect(
      catalogCancellationLine(
        catalog({ cancellable: false, startsAt: "2026-11-28T17:00:00.000Z" }),
        NOW,
      ),
    ).toBe("Cancellation closed when this session started.");
    expect(
      catalogCancellationLine(catalog({ cancellable: false }), NOW),
    ).toBeUndefined();
  });

  it("a registration's deadline: free until it, then that it ended", () => {
    expect(
      registrationCancellationLine(
        booking({
          canCancel: true,
          cancellationDeadline: "2026-11-29T17:00:00.000Z",
        }),
        NOW,
        "America/Los_Angeles",
      ),
    ).toBe("Free cancellation until Sun 9:00 AM");
    expect(
      registrationCancellationLine(
        booking({
          canCancel: true,
          cancellationDeadline: "2026-11-27T17:00:00.000Z",
        }),
        NOW,
      ),
    ).toBe("Free cancellation ended Nov 27, 9:00 AM.");
  });

  it("only offers the actions the procedures allow", () => {
    const agenda = buildAgenda({
      ...base,
      bookings: [
        booking({ id: "court", source: "court", kind: "court-rental" }),
        booking({ id: "reg", canCancel: true }),
        booking({ id: "wait", status: "waitlisted", canCancel: true }),
        booking({
          id: "host",
          source: "pickup",
          kind: "pickup",
          sessionSlug: "golden-hour",
          pickup: {
            capacity: 8,
            confirmedCount: 1,
            spotsRemaining: 7,
            waitlistEnabled: true,
            approvalRequired: false,
            visibility: "public",
            pricePerPerson: { amountMinor: 0, currency: "USD" },
            canAddPlayers: true,
            isCreator: true,
          },
        }),
      ],
      catalog: [],
    });
    const byId = new Map(
      agenda.upcoming
        .flatMap((day) => day.items)
        .map((item) => [item.id, item]),
    );
    expect(byId.get("booking:court")!.actions.cancel).toBeUndefined();
    expect(byId.get("booking:reg")!.actions.cancel).toEqual({
      kind: "registration",
      bookingId: "reg",
    });
    expect(byId.get("booking:wait")!.actions.leaveWaitlist).toBeDefined();
    expect(byId.get("booking:wait")!.actions.cancel).toBeUndefined();
    expect(byId.get("booking:host")!.actions.edit).toBe(
      "/app/pickup/golden-hour/edit",
    );
    expect(byId.get("booking:host")!.actions.cancelHosted).toEqual({
      pickupSessionId: "s1",
    });
    expect(byId.get("booking:host")!.stateLabel).toBe("You're hosting");
  });
});

describe("price line", () => {
  it("uses the shared words for credits and states money as the booking says", () => {
    const agenda = buildAgenda({
      ...base,
      bookings: [booking({ canCancel: true })],
      catalog: [
        catalog(),
        catalog({ bookingId: "settled", creditsSettled: 2, title: "Settled" }),
      ],
    });
    const items = agenda.upcoming.flatMap((day) => day.items);
    expect(
      items.find((item) => item.title === "Serve + Receive Lab")!.priceLine,
    ).toBe("3 credits now.");
    expect(items.find((item) => item.title === "Settled")!.priceLine).toBe(
      "Group confirmed · you pay 2 credits",
    );
    expect(items.find((item) => item.title === "Sunset Open")!.priceLine).toBe(
      "$60.00 paid",
    );
  });
});

describe("add to calendar", () => {
  it("writes a calendar file with escaped text", () => {
    const file = icsFor(
      {
        id: "catalog:c1",
        title: "Serve, Receive; Lab",
        startsAt: "2026-12-01T01:00:00.000Z",
        endsAt: "2026-12-01T02:30:00.000Z",
        place: "South Bay Beach Club",
      },
      "2026-11-28T18:00:00.000Z",
    );
    expect(file).toContain("DTSTART:20261201T010000Z");
    expect(file).toContain("SUMMARY:Serve\\, Receive\\; Lab");
    expect(file).toContain("LOCATION:South Bay Beach Club");
  });
});
