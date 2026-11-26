import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { drizzle } from "drizzle-orm/pglite";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import * as schema from "@duna/db/schema";
import type { ApiActor } from "./context";

const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@duna/db", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getDatabase: () => state.db,
  getTransactionalDatabase: () => state.db,
}));

import { startCatalogCheckout } from "./catalog-checkout";
import {
  evaluateCatalogSessionParticipation,
  loadOperatorCatalogSessionOccurrences,
  processDueCatalogParticipation,
} from "./catalog-participation";
import {
  issueOrganizationCredits,
  loadPublicOrganizationStorefront,
  refundOrganizationOrder,
} from "./catalog-service";

const pg = new PGlite({ extensions: { btree_gist, pg_trgm, pgcrypto } });
const db = drizzle(pg, { schema });
// The Neon HTTP driver exposes `batch`; PGlite does not. Sequential execution
// is the closest faithful stand-in for these service-level tests.
(db as unknown as { batch: unknown }).batch = async (
  queries: readonly PromiseLike<unknown>[],
) => {
  const results: unknown[] = [];
  for (const query of queries) results.push(await query);
  return results;
};
state.db = db;

const org = "10000000-0000-4000-8000-000000000001";
const coach = "20000000-0000-4000-8000-000000000001";
const owner = "20000000-0000-4000-8000-000000000002";
const players = [1, 2, 3, 4, 5, 6, 7, 8].map(
  (index) => `30000000-0000-4000-8000-00000000000${index}`,
);
const item = "40000000-0000-4000-8000-000000000001";
const variant = "40000000-0000-4000-8000-000000000002";
const creditPrice = "40000000-0000-4000-8000-000000000003";
const occurrence = "50000000-0000-4000-8000-000000000001";
const now = new Date("2026-12-01T12:00:00.000Z");
const startsAt = new Date("2026-12-10T17:00:00.000Z");

function actor(personId: string, organizationId?: string): ApiActor {
  return {
    personId,
    displayName: "Test person",
    roles: ["player"],
    organizationId,
    scopes: [],
    ageBand: "adult",
    isDemo: false,
  };
}

async function credits(personId: string): Promise<number> {
  const result = await pg.query<{ credits: number }>(
    `select cached_available_credits as credits from organization_wallets where person_id = $1`,
    [personId],
  );
  return result.rows[0]?.credits ?? 0;
}

async function book(personId: string, quantity = 1, at = now) {
  return startCatalogCheckout({
    actor: actor(personId),
    catalogItemId: item,
    catalogVariantId: variant,
    paymentMethod: "credit",
    quantity,
    catalogSessionOccurrenceId: occurrence,
    successUrl: "https://example.test/success",
    cancelUrl: "https://example.test/cancel",
    idempotencyKey: crypto.randomUUID(),
    requestId: crypto.randomUUID(),
    now: at,
  });
}

// Beach Elite VB Academy: one player is a private, a small group pays less
// each, and a large group pays the least.
const academyTiers = [
  { minParticipants: 1, maxParticipants: 1, creditsPerPlayer: 3 },
  { minParticipants: 2, maxParticipants: 6, creditsPerPlayer: 2 },
  { minParticipants: 7, maxParticipants: 8, creditsPerPlayer: 1 },
];
const afterCutoff = new Date("2026-12-09T18:00:00.000Z");
const afterStart = new Date("2026-12-10T18:30:00.000Z");

async function configure(
  participation: Record<string, unknown>,
  creditCost: number,
) {
  await pg.query(
    `update catalog_items set configuration = configuration || $1::jsonb where id = $2`,
    [JSON.stringify({ participation }), item],
  );
  await pg.query(`update catalog_prices set credit_amount = $1 where id = $2`, [
    creditCost,
    creditPrice,
  ]);
}

function evaluate(
  at: Date,
  extra: {
    readonly attendedFulfillmentIds?: readonly string[];
    readonly force?: boolean;
  } = {},
) {
  return evaluateCatalogSessionParticipation({
    occurrenceId: occurrence,
    requestId: crypto.randomUUID(),
    now: at,
    ...extra,
  });
}

/** The wallet cache, its grants, and its ledger account must always agree. */
async function expectWalletConsistent(personId: string, expected: number) {
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
  expect(result.rows[0]).toEqual({
    cached: expected,
    granted: expected,
    ledger: expected,
  });
}

async function occurrenceRow() {
  const result = await pg.query<{
    status: string;
    participation_outcome: string | null;
    decided_headcount: number | null;
    settled_headcount: number | null;
  }>(
    `select status, participation_outcome, decided_headcount, settled_headcount
       from catalog_session_occurrences where id = $1`,
    [occurrence],
  );
  return result.rows[0]!;
}

async function fulfillmentIdFor(orderId: string): Promise<string> {
  const result = await pg.query<{ id: string }>(
    `select id from catalog_fulfillments where order_id = $1`,
    [orderId],
  );
  return result.rows[0]!.id;
}

beforeAll(async () => {
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
}, 120_000);

afterAll(() => pg.close());

beforeEach(async () => {
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
            oneOff: [{ date: "2026-12-10", startsAt: "17:00" }],
            blackoutDates: [],
          },
        },
      )}'::jsonb);
    INSERT INTO catalog_variants (id, organization_id, catalog_item_id, title)
      VALUES ('${variant}', '${org}', '${item}', 'Group training');
    INSERT INTO catalog_prices (id, organization_id, catalog_item_id, catalog_variant_id, payment_kind, credit_amount)
      VALUES ('${creditPrice}', '${org}', '${item}', '${variant}', 'credit', 2);
    INSERT INTO catalog_session_occurrences (id, organization_id, catalog_item_id, starts_at, ends_at, timezone, local_date, local_time, coach_person_ids, capacity)
      VALUES ('${occurrence}', '${org}', '${item}', '${startsAt.toISOString()}', '2026-12-10T18:00:00.000Z', 'UTC', '2026-12-10', '17:00', ARRAY['${coach}']::uuid[], 8);
  `);
  for (const player of players) {
    await pg.exec(
      `INSERT INTO organization_participants (organization_id, person_id, relationship, status) VALUES ('${org}', '${player}', 'player', 'active')`,
    );
    await issueOrganizationCredits({
      actor: actor(owner, org),
      personId: player,
      credits: 10,
      reason: "Test credits",
      requestId: `grant:${player}`,
      now,
    });
  }
});

describe("catalog session bookings without participation rules", () => {
  it("charges the fixed credit price and restores it on refund", async () => {
    const result = await book(players[0]!);
    expect(result).toMatchObject({
      mode: "organization-credit",
      orderStatus: "paid",
      creditsApplied: 2,
    });
    expect(await credits(players[0]!)).toBe(8);
    const refund = await refundOrganizationOrder({
      actor: actor(owner, org),
      orderId: result.orderId,
      amountMinor: 0,
      disposition: "original-payment",
      reason: "Test refund",
      requestId: crypto.randomUUID(),
      now,
    });
    expect(refund.status).toBe("succeeded");
    expect(await credits(players[0]!)).toBe(10);
  });
});

describe("group-size credit pricing", () => {
  beforeEach(() => configure({ creditTiers: academyTiers }, 3));

  it("reserves the highest tier at booking and never the fixed price", async () => {
    const result = await book(players[0]!);
    expect(result).toMatchObject({ orderStatus: "paid", creditsApplied: 3 });
    await expectWalletConsistent(players[0]!, 7);
    const family = await book(players[1]!, 3);
    expect(family.creditsApplied).toBe(9);
    await expectWalletConsistent(players[1]!, 1);
  });

  it("does nothing before the cutoff", async () => {
    await book(players[0]!);
    const evaluation = await evaluate(new Date("2026-12-05T12:00:00.000Z"));
    expect(evaluation.status).toBe("not-due");
    expect((await occurrenceRow()).participation_outcome).toBeNull();
    await expectWalletConsistent(players[0]!, 7);
  });

  it("keeps the private rate when one player books", async () => {
    await book(players[0]!);
    const evaluation = await evaluate(afterCutoff);
    expect(evaluation).toMatchObject({
      status: "settled",
      outcome: "minimum-met",
      headcount: 1,
    });
    expect(evaluation.settlements).toEqual([
      expect.objectContaining({
        creditsPerPlayer: 3,
        reservedCredits: 3,
        settledCredits: 3,
        returnedCredits: 0,
        applied: true,
      }),
    ]);
    await expectWalletConsistent(players[0]!, 7);
  });

  it("returns the difference to every wallet for a small group, exactly once", async () => {
    for (const player of players.slice(0, 4)) await book(player);
    const first = await evaluate(afterCutoff);
    expect(first.headcount).toBe(4);
    expect(first.settlements).toHaveLength(4);
    for (const settlement of first.settlements) {
      expect(settlement).toMatchObject({
        creditsPerPlayer: 2,
        reservedCredits: 3,
        settledCredits: 2,
        returnedCredits: 1,
        applied: true,
      });
    }
    for (const player of players.slice(0, 4)) {
      await expectWalletConsistent(player, 8);
    }

    // A second run, a later schedule tick, and an operator retry change nothing.
    const second = await evaluate(new Date(afterCutoff.getTime() + 60_000));
    expect(second.settlements.every((entry) => !entry.applied)).toBe(true);
    await processDueCatalogParticipation({ now: afterStart });
    for (const player of players.slice(0, 4)) {
      await expectWalletConsistent(player, 8);
    }
    const journals = await pg.query<{ count: number }>(
      `select count(*)::int as count from ledger_journals where source_type = 'catalog-credit-settlement'`,
    );
    expect(journals.rows[0]!.count).toBe(4);
    const refunds = await pg.query<{ credits: number }>(
      `select coalesce(sum(credits_restored), 0)::int as credits from refund_records`,
    );
    expect(refunds.rows[0]!.credits).toBe(4);
  });

  it("prices a large group at the lowest tier and counts multi-place bookings", async () => {
    await book(players[0]!, 3);
    for (const player of players.slice(1, 5)) await book(player);
    const evaluation = await evaluate(afterCutoff);
    expect(evaluation.headcount).toBe(7);
    await expectWalletConsistent(players[0]!, 7);
    for (const player of players.slice(1, 5)) {
      await expectWalletConsistent(player, 9);
    }
    expect(
      evaluation.settlements.find((entry) => entry.quantity === 3),
    ).toMatchObject({
      reservedCredits: 9,
      settledCredits: 3,
      returnedCredits: 6,
    });
  });

  it("returns carried cash value in proportion and restores the rest on a later refund", async () => {
    await issueOrganizationCredits({
      actor: actor(owner, org),
      personId: players[0]!,
      credits: 5,
      valueMinor: 5_000,
      currency: "USD",
      valueSource: "paid-credit-pack",
      // Expires first, so redemption spends these valued credits first.
      expiresAt: new Date("2027-01-01T00:00:00.000Z"),
      reason: "Paid credit pack",
      requestId: "valued-grant",
      now,
    });
    const booking = await book(players[0]!);
    await book(players[1]!);
    await evaluate(afterCutoff);
    await expectWalletConsistent(players[0]!, 13);
    const settlement = await pg.query<{
      returned_credits: number;
      returned_value_minor: number;
    }>(
      `select returned_credits, returned_value_minor::int as returned_value_minor
         from catalog_participation_settlements where order_id = $1`,
      [booking.orderId],
    );
    expect(settlement.rows[0]).toEqual({
      returned_credits: 1,
      returned_value_minor: 1_000,
    });
    const grant = await pg.query<{ credits: number; value: number }>(
      `select remaining_credits as credits, remaining_value_minor::int as value
         from organization_credit_grants where initial_value_minor = 5000`,
    );
    expect(grant.rows[0]).toEqual({ credits: 3, value: 3_000 });

    // Cancelling after settlement restores only what is still redeemed.
    await refundOrganizationOrder({
      actor: actor(owner, org),
      orderId: booking.orderId,
      amountMinor: 0,
      disposition: "original-payment",
      reason: "Player could not attend",
      requestId: crypto.randomUUID(),
      now: afterCutoff,
    });
    await expectWalletConsistent(players[0]!, 15);
    const restored = await pg.query<{ credits: number; value: number }>(
      `select remaining_credits as credits, remaining_value_minor::int as value
         from organization_credit_grants where initial_value_minor = 5000`,
    );
    expect(restored.rows[0]).toEqual({ credits: 5, value: 5_000 });
    const recognized = await pg.query<{ net: number }>(
      `select coalesce(sum(case when e.side = 'credit' then e.amount else -e.amount end), 0)::int as net
         from ledger_entries e
         join ledger_accounts a on a.id = e.account_id
        where a.code = 'SERVICE_REVENUE'`,
    );
    expect(recognized.rows[0]!.net).toBe(0);
  });

  it("charges a late booking the final tier with nothing left to settle", async () => {
    for (const player of players.slice(0, 4)) await book(player);
    await evaluate(afterCutoff);
    const late = await book(
      players[4]!,
      1,
      new Date(afterCutoff.getTime() + 60_000),
    );
    expect(late.creditsApplied).toBe(2);
    await expectWalletConsistent(players[4]!, 8);
    const again = await evaluate(new Date(afterCutoff.getTime() + 120_000));
    expect(
      again.settlements.some((entry) => entry.orderId === late.orderId),
    ).toBe(false);
    await expectWalletConsistent(players[4]!, 8);
  });

  it("settles from a schedule tick without an operator", async () => {
    for (const player of players.slice(0, 2)) await book(player);
    const summary = await processDueCatalogParticipation({ now: afterCutoff });
    expect(summary).toMatchObject({ examined: 1, settled: 1, failed: 0 });
    await expectWalletConsistent(players[0]!, 8);
    expect(
      await processDueCatalogParticipation({ now: afterStart }),
    ).toMatchObject({ examined: 0 });
  });
});

describe("player minimums", () => {
  it("cancels an under-filled session and restores every credit once", async () => {
    await configure({ minParticipants: 4, minimumPolicy: "cancel" }, 2);
    for (const player of players.slice(0, 2)) await book(player);
    await expectWalletConsistent(players[0]!, 8);
    const evaluation = await evaluate(afterCutoff);
    expect(evaluation).toMatchObject({
      status: "cancelled",
      outcome: "cancel-under-minimum",
      headcount: 2,
      minParticipants: 4,
    });
    expect(evaluation.cancellations.map((entry) => entry.refundStatus)).toEqual(
      ["credits-restored", "credits-restored"],
    );
    expect(await occurrenceRow()).toMatchObject({
      status: "cancelled",
      participation_outcome: "cancel-under-minimum",
      decided_headcount: 2,
    });
    for (const player of players.slice(0, 2)) {
      await expectWalletConsistent(player, 10);
    }
    const retry = await evaluate(afterStart);
    expect(retry.cancellations).toEqual([]);
    await processDueCatalogParticipation({ now: afterStart });
    for (const player of players.slice(0, 2)) {
      await expectWalletConsistent(player, 10);
    }
    await expect(book(players[2]!, 1, afterCutoff)).rejects.toThrow(
      "did not reach its minimum number of players",
    );
    await expectWalletConsistent(players[2]!, 10);
  });

  it("decides at booking time when the schedule has not run yet", async () => {
    await configure({ minParticipants: 4, minimumPolicy: "cancel" }, 2);
    await book(players[0]!);
    await expect(book(players[1]!, 1, afterCutoff)).rejects.toThrow(
      "did not reach its minimum number of players",
    );
    await expectWalletConsistent(players[0]!, 10);
    await expectWalletConsistent(players[1]!, 10);
  });

  it("confirms a session that meets its minimum", async () => {
    await configure({ minParticipants: 2, minimumPolicy: "cancel" }, 2);
    for (const player of players.slice(0, 2)) await book(player);
    const evaluation = await evaluate(afterCutoff);
    expect(evaluation).toMatchObject({
      status: "settled",
      outcome: "minimum-met",
      headcount: 2,
      settlements: [],
    });
    expect((await occurrenceRow()).status).toBe("scheduled");
    for (const player of players.slice(0, 2)) {
      await expectWalletConsistent(player, 8);
    }
  });

  it("runs under the minimum at the smallest-group rate when the policy says so", async () => {
    await configure(
      {
        minParticipants: 4,
        minimumPolicy: "run",
        creditTiers: [
          { minParticipants: 4, maxParticipants: 6, creditsPerPlayer: 3 },
          { minParticipants: 7, maxParticipants: 8, creditsPerPlayer: 1 },
        ],
      },
      3,
    );
    for (const player of players.slice(0, 2)) await book(player);
    const evaluation = await evaluate(afterCutoff);
    expect(evaluation).toMatchObject({
      status: "settled",
      outcome: "run-under-minimum",
      headcount: 2,
    });
    expect((await occurrenceRow()).status).toBe("scheduled");
    for (const player of players.slice(0, 2)) {
      await expectWalletConsistent(player, 7);
    }
  });

  it("lets an operator decide before the cutoff", async () => {
    await configure({ minParticipants: 4, minimumPolicy: "cancel" }, 2);
    await book(players[0]!);
    const evaluation = await evaluate(now, { force: true });
    expect(evaluation.status).toBe("cancelled");
    await expectWalletConsistent(players[0]!, 10);
  });
});

describe("attendance-based settlement", () => {
  beforeEach(() =>
    configure({ creditTiers: academyTiers, settlementBasis: "attendance" }, 3),
  );

  it("waits for recorded attendance, then prices on who showed up", async () => {
    const orders = [];
    for (const player of players.slice(0, 3)) orders.push(await book(player));
    const pending = await evaluate(afterCutoff);
    expect(pending).toMatchObject({
      status: "awaiting-attendance",
      outcome: "minimum-met",
      headcount: 3,
    });
    await expectWalletConsistent(players[0]!, 7);
    const attended = [
      await fulfillmentIdFor(orders[0]!.orderId),
      await fulfillmentIdFor(orders[1]!.orderId),
    ];
    await expect(
      evaluate(afterCutoff, { attendedFulfillmentIds: attended }),
    ).rejects.toThrow("once the session starts");
    await expect(
      evaluate(afterStart, {
        attendedFulfillmentIds: [crypto.randomUUID()],
      }),
    ).rejects.toThrow("not part of this session");

    const settled = await evaluate(afterStart, {
      attendedFulfillmentIds: attended,
    });
    expect(settled).toMatchObject({ status: "settled", headcount: 2 });
    // Two attended, so every booking (including the no-show) pays the
    // two-player rate and gets one credit back.
    for (const player of players.slice(0, 3)) {
      await expectWalletConsistent(player, 8);
    }
    const attendance = await pg.query<{ attendance: string; status: string }>(
      `select details ->> 'attendance' as attendance, status
         from catalog_fulfillments order by created_at, id`,
    );
    expect(attendance.rows.map((row) => row.attendance).sort()).toEqual([
      "attended",
      "attended",
      "no-show",
    ]);

    // Attendance cannot be re-submitted to reprice a settled session.
    await evaluate(afterStart, { attendedFulfillmentIds: [attended[0]!] });
    expect((await occurrenceRow()).settled_headcount).toBe(2);
    for (const player of players.slice(0, 3)) {
      await expectWalletConsistent(player, 8);
    }
  });
});

describe("participation read models", () => {
  it("shows tiers and live headcount on the public storefront", async () => {
    await configure(
      {
        minParticipants: 1,
        creditTiers: academyTiers,
        cutoffMinutesBeforeStart: 120,
      },
      3,
    );
    for (const player of players.slice(0, 3)) await book(player);
    // The storefront reads the wall clock to decide what is upcoming.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    const storefront = await loadPublicOrganizationStorefront(
      "beach-test",
    ).finally(() => vi.useRealTimers());
    const training = storefront?.catalog.find((entry) => entry.id === item);
    expect(training?.upcomingOccurrences).toEqual([
      expect.objectContaining({
        key: occurrence,
        capacity: 8,
        bookedCount: 3,
        spotsRemaining: 5,
        participation: {
          capacity: 8,
          bookedCount: 3,
          spotsRemaining: 5,
          minParticipants: 1,
          minimumMet: true,
          playersNeeded: 0,
          decisionAt: "2026-12-10T15:00:00.000Z",
          status: "open",
          currentCreditsPerPlayer: 2,
          nextCreditsPerPlayer: 2,
          bookingCreditsPerPlayer: 3,
        },
      }),
    ]);
    expect(training?.participation).toMatchObject({
      minParticipants: 1,
      maxParticipants: 8,
      minimumPolicy: "run",
      cutoffMinutesBeforeStart: 120,
      settlementBasis: "cutoff",
      reservedCreditsPerPlayer: 3,
    });
    expect(
      training?.participation?.creditTiers.map((tier) => tier.description),
    ).toEqual([
      "1 player, 3 credits each",
      "2 to 6 players, 2 credits each",
      "7 or more players, 1 credit each",
    ]);
  });

  it("gives operators the roster, headcount, and settlement state", async () => {
    await configure({ creditTiers: academyTiers }, 3);
    for (const player of players.slice(0, 2)) await book(player);
    await evaluate(afterCutoff);
    const [session] = await loadOperatorCatalogSessionOccurrences({
      actor: actor(owner, org),
      catalogItemId: item,
      now: afterCutoff,
    });
    expect(session).toMatchObject({
      id: occurrence,
      capacity: 8,
      confirmedCount: 2,
      participation: {
        status: "confirmed",
        settledHeadcount: 2,
        currentCreditsPerPlayer: 2,
        minimumPolicy: "run",
      },
    });
    expect(session?.bookings).toHaveLength(2);
    expect(session?.bookings[0]).toMatchObject({
      reservedCredits: 3,
      settledCredits: 2,
      returnedCredits: 1,
      confirmed: true,
    });
  });
});
