import { describe, expect, it } from "vitest";
import {
  courtBookingMatchFormat,
  courtBookingMatchTitle,
} from "./database-repository";

describe("court booking match defaults", () => {
  it("names the match in the venue timezone without another setup step", () => {
    expect(
      courtBookingMatchTitle({
        startsAt: new Date("2026-09-06T01:30:00.000Z"),
        timeZone: "America/New_York",
        venueName: "The Strand",
      }),
    ).toBe("Saturday match at The Strand");
  });

  it("chooses a team format from the durable roster capacity", () => {
    expect(courtBookingMatchFormat(4)).toBe("2s");
    expect(courtBookingMatchFormat(6)).toBe("3s");
    expect(courtBookingMatchFormat(8)).toBe("4s");
    expect(courtBookingMatchFormat(12)).toBe("6s");
  });
});
