import { websiteWorkspaceDemo } from "@duna/core/demo/website-workspace";
import {
  websiteChangeCheckKinds,
  websiteChangeCheckStatuses,
  websiteChangeJobStatuses,
  websiteChangeLanes,
  websiteChangeMessageRoles,
  websiteChangePageKinds,
  websiteChangeStatuses,
  websitePageManagers,
  websitePageStatuses,
  websitePublishEventKinds,
} from "@duna/db/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiContext, createDemoActor } from "../context";
import { createCaller } from "../router";
import { isNotImplementedYet } from "../routers/not-implemented";
import { expectCoverage } from "./w3-test-support";
import {
  websiteWorkspaceChangeSchema,
  websiteWorkspacePagesSchema,
  websiteWorkspaceSitesSchema,
  websiteWorkspaceVersionsSchema,
} from "./website-workspace";

// The connected path is simulated by switching only the data-source rule;
// sign-in and organisation checks still run in demo mode (no database).
const dataSource = vi.hoisted(() => ({ demo: true }));
vi.mock("../services/data-source", () => ({
  usesDemoData: () => dataSource.demo,
}));

const demo = websiteWorkspaceDemo;

describe("website-workspace contract and demo fixtures (W3-0)", () => {
  it("every fixture parses against its contract", () => {
    websiteWorkspaceSitesSchema.parse(demo.sites);
    websiteWorkspacePagesSchema.parse(demo.pages);
    for (const change of demo.changes)
      websiteWorkspaceChangeSchema.parse(change);
    websiteWorkspaceVersionsSchema.parse(demo.versions);
  });

  it("covers every state of every state machine", () => {
    expectCoverage(
      websitePageManagers,
      demo.pages.pages.map((p) => p.managedBy),
    );
    expectCoverage(
      websitePageStatuses,
      demo.pages.pages.map((p) => p.status),
    );
    expectCoverage(
      websiteChangeLanes,
      demo.changes.map((c) => c.lane),
    );
    expectCoverage(
      websiteChangeStatuses,
      demo.changes.map((c) => c.status),
    );
    expectCoverage(
      websiteChangePageKinds,
      demo.changes.flatMap((c) => c.pages.map((p) => p.kind)),
    );
    expectCoverage(
      websiteChangeJobStatuses,
      demo.changes.flatMap((c) => c.jobs.map((j) => j.status)),
    );
    const checks = demo.changes.flatMap((c) => c.checks);
    expectCoverage(
      websiteChangeCheckKinds,
      checks.map((c) => c.kind),
    );
    expectCoverage(
      websiteChangeCheckStatuses,
      checks.map((c) => c.status),
    );
    expectCoverage(
      websiteChangeMessageRoles,
      demo.changes.flatMap((c) => c.messages.map((m) => m.role)),
    );
    expectCoverage(
      websitePublishEventKinds,
      demo.versions.events.map((e) => e.kind),
    );
  });
});

describe("operator.websiteWorkspace in demo mode and connected mode (W3-0 stubs)", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    dataSource.demo = true;
  });

  const caller = () =>
    createCaller(createApiContext({ actor: createDemoActor() })).operator
      .websiteWorkspace;

  it("serves fixtures in demo mode", async () => {
    const workspace = caller();
    const { sites } = await workspace.sites();
    const site = sites[0]!;
    const { changes } = await workspace.changes({ siteId: site.siteId });
    expect(changes).toHaveLength(10);
    const ready = changes.find((c) => c.status === "ready-for-review")!;
    const result = await workspace.publish({
      changeId: ready.changeId,
      idempotencyKey: "website-publish-1",
    });
    expect(result.event.version).toBe(site.liveVersion! + 1);
    const stale = changes.find((c) => c.status === "out-of-date")!;
    await expect(
      workspace.publish({
        changeId: stale.changeId,
        idempotencyKey: "website-publish-2",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const created = await workspace.createChange({
      siteId: site.siteId,
      requestText: "Add our winter hours",
      lane: "content",
    });
    expect(created.laneOverriddenFrom).toBe("club-facts");
  });

  it("says 'not implemented yet' outside demo mode", async () => {
    dataSource.demo = false;
    const error = await caller()
      .sites()
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(isNotImplementedYet(error)).toBe(true);
  });
});
