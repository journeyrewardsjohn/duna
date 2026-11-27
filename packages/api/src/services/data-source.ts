import { isDatabaseConfigured } from "@duna/db";

/**
 * The single rule for "serve demo fixtures instead of the database".
 *
 * Demo data is used when no DATABASE_URL is configured (CI, Playwright and
 * local layout work) or when DUNA_DATA_SOURCE=demo forces it on a connected
 * machine. This is the same rule getRepository() applies in ../repository.ts,
 * so a new domain service and the legacy repository always agree.
 *
 * Every procedure added under routers/** must branch on this before touching
 * the database, and return fixtures from @duna/core/demo/<domain>.
 *
 * Note: actor.isDemo only says the *caller* is the synthetic demo actor; it
 * does not decide the data source. Use it for authorization-shaped decisions
 * (for example "never write for a demo actor"), not for choosing fixtures.
 */
export function usesDemoData(): boolean {
  return (
    !isDatabaseConfigured() ||
    process.env.DUNA_DATA_SOURCE?.toLowerCase() === "demo"
  );
}
