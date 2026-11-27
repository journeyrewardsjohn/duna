/**
 * Deterministic demo UUIDs for the R3 domain fixtures.
 *
 * Each domain owns one reserved prefix, so fixtures written in parallel by
 * different work packages can never collide with each other or with the
 * legacy demo ranges (10000000…, 20000000…, 33000000… and so on).
 * Add a new domain by appending the next unused prefix; never renumber.
 */
export const demoIdPrefixes = {
  setup: "d0010000",
  pay: "d0020000",
  "team-availability": "d0030000",
  "team-pay": "d0040000",
  "team-payouts": "d0050000",
  "training-programs": "d0060000",
  "training-drills": "d0070000",
  "training-scene-ai": "d0080000",
  concierge: "d0090000",
  "website-workspace": "d00a0000",
  "website-templates": "d00b0000",
  facility: "d00c0000",
  search: "d00d0000",
  conditions: "d00e0000",
  health: "d00f0000",
} as const;

export type DemoDomain = keyof typeof demoIdPrefixes;

/** A stable RFC 4122 v4-shaped UUID, unique per (domain, sequence). */
export function demoId(domain: DemoDomain, sequence: number): string {
  if (!Number.isSafeInteger(sequence) || sequence < 0) {
    throw new RangeError("Demo id sequence must be a non-negative integer.");
  }
  return `${demoIdPrefixes[domain]}-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
}
