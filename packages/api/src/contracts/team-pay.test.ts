import { teamPayDemo } from "@duna/core/demo/team-pay";
import {
  staffCompensationModels,
  staffPayExportFormats,
  staffPayFrequencies,
  staffPayLineStatuses,
  staffPayMethods,
  staffPayPeriodStatuses,
  staffPayRunStatuses,
  staffWorkerClassifications,
} from "@duna/db/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiContext, createDemoActor } from "../context";
import { createCaller } from "../router";
import { isNotImplementedYet } from "../routers/not-implemented";
import {
  teamPayCompensationSchema,
  teamPayLineSchema,
  teamPayPeriodSchema,
  teamPayRunSchema,
  teamPaySetCompensationInputSchema,
  teamPayStaffCompensationSchema,
} from "./team-pay";
import { expectCoverage } from "./w3-test-support";

const dataSource = vi.hoisted(() => ({ demo: true }));
vi.mock("../services/data-source", () => ({
  usesDemoData: () => dataSource.demo,
}));

describe("team-pay contract and demo fixtures (W3-0)", () => {
  const lines = [
    ...teamPayDemo.runs.flatMap((run) => run.lines),
    teamPayDemo.noneLine,
  ];

  it("every fixture parses against its contract", () => {
    teamPayStaffCompensationSchema.parse(teamPayDemo.staffCompensation);
    for (const row of teamPayDemo.compensation)
      teamPayCompensationSchema.parse(row);
    for (const row of teamPayDemo.periods) teamPayPeriodSchema.parse(row);
    for (const row of teamPayDemo.runs) teamPayRunSchema.parse(row);
    teamPayLineSchema.parse(teamPayDemo.noneLine);
  });

  it("covers every state of every state machine", () => {
    expectCoverage(
      staffCompensationModels,
      teamPayDemo.compensation.map((c) => c.model),
    );
    expectCoverage(
      staffWorkerClassifications,
      teamPayDemo.compensation.map((c) => c.classification),
    );
    expectCoverage(
      staffPayFrequencies,
      teamPayDemo.periods.map((p) => p.frequency),
    );
    expectCoverage(
      staffPayPeriodStatuses,
      teamPayDemo.periods.map((p) => p.status),
    );
    expectCoverage(
      staffPayRunStatuses,
      teamPayDemo.runs.map((r) => r.status),
    );
    expectCoverage(
      staffPayLineStatuses,
      lines.map((l) => l.status),
    );
    expectCoverage(
      staffPayMethods,
      lines.map((l) => l.method),
    );
    expectCoverage(
      staffPayExportFormats,
      teamPayDemo.runs.flatMap((r) => r.exports.map((e) => e.format)),
    );
  });

  it("never pays a W-2 employee through Duna and keeps line totals exact", () => {
    for (const line of lines) {
      if (line.classification === "w2-employee")
        expect(line.method).not.toBe("duna-pay");
      const adjustments = line.adjustments.reduce(
        (sum, a) => sum + a.amount.amountMinor,
        0,
      );
      expect(line.total.amountMinor).toBe(
        line.earnings.amountMinor + adjustments,
      );
    }
  });

  it("rejects a salary for a contractor and a model without its amount", () => {
    const base = {
      staffProfileId: teamPayDemo.compensation[0]!.staffProfileId,
      effectiveFrom: "2027-01-01",
      revenueShareScope: [],
    };
    expect(
      teamPaySetCompensationInputSchema.safeParse({
        ...base,
        model: "salary",
        classification: "1099-contractor",
        annualSalary: { amountMinor: 100, currency: "USD" },
      }).success,
    ).toBe(false);
    expect(
      teamPaySetCompensationInputSchema.safeParse({
        ...base,
        model: "hourly",
        classification: "1099-contractor",
      }).success,
    ).toBe(false);
  });
});

describe("operator.teamPay in demo and connected mode (W3-0 stubs)", () => {
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
      .teamPay;

  it("serves fixtures in demo mode and keeps money writes to owners", async () => {
    const manager = as(["player", "manager"]);
    const { runs } = await manager.payRuns({ status: ["ready-for-approval"] });
    expect(runs).toHaveLength(1);
    await expect(
      manager.approvePayRun({
        payRunId: runs[0]!.id,
        idempotencyKey: "approve-1",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const approved = await as(["owner"]).approvePayRun({
      payRunId: runs[0]!.id,
      idempotencyKey: "approve-1",
    });
    expect(approved.status).toBe("approved");
  });

  it("calls the B3b service outside demo mode (no longer 'not implemented')", async () => {
    dataSource.demo = false;
    const error = await as(["owner"])
      .payPeriods()
      .catch((caught: unknown) => caught);
    // No database in this test: the service is reached and fails on it.
    expect(isNotImplementedYet(error)).toBe(false);
  });
});
