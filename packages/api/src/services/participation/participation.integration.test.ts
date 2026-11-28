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
import { CatalogCheckoutError, startCatalogCheckout } from "../../catalog-checkout";
import {
  evaluateCatalogSessionParticipation,
  loadOperatorCatalogSessionOccurrences,
} from "../../catalog-participation";
import { cancelCatalogSessionBooking } from "../../catalog-session-bookings";
import { processDueParticipation } from "./engine";
import {
  cancelParticipationSession,
  extendParticipationLock,
  participationAtRisk,
  previewParticipationRuleChange,
  recordParticipationAttendance,
  requestParticipationCancel,
  runParticipationAnyway,
  setParticipationDefaults,
} from "./operator";
import { participationQuote } from "./player";

const { pg, db } = createCatalogTestDatabase();
state.db = db;
const { org, owner, coach, players, item, variant, occurrence, now } = academy;
const SUBJECT = "catalog-session-occurrence";
// Thursday 10 December 2026 17:00 UTC; the default lock is 24 hours before.
const beforeLock = new Date("2026-12-09T12:00:00.000Z");
const afterLock = new Date("2026-12-09T18:00:00.000Z");
const child = "31000000-0000-4000-8000-000000000001";

const ladder = [
  { minParticipants: 1, maxParticipants: 1, creditsPerPlayer: 3 },
  { minParticipants: 2, maxParticipants: 6, creditsPerPlayer: 2 },
  { minParticipants: 7, maxParticipants: 8, creditsPerPlayer: 1 },
];

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

const evaluate = (at: Date) =>
  evaluateCatalogSessionParticipation({
    occurrenceId: occurrence,
    requestId: crypto.randomUUID(),
    now: at,
  });

async function wallet(personId: string) {
  const balances = await walletState(pg, personId);
  expect(balances?.cached).toBe(balances?.ledger);
  expect(balances?.cached).toBe(balances?.granted);
  return balances?.cached;
}

async function decisionRow() {
  const result = await pg.query<Record<string, unknown>>(
    `select outcome, decided_group_size, rule_snapshot, forced_outcome, lock_at, lock_override_at, cancel_reason, settled_at
       from participation_decisions where subject_id = $1`,
    [occurrence],
  );
  return result.rows[0];
}

async function notices(kind?: string) {
  const result = await pg.query<{ kind: string; recipient_person_id: string }>(
    `select kind, recipient_person_id from participation_notices
      where subject_id = $1 ${kind ? "and kind = $2" : ""} order by created_at, kind`,
    kind ? [occurrence, kind] : [occurrence],
  );
  return result.rows;
}

async function bookingId(orderId: string) {
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
      VALUES ('${child}', 'Mia Junior', 'mia-junior', true);
    INSERT INTO guardianships (guardian_id, minor_id, relationship, verified, review_status, can_approve_spending)
      VALUES ('${players[0]}', '${child}', 'parent', true, 'verified', true);
  `);
});

describe("book to the minimum, the lock confirms", () => {
  beforeEach(() =>
    configureParticipation(pg, { minParticipants: 3, minimumPolicy: "cancel" }, 2),
  );

  it("snapshots at the first booking and confirms at the lock", async () => {
    await book(players[0]!);
    expect(await decisionRow()).toMatchObject({ outcome: null });
    expect(await notices()).toEqual([
      { kind: "booked-needs-players", recipient_person_id: players[0] },
      { kind: "needs-players-reminder", recipient_person_id: players[0] },
    ]);
    await book(players[1]!);
    await book(players[2]!);
    expect(await evaluate(beforeLock)).toMatchObject({ status: "not-due" });
    expect(await evaluate(afterLock)).toMatchObject({
      status: "settled",
      outcome: "minimum-met",
      headcount: 3,
    });
    expect(await decisionRow()).toMatchObject({
      outcome: "minimum-met",
      decided_group_size: 3,
    });
    expect((await notices("confirmed")).map((row) => row.recipient_person_id).sort()).toEqual(
      players.slice(0, 3).sort(),
    );
  });

  it("cancels under the minimum at the lock and returns every credit", async () => {
    await book(players[0]!);
    await book(players[1]!);
    expect(await wallet(players[0]!)).toBe(8);
    const result = await evaluate(afterLock);
    expect(result).toMatchObject({ status: "cancelled", outcome: "cancel-under-minimum" });
    expect(result.cancellations.map((entry) => entry.refundStatus)).toEqual([
      "credits-restored",
      "credits-restored",
    ]);
    expect(await wallet(players[0]!)).toBe(10);
    expect(await wallet(players[1]!)).toBe(10);
    expect(await decisionRow()).toMatchObject({
      outcome: "cancel-under-minimum",
      cancel_reason: "minimum-not-met",
    });
    expect((await notices("cancelled-low")).length).toBe(2);
    expect(await notices("staff-cancelled")).toEqual([
      { kind: "staff-cancelled", recipient_person_id: coach },
    ]);
  });

  it("runs anyway when the club says so", async () => {
    await book(players[0]!);
    await runParticipationAnyway({
      organizationId: org,
      actorPersonId: owner,
      subjectType: SUBJECT,
      subjectId: occurrence,
      requestId: crypto.randomUUID(),
      now: beforeLock,
    });
    expect(await evaluate(afterLock)).toMatchObject({
      status: "settled",
      outcome: "run-under-minimum",
    });
    expect(await wallet(players[0]!)).toBe(8);
  });

  it("extending the lock moves the decision and free cancellation", async () => {
    await book(players[0]!);
    const extended = new Date("2026-12-10T09:00:00.000Z");
    const result = await extendParticipationLock({
      organizationId: org,
      actorPersonId: owner,
      subjectType: SUBJECT,
      subjectId: occurrence,
      lockAt: extended,
      requestId: crypto.randomUUID(),
      now: beforeLock,
    });
    expect(result.noticesQueued).toBe(1);
    expect(await evaluate(afterLock)).toMatchObject({ status: "not-due" });
    await expect(
      extendParticipationLock({
        organizationId: org,
        actorPersonId: owner,
        subjectType: SUBJECT,
        subjectId: occurrence,
        lockAt: new Date("2026-12-10T17:30:00.000Z"),
        requestId: crypto.randomUUID(),
        now: beforeLock,
      }),
    ).rejects.toThrow("We need to decide before the session starts.");
    // Still inside the free window after the original lock.
    expect(
      await cancelCatalogSessionBooking({
        actor: testActor(players[0]!),
        bookingId: (
          await pg.query<{ id: string }>(
            `select id from catalog_fulfillments where catalog_session_occurrence_id = $1`,
            [occurrence],
          )
        ).rows[0]!.id,
        requestId: crypto.randomUUID(),
        now: afterLock,
      }),
    ).toMatchObject({ refundStatus: "credits-returned", creditsReturned: 2 });
  });
});

describe("a rule edit never touches a booked session (§4.3)", () => {
  it("keeps the snapshot taken at the first booking", async () => {
    await configureParticipation(pg, { minParticipants: 2, minimumPolicy: "cancel" }, 2);
    await book(players[0]!);
    await book(players[1]!);
    // The owner tightens the offering after people booked.
    await configureParticipation(pg, { minParticipants: 6, minimumPolicy: "cancel" }, 2);
    expect(await evaluate(afterLock)).toMatchObject({
      status: "settled",
      outcome: "minimum-met",
      minParticipants: 2,
    });
    const preview = await previewParticipationRuleChange({
      organizationId: org,
      catalogItemId: item,
      rules: { minParticipants: 7, minimumPolicy: "cancel" },
      now,
    });
    expect(preview.changeClass).toBe("tightens");
    expect(preview.unbookedSessions).toBe(2);
  });
});

describe("late cancellation (decision 4)", () => {
  it("pays the final price, returned when the place is refilled", async () => {
    await configureParticipation(pg, { creditTiers: ladder, minParticipants: 2, minimumPolicy: "cancel" }, 3);
    const first = await book(players[0]!);
    await book(players[1]!);
    await book(players[2]!);
    await evaluate(afterLock);
    // Group of 3: 2 credits each; 1 returned at the lock.
    expect(await wallet(players[0]!)).toBe(8);
    const late = new Date("2026-12-10T08:00:00.000Z");
    const id = await bookingId(first.orderId);
    await expect(
      cancelCatalogSessionBooking({
        actor: testActor(players[0]!),
        bookingId: id,
        requestId: crypto.randomUUID(),
        now: late,
      }),
    ).rejects.toThrow("Cancelling now costs 2 credits.");
    expect(
      await cancelCatalogSessionBooking({
        actor: testActor(players[0]!),
        bookingId: id,
        acknowledgeNoRefund: true,
        requestId: crypto.randomUUID(),
        now: late,
      }),
    ).toMatchObject({ chargedCredits: 2, creditsReturned: 0 });
    expect(await wallet(players[0]!)).toBe(8);
    // Someone takes the place: the late canceller gets the final price back.
    await book(players[3]!, { now: new Date("2026-12-10T09:00:00.000Z") });
    expect(await wallet(players[0]!)).toBe(10);
    expect((await notices("place-refilled")).map((row) => row.recipient_person_id)).toEqual([
      players[0],
    ]);
    // The newcomer paid the final price, never the reserve.
    expect(await wallet(players[3]!)).toBe(8);
  });
});

describe("places, duplicates and concurrency", () => {
  beforeEach(() => configureParticipation(pg, { minParticipants: 2, minimumPolicy: "cancel" }, 2));

  it("blocks a second booking of the same session (decision 5)", async () => {
    await book(players[0]!);
    const second = book(players[0]!);
    await expect(second).rejects.toBeInstanceOf(CatalogCheckoutError);
    await expect(book(players[0]!)).rejects.toThrow("You're already booked for this session");
    // A family booking for the child is a different participant.
    expect(await book(players[0]!, { participantPersonId: child })).toMatchObject({
      orderStatus: "paid",
    });
    expect(await wallet(players[0]!)).toBe(6);
  });

  it("gives the last place to exactly one of two people booking at once", async () => {
    // The offering's first booking creates its catalog version; do that first.
    await book(players[2]!, { catalogSessionOccurrenceId: academy.secondOccurrence });
    await pg.query(`update catalog_session_occurrences set capacity = 1 where id = $1`, [occurrence]);
    const results = await Promise.allSettled([book(players[0]!), book(players[1]!)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
    expect(String(rejected.reason)).toContain("enough open places");
    const active = await pg.query<{ count: number }>(
      `select count(*)::int as count from catalog_fulfillments
        where catalog_session_occurrence_id = $1 and status in ('held','pending','ready','fulfilled')`,
      [occurrence],
    );
    expect(active.rows[0]!.count).toBe(1);
    expect((await wallet(players[0]!)) + (await wallet(players[1]!))).toBe(18);
  });

  it("the schedule is safe to run twice and concurrently", async () => {
    await book(players[0]!);
    await book(players[1]!);
    const runs = await Promise.all([
      processDueParticipation({ now: afterLock }),
      processDueParticipation({ now: afterLock }),
    ]);
    expect(runs.every((run) => run.failed === 0)).toBe(true);
    await processDueParticipation({ now: afterLock });
    expect(await decisionRow()).toMatchObject({ outcome: "minimum-met" });
    const settlements = await pg.query<{ count: number }>(
      `select count(*)::int as count from catalog_participation_settlements where catalog_session_occurrence_id = $1`,
      [occurrence],
    );
    expect(settlements.rows[0]!.count).toBe(0);
    expect((await notices("confirmed")).length).toBe(2);
    const audits = await pg.query<{ count: number }>(
      `select count(*)::int as count from audit_log where entity_id = $1 and action = 'catalog.session_minimum_decided'`,
      [occurrence],
    );
    expect(audits.rows[0]!.count).toBe(1);
  });
});

describe("the club cancels", () => {
  it("refunds everyone, marks the session cancelled and tells each booker", async () => {
    await configureParticipation(pg, { minParticipants: 2, minimumPolicy: "cancel" }, 2);
    await book(players[0]!);
    await book(players[1]!);
    await evaluate(afterLock);
    const result = await cancelParticipationSession({
      organizationId: org,
      actorPersonId: owner,
      subjectType: SUBJECT,
      subjectId: occurrence,
      reason: "weather",
      requestId: crypto.randomUUID(),
      now: new Date("2026-12-10T10:00:00.000Z"),
    });
    expect(result.cancellations.map((entry) => entry.refundStatus)).toEqual([
      "credits-restored",
      "credits-restored",
    ]);
    expect(await wallet(players[0]!)).toBe(10);
    const occurrenceRow = await pg.query<{ status: string }>(
      `select status from catalog_session_occurrences where id = $1`,
      [occurrence],
    );
    // The payments model reads this: a cancelled session releases nothing.
    expect(occurrenceRow.rows[0]!.status).toBe("cancelled");
    expect(await decisionRow()).toMatchObject({
      outcome: "cancelled-by-club",
      cancel_reason: "weather",
      settled_at: null,
    });
    expect((await notices("cancelled-club")).length).toBe(2);
    await expect(book(players[2]!)).rejects.toThrow("cancelled by the club");
  });

  it("a coach requests; only the assigned coach or staff may", async () => {
    await configureParticipation(pg, { minParticipants: 2, minimumPolicy: "cancel" }, 2);
    const coachActor = { ...testActor(coach, org), roles: ["coach" as const], scopes: ["sessions:read"] };
    const first = await requestParticipationCancel({
      actor: coachActor,
      organizationId: org,
      subjectType: SUBJECT,
      subjectId: occurrence,
      reason: "coach",
      requestId: crypto.randomUUID(),
      now,
    });
    const again = await requestParticipationCancel({
      actor: coachActor,
      organizationId: org,
      subjectType: SUBJECT,
      subjectId: occurrence,
      reason: "coach",
      requestId: crypto.randomUUID(),
      now,
    });
    expect(again.requestId).toBe(first.requestId);
    await expect(
      requestParticipationCancel({
        actor: { ...testActor(players[5]!, org), scopes: ["sessions:read"] },
        organizationId: org,
        subjectType: SUBJECT,
        subjectId: occurrence,
        reason: "coach",
        requestId: crypto.randomUUID(),
        now,
      }),
    ).rejects.toThrow("Only the session's coach");
  });
});

describe("attendance without a money permission", () => {
  it("lets the assigned coach mark people and never changes a price", async () => {
    await configureParticipation(pg, { creditTiers: ladder }, 3);
    const first = await book(players[0]!);
    const second = await book(players[1]!);
    await evaluate(afterLock);
    const coachActor = { ...testActor(coach, org), scopes: ["sessions:read"] };
    const during = new Date("2026-12-10T17:10:00.000Z");
    const marks = [
      { bookingId: await bookingId(first.orderId), status: "attended" as const },
      { bookingId: await bookingId(second.orderId), status: "absent" as const },
    ];
    const result = await recordParticipationAttendance({
      actor: coachActor,
      organizationId: org,
      subjectType: SUBJECT,
      subjectId: occurrence,
      marks,
      idempotencyKey: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
      now: during,
    });
    expect(result).toEqual({ recorded: 2, ignored: [] });
    // An older offline mark never overwrites a newer one.
    const stale = await recordParticipationAttendance({
      actor: coachActor,
      organizationId: org,
      subjectType: SUBJECT,
      subjectId: occurrence,
      marks: [{ ...marks[1]!, status: "attended", deviceMarkedAt: new Date("2026-12-10T17:01:00.000Z") }],
      idempotencyKey: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
      now: during,
    });
    expect(stale.ignored).toEqual([{ bookingId: marks[1]!.bookingId, reason: "newer-mark-exists" }]);
    // Both paid the 2-player price (decision 2: no attendance pricing).
    expect(await wallet(players[0]!)).toBe(8);
    expect(await wallet(players[1]!)).toBe(8);
    const roster = await loadOperatorCatalogSessionOccurrences({
      actor: { ...testActor(owner, org), scopes: ["*"] },
      catalogItemId: item,
      now: during,
    });
    expect(roster[0]!.bookings.map((booking) => booking.attendance)).toEqual([
      "attended",
      "no-show",
    ]);
    await expect(
      recordParticipationAttendance({
        actor: { ...testActor(players[4]!, org), scopes: ["sessions:read"] },
        organizationId: org,
        subjectType: SUBJECT,
        subjectId: occurrence,
        marks,
        idempotencyKey: crypto.randomUUID(),
        requestId: crypto.randomUUID(),
        now: during,
      }),
    ).rejects.toThrow("Only the session's coach");
  });
});

describe("the club default", () => {
  it("is inherited by offerings without a rule and shows in the at-risk list", async () => {
    const saved = await setParticipationDefaults({
      organizationId: org,
      actorPersonId: owner,
      rules: { minParticipants: 3, minimumPolicy: "cancel", lockMinutesBeforeStart: 1440, waitlist: true },
      appliesTo: ["service"],
      requestId: crypto.randomUUID(),
      now,
    });
    expect(saved.issues).toEqual([]);
    const invalid = await setParticipationDefaults({
      organizationId: org,
      actorPersonId: owner,
      rules: { minParticipants: 3, lockMinutesBeforeStart: -5 },
      appliesTo: ["service"],
      requestId: crypto.randomUUID(),
      now,
    });
    expect(invalid.issues).toEqual(["We need to decide before the session starts."]);
    await book(players[0]!);
    const risk = await participationAtRisk({
      organizationId: org,
      includeMoney: true,
      now,
      to: new Date("2026-12-31T00:00:00.000Z"),
    });
    expect(risk.sessions.map((session) => [session.subjectId, session.booked, session.min])).toEqual([
      [occurrence, 1, 3],
    ]);
    expect(risk.totals).toMatchObject({ sessions: 1, atStakeCredits: 2 });
    const quote = await participationQuote({
      actor: testActor(players[1]!),
      catalogItemId: item,
      catalogSessionOccurrenceId: occurrence,
      quantity: 1,
      paymentMethod: "credit",
      now,
    });
    expect(quote.copy).toMatchObject({
      status: "Needs 2 more",
      line: "Confirms Dec 9, 5:00 PM if 2 more join",
    });
    expect(quote.alreadyBooked).toBe(false);
    expect(
      (
        await participationQuote({
          actor: testActor(players[0]!),
          catalogItemId: item,
          catalogSessionOccurrenceId: occurrence,
          quantity: 1,
          paymentMethod: "credit",
          now,
        })
      ).alreadyBooked,
    ).toBe(true);
    expect(await evaluate(afterLock)).toMatchObject({
      status: "cancelled",
      outcome: "cancel-under-minimum",
    });
  });
});
