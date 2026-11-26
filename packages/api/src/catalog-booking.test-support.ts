/**
 * Shared fixture for catalog booking integration tests: an in-memory Postgres
 * with every real migration applied (including the credit-ledger functions and
 * guards), and a small academy with one bookable group session.
 *
 * The test file itself must mock `@duna/db` so `getDatabase()` and
 * `getTransactionalDatabase()` return the database created here.
 */
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@duna/db/schema";
import { issueOrganizationCredits } from "./catalog-service";
import type { ApiActor, ApiAgeBand } from "./context";

export const academy = {
  org: "10000000-0000-4000-8000-000000000001",
  coach: "20000000-0000-4000-8000-000000000001",
  owner: "20000000-0000-4000-8000-000000000002",
  players: [1, 2, 3, 4, 5, 6, 7, 8].map(
    (index) => `30000000-0000-4000-8000-00000000000${index}`,
  ),
  item: "40000000-0000-4000-8000-000000000001",
  variant: "40000000-0000-4000-8000-000000000002",
  creditPrice: "40000000-0000-4000-8000-000000000003",
  /** Thursday 10 December 2026, 17:00 UTC. */
  occurrence: "50000000-0000-4000-8000-000000000001",
  /** One week later. */
  secondOccurrence: "50000000-0000-4000-8000-000000000002",
  /** Two weeks later. */
  thirdOccurrence: "50000000-0000-4000-8000-000000000003",
  now: new Date("2026-12-01T12:00:00.000Z"),
  startsAt: new Date("2026-12-10T17:00:00.000Z"),
} as const;

export function testActor(
  personId: string,
  organizationId?: string,
  ageBand: ApiAgeBand = "adult",
): ApiActor {
  return {
    personId,
    displayName: "Test person",
    roles: ["player"],
    organizationId,
    scopes: [],
    ageBand,
    isDemo: false,
  };
}

export function createCatalogTestDatabase() {
  const pg = new PGlite({ extensions: { btree_gist, pg_trgm, pgcrypto } });
  const db = drizzle(pg, { schema });
  // The Neon HTTP driver exposes `batch`; PGlite does not. Sequential
  // execution is the closest faithful stand-in for service-level tests.
  (db as unknown as { batch: unknown }).batch = async (
    queries: readonly PromiseLike<unknown>[],
  ) => {
    const results: unknown[] = [];
    for (const query of queries) results.push(await query);
    return results;
  };
  return { pg, db };
}

export async function applyAllMigrations(pg: PGlite): Promise<void> {
  process.env.DATABASE_URL = "postgres://pglite.invalid/duna";
  const directory = new URL("../../db/drizzle/", import.meta.url);
  const journal = JSON.parse(
    readFileSync(new URL("meta/_journal.json", directory), "utf8"),
  ) as { readonly entries: readonly { readonly tag: string }[] };
  for (const entry of journal.entries) {
    const migration = readFileSync(
      new URL(`${entry.tag}.sql`, directory),
      "utf8",
    );
    for (const statement of migration.split("--> statement-breakpoint")) {
      if (statement.trim()) await pg.exec(statement);
    }
  }
}

/** Resets the database to the academy with ten credits in every wallet. */
export async function seedAcademy(pg: PGlite): Promise<void> {
  const { org, coach, owner, players, item, variant, creditPrice } = academy;
  const occurrences = [
    [academy.occurrence, "2026-12-10"],
    [academy.secondOccurrence, "2026-12-17"],
    [academy.thirdOccurrence, "2026-12-24"],
  ] as const;
  await pg.exec(`
    TRUNCATE organizations, people CASCADE;
    INSERT INTO organizations (id, slug, name, currency, timezone)
      VALUES ('${org}', 'beach-test', 'Beach Test Academy', 'USD', 'UTC');
    INSERT INTO people (id, display_name, handle)
      VALUES ('${coach}', 'Coach', 'coach'), ('${owner}', 'Owner', 'owner')
      ${players.map((id, index) => `, ('${id}', 'Player ${index + 1}', 'player-${index + 1}')`).join("")};
    INSERT INTO organization_memberships (organization_id, person_id, role)
      VALUES ('${org}', '${owner}', 'owner'), ('${org}', '${coach}', 'coach');
    INSERT INTO organization_staff_profiles (organization_id, person_id, staff_role, availability)
      VALUES ('${org}', '${coach}', 'coach', '${JSON.stringify(
        [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
          weekday,
          startsAt: "00:00",
          endsAt: "23:59",
        })),
      )}'::jsonb);
    INSERT INTO catalog_items (id, organization_id, type, subtype, slug, title, status, allow_card, allow_credits, configuration)
      VALUES ('${item}', '${org}', 'service', 'group-lesson', 'group-training', 'Group training', 'active', false, true, '${JSON.stringify(
        {
          durationMinutes: 60,
          capacity: 8,
          deliveryMode: "online",
          coachAssignmentMode: "selected",
          coachPersonIds: [coach],
          requiredCoachCount: 1,
          sessionSchedule: {
            mode: "one-off",
            timezone: "UTC",
            weekly: [],
            oneOff: occurrences.map(([, date]) => ({
              date,
              startsAt: "17:00",
            })),
            blackoutDates: [],
          },
        },
      )}'::jsonb);
    INSERT INTO catalog_variants (id, organization_id, catalog_item_id, title)
      VALUES ('${variant}', '${org}', '${item}', 'Group training');
    INSERT INTO catalog_prices (id, organization_id, catalog_item_id, catalog_variant_id, payment_kind, credit_amount)
      VALUES ('${creditPrice}', '${org}', '${item}', '${variant}', 'credit', 2);
    INSERT INTO catalog_session_occurrences (id, organization_id, catalog_item_id, starts_at, ends_at, timezone, local_date, local_time, coach_person_ids, capacity, created_at)
      VALUES ${occurrences
        .map(
          ([id, date]) =>
            // Created well before any cutoff, independent of the wall clock.
            `('${id}', '${org}', '${item}', '${date}T17:00:00.000Z', '${date}T18:00:00.000Z', 'UTC', '${date}', '17:00', ARRAY['${coach}']::uuid[], 8, '2026-11-01T00:00:00.000Z')`,
        )
        .join(", ")};
  `);
  for (const player of players) {
    await pg.exec(
      `INSERT INTO organization_participants (organization_id, person_id, relationship, status) VALUES ('${org}', '${player}', 'player', 'active')`,
    );
    await issueOrganizationCredits({
      actor: testActor(owner, org),
      personId: player,
      credits: 10,
      reason: "Test credits",
      requestId: `grant:${player}`,
      now: academy.now,
    });
  }
}

/** Sets participation rules and the matching credit price on the test offer. */
export async function configureParticipation(
  pg: PGlite,
  participation: Record<string, unknown>,
  creditCost: number,
): Promise<void> {
  await pg.query(
    `update catalog_items set configuration = configuration || $1::jsonb where id = $2`,
    [JSON.stringify({ participation }), academy.item],
  );
  await pg.query(`update catalog_prices set credit_amount = $1 where id = $2`, [
    creditCost,
    academy.creditPrice,
  ]);
}

/**
 * A wallet's cached balance, its grants, and its ledger account. They must
 * always agree; a test that only checked the cache could miss a ledger drift.
 */
export async function walletState(
  pg: PGlite,
  personId: string,
): Promise<{ cached: number; granted: number; ledger: number } | undefined> {
  const result = await pg.query<{
    cached: number;
    granted: number;
    ledger: number;
  }>(
    `select
       w.cached_available_credits as cached,
       (select coalesce(sum(g.remaining_credits), 0)::int
          from organization_credit_grants g
         where g.organization_wallet_id = w.id) as granted,
       (select coalesce(sum(case when e.side = 'credit' then e.amount else -e.amount end), 0)::int
          from ledger_entries e
          join ledger_journals j on j.id = e.journal_id and j.status = 'posted'
         where e.account_id = w.credit_ledger_account_id) as ledger
     from organization_wallets w
    where w.person_id = $1`,
    [personId],
  );
  return result.rows[0];
}
