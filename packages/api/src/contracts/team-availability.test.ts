import { teamAvailabilityDemo } from "@duna/core/demo/team-availability";
import {
  staffCoverageOfferStatuses,
  staffCoverageReasons,
  staffCoverageStatuses,
  staffScheduleStatuses,
  staffTimeOffStatuses,
  staffWindowKinds,
} from "@duna/db/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiContext, createDemoActor } from "../context";
import { createCaller } from "../router";
import { isNotImplementedYet } from "../routers/not-implemented";
import {
  teamAvailabilityBlackoutSchema,
  teamAvailabilityCoverageGridSchema,
  teamAvailabilityCoverageRequestSchema,
  teamAvailabilityScheduleSchema,
  teamAvailabilityStaffSchema,
  teamAvailabilityTimeOffSchema,
} from "./team-availability";
import { expectCoverage } from "./w3-test-support";

const dataSource = vi.hoisted(() => ({ demo: true }));
vi.mock("../services/data-source", () => ({
  usesDemoData: () => dataSource.demo,
}));

describe("team-availability contract and demo fixtures (W3-0)", () => {
  it("every fixture parses against its contract", () => {
    teamAvailabilityStaffSchema.parse(teamAvailabilityDemo.staff);
    teamAvailabilityCoverageGridSchema.parse(teamAvailabilityDemo.coverageGrid);
    for (const row of teamAvailabilityDemo.schedules)
      teamAvailabilityScheduleSchema.parse(row);
    for (const row of teamAvailabilityDemo.blackouts)
      teamAvailabilityBlackoutSchema.parse(row);
    for (const row of teamAvailabilityDemo.timeOff)
      teamAvailabilityTimeOffSchema.parse(row);
    for (const row of teamAvailabilityDemo.coverageRequests)
      teamAvailabilityCoverageRequestSchema.parse(row);
  });

  it("covers every state of every state machine", () => {
    const { schedules, timeOff, coverageRequests } = teamAvailabilityDemo;
    expectCoverage(
      staffScheduleStatuses,
      schedules.map((s) => s.status),
    );
    expectCoverage(
      staffWindowKinds,
      schedules.flatMap((s) => s.windows.map((w) => w.kind)),
    );
    expectCoverage(
      staffTimeOffStatuses,
      timeOff.map((t) => t.status),
    );
    expectCoverage(
      staffCoverageStatuses,
      coverageRequests.map((r) => r.status),
    );
    expectCoverage(
      staffCoverageReasons,
      coverageRequests.map((r) => r.reason),
    );
    expectCoverage(
      staffCoverageOfferStatuses,
      coverageRequests.flatMap((r) => r.offers.map((o) => o.status)),
    );
    expect(
      teamAvailabilityDemo.coverageGrid.cells.some(
        (cell) => cell.sessions > 0 && cell.coachesFree === 0,
      ),
    ).toBe(true);
  });
});

describe("operator.teamAvailability in demo and connected mode (W3-0 stubs)", () => {
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
      .teamAvailability;

  it("serves fixtures in demo mode", async () => {
    const api = caller();
    const page = await api.staff({
      staffProfileId: teamAvailabilityDemo.staff.staff.staffProfileId,
    });
    expect(page.schedules.length).toBe(4);
    const { requests } = await api.coverageRequests({ status: ["open"] });
    expect(requests).toHaveLength(1);
    const assigned = await api.coverageAction({
      action: "assign",
      requestId: requests[0]!.id,
      offerId: requests[0]!.offers[0]!.id,
    });
    expect(assigned.status).toBe("covered");
    await expect(
      api.coverageGrid({ weekStartsOn: "2026-12-06" }),
    ).resolves.toMatchObject({ weekStartsOn: "2026-12-06" });
  });

  it("calls the B3a service outside demo mode (no longer 'not implemented')", async () => {
    dataSource.demo = false;
    const error = await caller()
      .coverageGrid({ weekStartsOn: "2026-12-06" })
      .catch((caught: unknown) => caught);
    // No database in this test: the service is reached and fails on it.
    expect(isNotImplementedYet(error)).toBe(false);
  });
});
