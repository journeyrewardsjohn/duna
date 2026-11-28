import { describe, expect, it } from "vitest";
import type { PersonSummary } from "@duna/core";
import {
  addGuest,
  checkoutParticipants,
  contactRoutes,
  contactToGuest,
  manualGuest,
  payLines,
  phoneE164,
  removeGuest,
  rosterSeats,
  withDunaPlayers,
} from "./roster";

const booker = {
  personId: "me",
  name: "John Sutton",
  photoUrl: "https://x/me.jpg",
};
const person = (id: string, name: string) =>
  ({
    id,
    displayName: name,
    avatarUrl: `https://x/${id}.jpg`,
  }) as PersonSummary;

describe("roster: the booker is always first", () => {
  it("draws the booker, then guests, then open seats up to the court's capacity", () => {
    const seats = rosterSeats({
      booker,
      guests: [
        {
          personId: "p2",
          name: "Taylor Crabb",
          person: person("p2", "Taylor Crabb"),
        },
      ],
      capacity: 4,
    });
    expect(seats.map((seat) => seat.kind)).toEqual([
      "booker",
      "guest",
      "open",
      "open",
    ]);
    expect(seats[0]).toMatchObject({
      name: "John Sutton",
      photoUrl: "https://x/me.jpg",
    });
    expect(seats[1]).toMatchObject({
      onDuna: true,
      channel: "duna",
      photoUrl: "https://x/p2.jpg",
    });
  });

  it("an empty roster is the booker and three inviting seats (doubles)", () => {
    expect(
      rosterSeats({ booker, guests: [] }).map((seat) => seat.kind),
    ).toEqual(["booker", "open", "open", "open"]);
  });

  it("a court that allows twelve still draws four seats, not eleven empty ones", () => {
    expect(rosterSeats({ booker, guests: [], capacity: 12 })).toHaveLength(4);
    expect(rosterSeats({ booker, guests: [], capacity: 2 })).toHaveLength(2);
  });

  it("grows past the drawn seats without open ones", () => {
    const guests = ["a", "b", "c", "d"].map((id) => ({ email: `${id}@x.com` }));
    const seats = rosterSeats({ booker, guests, capacity: 4 });
    expect(seats).toHaveLength(5);
    expect(seats.some((seat) => seat.kind === "open")).toBe(false);
    expect(seats[1]).toMatchObject({ channel: "email", onDuna: false });
  });

  it("refuses the booker, duplicates and people with no way to reach them", () => {
    expect(addGuest([], { personId: "me" }, booker)).toMatchObject({
      ok: false,
      reason: "booker",
    });
    const once = addGuest(
      [],
      { phoneE164: "+15555550100", name: "Kim" },
      booker,
    );
    expect(once.ok).toBe(true);
    const guests = once.ok ? once.guests : [];
    expect(
      addGuest(guests, { phoneE164: "+15555550100" }, booker),
    ).toMatchObject({
      ok: false,
      reason: "duplicate",
    });
    expect(addGuest(guests, { name: "Nobody" }, booker)).toMatchObject({
      ok: false,
      reason: "no-contact",
    });
    expect(removeGuest(guests, "+15555550100")).toEqual([]);
  });

  it("Duna players from the sheet replace earlier Duna picks; outside people stay; the booker never joins twice", () => {
    const guests = withDunaPlayers(
      [{ personId: "old", name: "Old" }, { email: "kim@x.com" }],
      [person("me", "John Sutton"), person("p2", "Taylor Crabb")],
      booker,
    );
    expect(guests.map((guest) => guest.personId ?? guest.email)).toEqual([
      "p2",
      "kim@x.com",
    ]);
  });
});

describe("contact → invitation", () => {
  it("offers mobile numbers first, then emails, without duplicates", () => {
    const routes = contactRoutes({
      name: "Kerri Walsh",
      phones: [
        { label: "home", number: "(704) 555-0101" },
        { label: "mobile", number: "+1 704 555 0199" },
        { label: "work", number: "123" },
      ],
      emails: [{ label: "home", address: " Kerri@Example.com " }],
    });
    expect(routes).toEqual([
      { kind: "text", value: "+17045550199", label: "mobile" },
      { kind: "text", value: "+17045550101", label: "home" },
      { kind: "email", value: "kerri@example.com", label: "home" },
    ]);
  });

  it("a picked contact becomes ONLY a name and the one route chosen", () => {
    expect(
      contactToGuest("  Kerri Walsh ", {
        kind: "text",
        value: "+17045550199",
        label: "mobile",
      }),
    ).toEqual({
      name: "Kerri Walsh",
      phoneE164: "+17045550199",
    });
    expect(
      contactToGuest("", { kind: "email", value: "k@x.com", label: "home" }),
    ).toEqual({ email: "k@x.com" });
  });

  it("the manual path takes a name with a mobile or an email", () => {
    expect(manualGuest("Kim", "704 555 0101")).toEqual({
      guest: { name: "Kim", phoneE164: "+17045550101" },
    });
    expect(manualGuest("Kim", "KIM@x.com")).toEqual({
      guest: { name: "Kim", email: "kim@x.com" },
    });
    expect(manualGuest("Kim", "12")).toHaveProperty("error");
    expect(manualGuest("Kim", "kim@")).toHaveProperty("error");
    expect(phoneE164("+44 7700 900123")).toBe("+447700900123");
  });

  it("sends the checkout only identity fields, never the person object", () => {
    expect(
      checkoutParticipants([
        { personId: "p2", name: "Taylor", person: person("p2", "Taylor") },
        { name: "Kim", phoneE164: "+17045550101" },
      ]),
    ).toEqual([
      { personId: "p2", name: "Taylor" },
      { name: "Kim", phoneE164: "+17045550101" },
    ]);
  });
});

describe("split maths come from the backend's quote", () => {
  const quote = {
    totalMinor: 3001,
    payNowMinor: 751,
    participantShareMinor: 750,
    shareCount: 4,
    feeTotalMinor: 0,
  };
  it("shows the backend's shares as they are (the odd cent stays where the backend put it)", () => {
    expect(payLines(quote, "split")).toEqual({
      totalMinor: 3001,
      payNowMinor: 751,
      eachGuestMinor: 750,
      shareCount: 4,
      feeMinor: 0,
    });
  });
  it("paying everything has no guest share", () => {
    expect(payLines({ ...quote, payNowMinor: 3001 }, "full")).toEqual({
      totalMinor: 3001,
      payNowMinor: 3001,
      shareCount: 1,
      feeMinor: 0,
    });
  });
});

describe("Duna player suggestions", () => {
  it("shows a provisional Sand Rating as a dash", async () => {
    const { sandRatingText } = await import("./roster");
    expect(sandRatingText({ display: 4.214, confidence: "Reliable" })).toBe(
      "4.21",
    );
    expect(sandRatingText({ display: 3, confidence: "Provisional" })).toBe("–");
    expect(sandRatingText(undefined)).toBe("–");
  });
  it("puts frequent partners first, then connections, then by shared teams", async () => {
    const { suggestionOrder } = await import("./roster");
    const order = suggestionOrder([
      { id: "a", relationship: "search", sharedTeams: 9 },
      { id: "b", relationship: "connection", sharedTeams: 1 },
      { id: "c", relationship: "recent-partner", sharedTeams: 1 },
      { id: "d", relationship: "recent-partner", sharedTeams: 5 },
    ]);
    expect(order.map((entry) => entry.id)).toEqual(["d", "c", "b", "a"]);
  });
});
