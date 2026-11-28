/**
 * Demo fixtures: pay (owner: B2). Duna Pay (Connect embedded onboarding, payout/tax/refund policy, publish gate).
 *
 * See ./README.md for how demo mode is selected and the fixture rules. Import
 * as `@duna/core/demo/pay`. Mint ids with
 * `demoId("pay", n)` from "./ids" so domains never collide.
 */
export const payDemo = {
  domain: "pay",
} as const;
