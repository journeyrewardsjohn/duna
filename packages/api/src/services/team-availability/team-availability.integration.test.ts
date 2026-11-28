/**
 * Team availability (B3a) against an in-memory Postgres with every
 * migration: the legacy copy, schedule changeover, time off approval opening
 * coverage, ranked substitutes, a confirmed reassignment, the coverage grid
 * and the legacy editor round trip.
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
}));

import { availabilityFor } from "@duna/scheduling";
import {
  academy,
  applyAllMigrations,
  createCatalogTestDatabase,
  seedAcademy,
} from "../../catalog-booking.test-support";
import type { ApiActor } from "../../context";
import {
  teamAvailabilityCoverageGridSchema,
  teamAvailabilityCoverageRequestSchema,
  teamAvailabilityStaffSchema,
} from "../../contracts/team-availability";
import {
  addBlackout,
  coverageAction,
  coverageGrid,
  coverageRequests,
  decideTimeOff,
  legacyAvailabilityView,
  loadMemberAvailability,
  loadOrganizationStaff,
  migrateLegacyStaffAvailability,
  requestTimeOff,
  saveFromLegacyEditor,
  staffAvailabilityPage,
  transitionSchedule,
  upsertSchedule,
} from "./index";
import type { TeamActor } from "./shared";

const { pg, db } = createCatalogTestDatabase();
state.db = db;

const ids = {
  coachB: "20000000-0000-4000-8000-0000000000b1",
  program: "60000000-0000-4000-8000-000000000001",
  session: "60000000-0000-4000-8000-000000000002",
  event: "60000000-0000-4000-8000-000000000003",
  venue: "60000000-0000-4000-8000-000000000004",
};
const now = new Date("2026-12-01T12:00:00.000Z");

function actor(
  personId: string,
  scopes: string[],
  roles: string[] = [],
): ApiActor {
  return {
    personId,
    displayName: "Tester",
    roles: roles as ApiActor["roles"],
    organizationId: academy.org,
    scopes,
    ageBand: "adult",
    isDemo: false,
  };
}
const owner: TeamActor = {
  actor: actor(academy.owner, ["*"], ["owner"]),
  organizationId: academy.org,
  requestId: "req-owner",
  now,
};
const coachA: TeamActor = {
  actor: actor(academy.coach, ["members:read"], ["coach"]),
  organizationId: academy.org,
  requestId: "req-coach",
  now,
};

async function profileId(personId: string): Promise<string> {
  const result = await pg.query<{ id: string }>(
    `SELECT id FROM organization_staff_profiles WHERE person_id = '${personId}'`,
  );
  return result.rows[0]!.id;
}

beforeAll(() => applyAllMigrations(pg), 120_000);
afterAll(() => pg.close());
beforeEach(async () => {
  await seedAcademy(pg);
  await pg.exec(`
    INSERT INTO people (id, display_name, handle) VALUES ('${ids.coachB}', 'Bea Coach', 'bea');
    INSERT INTO organization_memberships (organization_id, person_id, role) VALUES ('${academy.org}', '${ids.coachB}', 'coach');
    INSERT INTO organization_staff_profiles (organization_id, person_id, staff_role) VALUES ('${academy.org}', '${ids.coachB}', 'coach');
    INSERT INTO venues (id, organization_id, name, slug, timezone, country_code)
      VALUES ('${ids.venue}', '${academy.org}', 'Main Beach', 'main-beach', 'UTC', 'US');
    INSERT INTO programs (id, organization_id, slug, title, kind) VALUES ('${ids.program}', '${academy.org}', 'clinics', 'Clinics', 'clinic');
    INSERT INTO sessions (id, program_id, venue_id, coach_person_id, title, slug, starts_at, ends_at, timezone, status, capacity)
      VALUES ('${ids.session}', '${ids.program}', '${ids.venue}', '${academy.coach}', 'Thursday clinic', 'thursday-clinic',
        '2026-12-10T17:00:00.000Z', '2026-12-10T18:00:00.000Z', 'UTC', 'published', 8);
    INSERT INTO training_events (id, organization_id, kind, title, starts_at, ends_at, timezone, coach_person_id)
      VALUES ('${ids.event}', '${academy.org}', 'practice', 'Friday juniors', '2026-12-11T16:00:00.000Z', '2026-12-11T17:30:00.000Z', 'UTC', '${academy.coach}');
  `);
});

async function giveBeaTermAndHolidays() {
  const bea = await profileId(ids.coachB);
  const beaActor: TeamActor = {
    ...coachA,
    actor: actor(ids.coachB, ["members:read"], ["coach"]),
  };
  const term = await upsertSchedule(beaActor, {
    staffProfileId: bea,
    name: "School term",
    effectiveFrom: "2026-11-01",
    timezone: "UTC",
    windows: [1, 2, 3, 4, 5].map((weekday) => ({
      weekday,
      startsAt: "15:00",
      endsAt: "19:00",
      kind: "coaching" as const,
    })),
  });
  const holidays = await upsertSchedule(beaActor, {
    staffProfileId: bea,
    name: "Holidays",
    effectiveFrom: "2026-12-19",
    timezone: "UTC",
    windows: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      weekday,
      startsAt: "08:00",
      endsAt: "12:00",
      kind: "coaching" as const,
    })),
  });
  await transitionSchedule(beaActor, { scheduleId: term.id, to: "active" });
  await transitionSchedule(beaActor, { scheduleId: holidays.id, to: "active" });
  return { bea, term, holidays };
}

describe("legacy availability", () => {
  it("copies what the club entered once, and the script is idempotent", async () => {
    const coachProfile = await profileId(academy.coach);
    const page = teamAvailabilityStaffSchema.parse(
      await staffAvailabilityPage(owner, coachProfile),
    );
    expect(page.schedules).toHaveLength(1);
    expect(page.schedules[0]).toMatchObject({
      name: "Weekly availability",
      status: "fallback",
    });
    expect(page.schedules[0]!.windows).toHaveLength(7);
    await expect(
      migrateLegacyStaffAvailability({ organizationId: academy.org }),
    ).resolves.toEqual({
      copied: 0,
      alreadyCopied: 1,
    });
    const again = await staffAvailabilityPage(owner, coachProfile);
    expect(again.schedules).toHaveLength(1);
  });

  it("round-trips the old editor through the tables", async () => {
    const [coach] = await loadOrganizationStaff(academy.org, {
      ids: [await profileId(academy.coach)],
    });
    const view = await legacyAvailabilityView([coach!], "UTC");
    // Not copied yet: the legacy value is shown as-is.
    expect(view.get(coach!.id)).toHaveLength(7);
    await db.transaction((transaction) =>
      saveFromLegacyEditor(transaction as never, {
        staff: coach!,
        timezone: "UTC",
        windows: [{ weekday: 4, startsAt: "09:00", endsAt: "12:00" }],
        blackouts: [
          { startsOn: "2026-12-24", startsAt: "00:00", endsAt: "23:59" },
        ],
        actorPersonId: academy.owner,
        requestId: "req-editor",
        now,
      }),
    );
    const after = (await legacyAvailabilityView([coach!], "UTC")).get(
      coach!.id,
    )!;
    expect(after.filter((entry) => entry.kind !== "blackout")).toEqual([
      expect.objectContaining({
        weekday: 4,
        startsAt: "09:00",
        endsAt: "12:00",
      }),
    ]);
    expect(after.filter((entry) => entry.kind === "blackout")).toEqual([
      {
        kind: "blackout",
        startsOn: "2026-12-24",
        startsAt: "00:00",
        endsAt: "23:59",
      },
    ]);
    // Saving the same view again changes nothing.
    await db.transaction((transaction) =>
      saveFromLegacyEditor(transaction as never, {
        staff: coach!,
        timezone: "UTC",
        windows: after.filter((entry) => entry.kind !== "blackout") as never,
        blackouts: [
          { startsOn: "2026-12-24", startsAt: "00:00", endsAt: "23:59" },
        ],
        actorPersonId: academy.owner,
        requestId: "req-editor-2",
        now,
      }),
    );
    expect(
      (await legacyAvailabilityView([coach!], "UTC")).get(coach!.id),
    ).toEqual(after);
  });
});

describe("schedules", () => {
  it("changes over to the planned successor and ends the predecessor the day before", async () => {
    const { bea, term } = await giveBeaTermAndHolidays();
    const page = await staffAvailabilityPage(owner, bea);
    expect(
      page.schedules.find((schedule) => schedule.id === term.id),
    ).toMatchObject({
      status: "active",
      effectiveTo: "2026-12-18",
    });
    const [staff] = await loadOrganizationStaff(academy.org, { ids: [bea] });
    const range = {
      startsAt: new Date("2026-12-18T00:00:00.000Z"),
      endsAt: new Date("2026-12-20T00:00:00.000Z"),
    };
    const member = (
      await loadMemberAvailability({
        organizationId: academy.org,
        staff: [staff!],
        range,
        timezone: "UTC",
      })
    ).get(bea)!;
    const result = availabilityFor(
      { staffProfileId: bea },
      {
        startsAt: range.startsAt.toISOString(),
        endsAt: range.endsAt.toISOString(),
      },
      member.inputs,
    );
    expect(result.free.map((interval) => interval.startsAt)).toEqual([
      "2026-12-18T15:00:00.000Z",
      "2026-12-19T08:00:00.000Z",
    ]);
  });

  it("lets only the member or a manager edit availability", async () => {
    const bea = await profileId(ids.coachB);
    await expect(
      upsertSchedule(coachA, {
        staffProfileId: bea,
        name: "Not mine",
        effectiveFrom: "2026-12-01",
        timezone: "UTC",
        windows: [],
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("stores an overnight window and gives it back whole", async () => {
    const bea = await profileId(ids.coachB);
    const saved = await upsertSchedule(owner, {
      staffProfileId: bea,
      name: "Late shift",
      effectiveFrom: "2026-12-01",
      timezone: "UTC",
      windows: [
        { weekday: 5, startsAt: "20:00", endsAt: "02:00", kind: "office" },
      ],
    });
    expect(saved.status).toBe("draft");
    expect(saved.windows).toEqual([
      expect.objectContaining({
        weekday: 5,
        startsAt: "20:00",
        endsAt: "02:00",
        kind: "office",
      }),
    ]);
  });
});

describe("time off and coverage", () => {
  it("approval opens coverage with ranked substitutes; assigning reassigns with an audit row", async () => {
    await giveBeaTermAndHolidays();
    const coachProfile = await profileId(academy.coach);
    const requested = await requestTimeOff(coachA, {
      staffProfileId: coachProfile,
      startsAt: "2026-12-09T00:00:00.000Z",
      endsAt: "2026-12-12T00:00:00.000Z",
      reason: "Family",
    });
    expect(requested).toMatchObject({
      status: "requested",
      sessionsNeedingCover: 2,
    });
    await expect(
      decideTimeOff(coachA, { timeOffId: requested.id, decision: "approved" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const approved = await decideTimeOff(owner, {
      timeOffId: requested.id,
      decision: "approved",
    });
    expect(approved.status).toBe("approved");
    expect(approved.decidedAt).toBeDefined();

    const { requests } = await coverageRequests(owner, { status: ["open"] });
    expect(requests.map((request) => request.title).sort()).toEqual([
      "Friday juniors",
      "Thursday clinic",
    ]);
    const clinic = teamAvailabilityCoverageRequestSchema.parse(
      requests.find((request) => request.title === "Thursday clinic"),
    );
    expect(clinic).toMatchObject({
      reason: "time-off",
      originalStaff: { personId: academy.coach },
    });
    expect(clinic.offers.map((offer) => offer.staff.personId)).toEqual([
      ids.coachB,
    ]);
    expect(clinic.offers[0]!.rationale).toContain("Free for the whole session");

    await expect(
      coverageAction(coachA, {
        action: "assign",
        requestId: clinic.id,
        offerId: clinic.offers[0]!.id,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const asked = await coverageAction(owner, {
      action: "ask",
      requestId: clinic.id,
      offerId: clinic.offers[0]!.id,
    });
    expect(asked).toMatchObject({
      status: "asking",
      offers: [{ status: "asked" }],
    });
    const covered = await coverageAction(owner, {
      action: "assign",
      requestId: clinic.id,
      offerId: clinic.offers[0]!.id,
    });
    expect(covered).toMatchObject({
      status: "covered",
      coveredBy: { personId: ids.coachB },
      offers: [{ status: "assigned" }],
    });
    const session = await pg.query<{ coach_person_id: string }>(
      `SELECT coach_person_id FROM sessions WHERE id = '${ids.session}'`,
    );
    expect(session.rows[0]!.coach_person_id).toBe(ids.coachB);
    const audit = await pg.query(
      `SELECT * FROM audit_log WHERE action = 'staff-coverage.assigned' AND entity_id = '${ids.session}'`,
    );
    expect(audit.rows).toHaveLength(1);

    // The juniors practice (Friday 16:00–17:30) also fits Bea's term hours.
    const juniors = requests.find(
      (request) => request.title === "Friday juniors",
    )!;
    await coverageAction(owner, {
      action: "assign",
      requestId: juniors.id,
      offerId: juniors.offers[0]!.id,
    });
    const coaches = await pg.query<{ person_id: string; role: string }>(
      `SELECT person_id, role FROM training_event_coaches WHERE training_event_id = '${ids.event}'`,
    );
    expect(coaches.rows).toEqual([
      { person_id: ids.coachB, role: "substitute" },
    ]);
    // Nothing left needs cover.
    const page = await staffAvailabilityPage(owner, coachProfile);
    expect(page.timeOff[0]!.sessionsNeedingCover).toBe(0);
  });

  it("a blackout with nobody free leaves the request nobody-free; cancel closes it", async () => {
    const coachProfile = await profileId(academy.coach);
    await addBlackout(coachA, {
      staffProfileId: coachProfile,
      startsAt: "2026-12-10T00:00:00.000Z",
      endsAt: "2026-12-11T00:00:00.000Z",
      reason: "Sick",
    });
    const { requests } = await coverageRequests(owner, {});
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      status: "nobody-free",
      reason: "blackout",
      offers: [],
    });
    const cancelled = await coverageAction(owner, {
      action: "cancel",
      requestId: requests[0]!.id,
    });
    expect(cancelled.status).toBe("cancelled");
    await expect(
      coverageAction(owner, { action: "cancel", requestId: requests[0]!.id }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("builds the coverage grid for a week", async () => {
    await giveBeaTermAndHolidays();
    const grid = teamAvailabilityCoverageGridSchema.parse(
      await coverageGrid(owner, "2026-12-06"),
    );
    const thursdayFive = grid.cells.find(
      (cell) => cell.weekday === 4 && cell.hour === 17,
    );
    // The clinic and the booked group lesson both run at 17:00; their coach
    // (legacy all-week hours) and Bea are both available.
    expect(thursdayFive).toMatchObject({
      sessions: 2,
      coachesFree: 2,
      short: false,
    });
    const fridayFour = grid.cells.find(
      (cell) => cell.weekday === 5 && cell.hour === 16,
    );
    expect(fridayFour?.sessions).toBe(1);
  });
});
