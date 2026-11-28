import { expect } from "vitest";

/**
 * Test helper for W3 fixtures: every value of a state tuple (from
 * `@duna/db/schema`) appears at least once in the fixtures, so UI agents can
 * build every state from demo data.
 */
export function expectCoverage(
  states: readonly string[],
  seen: readonly string[],
): void {
  const missing = states.filter((state) => !seen.includes(state));
  expect(missing, `fixture states missing: ${missing.join(", ")}`).toEqual([]);
}
