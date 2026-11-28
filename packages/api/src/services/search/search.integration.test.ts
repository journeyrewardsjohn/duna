/**
 * Search against Postgres (in-memory, every migration applied): visibility,
 * one session by id, group state equal to `player.participation.quote`,
 * the database-backed per-address limit, the storefront waitlist flag and
 * a fixed number of queries per page (no query per result).
 */
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@duna/db", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getDatabase: () => state.db,
  getTransactionalDatabase: () => state.db,
  getReadOnlyDatabase: () => state.db,
}));
// The discovery map's own sources (events, coaches, the Pro Tour) are
// covered by the parity tests; here search reads sessions only.
vi.mock("../../discovery-service", () => ({
  loadDiscoverySources: async (now: Date) => ({
    map: { generatedAt: now.toISOString(), items: [] },
    events: [],
    venues: [],
  }),
}));

import {
  academy,
  applyAllMigrations,
  configureParticipation,
  createCatalogTestDatabase,
  seedAcademy,
  testActor,
} from "../../catalog-booking.test-support";
import { startCatalogCheckout } from "../../catalog-checkout";
import { loadPublicOrganizationStorefront } from "../../catalog-service";
import { occurrencePlaces } from "../participation/catalog";
import { participationQuote } from "../participation/player";
import {
  participationDisplay,
  readParticipationRuleV2,
  renderParticipationDisplay,
  resolveParticipationRuleV2,
} from "@duna/core";
import { resetSearchCacheForTests } from "./candidates";
import { loadEventParticipation } from "./event-participation";
import { loadSessionParticipation } from "./participation";
import {
  SEARCH_RATE_LIMITS,
  SearchRateLimitError,
  searchQuery,
  searchSession,
} from "./service";
import { SearchNotFoundError } from "./session";

const { pg, db } = createCatalogTestDatabase();
state.db = db;
const { org, owner, players, item, variant, occurrence, now } = academy;
let address = 0;
/** A fresh address per call keeps the per-address budget out of the way. */
const caller = (personId?: string) => ({
  ...(personId ? { personId } : {}),
  ipAddress: `192.0.2.${(address += 1) % 250}`,
  now,
});

function book(personId: string) {
  return startCatalogCheckout({
    actor: testActor(personId),
    catalogItemId: item,
    catalogVariantId: variant,
    paymentMethod: "credit",
    quantity: 1,
    catalogSessionOccurrenceId: occurrence,
    successUrl: "",
    cancelUrl: "",
    idempotencyKey: crypto.randomUUID(),
    requestId: crypto.randomUUID(),
    now,
  });
}

const ladder = [
  { minParticipants: 3, maxParticipants: 5, creditsPerPlayer: 3 },
  { minParticipants: 6, maxParticipants: 8, creditsPerPlayer: 2 },
];

beforeAll(() => applyAllMigrations(pg), 120_000);
afterAll(() => pg.close());
beforeEach(async () => {
  resetSearchCacheForTests();
  await seedAcademy(pg);
  await pg.exec("TRUNCATE rate_limit_buckets");
  await configureParticipation(
    pg,
    {
      minParticipants: 3,
      minimumPolicy: "cancel",
      lockMinutesBeforeStart: 1440,
      waitlist: true,
      tiers: ladder,
    },
    3,
  );
});

describe("search over bookable sessions", () => {
  it("lists the sessions with group state from the core display model", async () => {
    await book(players[0]!);
    const results = await searchQuery(
      { limit: 25 },
      { ...caller(), includeMembers: false },
    );
    expect(results.items.map((result) => result.entityId)).toEqual([
      academy.occurrence,
      academy.secondOccurrence,
      academy.thirdOccurrence,
    ]);
    const first = results.items[0]!;
    expect(first.kind).toBe("lesson");
    expect(first.path).toBe(
      `/clubs/beach-test/products/group-training?session=${occurrence}`,
    );
    const quote = await participationQuote({
      actor: testActor(players[5]!),
      catalogItemId: item,
      catalogSessionOccurrenceId: occurrence,
      quantity: 1,
      paymentMethod: "credit",
      now,
    });
    expect(first.availability).toEqual({
      state: "open",
      summary: quote.copy.status,
    });
  });

  it("counts places exactly as the participation engine does", async () => {
    await book(players[0]!);
    await book(players[1]!);
    const [row] = await pg
      .query<{ id: string }>(
        "select id from catalog_session_occurrences where id = $1",
        [occurrence],
      )
      .then((result) => result.rows);
    expect(row).toBeDefined();
    const session = await searchSession({ id: occurrence }, caller());
    const places = await occurrencePlaces(occurrence, now);
    expect(session.participation.display.numbers.booked).toBe(places.confirmed);
    expect(session.participation.display.numbers.held).toBe(places.held);
  });

  it("reads one session: venue-local time, ISO time, price ladder, waitlist", async () => {
    const session = await searchSession({ id: occurrence }, caller());
    expect(session).toMatchObject({
      id: occurrence,
      catalogItemId: item,
      catalogVariantId: variant,
      title: "Group training",
      club: { id: org, slug: "beach-test" },
      startsAt: "2026-12-10T17:00:00.000Z",
      timezone: "UTC",
      local: { date: "2026-12-10", startTime: "17:00", endTime: "18:00" },
      capacity: 8,
      status: "scheduled",
      waitlist: { available: true, waiting: 0 },
    });
    expect(session.participation.display.price?.ladder).toHaveLength(2);
    expect(session.prices).toEqual([
      expect.objectContaining({ kind: "credit", credits: 3 }),
    ]);
  });

  it("gives the same display as player.participation.quote for a person not booked", async () => {
    await book(players[0]!);
    const quote = await participationQuote({
      actor: testActor(players[4]!),
      catalogItemId: item,
      catalogSessionOccurrenceId: occurrence,
      quantity: 1,
      paymentMethod: "credit",
      now,
    });
    const session = await searchSession({ id: occurrence }, caller());
    expect(session.participation.display).toEqual(quote.display);
    expect(session.participation.copy).toEqual(quote.copy);
  });
});

describe("visibility: not found, never forbidden", () => {
  const setItem = (column: string, value: string) =>
    pg.query(`update catalog_items set ${column} = $1 where id = $2`, [
      value,
      item,
    ]);

  it("hides draft and archived offerings and system workspaces", async () => {
    for (const status of ["draft", "archived"]) {
      await setItem("status", status);
      resetSearchCacheForTests();
      await expect(
        searchSession({ id: occurrence }, caller(owner)),
      ).rejects.toBeInstanceOf(SearchNotFoundError);
      const results = await searchQuery(
        { limit: 25 },
        { ...caller(), includeMembers: false },
      );
      expect(results.items).toHaveLength(0);
    }
    await setItem("status", "active");
    await pg.query(
      `update organizations set system_key = 'duna' where id = $1`,
      [org],
    );
    resetSearchCacheForTests();
    await expect(
      searchSession({ id: occurrence }, caller(owner)),
    ).rejects.toBeInstanceOf(SearchNotFoundError);
    expect(
      (await searchQuery({ limit: 25 }, { ...caller(), includeMembers: false }))
        .items,
    ).toHaveLength(0);
  });

  it("shows members-only sessions to members only", async () => {
    await setItem("visibility", "members");
    const outsider = "39000000-0000-4000-8000-000000000001";
    await pg.query(
      `insert into people (id, display_name, handle) values ($1, 'Outsider', 'outsider')`,
      [outsider],
    );
    expect(
      (await searchQuery({ limit: 25 }, { ...caller(), includeMembers: false }))
        .items,
    ).toHaveLength(0);
    await expect(
      searchSession({ id: occurrence }, caller()),
    ).rejects.toBeInstanceOf(SearchNotFoundError);
    await expect(
      searchSession({ id: occurrence }, caller(outsider)),
    ).rejects.toBeInstanceOf(SearchNotFoundError);
    await expect(
      searchSession({ id: occurrence }, caller(players[0]!)),
    ).resolves.toMatchObject({ id: occurrence, membershipRequired: true });
    const member = await searchQuery(
      { limit: 25 },
      { ...caller(players[0]!), includeMembers: true },
    );
    expect(member.items).toHaveLength(3);
    const stranger = await searchQuery(
      { limit: 25 },
      { ...caller(outsider), includeMembers: true },
    );
    expect(stranger.items).toHaveLength(0);
  });

  it("shows private (invite-only) sessions to the club and to people holding a place", async () => {
    await book(players[0]!);
    await setItem("visibility", "private");
    resetSearchCacheForTests();
    expect(
      (
        await searchQuery(
          { limit: 25 },
          { ...caller(players[1]!), includeMembers: true },
        )
      ).items,
    ).toHaveLength(0);
    await expect(
      searchSession({ id: occurrence }, caller(players[1]!)),
    ).rejects.toBeInstanceOf(SearchNotFoundError);
    await expect(
      searchSession({ id: occurrence }, caller(players[0]!)),
    ).resolves.toMatchObject({ id: occurrence });
    await expect(
      searchSession({ id: occurrence }, caller(owner)),
    ).resolves.toMatchObject({ id: occurrence });
  });

  it("never puts a booked player's name in a public result", async () => {
    await book(players[0]!);
    const results = await searchQuery(
      { limit: 25 },
      { ...caller(), includeMembers: false },
    );
    const session = await searchSession({ id: occurrence }, caller());
    const text = JSON.stringify({ results, session });
    expect(text).not.toContain("Player 1");
    expect(text).not.toContain(players[0]!);
  });
});

describe("limits and query counts", () => {
  it("limits each address in the database and says when to retry", async () => {
    const ipAddress = "198.51.100.9";
    for (
      let index = 0;
      index < SEARCH_RATE_LIMITS.session.capacity;
      index += 1
    ) {
      await searchSession({ id: occurrence }, { ipAddress, now });
    }
    const error = await searchSession(
      { id: occurrence },
      { ipAddress, now },
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SearchRateLimitError);
    expect((error as SearchRateLimitError).retryAfterSeconds).toBeGreaterThan(
      0,
    );
    const buckets = await pg.query<{ key: string }>(
      "select key from rate_limit_buckets where key like 'search.session:%'",
    );
    expect(buckets.rows).toHaveLength(1);
    // The bucket keeps a one-way hash, never the address.
    expect(buckets.rows[0]!.key).not.toContain(ipAddress);
  });

  it("reads a page in the same number of queries whatever its size", async () => {
    const counted = async (limit: number) => {
      resetSearchCacheForTests();
      const spy = vi.spyOn(pg, "query");
      try {
        await searchQuery({ limit }, { ...caller(), includeMembers: false });
        return spy.mock.calls.length;
      } finally {
        spy.mockRestore();
      }
    };
    const one = await counted(1);
    const three = await counted(3);
    expect(three).toBe(one);
    // Limiter (1) + sessions, venues, prices (3) + group state (5).
    expect(three).toBeLessThanOrEqual(9);
    // A second page within the minute reuses the public candidates.
    const spy = vi.spyOn(pg, "query");
    await searchQuery({ limit: 3 }, { ...caller(), includeMembers: false });
    expect(spy.mock.calls.length).toBe(1 + 5);
    spy.mockRestore();
  });

  it("batches group state for many sessions in five queries", async () => {
    const rows = await pg.query<{ id: string }>(
      "select id from catalog_session_occurrences",
    );
    const subjectRows = await db.query.catalogSessionOccurrences.findMany();
    const itemRow = await db.query.catalogItems.findFirst();
    const spy = vi.spyOn(pg, "query");
    const groups = await loadSessionParticipation({
      database: db as never,
      subjects: subjectRows.map((occurrenceRow) => ({
        occurrence: occurrenceRow,
        item: itemRow!,
        clubName: "Beach Test Academy",
      })),
      now,
    });
    expect(spy.mock.calls.length).toBe(5);
    spy.mockRestore();
    expect(groups.size).toBe(rows.rows.length);
  });
});

describe("storefront summary", () => {
  it("says whether the offering keeps a waitlist", async () => {
    const storefront = await loadPublicOrganizationStorefront("beach-test");
    const offering = storefront?.catalog.find((entry) => entry.id === item);
    expect(offering?.participation?.waitlist).toBe(true);
    await configureParticipation(
      pg,
      { minParticipants: 3, minimumPolicy: "cancel", waitlist: false },
      3,
    );
    const again = await loadPublicOrganizationStorefront("beach-test");
    expect(
      again?.catalog.find((entry) => entry.id === item)?.participation
        ?.waitlist,
    ).toBe(false);
  });
});

describe("group state on discovery-map events", () => {
  const pickup = "60000000-0000-4000-8000-000000000001";
  const plain = "60000000-0000-4000-8000-000000000002";

  it("adds the core display state to ruled pickups only, in a fixed number of queries", async () => {
    await pg.exec(`
      INSERT INTO pickup_sessions (id, host_person_id, venue_label, title, starts_at, ends_at, capacity, participation)
        VALUES ('${pickup}', '${players[0]}', 'Beach', 'Saturday pickup',
          '2026-12-12T16:00:00Z', '2026-12-12T18:00:00Z', 6,
          '{"minParticipants": 4, "minimumPolicy": "cancel", "lockMinutesBeforeStart": 720}'::jsonb),
               ('${plain}', '${players[0]}', 'Beach', 'Sunday pickup',
          '2026-12-13T16:00:00Z', '2026-12-13T18:00:00Z', 6, NULL);
      INSERT INTO pickup_participants (pickup_session_id, person_id, status)
        VALUES ('${pickup}', '${players[0]}', 'confirmed'),
               ('${pickup}', '${players[1]}', 'confirmed'),
               ('${pickup}', '${players[2]}', 'confirmed');
    `);
    const events = [pickup, plain].map((id) => ({
      id,
      kind: "pickup" as const,
      title: id === pickup ? "Saturday pickup" : "Sunday pickup",
      organizationName: "Beach Test Academy",
      timezone: "UTC",
    }));
    const spy = vi.spyOn(pg, "query");
    const states = await loadEventParticipation({
      events,
      now,
      database: db as never,
    });
    expect(spy.mock.calls.length).toBeLessThanOrEqual(5);
    spy.mockRestore();
    expect(states.has(plain)).toBe(false);
    const expected = renderParticipationDisplay(
      participationDisplay({
        rule: resolveParticipationRuleV2(
          readParticipationRuleV2({
            minParticipants: 4,
            minimumPolicy: "cancel",
            lockMinutesBeforeStart: 720,
          })!,
          { capacity: 6, defaultLockMinutes: 720 },
        ),
        title: "Saturday pickup",
        capacity: 6,
        booked: 3,
        held: 0,
        waiting: 0,
        lockAt: new Date("2026-12-12T04:00:00Z"),
        startsAt: new Date("2026-12-12T16:00:00Z"),
        endsAt: new Date("2026-12-12T18:00:00Z"),
        now,
        timeZone: "UTC",
        clubName: "Beach Test Academy",
        payment: { method: "credit" },
        viewer: { booked: false, quantity: 1 },
      }),
    );
    expect(states.get(pickup)).toEqual({
      displayState: "needs-players",
      copy: {
        status: expected.status,
        ...(expected.line ? { line: expected.line } : {}),
      },
    });
  });
});
