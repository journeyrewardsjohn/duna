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
  testActor as actor,
  walletState,
} from "./catalog-booking.test-support";
import { startCatalogCheckout } from "./catalog-checkout";
import { evaluateCatalogSessionParticipation } from "./catalog-participation";
import {
  bookCatalogSessions,
  cancelCatalogSessionBooking,
  loadPlayerCatalogSessionBookings,
} from "./catalog-session-bookings";
import { issueOrganizationCredits } from "./catalog-service";

const { pg, db } = createCatalogTestDatabase();
state.db = db;
const { org, owner, players, item, variant, now } = academy;
const sessions = [
  academy.occurrence,
  academy.secondOccurrence,
  academy.thirdOccurrence,
] as const;

const guardian = players[0]!;
const otherAdult = players[1]!;
const child = "31000000-0000-4000-8000-000000000001";
const pendingChild = "31000000-0000-4000-8000-000000000002";
const stranger = players[7]!;

const tiers = [
  { minParticipants: 1, maxParticipants: 1, creditsPerPlayer: 3 },
  { minParticipants: 2, maxParticipants: 6, creditsPerPlayer: 2 },
  { minParticipants: 7, maxParticipants: 8, creditsPerPlayer: 1 },
];

async function expectWallet(personId: string, expected: number) {
  expect(await walletState(pg, personId)).toEqual({
    cached: expected,
    granted: expected,
    ledger: expected,
  });
}

async function count(sql: string, parameters: unknown[] = []) {
  const result = await pg.query<{ count: number }>(
    `select count(*)::int as count from ${sql}`,
    parameters,
  );
  return result.rows[0]!.count;
}

function checkout(
  booker: string,
  extra: Partial<Parameters<typeof startCatalogCheckout>[0]> = {},
) {
  return startCatalogCheckout({
    actor: actor(booker),
    catalogItemId: item,
    catalogVariantId: variant,
    paymentMethod: "credit",
    quantity: 1,
    catalogSessionOccurrenceId: sessions[0],
    successUrl: "",
    cancelUrl: "",
    idempotencyKey: crypto.randomUUID(),
    requestId: crypto.randomUUID(),
    now,
    ...extra,
  });
}

function bookMany(
  booker: string,
  bookings: Parameters<typeof bookCatalogSessions>[0]["bookings"],
  extra: Partial<Parameters<typeof bookCatalogSessions>[0]> = {},
) {
  return bookCatalogSessions({
    actor: actor(booker),
    bookings,
    idempotencyKey: crypto.randomUUID(),
    requestId: crypto.randomUUID(),
    now,
    ...extra,
  });
}

const session = (
  index: number,
  extra: { participantPersonId?: string; quantity?: number } = {},
) => ({
  catalogItemId: item,
  catalogVariantId: variant,
  catalogSessionOccurrenceId: sessions[index]!,
  ...extra,
});

function list(
  viewer: string,
  extra: Partial<Parameters<typeof loadPlayerCatalogSessionBookings>[0]> = {},
) {
  return loadPlayerCatalogSessionBookings({
    actor: actor(viewer),
    now,
    ...extra,
  });
}

function cancel(
  canceller: string,
  bookingId: string,
  extra: Partial<Parameters<typeof cancelCatalogSessionBooking>[0]> = {},
) {
  return cancelCatalogSessionBooking({
    actor: actor(canceller),
    bookingId,
    requestId: crypto.randomUUID(),
    now,
    ...extra,
  });
}

async function bookingIdFor(orderId: string) {
  const result = await pg.query<{ id: string }>(
    `select id from catalog_fulfillments where order_id = $1`,
    [orderId],
  );
  return result.rows[0]!.id;
}

beforeAll(() => applyAllMigrations(pg), 120_000);
afterAll(() => pg.close());
beforeEach(async () => {
  await seedAcademy(pg);
  await pg.exec(`
    INSERT INTO people (id, display_name, handle, is_minor)
      VALUES ('${child}', 'Mia Junior', 'mia-junior', true),
             ('${pendingChild}', 'Leo Junior', 'leo-junior', true);
    INSERT INTO guardianships (guardian_id, minor_id, relationship, verified, review_status, can_approve_spending)
      VALUES ('${guardian}', '${child}', 'parent', true, 'verified', true),
             ('${guardian}', '${pendingChild}', 'parent', false, 'pending', true);
  `);
});

describe("booking a session for a dependent", () => {
  it("books for a verified dependent from the guardian's credits", async () => {
    const result = await checkout(guardian, { participantPersonId: child });
    expect(result).toMatchObject({ orderStatus: "paid", creditsApplied: 2 });
    await expectWallet(guardian, 8);
    const booking = await pg.query<{
      person_id: string;
      buyer_person_id: string;
      booked_by: string;
      credit_source: string;
    }>(
      `select f.person_id, o.buyer_person_id,
              f.details ->> 'bookedByPersonId' as booked_by,
              f.details ->> 'creditSource' as credit_source
         from catalog_fulfillments f join orders o on o.id = f.order_id
        where o.id = $1`,
      [result.orderId],
    );
    expect(booking.rows[0]).toEqual({
      person_id: child,
      buyer_person_id: guardian,
      booked_by: guardian,
      credit_source: "self",
    });
    // The dependent becomes a participant of the organization.
    expect(
      await count(
        `organization_participants where person_id = $1 and organization_id = $2`,
        [child, org],
      ),
    ).toBe(1);
  });

  it("can pay from the dependent's own funded wallet", async () => {
    await pg.exec(
      `INSERT INTO organization_participants (organization_id, person_id, relationship, status) VALUES ('${org}', '${child}', 'player', 'active')`,
    );
    await issueOrganizationCredits({
      actor: actor(owner, org),
      personId: child,
      credits: 5,
      reason: "Funded by family",
      requestId: "child-grant",
      now,
    });
    const result = await checkout(guardian, {
      participantPersonId: child,
      creditSource: "participant",
    });
    expect(result.creditsApplied).toBe(2);
    await expectWallet(child, 3);
    await expectWallet(guardian, 10);
  });

  it.each([
    [
      "a dependent whose guardianship is not verified",
      guardian,
      pendingChild,
      "adult" as const,
      "Guardian review must be complete",
    ],
    [
      "someone outside the household",
      guardian,
      otherAdult,
      "adult" as const,
      "not connected to your household",
    ],
    [
      "another family's dependent",
      otherAdult,
      child,
      "adult" as const,
      "not connected to your household",
    ],
    [
      "a caller who is not an adult",
      guardian,
      child,
      "teen" as const,
      "Only an adult parent or guardian",
    ],
  ])(
    "refuses %s and writes nothing",
    async (_name, booker, participant, ageBand, message) => {
      await expect(
        startCatalogCheckout({
          actor: actor(booker, undefined, ageBand),
          catalogItemId: item,
          catalogVariantId: variant,
          paymentMethod: "credit",
          quantity: 1,
          catalogSessionOccurrenceId: sessions[0],
          participantPersonId: participant,
          successUrl: "",
          cancelUrl: "",
          idempotencyKey: crypto.randomUUID(),
          requestId: crypto.randomUUID(),
          now,
        }),
      ).rejects.toThrow(message);
      expect(await count("orders")).toBe(0);
      await expectWallet(booker, 10);
    },
  );

  it("keeps dependent bookings on credits", async () => {
    await expect(
      checkout(guardian, { participantPersonId: child, paymentMethod: "card" }),
    ).rejects.toThrow("paid with organization credits");
    await expect(
      checkout(guardian, { creditSource: "participant" }),
    ).rejects.toThrow("Choose the family member");
    expect(await count("orders")).toBe(0);
  });

  it("settles a family's group-size pricing back to the wallet that paid", async () => {
    await configureParticipation(pg, { creditTiers: tiers }, 3);
    await checkout(guardian);
    await checkout(guardian, { participantPersonId: child });
    await expectWallet(guardian, 4);
    const evaluation = await evaluateCatalogSessionParticipation({
      occurrenceId: sessions[0],
      requestId: crypto.randomUUID(),
      now: new Date("2026-12-09T18:00:00.000Z"),
    });
    expect(evaluation.headcount).toBe(2);
    expect(evaluation.settlements.map((entry) => entry.payerPersonId)).toEqual([
      guardian,
      guardian,
    ]);
    await expectWallet(guardian, 6);
  });
});

describe("booking several sessions in one call", () => {
  it("books every session for the caller and a dependent", async () => {
    const result = await bookMany(guardian, [
      session(0),
      session(1),
      session(0, { participantPersonId: child }),
      session(1, { participantPersonId: child }),
    ]);
    expect(result).toMatchObject({
      status: "booked",
      atomic: true,
      totalCreditsApplied: 8,
    });
    expect(result.results.map((entry) => entry.status)).toEqual([
      "booked",
      "booked",
      "booked",
      "booked",
    ]);
    expect(result.results.map((entry) => entry.participantPersonId)).toEqual([
      guardian,
      guardian,
      child,
      child,
    ]);
    expect(result.results.every((entry) => entry.bookingId)).toBe(true);
    await expectWallet(guardian, 2);
    expect(await count("orders where status = 'paid'")).toBe(4);
  });

  it("returns the same bookings when a finished call is retried", async () => {
    const idempotencyKey = crypto.randomUUID();
    const first = await bookMany(guardian, [session(0), session(1)], {
      idempotencyKey,
    });
    const retry = await bookMany(guardian, [session(0), session(1)], {
      idempotencyKey,
      requestId: crypto.randomUUID(),
    });
    expect(first.status).toBe("booked");
    expect(retry).toEqual(first);
    await expectWallet(guardian, 6);
    expect(await count("orders")).toBe(2);
  });

  it("resumes a call that stopped part-way without rebooking what it finished", async () => {
    const idempotencyKey = crypto.randomUUID();
    // The first attempt booked session 0 and then the process died.
    const finished = await checkout(guardian, {
      idempotencyKey: `${idempotencyKey}:0`,
    });
    const resumed = await bookMany(guardian, [session(0), session(1)], {
      idempotencyKey,
    });
    expect(resumed).toMatchObject({ status: "booked", totalCreditsApplied: 4 });
    expect(resumed.results[0]).toMatchObject({
      status: "booked",
      orderId: finished.orderId,
    });
    expect(await count("orders")).toBe(2);
    await expectWallet(guardian, 6);
  });

  it("refuses a reused key that does not match what it booked", async () => {
    const idempotencyKey = crypto.randomUUID();
    await bookMany(guardian, [session(0)], { idempotencyKey });
    await expect(
      bookMany(guardian, [session(1)], { idempotencyKey }),
    ).rejects.toThrow("already used");
    await expectWallet(guardian, 8);
  });

  it("leaves nothing booked when one session cannot be paid for", async () => {
    const result = await bookMany(guardian, [
      session(0, { quantity: 2 }),
      session(1, { quantity: 2 }),
      session(2, { quantity: 2 }),
    ]);
    expect(result).toMatchObject({
      status: "failed",
      atomic: true,
      totalCreditsApplied: 0,
    });
    expect(result.results.map((entry) => entry.status)).toEqual([
      "rolled-back",
      "rolled-back",
      "failed",
    ]);
    expect(result.results[2]).toMatchObject({
      errorCode: "INSUFFICIENT_CREDITS",
    });
    await expectWallet(guardian, 10);
    expect(
      await count(
        `catalog_fulfillments where status in ('held', 'pending', 'ready', 'fulfilled')`,
      ),
    ).toBe(0);
    expect(await list(guardian, { scope: "all" })).toEqual([]);
  });

  it("reports each session when the caller opts out of all-or-nothing", async () => {
    const result = await bookMany(
      guardian,
      [
        session(0, { quantity: 2 }),
        session(1, { quantity: 2 }),
        session(2, { quantity: 2 }),
      ],
      { atomic: false },
    );
    expect(result).toMatchObject({
      status: "partial",
      atomic: false,
      totalCreditsApplied: 8,
    });
    expect(result.results.map((entry) => entry.status)).toEqual([
      "booked",
      "booked",
      "failed",
    ]);
    await expectWallet(guardian, 2);
    // The failed session does not keep holding places.
    expect(
      await count(
        `catalog_fulfillments where catalog_session_occurrence_id = $1 and status in ('held', 'pending', 'ready', 'fulfilled')`,
        [sessions[2]],
      ),
    ).toBe(0);
  });

  it("validates every session before writing anything", async () => {
    await pg.exec(
      `update catalog_session_occurrences set capacity = 1 where id = '${sessions[1]}'`,
    );
    await checkout(otherAdult, { catalogSessionOccurrenceId: sessions[1] });
    const ordersBefore = await count("orders");

    await expect(bookMany(guardian, [session(0), session(1)])).rejects.toThrow(
      "no longer has enough open places",
    );
    await expect(bookMany(guardian, [session(0), session(0)])).rejects.toThrow(
      "chosen twice for the same person",
    );
    await expect(
      bookMany(guardian, [
        session(0),
        session(2, { participantPersonId: pendingChild }),
      ]),
    ).rejects.toThrow("Guardian review must be complete");
    await expect(bookMany(guardian, [])).rejects.toThrow("between 1 and 20");
    await expect(
      bookMany(guardian, [session(0)], {
        now: new Date("2026-12-11T00:00:00.000Z"),
      }),
    ).rejects.toThrow("no longer open for booking");

    expect(await count("orders")).toBe(ordersBefore);
    await expectWallet(guardian, 10);

    await bookMany(guardian, [session(0)]);
    await expect(bookMany(guardian, [session(0), session(2)])).rejects.toThrow(
      "already booked for this person",
    );
    await expectWallet(guardian, 8);
  });
});

describe("a player's session schedule", () => {
  it("lists the caller's and their dependents' sessions in order", async () => {
    await bookMany(guardian, [
      session(1),
      session(0, { participantPersonId: child }),
    ]);
    const bookings = await list(guardian);
    expect(bookings).toHaveLength(2);
    expect(bookings[0]).toMatchObject({
      status: "confirmed",
      title: "Group training",
      subtype: "group-lesson",
      catalogItemSlug: "group-training",
      organization: { id: org, slug: "beach-test", name: "Beach Test Academy" },
      startsAt: "2026-12-10T17:00:00.000Z",
      endsAt: "2026-12-10T18:00:00.000Z",
      timezone: "UTC",
      sessionStatus: "scheduled",
      deliveryMode: "online",
      coaches: [{ personId: academy.coach, displayName: "Coach" }],
      participant: {
        personId: child,
        displayName: "Mia Junior",
        isSelf: false,
      },
      bookedBy: { personId: guardian, displayName: "Player 1", isSelf: true },
      paidByPersonId: guardian,
      quantity: 1,
      paymentMethod: "credit",
      creditsReserved: 2,
      cancellable: true,
      refundableUntil: "2026-12-09T17:00:00.000Z",
      refundIfCancelledNow: true,
    });
    expect(bookings[1]).toMatchObject({
      startsAt: "2026-12-17T17:00:00.000Z",
      participant: { personId: guardian, isSelf: true },
    });
    expect(await list(guardian, { includeDependents: false })).toHaveLength(2);
    expect(await list(guardian, { scope: "past" })).toEqual([]);
    expect(
      await list(guardian, {
        scope: "past",
        now: new Date("2026-12-12T00:00:00.000Z"),
      }),
    ).toHaveLength(1);
  });

  it("shows a dependent their session but leaves managing it to the guardian", async () => {
    await bookMany(guardian, [session(0, { participantPersonId: child })]);
    const [booking] = await loadPlayerCatalogSessionBookings({
      actor: actor(child, undefined, "teen"),
      now,
    });
    expect(booking).toMatchObject({
      participant: { personId: child, isSelf: true },
      bookedBy: { personId: guardian, isSelf: false },
      cancellable: false,
      refundIfCancelledNow: false,
    });
    expect(await list(stranger)).toEqual([]);
    expect(await list(otherAdult)).toEqual([]);
  });

  it("carries group-size pricing so a schedule can explain the price", async () => {
    await configureParticipation(pg, { creditTiers: tiers }, 3);
    await bookMany(guardian, [session(0)]);
    await bookMany(otherAdult, [session(0)]);
    const [booking] = await list(guardian);
    expect(booking).toMatchObject({
      creditsReserved: 3,
      participation: {
        bookedCount: 2,
        minParticipants: 1,
        currentCreditsPerPlayer: 2,
        status: "open",
      },
    });
  });

  it("leaves out checkouts that never became bookings", async () => {
    await expect(checkout(guardian, { quantity: 6 })).rejects.toThrow(
      "You need 12",
    );
    expect(await list(guardian, { scope: "all" })).toEqual([]);
  });
});

describe("cancelling a session booking", () => {
  it("returns the credits inside the refund window and frees the place", async () => {
    await pg.exec(
      `update catalog_session_occurrences set capacity = 1 where id = '${sessions[0]}'`,
    );
    const { orderId } = await checkout(guardian);
    const bookingId = await bookingIdFor(orderId);
    await expectWallet(guardian, 8);
    await expect(bookMany(otherAdult, [session(0)])).rejects.toThrow(
      "no longer has enough open places",
    );
    const result = await cancel(guardian, bookingId);
    expect(result).toMatchObject({
      id: bookingId,
      status: "cancelled",
      refundStatus: "credits-returned",
      creditsReturned: 2,
    });
    expect(result.message).toContain("2 credits were returned");
    await expectWallet(guardian, 10);
    expect((await list(guardian))[0]).toMatchObject({
      status: "refunded",
      cancellable: false,
    });
    await expect(cancel(guardian, bookingId)).rejects.toThrow(
      "can no longer be cancelled",
    );
    await expectWallet(guardian, 10);
    // The only place is open again.
    expect((await bookMany(otherAdult, [session(0)])).status).toBe("booked");
  });

  it("lets the guardian cancel a dependent's session, not the dependent", async () => {
    const { orderId } = await checkout(guardian, {
      participantPersonId: child,
    });
    const bookingId = await bookingIdFor(orderId);
    await expect(
      cancelCatalogSessionBooking({
        actor: actor(child, undefined, "teen"),
        bookingId,
        requestId: crypto.randomUUID(),
        now,
      }),
    ).rejects.toThrow("The family member who booked this session manages it");
    await expect(cancel(stranger, bookingId)).rejects.toThrow(
      "not found in your Duna account",
    );
    await expectWallet(guardian, 8);
    expect(await cancel(guardian, bookingId)).toMatchObject({
      refundStatus: "credits-returned",
      creditsReturned: 2,
    });
    await expectWallet(guardian, 10);
  });

  it("never forfeits credits by accident after the refund window", async () => {
    const { orderId } = await checkout(guardian);
    const bookingId = await bookingIdFor(orderId);
    const late = new Date("2026-12-10T15:00:00.000Z");
    await expect(cancel(guardian, bookingId, { now: late })).rejects.toThrow(
      "closed 24 hours before the session",
    );
    expect((await list(guardian, { now: late }))[0]).toMatchObject({
      status: "confirmed",
      cancellable: true,
      refundIfCancelledNow: false,
    });
    await expectWallet(guardian, 8);

    const result = await cancel(guardian, bookingId, {
      now: late,
      acknowledgeNoRefund: true,
    });
    expect(result).toMatchObject({
      refundStatus: "not-applicable",
      creditsReturned: 0,
    });
    expect(result.message).toContain("Nothing was returned");
    await expectWallet(guardian, 8);
    expect((await list(guardian, { now: late }))[0]).toMatchObject({
      status: "cancelled",
    });
  });

  it("closes cancellation when the session starts", async () => {
    const { orderId } = await checkout(guardian);
    await expect(
      cancel(guardian, await bookingIdFor(orderId), {
        now: new Date("2026-12-10T17:05:00.000Z"),
        acknowledgeNoRefund: true,
      }),
    ).rejects.toThrow("Cancellation closed when this session started");
    await expectWallet(guardian, 8);
  });

  it("follows the organization's own refund policy", async () => {
    await pg.exec(`
      INSERT INTO organization_refund_policies (organization_id, name, mode, refund_before_minutes, is_default)
        VALUES ('${org}', 'Flexible · 2 hours', 'refundable', 120, true);
    `);
    const { orderId } = await checkout(guardian);
    const bookingId = await bookingIdFor(orderId);
    expect((await list(guardian))[0]?.refundableUntil).toBe(
      "2026-12-10T15:00:00.000Z",
    );
    expect(
      await cancel(guardian, bookingId, {
        now: new Date("2026-12-10T14:00:00.000Z"),
      }),
    ).toMatchObject({ refundStatus: "credits-returned", creditsReturned: 2 });
    await expectWallet(guardian, 10);

    await pg.exec(
      `update organization_refund_policies set mode = 'non-refundable', refund_before_minutes = null`,
    );
    const second = await checkout(guardian, {
      catalogSessionOccurrenceId: sessions[1],
    });
    await expect(
      cancel(guardian, await bookingIdFor(second.orderId)),
    ).rejects.toThrow("non-refundable");
    expect((await list(guardian))[0]).toMatchObject({
      refundIfCancelledNow: false,
    });
  });

  it("returns only what is still held after a group-size settlement", async () => {
    await configureParticipation(
      pg,
      { creditTiers: tiers, cutoffMinutesBeforeStart: 2_880 },
      3,
    );
    const { orderId } = await checkout(guardian);
    await checkout(otherAdult);
    // Before the lock: everything that is still held comes back.
    const result = await cancel(guardian, await bookingIdFor(orderId), {
      now: new Date("2026-12-08T05:00:00.000Z"),
    });
    expect(result).toMatchObject({
      refundStatus: "credits-returned",
      creditsReturned: 3,
    });
    await expectWallet(guardian, 10);
  });

  it("after the lock a late cancellation pays the final price (decision 4)", async () => {
    await configureParticipation(
      pg,
      { creditTiers: tiers, cutoffMinutesBeforeStart: 2_880 },
      3,
    );
    const { orderId } = await checkout(guardian);
    await checkout(otherAdult);
    await evaluateCatalogSessionParticipation({
      occurrenceId: sessions[0],
      requestId: crypto.randomUUID(),
      now: new Date("2026-12-08T18:00:00.000Z"),
    });
    await expectWallet(guardian, 8);
    const bookingId = await bookingIdFor(orderId);
    // The lock is the free-cancellation deadline (decision 1), even though
    // the club's refund window is later.
    await expect(
      cancel(guardian, bookingId, {
        now: new Date("2026-12-09T05:00:00.000Z"),
      }),
    ).rejects.toThrow(
      "Cancelling now costs 2 credits. You get them back if someone takes your place.",
    );
    expect(
      await cancel(guardian, bookingId, {
        now: new Date("2026-12-09T05:00:00.000Z"),
        acknowledgeNoRefund: true,
      }),
    ).toMatchObject({ chargedCredits: 2, creditsReturned: 0 });
    await expectWallet(guardian, 8);
    await expectWallet(otherAdult, 8);
  });
});
