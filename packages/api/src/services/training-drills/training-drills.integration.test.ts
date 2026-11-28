/**
 * Training drills (B5, scenes B6a) against an in-memory Postgres with every
 * migration: versions and scenes (valid, invalid, carried forward, size
 * cap), scope and who sees what, review checks, the legacy v1 scene read and
 * one-time copy, listings behind the kill switch and the owner's fee,
 * purchases, the store, plan pinning, the player read and query counts.
 */
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

const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@duna/db", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getDatabase: () => state.db,
  getTransactionalDatabase: () => state.db,
}));

import { trainingSceneExamples } from "@duna/core/training-scene";
import {
  academy,
  applyAllMigrations,
  createCatalogTestDatabase,
  seedAcademy,
} from "../../catalog-booking.test-support";
import type { ApiActor } from "../../context";
import {
  trainingDrillsDetailSchema,
  trainingDrillsListingSchema,
  trainingDrillsPurchaseSchema,
  trainingDrillsSummarySchema,
} from "../../contracts/training-drills";
import { savePracticePlan } from "../training-programs";
import type { TrainingContext } from "../training-programs/shared";
import {
  delist,
  drillDetail,
  LEGACY_SCENE_CONVERTED,
  library,
  personalDataFindings,
  playerDrill,
  purchase,
  purchases,
  saveListing,
  saveVersion,
  setScope,
  store,
  submitForReview,
} from "./index";

const { pg, db } = createCatalogTestDatabase();
state.db = db;

const ids = {
  coachB: "20000000-0000-4000-8000-0000000000b1",
  otherOrg: "10000000-0000-4000-8000-0000000000f1",
  otherOwner: "20000000-0000-4000-8000-0000000000f2",
  dunaDrill: "70000000-0000-4000-8000-0000000000d1",
  dunaVersion: "70000000-0000-4000-8000-0000000000d2",
  legacyDrill: "70000000-0000-4000-8000-0000000000c1",
  legacyVersion: "70000000-0000-4000-8000-0000000000c2",
};
const now = new Date("2026-12-01T12:00:00.000Z");

function actor(personId: string, scopes: string[], roles: string[], organizationId = academy.org): ApiActor {
  return { personId, displayName: "Tester", roles: roles as ApiActor["roles"], organizationId, scopes, ageBand: "adult", isDemo: false };
}
const ctx = (person: ApiActor, organizationId = academy.org): TrainingContext => ({
  actor: person,
  organizationId,
  requestId: "req",
  now,
});
const coachScopes = ["members:read", "training:read", "training:write"];
const owner = ctx(actor(academy.owner, ["*"], ["owner"]));
const coach = ctx(actor(academy.coach, coachScopes, ["coach"]));
const coachB = ctx(actor(ids.coachB, coachScopes, ["coach"]));
const desk = ctx(actor(academy.players[6]!, ["training:read"], ["front-desk"]));
const otherOwner = ctx(actor(ids.otherOwner, ["*"], ["owner"], ids.otherOrg), ids.otherOrg);

const scene = trainingSceneExamples[0] as Record<string, unknown>;

function drillInput(overrides: Record<string, unknown> = {}) {
  return {
    title: "Serve receive to side-out",
    scope: "club" as const,
    focus: "Serve-receive",
    summary: "Pass, set, side out.",
    purpose: "First contact under a served ball.",
    targetAudience: "Juniors",
    descriptionMarkdown: "Rotate after five serves.",
    players: { min: 4, max: 6, recommended: 4 },
    durationMinutes: 15,
    level: "Intermediate",
    equipment: ["Balls", "Cones"],
    coachingCues: ["Platform early"],
    rotationRule: "After 5 serves, rotate.",
    successCriteria: "7 of 10 to target",
    scene,
    idempotencyKey: "drill-create-1",
    ...overrides,
  };
}

beforeAll(() => applyAllMigrations(pg), 120_000);
afterAll(() => pg.close());
beforeEach(async () => {
  vi.stubEnv("TRAINING_MARKETPLACE_FEE_BPS", "");
  await seedAcademy(pg);
  await pg.exec(`
    INSERT INTO people (id, display_name, handle) VALUES ('${ids.coachB}', 'Bea Coach', 'bea'), ('${ids.otherOwner}', 'Other Owner', 'other-owner');
    INSERT INTO organization_memberships (organization_id, person_id, role) VALUES ('${academy.org}', '${ids.coachB}', 'coach');
    INSERT INTO organizations (id, slug, name, currency, timezone) VALUES ('${ids.otherOrg}', 'other-club', 'Other Club', 'USD', 'UTC');
    INSERT INTO training_drills (id, organization_id, slug, title, status, scope, purpose, target_audience, summary, description_markdown, current_version_id)
      VALUES ('${ids.dunaDrill}', NULL, 'warm-up-ladder', 'Warm-up ladder', 'published', 'duna', 'Warm up', 'All', 'Ladder', '', '${ids.dunaVersion}');
    INSERT INTO training_drill_versions (id, drill_id, version, snapshot) VALUES ('${ids.dunaVersion}', '${ids.dunaDrill}', 1, '{}'::jsonb);
    INSERT INTO training_drills (id, organization_id, slug, title, status, purpose, target_audience, summary, description_markdown, current_version_id, created_by_person_id, choreography)
      VALUES ('${ids.legacyDrill}', '${academy.org}', 'legacy-pepper', 'Legacy pepper', 'published', 'Ball control', 'All', 'Pepper', '', '${ids.legacyVersion}', '${academy.coach}',
        '${JSON.stringify({
          court: "half-court",
          perspective: "top",
          positions: [
            { id: "a", label: "P1", role: "Hitter", team: "a", x: 30, y: 70 },
            { id: "b", label: "P2", role: "Digger", team: "a", x: 70, y: 70 },
          ],
          movements: [{ id: "m1", from: "a", to: "b", kind: "ball", order: 1 }],
          ballCount: 1,
          loopSeconds: 8,
        })}'::jsonb);
    INSERT INTO training_drill_versions (id, drill_id, version, snapshot, created_by_person_id) VALUES ('${ids.legacyVersion}', '${ids.legacyDrill}', 1, '{}'::jsonb, '${academy.coach}');
  `);
});
afterEach(() => vi.unstubAllEnvs());

describe("versions and scenes", () => {
  it("creates a club drill with a valid scene, versions every save and carries the scene forward", async () => {
    const created = await saveVersion(coach, drillInput());
    trainingDrillsDetailSchema.parse(created);
    expect(created).toMatchObject({
      scope: "club",
      status: "published",
      version: 1,
      focus: "Serve-receive",
      level: "Intermediate",
      coachingCues: ["Platform early"],
      rotationRule: "After 5 serves, rotate.",
      successCriteria: "7 of 10 to target",
      scene: { validationStatus: "valid", source: "coach", modelVersion: 2, validationIssues: [] },
    });
    expect(created.scene!.derived.touchesPerRep).toBeGreaterThan(0);
    expect(created.touches).toBeGreaterThan(0);
    const replay = await saveVersion(coach, drillInput());
    expect(replay.id).toBe(created.id);
    const second = await saveVersion(coach, drillInput({ drillId: created.id, scene: undefined, changeNote: "Cues", idempotencyKey: "drill-v2" }));
    expect(second.version).toBe(2);
    expect(second.versions.map((item) => item.version)).toEqual([1, 2]);
    expect(second.scene).toMatchObject({ drillVersionId: second.currentVersionId, validationStatus: "valid" });
    expect(second.scene!.document).toEqual(scene);
  });

  it("stores an invalid scene with its issues and refuses one over the size cap", async () => {
    const broken = { ...scene, slots: [{ id: "x", side: "A", spot: "nowhere-spot", occupant: "p1" }] };
    const saved = await saveVersion(coach, drillInput({ scene: broken, idempotencyKey: "broken" }));
    expect(saved.scene!.validationStatus).toBe("invalid");
    expect(saved.scene!.validationIssues.length).toBeGreaterThan(0);
    expect(saved.scene!.validationIssues[0]!.rule).toMatch(/^[a-z-]+$/);
    await expect(
      saveVersion(coach, drillInput({ scene: { ...scene, padding: "x".repeat(70_000) }, idempotencyKey: "huge" })),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("keeps edits to the author or a manager; Duna drills are read-only", async () => {
    const created = await saveVersion(coach, drillInput());
    await expect(saveVersion(coachB, drillInput({ drillId: created.id, idempotencyKey: "b" }))).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await saveVersion(owner, drillInput({ drillId: created.id, idempotencyKey: "o" }))).version).toBe(2);
    await expect(saveVersion(owner, drillInput({ drillId: ids.dunaDrill, idempotencyKey: "d" }))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(drillDetail(otherOwner, created.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(drillDetail(desk, created.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("scope and the library", () => {
  it("personal drills are visible only to their owner until shared", async () => {
    const mine = await saveVersion(coachB, drillInput({ scope: "personal", title: "Bea's pepper", idempotencyKey: "mine" }));
    expect(mine).toMatchObject({ scope: "personal", status: "draft", author: { personId: ids.coachB } });
    expect((await library(coachB, { scope: "personal" })).items.map((item) => item.id)).toEqual([mine.id]);
    expect((await library(coach, { scope: "personal" })).items).toEqual([]);
    await expect(drillDetail(coach, mine.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const shared = await setScope(coachB, { drillId: mine.id, scope: "club" });
    expect(shared).toMatchObject({ scope: "club", status: "published" });
    expect((await drillDetail(coach, mine.id)).id).toBe(mine.id);
    await expect(setScope(coach, { drillId: mine.id, scope: "personal" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("filters are bounded, escaped and indexed-friendly; the list costs a fixed number of queries", async () => {
    await saveVersion(coach, drillInput());
    await saveVersion(coach, drillInput({ title: "100% blocking", focus: "Blocking", players: { min: 2, max: 3, recommended: 2 }, durationMinutes: 30, equipment: ["Box"], idempotencyKey: "block" }));
    const club = await library(coach, { scope: "club" });
    club.items.forEach((item) => trainingDrillsSummarySchema.parse(item));
    expect(club.items.map((item) => item.title)).toEqual(expect.arrayContaining(["Serve receive to side-out", "100% blocking", "Legacy pepper"]));
    expect((await library(coach, { scope: "club", query: "100%" })).items.map((item) => item.title)).toEqual(["100% blocking"]);
    expect((await library(coach, { scope: "club", query: "%" })).items.map((item) => item.title)).toEqual(["100% blocking"]);
    expect((await library(coach, { scope: "club", focus: "blocking" })).items).toHaveLength(1);
    expect((await library(coach, { scope: "club", players: 5 })).items.map((item) => item.title)).toContain("Serve receive to side-out");
    expect((await library(coach, { scope: "club", players: 5 })).items.map((item) => item.title)).not.toContain("100% blocking");
    expect((await library(coach, { scope: "club", equipment: ["Box"] })).items).toHaveLength(1);
    expect((await library(coach, { scope: "club", maxMinutes: 20 })).items.map((item) => item.title)).not.toContain("100% blocking");
    expect((await library(coach, { scope: "duna" })).items.map((item) => item.id)).toEqual([ids.dunaDrill]);

    const spy = vi.spyOn(pg, "query");
    await library(coach, { scope: "club" });
    const few = spy.mock.calls.length;
    for (let index = 0; index < 6; index += 1) {
      await saveVersion(coach, drillInput({ title: `Drill ${index}`, idempotencyKey: `many-${index}` }));
    }
    spy.mockClear();
    expect((await library(coach, { scope: "club" })).items.length).toBe(9);
    expect(spy.mock.calls.length).toBe(few);
    spy.mockRestore();
  });
});

describe("legacy drills", () => {
  it("reads a v1 scene converted on the fly, then copies it once on the first write", async () => {
    const detail = await drillDetail(coach, ids.legacyDrill);
    trainingDrillsDetailSchema.parse(detail);
    expect(detail.scene).toMatchObject({ source: "converted", modelVersion: 2, drillVersionId: ids.legacyVersion });
    expect(detail.scene!.validationStatus).toBe("valid");
    const before = await pg.query(`SELECT count(*)::int AS n FROM training_drill_scenes`);
    expect(before.rows[0]).toEqual({ n: 0 });
    await submitForReview(coach, { drillId: ids.legacyDrill, drillVersionId: ids.legacyVersion });
    await saveVersion(coach, drillInput({ drillId: ids.legacyDrill, title: "Legacy pepper", scene: undefined, idempotencyKey: "legacy-v2" }));
    const markers = await pg.query(`SELECT count(*)::int AS n FROM audit_log WHERE action = '${LEGACY_SCENE_CONVERTED}'`);
    expect(markers.rows[0]).toEqual({ n: 1 });
    const scenes = await pg.query<{ source: string; drill_version_id: string }>(`SELECT source, drill_version_id FROM training_drill_scenes ORDER BY created_at`);
    expect(scenes.rows[0]).toMatchObject({ source: "converted", drill_version_id: ids.legacyVersion });
    // The new version carries the converted scene forward as the coach's.
    expect(scenes.rows).toHaveLength(2);
    const legacyColumn = await pg.query<{ choreography: { court: string } }>(`SELECT choreography FROM training_drills WHERE id = '${ids.legacyDrill}'`);
    expect(legacyColumn.rows[0]!.choreography.court).toBe("half-court");
  });
});

describe("review, listings, store and purchases", () => {
  it("runs the automatic checks and catches personal data", async () => {
    expect(personalDataFindings(["Call 555 123 4567 or mail coach@example.com"])).toEqual(["an email address", "a phone number"]);
    const clean = await saveVersion(coach, drillInput());
    const reviewed = await submitForReview(coach, { drillId: clean.id, drillVersionId: clean.currentVersionId });
    expect(reviewed).toMatchObject({ reviewState: "in-review", status: "review" });
    expect(reviewed.reviewChecks.map((check) => [check.kind, check.status])).toEqual(
      expect.arrayContaining([["scene-valid", "ok"], ["no-personal-data", "ok"], ["duna-review", "waiting"]]),
    );
    const leaky = await saveVersion(coach, drillInput({ summary: "Text me at 555 123 4567", idempotencyKey: "leaky" }));
    const failed = await submitForReview(coach, { drillId: leaky.id, drillVersionId: leaky.currentVersionId });
    expect(failed.reviewState).toBe("changes-requested");
    expect(failed.reviewChecks.find((check) => check.kind === "no-personal-data")).toMatchObject({ status: "failed", note: "Remove a phone number." });
    await expect(submitForReview(coach, { drillId: clean.id, drillVersionId: ids.dunaVersion })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("lists after approval, honours the kill switch and the owner's fee, and sells to another club", async () => {
    const drill = await saveVersion(coach, drillInput());
    const listingInput = {
      drillId: drill.id,
      drillVersionId: drill.currentVersionId,
      pricing: "free" as const,
      price: { amountMinor: 0, currency: "USD" as const },
      licenseTerms: "Use within your club.",
      listedAs: "Beach Test Academy",
      sellAs: "organization" as const,
    };
    await expect(saveListing(owner, listingInput, false)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    await expect(saveListing(coach, listingInput, true)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      saveListing(owner, { ...listingInput, pricing: "paid", price: { amountMinor: 800, currency: "USD" } }, true),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: "Paid listings are not configured yet." });
    const pending = await saveListing(owner, listingInput, true);
    trainingDrillsListingSchema.parse(pending);
    expect(pending.status).toBe("pending-review");
    await pg.exec(`UPDATE training_drills SET review_state = 'approved' WHERE id = '${drill.id}'`);
    const listed = await saveListing(owner, listingInput, true);
    expect(listed).toMatchObject({ id: pending.id, status: "listed", seller: { kind: "organization", displayName: "Beach Test Academy" } });

    expect((await store({ actor: owner.actor, organizationId: academy.org }, {}, true)).items).toEqual([]);
    const theirStore = await store({ actor: otherOwner.actor, organizationId: ids.otherOrg }, {}, true);
    expect(theirStore.items.map((item) => item.listing.id)).toEqual([listed.id]);
    expect(await store({}, {}, false)).toEqual({ enabled: false, items: [] });

    await expect(purchase(owner, { listingId: listed.id, buyAs: "organization", idempotencyKey: "self-buy" }, true)).rejects.toMatchObject({ code: "CONFLICT" });
    const bought = await purchase(otherOwner, { listingId: listed.id, buyAs: "organization", idempotencyKey: "buy-1" }, true);
    trainingDrillsPurchaseSchema.parse(bought);
    expect(bought).toMatchObject({ status: "complete", checkoutRequired: false, buyer: { kind: "organization", id: ids.otherOrg } });
    expect((await purchase(otherOwner, { listingId: listed.id, buyAs: "organization", idempotencyKey: "buy-2" }, true)).id).toBe(bought.id);
    expect((await purchases(otherOwner)).items).toHaveLength(1);
    const purchasedLibrary = await library(otherOwner, { scope: "purchased" });
    expect(purchasedLibrary.items).toEqual([expect.objectContaining({ id: drill.id, purchased: true, sourceLabel: "Beach Test Academy" })]);
    // A purchased drill is read-only but plans can pin it.
    await expect(saveVersion(otherOwner, drillInput({ drillId: drill.id, idempotencyKey: "steal" }))).rejects.toMatchObject({ code: "FORBIDDEN" });
    const plan = await savePracticePlan(otherOwner, {
      title: "Bought drill", purpose: "", targetAudience: "", status: "draft",
      assumptions: { athletes: 4, courts: 1, ballsPerCourt: 2, level: "All" },
      blocks: [{ sequence: 0, lane: "all", title: "Side-out", kind: "drill", startsAtMinute: 0, durationMinutes: 15, transitionMinutes: 0, intensity: 5, plannedLoad: 0, drillId: drill.id, estimateSource: "assumed", locked: false }],
      idempotencyKey: "their-plan",
    });
    expect(plan.blocks[0]).toMatchObject({ drillId: drill.id, drillVersionId: drill.currentVersionId });
    // Usage counts stay per club.
    expect((await drillDetail(coach, drill.id)).usedInPlans).toBe(0);
    const delisted = await delist(owner, listed.id);
    expect(delisted.status).toBe("delisted");
    expect((await library(otherOwner, { scope: "purchased" })).items).toHaveLength(1);
  });

  it("a paid purchase stays pending until checkout", async () => {
    vi.stubEnv("TRAINING_MARKETPLACE_FEE_BPS", "1500");
    const drill = await saveVersion(coach, drillInput());
    await pg.exec(`UPDATE training_drills SET review_state = 'approved' WHERE id = '${drill.id}'`);
    const listed = await saveListing(owner, {
      drillId: drill.id, drillVersionId: drill.currentVersionId, pricing: "paid",
      price: { amountMinor: 800, currency: "USD" }, licenseTerms: "Club use", listedAs: "Academy", sellAs: "organization",
    }, true);
    expect(listed).toMatchObject({ status: "listed", marketplaceFeeBps: 1500 });
    const pending = await purchase(otherOwner, { listingId: listed.id, buyAs: "organization", idempotencyKey: "paid-1" }, true);
    expect(pending).toMatchObject({ status: "pending", checkoutRequired: true });
    expect((await library(otherOwner, { scope: "purchased" })).items).toEqual([]);
  });
});

describe("the player's read", () => {
  it("shows published Duna drills and nothing private", async () => {
    const player = actor(academy.players[0]!, [], ["player"]);
    const duna = await playerDrill(player, ids.dunaDrill, [player.personId], now);
    expect(duna).toMatchObject({ id: ids.dunaDrill, reviewChecks: [] });
    expect(duna.listing).toBeUndefined();
    const club = await saveVersion(coach, drillInput());
    await expect(playerDrill(player, club.id, [player.personId], now)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
