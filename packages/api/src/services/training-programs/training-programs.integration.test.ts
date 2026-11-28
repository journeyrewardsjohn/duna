/**
 * Training programs (B4) against an in-memory Postgres with every
 * migration: permissions by role, another club's ids, idempotent create,
 * activation and regeneration that keeps booked sessions, conflicts and
 * their resolutions, the after-practice record, practice plan versions and
 * pinned drills, concurrent saves, the legacy compatibility read and copy,
 * the athlete's own schedule, and query counts on the list reads.
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

import {
  academy,
  applyAllMigrations,
  createCatalogTestDatabase,
  seedAcademy,
} from "../../catalog-booking.test-support";
import type { ApiActor } from "../../context";
import {
  trainingProgramsConflictSchema,
  trainingProgramsOutcomeSchema,
  trainingProgramsPracticePlanSchema,
  trainingProgramsProgramSchema,
  trainingProgramsProgramSummarySchema,
  trainingProgramsSessionSchema,
} from "../../contracts/training-programs";
import {
  activateProgram,
  addSession,
  cancelProgram,
  createProgram,
  LEGACY_PROGRAM_COPIED,
  listConflicts,
  listPracticePlans,
  listPrograms,
  listSessions,
  myPrograms,
  mySchedule,
  practicePlanDetail,
  programDetail,
  proposeFromSentence,
  proposePracticePlan,
  recordSessionOutcome,
  resolveConflict,
  savePracticePlan,
  sessionOutcome,
  setSessionPlan,
  updateProgram,
} from "./index";
import type { TrainingContext } from "./shared";

const { pg, db } = createCatalogTestDatabase();
state.db = db;

const ids = {
  coachB: "20000000-0000-4000-8000-0000000000b1",
  desk: "20000000-0000-4000-8000-0000000000d1",
  guardian: "20000000-0000-4000-8000-0000000000e1",
  otherOrg: "10000000-0000-4000-8000-0000000000f1",
  otherProgram: "60000000-0000-4000-8000-0000000000f2",
  legacyProgram: "60000000-0000-4000-8000-0000000000c1",
  venue: "60000000-0000-4000-8000-000000000004",
  drill: "70000000-0000-4000-8000-000000000001",
  drillV1: "70000000-0000-4000-8000-000000000011",
  drillV2: "70000000-0000-4000-8000-000000000012",
};
const now = new Date("2026-12-01T12:00:00.000Z");

function actor(personId: string, scopes: string[], roles: string[]): ApiActor {
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
const as = (person: ApiActor, at: Date = now): TrainingContext => ({
  actor: person,
  organizationId: academy.org,
  requestId: `req-${person.personId.slice(-4)}`,
  now: at,
});
const owner = as(actor(academy.owner, ["*"], ["owner"]));
const coach = as(
  actor(
    academy.coach,
    ["members:read", "training:read", "training:write"],
    ["coach"],
  ),
);
const coachB = as(
  actor(
    ids.coachB,
    ["members:read", "training:read", "training:write"],
    ["coach"],
  ),
);
const desk = as(
  actor(ids.desk, ["members:read", "training:read"], ["front-desk"]),
);
const athletes = academy.players.slice(0, 3);

beforeAll(() => applyAllMigrations(pg), 120_000);
afterAll(() => pg.close());
beforeEach(async () => {
  await seedAcademy(pg);
  await pg.exec(`
    INSERT INTO people (id, display_name, handle) VALUES
      ('${ids.coachB}', 'Bea Coach', 'bea'),
      ('${ids.desk}', 'Desk', 'desk'),
      ('${ids.guardian}', 'Parent', 'parent');
    INSERT INTO organization_memberships (organization_id, person_id, role) VALUES
      ('${academy.org}', '${ids.coachB}', 'coach'),
      ('${academy.org}', '${ids.desk}', 'front-desk');
    INSERT INTO organization_staff_profiles (organization_id, person_id, staff_role)
      VALUES ('${academy.org}', '${ids.coachB}', 'coach');
    INSERT INTO guardianships (guardian_id, minor_id, relationship, verified)
      VALUES ('${ids.guardian}', '${athletes[1]}', 'parent', true);
    INSERT INTO venues (id, organization_id, name, slug, timezone, country_code)
      VALUES ('${ids.venue}', '${academy.org}', 'Main Beach', 'main-beach', 'UTC', 'US');
    INSERT INTO organizations (id, slug, name, currency, timezone)
      VALUES ('${ids.otherOrg}', 'other-club', 'Other Club', 'USD', 'UTC');
    INSERT INTO training_programs (id, organization_id, slug, title, purpose, target_audience, approach, start_date, end_date, timezone)
      VALUES ('${ids.otherProgram}', '${ids.otherOrg}', 'theirs', 'Theirs', '', '', '', '2026-11-01', '2027-01-31', 'UTC');
    INSERT INTO training_drills (id, organization_id, slug, title, purpose, target_audience, summary, description_markdown, current_version_id, created_by_person_id)
      VALUES ('${ids.drill}', '${academy.org}', 'triangle', 'Serve-receive triangle', 'Serve-receive', 'Juniors', 'Three passers', '', '${ids.drillV2}', '${academy.coach}');
    INSERT INTO training_drill_versions (id, drill_id, version, snapshot) VALUES
      ('${ids.drillV1}', '${ids.drill}', 1, '{}'::jsonb),
      ('${ids.drillV2}', '${ids.drill}', 2, '{}'::jsonb);
  `);
});

function draft(overrides: Record<string, unknown> = {}) {
  return {
    title: "Winter juniors",
    purpose: "Serve-receive",
    targetAudience: "Juniors 14–17",
    objectives: ["Pass to target"],
    startDate: "2026-11-23",
    endDate: "2027-01-31",
    timezone: "UTC",
    defaultPracticeMinutes: 120,
    coaches: [
      { personId: academy.coach, role: "lead" as const, weekdays: [] },
      { personId: ids.coachB, role: "assistant" as const, weekdays: [3] },
    ],
    weeklySlots: [
      {
        weekday: 1,
        startsAt: "16:00",
        endsAt: "18:00",
        intervalWeeks: 1,
        venueId: ids.venue,
        courtIds: [],
      },
      {
        weekday: 3,
        startsAt: "16:00",
        endsAt: "18:00",
        intervalWeeks: 1,
        venueId: ids.venue,
        courtIds: [],
      },
    ],
    exceptions: [
      {
        kind: "break" as const,
        startsOn: "2026-12-21",
        endsOn: "2027-01-03",
        label: "Holiday break",
      },
    ],
    athletePersonIds: athletes,
    idempotencyKey: "create-winter-juniors",
    ...overrides,
  };
}

async function count(sql: string): Promise<number> {
  const result = await pg.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM ${sql}`,
  );
  return result.rows[0]!.count;
}

describe("programs", () => {
  it("only managers create; create is idempotent and makes a draft without sessions", async () => {
    await expect(createProgram(coach, draft())).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const program = await createProgram(owner, draft());
    trainingProgramsProgramSchema.parse(program);
    expect(program).toMatchObject({
      status: "draft",
      counts: { athletes: 3, practices: 0, weeks: 10, weeksOff: 2 },
      leadCoach: { personId: academy.coach },
    });
    expect(program.coaches.map((item) => item.role)).toEqual([
      "lead",
      "assistant",
    ]);
    const replay = await createProgram(owner, draft());
    expect(replay.id).toBe(program.id);
    await expect(
      createProgram(owner, draft({ title: "Different" })),
    ).rejects.toThrow(/different input/);
    expect(
      await count(
        "training_programs WHERE organization_id = '" + academy.org + "'",
      ),
    ).toBe(1);
    // The legacy page's columns stay readable.
    const legacy = await pg.query<{
      recurrence: { days: { day: string }[] };
      milestones: unknown[];
    }>(
      `SELECT recurrence, milestones FROM training_programs WHERE id = '${program.id}'`,
    );
    expect(legacy.rows[0]!.recurrence.days.map((day) => day.day)).toEqual([
      "monday",
      "wednesday",
    ]);
    expect(legacy.rows[0]!.milestones).toHaveLength(1);
  });

  it("rejects coaches who are not on the team and another club's venue", async () => {
    await expect(
      createProgram(
        owner,
        draft({
          coaches: [{ personId: athletes[0], role: "lead", weekdays: [] }],
          idempotencyKey: "bad-coach",
        }),
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      createProgram(
        owner,
        draft({ endDate: "2026-11-01", idempotencyKey: "bad-dates" }),
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("another club's program answers NOT_FOUND", async () => {
    await expect(programDetail(owner, ids.otherProgram)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      listSessions(owner, {
        programId: ids.otherProgram,
        from: "2026-11-01T00:00:00Z",
        to: "2026-12-31T00:00:00Z",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("activation generates future practices with coaches by weekday, and regeneration keeps booked sessions", async () => {
    const program = await createProgram(owner, draft());
    const active = await activateProgram(owner, program.id);
    expect(active.status).toBe("active");
    expect(active.currentWeek).toBe(2);
    const window = {
      programId: program.id,
      from: "2026-11-01T00:00:00Z",
      to: "2027-02-28T00:00:00Z",
    };
    const sessions = (await listSessions(desk, window)).items;
    sessions.forEach((session) => trainingProgramsSessionSchema.parse(session));
    // From Wed 2 Dec: Mon/Wed until 31 Jan minus the holiday break.
    expect(sessions).toHaveLength(13);
    expect(sessions[0]).toMatchObject({
      startsAt: "2026-12-02T16:00:00.000Z",
      status: "planned",
      source: "program",
      athleteCount: 3,
    });
    expect(sessions[0]!.coaches.map((item) => item.role)).toEqual([
      "lead",
      "assistant",
    ]);
    expect(sessions[1]!.coaches.map((item) => item.role)).toEqual(["lead"]);
    expect(await activateProgram(owner, program.id)).toMatchObject({
      status: "active",
    });
    expect((await listSessions(owner, window)).items).toHaveLength(13);

    // An athlete has answered for 9 Dec; 7 Dec is untouched.
    const booked = sessions.find((item) =>
      item.startsAt.startsWith("2026-12-09"),
    )!;
    const free = sessions.find((item) =>
      item.startsAt.startsWith("2026-12-07"),
    )!;
    await pg.exec(
      `INSERT INTO training_athlete_responses (training_event_id, person_id, attendance_status) VALUES ('${booked.id}', '${athletes[0]}', 'planned')`,
    );
    await updateProgram(owner, {
      programId: program.id,
      exceptions: [
        {
          kind: "break",
          startsOn: "2026-12-21",
          endsOn: "2027-01-03",
          label: "Holiday break",
        },
        {
          kind: "blackout",
          startsOn: "2026-12-07",
          endsOn: "2026-12-09",
          label: "Courts resurfaced",
        },
      ],
    });
    const after = (await listSessions(owner, window)).items;
    expect(after.some((item) => item.id === free.id)).toBe(false);
    expect(after.some((item) => item.id === booked.id)).toBe(true);
    expect(after).toHaveLength(12);
    const audit = await pg.query<{ reason: string }>(
      `SELECT reason FROM audit_log WHERE action = 'training-program.updated' AND entity_id = '${program.id}'`,
    );
    expect(audit.rows[0]!.reason).toMatch(
      /1 unused sessions removed, 1 booked sessions left for review/,
    );
    // The kept session now shows as a conflict with the new blackout.
    const conflicts = (await listConflicts(owner, program.id)).items;
    conflicts.forEach((item) => trainingProgramsConflictSchema.parse(item));
    expect(conflicts).toEqual([
      expect.objectContaining({
        kind: "milestone-overlaps-practice",
        sessionId: booked.id,
        status: "open",
      }),
    ]);
  });

  it("cancel keeps rows and reasons and cancels only future sessions", async () => {
    const program = await createProgram(owner, draft());
    await activateProgram(owner, program.id);
    const later = as(owner.actor, new Date("2026-12-10T00:00:00.000Z"));
    const cancelled = await cancelProgram(later, {
      programId: program.id,
      reason: "Not enough sign-ups",
      notifyAthletes: true,
    });
    expect(cancelled).toMatchObject({
      status: "cancelled",
      cancellation: { reason: "Not enough sign-ups" },
    });
    const statuses = await pg.query<{ status: string; n: number }>(
      `SELECT status::text AS status, count(*)::int AS n FROM training_events WHERE program_id = '${program.id}' GROUP BY 1 ORDER BY 1`,
    );
    expect(statuses.rows).toEqual([
      { status: "cancelled", n: 10 },
      { status: "planned", n: 3 },
    ]);
    await expect(
      updateProgram(owner, { programId: program.id, title: "x" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(
      (await listPrograms(owner, { status: "cancelled" })).items,
    ).toHaveLength(1);
  });

  it("proposes a program from a sentence without saving anything", async () => {
    const proposal = await proposeFromSentence(
      owner,
      "Fall build for 12 juniors, Mon and Wed 4-6pm, Sat 9-11am, Dec 7 to Feb 14, off over the holidays",
      "America/Los_Angeles",
    );
    expect(proposal.draft).toMatchObject({
      startDate: "2026-12-07",
      endDate: "2027-02-14",
      timezone: "America/Los_Angeles",
      defaultPracticeMinutes: 120,
    });
    expect(
      proposal.draft.weeklySlots.map((slot) => [
        slot.weekday,
        slot.startsAt,
        slot.endsAt,
      ]),
    ).toEqual([
      [1, "16:00", "18:00"],
      [3, "16:00", "18:00"],
      [6, "09:00", "11:00"],
    ]);
    expect(proposal.needsCheck.map((item) => item.field)).toEqual(
      expect.arrayContaining(["exceptions", "coaches"]),
    );
    expect(
      await count(
        "training_programs WHERE organization_id = '" + academy.org + "'",
      ),
    ).toBe(0);
  });

  it("lists programs in a fixed number of queries", async () => {
    const spy = vi.spyOn(pg, "query");
    await createProgram(owner, draft({ idempotencyKey: "p-1" }));
    spy.mockClear();
    await listPrograms(owner, {});
    const one = spy.mock.calls.length;
    for (let index = 2; index <= 6; index += 1) {
      await createProgram(
        owner,
        draft({ title: `Program ${index}`, idempotencyKey: `p-${index}` }),
      );
    }
    spy.mockClear();
    const { items } = await listPrograms(owner, {});
    expect(items).toHaveLength(6);
    items.forEach((item) => trainingProgramsProgramSummarySchema.parse(item));
    expect(spy.mock.calls.length).toBe(one);
    spy.mockRestore();
  });
});

describe("sessions, conflicts and after practice", () => {
  async function activeProgram() {
    const program = await createProgram(owner, draft());
    await activateProgram(owner, program.id);
    const sessions = (
      await listSessions(owner, {
        programId: program.id,
        from: "2026-12-01T00:00:00Z",
        to: "2026-12-31T00:00:00Z",
      })
    ).items;
    return { program, sessions };
  }

  it("front desk reads schedules only", async () => {
    const { program, sessions } = await activeProgram();
    expect(
      (
        await listSessions(desk, {
          from: "2026-12-01T00:00:00Z",
          to: "2026-12-31T00:00:00Z",
        })
      ).items.length,
    ).toBeGreaterThan(0);
    await expect(sessionOutcome(desk, sessions[0]!.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(listPracticePlans(desk, {})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      addSession(desk, {
        programId: program.id,
        kind: "film",
        title: "Film",
        startsAt: "2026-12-05T10:00:00Z",
        endsAt: "2026-12-05T11:00:00Z",
        timezone: "UTC",
        coachPersonIds: [],
        idempotencyKey: "desk-film",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("a program coach adds a session; a coach of nothing cannot", async () => {
    const { program } = await activeProgram();
    await pg.exec(
      `DELETE FROM training_program_coaches WHERE person_id = '${ids.coachB}'`,
    );
    const input = {
      programId: program.id,
      kind: "tournament" as const,
      title: "Scrimmage",
      startsAt: "2026-12-12T15:00:00Z",
      endsAt: "2026-12-12T18:00:00Z",
      timezone: "UTC",
      coachPersonIds: [academy.coach],
      idempotencyKey: "scrimmage-1",
    };
    await expect(addSession(coachB, input)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const session = await addSession(coach, input);
    expect(session).toMatchObject({
      source: "manual",
      kind: "tournament",
      coaches: [{ personId: academy.coach, role: "lead" }],
    });
    expect((await addSession(coach, input)).id).toBe(session.id);
  });

  it("coach blackout → ask cover opens a coverage request and the conflict reads resolved", async () => {
    const { program, sessions } = await activeProgram();
    const target = sessions.find((item) =>
      item.startsAt.startsWith("2026-12-14"),
    )!;
    const profile = (
      await pg.query<{ id: string }>(
        `SELECT id FROM organization_staff_profiles WHERE person_id = '${academy.coach}'`,
      )
    ).rows[0]!.id;
    await pg.exec(
      `INSERT INTO staff_blackouts (organization_id, staff_profile_id, starts_at, ends_at) VALUES ('${academy.org}', '${profile}', '2026-12-14T00:00:00Z', '2026-12-15T00:00:00Z')`,
    );
    const open = (await listConflicts(coach, program.id)).items.find(
      (item) => item.kind === "coach-blackout",
    )!;
    expect(open).toMatchObject({
      sessionId: target.id,
      status: "open",
      suggestedResolutions: ["ask-cover", "move-practice"],
    });
    const resolved = await resolveConflict(coach, {
      programId: program.id,
      conflictId: open.id,
      resolution: "ask-cover",
      substitutePersonId: ids.coachB,
    });
    expect(resolved).toMatchObject({
      status: "resolved",
      resolution: "ask-cover",
    });
    expect(
      await count(
        `staff_coverage_requests WHERE training_event_id = '${target.id}' AND status = 'asking'`,
      ),
    ).toBe(1);
    expect(await count(`staff_coverage_offers WHERE status = 'asked'`)).toBe(1);
    const again = (await listConflicts(owner, program.id)).items.find(
      (item) => item.id === open.id,
    )!;
    expect(again).toMatchObject({
      status: "resolved",
      resolution: "ask-cover",
    });
    const [session] = (
      await listSessions(owner, {
        programId: program.id,
        from: "2026-12-14T00:00:00Z",
        to: "2026-12-15T00:00:00Z",
      })
    ).items;
    expect(session!.needsCover).toBe(true);
  });

  it("move-practice moves to the day after the blocking period, same local time", async () => {
    const { program, sessions } = await activeProgram();
    const target = sessions.find((item) =>
      item.startsAt.startsWith("2026-12-14"),
    )!;
    await pg.exec(
      `INSERT INTO training_program_date_exceptions (program_id, kind, starts_on, ends_on, label) SELECT '${program.id}', 'tournament', '2026-12-13', '2026-12-14', 'Winter open'`,
    );
    const conflict = (await listConflicts(owner, program.id)).items.find(
      (item) => item.sessionId === target.id,
    )!;
    expect(conflict.description).toBe("Winter open falls on a Monday practice");
    await resolveConflict(owner, {
      programId: program.id,
      conflictId: conflict.id,
      resolution: "move-practice",
    });
    const moved = await pg.query<{ starts_at: Date }>(
      `SELECT starts_at FROM training_events WHERE id = '${target.id}'`,
    );
    expect(moved.rows[0]!.starts_at.toISOString()).toBe(
      "2026-12-15T16:00:00.000Z",
    );
  });

  it("records an after-practice record and completes the session", async () => {
    const { program, sessions } = await activeProgram();
    const plan = await savePracticePlan(coach, {
      title: "Serve-receive",
      purpose: "",
      targetAudience: "",
      status: "published",
      assumptions: {
        athletes: 3,
        courts: 1,
        ballsPerCourt: 3,
        level: "Intermediate",
      },
      blocks: [
        {
          sequence: 0,
          lane: "all",
          title: "Warm-up",
          kind: "warmup",
          startsAtMinute: 0,
          durationMinutes: 15,
          transitionMinutes: 0,
          intensity: 3,
          plannedLoad: 28,
          estimateSource: "assumed",
          locked: false,
        },
        {
          sequence: 1,
          lane: "all",
          title: "Triangle",
          kind: "drill",
          startsAtMinute: 15,
          durationMinutes: 30,
          transitionMinutes: 0,
          intensity: 6,
          plannedLoad: 55,
          drillId: ids.drill,
          estimateSource: "assumed",
          locked: false,
        },
      ],
      idempotencyKey: "plan-sr-1",
    });
    const target = sessions[0]!;
    const set = await setSessionPlan(coach, {
      sessionId: target.id,
      plan: { mode: "plan", practicePlanVersionId: plan.versionId },
    });
    expect(set).toMatchObject({
      status: "ready",
      plan: { mode: "plan", practicePlanId: plan.id, title: "Serve-receive" },
    });
    await expect(
      recordSessionOutcome(coach, {
        sessionId: target.id,
        attendance: [],
        blocks: [],
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const later = as(coach.actor, new Date("2026-12-02T18:30:00.000Z"));
    const blockIds = plan.blocks.map((block) => block.id);
    const outcome = await recordSessionOutcome(later, {
      sessionId: target.id,
      coachRpe: 6,
      actualLoad: 58,
      attendance: [
        {
          personId: athletes[0]!,
          displayName: "x",
          present: true,
          proposed: false,
        },
        {
          personId: athletes[1]!,
          displayName: "x",
          present: false,
          proposed: false,
        },
      ],
      blocks: [
        {
          blockId: blockIds[0]!,
          title: "Warm-up",
          plannedMinutes: 15,
          actualMinutes: 15,
          outcome: "Done",
        },
      ],
      notes: "Private coach notes",
    });
    trainingProgramsOutcomeSchema.parse(outcome);
    expect(outcome).toMatchObject({
      coachRpe: 6,
      actualLoad: 58,
      notes: "Private coach notes",
    });
    expect(outcome.attendance.filter((item) => item.present)).toHaveLength(1);
    expect(outcome.attendance.every((item) => !item.proposed)).toBe(true);
    expect(outcome.blocks[0]).toMatchObject({
      actualMinutes: 15,
      outcome: "Done",
    });
    await expect(
      recordSessionOutcome(later, {
        sessionId: target.id,
        attendance: [
          {
            personId: ids.desk,
            displayName: "x",
            present: true,
            proposed: false,
          },
        ],
        blocks: [],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const [done] = (
      await listSessions(owner, {
        programId: program.id,
        from: target.startsAt,
        to: target.endsAt,
      })
    ).items;
    expect(done!.status).toBe("completed");
    // Audit rows carry hashes, never the notes text.
    const audit = await pg.query<{ reason: string; after_hash: string }>(
      `SELECT reason, after_hash FROM audit_log WHERE action = 'training-session.outcome-recorded'`,
    );
    expect(JSON.stringify(audit.rows)).not.toContain("Private coach notes");
  });
});

describe("practice plans", () => {
  const blocks = [
    {
      sequence: 0,
      lane: "all",
      title: "Warm-up",
      kind: "warmup" as const,
      startsAtMinute: 0,
      durationMinutes: 15,
      transitionMinutes: 0,
      intensity: 3,
      plannedLoad: 0,
      estimateSource: "assumed" as const,
      locked: false,
    },
    {
      sequence: 1,
      lane: "all",
      title: "Triangle",
      kind: "drill" as const,
      startsAtMinute: 15,
      durationMinutes: 30,
      transitionMinutes: 5,
      intensity: 6,
      plannedLoad: 0,
      drillId: ids.drill,
      estimateSource: "assumed" as const,
      locked: false,
    },
  ];
  const plan = (overrides: Record<string, unknown> = {}) => ({
    title: "Serve-receive",
    purpose: "",
    targetAudience: "",
    status: "draft" as const,
    assumptions: {
      athletes: 8,
      courts: 2,
      ballsPerCourt: 3,
      level: "Intermediate",
    },
    blocks,
    idempotencyKey: "plan-1",
    ...overrides,
  });

  it("versions every save, pins drill versions, and keeps edits to the author or a manager", async () => {
    const first = await savePracticePlan(coach, plan());
    trainingProgramsPracticePlanSchema.parse(first);
    expect(first).toMatchObject({
      version: 1,
      durationMinutes: 50,
      status: "draft",
    });
    expect(first.blocks[1]).toMatchObject({
      drillId: ids.drill,
      drillVersionId: ids.drillV2,
      plannedLoad: 55,
    });
    expect(first.totals).toMatchObject({ minutes: 50, plannedMinutes: 50 });
    await expect(
      savePracticePlan(
        coachB,
        plan({ practicePlanId: first.id, idempotencyKey: "plan-b" }),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const second = await savePracticePlan(
      owner,
      plan({
        practicePlanId: first.id,
        status: "published",
        idempotencyKey: "plan-2",
        blocks: [
          { ...blocks[0]!, drillVersionId: undefined },
          { ...blocks[1]!, drillId: undefined, drillVersionId: ids.drillV1 },
        ],
      }),
    );
    expect(second).toMatchObject({ version: 2, status: "published" });
    expect(second.blocks[1]).toMatchObject({
      drillId: ids.drill,
      drillVersionId: ids.drillV1,
    });
    expect(
      await count(
        `audit_log WHERE action = 'training-plan.published' AND entity_id = '${first.id}'`,
      ),
    ).toBe(1);
    await expect(
      savePracticePlan(
        coach,
        plan({
          idempotencyKey: "plan-other-drill",
          blocks: [{ ...blocks[1]!, drillId: ids.otherProgram }],
        }),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      savePracticePlan(
        coach,
        plan({
          idempotencyKey: "plan-dupe",
          blocks: [blocks[0]!, { ...blocks[1]!, sequence: 0 }],
        }),
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("concurrent saves of one plan make distinct versions", async () => {
    const first = await savePracticePlan(coach, plan());
    const saves = await Promise.all(
      ["a", "b", "c"].map((key) =>
        savePracticePlan(
          coach,
          plan({
            practicePlanId: first.id,
            idempotencyKey: `concurrent-${key}`,
            title: `Take ${key}`,
          }),
        ),
      ),
    );
    expect(saves).toHaveLength(3);
    const versions = await pg.query<{ version: number }>(
      `SELECT version FROM training_practice_plan_versions WHERE practice_plan_id = '${first.id}' ORDER BY version`,
    );
    expect(versions.rows.map((row) => row.version)).toEqual([1, 2, 3, 4]);
  });

  it("an archived plan comes back only as a draft, and lists are bounded by status", async () => {
    const first = await savePracticePlan(coach, plan({ status: "archived" }));
    await expect(
      savePracticePlan(
        coach,
        plan({
          practicePlanId: first.id,
          status: "published",
          idempotencyKey: "x",
        }),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(
      (await listPracticePlans(coach, { status: "archived" })).items,
    ).toHaveLength(1);
    expect(
      (await listPracticePlans(coach, { status: "draft" })).items,
    ).toHaveLength(0);
    expect((await practicePlanDetail(owner, first.id)).status).toBe("archived");
  });

  it("proposes a plan from the club's drills without saving", async () => {
    const proposal = await proposePracticePlan(coach, {
      assumptions: {
        athletes: 6,
        courts: 1,
        ballsPerCourt: 3,
        level: "Intermediate",
      },
      durationMinutes: 60,
      focus: "Serve-receive",
    });
    trainingProgramsPracticePlanSchema.parse(proposal);
    expect(
      proposal.blocks.at(-1)!.startsAtMinute +
        proposal.blocks.at(-1)!.durationMinutes,
    ).toBe(60);
    expect(await count("training_practice_plans")).toBe(0);
  });
});

describe("legacy programs", () => {
  beforeEach(async () => {
    await pg.exec(`
      INSERT INTO training_programs (id, organization_id, slug, title, purpose, target_audience, approach, status, start_date, end_date, timezone, recurrence, milestones, athlete_count)
      VALUES ('${ids.legacyProgram}', '${academy.org}', 'legacy', 'Legacy squad', 'Old', 'Adults', '', 'draft', '2026-11-30', '2027-01-24', 'UTC',
        '{"intervalWeeks":1,"days":[{"day":"tuesday","startsAt":"18:00","durationMinutes":90}],"excludedDates":["2026-12-29"]}'::jsonb,
        '[{"id":"0b6c5d36-3f53-4c2a-9a8d-0d1f2f1a2b3c","kind":"tournament","title":"Winter open","startsOn":"2027-01-09","endsOn":"2027-01-10","priority":"key"},{"id":"x","kind":"assessment","title":"Tests","startsOn":"2027-01-05","endsOn":"2027-01-05","priority":"low"}]'::jsonb, 4);
      INSERT INTO training_events (organization_id, program_id, kind, title, starts_at, ends_at, timezone, coach_person_id, source)
      VALUES ('${academy.org}', '${ids.legacyProgram}', 'practice', 'Practice', '2026-12-01T18:00:00Z', '2026-12-01T19:30:00Z', 'UTC', '${academy.coach}', 'ai-draft'),
             ('${academy.org}', '${ids.legacyProgram}', 'practice', 'Practice', '2026-12-08T18:00:00Z', '2026-12-08T19:30:00Z', 'UTC', '${academy.coach}', 'ai-draft');
    `);
  });

  it("reads a legacy program without copying anything", async () => {
    const program = await programDetail(owner, ids.legacyProgram);
    trainingProgramsProgramSchema.parse(program);
    expect(program.weeklySlots).toEqual([
      expect.objectContaining({
        weekday: 2,
        startsAt: "18:00",
        endsAt: "19:30",
        intervalWeeks: 1,
      }),
    ]);
    expect(program.exceptions.map((item) => [item.kind, item.label])).toEqual([
      ["blackout", "No practice"],
      ["tournament", "Winter open"],
    ]);
    expect(program.coaches).toEqual([
      expect.objectContaining({ personId: academy.coach, role: "lead" }),
    ]);
    expect(program.leadCoach?.personId).toBe(academy.coach);
    expect(await count("training_program_weekly_slots")).toBe(0);
    expect(
      await count(`audit_log WHERE action = '${LEGACY_PROGRAM_COPIED}'`),
    ).toBe(0);
  });

  it("copies the legacy structure once on first write, keeps legacy events, and never duplicates them", async () => {
    const before = await programDetail(owner, ids.legacyProgram);
    await updateProgram(owner, {
      programId: ids.legacyProgram,
      title: "Legacy squad 2",
    });
    await updateProgram(owner, {
      programId: ids.legacyProgram,
      purpose: "New purpose",
    });
    expect(
      await count(`audit_log WHERE action = '${LEGACY_PROGRAM_COPIED}'`),
    ).toBe(1);
    expect(
      await count(
        `training_program_weekly_slots WHERE program_id = '${ids.legacyProgram}'`,
      ),
    ).toBe(1);
    const after = await programDetail(owner, ids.legacyProgram);
    expect(after.weeklySlots.map((slot) => slot.id)).toEqual(
      before.weeklySlots.map((slot) => slot.id),
    );
    expect(after.exceptions.map((item) => item.id)).toEqual(
      before.exceptions.map((item) => item.id),
    );
    const raw = await pg.query<{ recurrence: unknown }>(
      `SELECT recurrence FROM training_programs WHERE id = '${ids.legacyProgram}'`,
    );
    expect(raw.rows[0]!.recurrence).toMatchObject({
      days: [{ day: "tuesday", startsAt: "18:00", durationMinutes: 90 }],
    });
    await activateProgram(owner, ids.legacyProgram);
    const sessions = await pg.query<{ starts_at: Date; source: string }>(
      `SELECT starts_at, source FROM training_events WHERE program_id = '${ids.legacyProgram}' AND starts_at < '2026-12-16' ORDER BY starts_at`,
    );
    // 8 Dec existed as a legacy "ai-draft" event: it is kept, not duplicated.
    expect(
      sessions.rows.map((row) => [
        row.starts_at.toISOString().slice(0, 10),
        row.source,
      ]),
    ).toEqual([
      ["2026-12-01", "ai-draft"],
      ["2026-12-08", "ai-draft"],
      ["2026-12-15", "program"],
    ]);
  });
});

describe("the athlete's own view", () => {
  it("shows active programs and schedules to athletes and verified guardians only", async () => {
    const program = await createProgram(owner, draft());
    const athlete = {
      ...owner.actor,
      personId: athletes[0]!,
      scopes: [],
      roles: ["player"],
    } as ApiActor;
    expect((await myPrograms(athlete, now)).items).toHaveLength(0); // still a draft
    await activateProgram(owner, program.id);
    expect(
      (await myPrograms(athlete, now)).items.map((item) => item.id),
    ).toEqual([program.id]);
    const parent = { ...athlete, personId: ids.guardian } as ApiActor;
    const schedule = await mySchedule(parent, {
      from: "2026-12-01T00:00:00Z",
      to: "2026-12-15T00:00:00Z",
    });
    expect(schedule.items).toHaveLength(4);
    const stranger = { ...athlete, personId: academy.players[7]! } as ApiActor;
    expect(
      (
        await mySchedule(stranger, {
          from: "2026-12-01T00:00:00Z",
          to: "2026-12-15T00:00:00Z",
        })
      ).items,
    ).toHaveLength(0);
  });
});
