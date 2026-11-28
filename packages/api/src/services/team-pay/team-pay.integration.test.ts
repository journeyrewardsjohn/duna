/**
 * Team pay (B3b) against an in-memory Postgres with every migration:
 * compensation history, pay periods, the run lifecycle (compute, adjust,
 * approve, immutable, adjustment run pays only what is new, export with
 * who and when), and the legacy compensation copy.
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
  teamPayRunSchema,
  teamPayStaffCompensationSchema,
} from "../../contracts/team-pay";
import {
  adjustLine,
  approvePayRun,
  cancelPayRun,
  computeTeamPayRun,
  createPayPeriod,
  exportPayRun,
  type PayContext,
  payRun,
  setCompensation,
  setIncomeGoal,
  setPayExportStorageForTests,
  staffCompensationPage,
} from "./index";
import {
  legacyCompensationView,
  migrateLegacyStaffCompensation,
} from "./legacy";

const { pg, db } = createCatalogTestDatabase();
state.db = db;

const ids = {
  w2: "20000000-0000-4000-8000-0000000000c1",
  program: "61000000-0000-4000-8000-000000000001",
};
const now = new Date("2026-12-01T12:00:00.000Z");
const stored = new Map<string, string>();
setPayExportStorageForTests({
  configured: () => true,
  put: async ({ key, body }) => {
    stored.set(key, body);
  },
  signedUrl: async ({ key }) =>
    `https://files.duna.test/${encodeURIComponent(key)}`,
});

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
const owner: PayContext = {
  actor: actor(academy.owner, ["*"], ["owner"]),
  organizationId: academy.org,
  requestId: "req-owner",
  now,
};
const coach: PayContext = {
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

async function addSession(index: number, day: string, minutes: number) {
  const startsAt = `${day}T17:00:00.000Z`;
  const endsAt = new Date(
    Date.parse(startsAt) + minutes * 60_000,
  ).toISOString();
  await pg.exec(`
    INSERT INTO sessions (id, program_id, coach_person_id, title, slug, starts_at, ends_at, timezone, status, capacity)
    VALUES ('62000000-0000-4000-8000-00000000000${index}', '${ids.program}', '${academy.coach}', 'Clinic ${index}', 'clinic-${index}',
      '${startsAt}', '${endsAt}', 'UTC', 'completed', 8);
  `);
}

beforeAll(() => applyAllMigrations(pg), 120_000);
afterAll(() => pg.close());
beforeEach(async () => {
  stored.clear();
  await seedAcademy(pg);
  await pg.exec(`
    INSERT INTO people (id, display_name, handle) VALUES ('${ids.w2}', '=Front Desk', 'desk');
    INSERT INTO organization_staff_profiles (organization_id, person_id, staff_role, worker_classification)
      VALUES ('${academy.org}', '${ids.w2}', 'front-desk', 'w2-employee');
    INSERT INTO programs (id, organization_id, slug, title, kind) VALUES ('${ids.program}', '${academy.org}', 'clinics', 'Clinics', 'clinic');
  `);
  await addSession(1, "2026-11-17", 90);
  await addSession(2, "2026-11-18", 45);
});

async function setUpModels() {
  const coachProfile = await profileId(academy.coach);
  const deskProfile = await profileId(ids.w2);
  await setCompensation(owner, {
    staffProfileId: coachProfile,
    model: "hourly",
    classification: "1099-contractor",
    effectiveFrom: "2026-01-01",
    hourlyRate: { amountMinor: 4_000, currency: "USD" },
    revenueShareScope: [],
  });
  await setCompensation(owner, {
    staffProfileId: deskProfile,
    model: "salary",
    classification: "w2-employee",
    effectiveFrom: "2026-01-01",
    annualSalary: { amountMinor: 5_200_000, currency: "USD" },
    revenueShareScope: [],
  });
  return { coachProfile, deskProfile };
}

describe("compensation", () => {
  it("keeps an effective-dated history and computes goal progress", async () => {
    const { coachProfile } = await setUpModels();
    await setCompensation(owner, {
      staffProfileId: coachProfile,
      model: "per-session",
      classification: "1099-contractor",
      effectiveFrom: "2026-12-01",
      perSessionRate: { amountMinor: 6_000, currency: "USD" },
      revenueShareScope: [],
    });
    await expect(
      setCompensation(owner, {
        staffProfileId: coachProfile,
        model: "hourly",
        classification: "1099-contractor",
        effectiveFrom: "2026-11-01",
        hourlyRate: { amountMinor: 1, currency: "USD" },
        revenueShareScope: [],
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const page = teamPayStaffCompensationSchema.parse(
      await setIncomeGoal(owner, {
        staffProfileId: coachProfile,
        target: { amountMinor: 20_000, currency: "USD" },
        period: "month",
      }),
    );
    expect(page.current).toMatchObject({
      model: "per-session",
      effectiveFrom: "2026-12-01",
    });
    expect(page.history).toEqual([
      expect.objectContaining({ model: "hourly", effectiveTo: "2026-11-30" }),
    ]);
    // December so far: no delivered sessions yet.
    expect(page.goal).toMatchObject({
      earned: { amountMinor: 0 },
      progressPercent: 0,
    });
    // Coaches see their own pay, not a colleague's.
    await expect(
      staffCompensationPage(coach, coachProfile),
    ).resolves.toBeDefined();
    await expect(
      staffCompensationPage(coach, await profileId(ids.w2)),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("pay runs", () => {
  it("computes, adjusts, approves (immutable), pays new sessions in an adjustment run, exports", async () => {
    const { coachProfile, deskProfile } = await setUpModels();
    const period = await createPayPeriod(owner, {
      frequency: "every-2-weeks",
      startsOn: "2026-11-16",
    });
    expect(period.endsOn).toBe("2026-11-29");
    await expect(
      createPayPeriod(owner, { frequency: "weekly", startsOn: "2026-11-20" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const first = teamPayRunSchema.parse(
      await computeTeamPayRun(owner, {
        payPeriodId: period.id,
        idempotencyKey: "run-1-key",
      }),
    );
    expect(first).toMatchObject({ revision: 1, status: "ready-for-approval" });
    const coachLine = first.lines.find(
      (line) => line.staff.staffProfileId === coachProfile,
    )!;
    // 40.00/h × 135 min = 90.00.
    expect(coachLine).toMatchObject({
      earnings: { amountMinor: 9_000 },
      sessionsCount: 2,
      method: "export",
    });
    const deskLine = first.lines.find(
      (line) => line.staff.staffProfileId === deskProfile,
    )!;
    expect(deskLine).toMatchObject({
      earnings: { amountMinor: 200_000 },
      classification: "w2-employee",
    });
    expect(first.contractorTotal.amountMinor).toBe(9_000);
    expect(first.employeeTotal.amountMinor).toBe(200_000);
    // Same key, same run.
    expect(
      (
        await computeTeamPayRun(owner, {
          payPeriodId: period.id,
          idempotencyKey: "run-1-key",
        })
      ).id,
    ).toBe(first.id);

    const adjusted = await adjustLine(owner, {
      lineId: coachLine.id,
      adjustments: [
        { label: "Equipment", amount: { amountMinor: 1_500, currency: "USD" } },
        { label: "Advance", amount: { amountMinor: -500, currency: "USD" } },
      ],
    });
    expect(adjusted).toMatchObject({
      status: "adjusted",
      total: { amountMinor: 10_000 },
    });
    await expect(
      adjustLine(owner, {
        lineId: deskLine.id,
        adjustments: [],
        method: "duna-pay",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const approved = await approvePayRun(owner, {
      payRunId: first.id,
      idempotencyKey: "approve-1-key",
    });
    expect(approved).toMatchObject({
      status: "approved",
      approvedBy: { personId: academy.owner },
    });
    expect(approved.contractorTotal.amountMinor).toBe(10_000);
    // Approved runs never change.
    await expect(
      adjustLine(owner, { lineId: coachLine.id, adjustments: [] }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(cancelPayRun(owner, first.id)).rejects.toMatchObject({
      code: "CONFLICT",
    });

    // A session recorded late: the adjustment run pays only it.
    await addSession(3, "2026-11-20", 60);
    const correction = await computeTeamPayRun(owner, {
      payPeriodId: period.id,
      idempotencyKey: "run-2-key",
    });
    expect(correction.revision).toBe(2);
    expect(correction.lines).toEqual([
      expect.objectContaining({
        sessionsCount: 1,
        earnings: { amountMinor: 4_000, currency: "USD" },
      }),
    ]);
    expect((await payRun(owner, first.id)).status).toBe("approved");

    const file = await exportPayRun(owner, {
      payRunId: first.id,
      format: "csv",
    });
    expect(file).toMatchObject({ rowCount: 2, format: "csv" });
    const csv = [...stored.values()][0]!;
    expect(csv.split("\r\n")[0]).toBe(
      "pay_run_id,revision,period_start,period_end,staff_profile_id,person_id,name,classification,compensation_model,sessions,hours,currency,earnings,adjustments,total,adjustment_labels",
    );
    expect(csv).toContain(
      "'=Front Desk,w2-employee,salary,0,0.00,USD,2000.00,0.00,2000.00,",
    );
    expect(csv).toContain(
      ",hourly,2,2.25,USD,90.00,10.00,100.00,Equipment 15.00; Advance -5.00",
    );
    const exported = await payRun(owner, first.id);
    expect(exported.status).toBe("exported");
    expect(exported.exports[0]).toMatchObject({
      createdBy: { personId: academy.owner },
      rowCount: 2,
    });
    expect(exported.lines.every((line) => line.status === "exported")).toBe(
      true,
    );
    await expect(
      exportPayRun(owner, { payRunId: first.id, format: "gusto" }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("recomputing cancels the unapproved revision", async () => {
    await setUpModels();
    const period = await createPayPeriod(owner, {
      frequency: "monthly",
      startsOn: "2026-11-01",
    });
    const first = await computeTeamPayRun(owner, {
      payPeriodId: period.id,
      idempotencyKey: "first-key",
    });
    const second = await computeTeamPayRun(owner, {
      payPeriodId: period.id,
      idempotencyKey: "second-key",
    });
    expect(second.revision).toBe(2);
    expect((await payRun(owner, first.id)).status).toBe("cancelled");
    expect((await cancelPayRun(owner, second.id)).status).toBe("cancelled");
  });
});

describe("legacy compensation", () => {
  it("copies the legacy model and goal once and shows them in the legacy shape", async () => {
    const coachProfile = await profileId(academy.coach);
    await pg.exec(`
      UPDATE organization_staff_profiles
        SET worker_classification = '1099-contractor', compensation_model = 'hourly-plus-profit-share',
            hourly_rate_minor = 3500, profit_share_bps = 1500, income_goal_minor = 300000, income_goal_period = 'month'
        WHERE id = '${coachProfile}';
    `);
    await expect(
      migrateLegacyStaffCompensation({ organizationId: academy.org, now }),
    ).resolves.toEqual({
      copied: 1,
      alreadyCopied: 0,
    });
    await expect(
      migrateLegacyStaffCompensation({ organizationId: academy.org, now }),
    ).resolves.toEqual({
      copied: 0,
      alreadyCopied: 1,
    });
    const page = await staffCompensationPage(owner, coachProfile);
    expect(page.current).toMatchObject({
      model: "hourly-plus-share",
      hourlyRate: { amountMinor: 3_500 },
      revenueShareBps: 1_500,
    });
    expect(page.goal).toMatchObject({
      target: { amountMinor: 300_000 },
      period: "month",
    });
    const [row] = await db.query.organizationStaffProfiles.findMany({
      where: (table, { eq }) => eq(table.id, coachProfile),
    });
    const view = await legacyCompensationView(academy.org, [row!]);
    expect(view.get(coachProfile)).toEqual({
      workerClassification: "1099-contractor",
      compensationModel: "hourly-plus-profit-share",
      hourlyRateMinor: 3_500,
      profitShareBps: 1_500,
      incomeGoalMinor: 300_000,
      incomeGoalPeriod: "month",
    });
  });
});
