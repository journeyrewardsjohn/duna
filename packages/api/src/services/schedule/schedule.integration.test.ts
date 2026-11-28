/**
 * SCHED-API against every real migration in in-memory Postgres: the front
 * desk books, moves and cancels courts and records desk payments through
 * `operator.schedule.*`, on the same records a player booking writes.
 * Proves: no double booking under concurrency (two desks at once, and a
 * player-path booking), the shared rule's hours on a daylight-saving day,
 * preview = result for cancellations, idempotency, permissions (front desk,
 * owner, coach, another club), blocks with what was cancelled under them,
 * the narrow coach attendance rule, and a fixed number of queries for the
 * calendar's money read.
 */
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

const state = vi.hoisted(() => ({ db: null as unknown, stripe: false }));
vi.mock("@duna/db", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getDatabase: () => state.db,
  getTransactionalDatabase: () => state.db,
}));
vi.mock("../../payments", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isStripeConfigured: () => state.stripe,
  refundPayment: vi.fn(async () => ({ id: "re_test_1", status: "succeeded" })),
}));

import {
  academy,
  applyAllMigrations,
  createCatalogTestDatabase,
  seedAcademy,
  testActor,
} from "../../catalog-booking.test-support";
import type { ApiActor } from "../../context";
import { createApiContext, scopesForRoles } from "../../context";
import { createCaller } from "../../router";
import { bookingPayments } from "./bookings";

const { pg, db } = createCatalogTestDatabase();
state.db = db;
const { org, coach, owner, players } = academy;
const now = academy.now; // Tuesday 1 December 2026, 12:00 UTC
const otherOrg = "11000000-0000-4000-8000-000000000001";
const venue = "61000000-0000-4000-8000-000000000001";
const courtA = "62000000-0000-4000-8000-000000000001";
const courtB = "62000000-0000-4000-8000-000000000002";
const otherVenue = "61000000-0000-4000-8000-000000000002";
const otherCourt = "62000000-0000-4000-8000-000000000003";
const ratePlan = "63000000-0000-4000-8000-000000000001";
const child = "31000000-0000-4000-8000-000000000001";
const guardian = players[0]!;
const LA = "America/Los_Angeles";

const staff = (
  personId: string,
  roles: Parameters<typeof scopesForRoles>[0],
  organizationId: string = org,
): ApiActor => ({
  ...testActor(personId, organizationId),
  roles,
  scopes: scopesForRoles(roles),
});
const frontDesk = staff(players[7]!, ["front-desk"]);
const managerActor = staff(players[6]!, ["manager"]);
const coachActor = staff(coach, ["coach"]);
const ownerActor: ApiActor = {
  ...testActor(owner, org),
  roles: ["owner"],
  scopes: ["*"],
};
const otherDesk = staff(players[5]!, ["front-desk"], otherOrg);
const api = (actor: ApiActor, at: Date = now) =>
  createCaller(createApiContext({ actor, now: at })).operator;
const key = () => crypto.randomUUID();

/** A wall-clock time in Los Angeles as an instant. */
function la(date: string, time: string): string {
  const [hour, minute] = time.split(":").map(Number);
  // Resolve through Intl: the offset that makes the wall clock match.
  for (const offset of [-8, -7]) {
    const candidate = new Date(
      Date.UTC(
        Number(date.slice(0, 4)),
        Number(date.slice(5, 7)) - 1,
        Number(date.slice(8, 10)),
        hour! - offset,
        minute!,
      ),
    );
    const wall = new Intl.DateTimeFormat("en-CA", {
      timeZone: LA,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(candidate);
    if (wall === time) return candidate.toISOString();
  }
  throw new Error(`No such time ${date} ${time}`);
}

function slot(date: string, from: string, to: string, courtId = courtA) {
  return { courtId, startsAt: la(date, from), endsAt: la(date, to) };
}

/** A result line as its preview line (the refund path's answer removed). */
function withoutOutcome<T extends { outcome?: unknown; refundId?: unknown }>(
  line: T,
): Omit<T, "outcome" | "refundId"> {
  const copy: Partial<T> = { ...line };
  delete copy.outcome;
  delete copy.refundId;
  return copy as Omit<T, "outcome" | "refundId">;
}

async function count(table: string, where = "true", params: unknown[] = []) {
  const result = await pg.query<{ count: number }>(
    `select count(*)::int as count from ${table} where ${where}`,
    params,
  );
  return result.rows[0]!.count;
}

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  const result = await pg.query<T>(sql, params);
  return result.rows[0]!;
}

function deskBooking(
  overrides: Partial<
    Parameters<ReturnType<typeof api>["schedule"]["createCourtBooking"]>[0]
  > = {},
) {
  return {
    ...slot("2026-12-04", "18:00", "19:30"),
    personId: players[1]!,
    currency: "USD",
    paymentIntent: "pay-at-desk" as const,
    idempotencyKey: key(),
    ...overrides,
  };
}

beforeAll(() => applyAllMigrations(pg), 120_000);
afterAll(() => pg.close());
beforeEach(async () => {
  state.stripe = false;
  await seedAcademy(pg);
  await pg.exec(`
    INSERT INTO people (id, display_name, handle, is_minor)
      VALUES ('${child}', 'Mia Junior', 'mia-junior', true);
    INSERT INTO guardianships (guardian_id, minor_id, relationship, verified, review_status, can_approve_spending)
      VALUES ('${guardian}', '${child}', 'parent', true, 'verified', true);
    INSERT INTO organization_participants (organization_id, person_id, relationship, status)
      VALUES ('${org}', '${child}', 'player', 'active');
    INSERT INTO organizations (id, slug, name, currency, timezone)
      VALUES ('${otherOrg}', 'other-club', 'Other Club', 'USD', 'UTC');
    INSERT INTO venues (id, organization_id, slug, name, timezone, status)
      VALUES ('${venue}', '${org}', 'pier', 'Pier Courts', '${LA}', 'active'),
             ('${otherVenue}', '${otherOrg}', 'other', 'Other Courts', 'UTC', 'active');
    INSERT INTO rate_plans (id, organization_id, name, currency, base_amount_minor, rate_unit_minutes)
      VALUES ('${ratePlan}', '${org}', 'Court hire', 'USD', 4000, 60);
    INSERT INTO courts (id, venue_id, name, qr_token, rate_plan_id, cancellation_policy)
      VALUES ('${courtA}', '${venue}', 'Court 1', 'court-1', '${ratePlan}', '{"refundBeforeHours": 24}'::jsonb),
             ('${courtB}', '${venue}', 'Court 2', 'court-2', '${ratePlan}', '{"refundBeforeHours": 24}'::jsonb),
             ('${otherCourt}', '${otherVenue}', 'Court 9', 'court-9', NULL, '{}'::jsonb);
    INSERT INTO schedules (id, organization_id, name, timezone, resource_type, resource_id)
      VALUES ('64000000-0000-4000-8000-000000000001', '${org}', 'Court 1 hours', '${LA}', 'court', '${courtA}');
    INSERT INTO schedule_blocks (schedule_id, weekday, starts_at_minute, ends_at_minute, mode)
      SELECT '64000000-0000-4000-8000-000000000001', d, 480, 1320, 'open' FROM generate_series(0, 6) AS d;
  `);
});

describe("creating a court booking at the desk", () => {
  it("writes the same booking, order and roster a player booking does", async () => {
    const preview = await api(frontDesk).schedule.createCourtBookingPreview({
      ...slot("2026-12-04", "18:00", "19:30"),
      personId: players[1]!,
      paymentIntent: "pay-at-desk",
    });
    expect(preview).toMatchObject({
      available: true,
      conflicts: [],
      price: { rateMinor: 6000, totalMinor: 6000, currency: "USD" },
      timeZone: LA,
    });
    const created = await api(frontDesk).schedule.createCourtBooking(
      deskBooking({ expectedTotalMinor: 6000 }),
    );
    expect(created).toMatchObject({
      status: "confirmed",
      paymentState: "unpaid",
      totalMinor: 6000,
      priceSource: "rate",
    });
    const booking = await one<Record<string, unknown>>(
      `select status, order_id, person_id, total_amount_minor, payment_mode from court_bookings where id = $1`,
      [created.id],
    );
    expect(booking).toMatchObject({
      status: "confirmed",
      order_id: created.orderId,
      person_id: players[1],
      total_amount_minor: 6000,
      payment_mode: "full",
    });
    expect(
      await one(
        `select status, total_minor, fee_total_minor, checkout_surface, expires_at from orders where id = $1`,
        [created.orderId],
      ),
    ).toMatchObject({
      status: "pending",
      total_minor: 6000,
      fee_total_minor: 0,
      checkout_surface: "desk",
      expires_at: null,
    });
    expect(
      await count(
        "court_booking_participants",
        "booking_id = $1 and role = 'organizer' and status = 'payment-pending'",
        [created.id],
      ),
    ).toBe(1);
    expect(
      await count("audit_log", "action = 'court-booking.desk-created'"),
    ).toBe(1);
    // The calendar's money read shows it as unpaid.
    const money = await api(frontDesk).schedule.bookingPayments({
      from: "2026-12-04T00:00:00.000Z",
      to: "2026-12-06T00:00:00.000Z",
    });
    expect(money.bookings).toEqual([
      expect.objectContaining({
        bookingId: created.id,
        totalMinor: 6000,
        paidMinor: 0,
        paymentState: "unpaid",
        due: true,
      }),
    ]);
  });

  it("never double-books: two desks at once, and the same key twice", async () => {
    const results = await Promise.allSettled([
      api(frontDesk).schedule.createCourtBooking(deskBooking()),
      api(managerActor).schedule.createCourtBooking(
        deskBooking({ personId: players[2]! }),
      ),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const refused = results.find((r) => r.status === "rejected") as
      PromiseRejectedResult | undefined;
    expect(refused?.reason).toMatchObject({ code: "CONFLICT" });
    expect(await count("court_bookings")).toBe(1);
    // Overlapping by 15 minutes is refused too; the other court is free.
    await expect(
      api(frontDesk).schedule.createCourtBooking(
        deskBooking(slot("2026-12-04", "19:15", "20:00")),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await api(frontDesk).schedule.createCourtBooking(
      deskBooking(slot("2026-12-04", "18:00", "19:30", courtB)),
    );
    // Same idempotency key: the first answer, no second booking.
    const input = deskBooking(slot("2026-12-05", "09:00", "10:00"));
    const first = await api(frontDesk).schedule.createCourtBooking(input);
    const again = await api(frontDesk).schedule.createCourtBooking(input);
    expect(again.id).toBe(first.id);
    expect(await count("court_bookings")).toBe(3);
  });

  it("is stopped by the database when a player booking races it", async () => {
    // A player's held booking written without the desk's lock.
    await pg.exec(`
      INSERT INTO court_bookings (organization_id, venue_id, court_id, person_id, starts_at, ends_at, status, hold_expires_at, idempotency_key)
        VALUES ('${org}', '${venue}', '${courtA}', '${players[3]}', '${la("2026-12-04", "18:30")}', '${la("2026-12-04", "19:00")}', 'held', '2026-12-01T13:00:00Z', 'player-hold');
    `);
    await expect(
      api(frontDesk).schedule.createCourtBooking(deskBooking()),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    // An expired player hold does not block the court.
    await pg.exec(
      `UPDATE court_bookings SET hold_expires_at = '2026-12-01T11:00:00Z' WHERE idempotency_key = 'player-hold'`,
    );
    const preview = await api(frontDesk).schedule.createCourtBookingPreview({
      ...slot("2026-12-04", "18:00", "19:30"),
      personId: players[1]!,
      paymentIntent: "pay-at-desk",
    });
    expect(preview.available).toBe(true);
  });

  it("refuses sessions, blocks and closed hours by the shared rule, in the place's zone", async () => {
    await pg.exec(`
      INSERT INTO sessions (id, venue_id, court_id, title, slug, starts_at, ends_at, timezone, status, capacity)
        VALUES ('65000000-0000-4000-8000-000000000001', '${venue}', '${courtA}', 'Clinic', 'clinic-1', '${la("2026-12-04", "10:00")}', '${la("2026-12-04", "11:00")}', '${LA}', 'published', 8);
      INSERT INTO schedule_overrides (schedule_id, starts_at, ends_at, mode, reason)
        VALUES ('64000000-0000-4000-8000-000000000001', '${la("2026-12-04", "14:00")}', '${la("2026-12-04", "15:00")}', 'blocked', 'Sand grooming');
    `);
    const check = (from: string, to: string, date = "2026-12-04") =>
      api(frontDesk).schedule.createCourtBookingPreview({
        ...slot(date, from, to),
        personId: players[1]!,
        paymentIntent: "pay-at-desk",
      });
    expect((await check("10:30", "11:30")).conflicts[0]).toMatchObject({
      what: "session",
      reason: "commitment",
    });
    expect((await check("13:30", "14:30")).conflicts[0]).toMatchObject({
      what: "block",
      reason: "blackout",
    });
    expect((await check("07:00", "08:30")).conflicts[0]).toMatchObject({
      what: "hours",
      reason: "outside-hours",
    });
    // Daylight saving starts on 14 March 2027 in Los Angeles: 8 AM local
    // is 15:00 UTC that day (16:00 UTC the day before). The rule follows
    // the wall clock.
    expect(la("2027-03-14", "08:00")).toBe("2027-03-14T15:00:00.000Z");
    expect((await check("08:00", "09:00", "2027-03-14")).available).toBe(true);
    expect((await check("07:30", "08:30", "2027-03-14")).available).toBe(false);
    expect((await check("07:30", "08:30", "2027-03-13")).available).toBe(false);
    await expect(
      api(frontDesk).schedule.createCourtBooking(
        deskBooking(slot("2027-03-14", "07:30", "08:30")),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await api(frontDesk).schedule.createCourtBooking(
      deskBooking(slot("2027-03-14", "08:00", "09:00")),
    );
  });

  it("books walk-ins as a contact, never an account, and gates links and prices", async () => {
    const walkIn = await api(frontDesk).schedule.createCourtBooking(
      deskBooking({
        personId: undefined,
        walkIn: { name: "Sam Walker", phoneE164: "+13105550100" },
      }),
    );
    const person = await one<Record<string, unknown>>(
      `select p.display_name, p.phone_e164, p.profile_claim_status, p.workos_user_id, p.clerk_user_id
         from court_bookings b join people p on p.id = b.person_id where b.id = $1`,
      [walkIn.id],
    );
    expect(person).toMatchObject({
      display_name: "Sam Walker",
      phone_e164: null,
      profile_claim_status: "unclaimed",
      workos_user_id: null,
      clerk_user_id: null,
    });
    expect(
      await one(
        `select invited_phone_e164 from court_booking_participants where booking_id = $1`,
        [walkIn.id],
      ),
    ).toMatchObject({ invited_phone_e164: "+13105550100" });
    // A payment link needs Duna Pay; nothing is booked without it.
    await expect(
      api(frontDesk).schedule.createCourtBooking(
        deskBooking({
          ...slot("2026-12-06", "09:00", "10:00"),
          paymentIntent: "send-payment-link",
        }),
      ),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    // A staff price needs payments:write, and is audited with its reason.
    await expect(
      api(frontDesk).schedule.createCourtBooking(
        deskBooking({
          ...slot("2026-12-06", "09:00", "10:00"),
          priceMinor: 1000,
          priceReason: "League discount",
        }),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const priced = await api(ownerActor).schedule.createCourtBooking(
      deskBooking({
        ...slot("2026-12-06", "09:00", "10:00"),
        priceMinor: 1000,
        priceReason: "League discount",
      }),
    );
    expect(priced).toMatchObject({ totalMinor: 1000, priceSource: "staff" });
    expect(
      await count("audit_log", "action = 'court-booking.price-set-by-staff'"),
    ).toBe(1);
    // Giving paid time away is a price decision too.
    await expect(
      api(frontDesk).schedule.createCourtBooking(
        deskBooking({
          ...slot("2026-12-06", "11:00", "12:00"),
          paymentIntent: "free",
        }),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    // A changed price is never charged silently.
    await expect(
      api(frontDesk).schedule.createCourtBooking(
        deskBooking({
          ...slot("2026-12-06", "13:00", "14:00"),
          expectedTotalMinor: 3500,
        }),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("returns a payment link through the existing invitation checkout", async () => {
    state.stripe = true;
    await pg.exec(
      `UPDATE organizations SET stripe_account_id = 'acct_test', stripe_charges_enabled = true WHERE id = '${org}'`,
    );
    const created = await api(frontDesk).schedule.createCourtBooking(
      deskBooking({ paymentIntent: "send-payment-link" }),
    );
    expect(created.status).toBe("held");
    expect(created.paymentLink?.url).toMatch(
      /\/app\/booking-invite\/[0-9a-f-]{36}$/,
    );
    const row = await one<Record<string, unknown>>(
      `select b.payment_mode, b.participant_target, b.hold_expires_at, p.role, p.status, p.share_amount_minor, b.total_amount_minor
         from court_bookings b join court_booking_participants p on p.booking_id = b.id where b.id = $1`,
      [created.id],
    );
    expect(row).toMatchObject({
      payment_mode: "split",
      participant_target: 1,
      role: "player",
      status: "invited",
    });
    // The link total includes the consumer fees the player checkout adds.
    expect(row.share_amount_minor).toBe(row.total_amount_minor);
    expect(Number(row.total_amount_minor)).toBeGreaterThanOrEqual(6000);
    expect(new Date(row.hold_expires_at as string).toISOString()).toBe(
      "2026-12-01T14:00:00.000Z",
    );
  });

  it("answers not found for another club's court and refuses a coach", async () => {
    await expect(
      api(otherDesk).schedule.createCourtBooking(deskBooking()),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      api(frontDesk).schedule.createCourtBooking(
        deskBooking({ courtId: otherCourt }),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      api(coachActor).schedule.createCourtBooking(deskBooking()),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    // A person from outside the club is not found either.
    await pg.exec(
      `INSERT INTO people (id, display_name, handle) VALUES ('39000000-0000-4000-8000-000000000001', 'Stranger', 'stranger')`,
    );
    await expect(
      api(frontDesk).schedule.createCourtBooking(
        deskBooking({ personId: "39000000-0000-4000-8000-000000000001" }),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("moving a court booking", () => {
  it("reprices an unpaid desk order only with confirmation, tells nobody, and undoes", async () => {
    const created = await api(frontDesk).schedule.createCourtBooking(
      deskBooking({ personId: child }),
    );
    const target = slot("2026-12-04", "20:00", "21:00", courtB);
    const preview = await api(frontDesk).schedule.moveCourtBookingPreview({
      bookingId: created.id,
      ...target,
    });
    expect(preview).toMatchObject({
      available: true,
      price: {
        action: "reprice",
        currentTotalMinor: 6000,
        newTotalMinor: 4000,
        differenceMinor: -2000,
      },
      requiresPriceConfirmation: true,
      materialChange: true,
    });
    // The junior's verified guardian is in the draft; nothing is sent.
    expect(preview.draft.recipients).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ personId: child, role: "booker" }),
        expect.objectContaining({
          personId: guardian,
          role: "guardian",
          forName: "Mia Junior",
        }),
      ]),
    );
    await expect(
      api(frontDesk).schedule.moveCourtBooking({
        bookingId: created.id,
        ...target,
        notify: true,
        previewToken: preview.previewToken,
        idempotencyKey: key(),
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    const moved = await api(frontDesk).schedule.moveCourtBooking({
      bookingId: created.id,
      ...target,
      notify: true,
      previewToken: preview.previewToken,
      confirmedPriceChange: true,
      idempotencyKey: key(),
    });
    expect(moved).toMatchObject({
      courtId: courtB,
      repriced: true,
      sent: 0,
      toTell: 2,
    });
    expect(
      await one(`select total_minor from orders where id = $1`, [
        created.orderId,
      ]),
    ).toMatchObject({ total_minor: 4000 });
    // The old preview is stale now.
    await expect(
      api(frontDesk).schedule.moveCourtBooking({
        bookingId: created.id,
        ...target,
        notify: false,
        previewToken: preview.previewToken,
        confirmedPriceChange: true,
        idempotencyKey: key(),
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    // Undo: a second move back to where it was.
    await api(frontDesk).schedule.moveCourtBooking({
      bookingId: created.id,
      ...moved.undo,
      notify: false,
      confirmedPriceChange: true,
      idempotencyKey: key(),
    });
    expect(
      await one(
        `select court_id, starts_at from court_bookings where id = $1`,
        [created.id],
      ),
    ).toMatchObject({ court_id: courtA });
    expect(await count("audit_log", "action = 'court-booking.moved'")).toBe(2);
    expect(await count("messages")).toBe(0);
  });

  it("refuses a move onto something booked, re-checked when it writes", async () => {
    const first =
      await api(frontDesk).schedule.createCourtBooking(deskBooking());
    await api(frontDesk).schedule.createCourtBooking(
      deskBooking(slot("2026-12-04", "20:00", "21:00")),
    );
    await expect(
      api(frontDesk).schedule.moveCourtBooking({
        bookingId: first.id,
        ...slot("2026-12-04", "19:30", "21:00"),
        notify: false,
        confirmedPriceChange: true,
        idempotencyKey: key(),
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      api(otherDesk).schedule.moveCourtBookingPreview({
        bookingId: first.id,
        ...slot("2026-12-04", "09:00", "10:00"),
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("desk payments and cancellations", () => {
  it("records the whole amount once, with no ledger movement", async () => {
    const created =
      await api(frontDesk).schedule.createCourtBooking(deskBooking());
    const journalsBefore = await count("ledger_journals");
    await expect(
      api(frontDesk).schedule.recordDeskPayment({
        bookingId: created.id,
        amountMinor: 1000,
        method: "cash",
        confirmed: true,
        idempotencyKey: key(),
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      api(coachActor).schedule.recordDeskPayment({
        bookingId: created.id,
        amountMinor: 6000,
        method: "cash",
        confirmed: true,
        idempotencyKey: key(),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const input = {
      bookingId: created.id,
      amountMinor: 6000,
      method: "cash" as const,
      note: "Paid in notes",
      confirmed: true as const,
      idempotencyKey: key(),
    };
    const paid = await api(frontDesk).schedule.recordDeskPayment(input);
    expect(paid).toMatchObject({
      orderStatus: "paid",
      amountMinor: 6000,
      ledgerRecorded: false,
    });
    expect((await api(frontDesk).schedule.recordDeskPayment(input)).id).toBe(
      paid.id,
    );
    await expect(
      api(frontDesk).schedule.recordDeskPayment({
        ...input,
        idempotencyKey: key(),
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await count("ledger_journals")).toBe(journalsBefore);
    expect(await count("payments")).toBe(0);
    const money = await api(frontDesk).schedule.bookingPayments({
      from: "2026-12-04T00:00:00.000Z",
      to: "2026-12-06T00:00:00.000Z",
    });
    expect(money.bookings[0]).toMatchObject({
      paidMinor: 6000,
      paymentState: "paid",
      due: false,
    });
  });

  it("cancels exactly as previewed: desk money handed back, card money refunded", async () => {
    const created =
      await api(frontDesk).schedule.createCourtBooking(deskBooking());
    await api(frontDesk).schedule.recordDeskPayment({
      bookingId: created.id,
      amountMinor: 6000,
      method: "cash",
      confirmed: true,
      idempotencyKey: key(),
    });
    // An invited player who paid their share by card (the player path).
    await pg.exec(`
      INSERT INTO orders (id, organization_id, buyer_person_id, status, currency, subtotal_minor, total_minor, idempotency_key, stripe_payment_intent_id)
        VALUES ('66000000-0000-4000-8000-000000000001', '${org}', '${players[2]}', 'paid', 'USD', 2500, 2500, 'share-order', 'pi_test_1');
      INSERT INTO court_booking_participants (booking_id, person_id, invited_name, invite_token, role, status, share_amount_minor, order_id)
        VALUES ('${created.id}', '${players[2]}', 'Player 3', 'tok-share', 'player', 'paid', 2500, '66000000-0000-4000-8000-000000000001');
    `);
    const preview = await api(managerActor).schedule.cancelCourtBookingPreview({
      bookingId: created.id,
      refund: "by-policy",
    });
    expect(preview.policy.insideRefundWindow).toBe(true);
    expect(preview.needsMoneyPermission).toBe(true);
    expect(
      preview.lines.map((line) => [line.action, line.refundMinor]),
    ).toEqual([
      ["hand-back-at-desk", 6000],
      ["refund-card", 2500],
    ]);
    expect(preview.totalRefundMinor).toBe(8500);
    // Refunding money needs payments:write.
    await expect(
      api(frontDesk).schedule.cancelCourtBooking({
        bookingId: created.id,
        reason: "Player asked to cancel",
        refund: "by-policy",
        confirmed: true,
        previewToken: preview.previewToken,
        idempotencyKey: key(),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const result = await api(ownerActor).schedule.cancelCourtBooking({
      bookingId: created.id,
      reason: "Player asked to cancel",
      refund: "by-policy",
      confirmed: true,
      previewToken: preview.previewToken,
      idempotencyKey: key(),
    });
    // Preview = result, line by line.
    expect(result.lines.map(withoutOutcome)).toEqual(preview.lines);
    expect(result.totalRefundMinor).toBe(preview.totalRefundMinor);
    expect(result.lines.map((line) => line.outcome)).toEqual([
      "handed-back-recorded",
      expect.stringMatching(/^refund-(submitted|failed)$/),
    ]);
    expect(result.sent).toBe(0);
    expect(
      await one(`select status from orders where id = $1`, [created.orderId]),
    ).toMatchObject({ status: "refunded" });
    expect(
      await one(`select status from court_bookings where id = $1`, [
        created.id,
      ]),
    ).toMatchObject({ status: "cancelled" });
    // The slot is free again.
    await api(frontDesk).schedule.createCourtBooking(deskBooking());
  });

  it("cancels a player's app booking, paid by card, with its match and invited players", async () => {
    // What the Player app writes (court-checkout.ts): a confirmed booking,
    // a paid card order, the organizer and an invited player, and the
    // player match (pickup) linked to the court.
    const booking = "69000000-0000-4000-8000-000000000001";
    const order = "69000000-0000-4000-8000-000000000002";
    const organizerRow = "69000000-0000-4000-8000-000000000003";
    const invitedRow = "69000000-0000-4000-8000-000000000004";
    const match = "69000000-0000-4000-8000-000000000005";
    const startsAt = la("2026-12-05", "17:00");
    const endsAt = la("2026-12-05", "18:30");
    await pg.exec(`
      INSERT INTO orders (id, organization_id, buyer_person_id, status, currency, subtotal_minor, fee_total_minor, total_minor, idempotency_key, stripe_payment_intent_id, checkout_surface)
        VALUES ('${order}', '${org}', '${players[1]}', 'paid', 'USD', 6000, 450, 6450, 'app-order', 'pi_app_1', 'native');
      INSERT INTO court_bookings (id, organization_id, venue_id, court_id, person_id, order_id, starts_at, ends_at, status, payment_mode, total_amount_minor, funded_amount_minor, create_match, policy_snapshot, idempotency_key)
        VALUES ('${booking}', '${org}', '${venue}', '${courtA}', '${players[1]}', '${order}', '${startsAt}', '${endsAt}', 'confirmed', 'full', 6450, 6450, true, '{"title":"Reservation cancellation policy","markdown":"Cancel 24 hours ahead.","refundBeforeHours":24,"requireFullScroll":true}'::jsonb, 'app-booking');
      INSERT INTO court_booking_participants (id, booking_id, person_id, invited_name, invite_token, role, status, share_amount_minor, order_id, paid_at)
        VALUES ('${organizerRow}', '${booking}', '${players[1]}', 'Player 2', 'tok-org', 'organizer', 'paid', 6450, '${order}', '2026-11-30T12:00:00Z'),
               ('${invitedRow}', '${booking}', '${players[2]}', 'Player 3', 'tok-inv', 'player', 'accepted', 0, NULL, NULL);
      INSERT INTO pickup_sessions (id, host_person_id, organization_id, venue_id, court_booking_id, venue_label, title, starts_at, ends_at, capacity)
        VALUES ('${match}', '${players[1]}', '${org}', '${venue}', '${booking}', 'Pier Courts', 'Saturday 2s', '${startsAt}', '${endsAt}', 4);
      INSERT INTO pickup_participants (pickup_session_id, person_id, status, court_booking_participant_id)
        VALUES ('${match}', '${players[1]}', 'confirmed', '${organizerRow}'),
               ('${match}', '${players[2]}', 'confirmed', '${invitedRow}');
    `);
    const preview = await api(managerActor).schedule.cancelCourtBookingPreview({
      bookingId: booking,
      refund: "full",
      cause: "club",
    });
    expect(preview.lines).toEqual([
      expect.objectContaining({
        participantId: organizerRow,
        orderId: order,
        method: "card",
        action: "refund-card",
        paidMinor: 6450,
        refundMinor: 6450,
      }),
      expect.objectContaining({
        participantId: invitedRow,
        method: "nothing-paid",
        action: "release",
      }),
    ]);
    expect(preview.draft.recipients.map((row) => row.role)).toEqual([
      "booker",
      "player",
    ]);
    const result = await api(ownerActor).schedule.cancelCourtBooking({
      bookingId: booking,
      reason: "Court flooded",
      refund: "full",
      cause: "club",
      confirmed: true,
      previewToken: preview.previewToken,
      idempotencyKey: key(),
    });
    expect(result.lines.map(withoutOutcome)).toEqual(preview.lines);
    expect(result.sent).toBe(0);
    expect(
      await one(`select status from court_bookings where id = $1`, [booking]),
    ).toMatchObject({ status: "cancelled" });
    expect(
      await one(`select status from pickup_sessions where id = $1`, [match]),
    ).toMatchObject({ status: "cancelled" });
    expect(
      await count(
        "pickup_participants",
        "pickup_session_id = $1 and status <> 'cancelled'",
        [match],
      ),
    ).toBe(0);
    expect(
      await count("refund_records", "order_id = $1", [order]),
    ).toBeLessThanOrEqual(1);
    // The court is free for the next booking.
    await api(frontDesk).schedule.createCourtBooking(
      deskBooking(slot("2026-12-05", "17:00", "18:30")),
    );
  });

  it("keeps late cancellations by policy, but the club always refunds in full", async () => {
    const soon = new Date("2026-12-01T12:00:00.000Z");
    const created = await api(frontDesk, soon).schedule.createCourtBooking(
      deskBooking(slot("2026-12-01", "15:00", "16:00")),
    );
    await api(frontDesk, soon).schedule.recordDeskPayment({
      bookingId: created.id,
      amountMinor: 4000,
      method: "card-at-desk-external",
      confirmed: true,
      idempotencyKey: key(),
    });
    const late = await api(frontDesk, soon).schedule.cancelCourtBookingPreview({
      bookingId: created.id,
      refund: "by-policy",
    });
    expect(late.policy.insideRefundWindow).toBe(false);
    expect(late.lines[0]).toMatchObject({ action: "keep", refundMinor: 0 });
    expect(late.needsMoneyPermission).toBe(false);
    const club = await api(frontDesk, soon).schedule.cancelCourtBookingPreview({
      bookingId: created.id,
      refund: "none",
      cause: "club",
    });
    expect(club.lines[0]).toMatchObject({
      action: "hand-back-at-desk",
      refundMinor: 4000,
    });
    // Front desk may cancel a late booking that keeps its money.
    const kept = await api(frontDesk, soon).schedule.cancelCourtBooking({
      bookingId: created.id,
      reason: "No-show call",
      refund: "by-policy",
      confirmed: true,
      previewToken: late.previewToken,
      idempotencyKey: key(),
    });
    expect(kept.lines[0]).toMatchObject({ action: "keep", outcome: "kept" });
    expect(
      await one(`select status from orders where id = $1`, [created.orderId]),
    ).toMatchObject({ status: "paid" });
  });

  it("hides money from callers without a money permission", async () => {
    const scorekeeper = staff(players[4]!, ["scorekeeper"]);
    const created =
      await api(frontDesk).schedule.createCourtBooking(deskBooking());
    const preview = await api(scorekeeper).schedule.cancelCourtBookingPreview({
      bookingId: created.id,
      refund: "full",
    });
    expect(preview.totalRefundMinor).toBeUndefined();
    expect(preview.lines[0]?.refundMinor).toBeUndefined();
    await expect(
      api(scorekeeper).schedule.bookingPayments({
        from: "2026-12-04T00:00:00.000Z",
        to: "2026-12-06T00:00:00.000Z",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("removing blocks", () => {
  const schedule = "64000000-0000-4000-8000-000000000001";
  const closure = "67000000-0000-4000-8000-000000000001";
  const weekly = "67000000-0000-4000-8000-000000000002";

  beforeEach(async () => {
    await pg.exec(`
      INSERT INTO schedule_overrides (id, schedule_id, starts_at, ends_at, mode, reason, created_at)
        VALUES ('${closure}', '${schedule}', '${la("2026-12-05", "08:00")}', '${la("2026-12-05", "22:00")}', 'blocked', 'Weather hold', '2026-12-01T10:00:00Z');
      INSERT INTO sessions (id, venue_id, court_id, title, slug, starts_at, ends_at, timezone, status, capacity, updated_at)
        VALUES ('65000000-0000-4000-8000-000000000002', '${venue}', '${courtA}', 'Junior clinic', 'clinic-2', '${la("2026-12-05", "10:00")}', '${la("2026-12-05", "11:00")}', '${LA}', 'cancelled', 8, '2026-12-01T10:05:00Z');
      INSERT INTO schedule_blocks (id, schedule_id, weekday, starts_at_minute, ends_at_minute, mode, effective_from, effective_to)
        VALUES ('${weekly}', '${schedule}', 1, 720, 780, 'maintenance', '2026-12-01', '2026-12-31');
    `);
  });

  it("refuses to drop a closure silently when sessions were cancelled under it", async () => {
    const preview = await api(frontDesk).schedule.removeCalendarBlockPreview({
      id: closure,
    });
    expect(preview.cancelledUnder).toEqual([
      expect.objectContaining({ kind: "session", title: "Junior clinic" }),
    ]);
    await expect(
      api(frontDesk).schedule.removeCalendarBlock({
        id: closure,
        reason: "Weather cleared",
        idempotencyKey: key(),
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    const removed = await api(frontDesk).schedule.removeCalendarBlock({
      id: closure,
      reason: "Weather cleared",
      acknowledgeCancelled: true,
      idempotencyKey: key(),
    });
    expect(removed).toMatchObject({ removed: true, stillCancelled: 1 });
    expect(await count("schedule_overrides", "id = $1", [closure])).toBe(0);
    expect(
      await one(
        `select status from sessions where id = '65000000-0000-4000-8000-000000000002'`,
      ),
    ).toMatchObject({ status: "cancelled" });
    expect(await count("audit_log", "action = 'calendar.block-removed'")).toBe(
      1,
    );
    await expect(
      api(otherDesk).schedule.removeCalendarBlockPreview({
        id: weekly,
        scope: "all",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      api(coachActor).schedule.removeCalendarBlock({
        id: weekly,
        reason: "No",
        scope: "all",
        idempotencyKey: key(),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("removes one date, this and following, or every date of a weekly block", async () => {
    // Monday 14 December only.
    await api(frontDesk).schedule.removeCalendarBlock({
      id: weekly,
      scope: "this-occurrence",
      date: "2026-12-14",
      reason: "Court needed",
      idempotencyKey: key(),
    });
    const rows = await pg.query<{
      effective_from: string;
      effective_to: string;
    }>(
      `select effective_from::text, effective_to::text from schedule_blocks where mode = 'maintenance' order by effective_from`,
    );
    expect(rows.rows).toEqual([
      { effective_from: "2026-12-01", effective_to: "2026-12-13" },
      { effective_from: "2026-12-15", effective_to: "2026-12-31" },
    ]);
    // A booking on the removed Monday is no longer blocked; the next is.
    expect(
      (
        await api(frontDesk).schedule.createCourtBookingPreview({
          ...slot("2026-12-14", "12:00", "13:00"),
          personId: players[1]!,
          paymentIntent: "pay-at-desk",
        })
      ).available,
    ).toBe(true);
    expect(
      (
        await api(frontDesk).schedule.createCourtBookingPreview({
          ...slot("2026-12-21", "12:00", "13:00"),
          personId: players[1]!,
          paymentIntent: "pay-at-desk",
        })
      ).conflicts[0],
    ).toMatchObject({ what: "closed" });
    await expect(
      api(frontDesk).schedule.removeCalendarBlock({
        id: weekly,
        scope: "this-occurrence",
        date: "2026-12-15",
        reason: "Wrong day",
        idempotencyKey: key(),
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await api(frontDesk).schedule.removeCalendarBlock({
      id: weekly,
      scope: "this-and-following",
      date: "2026-12-07",
      reason: "Grooming moves to mornings",
      idempotencyKey: key(),
    });
    expect(
      await one(
        `select effective_to::text from schedule_blocks where id = $1`,
        [weekly],
      ),
    ).toMatchObject({ effective_to: "2026-12-06" });
  });
});

describe("attendance and the calendar's reads", () => {
  it("lets a coach check people in on their own session only", async () => {
    await pg.exec(`
      INSERT INTO sessions (id, venue_id, court_id, coach_person_id, title, slug, starts_at, ends_at, timezone, status, capacity)
        VALUES ('65000000-0000-4000-8000-000000000003', '${venue}', '${courtA}', '${coach}', 'Lesson', 'lesson-1', '${la("2026-12-01", "10:00")}', '${la("2026-12-01", "11:00")}', '${LA}', 'published', 2),
               ('65000000-0000-4000-8000-000000000004', '${venue}', '${courtB}', NULL, 'Other lesson', 'lesson-2', '${la("2026-12-01", "10:00")}', '${la("2026-12-01", "11:00")}', '${LA}', 'published', 2);
      INSERT INTO registrations (id, session_id, person_id, status, eligibility_decision)
        VALUES ('68000000-0000-4000-8000-000000000001', '65000000-0000-4000-8000-000000000003', '${players[1]}', 'confirmed', '{}'::jsonb),
               ('68000000-0000-4000-8000-000000000002', '65000000-0000-4000-8000-000000000004', '${players[2]}', 'confirmed', '{}'::jsonb);
    `);
    await expect(
      api(coachActor).recordSessionAttendance({
        registrationId: "68000000-0000-4000-8000-000000000001",
        status: "attended",
        idempotencyKey: key(),
      }),
    ).resolves.toMatchObject({ status: "attended" });
    await expect(
      api(coachActor).recordSessionAttendance({
        registrationId: "68000000-0000-4000-8000-000000000002",
        status: "attended",
        idempotencyKey: key(),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    // Front desk still can; a coach of another club cannot.
    await expect(
      api(frontDesk).recordSessionAttendance({
        registrationId: "68000000-0000-4000-8000-000000000002",
        status: "attended",
        idempotencyKey: key(),
      }),
    ).resolves.toMatchObject({ status: "attended" });
    await expect(
      api(staff(coach, ["coach"], otherOrg)).recordSessionAttendance({
        registrationId: "68000000-0000-4000-8000-000000000001",
        status: "attended",
        idempotencyKey: key(),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("reads the calendar's money in a fixed number of queries", async () => {
    async function counted() {
      let queries = 0;
      state.db = drizzle(pg, {
        schema,
        logger: { logQuery: () => (queries += 1) },
      });
      try {
        const result = await bookingPayments(
          {
            actor: frontDesk,
            organizationId: org,
            requestId: "count",
            now,
          },
          {
            from: "2026-12-03T00:00:00.000Z",
            to: "2026-12-10T00:00:00.000Z",
          },
        );
        return { rows: result.bookings.length, queries };
      } finally {
        state.db = db;
      }
    }
    await api(frontDesk).schedule.createCourtBooking(deskBooking());
    const one = await counted();
    for (const date of ["2026-12-05", "2026-12-06", "2026-12-07"]) {
      await api(frontDesk).schedule.createCourtBooking(
        deskBooking(slot(date, "09:00", "10:00")),
      );
    }
    const four = await counted();
    expect(one.rows).toBe(1);
    expect(four.rows).toBe(4);
    expect(four.queries).toBe(one.queries);
    expect(four.queries).toBeLessThanOrEqual(4);
  });

  it("reads every coach's availability for a range in one call", async () => {
    const range = await api(frontDesk).teamAvailability.range({
      from: "2026-12-01",
      to: "2026-12-07",
    });
    expect(range.staff).toHaveLength(1);
    expect(range.staff[0]).toMatchObject({ personId: coach });
    expect(range.staff[0]!.schedules[0]!.windows.length).toBeGreaterThan(0);
    await expect(
      api(frontDesk).teamAvailability.range({
        from: "2026-12-01",
        to: "2027-06-01",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
