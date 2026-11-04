import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import {
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import * as schema from "@duna/db/schema";
import type { ApiActor } from "./context";
const mocks = vi.hoisted(() => ({
  db: null as unknown,
  query: vi.fn(),
  transaction: vi.fn(),
  active: vi.fn(),
}));
vi.mock("@duna/db", async (original) => ({
  ...(await original<object>()),
  getDatabase: () => mocks.db,
  getTransactionalDatabase: () => mocks.db,
}));
vi.mock("@neondatabase/serverless", () => ({
  neon: () => ({ query: mocks.query, transaction: mocks.transaction }),
}));
vi.mock("./website-billing", async (original) => ({
  ...(await original<object>()),
  getWebsiteBilling: mocks.active,
}));
import {
  publishWebsiteRevision,
  readPublishStatus,
} from "./website-provisioning";
const pg = new PGlite(),
  db = drizzle(pg, { schema });
mocks.db = db;
const siteId = "10000000-0000-4000-8000-000000000001",
  revisionId = "10000000-0000-4000-8000-000000000002",
  org = "10000000-0000-4000-8000-000000000003",
  otherRevision = "10000000-0000-4000-8000-000000000004";
const actor: ApiActor = {
  personId: org,
  organizationId: org,
  displayName: "Owner",
  roles: ["owner"],
  scopes: ["*"],
  ageBand: "adult",
  isDemo: false,
};
const pages = [{ path: "/", html: "<html><body>Club</body></html>" }];
let deployment: {
  id: string;
  url: string;
  projectId: string;
  readyState: string;
  meta: Record<string, string>;
};
let providerFetch: ReturnType<typeof vi.fn>;
beforeAll(async () => {
  for (const file of [
    "0109_adorable_gideon",
    "0111_deep_network",
    "0113_married_victor_mancha",
  ])
    await pg.exec(
      readFileSync(
        new URL(`../../db/drizzle/${file}.sql`, import.meta.url),
        "utf8",
      ),
    );
});
afterAll(async () => {
  await pg.close();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  await pg.exec(
    "TRUNCATE website_credit_reservations,website_credit_grants,website_subscriptions,website_revisions,club_websites CASCADE",
  );
  await db
    .insert(schema.websiteSites)
    .values({ id: siteId, organizationId: org, name: "Club" });
  for (const id of [revisionId, otherRevision])
    await db.insert(schema.websiteRevisions).values({
      id,
      siteId,
      organizationId: org,
      createdBy: org,
      brief: "Build",
      document: {},
    });
  mocks.active.mockResolvedValue({ active: true });
  mocks.query
    .mockReset()
    .mockResolvedValue([{ content_hash: "existing-snapshot" }]);
  for (const [key, value] of Object.entries({
    DUNA_SITES_VERCEL_TOKEN: "test-token",
    DUNA_SITES_VERCEL_TEAM_ID: "team_duna",
    DUNA_SITES_NEON_API_KEY: "test-neon",
    DUNA_SITES_NEON_ORG_ID: "org_duna",
  }))
    vi.stubEnv(key, value);
  providerFetch = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = new URL(input);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    const json = (value: unknown) => Response.json(value);
    if (url.hostname === "api.vercel.com") {
      if (url.pathname.startsWith("/v4/aliases/"))
        return json({ projectId: "prj_site", deploymentId: deployment.id });
      if (url.pathname.startsWith("/v9/projects/"))
        return json({
          id: "prj_site",
          name: `duna-club-${siteId}`,
          accountId: "team_duna",
        });
      if (url.pathname.endsWith("/env")) return json({ created: true });
      if (url.pathname === "/v13/deployments") {
        deployment = {
          id: `dpl_${body.meta.dunaRevisionId}`,
          url: "release.vercel.app",
          projectId: "prj_site",
          readyState: "READY",
          meta: body.meta,
        };
        return json(deployment);
      }
      if (url.pathname.endsWith("/aliases"))
        return json({ aliases: [{ alias: `duna-club-${siteId}.vercel.app` }] });
      if (url.pathname.startsWith("/v13/deployments/")) return json(deployment);
    }
    if (url.hostname === "console.neon.tech") {
      if (url.pathname.endsWith("/connection_uri"))
        return json({
          uri: "postgresql://owner:password@ep-site.neon.tech/neondb",
        });
      if (url.pathname.endsWith("/projects"))
        return json({
          projects: [
            {
              id: "neon_site",
              name: `duna-club-${siteId}`,
              org_id: "org_duna",
            },
          ],
        });
      if (url.pathname.endsWith("/projects/neon_site"))
        return json({
          project: {
            id: "neon_site",
            name: `duna-club-${siteId}`,
            org_id: "org_duna",
          },
        });
    }
    if (url.hostname.endsWith(".vercel.app"))
      return new Response("<html>Club</html>", {
        headers: { "x-duna-revision": deployment.meta.dunaRevisionId! },
      });
    throw new Error(`Unexpected test request ${url.pathname}`);
  });
  vi.stubGlobal("fetch", providerFetch);
});
describe("durable website publication", () => {
  it("persists scoped resources and only marks published after deployment and alias health pass", async () => {
    const result = await publishWebsiteRevision(
      actor,
      siteId,
      revisionId,
      pages,
    );
    expect(result.status).toBe("deploying");
    const pending = await db.query.websiteSites.findFirst({
      where: eq(schema.websiteSites.id, siteId),
    });
    expect(pending?.publishLeaseId).toBeTruthy();
    expect(pending?.neonProjectId).toBe("neon_site");
    expect(pending?.vercelProjectId).toBe("prj_site");
    expect((await readPublishStatus(actor, siteId)).status).toBe("published");
    const complete = await db.query.websiteSites.findFirst({
      where: eq(schema.websiteSites.id, siteId),
    });
    expect(complete?.publishedRevisionId).toBe(revisionId);
    expect(complete?.publishLeaseId).toBeNull();
  });
  it("blocks concurrent revisions through the entire deployment lifecycle", async () => {
    await publishWebsiteRevision(actor, siteId, revisionId, pages);
    await expect(
      publishWebsiteRevision(actor, siteId, otherRevision, pages),
    ).rejects.toThrow("already in progress");
    expect(
      providerFetch.mock.calls.filter(
        ([url, init]) =>
          String(url).includes("/v13/deployments?") && init?.method === "POST",
      ),
    ).toHaveLength(1);
  });
  it("does not publish a built deployment when the production alias serves another revision", async () => {
    await publishWebsiteRevision(actor, siteId, revisionId, pages);
    const original = providerFetch.getMockImplementation() as (
      input: string | URL,
      init?: RequestInit,
    ) => Promise<Response>;
    providerFetch.mockImplementation(async (input, init) =>
      new URL(input).hostname === `duna-club-${siteId}.vercel.app`
        ? new Response("old", { headers: { "x-duna-revision": otherRevision } })
        : original(input, init),
    );
    await expect(readPublishStatus(actor, siteId)).rejects.toThrow(
      "production address",
    );
    expect(
      (
        await db.query.websiteSites.findFirst({
          where: eq(schema.websiteSites.id, siteId),
        })
      )?.publishedRevisionId,
    ).toBeNull();
  });
  it("rejects cross-tenant and unpaid publication before provider mutations", async () => {
    await expect(
      publishWebsiteRevision(
        { ...actor, organizationId: otherRevision },
        siteId,
        revisionId,
        pages,
      ),
    ).rejects.toThrow("not found");
    mocks.active.mockResolvedValue({ active: false });
    await expect(
      publishWebsiteRevision(actor, siteId, revisionId, pages),
    ).rejects.toThrow("subscription");
    expect(providerFetch).not.toHaveBeenCalled();
  });
  it("rollback creates a new production deployment but reuses immutable site content", async () => {
    await publishWebsiteRevision(actor, siteId, revisionId, pages);
    await readPublishStatus(actor, siteId);
    const first = deployment.meta.dunaPublishId;
    await publishWebsiteRevision(actor, siteId, revisionId, [
      { path: "/", html: "<html>Changed context</html>" },
    ]);
    expect(deployment.meta.dunaPublishId).not.toBe(first);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("fences stale status readers before they can move aliases or overwrite a newer publication", async () => {
    await publishWebsiteRevision(actor, siteId, revisionId, pages);
    const original = providerFetch.getMockImplementation() as (
      input: string | URL,
      init?: RequestInit,
    ) => Promise<Response>;
    providerFetch.mockImplementation(async (input, init) => {
      if (new URL(input).pathname.startsWith("/v13/deployments/"))
        await db
          .update(schema.websiteSites)
          .set({
            publishLeaseId: "10000000-0000-4000-8000-000000000099",
            publishingRevisionId: otherRevision,
            provisioningStatus: "provisioning",
          })
          .where(eq(schema.websiteSites.id, siteId));
      return original(input, init);
    });
    expect((await readPublishStatus(actor, siteId)).status).toBe("superseded");
    const site = await db.query.websiteSites.findFirst({
      where: eq(schema.websiteSites.id, siteId),
    });
    expect(site?.publishingRevisionId).toBe(otherRevision);
    expect(site?.provisioningStatus).toBe("provisioning");
    expect(site?.publishedRevisionId).toBeNull();
    expect(
      providerFetch.mock.calls.some(([url]) =>
        String(url).includes("/v4/aliases/"),
      ),
    ).toBe(false);
  });
});
