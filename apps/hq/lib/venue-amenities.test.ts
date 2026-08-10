import { describe, expect, it } from "vitest";
import {
  buildVenueAmenities,
  parseVenueAmenities,
  venueAmenityLabel,
} from "./venue-amenities";

describe("venue amenities", () => {
  it("normalizes structured and legacy labels", () => {
    expect(
      parseVenueAmenities([
        "Free parking on-site",
        "Public restrooms",
        "Spectator seating",
        "Outdoor showers",
      ]),
    ).toEqual({
      parking: "parking-free",
      restrooms: "restrooms-public",
      toggles: ["spectator-seating"],
      additional: ["Outdoor showers"],
    });
  });

  it("builds a deduplicated persistence list", () => {
    expect(
      buildVenueAmenities({
        parking: "parking-paid",
        restrooms: "restrooms-private",
        toggles: ["ev-charging", "spectator-seating"],
        additional: "Outdoor showers, spectator seating",
      }),
    ).toEqual([
      "parking-paid",
      "restrooms-private",
      "ev-charging",
      "spectator-seating",
      "Outdoor showers",
    ]);
  });

  it("returns player-facing labels", () => {
    expect(venueAmenityLabel("byob-alcohol")).toBe("BYOB alcohol allowed");
    expect(venueAmenityLabel("Equipment storage")).toBe("Equipment storage");
  });
});
