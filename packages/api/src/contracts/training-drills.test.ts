import { trainingDrillsDemo } from "@duna/core/demo/training-drills";
import { validateTrainingScene } from "@duna/core/training-scene";
import {
  trainingContentStatusEnum,
  trainingDrillListingPricings,
  trainingDrillListingStatuses,
  trainingDrillPurchaseStatuses,
  trainingDrillReviewCheckKinds,
  trainingDrillReviewCheckStatuses,
  trainingDrillReviewStates,
  trainingDrillScopes,
  trainingSceneSources,
  trainingSceneValidationStatuses,
} from "@duna/db/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiContext, createDemoActor } from "../context";
import { createCaller } from "../router";
import { isNotImplementedYet } from "../routers/not-implemented";
import {
  trainingDrillsDetailSchema,
  trainingDrillsListingSchema,
  trainingDrillsPurchaseSchema,
  trainingDrillsReviewCheckSchema,
  trainingDrillsSceneSchema,
  trainingDrillsStoreItemSchema,
  trainingDrillsSummarySchema,
} from "./training-drills";
import { expectCoverage } from "./w3-test-support";

const dataSource = vi.hoisted(() => ({ demo: true }));
vi.mock("../services/data-source", () => ({
  usesDemoData: () => dataSource.demo,
}));

const demo = trainingDrillsDemo;

describe("training-drills contract and demo fixtures (W3-0)", () => {
  it("every fixture parses against its contract", () => {
    for (const item of demo.summaries) trainingDrillsSummarySchema.parse(item);
    trainingDrillsDetailSchema.parse(demo.detail);
    for (const scene of demo.scenes) trainingDrillsSceneSchema.parse(scene);
    for (const check of demo.reviewChecks)
      trainingDrillsReviewCheckSchema.parse(check);
    for (const listing of demo.listings)
      trainingDrillsListingSchema.parse(listing);
    for (const item of demo.store) trainingDrillsStoreItemSchema.parse(item);
    for (const purchase of demo.purchases)
      trainingDrillsPurchaseSchema.parse(purchase);
  });

  it("is rich enough for the screens: thirty drills, real v2 scenes whose status matches the validator", () => {
    expect(demo.summaries.length).toBeGreaterThanOrEqual(30);
    expect(demo.scenes.length).toBeGreaterThanOrEqual(5);
    for (const scene of demo.scenes) {
      const result = validateTrainingScene(scene.document);
      if (scene.validationStatus === "valid") expect(result.ok).toBe(true);
      if (scene.validationStatus === "invalid") {
        expect(result.ok).toBe(false);
        expect(result.issues.map((issue) => issue.rule)).toContain(
          scene.validationIssues[0]!.rule,
        );
      }
    }
  });

  it("covers every state of every state machine", () => {
    expectCoverage(
      trainingDrillScopes,
      demo.summaries.map((d) => d.scope),
    );
    expect(demo.summaries.some((d) => d.purchased)).toBe(true);
    expectCoverage(
      trainingContentStatusEnum.enumValues,
      demo.summaries.map((d) => d.status),
    );
    expectCoverage(
      trainingDrillReviewStates,
      demo.summaries.map((d) => d.reviewState),
    );
    expectCoverage(
      trainingDrillReviewCheckKinds,
      demo.reviewChecks.map((c) => c.kind),
    );
    expectCoverage(
      trainingDrillReviewCheckStatuses,
      demo.reviewChecks.map((c) => c.status),
    );
    expectCoverage(
      trainingSceneValidationStatuses,
      demo.scenes.map((s) => s.validationStatus),
    );
    expectCoverage(
      trainingSceneSources,
      demo.scenes.map((s) => s.source),
    );
    expectCoverage(
      trainingDrillListingStatuses,
      demo.listings.map((l) => l.status),
    );
    expectCoverage(
      trainingDrillListingPricings,
      demo.listings.map((l) => l.pricing),
    );
    expectCoverage(
      trainingDrillPurchaseStatuses,
      demo.purchases.map((p) => p.status),
    );
  });
});

describe("training-drills routers in demo and connected mode", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    dataSource.demo = true;
  });

  const caller = () =>
    createCaller(createApiContext({ actor: createDemoActor() }));

  it("serves fixtures in demo mode", async () => {
    const operator = caller().operator.trainingDrills;
    const club = await operator.library({ scope: "club" });
    expect(club.items.length).toBeGreaterThan(3);
    const purchased = await operator.library({ scope: "purchased" });
    expect(purchased.items.every((item) => item.purchased)).toBe(true);
    const detail = await operator.drill({ drillId: club.items[0]!.id });
    expect(detail.versions.length).toBe(3);
    const store = await caller().public.trainingDrills.store({});
    expect(store.enabled).toBe(true);
    const paid = store.items.find((item) => item.listing.pricing === "paid")!;
    const purchase = await operator.purchase({
      listingId: paid.listing.id,
      buyAs: "organization",
      idempotencyKey: "demo-purchase-1",
    });
    expect(purchase).toMatchObject({
      status: "pending",
      checkoutRequired: true,
    });
  });

  it("calls the B5 service outside demo mode (no longer 'not implemented')", async () => {
    dataSource.demo = false;
    const error = await caller()
      .operator.trainingDrills.library({ scope: "club" })
      .catch((caught: unknown) => caught);
    // No database in this test: the service is reached and fails on it.
    expect(isNotImplementedYet(error)).toBe(false);
  });
});
