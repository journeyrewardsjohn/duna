import { teamPayoutsDemo } from "@duna/core/demo/team-payouts";
import {
  staffConnectedAccountStatuses,
  staffContractorPayoutStatuses,
} from "@duna/db/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiContext, createDemoActor } from "../context";
import { createCaller } from "../router";
import { isNotImplementedYet } from "../routers/not-implemented";
import {
  teamPayoutsContractorSchema,
  teamPayoutsInviteResultSchema,
  teamPayoutsPayoutSchema,
} from "./team-payouts";
import { expectCoverage } from "./w3-test-support";

const dataSource = vi.hoisted(() => ({ demo: true }));
vi.mock("../services/data-source", () => ({
  usesDemoData: () => dataSource.demo,
}));

describe("team-payouts contract and demo fixtures (W3-0)", () => {
  it("every fixture parses against its contract", () => {
    for (const row of teamPayoutsDemo.contractors)
      teamPayoutsContractorSchema.parse(row);
    for (const row of teamPayoutsDemo.payouts)
      teamPayoutsPayoutSchema.parse(row);
    teamPayoutsInviteResultSchema.parse(teamPayoutsDemo.invite);
  });

  it("covers every state of every state machine", () => {
    expectCoverage(
      staffConnectedAccountStatuses,
      teamPayoutsDemo.contractors.flatMap((c) =>
        "account" in c && c.account ? [c.account.status] : [],
      ),
    );
    expectCoverage(
      staffContractorPayoutStatuses,
      teamPayoutsDemo.payouts.map((p) => p.status),
    );
    expect(teamPayoutsDemo.contractors.some((c) => !("account" in c))).toBe(
      true,
    );
  });
});

describe("operator.teamPayouts in demo and connected mode (W3-0 stubs)", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    dataSource.demo = true;
  });

  const as = (roles: Parameters<typeof createDemoActor>[0]) =>
    createCaller(createApiContext({ actor: createDemoActor(roles) })).operator
      .teamPayouts;

  it("serves fixtures in demo mode without any provider call", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const owner = as(["owner"]);
    const { contractors } = await owner.contractors();
    expect(contractors).toHaveLength(7);
    await expect(
      owner.inviteToConnect({
        staffProfileId: contractors[6]!.staff.staffProfileId,
      }),
    ).resolves.toEqual({ state: "provider-not-configured" });
    const result = await owner.initiatePayout({
      payRunLineId: teamPayoutsDemo.payouts[0]!.payRunLineId,
      idempotencyKey: "payout-demo-1",
    });
    expect(result.state).toBe("created");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    await expect(
      as(["player", "manager"]).initiatePayout({
        payRunLineId: teamPayoutsDemo.payouts[0]!.payRunLineId,
        idempotencyKey: "payout-demo-1",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("says 'not implemented yet' outside demo mode", async () => {
    dataSource.demo = false;
    const error = await as(["owner"])
      .contractors()
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(isNotImplementedYet(error)).toBe(true);
  });
});
