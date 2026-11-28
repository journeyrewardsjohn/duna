import { facilityDemo } from "@duna/core/demo/facility";
import {
  courtPlayStopReasons,
  courtPlayStopSources,
  courtPlayStopStatuses,
  facilityAccessModes,
  facilityAccessRequestStatuses,
  facilityLightingSummaries,
  facilityLightningActions,
  facilityListingStatuses,
  facilityPayoutModes,
  facilityRuleStatuses,
} from "@duna/db/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiContext, createDemoActor } from "../context";
import { createCaller } from "../router";
import { isNotImplementedYet } from "../routers/not-implemented";
import {
  facilityAccessRequestSchema,
  facilityAccessRuleSchema,
  facilityListingSchema,
  facilityPlayStopSchema,
  facilityPublicListingSchema,
  facilitySlotStateSchema,
  facilitySlotsSchema,
} from "./facility";
import { expectCoverage } from "./w3-test-support";

const dataSource = vi.hoisted(() => ({ demo: true }));
vi.mock("../services/data-source", () => ({
  usesDemoData: () => dataSource.demo,
}));

describe("facility contract and demo fixtures (W3-0)", () => {
  it("every fixture parses against its contract", () => {
    for (const listing of facilityDemo.listings)
      facilityListingSchema.parse(listing);
    for (const rule of facilityDemo.accessRules)
      facilityAccessRuleSchema.parse(rule);
    for (const request of facilityDemo.accessRequests)
      facilityAccessRequestSchema.parse(request);
    for (const stop of facilityDemo.playStops)
      facilityPlayStopSchema.parse(stop);
    facilityPublicListingSchema.parse(facilityDemo.publicListing);
    facilitySlotsSchema.parse(facilityDemo.slots);
  });

  it("covers every state of every state machine", () => {
    const listings = facilityDemo.listings;
    expectCoverage(
      facilityListingStatuses,
      listings.map((l) => l.status),
    );
    expectCoverage(facilityAccessModes, [
      ...listings.map((l) => l.defaultAccess),
      ...facilityDemo.accessRules.map((r) => r.access),
    ]);
    expectCoverage(
      facilityLightingSummaries,
      listings.map((l) => l.lighting),
    );
    expectCoverage(
      facilityPayoutModes,
      listings.map((l) => l.payoutMode),
    );
    expectCoverage(
      facilityLightningActions,
      listings.flatMap((l) =>
        "lightningAction" in l.policies && l.policies.lightningAction
          ? [l.policies.lightningAction]
          : [],
      ),
    );
    expectCoverage(
      facilityRuleStatuses,
      facilityDemo.accessRules.map((r) => String(r.status)),
    );
    expectCoverage(
      facilityAccessRequestStatuses,
      facilityDemo.accessRequests.map((r) => r.status),
    );
    expectCoverage(
      courtPlayStopReasons,
      facilityDemo.playStops.map((s) => s.reason),
    );
    expectCoverage(
      courtPlayStopSources,
      facilityDemo.playStops.map((s) => s.source),
    );
    expectCoverage(
      courtPlayStopStatuses,
      facilityDemo.playStops.map((s) => s.status),
    );
    expectCoverage(
      facilitySlotStateSchema.options,
      facilityDemo.slots.slots.map((s) => s.state),
    );
  });
});

describe("facility routers in demo mode and connected mode (W3-0 stubs)", () => {
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
    const api = caller();
    const listings = await api.operator.facility.listings();
    expect(listings).toHaveLength(4);
    const requests = await api.operator.facility.accessRequests({
      listingId: listings[0]!.id,
      status: "requested",
    });
    const approved = await api.operator.facility.decideAccessRequest({
      requestId: requests[0]!.id,
      decision: "approve-for-days",
      days: 30,
    });
    expect(approved.status).toBe("approved");
    expect(approved.expiresAt).toBeDefined();
    await expect(
      api.public.facility.slots({
        slug: facilityDemo.publicListing.slug,
        date: "2026-11-29",
      }),
    ).resolves.toMatchObject({ date: "2026-11-29" });
    await expect(
      api.player.facility.myAccessRequests(),
    ).resolves.not.toHaveLength(0);
  });

  it("says 'not implemented yet' outside demo mode", async () => {
    dataSource.demo = false;
    const error = await caller()
      .operator.facility.listings()
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(isNotImplementedYet(error)).toBe(true);
  });
});
