import { describe, expect, it } from "vitest";

import {
  addressLocalityLine,
  formatAddress,
  googleMapsHref,
  isStructuredAddressComplete,
  normalizeAddress,
} from "./address";

const address = {
  googlePlaceId: "ChIJDunaAddress",
  addressLine1: "9830 Windygap Road",
  locality: "Charlotte",
  administrativeArea: "NC",
  postalCode: "28278",
  countryCode: "us",
  latitude: 35.143,
  longitude: -80.945,
} as const;

describe("HQ structured addresses", () => {
  it("normalizes and formats a complete Google Places result", () => {
    expect(normalizeAddress(address).countryCode).toBe("US");
    expect(addressLocalityLine(address)).toBe("Charlotte, NC 28278");
    expect(formatAddress(address)).toBe(
      "9830 Windygap Road, Charlotte, NC 28278, US",
    );
    expect(isStructuredAddressComplete(address)).toBe(true);
  });

  it("does not treat a visible street string as a complete tax address", () => {
    expect(formatAddress({ countryCode: "US" })).toBe("");
    expect(
      isStructuredAddressComplete({
        addressLine1: "9830 Windygap Road, Charlotte, NC 28278",
        countryCode: "US",
      }),
    ).toBe(false);
  });

  it("opens Google Maps with the stable place id", () => {
    const href = new URL(googleMapsHref(address));
    expect(href.searchParams.get("query_place_id")).toBe("ChIJDunaAddress");
    expect(href.searchParams.get("query")).toBe("35.143,-80.945");
  });
});
