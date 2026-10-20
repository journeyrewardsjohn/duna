import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { eq, SQL } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import * as schema from "@duna/db";
import { createDemoActor, scopesForRoles, type ApiActor } from "./context";
import {
  assertConversationOwner,
  bindAskDunaSession,
  claimAskDunaAction,
  createAskDunaConversation,
  getAskDunaTranscript,
  getAskDunaAdminOverview,
  listAskDunaActions,
  listAskDunaConversations,
  recordAskDunaEvent,
  resolveAskDunaActor,
  saveAskDunaAction,
  updateAskDunaControls,
  updateAskDunaConversation,
} from "./ask-duna-store";
import {
  askDunaOperationCatalog,
  describeAskDunaOperation,
  proposeAskDunaOperation,
  readAskDunaOperation,
  reviewAskDunaOperation,
} from "./ask-duna-tools";
import * as apiRouter from "./router";
import {
  loadDemoOperatorWorkspace,
  changeCourtSchedule,
  previewCourtScheduleChange,
  replaceCourtSchedule,
} from "./operator-service";
import { getOrganizationSetupReadiness } from "./organization-setup";

const harness = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@duna/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@duna/db")>()),
  isDatabaseConfigured: () => true,
  getDatabase: () => harness.db,
  getTransactionalDatabase: () => harness.db,
}));

const pg = new PGlite();
const db = drizzle(pg, { schema });
harness.db = db;
const personId = "10000000-0000-4000-8000-000000000001";
const otherPersonId = "10000000-0000-4000-8000-000000000002";
const organizationId = "20000000-0000-4000-8000-000000000001";
const otherOrganizationId = "20000000-0000-4000-8000-000000000002";
const operator: ApiActor = {
  ...createDemoActor(),
  personId,
  organizationId,
  roles: ["owner"],
  scopes: scopesForRoles(["owner"]),
  isDemo: false,
};
const admin: ApiActor = { ...operator, roles: ["super-admin"], scopes: ["*"] };

beforeAll(async () => {
  // Existing parent tables use their actual column definitions. The new Ask
  // Duna tables, constraints, indexes and foreign keys use the real migration.
  const dialect = new PgDialect();
  for (const table of [
    schema.people,
    schema.organizations,
    schema.organizationMemberships,
    schema.adminRoles,
    schema.auditLog,
    schema.venues,
    schema.courts,
    schema.schedules,
    schema.scheduleBlocks,
    schema.scheduleOverrides,
    schema.courtBookings,
    schema.idempotencyRecords,
    schema.rateLimitBuckets,
  ]) {
    const config = getTableConfig(table);
    const columns = config.columns.map((column) => {
      const type = column.enumValues?.length ? "text" : column.getSQLType();
      let defaultSql = "";
      if (column.default instanceof SQL)
        defaultSql = dialect
          .sqlToQuery(column.default)
          .sql.replace("duna_next_member_id()", "'123456'");
      else if (column.default !== undefined)
        defaultSql =
          typeof column.default === "string"
            ? `'${column.default.replaceAll("'", "''")}'`
            : typeof column.default === "object"
              ? `'${JSON.stringify(column.default)}'::jsonb`
              : String(column.default);
      return `"${column.name}" ${type}${column.primary ? " primary key" : ""}${defaultSql ? ` default ${defaultSql}` : ""}`;
    });
    await pg.exec(`create table "${config.name}" (${columns.join(",")})`);
  }
  await pg.exec(
    "create unique index idempotency_procedure_key_unique on idempotency_records (procedure, key)",
  );
  await pg.exec(
    await readFile(
      new URL("../../db/drizzle/0108_magical_spot.sql", import.meta.url),
      "utf8",
    ),
  );
}, 30_000);

beforeEach(async () => {
  await pg.exec(
    "truncate ask_duna_events, ask_duna_actions, ask_duna_conversations, ask_duna_controls, audit_log, organization_memberships, admin_roles, people, organizations, venues, courts, schedules, schedule_blocks, schedule_overrides, court_bookings, idempotency_records cascade",
  );
  await db.insert(schema.people).values([
    {
      id: personId,
      displayName: "Operator One",
      handle: "one",
      status: "active",
      ageBand: "adult",
    },
    {
      id: otherPersonId,
      displayName: "Operator Two",
      handle: "two",
      status: "active",
      ageBand: "adult",
    },
  ]);
  await db.insert(schema.organizations).values([
    { id: organizationId, name: "First club", slug: "first" },
    { id: otherOrganizationId, name: "Second club", slug: "second" },
  ]);
  await db
    .insert(schema.organizationMemberships)
    .values({ personId, organizationId, role: "owner" });
});
afterAll(async () => {
  await pg.close();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("Ask Duna court availability", () => {
  const venueId = "50000000-0000-4000-8000-000000000001";
  const courtId = "50000000-0000-4000-8000-000000000002";
  const scheduleId = "50000000-0000-4000-8000-000000000003";
  const changes = [1, 2, 3, 4, 5].map((weekday) => ({
    weekday,
    startsAtMinute: 540,
    endsAtMinute: 720,
    mode: "blocked" as const,
  }));
  beforeEach(async () => {
    vi.stubEnv("DATABASE_URL", "postgres://isolated-test");
    await db.insert(schema.venues).values({
      id: venueId,
      organizationId,
      name: "Test venue",
      slug: "test-venue",
      timezone: "America/New_York",
    });
    await db.insert(schema.courts).values({
      id: courtId,
      venueId,
      name: "Court 3",
      surface: "sand",
      qrToken: "test-court-3",
    });
    await db.insert(schema.schedules).values({
      id: scheduleId,
      organizationId,
      resourceId: courtId,
      resourceType: "court",
      name: "Court hours",
      timezone: "America/New_York",
    });
    await db.insert(schema.scheduleBlocks).values(
      Array.from({ length: 7 }, (_, weekday) => ({
        scheduleId,
        weekday,
        startsAtMinute: 480,
        endsAtMinute: 1320,
        mode: "rentals-only" as const,
      })),
    );
    await db.insert(schema.scheduleOverrides).values({
      scheduleId,
      startsAt: new Date("2026-10-26T15:00:00Z"),
      endsAt: new Date("2026-10-26T16:00:00Z"),
      mode: "blocked",
      reason: "Existing blackout",
    });
    await pg.exec(
      `insert into court_bookings (id, court_id, status) values ('60000000-0000-4000-8000-000000000001', '${courtId}', 'confirmed')`,
    );
  });

  it("previews without writing, then executes one approved change with protected bookings and blackouts", async () => {
    const before = await db.select().from(schema.scheduleBlocks);
    const bookings = await db.select().from(schema.courtBookings);
    const overrides = await db.select().from(schema.scheduleOverrides);
    const plan = await previewCourtScheduleChange({
      actor: operator,
      courtId,
      changes,
    });
    expect(plan).toMatchObject({
      courtName: "Court 3",
      timezone: "America/New_York",
    });
    expect(plan.proposed).toHaveLength(17);
    expect(await db.select().from(schema.scheduleBlocks)).toEqual(before);
    const conversation = await createAskDunaConversation(operator, {});
    const action = await proposeAskDunaOperation(operator, conversation.id, {
      operation: "operator.changeCourtSchedule",
      input: {
        courtId,
        changes,
        expectedVersion: plan.expectedVersion,
        reason: "Morning sessions",
        confirmed: true,
      },
      summary: "Block Court 3 Monday–Friday 9 am–noon, America/New_York.",
    });
    expect(await db.select().from(schema.scheduleBlocks)).toEqual(before);
    const receipt = await reviewAskDunaOperation(
      operator,
      conversation.id,
      action.id,
      "approve",
    );
    expect(receipt).toMatchObject({ status: "succeeded" });
    expect(await db.select().from(schema.scheduleBlocks)).toHaveLength(17);
    expect(await db.select().from(schema.courtBookings)).toEqual(bookings);
    expect(await db.select().from(schema.scheduleOverrides)).toEqual(overrides);
    expect(
      (await db.select().from(schema.auditLog)).filter(
        (row) => row.action === "court.schedule_changed",
      ),
    ).toHaveLength(1);
    await expect(
      reviewAskDunaOperation(operator, conversation.id, action.id, "approve"),
    ).rejects.toThrow("already reviewed");
  });

  it("rejects a stale proposal after a manual save without undoing that save", async () => {
    const plan = await previewCourtScheduleChange({
      actor: operator,
      courtId,
      changes,
    });
    await replaceCourtSchedule({
      actor: operator,
      courtId,
      blocks: [
        {
          weekday: 6,
          startsAtMinute: 600,
          endsAtMinute: 900,
          mode: "open",
          effectiveFrom: "2026-11-01",
          effectiveTo: "2026-12-01",
        },
      ],
      confirmed: true,
      now: new Date(),
      requestId: crypto.randomUUID(),
    });
    const before = await db.select().from(schema.scheduleBlocks);
    expect(before[0]).toMatchObject({
      effectiveFrom: "2026-11-01",
      effectiveTo: "2026-12-01",
    });
    await expect(
      changeCourtSchedule({
        actor: operator,
        courtId,
        changes,
        expectedVersion: plan.expectedVersion,
        reason: "Morning sessions",
        confirmed: true,
        now: new Date(),
        requestId: crypto.randomUUID(),
      }),
    ).rejects.toThrow("changed after");
    expect(await db.select().from(schema.scheduleBlocks)).toEqual(before);
  });

  it("denies another organization, missing scope and unconfirmed writes", async () => {
    await expect(
      previewCourtScheduleChange({
        actor: { ...operator, organizationId: otherOrganizationId },
        courtId,
        changes,
      }),
    ).rejects.toThrow("another organization");
    expect(() =>
      describeAskDunaOperation(
        { ...operator, scopes: [] },
        "operator.changeCourtSchedule",
      ),
    ).toThrow("role");
    await expect(
      changeCourtSchedule({
        actor: operator,
        courtId,
        changes,
        expectedVersion: "untrusted",
        reason: "Morning sessions",
        confirmed: false,
        now: new Date(),
        requestId: crypto.randomUUID(),
      }),
    ).rejects.toThrow("confirm");
    expect(await db.select().from(schema.scheduleBlocks)).toHaveLength(7);
  });
});

describe("Ask Duna permissions and durable storage", () => {
  it("isolates the same person's other organization and another operator", async () => {
    const first = await createAskDunaConversation(operator, { title: "First" });
    await createAskDunaConversation(
      { ...operator, organizationId: otherOrganizationId },
      { title: "Other tenant" },
    );
    await createAskDunaConversation(
      { ...operator, personId: otherPersonId },
      { title: "Other operator" },
    );
    expect(
      (await listAskDunaConversations(operator)).conversations.map(
        (row) => row.id,
      ),
    ).toEqual([first.id]);
    expect(() =>
      assertConversationOwner({ ...operator, personId: otherPersonId }, first),
    ).toThrow("Conversation not found");
    expect(() =>
      assertConversationOwner(
        { ...operator, organizationId: otherOrganizationId },
        first,
      ),
    ).toThrow("Conversation not found");
    expect(() =>
      assertConversationOwner(admin, { ...first, personId: otherPersonId }),
    ).toThrow();
  });

  it("binds a durable session once and preserves history after archive", async () => {
    const conversation = await createAskDunaConversation(operator, {});
    await bindAskDunaSession(operator, conversation.id, "session-one");
    await expect(
      bindAskDunaSession(operator, conversation.id, "session-two"),
    ).rejects.toThrow("already has a session");
    await updateAskDunaConversation(operator, conversation.id, {
      archived: true,
    });
    expect(
      (await listAskDunaConversations(operator)).conversations,
    ).toHaveLength(0);
    expect(
      (await listAskDunaConversations(operator, "", true)).conversations,
    ).toHaveLength(1);
    await expect(
      saveAskDunaAction(operator, conversation.id, {
        operation: "operator.createCourt",
        input: {},
        summary: "Create court",
      }),
    ).rejects.toThrow("Restore");
  });

  it("rebuilds grants and immediately refuses revoked or disabled identities", async () => {
    expect(
      (await resolveAskDunaActor(personId, organizationId)).roles,
    ).toContain("owner");
    await db.update(schema.organizationMemberships).set({ active: false });
    await expect(resolveAskDunaActor(personId, organizationId)).rejects.toThrow(
      "access",
    );
    await db
      .insert(schema.adminRoles)
      .values({ personId, role: "super-admin" });
    expect(
      (await resolveAskDunaActor(personId, organizationId, true)).roles,
    ).toContain("super-admin");
    await expect(resolveAskDunaActor(personId, organizationId)).rejects.toThrow(
      "access",
    );
    await db
      .update(schema.people)
      .set({ status: "suspended" })
      .where(eq(schema.people.id, personId));
    await expect(
      resolveAskDunaActor(personId, organizationId, true),
    ).rejects.toThrow("access");
  });

  it("pages all history and searches messages beyond the latest preview", async () => {
    const rows = await db
      .insert(schema.askDunaConversations)
      .values(
        Array.from({ length: 54 }, (_, index) => ({
          personId,
          organizationId,
          title: `Conversation ${index}`,
        })),
      )
      .returning();
    const first = await listAskDunaConversations(operator);
    const second = await listAskDunaConversations(
      operator,
      "",
      false,
      first.nextOffset!,
    );
    expect(first.conversations).toHaveLength(50);
    expect(second.conversations).toHaveLength(4);
    expect(second.nextOffset).toBeNull();
    await recordAskDunaEvent({
      id: "event-1",
      conversationId: rows[0]!.id,
      type: "message.received",
      data: { text: "Unique tournament question", role: "user" },
    });
    await recordAskDunaEvent({
      id: "event-2",
      conversationId: rows[0]!.id,
      type: "message.completed",
      data: { text: "Unrelated reply", role: "assistant" },
    });
    expect(
      (
        await listAskDunaConversations(operator, "Unique tournament")
      ).conversations.map((row) => row.id),
    ).toEqual([rows[0]!.id]);
  });

  it("deduplicates runtime events and audits admin transcript inspection", async () => {
    const conversation = await createAskDunaConversation(operator, {});
    const event = {
      id: "same-event",
      conversationId: conversation.id,
      type: "message.completed",
      data: { text: "Saved once", role: "assistant" },
    };
    await recordAskDunaEvent(event);
    await recordAskDunaEvent(event);
    expect(await getAskDunaTranscript(operator, conversation.id)).toHaveLength(
      1,
    );
    await expect(
      getAskDunaTranscript(operator, conversation.id, true),
    ).rejects.toThrow("Super Admin");
    await getAskDunaTranscript(admin, conversation.id, true);
    expect(await db.select().from(schema.auditLog)).toHaveLength(1);
  });
});

describe("Ask Duna approvals", () => {
  const proposal = {
    operation: "operator.createCourt",
    input: { name: "Court 2" },
    summary: "Add Court 2",
  };
  const validCourt = {
    venueId: otherOrganizationId,
    name: "Court 2",
    surface: "sand",
    lit: false,
    bookingPolicy: "public",
    minimumDurationMinutes: 60,
    maximumDurationMinutes: 120,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    minimumNoticeMinutes: 0,
    maximumAdvanceDays: 60,
  };

  it("runs an approved mutation once with the stored input and saves its receipt", async () => {
    const execute = vi
      .fn()
      .mockResolvedValue({ id: "created-court", name: "Court 2" });
    const caller = vi.spyOn(apiRouter, "createCaller").mockReturnValue({
      operator: { createCourt: execute },
    } as unknown as ReturnType<typeof apiRouter.createCaller>);
    const conversation = await createAskDunaConversation(operator, {});
    const action = await proposeAskDunaOperation(operator, conversation.id, {
      ...proposal,
      input: validCourt,
    });
    expect(execute).not.toHaveBeenCalled();
    const receipt = await reviewAskDunaOperation(
      operator,
      conversation.id,
      action.id,
      "approve",
    );
    expect(receipt.status).toBe("succeeded");
    expect(execute).toHaveBeenCalledExactlyOnceWith({
      ...validCourt,
      idempotencyKey: action.id,
    });
    expect(caller.mock.calls[0]![0]).toMatchObject({
      actor: { personId, organizationId },
    });
    await expect(
      reviewAskDunaOperation(operator, conversation.id, action.id, "approve"),
    ).rejects.toThrow("already reviewed");
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("never retries unknown outcomes and reports a lost execution receipt as uncertain", async () => {
    const execute = vi
      .fn()
      .mockRejectedValue(
        new Error("Provider disconnected after accepting the request"),
      );
    vi.spyOn(apiRouter, "createCaller").mockReturnValue({
      operator: { createCourt: execute },
    } as unknown as ReturnType<typeof apiRouter.createCaller>);
    const conversation = await createAskDunaConversation(operator, {});
    const action = await proposeAskDunaOperation(operator, conversation.id, {
      ...proposal,
      input: validCourt,
    });
    expect(
      (
        await reviewAskDunaOperation(
          operator,
          conversation.id,
          action.id,
          "approve",
        )
      ).status,
    ).toBe("uncertain");
    await expect(
      reviewAskDunaOperation(operator, conversation.id, action.id, "approve"),
    ).rejects.toThrow();
    expect(execute).toHaveBeenCalledTimes(1);
    await db
      .update(schema.askDunaActions)
      .set({ status: "executing", updatedAt: new Date(0) });
    expect(
      (await listAskDunaActions(operator, conversation.id))[0]!.status,
    ).toBe("uncertain");
  });

  it("reports actual usage and does not invent a price for calls without reported cost", async () => {
    const conversation = await createAskDunaConversation(operator, {});
    await recordAskDunaEvent({
      id: "usage-1",
      conversationId: conversation.id,
      type: "step.completed",
      data: { usage: { inputTokens: 100, outputTokens: 50, costUsd: 0.005 } },
    });
    await recordAskDunaEvent({
      id: "usage-2",
      conversationId: conversation.id,
      type: "step.completed",
      data: { usage: { inputTokens: 200, outputTokens: 75 } },
    });
    expect((await getAskDunaAdminOverview(admin)).usage).toEqual({
      modelCalls: 2,
      costReportedCalls: 1,
      costUsd: 0.005,
      inputTokens: 300,
      outputTokens: 125,
    });
  });
  it("allows exactly one concurrent approval, scoped to the conversation", async () => {
    const conversation = await createAskDunaConversation(operator, {});
    const other = await createAskDunaConversation(operator, {});
    const action = await saveAskDunaAction(operator, conversation.id, proposal);
    expect(action.input.idempotencyKey).toBe(action.id);
    await expect(
      claimAskDunaAction(operator, other.id, action.id, "approve"),
    ).rejects.toThrow();
    const results = await Promise.allSettled([
      claimAskDunaAction(operator, conversation.id, action.id, "approve"),
      claimAskDunaAction(operator, conversation.id, action.id, "approve"),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    expect(await db.select().from(schema.auditLog)).toHaveLength(1);
  });

  it("rolls back a claim if its audit cannot be saved", async () => {
    const conversation = await createAskDunaConversation(operator, {});
    const action = await saveAskDunaAction(operator, conversation.id, proposal);
    await pg.exec(
      "alter table audit_log add constraint test_audit_failure check (action <> 'ask-duna.action.approve')",
    );
    try {
      await expect(
        claimAskDunaAction(operator, conversation.id, action.id, "approve"),
      ).rejects.toThrow();
      expect((await db.select().from(schema.askDunaActions))[0]!.status).toBe(
        "pending",
      );
    } finally {
      await pg.exec("alter table audit_log drop constraint test_audit_failure");
    }
  });

  it("rejects expired changes and respects the kill switch while allowing decline", async () => {
    const conversation = await createAskDunaConversation(operator, {});
    const expired = await saveAskDunaAction(
      operator,
      conversation.id,
      proposal,
    );
    await db
      .update(schema.askDunaActions)
      .set({ expiresAt: new Date(0) })
      .where(eq(schema.askDunaActions.id, expired.id));
    await expect(
      claimAskDunaAction(operator, conversation.id, expired.id, "approve"),
    ).rejects.toThrow("expired");
    const pending = await saveAskDunaAction(
      operator,
      conversation.id,
      proposal,
    );
    await updateAskDunaControls(admin, {
      enabled: true,
      mutationsEnabled: false,
    });
    await expect(
      claimAskDunaAction(operator, conversation.id, pending.id, "approve"),
    ).rejects.toThrow("paused");
    expect(
      (
        await claimAskDunaAction(
          operator,
          conversation.id,
          pending.id,
          "decline",
        )
      ).status,
    ).toBe("declined");
  });
});

describe("Ask Duna capability boundaries", () => {
  it("keeps the shared HQ setup checklist complete when workspace records are truncated", async () => {
    const base = loadDemoOperatorWorkspace(
      "10000000-0000-4000-8000-000000000001",
    );
    const workspace = {
      ...base,
      organization: { ...base.organization, id: organizationId },
      people: Array.from({ length: 1_000 }, () => base.people[0]!),
      theme: {
        ...base.theme,
        publishedAt: undefined,
        logoUrl: undefined,
        markUrl: undefined,
      },
    };
    const read = vi.fn().mockResolvedValue(workspace);
    const caller = vi.spyOn(apiRouter, "createCaller").mockReturnValue({
      operator: { workspace: read },
    } as unknown as ReturnType<typeof apiRouter.createCaller>);

    const result = await readAskDunaOperation(operator, "operator.workspace");

    expect(result).toMatchObject({
      organizationSetup: getOrganizationSetupReadiness(workspace),
      workspace: { truncated: true },
    });
    expect(JSON.stringify(result)).toContain("/settings/theme");
    expect(caller.mock.calls[0]![0]).toMatchObject({ actor: operator });
    expect(read).toHaveBeenCalledTimes(1);
    await expect(
      readAskDunaOperation({ ...operator, scopes: [] }, "operator.workspace"),
    ).rejects.toThrow("does not permit");
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("provides describable reviewed capabilities, with no admin, device, health or confirmation tools", () => {
    const catalog = askDunaOperationCatalog(operator);
    expect(catalog.length).toBeGreaterThan(100);
    for (const entry of catalog)
      expect(
        describeAskDunaOperation(operator, entry.name).inputSchema,
      ).toBeDefined();
    for (const name of [
      "admin.setPersonSuperAdmin",
      "operator.terminalConnectionToken",
      "operator.memberHealthProfile",
      "operator.confirmAction",
      "operator.scanTicket",
      "operator.newUnreviewedMutation",
    ])
      expect(() => describeAskDunaOperation(admin, name)).toThrow();
  });
  it("filters by current role and never runs a mutation through the read tool", async () => {
    const manager = {
      ...operator,
      roles: ["manager"] as typeof operator.roles,
      scopes: scopesForRoles(["manager"]),
    };
    expect(
      askDunaOperationCatalog(manager).some(
        (row) => row.scope === "payments:write",
      ),
    ).toBe(false);
    await expect(
      readAskDunaOperation(operator, "operator.createCourt", {}),
    ).rejects.toThrow("not available");
    const conversation = await createAskDunaConversation(operator, {});
    await expect(
      proposeAskDunaOperation(operator, conversation.id, {
        operation: "operator.createCourt",
        input: {},
        summary: "Invalid draft",
      }),
    ).rejects.toThrow();
    expect(await db.select().from(schema.askDunaActions)).toHaveLength(0);
  });
});
