import { payDemo } from "@duna/core/demo/pay";
import {
  payAccountStatuses,
  payBankStatuses,
  payDeliveryEventKinds,
  payDeliveryRules,
  payDisputeStatuses,
  payHoldKinds,
  payHoldStatuses,
  payObligationStatuses,
  payRecoveryKinds,
  payRecoveryStatuses,
  payRefundSources,
  payReserveKinds,
  payReserveStatuses,
  payReserveTriggers,
  payTrancheKinds,
  payTrancheStatuses,
} from "@duna/db/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiContext, createDemoActor } from "../context";
import { createCaller } from "../router";
import { isNotImplementedYet } from "../routers/not-implemented";
import {
  payAccountSchema,
  payBalanceSchema,
  payDisputeDetailSchema,
  payHoldSchema,
  payMoneyHomeSchema,
  payObligationDetailSchema,
  payOnboardingSessionSchema,
  payPayoutSettingsSchema,
  payPublishGateSchema,
  payRecoverySchema,
  payRefundPolicySchema,
  payReserveSchema,
  payTaxSettingsSchema,
} from "./pay";
import { expectCoverage } from "./w3-test-support";

const dataSource = vi.hoisted(() => ({ demo: true }));
vi.mock("../services/data-source", () => ({
  usesDemoData: () => dataSource.demo,
}));

const obligations = payDemo.obligations;

describe("pay contract and demo fixtures (W3-0)", () => {
  it("every fixture parses against its contract", () => {
    for (const account of Object.values(payDemo.accounts))
      payAccountSchema.parse(account);
    payOnboardingSessionSchema.parse(payDemo.onboardingSession);
    payPayoutSettingsSchema.parse(payDemo.payoutSettings);
    for (const policy of payDemo.refundPolicies)
      payRefundPolicySchema.parse(policy);
    payTaxSettingsSchema.parse(payDemo.taxSettings);
    payBalanceSchema.parse(payDemo.balance);
    for (const item of obligations) payObligationDetailSchema.parse(item);
    for (const hold of payDemo.holds) payHoldSchema.parse(hold);
    for (const reserve of payDemo.reserves) payReserveSchema.parse(reserve);
    for (const dispute of payDemo.disputes)
      payDisputeDetailSchema.parse(dispute);
    for (const recovery of payDemo.recoveries)
      payRecoverySchema.parse(recovery);
    payPublishGateSchema.parse(payDemo.publishGate);
    payMoneyHomeSchema.parse(payDemo.moneyHome);
  });

  it("covers every state of every state machine", () => {
    const accounts = Object.values(payDemo.accounts);
    expectCoverage(
      payAccountStatuses,
      accounts.map((a) => a.status),
    );
    expectCoverage(
      payBankStatuses,
      accounts.map((a) => a.bank.status),
    );
    expectCoverage(
      payDeliveryRules,
      obligations.map((o) => o.deliveryRule),
    );
    expectCoverage(
      payObligationStatuses,
      obligations.map((o) => o.status),
    );
    const tranches = obligations.flatMap((o) => o.tranches);
    expectCoverage(
      payTrancheKinds,
      tranches.map((t) => t.kind),
    );
    expectCoverage(
      payTrancheStatuses,
      tranches.map((t) => t.status),
    );
    expectCoverage(
      payDeliveryEventKinds,
      obligations.flatMap((o) => o.deliveryEvents.map((e) => e.kind)),
    );
    expectCoverage(
      payRefundSources,
      obligations.flatMap((o) => o.refunds.map((r) => r.source)),
    );
    expectCoverage(
      payHoldKinds,
      payDemo.holds.map((h) => h.kind),
    );
    expectCoverage(
      payHoldStatuses,
      payDemo.holds.map((h) => h.status),
    );
    expectCoverage(
      payReserveKinds,
      payDemo.reserves.map((r) => r.kind),
    );
    expectCoverage(
      payReserveTriggers,
      payDemo.reserves.map((r) => r.trigger),
    );
    expectCoverage(
      payReserveStatuses,
      payDemo.reserves.map((r) => r.status),
    );
    expectCoverage(
      payDisputeStatuses,
      payDemo.disputes.map((d) => d.status),
    );
    expectCoverage(
      payRecoveryKinds,
      payDemo.recoveries.map((r) => r.kind),
    );
    expectCoverage(
      payRecoveryStatuses,
      payDemo.recoveries.map((r) => r.status),
    );
  });

  it("keeps the money consistent", () => {
    for (const item of obligations) {
      expect(item.proceeds.amountMinor).toBe(
        item.gross.amountMinor -
          item.applicationFee.amountMinor -
          item.tax.amountMinor,
      );
      const scheduled = item.tranches.reduce(
        (sum, t) => sum + t.amount.amountMinor,
        0,
      );
      expect(scheduled).toBeLessThanOrEqual(item.proceeds.amountMinor);
      const released = item.tranches
        .filter((t) => t.status === "released")
        .reduce((sum, t) => sum + t.amount.amountMinor, 0);
      expect(released).toBe(item.released.amountMinor);
    }
  });
});

describe("operator.pay in demo mode and connected mode (W3-0 stubs)", () => {
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
      .pay;

  it("serves fixtures in demo mode", async () => {
    const pay = as(["player", "manager"]);
    await expect(pay.account()).resolves.toMatchObject({
      status: "action-needed",
    });
    const page = await pay.obligations({ limit: 25 });
    expect(page.items).toHaveLength(obligations.length);
    const program = await pay.obligation({
      obligationId: obligations[2]!.id,
    });
    expect(program.tranches[0]?.kind).toBe("start-tranche");
    await expect(pay.publishGate({})).resolves.toMatchObject({ ready: false });
    await expect(pay.moneyHome()).resolves.toMatchObject({ openDisputes: 1 });
  });

  it("keeps money-changing writes to the owner", async () => {
    await expect(
      as(["player", "manager"]).updatePayoutSettings({ interval: "daily" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      as(["owner"]).updatePayoutSettings({ interval: "weekly" }),
    ).resolves.toMatchObject({ interval: "weekly" });
    await expect(
      as(["owner"]).startOnboarding({
        method: "hosted",
        returnPath: "/money/duna-pay",
      }),
    ).resolves.toMatchObject({ state: "hosted" });
  });

  it("says 'not implemented yet' outside demo mode", async () => {
    dataSource.demo = false;
    // `account` and most procedures are live (B2); `moneyHome` is still a stub.
    const error = await as(["owner"])
      .moneyHome()
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(isNotImplementedYet(error)).toBe(true);
  });
});
