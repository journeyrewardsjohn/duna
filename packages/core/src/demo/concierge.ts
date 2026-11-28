/**
 * Demo fixtures: concierge (owner: B7). Concierge threads, Send card and per-person delivery (flags concierge.channel.*).
 *
 * See ./README.md for how demo mode is selected and the fixture rules. Import
 * as `@duna/core/demo/concierge`. Mint ids with
 * `demoId("concierge", n)` from "./ids" so domains never collide.
 */
export const conciergeDemo = {
  domain: "concierge",
} as const;
