import { describe, expect, it } from "vitest";
import { mapPresenceFor, publicMapKeyConfigured } from "./map-presence";

describe("whether a page shows its map", () => {
  it("shows the map whenever the public key is set", () => {
    expect(
      mapPresenceFor({ configured: true, demo: false, development: false }),
    ).toBe("on");
  });

  it("explains a missing key only in demo mode or development", () => {
    expect(
      mapPresenceFor({ configured: false, demo: true, development: false }),
    ).toBe("explain");
    expect(
      mapPresenceFor({ configured: false, demo: false, development: true }),
    ).toBe("explain");
  });

  it("draws no map for the public when the key is missing", () => {
    expect(
      mapPresenceFor({ configured: false, demo: false, development: false }),
    ).toBe("off");
    expect(
      mapPresenceFor({
        configured: false,
        demo: true,
        development: false,
        asPublic: true,
      }),
    ).toBe("off");
  });

  it("reads the key the way the token route does", () => {
    expect(publicMapKeyConfigured({ MAPBOX_API_TOKEN_PUBLIC: " pk.abc" })).toBe(
      true,
    );
    expect(publicMapKeyConfigured({ MAPBOX_API_TOKEN: "sk.secret" })).toBe(
      false,
    );
    expect(publicMapKeyConfigured({})).toBe(false);
  });
});
