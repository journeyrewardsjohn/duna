import { describe, expect, it } from "vitest";
import { buildBookingShareMessage } from "./booking-share-message";

describe("buildBookingShareMessage", () => {
  it("includes the complete booking and share link", () => {
    const message = buildBookingShareMessage({
      title: "Court rental · Court 2",
      startsAt: "2026-08-29T22:00:00.000Z",
      endsAt: "2026-08-29T23:30:00.000Z",
      timezone: "America/Los_Angeles",
      organizationName: "Beach Elite VB Academy",
      locationName: "The Strand",
      address: "123 Beach Ave, Hermosa Beach, CA",
      courtName: "Court 2",
      playerNames: ["John Sutton", "Aare Aasmäe"],
      detailsUrl: "https://duna.coach/venues/the-strand",
    });

    expect(message).toContain("Saturday, August 29 · 3:00 PM–4:30 PM");
    expect(message).toContain("The Strand · Court 2");
    expect(message).toContain("Players: John Sutton, Aare Aasmäe");
    expect(message).toContain("Hosted by Beach Elite VB Academy");
    expect(message).toContain("https://duna.coach/venues/the-strand");
  });
});
