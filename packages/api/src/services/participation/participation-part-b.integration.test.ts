/**
 * PART-B against every real migration in in-memory Postgres: the cancel
 * preview is the cancellation (same plan), resolving a coach's request,
 * operator share links, the staff occurrence list (detail, juniors, a fixed
 * number of queries) and the operator fee quote. Permissions: coach vs
 * director vs owner; another club's ids answer "not found".
 */
import { quoteCheckoutFees } from "@duna/pricing";
import * as schema from "@duna/db/schema";
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

const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@duna/db", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getDatabase: () => state.db,
  getTransactionalDatabase: () => state.db,
}));

import {
  academy,
  applyAllMigrations,
  configureParticipation,
  createCatalogTestDatabase,
  seedAcademy,
  testActor,
  walletState,
} from "../../catalog-booking.test-support";
import { loadOperatorCatalogSessionOccurrences } from "../../catalog-participation";
import { startCatalogCheckout } from "../../catalog-checkout";
import type { ApiActor } from "../../context";
import { createApiContext } from "../../context";
import { createCaller } from "../../router";
import { resolveParticipationInvite } from "./invites";

const { pg, db } = createCatalogTestDatabase();
state.db = db;
const { org, coach, owner, players, item, variant, occurrence, now } = academy;
const SUBJECT = "catalog-session-occurrence" as const;
const guardian = players[0]!;
const child = "31000000-0000-4000-8000-000000000001";
const otherOrg = "11000000-0000-4000-8000-000000000001";
const otherItem = "41000000-0000-4000-8000-000000000001";
const otherOccurrence = "51000000-0000-4000-8000-000000000001";
const venue = "61000000-0000-4000-8000-000000000001";
const court = "62000000-0000-4000-8000-000000000001";

const staff = (personId: string, scopes: string[]): ApiActor => ({
  ...testActor(personId, org),
  roles: ["coach"],
  scopes,
});
const coachActor = staff(coach, ["sessions:read"]);
const directorActor = staff(players[6]!, [
  "sessions:read",
  "sessions:write",
  "payments:read",
]);
const ownerActor = { ...staff(owner, ["*"]), roles: ["owner" as const] };
const api = (actor: ApiActor) => createCaller(createApiContext({ actor, now }));
const key = () => crypto.randomUUID();

function book(
  personId: string,
  extra: Partial<Parameters<typeof startCatalogCheckout>[0]> = {},
) {
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
    ...extra,
  });
}

async function count(
  table: string,
  where = "true",
  parameters: unknown[] = [],
) {
  const result = await pg.query<{ count: number }>(
    `select count(*)::int as count from ${table} where ${where}`,
    parameters,
  );
  return result.rows[0]!.count;
}

async function writeCounts() {
  return Promise.all(
    [
      "audit_log",
      "participation_notices",
      "participation_decisions",
      "refund_records",
      "participation_invites",
      "participation_cancel_requests",
    ].map((table) => count(table)),
  );
}

async function credits(personId: string) {
  return (await walletState(pg, personId))?.cached ?? 0;
}

beforeAll(() => applyAllMigrations(pg), 120_000);
afterAll(() => pg.close());
beforeEach(async () => {
  await seedAcademy(pg);
  await pg.exec(`
    INSERT INTO people (id, display_name, handle, is_minor)
      VALUES ('${child}', 'Mia Junior', 'mia-junior', true);
    INSERT INTO guardianships (guardian_id, minor_id, relationship, verified, review_status, can_approve_spending)
      VALUES ('${guardian}', '${child}', 'parent', true, 'verified', true);
    INSERT INTO organizations (id, slug, name, currency, timezone)
      VALUES ('${otherOrg}', 'other-club', 'Other Club', 'USD', 'UTC');
    INSERT INTO catalog_items (id, organization_id, type, subtype, slug, title, status, allow_card, allow_credits, configuration)
      SELECT '${otherItem}', '${otherOrg}', type, subtype, slug, title, status, allow_card, allow_credits, configuration
        FROM catalog_items WHERE id = '${item}';
    INSERT INTO catalog_session_occurrences (id, organization_id, catalog_item_id, starts_at, ends_at, timezone, local_date, local_time, coach_person_ids, capacity, created_at)
      SELECT '${otherOccurrence}', '${otherOrg}', '${otherItem}', starts_at, ends_at, timezone, local_date, local_time, coach_person_ids, capacity, created_at
        FROM catalog_session_occurrences WHERE id = '${occurrence}';
  `);
  await configureParticipation(
    pg,
    { minParticipants: 4, minimumPolicy: "cancel", waitlist: true },
    2,
  );
});

describe("cancel preview is the cancellation", () => {
  it("previews exactly what cancelSession then returns, and writes nothing", async () => {
    await book(players[1]!);
    await book(players[2]!, { quantity: 2 });
    await book(guardian, { participantPersonId: child });
    const before = {
      p1: await credits(players[1]!),
      p2: await credits(players[2]!),
      guardian: await credits(guardian),
    };
    const writesBefore = await writeCounts();
    const preview = await api(ownerActor).operator.participation.cancelPreview({
      subjectType: SUBJECT,
      subjectId: occurrence,
    });
    // Read-only: no decision, audit, notice, refund, invite or request row.
    expect(await writeCounts()).toEqual(writesBefore);

    expect(preview.totals).toMatchObject({
      bookings: 3,
      places: 4,
      creditsBack: 8,
      cardRefunds: 0,
      released: 0,
      reviewRequired: 0,
    });
    const junior = preview.bookings.find((booking) => booking.isMinor)!;
    expect(junior).toMatchObject({ displayName: "Mia", method: "credits" });
    expect(
      preview.notices.find((notice) => notice.bookingId === junior.bookingId),
    ).toMatchObject({
      audience: "Player 1",
      audienceRole: "guardian",
      channel: "notice",
    });

    const result = await api(ownerActor).operator.participation.cancelSession({
      subjectType: SUBJECT,
      subjectId: occurrence,
      reason: "coach",
      confirmed: true,
      idempotencyKey: key(),
    });
    // The statuses the cancellation reports are the ones the preview said.
    expect(
      Object.fromEntries(
        result.cancellations.map((entry) => [
          entry.bookingId,
          entry.refundStatus,
        ]),
      ),
    ).toEqual(
      Object.fromEntries(
        preview.bookings.map((booking) => [booking.bookingId, booking.outcome]),
      ),
    );
    // And the credits that came back are the ones the preview promised.
    const back = {
      p1: (await credits(players[1]!)) - before.p1,
      p2: (await credits(players[2]!)) - before.p2,
      guardian: (await credits(guardian)) - before.guardian,
    };
    expect(back).toEqual({ p1: 2, p2: 4, guardian: 2 });
    expect(
      preview.bookings.reduce(
        (total, row) => total + (row.creditsBack ?? 0),
        0,
      ),
    ).toBe(back.p1 + back.p2 + back.guardian);
  });

  it("shows names and methods without amounts to a coach", async () => {
    await book(players[1]!);
    const preview = await api(coachActor).operator.participation.cancelPreview({
      subjectType: SUBJECT,
      subjectId: occurrence,
    });
    expect(preview.bookings[0]).toEqual({
      bookingId: expect.any(String),
      displayName: "Player 2",
      isMinor: false,
      quantity: 1,
      method: "credits",
      outcome: "credits-restored",
    });
    expect(preview.totals.creditsBack).toBeUndefined();
  });

  it("answers not found for another club's session", async () => {
    await expect(
      api(ownerActor).operator.participation.cancelPreview({
        subjectType: SUBJECT,
        subjectId: otherOccurrence,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("resolving a coach's request to cancel", () => {
  async function requestCancel() {
    return (
      await api(coachActor).operator.participation.requestCancel({
        subjectType: SUBJECT,
        subjectId: occurrence,
        reason: "coach",
        idempotencyKey: key(),
      })
    ).requestId;
  }

  it("approves with the director's cancellation, once, audited", async () => {
    await book(players[1]!);
    const requestId = await requestCancel();
    const idempotencyKey = key();
    const approve = () =>
      api(ownerActor).operator.participation.resolveCancelRequest({
        requestId,
        decision: "approve",
        note: "Coach is ill",
        confirmed: true,
        idempotencyKey,
      });
    const first = await approve();
    expect(first).toMatchObject({
      status: "approved",
      coachNotified: false,
      cancellations: [{ refundStatus: "credits-restored" }],
    });
    // A retry replays the first answer.
    expect(await approve()).toEqual(first);
    // A second approval with a new key is re-entrant: nothing left to refund.
    const again = await api(
      ownerActor,
    ).operator.participation.resolveCancelRequest({
      requestId,
      decision: "approve",
      confirmed: true,
      idempotencyKey: key(),
    });
    expect(again).toMatchObject({ status: "approved", cancellations: [] });
    expect(
      await count("audit_log", "action = $1", [
        "participation.cancel_request_approved",
      ]),
    ).toBe(1);
    expect(
      await count("audit_log", "action = $1", [
        "participation.session_cancelled_by_club",
      ]),
    ).toBe(1);
    // Duna's own notice to the booker, as cancelSession queues it.
    expect(
      await count("participation_notices", "kind = 'cancelled-club'"),
    ).toBe(1);
    const row = await pg.query<{
      status: string;
      resolved_by_person_id: string;
    }>(
      `select status, resolved_by_person_id from participation_cancel_requests where id = $1`,
      [requestId],
    );
    expect(row.rows[0]).toEqual({
      status: "approved",
      resolved_by_person_id: owner,
    });
    await expect(
      api(ownerActor).operator.participation.resolveCancelRequest({
        requestId,
        decision: "decline",
        confirmed: true,
        idempotencyKey: key(),
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("declines without touching the session; approving needs the money permission", async () => {
    await book(players[1]!);
    const requestId = await requestCancel();
    await expect(
      api(directorActor).operator.participation.resolveCancelRequest({
        requestId,
        decision: "approve",
        confirmed: true,
        idempotencyKey: key(),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      api(coachActor).operator.participation.resolveCancelRequest({
        requestId,
        decision: "decline",
        confirmed: true,
        idempotencyKey: key(),
      }),
    ).rejects.toThrow("sessions:write");
    const declined = await api(
      directorActor,
    ).operator.participation.resolveCancelRequest({
      requestId,
      decision: "decline",
      confirmed: true,
      idempotencyKey: key(),
    });
    expect(declined).toEqual({
      requestId,
      status: "declined",
      cancellations: [],
      coachNotified: false,
    });
    expect(
      await count(
        "catalog_session_occurrences",
        "id = $1 and status = 'scheduled'",
        [occurrence],
      ),
    ).toBe(1);
    expect(
      await count("audit_log", "action = $1", [
        "participation.cancel_request_declined",
      ]),
    ).toBe(1);
  });

  it("answers not found for another club's request", async () => {
    const result = await pg.query<{ id: string }>(
      `insert into participation_cancel_requests (organization_id, subject_type, subject_id, requested_by_person_id, reason)
       values ($1, $2, $3, $4, 'coach') returning id`,
      [otherOrg, SUBJECT, otherOccurrence, coach],
    );
    await expect(
      api(ownerActor).operator.participation.resolveCancelRequest({
        requestId: result.rows[0]!.id,
        decision: "decline",
        confirmed: true,
        idempotencyKey: key(),
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("operator share links", () => {
  it("makes one expiring link per person and session, audited, resolvable", async () => {
    const link = await api(coachActor).operator.participation.shareLink({
      subjectType: SUBJECT,
      subjectId: occurrence,
    });
    expect(link.url).toBe(`/i/${link.code}`);
    expect(link.expiresAt).toBe(academy.startsAt.toISOString());
    const again = await api(coachActor).operator.participation.shareLink({
      subjectType: SUBJECT,
      subjectId: occurrence,
    });
    expect(again.code).toBe(link.code);
    expect(await count("participation_invites")).toBe(1);
    expect(
      await count("audit_log", "action = 'participation.share_link_created'"),
    ).toBe(2);
    const landing = await resolveParticipationInvite({ code: link.code, now });
    expect(landing.title).toBe("Group training");
  });

  it("answers not found for another club's session", async () => {
    await expect(
      api(coachActor).operator.participation.shareLink({
        subjectType: SUBJECT,
        subjectId: otherOccurrence,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("the staff occurrence list", () => {
  beforeEach(async () => {
    await pg.exec(`
      INSERT INTO venues (id, organization_id, slug, name, timezone)
        VALUES ('${venue}', '${org}', 'pier', 'Pier Courts', 'America/Los_Angeles');
      INSERT INTO courts (id, venue_id, name, qr_token) VALUES ('${court}', '${venue}', 'Court 3', 'court-3-token');
    `);
    await pg.query(
      `update catalog_items set configuration = configuration || $1::jsonb where id = $2`,
      [JSON.stringify({ venueId: venue, courtId: court }), item],
    );
  });

  async function countedList(actor: ApiActor) {
    let queries = 0;
    const counted = drizzle(pg, {
      schema,
      logger: { logQuery: () => (queries += 1) },
    });
    state.db = counted;
    try {
      const rows = await loadOperatorCatalogSessionOccurrences({
        actor,
        now,
      });
      return { rows, queries };
    } finally {
      state.db = db;
    }
  }

  it("names the coach, court and venue, and marks juniors with their guardian", async () => {
    await book(players[1]!);
    await book(guardian, { participantPersonId: child });
    const { rows } = await countedList(coachActor);
    const session = rows.find((row) => row.id === occurrence)!;
    expect(session).toMatchObject({
      coach: { id: coach, displayName: "Coach" },
      court: { id: court, name: "Court 3" },
      venue: {
        id: venue,
        name: "Pier Courts",
        timeZone: "America/Los_Angeles",
      },
    });
    const junior = session.bookings.find(
      (booking) => booking.personId === child,
    )!;
    expect(junior).toMatchObject({
      isMinor: true,
      guardianDisplayName: "Player 1",
    });
    expect(JSON.stringify(junior)).not.toMatch(/birth|age/i);
    expect(
      session.bookings.find((booking) => booking.personId === players[1])
        ?.isMinor,
    ).toBe(false);
    // Another club's session never appears.
    expect(rows.some((row) => row.id === otherOccurrence)).toBe(false);
    // Money only with payments:read.
    expect(session.participation?.atStakeCredits).toBeUndefined();
  });

  it("reads a fixed number of queries whatever the number of sessions", async () => {
    await book(players[1]!);
    const one = await countedList(directorActor);
    // Book into every session: three times the sessions with bookings.
    for (const id of [academy.secondOccurrence, academy.thirdOccurrence]) {
      await book(players[2]!, { catalogSessionOccurrenceId: id });
      await book(guardian, {
        catalogSessionOccurrenceId: id,
        participantPersonId: child,
      });
    }
    const three = await countedList(directorActor);
    expect(three.rows.filter((row) => row.bookings.length > 0)).toHaveLength(3);
    expect(three.queries).toBeLessThanOrEqual(one.queries + 1);
    expect(three.queries).toBeLessThanOrEqual(12);
  });

  it("reads one session by id", async () => {
    const rows = await api(coachActor).operator.catalogSessionOccurrences({
      occurrenceId: academy.secondOccurrence,
    });
    expect(rows.map((row) => row.id)).toEqual([academy.secondOccurrence]);
  });
});

describe("operator fee quote", () => {
  beforeEach(async () => {
    await pg.query(`update catalog_items set allow_card = true where id = $1`, [
      item,
    ]);
    await pg.query(
      `insert into catalog_prices (organization_id, catalog_item_id, catalog_variant_id, payment_kind, amount_minor, currency)
       values ($1, $2, $3, 'card', 3000, 'USD')`,
      [org, item, variant],
    );
  });

  it("prices an offering by card with checkout's own composition", async () => {
    const quote = await api(directorActor).operator.fees.quote({
      offeringId: item,
      currency: "USD",
      method: "card",
    });
    if (quote.status !== "ok" || quote.unit !== "money") {
      throw new Error("expected a money quote");
    }
    const expected = quoteCheckoutFees({
      currency: "USD",
      isDunaPlus: false,
      tender: "online-card",
      items: [
        {
          id: variant,
          kind: "booking",
          description: "Group training",
          quantity: 1,
          unitAmountMinor: 3000,
        },
      ],
      commission: {
        rateBps: quote.organizationFeeBps,
        organizationId: org,
        plan: quote.planKey,
        source: "plan-default",
      },
    });
    expect(quote.price.amountMinor).toBe(3000);
    expect(quote.playerPays.amountMinor).toBe(expected.priced.totalMinor);
    expect(quote.dunaFees.amountMinor).toBe(expected.applicationFeeMinor);
    expect(quote.clubReceives.amountMinor).toBe(
      expected.priced.totalMinor - expected.applicationFeeMinor,
    );
    const paidByPlayer = quote.lines
      .filter((line) => line.payer === "player")
      .reduce((total, line) => total + line.amount.amountMinor, 0);
    expect(paidByPlayer).toBe(quote.playerPays.amountMinor);
  });

  it("credits and cash carry no fees; unknowns are unavailable, never invented", async () => {
    const api2 = api(directorActor).operator.fees;
    expect(
      await api2.quote({
        offeringId: item,
        currency: "USD",
        method: "credits",
      }),
    ).toMatchObject({
      status: "ok",
      playerPaysCredits: 2,
      clubReceivesCredits: 2,
    });
    const cash = await api2.quote({
      priceMinor: 2500,
      currency: "USD",
      method: "cash",
    });
    expect(cash).toMatchObject({
      status: "ok",
      playerPays: { amountMinor: 2500 },
      clubReceives: { amountMinor: 2500 },
      dunaFees: { amountMinor: 0 },
    });
    expect(
      await api2.quote({ priceMinor: 2500, currency: "EUR", method: "card" }),
    ).toMatchObject({ status: "unavailable", reason: "currency-mismatch" });
    expect(
      await api2.quote({ priceMinor: 2500, currency: "XYZ", method: "card" }),
    ).toMatchObject({
      status: "unavailable",
      reason: "currency-not-supported",
    });
    expect(
      await api2.quote({
        priceMinor: 2500,
        currency: "USD",
        method: "credits",
      }),
    ).toMatchObject({ status: "unavailable", reason: "price-needed" });
    await expect(
      api2.quote({ offeringId: otherItem, currency: "USD", method: "card" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      api(coachActor).operator.fees.quote({
        priceMinor: 2500,
        currency: "USD",
        method: "card",
      }),
    ).rejects.toThrow("payments:read");
  });
});
