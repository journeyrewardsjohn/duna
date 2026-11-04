import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, eq } from "drizzle-orm";
import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import * as schema from "@duna/db/schema";
import type { ApiActor } from "./context";
const state = vi.hoisted(() => ({
  db: null as unknown,
  actor: vi.fn(),
  run: vi.fn(),
  credential: vi.fn(),
  rate: vi.fn(),
  workspace: vi.fn(),
}));
vi.mock("@duna/db", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getDatabase: () => state.db,
  getTransactionalDatabase: () => state.db,
}));
vi.mock("./payments", () => ({
  getStripeClient: vi.fn(),
  createBillingPortalSession: vi.fn(),
}));
vi.mock("./ask-duna-store", () => ({ resolveAskDunaActor: state.actor }));
vi.mock("./duna-ai", () => ({
  resolveDunaAiGatewayCredential: state.credential,
}));
vi.mock("./rate-limit", () => ({ consumeRateLimit: state.rate }));
vi.mock("./operator-service", () => ({
  loadOperatorWorkspace: state.workspace,
}));
vi.mock("@openai/agents", () => ({
  Agent: class {},
  OpenAIProvider: class {},
  Runner: class {
    run = state.run;
  },
}));
import {
  processWebsiteRevision,
  processPendingWebsiteRevisions,
  requestWebsiteRevision,
  updateWebsiteBrief,
  websitePreview,
  websitePublishPages,
} from "./website-service";
import { reserveWebsiteCredits } from "./website-billing";
const pg = new PGlite();
const db = drizzle(pg, { schema });
state.db = db;
const org = "10000000-0000-4000-8000-000000000001",
  siteId = "10000000-0000-4000-8000-000000000002",
  operationId = "10000000-0000-4000-8000-000000000003";
const actor: ApiActor = {
  personId: org,
  displayName: "Owner",
  roles: ["owner"],
  organizationId: org,
  scopes: ["*"],
  ageBand: "adult",
  isDemo: false,
};
const doc = {
  title: "Club",
  description: "Our club",
  headline: "Come play",
  introduction: "Join us",
  actionLabel: "Explore",
  style: "minimal",
  color: "#000000",
  pages: [
    {
      slug: "home",
      title: "Home",
      sections: [{ heading: "Welcome", body: "Our community", kind: "story" }],
    },
  ],
  changeSummary: "First draft",
};
async function revision(
  values: Partial<typeof schema.websiteRevisions.$inferInsert> = {},
) {
  const [r] = await db
    .insert(schema.websiteRevisions)
    .values({
      siteId,
      organizationId: org,
      createdBy: org,
      operationId,
      brief: "Build my website",
      status: "queued",
      document: { creditCost: 25 },
      ...values,
    })
    .returning();
  return r!;
}
async function balance() {
  return (await db.select().from(schema.websiteCreditGrants))[0]!.remaining;
}
beforeAll(async () => {
  await pg.exec(
    readFileSync(
      new URL("../../db/drizzle/0109_adorable_gideon.sql", import.meta.url),
      "utf8",
    ),
  );
  await pg.exec(
    readFileSync(
      new URL("../../db/drizzle/0111_deep_network.sql", import.meta.url),
      "utf8",
    ),
  );
  await pg.exec(
    readFileSync(
      new URL(
        "../../db/drizzle/0113_married_victor_mancha.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await pg.exec(
    `CREATE TABLE audit_log(id uuid DEFAULT gen_random_uuid() PRIMARY KEY,organization_id uuid,actor_person_id uuid,actor_type varchar(24) NOT NULL,action varchar(96) NOT NULL,entity_type varchar(48) NOT NULL,entity_id text NOT NULL,reason text NOT NULL,before_hash varchar(128),after_hash varchar(128),trace_id varchar(128),conversation_id varchar(128),ip_address varchar(64),created_at timestamptz DEFAULT now());`,
  );
});
afterAll(() => pg.close());
beforeEach(async () => {
  vi.clearAllMocks();
  state.actor.mockResolvedValue(actor);
  state.workspace.mockResolvedValue({
    organization: { name: "Club", slug: "club" },
    theme: {},
    brandKnowledge: { contextPreview: "" },
    catalog: [],
  });
  state.credential.mockReturnValue("test");
  state.rate.mockResolvedValue({ allowed: true });
  state.run.mockResolvedValue({ finalOutput: doc });
  await pg.exec(
    "TRUNCATE website_credit_reservations, website_credit_grants, website_subscriptions, website_revisions, club_websites, audit_log CASCADE",
  );
  await db
    .insert(schema.websiteSites)
    .values({ id: siteId, organizationId: org, name: "Club" });
  await db.insert(schema.websiteSubscriptions).values({
    siteId,
    organizationId: org,
    status: "active",
    periodEndsAt: new Date(Date.now() + 86400000),
  });
  await db.insert(schema.websiteCreditGrants).values({
    siteId,
    organizationId: org,
    sourceId: "paid-period",
    credits: 1000,
    remaining: 1000,
    expiresAt: new Date(Date.now() + 86400000),
  });
});
describe("website generation durable lifecycle", () => {
  it("bounds free previews per rolling day and permits recovery after the window", async () => {
    for (let index = 0; index < 3; index++)
      await revision({
        status: "failed",
        operationId: crypto.randomUUID(),
        document: { creditCost: 0 },
      });
    const request = {
      siteId,
      prompt: "Build our new club website",
      operationId: crypto.randomUUID(),
    };
    await expect(requestWebsiteRevision(actor, request)).rejects.toThrow(
      "refresh after 24 hours",
    );
    await db
      .update(schema.websiteRevisions)
      .set({ createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) });
    expect((await requestWebsiteRevision(actor, request)).status).toBe(
      "queued",
    );
  });
  it("keeps edits billable after a completed preview fails during publishing", async () => {
    await revision({
      status: "failed",
      document: { ...doc, creditCost: 0 },
    });
    await db
      .update(schema.websiteSites)
      .set({ draft: doc })
      .where(eq(schema.websiteSites.id, siteId));
    const next = await requestWebsiteRevision(actor, {
      siteId,
      prompt: "Please refine our homepage",
      operationId: crypto.randomUUID(),
    });
    expect(
      (next.document as { creditCost: number }).creditCost,
    ).toBeGreaterThan(0);
  });
  it("freezes the approved public context across preview, publication and rollback", async () => {
    const r = await revision();
    await processWebsiteRevision(r.id);
    const preview = await websitePreview(actor, siteId, r.id);
    const published = await websitePublishPages(actor, siteId, r.id);
    state.workspace.mockResolvedValue({
      organization: { name: "Changed Club", slug: "changed" },
      theme: {},
      brandKnowledge: { contextPreview: "" },
      catalog: [],
    });
    await db
      .update(schema.websiteSites)
      .set({ domain: "new.example.org" })
      .where(eq(schema.websiteSites.id, siteId));
    expect(await websitePreview(actor, siteId, r.id)).toBe(preview);
    expect(await websitePublishPages(actor, siteId, r.id)).toEqual(published);
    await db
      .update(schema.websiteRevisions)
      .set({ status: "published" })
      .where(eq(schema.websiteRevisions.id, r.id));
    expect(await websitePublishPages(actor, siteId, r.id)).toEqual(published);
    expect(published[0]!.html).not.toContain("Changed Club");
  });
  it("updates or clears website references without resetting generation history", async () => {
    await revision({ status: "failed" });
    const updated = await updateWebsiteBrief(actor, {
      siteId,
      brief: "Lead with junior programs",
      sourceUrl: "https://club.example.org",
      inspirationUrls: ["https://design.example.org"],
    });
    expect(updated.sourceUrl).toBe("https://club.example.org/");
    const cleared = await updateWebsiteBrief(actor, {
      siteId,
      brief: "Lead with junior programs",
      sourceUrl: "",
      inspirationUrls: [],
    });
    expect(cleared.sourceUrl).toBeNull();
    expect(cleared.inspirationUrls).toEqual([]);
    expect(await db.select().from(schema.websiteRevisions)).toHaveLength(1);
  });
  it("rejects reference changes during generation and for another club", async () => {
    await revision();
    await expect(
      updateWebsiteBrief(actor, { siteId, brief: "Lead with junior programs" }),
    ).rejects.toThrow("Wait for the current edit");
    await expect(
      updateWebsiteBrief(
        { ...actor, organizationId: "20000000-0000-4000-8000-000000000001" },
        { siteId, brief: "Lead with junior programs" },
      ),
    ).rejects.toThrow("not found");
  });
  it("settles once only with a usable draft and audit receipt", async () => {
    const r = await revision();
    await processWebsiteRevision(r.id);
    await processWebsiteRevision(r.id);
    expect(await balance()).toBe(975);
    expect(state.run).toHaveBeenCalledTimes(1);
    expect(
      (
        await db.query.websiteRevisions.findFirst({
          where: eq(schema.websiteRevisions.id, r.id),
        })
      )?.status,
    ).toBe("draft");
    expect(
      (
        await db.query.websiteSites.findFirst({
          where: eq(schema.websiteSites.id, siteId),
        })
      )?.draft,
    ).toEqual(doc);
  });
  it("refunds generation failure and leaves the previous draft unchanged", async () => {
    await db
      .update(schema.websiteSites)
      .set({ draft: { previous: true } })
      .where(eq(schema.websiteSites.id, siteId));
    state.run.mockRejectedValue(new Error("provider down"));
    const r = await revision();
    await processWebsiteRevision(r.id);
    expect(await balance()).toBe(1000);
    expect((await db.query.websiteSites.findFirst())?.draft).toEqual({
      previous: true,
    });
    expect((await db.query.websiteRevisions.findFirst())?.status).toBe(
      "failed",
    );
  });
  it("recovers a saved document without charging for or running generation again", async () => {
    const r = await revision({
      status: "generated",
      attempts: 1,
      leaseExpiresAt: new Date(0),
      document: { ...doc, creditCost: 25 },
    });
    await reserveWebsiteCredits({ actor, siteId, operationId, credits: 25 });
    await processWebsiteRevision(r.id);
    expect(state.run).not.toHaveBeenCalled();
    expect(await balance()).toBe(975);
    expect((await db.query.websiteRevisions.findFirst())?.status).toBe("draft");
  });
  it("returns reserved credits even after the initiating owner loses access", async () => {
    const r = await revision({
      status: "generating",
      attempts: 1,
      leaseExpiresAt: new Date(0),
    });
    await reserveWebsiteCredits({ actor, siteId, operationId, credits: 25 });
    state.actor.mockRejectedValue(new Error("revoked"));
    await processWebsiteRevision(r.id);
    expect(await balance()).toBe(1000);
    expect((await db.query.websiteRevisions.findFirst())?.status).toBe(
      "failed",
    );
  });
  it("clears exhausted stale jobs and restores their reservation", async () => {
    await revision({
      status: "generating",
      attempts: 3,
      leaseExpiresAt: new Date(0),
    });
    await reserveWebsiteCredits({ actor, siteId, operationId, credits: 25 });
    await processPendingWebsiteRevisions();
    expect(await balance()).toBe(1000);
    expect((await db.query.websiteRevisions.findFirst())?.status).toBe(
      "failed",
    );
  });
  it("returns a replay before rate limiting or unavailable provider checks", async () => {
    const r = await revision();
    state.credential.mockReturnValue(undefined);
    state.rate.mockResolvedValue({ allowed: false });
    expect(
      (
        await requestWebsiteRevision(actor, {
          siteId,
          prompt: r.brief,
          operationId,
        })
      ).id,
    ).toBe(r.id);
    expect(state.rate).not.toHaveBeenCalled();
    await expect(
      requestWebsiteRevision(actor, {
        siteId,
        prompt: "A different edit",
        operationId,
      }),
    ).rejects.toThrow("different edit");
  });
  it("never charges when draft persistence fails", async () => {
    await pg.exec(
      `CREATE FUNCTION reject_website_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test write failure'; END; $$; CREATE TRIGGER reject_website_update BEFORE UPDATE ON club_websites FOR EACH ROW EXECUTE FUNCTION reject_website_update();`,
    );
    try {
      const r = await revision();
      await processWebsiteRevision(r.id);
      expect(await balance()).toBe(1000);
      expect((await db.query.websiteRevisions.findFirst())?.status).toBe(
        "failed",
      );
    } finally {
      await pg.exec(
        "DROP TRIGGER reject_website_update ON club_websites; DROP FUNCTION reject_website_update();",
      );
    }
  });
  it("fences a late worker after recovery has taken ownership", async () => {
    const r = await revision();
    state.run.mockImplementationOnce(async () => {
      await db
        .update(schema.websiteRevisions)
        .set({ attempts: 2, status: "failed" })
        .where(
          and(
            eq(schema.websiteRevisions.id, r.id),
            eq(schema.websiteRevisions.attempts, 1),
          ),
        );
      return { finalOutput: doc };
    });
    await processWebsiteRevision(r.id);
    expect((await db.query.websiteRevisions.findFirst())?.status).toBe(
      "failed",
    );
    expect((await db.query.websiteSites.findFirst())?.draft).toBeNull();
  });
});
