import { describe, expect, it } from "vitest";
import { canonicalJson, stableHash } from "./canonical";

describe("canonical JSON", () => {
  it("sorts nested keys without changing array order", () => {
    expect(
      canonicalJson({
        z: { beta: 2, alpha: 1 },
        a: [{ y: true, x: false }],
      }),
    ).toBe('{"a":[{"x":false,"y":true}],"z":{"alpha":1,"beta":2}}');
  });

  it("produces the same hash for equivalent object insertion orders", () => {
    expect(stableHash({ b: { d: 2, c: 1 }, a: 0 })).toBe(
      stableHash({ a: -0, b: { c: 1, d: 2 } }),
    );
  });
});
