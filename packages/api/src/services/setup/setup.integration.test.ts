/**
 * AI setup end to end against an in-memory Postgres with every migration:
 * a full run with the reader and the model replaced by recordings, resume
 * after an interruption, cancel, hostile sites, review, audited idempotent
 * apply, a re-read that proposes only differences, the profile by hand and
 * readiness.
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

import { ProviderNotConfiguredError } from "@duna/observability";
import {
  applyAllMigrations,
  createCatalogTestDatabase,
} from "../../catalog-booking.test-support";
import {
  setupApplyResultSchema,
  setupProfileSchema,
  setupProposalSchema,
  setupReadinessSchema,
  setupRunSchema,
} from "../../contracts/setup";
import {
  emptySetupExtraction,
  type SetupRawExtraction,
} from "./extraction-schema";
import type { SetupExtractor } from "./extractor";
import {
  harborExtractions,
  harborOrigin,
  harborPages,
} from "./fixtures/harbor-sands";
import {
  advanceSetupRun,
  applySetupProposals,
  cancelSetupRun,
  computeSetupReadiness,
  decideSetupProposal,
  decideSetupProposalGroup,
  getSetupRun,
  listSetupProposals,
  loadSetupProfile,
  processPendingSetupRuns,
  setupLimits,
  startSetupRun,
  updateSetupProfile,
  type SetupRunDependencies,
} from ".";
import type { SetupReaderPage, SetupSiteReader } from "./reader";

const { pg, db } = createCatalogTestDatabase();
state.db = db;

const org = "61000000-0000-4000-8000-000000000001";
const owner = "62000000-0000-4000-8000-000000000001";
const now = new Date("2026-12-01T12:00:00.000Z");

async function seed() {
  await pg.exec(`
    TRUNCATE organizations, people CASCADE;
    INSERT INTO organizations (id, slug, name, currency, timezone, country_code)
      VALUES ('${org}', 'harbor-test', 'Harbor Test', 'USD', 'America/Los_Angeles', 'US');
    INSERT INTO people (id, display_name, handle) VALUES ('${owner}', 'Owner', 'owner-setup');
    INSERT INTO organization_memberships (organization_id, person_id, role)
      VALUES ('${org}', '${owner}', 'owner');
  `);
}

interface Recorder {
  readonly reads: string[];
  readonly modelInputs: { source: string; text: string }[];
}

function harness(
  options: {
    pages?: Readonly<Record<string, SetupReaderPage>>;
    extractions?: Readonly<Record<string, SetupRawExtraction>>;
    robots?: string;
    resolve?: (hostname: string) => readonly string[];
    clock?: () => Date;
  } = {},
): { deps: SetupRunDependencies; recorder: Recorder; scheduled: string[] } {
  const recorder: Recorder = { reads: [], modelInputs: [] };
  const scheduled: string[] = [];
  const pages = options.pages ?? harborPages;
  const extractions = options.extractions ?? harborExtractions;
  const reader: SetupSiteReader = {
    async read(url) {
      recorder.reads.push(url);
      const page = pages[url] ?? pages[url.replace(/\/$/, "")];
      if (!page) {
        return { finalUrl: url, statusCode: 404, markdown: "", links: [] };
      }
      return page;
    },
    async readRobots() {
      return options.robots;
    },
  };
  const extractor: SetupExtractor = async (input) => {
    recorder.modelInputs.push(input);
    return extractions[input.source] ?? emptySetupExtraction;
  };
  return {
    recorder,
    scheduled,
    deps: {
      reader,
      extractor,
      resolveHost: async (hostname) =>
        options.resolve?.(hostname) ?? ["151.101.1.1"],
      schedule: (runId) => {
        scheduled.push(runId);
      },
      clock: options.clock ?? (() => now),
    },
  };
}

async function startHarbor(deps: SetupRunDependencies, at = now) {
  return startSetupRun({
    organizationId: org,
    personId: owner,
    request: {
      sourceKind: "website",
      sourceUrl: `${harborOrigin}/?utm_source=ad`,
    },
    now: at,
    deps,
  });
}

async function runToReview(deps: SetupRunDependencies) {
  const started = await startHarbor(deps);
  await advanceSetupRun(started.id, deps);
  return getSetupRun({ organizationId: org, runId: started.id, now, deps });
}

beforeAll(() => applyAllMigrations(pg), 180_000);
afterAll(() => pg.close());
beforeEach(seed);

describe("a full website read", () => {
  it("reads a bounded set of pages and opens a review of merged, sourced proposals", async () => {
    const { deps, recorder, scheduled } = harness();
    const started = await startHarbor(deps);
    expect(setupRunSchema.parse(started)).toMatchObject({
      status: "queued",
      sourceUrl: `${harborOrigin}/`,
      pagesTotal: 1,
    });
    expect(scheduled).toEqual([started.id]);

    await advanceSetupRun(started.id, deps);
    const run = setupRunSchema.parse(
      await getSetupRun({ organizationId: org, runId: started.id, now, deps }),
    );
    expect(run).toMatchObject({ status: "review", outcome: "complete" });
    expect(
      run.pages.map((page) => [new URL(page.url).pathname, page.status]),
    ).toEqual([
      ["/", "read"],
      ["/contact", "read"],
      ["/about", "failed"],
      ["/lessons", "read"],
      ["/coaches", "read"],
      ["/policies", "read"],
    ]);
    expect(run.pagesRead).toBe(5);
    // Never off-site, never a file, never the blog.
    expect(recorder.reads.every((url) => url.startsWith(harborOrigin))).toBe(
      true,
    );
    expect(recorder.reads.some((url) => /blog|\.pdf/.test(url))).toBe(false);

    const { proposals } = await listSetupProposals({
      organizationId: org,
      runId: run.id,
    });
    for (const proposal of proposals) setupProposalSchema.parse(proposal);
    expect(run.itemsFound).toBe(proposals.length);
    expect(proposals.every((p) => p.decision === "pending")).toBe(true);
    expect(proposals.some((p) => "mergeKey" in p.payload)).toBe(false);
    const phone = proposals.find((p) => p.fieldKey === "contact.phone");
    expect(phone).toMatchObject({
      sourcePages: ["/", "/contact"],
      needsCheck: true,
      candidates: [
        expect.objectContaining({ value: "+13105550142" }),
        expect.objectContaining({ value: "+13105550199" }),
      ],
    });
    expect(proposals.some((p) => p.label === "Jordan Vale")).toBe(false);
    expect(new Set(proposals.map((p) => p.category))).toEqual(
      new Set([
        "identity",
        "contact",
        "places",
        "offerings",
        "team",
        "policies",
      ]),
    );
  });

  it("starting twice returns the same run; a different site while reading is refused", async () => {
    const { deps } = harness();
    const first = await startHarbor(deps);
    const again = await startHarbor(deps);
    expect(again.id).toBe(first.id);
    await expect(
      startSetupRun({
        organizationId: org,
        personId: owner,
        request: {
          sourceKind: "website",
          sourceUrl: "https://other-fixture.club/",
        },
        now,
        deps,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("a description run needs no website", async () => {
    const description =
      "We are Tidewater Volleyball, a small beach club. Call us at (619) 555-0123 to book a private lesson.";
    const { deps } = harness({
      extractions: {
        description: {
          ...emptySetupExtraction,
          clubName: {
            value: "Tidewater Volleyball",
            quote: "We are Tidewater Volleyball, a small beach club.",
          },
          phones: [
            {
              value: "(619) 555-0123",
              quote: "Call us at (619) 555-0123 to book a private lesson.",
            },
          ],
        },
      },
    });
    const started = await startSetupRun({
      organizationId: org,
      personId: owner,
      request: { sourceKind: "description", sourceText: description },
      now,
      deps,
    });
    expect(started.pages).toEqual([]);
    await advanceSetupRun(started.id, deps);
    const run = await getSetupRun({
      organizationId: org,
      runId: started.id,
      now,
      deps,
    });
    expect(run).toMatchObject({
      status: "review",
      outcome: "no-website",
      itemsFound: 2,
    });
  });
});

describe("resumable, idempotent, cancellable", () => {
  it("survives a serverless timeout and a crash mid-page without reading anything twice", async () => {
    let tick = now.getTime();
    // Each clock read advances 7 s: the 40 s step budget runs out mid-run.
    const { deps, recorder, scheduled } = harness({
      clock: () => new Date((tick += 7_000)),
    });
    const started = await startHarbor(deps);
    await advanceSetupRun(started.id, deps);
    let run = await getSetupRun({
      organizationId: org,
      runId: started.id,
      now: new Date(tick),
      deps,
    });
    expect(run.status).toBe("reading");
    expect(
      scheduled.filter((id) => id === run.id).length,
    ).toBeGreaterThanOrEqual(2);
    const readBefore = run.pagesRead;
    expect(readBefore).toBeGreaterThan(0);

    // A crash: a page left "reading" by a step that died; its lease lapses.
    const queued = run.pages.find((page) => page.status === "queued")!;
    await pg.query(
      `UPDATE setup_run_pages SET status = 'reading' WHERE id = $1`,
      [queued.id],
    );
    await pg.query(`UPDATE setup_runs SET updated_at = $2 WHERE id = $1`, [
      run.id,
      new Date(tick - setupLimits.leaseMs - 60_000),
    ]);

    // A second worker while the run is held does nothing.
    const fresh = harness();
    await pg.query(`UPDATE setup_runs SET updated_at = $2 WHERE id = $1`, [
      run.id,
      new Date(tick),
    ]);
    await advanceSetupRun(run.id, {
      ...fresh.deps,
      clock: () => new Date(tick),
    });
    expect(fresh.recorder.reads).toEqual([]);
    await pg.query(`UPDATE setup_runs SET updated_at = $2 WHERE id = $1`, [
      run.id,
      new Date(tick - setupLimits.leaseMs - 60_000),
    ]);

    // The cron (or the next poll) takes over and finishes.
    const resumed = harness({ clock: () => new Date(tick) });
    await expect(
      processPendingSetupRuns({ now: new Date(tick), deps: resumed.deps }),
    ).resolves.toEqual({ advanced: 1 });
    run = await getSetupRun({
      organizationId: org,
      runId: run.id,
      now: new Date(tick),
      deps,
    });
    expect(run.status).toBe("review");
    const allReads = [...recorder.reads, ...resumed.recorder.reads];
    expect(new Set(allReads).size).toBe(allReads.length);
    expect(resumed.recorder.reads).toContain(queued.url);
    const { proposals } = await listSetupProposals({
      organizationId: org,
      runId: run.id,
    });
    const names = proposals.filter((p) => p.fieldKey === "identity.name");
    expect(names).toHaveLength(1);
  });

  it("can be cancelled while reading; nothing found is kept and no step resumes it", async () => {
    let tick = now.getTime();
    const { deps } = harness({ clock: () => new Date((tick += 15_000)) });
    const started = await startHarbor(deps);
    await advanceSetupRun(started.id, deps);
    const cancelled = await cancelSetupRun({
      organizationId: org,
      runId: started.id,
      now,
    });
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.pages.some((page) => page.status === "queued")).toBe(
      false,
    );
    const { proposals } = await listSetupProposals({
      organizationId: org,
      runId: started.id,
    });
    expect(proposals).toEqual([]);
    const later = harness();
    await advanceSetupRun(started.id, later.deps);
    expect(later.recorder.reads).toEqual([]);
    await expect(
      cancelSetupRun({ organizationId: org, runId: started.id, now }),
    ).resolves.toMatchObject({ status: "cancelled" });
  });

  it("limits runs per club per day", async () => {
    const { deps } = harness();
    for (let n = 0; n < setupLimits.runsPerClubPerDay; n += 1) {
      await pg.query(
        `INSERT INTO setup_runs (organization_id, source_kind, source_url, status, created_at, updated_at)
         VALUES ($1, 'website', $2, 'cancelled', $3, $3)`,
        [org, `${harborOrigin}/`, new Date(now.getTime() - 60_000 * (n + 1))],
      );
    }
    await expect(startHarbor(deps)).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
  });
});

describe("sites that cannot be read get a plain reason", () => {
  const home = harborPages[`${harborOrigin}/`]!;
  it.each([
    [
      "a redirect to a private address",
      {
        pages: {
          [`${harborOrigin}/`]: {
            ...home,
            finalUrl: "http://169.254.169.254/latest/meta-data/",
          },
        },
      },
      "address-not-allowed",
    ],
    [
      "a name that resolves to a private address",
      { resolve: () => ["10.0.0.7"] },
      "address-not-allowed",
    ],
    [
      "robots.txt disallows everything",
      { robots: "User-agent: *\nDisallow: /" },
      "blocked-by-site",
    ],
    [
      "the site refuses the reader",
      { pages: { [`${harborOrigin}/`]: { ...home, statusCode: 403 } } },
      "blocked-by-site",
    ],
    [
      "an empty page",
      { pages: { [`${harborOrigin}/`]: { ...home, markdown: "  " } } },
      "nothing-readable",
    ],
    [
      "an oversized page",
      {
        pages: {
          [`${harborOrigin}/`]: {
            ...home,
            markdown: "x".repeat(setupLimits.maxPageChars + 1),
          },
        },
      },
      "too-large",
    ],
    ["a site that is down", { pages: {} }, "no-response"],
  ] as const)("%s", async (_name, options, reason) => {
    const { deps, recorder } = harness(
      options as Parameters<typeof harness>[0],
    );
    const started = await startHarbor(deps);
    await advanceSetupRun(started.id, deps);
    const run = await getSetupRun({
      organizationId: org,
      runId: started.id,
      now,
      deps,
    });
    expect(run).toMatchObject({
      status: "failed",
      outcome: "site-unreachable",
      failureReason: reason,
    });
    expect(recorder.modelInputs).toEqual([]);
  });

  it("refuses an unsafe address before creating a run", async () => {
    const { deps } = harness();
    await expect(
      startSetupRun({
        organizationId: org,
        personId: owner,
        request: { sourceKind: "website", sourceUrl: "http://127.0.0.1:8080/" },
        now,
        deps,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const { rows } = await pg.query(
      `SELECT count(*)::int AS n FROM setup_runs`,
    );
    expect(rows[0]).toEqual({ n: 0 });
  });

  it("is honest without keys: not configured, and no outbound call", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "");
    vi.stubEnv("FIRECRAWL_API", "");
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    vi.stubEnv("VERCEL_AI_GATEWAY_API_KEY", "");
    vi.stubEnv("VERCEL_OIDC_TOKEN", "");
    try {
      await expect(
        startSetupRun({
          organizationId: org,
          personId: owner,
          request: { sourceKind: "website", sourceUrl: harborOrigin },
          now,
        }),
      ).rejects.toBeInstanceOf(ProviderNotConfiguredError);
      await expect(
        startSetupRun({
          organizationId: org,
          personId: owner,
          request: { sourceKind: "google-listing", query: "Harbor Sands" },
          now,
        }),
      ).rejects.toBeInstanceOf(ProviderNotConfiguredError);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("review and apply", () => {
  async function reviewed() {
    const { deps } = harness();
    const run = await runToReview(deps);
    const { proposals } = await listSetupProposals({
      organizationId: org,
      runId: run.id,
    });
    const find = (fieldKey: string, label?: string) =>
      proposals.find(
        (p) => p.fieldKey === fieldKey && (!label || p.label === label),
      )!;
    return { run, proposals, find, deps };
  }

  it("Keep, Edit and Skip are validated; applying writes only kept items, audited and idempotent", async () => {
    const { run, proposals, find } = await reviewed();
    const decide = (
      decision: Parameters<typeof decideSetupProposal>[0]["decision"],
    ) =>
      decideSetupProposal({
        organizationId: org,
        personId: owner,
        decision,
        now,
      });

    await decide({ proposalId: find("identity.name").id, decision: "kept" });
    await expect(
      decide({
        proposalId: find("contact.phone").id,
        decision: "edited",
        editedPayload: { value: "555" },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const phone = await decide({
      proposalId: find("contact.phone").id,
      decision: "edited",
      editedPayload: { value: "+1 (310) 555-0199" },
    });
    expect(phone.editedPayload).toEqual({ value: "+13105550199" });
    await decide({ proposalId: find("contact.email").id, decision: "skipped" });
    await decide({ proposalId: find("places.venue").id, decision: "kept" });
    await decide({ proposalId: find("places.hours").id, decision: "kept" });
    const offerings = await decideSetupProposalGroup({
      organizationId: org,
      personId: owner,
      runId: run.id,
      category: "offerings",
      decision: "kept",
      now,
    });
    expect(
      offerings.proposals
        .filter((p) => p.category === "offerings")
        .every((p) => p.decision === "kept"),
    ).toBe(true);
    await decide({
      proposalId: find("team.member", "Maya Okafor").id,
      decision: "kept",
    });
    await decide({
      proposalId: find("policies.cancellation").id,
      decision: "kept",
    });
    await decide({ proposalId: find("policies.weather").id, decision: "kept" });
    await decide({ proposalId: find("identity.colors").id, decision: "kept" });

    // Nothing reached the club before apply.
    const before = await pg.query<{ name: string }>(
      `SELECT name FROM organizations WHERE id = $1`,
      [org],
    );
    expect(before.rows[0]?.name).toBe("Harbor Test");

    const report = setupApplyResultSchema.parse(
      await applySetupProposals({
        organizationId: org,
        personId: owner,
        runId: run.id,
        idempotencyKey: "apply-harbor-0001",
        requestId: "req-apply-1",
        now,
      }),
    );
    const decidedCount =
      proposals.filter((p) =>
        [
          "identity.name",
          "contact.phone",
          "places.venue",
          "places.hours",
          "identity.colors",
          "policies.cancellation",
          "policies.weather",
        ].includes(p.fieldKey),
      ).length +
      4 +
      1;
    expect(report.applied).toBe(decidedCount);
    expect(report.skipped).toBe(1);
    const applied = report.proposals.filter((p) => p.decision === "applied");
    expect(applied.every((p) => p.appliedAt && p.appliedEntity)).toBe(true);

    const club = await pg.query<{ name: string }>(
      `SELECT name FROM organizations WHERE id = $1`,
      [org],
    );
    expect(club.rows[0]?.name).toBe("Harbor Sands Volleyball Club");
    const profile = setupProfileSchema.parse(await loadSetupProfile(org));
    expect(profile).toMatchObject({
      phoneE164: "+13105550199",
      websiteUrl: `${harborOrigin}/`,
      fieldSources: { phoneE164: { source: "person", confirmed: true } },
    });
    expect(profile.email).toBeUndefined();
    expect(profile.fieldSources.hours).toMatchObject({
      source: "website",
      confirmed: false,
    });
    expect(profile.hours.weekly).toHaveLength(7);

    const venue = await pg.query<{ status: string; address_line_1: string }>(
      `SELECT status, address_line_1 FROM venues WHERE organization_id = $1`,
      [org],
    );
    expect(venue.rows).toEqual([
      { status: "draft", address_line_1: "1200 Shoreline Way" },
    ]);
    const items = await pg.query<{
      title: string;
      status: string;
      visibility: string;
      amount_minor: number | string | null;
    }>(
      `SELECT i.title, i.status, i.visibility, p.amount_minor
         FROM catalog_items i LEFT JOIN catalog_prices p ON p.catalog_item_id = i.id
        WHERE i.organization_id = $1 ORDER BY i.title`,
      [org],
    );
    expect(
      items.rows.every(
        (row) => row.status === "draft" && row.visibility === "private",
      ),
    ).toBe(true);
    expect(
      items.rows.find((row) => row.title === "Private lesson")?.amount_minor,
    ).toEqual(expect.anything());
    expect(
      Number(
        items.rows.find((row) => row.title === "Private lesson")?.amount_minor,
      ),
    ).toBe(9500);
    expect(
      items.rows.find((row) => row.title === "Junior program")?.amount_minor,
    ).toBeNull();
    const staff = await pg.query<{
      active: boolean;
      profile_claim_status: string;
    }>(
      `SELECT s.active, p.profile_claim_status FROM organization_staff_profiles s JOIN people p ON p.id = s.person_id WHERE s.organization_id = $1`,
      [org],
    );
    expect(staff.rows).toEqual([
      { active: false, profile_claim_status: "unclaimed" },
    ]);
    const policies = await pg.query<{
      active: boolean;
      refund_before_minutes: number;
    }>(
      `SELECT active, refund_before_minutes FROM organization_refund_policies WHERE organization_id = $1`,
      [org],
    );
    expect(policies.rows).toEqual([
      { active: false, refund_before_minutes: 1440 },
    ]);
    const audit = await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM audit_log WHERE organization_id = $1 AND action = 'setup.proposal.applied' AND actor_person_id = $2 AND trace_id = 'req-apply-1'`,
      [org, owner],
    );
    expect(audit.rows[0]?.n).toBe(report.applied);

    // The same key replays the same report and writes nothing.
    const replay = await applySetupProposals({
      organizationId: org,
      personId: owner,
      runId: run.id,
      idempotencyKey: "apply-harbor-0001",
      requestId: "req-apply-2",
      now,
    });
    expect(replay.applied).toBe(report.applied);
    // A new key finds nothing left to apply.
    const again = await applySetupProposals({
      organizationId: org,
      personId: owner,
      runId: run.id,
      idempotencyKey: "apply-harbor-0002",
      requestId: "req-apply-3",
      now,
    });
    expect(again.applied).toBe(0);
    const counts = await pg.query<{
      audits: number;
      items: number;
      venues: number;
    }>(
      `SELECT (SELECT count(*)::int FROM audit_log WHERE organization_id = $1) AS audits,
              (SELECT count(*)::int FROM catalog_items WHERE organization_id = $1) AS items,
              (SELECT count(*)::int FROM venues WHERE organization_id = $1) AS venues`,
      [org],
    );
    expect(counts.rows[0]).toEqual({
      audits: report.applied,
      items: 4,
      venues: 1,
    });
    await expect(
      decide({ proposalId: find("identity.name").id, decision: "skipped" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const readiness = setupReadinessSchema.parse(
      await computeSetupReadiness(org),
    );
    const section = (key: string) =>
      readiness.sections.find((s) => s.key === key);
    expect(section("offerings")).toMatchObject({
      state: "in-progress",
      note: "4 drafts",
    });
    expect(section("places")).toMatchObject({ state: "in-progress" });
    expect(section("hours")?.state).toBe("complete");
    expect(section("team")).toMatchObject({
      state: "in-progress",
      note: "1 not invited, 1 to review",
    });
    expect(readiness.bookingsOpen).toBe(false);
  });

  it("a re-read proposes only differences, supersedes what was pending, and never overwrites an edit", async () => {
    const first = await reviewed();
    await decideSetupProposal({
      organizationId: org,
      personId: owner,
      decision: {
        proposalId: first.find("identity.name").id,
        decision: "kept",
      },
      now,
    });
    await decideSetupProposal({
      organizationId: org,
      personId: owner,
      decision: {
        proposalId: first.find("contact.phone").id,
        decision: "edited",
        editedPayload: { value: "+13105550199" },
      },
      now,
    });
    await decideSetupProposal({
      organizationId: org,
      personId: owner,
      decision: {
        proposalId: first.find("offerings.item", "Private lesson").id,
        decision: "kept",
      },
      now,
    });
    await applySetupProposals({
      organizationId: org,
      personId: owner,
      runId: first.run.id,
      idempotencyKey: "apply-first-0001",
      requestId: "req-1",
      now,
    });

    const later = new Date(now.getTime() + 60 * 60_000);
    const second = harness({ clock: () => later });
    const run = await startSetupRun({
      organizationId: org,
      personId: owner,
      request: { sourceKind: "website", sourceUrl: harborOrigin },
      now: later,
      deps: second.deps,
    });
    await advanceSetupRun(run.id, second.deps);
    const { proposals } = await listSetupProposals({
      organizationId: org,
      runId: run.id,
    });
    expect(proposals.some((p) => p.fieldKey === "identity.name")).toBe(false);
    expect(proposals.some((p) => p.label === "Private lesson")).toBe(false);
    const phone = proposals.find((p) => p.fieldKey === "contact.phone");
    expect(phone?.payload.before).toBe("+13105550199");
    expect(phone?.checkNote).toMatch(/You set this yourself/);
    const profile = await loadSetupProfile(org);
    expect(profile.phoneE164).toBe("+13105550199");

    const old = await listSetupProposals({
      organizationId: org,
      runId: first.run.id,
    });
    expect(old.proposals.filter((p) => p.decision === "pending")).toEqual([]);
    expect(old.proposals.some((p) => p.decision === "superseded")).toBe(true);
  });
});

describe("the club profile by hand (no website)", () => {
  it("reads and writes the same facts, marking them as the person's", async () => {
    const empty = setupProfileSchema.parse(await loadSetupProfile(org));
    expect(empty).toMatchObject({
      name: "Harbor Test",
      hours: { weekly: [] },
      socials: {},
    });
    const updated = await updateSetupProfile({
      organizationId: org,
      personId: owner,
      update: {
        phoneE164: "+13105550111",
        email: "Desk@Tidewater-fixture.club",
        websiteUrl: "https://tidewater-fixture.club",
        hours: { weekly: [{ weekday: 1, opens: "09:00", closes: "17:00" }] },
        socials: { instagram: "https://instagram.com/tidewater_fixture" },
      },
      now,
    });
    expect(setupProfileSchema.parse(updated)).toMatchObject({
      email: "desk@tidewater-fixture.club",
      websiteUrl: "https://tidewater-fixture.club/",
      fieldSources: { phoneE164: { source: "person", confirmed: true } },
    });
    await expect(
      updateSetupProfile({
        organizationId: org,
        personId: owner,
        update: { websiteUrl: "http://192.168.0.1/" },
        now,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      updateSetupProfile({
        organizationId: org,
        personId: owner,
        update: {
          hours: { weekly: [{ weekday: 1, opens: "18:00", closes: "09:00" }] },
        },
        now,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const readiness = await computeSetupReadiness(org);
    expect(readiness.sections.find((s) => s.key === "contact")?.state).toBe(
      "complete",
    );
    expect(readiness.sections.find((s) => s.key === "website")).toMatchObject({
      state: "complete",
      note: "Your own website",
    });
  });
});
