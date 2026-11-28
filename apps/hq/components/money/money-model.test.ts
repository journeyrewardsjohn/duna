import {
  payAccountStatusSchema,
  payBankStatusSchema,
  payDeliveryEventKindSchema,
  payDeliveryRuleSchema,
  payDisputeStatusSchema,
  payHoldKindSchema,
  payHoldStatusSchema,
  payObligationStatusSchema,
  payRecoveryKindSchema,
  payRecoveryStatusSchema,
  payRefundSourceSchema,
  payReserveStatusSchema,
  payReserveTriggerSchema,
  payTrancheStatusSchema,
} from "@duna/api";

const payAccountStatuses = payAccountStatusSchema.options;
const payBankStatuses = payBankStatusSchema.options;
const payDeliveryEventKinds = payDeliveryEventKindSchema.options;
const payDeliveryRules = payDeliveryRuleSchema.options;
const payDisputeStatuses = payDisputeStatusSchema.options;
const payHoldKinds = payHoldKindSchema.options;
const payHoldStatuses = payHoldStatusSchema.options;
const payObligationStatuses = payObligationStatusSchema.options;
const payRecoveryKinds = payRecoveryKindSchema.options;
const payRecoveryStatuses = payRecoveryStatusSchema.options;
const payRefundSources = payRefundSourceSchema.options;
const payReserveStatuses = payReserveStatusSchema.options;
const payReserveTriggers = payReserveTriggerSchema.options;
const payTrancheStatuses = payTrancheStatusSchema.options;
import { payDemo } from "@duna/core/demo/pay";
import { describe, expect, it } from "vitest";
import {
  accountSentence,
  accountStatusCopy,
  bankStatusCopy,
  cleanDescriptor,
  deadlineLabel,
  deliveryEventLabel,
  deliveryRuleCopy,
  deliveryState,
  descriptorProblem,
  disputeReason,
  disputeStatusCopy,
  formatAmount,
  formatBps,
  formatClubDate,
  formatSigned,
  holdReason,
  holdStatusCopy,
  matchesSaleFilter,
  matchesSearch,
  obligationStatusCopy,
  payoutRhythm,
  payoutStatusCopy,
  recoveryKind,
  recoveryStatusCopy,
  refundAmountProblem,
  refundConsequence,
  refundSource,
  refundableMinor,
  reserveStatusCopy,
  reserveTrigger,
  sortDisputes,
  trancheStatusCopy,
  verificationNote,
  type StateCopy,
} from "./money-model";
import { setupNext, setupSteps } from "./money-setup";
import { paymentOrderId, saleRows } from "./sales";

/** Product copy never names the payment processor (only `verificationNote` may). */
const PROCESSOR = /stripe/i;

function expectWords(copy: StateCopy) {
  expect(copy.label.trim().length).toBeGreaterThan(0);
  expect(copy.sentence.trim().length).toBeGreaterThan(10);
  expect(copy.sentence).not.toMatch(PROCESSOR);
  expect(copy.label).not.toMatch(PROCESSOR);
  if (copy.next) expect(copy.next).not.toMatch(PROCESSOR);
}

describe("every state has words", () => {
  it("account statuses, each with a sentence; every one but verifying and ready has a next step", () => {
    for (const status of payAccountStatuses) {
      const copy = accountStatusCopy(status);
      expectWords(copy);
      if (status === "verifying" || status === "ready")
        expect(copy.next).toBeUndefined();
      else expect(copy.next).toBeTruthy();
    }
  });

  it("bank statuses", () => {
    for (const status of payBankStatuses) expectWords(bankStatusCopy(status));
    expect(bankStatusCopy("errored").next).toBeTruthy();
    expect(bankStatusCopy("missing").next).toBeTruthy();
  });

  it("sale (obligation) statuses, with a next step where the owner can act", () => {
    for (const status of payObligationStatuses)
      expectWords(obligationStatusCopy(status));
    expect(obligationStatusCopy("disputed").next).toBe(
      "Respond to the dispute",
    );
    expect(obligationStatusCopy("cancelled").next).toBe("Refund the buyer");
    expect(obligationStatusCopy("held").next).toBeTruthy();
  });

  it("delivery rules and delivery facts", () => {
    for (const rule of payDeliveryRules) {
      expect(deliveryRuleCopy(rule)).toMatch(/^Paid out/);
    }
    for (const kind of payDeliveryEventKinds) {
      expect(deliveryEventLabel(kind)).not.toBe("Delivery recorded");
    }
  });

  it("delivery state says cancelled means nothing released", () => {
    expect(deliveryState("cancelled").label).toBe(
      "Cancelled: nothing released",
    );
    expect(deliveryState("awaiting-delivery").label).toBe(
      "Waiting for the session",
    );
    expect(deliveryState("released").label).toBe("Delivered");
  });

  it("payout portions (tranches)", () => {
    for (const status of payTrancheStatuses)
      expectWords(trancheStatusCopy(status));
  });

  it("payouts, including a failed one with what to do", () => {
    for (const status of [
      "pending",
      "in_transit",
      "paid",
      "failed",
      "canceled",
    ]) {
      expectWords(payoutStatusCopy(status));
    }
    expect(payoutStatusCopy("failed").next).toBe("Check the payout bank");
    expect(payoutStatusCopy("something_new").label).toBe("Something new");
  });

  it("disputes, with a next step while a response is needed", () => {
    for (const status of payDisputeStatuses)
      expectWords(disputeStatusCopy(status));
    expect(disputeStatusCopy("needs-response").next).toBeTruthy();
    expect(disputeReason("product_not_received")).toMatch(/didn't receive/);
    expect(disputeReason("odd_code")).toBe("Reason given: odd code");
  });

  it("holds, reserves, refunds and recovery", () => {
    for (const kind of payHoldKinds)
      expect(holdReason(kind).length).toBeGreaterThan(10);
    for (const status of payHoldStatuses) expectWords(holdStatusCopy(status));
    for (const status of payReserveStatuses)
      expectWords(reserveStatusCopy(status));
    for (const trigger of payReserveTriggers)
      expect(reserveTrigger(trigger)).toBeTruthy();
    for (const source of payRefundSources)
      expect(refundSource(source)).toBeTruthy();
    for (const kind of payRecoveryKinds)
      expect(recoveryKind(kind)).toBeTruthy();
    for (const status of payRecoveryStatuses)
      expectWords(recoveryStatusCopy(status));
    // A proposed reserve is a proposal: a Duna person activates it after notice.
    expect(reserveStatusCopy("proposed").sentence).toMatch(
      /Nothing is held unless a Duna person activates it/,
    );
  });

  it("names the processor only where identity verification is explained", () => {
    expect(verificationNote).toMatch(PROCESSOR);
  });
});

describe("formatters", () => {
  it("formats amounts the backend returned, with the currency", () => {
    expect(formatAmount({ amountMinor: 4800, currency: "USD" })).toBe("$48.00");
    expect(formatSigned({ amountMinor: -1200, currency: "USD" })).toBe(
      "−$12.00",
    );
    expect(formatBps(250)).toBe("2.5%");
    expect(formatBps(1000)).toBe("10%");
  });

  it("formats dates in the club's time zone", () => {
    // 03:00 UTC on the 4th is still the 3rd in Los Angeles.
    expect(
      formatClubDate("2026-12-04T03:00:00.000Z", "America/Los_Angeles"),
    ).toBe("Dec 3, 2026");
    expect(formatClubDate("2026-12-04T03:00:00.000Z", "UTC")).toBe(
      "Dec 4, 2026",
    );
    expect(formatClubDate(undefined, "UTC")).toBeUndefined();
    expect(formatClubDate("not a date", "UTC")).toBeUndefined();
  });

  it("says deadlines in days", () => {
    const now = new Date("2026-11-28T12:00:00.000Z");
    expect(deadlineLabel("2026-12-01T12:00:00.000Z", now)).toBe(
      "Due in 3 days",
    );
    expect(deadlineLabel("2026-11-29T12:00:00.000Z", now)).toBe("Due tomorrow");
    expect(deadlineLabel("2026-11-28T12:00:00.000Z", now)).toBe("Due today");
    expect(deadlineLabel("2026-11-26T12:00:00.000Z", now)).toBe(
      "2 days overdue",
    );
  });

  it("says the payout rhythm", () => {
    expect(
      payoutRhythm({ interval: "daily", weeklyDay: "monday", monthlyDay: 1 }),
    ).toBe("Every business day");
    expect(
      payoutRhythm({ interval: "weekly", weeklyDay: "friday", monthlyDay: 1 }),
    ).toBe("Every Friday");
    expect(
      payoutRhythm({
        interval: "monthly",
        weeklyDay: "friday",
        monthlyDay: 22,
      }),
    ).toBe("On the 22nd of each month");
    expect(
      payoutRhythm({
        interval: "monthly",
        weeklyDay: "friday",
        monthlyDay: 11,
      }),
    ).toBe("On the 11th of each month");
    expect(
      payoutRhythm({ interval: "manual", weeklyDay: "friday", monthlyDay: 1 }),
    ).toBe("Only when you ask");
  });

  it("checks statement names the way the backend does", () => {
    expect(descriptorProblem("")).toBeUndefined();
    expect(descriptorProblem("DUNA")).toMatch(/at least 5/);
    expect(descriptorProblem("SUNSET BEACH CLUB")).toBeUndefined();
    expect(descriptorProblem("x".repeat(23).toUpperCase())).toMatch(/22/);
    expect(cleanDescriptor("Sunset Beach Club!*")).toBe("SUNSET BEACH CLUB");
  });
});

describe("refunds", () => {
  it("never allows more than is left", () => {
    expect(refundableMinor({ grossMinor: 4800, refundedMinor: 1800 })).toBe(
      3000,
    );
    expect(refundableMinor({ grossMinor: 4800, refundedMinor: 5000 })).toBe(0);
    expect(
      refundAmountProblem({
        amountMinor: 3001,
        refundableMinor: 3000,
        method: "card",
      }),
    ).toMatch(/more than/);
    expect(
      refundAmountProblem({
        amountMinor: 0,
        refundableMinor: 3000,
        method: "card",
      }),
    ).toBeTruthy();
    expect(
      refundAmountProblem({
        amountMinor: 3000,
        refundableMinor: 3000,
        method: "card",
      }),
    ).toBeUndefined();
    // Credits refund with no amount: no money moves.
    expect(
      refundAmountProblem({
        amountMinor: null,
        refundableMinor: 0,
        method: "credits",
      }),
    ).toBeUndefined();
  });

  it("states the consequence without inventing numbers", () => {
    const card = refundConsequence({
      method: "card",
      full: false,
      buyerName: "Jane",
    });
    expect(card).toMatch(/cannot be undone/);
    expect(card).toMatch(/in proportion/);
    expect(card).not.toMatch(/\d/);
    expect(
      refundConsequence({ method: "credits", full: true, buyerName: "Jane" }),
    ).toMatch(/no money moves/);
  });
});

describe("transactions list", () => {
  it("filters by what happened to the money and searches loosely", () => {
    expect(matchesSaleFilter("awaiting-delivery", "waiting")).toBe(true);
    expect(matchesSaleFilter("disputed", "held")).toBe(true);
    expect(matchesSaleFilter("partially-refunded", "refunded")).toBe(true);
    expect(matchesSaleFilter(undefined, "refunded")).toBe(false);
    expect(matchesSaleFilter(undefined, "all")).toBe(true);
    expect(matchesSearch("mara court", ["Court rental", "Mara Lewis"])).toBe(
      true,
    );
    expect(matchesSearch("José", ["Jose Ortiz"])).toBe(true);
    expect(matchesSearch("lesson", ["Court rental"])).toBe(false);
  });

  it("orders disputes needing a response first, earliest deadline first", () => {
    const sorted = sortDisputes([
      {
        id: "a",
        status: "won" as const,
        openedAt: "2026-11-01",
        organizationEvidenceDueBy: undefined,
      },
      {
        id: "b",
        status: "needs-response" as const,
        openedAt: "2026-11-02",
        organizationEvidenceDueBy: "2026-12-09",
      },
      {
        id: "c",
        status: "needs-response" as const,
        openedAt: "2026-11-03",
        organizationEvidenceDueBy: "2026-12-03",
      },
    ]);
    expect(sorted.map((item) => item.id)).toEqual(["c", "b", "a"]);
  });

  it("merges sale records with payments, without double-counting an order", () => {
    const sale = payDemo.obligations[0]!;
    const rows = saleRows({
      obligations: [sale],
      payments: [
        {
          id: `order:${sale.orderId}`,
          occurredAt: "2026-11-01T00:00:00.000Z",
          status: "succeeded",
          buyerName: "Someone",
          description: "Same order",
          source: "catalog",
          currency: "USD",
          grossMinor: 100,
        },
        {
          id: "payout:00000000-0000-4000-8000-000000000001",
          occurredAt: "2026-11-01T00:00:00.000Z",
          status: "paid",
          buyerName: "",
          description: "Payout",
          source: "payout",
          currency: "USD",
          grossMinor: 100,
        },
        {
          id: "00000000-0000-4000-8000-000000000093",
          occurredAt: "2026-11-02T00:00:00.000Z",
          status: "succeeded",
          buyerName: "Ava",
          description: "Clinic",
          source: "event",
          currency: "USD",
          grossMinor: 2500,
          processingFeeMinor: 100,
          organizationFeeMinor: 50,
        },
      ],
      timeZone: "UTC",
    });
    expect(rows.map((row) => row.title)).toEqual(
      expect.arrayContaining([sale.title, "Clinic"]),
    );
    expect(rows).toHaveLength(2);
    const clinic = rows.find((row) => row.title === "Clinic")!;
    expect(clinic.fees).toBe("$1.50");
    expect(clinic.net).toBeUndefined();
    expect(paymentOrderId(`order:${sale.orderId}`)).toBe(sale.orderId);
    expect(paymentOrderId("collection:x")).toBeUndefined();
  });
});

describe("Duna Pay setup flow", () => {
  const accounts = payDemo.accounts;

  it("has one next thing for every status", () => {
    // The demo club confirmed its business already: verification is next.
    expect(setupNext(accounts["not-started"])).toMatchObject({
      kind: "step",
      step: { key: "verify" },
    });
    expect(
      setupNext({ ...accounts["not-started"], business: {} }),
    ).toMatchObject({
      kind: "step",
      step: { key: "business" },
    });
    expect(setupNext(accounts["in-progress"])).toMatchObject({ kind: "step" });
    expect(setupNext(accounts["action-needed"])).toMatchObject({
      kind: "step",
      step: { key: "verify" },
    });
    expect(setupNext(accounts.restricted)).toMatchObject({
      kind: "step",
      step: { key: "verify" },
    });
    expect(setupNext(accounts.ready)).toEqual({ kind: "done" });
  });

  it("waits while the details are checked and the bank is verified", () => {
    expect(
      setupNext({
        ...accounts.verifying,
        payoutsEnabled: true,
        bank: { status: "verified", last4: "6789" },
      }),
    ).toEqual({ kind: "wait" });
  });

  it("sends a bank-only problem to the payout bank step", () => {
    expect(
      setupNext({
        ...accounts["action-needed"],
        requirementsDue: [
          { code: "external_account", label: "Bank account was declined" },
        ],
      }),
    ).toMatchObject({ kind: "step", step: { key: "payouts" } });
  });

  it("marks the steps from the account, needs attention in words", () => {
    const steps = setupSteps(accounts["action-needed"]);
    expect(steps.map((step) => [step.key, step.mark])).toEqual([
      ["business", "done"],
      ["verify", "attention"],
      ["payouts", "attention"],
    ]);
    expect(setupSteps(accounts.ready).every((step) => step.done)).toBe(true);
  });

  it("says where the club stands in one sentence, with the deadline", () => {
    expect(accountSentence(accounts["action-needed"], "UTC")).toMatch(
      /by Dec 4, 2026/,
    );
    for (const status of payAccountStatuses) {
      expect(accountSentence(accounts[status], "UTC")).not.toMatch(PROCESSOR);
    }
  });
});
