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
import { startCatalogCheckout } from "../../catalog-checkout";
import { cancelCatalogSessionBooking } from "../../catalog-session-bookings";
import { processDueParticipation } from "./engine";
import {
  createParticipationInvite,
  resolveParticipationInvite,
} from "./invites";
import { mergeParticipationSessions } from "./merge";
import { participationQuote } from "./player";
import {
  participationRulesToReview,
  setSubjectParticipationRule,
} from "./subject-rules";
import { evaluateSubjectParticipation } from "./subjects";
import {
  joinParticipationWaitlist,
  leaveParticipationWaitlist,
} from "./waitlist";

const { pg, db } = createCatalogTestDatabase();
state.db = db;
const {
  org,
  owner,
  players,
  item,
  variant,
  occurrence,
  secondOccurrence,
  now,
} = academy;
const SUBJECT = "catalog-session-occurrence";
const pickup = "71000000-0000-4000-8000-000000000001";
const legacySession = "72000000-0000-4000-8000-000000000001";
const program = "73000000-0000-4000-8000-000000000001";

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

async function bookingId(orderId: string) {
  const result = await pg.query<{ id: string }>(
    `select id from catalog_fulfillments where order_id = $1`,
    [orderId],
  );
  return result.rows[0]!.id;
}

async function credits(personId: string) {
  return (await walletState(pg, personId))?.cached;
}

beforeAll(() => applyAllMigrations(pg), 120_000);
afterAll(() => pg.close());
beforeEach(async () => {
  await seedAcademy(pg);
  await pg.exec(`
    INSERT INTO programs (id, organization_id, title, slug, kind)
      VALUES ('${program}', '${org}', 'Juniors', 'juniors', 'clinic');
  `);
});

describe("waitlist (PART-4)", () => {
  beforeEach(async () => {
    await configureParticipation(pg, { minParticipants: 1, waitlist: true }, 2);
    await pg.query(
      `update catalog_session_occurrences set capacity = 2 where id = $1`,
      [occurrence],
    );
  });

  it("queues people for a full session and offers a freed place with a hold", async () => {
    const first = await book(players[0]!);
    await book(players[1]!);
    await expect(book(players[2]!)).rejects.toThrow("enough open places");
    const joined = await joinParticipationWaitlist({
      actor: testActor(players[2]!),
      subjectType: SUBJECT,
      subjectId: occurrence,
      quantity: 1,
      now,
    });
    expect(joined).toMatchObject({ position: 1, status: "waiting" });
    const second = await joinParticipationWaitlist({
      actor: testActor(players[3]!),
      subjectType: SUBJECT,
      subjectId: occurrence,
      quantity: 1,
      now,
    });
    expect(second.position).toBe(2);
    // A place opens: the first in line gets an offer that holds it.
    await cancelCatalogSessionBooking({
      actor: testActor(players[0]!),
      bookingId: await bookingId(first.orderId),
      requestId: crypto.randomUUID(),
      now,
    });
    const quote = await participationQuote({
      actor: testActor(players[2]!),
      catalogItemId: item,
      catalogSessionOccurrenceId: occurrence,
      quantity: 1,
      paymentMethod: "credit",
      now,
    });
    expect(quote.waitlist).toMatchObject({ status: "offered", position: 1 });
    expect(quote.waitlist?.holdExpiresAt).toBe(
      new Date(now.getTime() + 2 * 3_600_000).toISOString(),
    );
    // Nobody else can take the held place.
    await expect(book(players[3]!)).rejects.toThrow("enough open places");
    expect(await book(players[2]!)).toMatchObject({ orderStatus: "paid" });
    const status = await pg.query<{ status: string }>(
      `select status from participation_waitlist_entries where person_id = $1`,
      [players[2]],
    );
    expect(status.rows[0]!.status).toBe("accepted");
  });

  it("an unanswered offer expires and passes to the next person", async () => {
    const first = await book(players[0]!);
    await book(players[1]!);
    for (const player of [players[2]!, players[3]!]) {
      await joinParticipationWaitlist({
        actor: testActor(player),
        subjectType: SUBJECT,
        subjectId: occurrence,
        quantity: 1,
        now,
      });
    }
    await cancelCatalogSessionBooking({
      actor: testActor(players[0]!),
      bookingId: await bookingId(first.orderId),
      requestId: crypto.randomUUID(),
      now,
    });
    const later = new Date(now.getTime() + 3 * 3_600_000);
    const run = await processDueParticipation({ now: later });
    expect(run).toMatchObject({ waitlistExpired: 1, waitlistOffered: 1 });
    const rows = await pg.query<{ person_id: string; status: string }>(
      `select person_id, status from participation_waitlist_entries order by position`,
    );
    expect(rows.rows.map((row) => row.status)).toEqual(["expired", "offered"]);
    await leaveParticipationWaitlist({
      actor: testActor(players[3]!),
      entryId: (
        await pg.query<{ id: string }>(
          `select id from participation_waitlist_entries where person_id = $1`,
          [players[3]],
        )
      ).rows[0]!.id,
      now: later,
    });
    expect(await book(players[4]!, { now: later })).toMatchObject({
      orderStatus: "paid",
    });
  });

  it("refuses to queue someone when a place is open", async () => {
    await book(players[0]!);
    await expect(
      joinParticipationWaitlist({
        actor: testActor(players[1]!),
        subjectType: SUBJECT,
        subjectId: occurrence,
        quantity: 1,
        now,
      }),
    ).rejects.toThrow("There's a place now");
  });
});

describe("invite links", () => {
  it("lets a booked adult share a session and shows no names", async () => {
    await configureParticipation(
      pg,
      { minParticipants: 3, minimumPolicy: "cancel" },
      2,
    );
    await expect(
      createParticipationInvite({
        actor: testActor(players[0]!),
        subjectType: SUBJECT,
        subjectId: occurrence,
        now,
      }),
    ).rejects.toThrow("Book a place first");
    await book(players[0]!);
    await expect(
      createParticipationInvite({
        actor: testActor(players[0]!, undefined, "teen"),
        subjectType: SUBJECT,
        subjectId: occurrence,
        now,
      }),
    ).rejects.toThrow("parent or guardian");
    const link = await createParticipationInvite({
      actor: testActor(players[0]!),
      subjectType: SUBJECT,
      subjectId: occurrence,
      now,
    });
    const again = await createParticipationInvite({
      actor: testActor(players[0]!),
      subjectType: SUBJECT,
      subjectId: occurrence,
      now,
    });
    expect(again.code).toBe(link.code);
    const landing = await resolveParticipationInvite({ code: link.code, now });
    expect(landing).toMatchObject({
      title: "Group training",
      displayState: "needs-players",
      needs: 2,
      status: "Needs 2 more",
    });
    expect(JSON.stringify(landing)).not.toContain("Player 1");
    const opened = await pg.query<{ opened_count: number }>(
      `select opened_count from participation_invites where code = $1`,
      [link.code],
    );
    expect(opened.rows[0]!.opened_count).toBe(1);
  });
});

describe("merging two thin sessions", () => {
  it("moves bookings into the other session and refunds anyone already there", async () => {
    await configureParticipation(
      pg,
      { minParticipants: 3, minimumPolicy: "cancel" },
      2,
    );
    await book(players[0]!);
    await book(players[1]!);
    await book(players[1]!, { catalogSessionOccurrenceId: secondOccurrence });
    const result = await mergeParticipationSessions({
      organizationId: org,
      actorPersonId: owner,
      fromOccurrenceId: occurrence,
      intoOccurrenceId: secondOccurrence,
      requestId: crypto.randomUUID(),
      now,
    });
    expect(result).toMatchObject({ moved: 1, refunded: 1 });
    // Player 2 held two places: the duplicate came back.
    expect(await credits(players[1]!)).toBe(8);
    expect(await credits(players[0]!)).toBe(8);
    const moved = await pg.query<{ catalog_session_occurrence_id: string }>(
      `select catalog_session_occurrence_id from catalog_fulfillments
        where person_id = $1 and status in ('ready','fulfilled','pending','held')`,
      [players[0]],
    );
    expect(moved.rows[0]!.catalog_session_occurrence_id).toBe(secondOccurrence);
    const decision = await pg.query<{
      outcome: string;
      cancel_reason: string;
      merged_into_subject_id: string;
    }>(
      `select outcome, cancel_reason, merged_into_subject_id from participation_decisions where subject_id = $1`,
      [occurrence],
    );
    expect(decision.rows[0]).toEqual({
      outcome: "cancelled-by-club",
      cancel_reason: "merged",
      merged_into_subject_id: secondOccurrence,
    });
    const notices = await pg.query<{ kind: string }>(
      `select kind from participation_notices where subject_id = $1 and kind in ('cancelled-club', 'moved') order by kind`,
      [occurrence],
    );
    // Player 1 moved; player 2's duplicate place was cancelled and refunded.
    expect(notices.rows.map((row) => row.kind)).toEqual([
      "cancelled-club",
      "moved",
    ]);
  });
});

describe("pickups and event sessions on the same engine", () => {
  beforeEach(async () => {
    await pg.exec(`
      INSERT INTO pickup_sessions (id, host_person_id, venue_label, title, starts_at, ends_at, capacity)
        VALUES ('${pickup}', '${players[0]}', 'Beach', 'Saturday pickup',
          '2026-12-12T16:00:00Z', '2026-12-12T18:00:00Z', 6);
      INSERT INTO pickup_participants (pickup_session_id, person_id, status)
        VALUES ('${pickup}', '${players[0]}', 'confirmed'),
               ('${pickup}', '${players[1]}', 'confirmed'),
               ('${pickup}', '${players[2]}', 'confirmed');
    `);
  });

  it("cancels a player-hosted pickup under its minimum at the lock (worked example 3)", async () => {
    const saved = await setSubjectParticipationRule({
      hostPersonId: players[0]!,
      actorPersonId: players[0]!,
      subjectType: "pickup-session",
      subjectId: pickup,
      rules: {
        minParticipants: 4,
        minimumPolicy: "cancel",
        lockMinutesBeforeStart: 720,
      },
      requestId: crypto.randomUUID(),
      now,
    });
    expect(saved.issues).toEqual([]);
    expect(
      await evaluateSubjectParticipation({
        subjectType: "pickup-session",
        subjectId: pickup,
        now: new Date("2026-12-12T03:00:00Z"),
      }),
    ).toMatchObject({ status: "not-due" });
    const atLock = new Date("2026-12-12T04:00:00Z");
    const runs = await Promise.all([
      processDueParticipation({ now: atLock }),
      processDueParticipation({ now: atLock }),
    ]);
    expect(runs.every((run) => run.failed === 0)).toBe(true);
    const row = await pg.query<{ status: string }>(
      `select status from pickup_sessions where id = $1`,
      [pickup],
    );
    expect(row.rows[0]!.status).toBe("cancelled");
    const notices = await pg.query<{ kind: string }>(
      `select kind from participation_notices where subject_id = $1 order by kind`,
      [pickup],
    );
    expect(notices.rows.map((entry) => entry.kind)).toEqual([
      "cancelled-low",
      "cancelled-low",
      "cancelled-low",
      "staff-cancelled",
    ]);
  });

  it("a legacy minimum runs (decision 7) and appears under Rules to review", async () => {
    await pg.exec(`
      INSERT INTO sessions (id, program_id, title, slug, starts_at, ends_at, timezone, status, capacity, minimum_capacity,
          participation, participation_review_state)
        VALUES ('${legacySession}', '${program}', 'Junior clinic', 'junior-clinic', '2026-12-12T16:00:00Z', '2026-12-12T18:00:00Z',
          'UTC', 'published', 8, 4,
          '{"version": 2, "unit": "player", "minParticipants": 4, "minimumPolicy": "run", "waitlist": true, "tiers": []}', 'pending');
    `);
    const review = await participationRulesToReview({
      organizationId: org,
      now,
    });
    expect(review.map((entry) => entry.subjectId)).toEqual([legacySession]);
    expect(
      await evaluateSubjectParticipation({
        subjectType: "session",
        subjectId: legacySession,
        now: new Date("2026-12-11T17:00:00Z"),
      }),
    ).toMatchObject({
      status: "decided",
      outcome: "run-under-minimum",
      groupSize: 0,
    });
    const session = await pg.query<{ status: string }>(
      `select status from sessions where id = $1`,
      [legacySession],
    );
    expect(session.rows[0]!.status).toBe("published");
  });
});
