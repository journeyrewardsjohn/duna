import { describe, expect, it } from "vitest";
import { catalogOrderItemKind } from "./catalog-checkout";

describe("catalog transaction pricing", () => {
  it.each([
    [{ type: "event", subtype: "tournament" }, "registration"],
    [{ type: "service", subtype: "court-rental" }, "booking"],
    [{ type: "good", subtype: "apparel" }, "merchandise"],
    [{ type: "plan", subtype: "membership" }, "membership"],
    [{ type: "plan", subtype: "credit-pack" }, "package"],
    [{ type: "plan", subtype: "bundle" }, "package"],
  ] as const)("maps %o to %s pricing", (input, expected) => {
    expect(catalogOrderItemKind(input)).toBe(expected);
  });
});
