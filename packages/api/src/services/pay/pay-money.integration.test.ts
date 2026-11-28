/**
 * Duna Pay disputes, refund funding, reserves, recoveries and reconciliation
 * against an in-memory Postgres with every migration applied. The processor
 * is mocked; nothing leaves the process.
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

const state = vi.hoisted(() => ({
  db: null as unknown,
  configured: true,
  availableMinor: 1_000_000,
  pendingMinor: 0,
  calls: [] as { op: string; input: Record<string, unknown> }[],
}));
vi.mock("@duna/db", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getDatabase: () => state.db,
  getTransactionalDatabase: () => state.db,
}));
vi.mock("../../payments", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isStripeConfigured: () => state.configured,
  loadConnectedAccountMoney: vi.fn(async () => ({
    stripeAvailableMinor: state.availableMinor,
    stripePendingMinor: state.pendingMinor,
  })),
  createConnectedAccountPayout: vi.fn(
    async (input: Record<string, unknown>) => {
      state.calls.push({ op: "payout", input });
      return { id: `po_${state.calls.length}`, status: "pending" };
    },
  ),
  reverseConnectedTransfer: vi.fn(async (input: { amountMinor: number }) => {
    state.calls.push({ op: "reversal", input });
    return { id: "trr_1", amountMinor: input.amountMinor };
  }),
  createConnectedTransfer: vi.fn(async (input: Record<string, unknown>) => {
    state.calls.push({ op: "transfer", input });
    return { id: "tr_back_1" };
  }),
  submitProcessorDisputeEvidence: vi.fn(
    async (input: Record<string, unknown>) => {
      state.calls.push({ op: "evidence", input });
      return { status: "under_review" };
    },
  ),
}));

import {
  academy,
  applyAllMigrations,
  createCatalogTestDatabase,
  seedAcademy,
  testActor,
} from "../../catalog-booking.test-support";
import { startCatalogCheckout } from "../../catalog-checkout";
import {
  processAutomaticOrganizationPayouts,
  synchronizeMoneyDispute,
} from "../../money-service";
import { createApiContext } from "../../context";
import { createCaller } from "../../router";
import {
  activateRollingReserve,
  listPayRecoveries,
  listPayReserves,
  reconcilePayBalances,
} from "./balances";
import {
  listPayDisputes,
  loadPayDispute,
  submitPayDisputeEvidence,
} from "./disputes";
import { DEFAULT_PAY_POLICY_SETTINGS } from "./policy-settings";
import { runPayReleaseJob } from "./release-job";

const { pg, db } = createCatalogTestDatabase();
state.db = db;
const policy = DEFAULT_PAY_POLICY_SETTINGS;

const ids = {
  org: "71000000-0000-4000-8000-000000000001",
  otherOrg: "71000000-0000-4000-8000-000000000002",
  buyer: "72000000-0000-4000-8000-000000000001",
  owner: "72000000-0000-4000-8000-000000000002",
  session: "73000000-0000-4000-8000-000000000001",
  order: "74000000-0000-4000-8000-000000000001",
  item: "75000000-0000-4000-8000-000000000001",
  payment: "76000000-0000-4000-8000-000000000001",
  fund: "77000000-0000-4000-8000-000000000001",
} as const;
const paidAt = "2026-12-01T10:00:00.000Z";
const settledAt = "2026-12-03T00:00:00.000Z";
const endsAt = "2026-12-05T19:00:00.000Z";
const afterDelivery = new Date("2026-12-11T09:00:00.000Z");

async function seed() {
  await pg.exec(`
    TRUNCATE organizations, people CASCADE;
    INSERT INTO organizations (id, slug, name, currency, timezone, stripe_account_id)
      VALUES ('${ids.org}', 'pay-money', 'Pay Money Club', 'USD', 'UTC', 'acct_money_1'),
             ('${ids.otherOrg}', 'pay-other', 'Other Club', 'USD', 'UTC', 'acct_money_2');
    INSERT INTO people (id, display_name, handle) VALUES ('${ids.buyer}', 'Buyer', 'buyer'), ('${ids.owner}', 'Owner', 'owner');
    INSERT INTO organization_money_settings (organization_id, payout_interval, stripe_settings_status)
      VALUES ('${ids.org}', 'daily', 'synced');
    INSERT INTO payouts (organization_id, amount_minor, currency, status, composition, created_at)
      VALUES ('${ids.org}', 100, 'USD', 'paid', '{}'::jsonb, '2026-01-05T00:00:00Z');
    INSERT INTO sessions (id, title, slug, starts_at, ends_at, timezone, status, capacity)
      VALUES ('${ids.session}', 'Clinic', 'clinic-money', '2026-12-05T17:00:00Z', '${endsAt}', 'UTC', 'published', 8);
    INSERT INTO orders (id, organization_id, buyer_person_id, status, currency, subtotal_minor, total_minor, idempotency_key, created_at)
      VALUES ('${ids.order}', '${ids.org}', '${ids.buyer}', 'paid', 'USD', 4000, 4000, 'pay-money-order', '${paidAt}');
    INSERT INTO order_items (id, order_id, kind, reference_id, description, quantity, unit_amount_minor, total_amount_minor)
      VALUES ('${ids.item}', '${ids.order}', 'registration', '${ids.session}', 'Clinic', 1, 4000, 4000);
    INSERT INTO registrations (session_id, person_id, status, eligibility_decision, order_id)
      VALUES ('${ids.session}', '${ids.buyer}', 'confirmed', '{}'::jsonb, '${ids.order}');
    INSERT INTO payments (id, order_id, method, amount_minor, currency, status, stripe_charge_id, stripe_transfer_id, stripe_balance_transaction_id, created_at)
      VALUES ('${ids.payment}', '${ids.order}', 'online-card', 4000, 'USD', 'succeeded', 'ch_money_1', 'tr_money_1', 'txn_money_1', '${paidAt}');
    INSERT INTO payment_fund_schedules (id, organization_id, order_id, payment_id, stripe_balance_transaction_id, policy_name, policy_mode, refund_before_minutes, processor_available_at, available_at, gross_minor, consumer_fee_minor, net_minor, currency, status, created_at)
      VALUES ('${ids.fund}', '${ids.org}', '${ids.order}', '${ids.payment}', 'txn_money_1', 'Flexible · 24 hours', 'refundable', 1440, '${settledAt}', '${endsAt}', 4000, 400, 3600, 'USD', 'available', '${paidAt}');
  `);
  state.configured = true;
  state.availableMinor = 1_000_000;
  state.pendingMinor = 0;
  state.calls.length = 0;
}

async function rows<T>(query: string): Promise<T[]> {
  return (await pg.query<T>(query)).rows;
}
const calls = (op: string) => state.calls.filter((call) => call.op === op);
async function ledgerImbalance(): Promise<number> {
  const [row] = await rows<{ n: number }>(`
    select count(*)::int as n from (select journal_id from ledger_entries group by journal_id
    having sum(case when side = 'debit' then amount else -amount end) <> 0) j`);
  return row!.n;
}
const dispute = (status: string, extra: Record<string, unknown> = {}) => ({
  id: "dp_money_1",
  charge: "ch_money_1",
  amount: 4000,
  currency: "usd",
  reason: "fraudulent",
  status,
  created: Date.parse("2026-12-06T00:00:00Z") / 1000,
  evidence_details: { due_by: Date.parse("2026-12-20T00:00:00Z") / 1000 },
  balance_transactions: [{ fee: 1500 }],
  ...extra,
});

beforeAll(() => applyAllMigrations(pg), 120_000);
afterAll(() => pg.close());
beforeEach(seed);

describe("disputes end to end (§5.1)", () => {
  it("opening holds the sale, reverses the transfer once and lists it for the right club (defect 2)", async () => {
    await runPayReleaseJob({ now: new Date("2026-12-06T00:00:00Z"), policy });
    const at = new Date("2026-12-06T01:00:00Z");
    await synchronizeMoneyDispute({
      object: dispute("needs_response"),
      now: at,
    });
    await synchronizeMoneyDispute({
      object: dispute("needs_response"),
      now: at,
    });
    expect(calls("reversal")).toHaveLength(1);
    // Capped at the club's proceeds (gross 4000 − fee 400).
    expect(calls("reversal")[0]!.input).toMatchObject({
      transferId: "tr_money_1",
      amountMinor: 3_600,
    });
    const holds = await rows<{
      kind: string;
      status: string;
      amount_minor: number;
    }>(`select kind, status, amount_minor from pay_holds`);
    expect(holds).toEqual([
      { kind: "dispute", status: "active", amount_minor: 5_500 },
    ]);
    const page = await listPayDisputes(ids.org, { limit: 25 });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      status: "needs-response",
      amount: { amountMinor: 4_000 },
      fee: { amountMinor: 1_500 },
      organizationEvidenceDueBy: "2026-12-13T00:00:00.000Z",
    });
    expect((await listPayDisputes(ids.otherOrg, { limit: 25 })).items).toEqual(
      [],
    );
    // A disputed sale is never paid out.
    const result = await processAutomaticOrganizationPayouts(afterDelivery);
    expect(result.payouts).toBe(0);
    expect(await ledgerImbalance()).toBe(0);
  });

  it("a win releases the hold, re-transfers less the kept fee, and the sale is paid", async () => {
    await runPayReleaseJob({ now: new Date("2026-12-06T00:00:00Z"), policy });
    await synchronizeMoneyDispute({
      object: dispute("needs_response"),
      now: new Date("2026-12-06T01:00:00Z"),
    });
    await synchronizeMoneyDispute({
      object: dispute("won"),
      now: new Date("2026-12-09T00:00:00Z"),
    });
    await synchronizeMoneyDispute({
      object: dispute("won"),
      now: new Date("2026-12-09T00:05:00Z"),
    });
    expect(calls("transfer")).toHaveLength(1);
    expect(calls("transfer")[0]!.input).toMatchObject({
      amountMinor: 3_600 - 1_500,
    });
    const [hold] = await rows<{ status: string }>(
      `select status from pay_holds`,
    );
    expect(hold!.status).toBe("released");
    await processAutomaticOrganizationPayouts(afterDelivery);
    expect(calls("payout")[0]!.input).toMatchObject({ amountMinor: 3_600 });
    expect(await ledgerImbalance()).toBe(0);
  });

  it("a loss applies the hold and the club is paid nothing for the sale", async () => {
    await runPayReleaseJob({ now: new Date("2026-12-06T00:00:00Z"), policy });
    await synchronizeMoneyDispute({
      object: dispute("needs_response"),
      now: new Date("2026-12-06T01:00:00Z"),
    });
    await synchronizeMoneyDispute({
      object: dispute("lost"),
      now: new Date("2026-12-09T00:00:00Z"),
    });
    const [hold] = await rows<{ status: string }>(
      `select status from pay_holds`,
    );
    expect(hold!.status).toBe("applied");
    const result = await processAutomaticOrganizationPayouts(afterDelivery);
    expect(result.payouts).toBe(0);
    const [obligation] = await rows<{ status: string }>(
      `select status from pay_obligations`,
    );
    expect(obligation!.status).toBe("refunded");
    const journals = await rows<{ description: string }>(
      `select description from ledger_journals where source_type = 'dispute' order by created_at`,
    );
    expect(journals.map((j) => j.description)).toEqual([
      "Card dispute: proceeds reversed and held",
      "Card dispute lost",
    ]);
    expect(await ledgerImbalance()).toBe(0);
  });

  it("a person submits evidence once; without a processor it is not configured", async () => {
    await synchronizeMoneyDispute({
      object: dispute("needs_response"),
      now: new Date("2026-12-06T01:00:00Z"),
    });
    const id = (await listPayDisputes(ids.org, { limit: 25 })).items[0]!.id;
    const submit = () =>
      submitPayDisputeEvidence({
        organizationId: ids.org,
        actorPersonId: ids.owner,
        disputeCaseId: id,
        explanation: "The player attended the clinic; check-in attached.",
        fileStorageKeys: ["evidence/check-in.pdf"],
        idempotencyKey: "evidence-key-0001",
        now: new Date("2026-12-07T00:00:00Z"),
      });
    state.configured = false;
    await expect(submit()).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
    state.configured = true;
    const first = await submit();
    const second = await submit();
    expect(first.status).toBe("evidence-submitted");
    expect(second).toEqual(first);
    expect(calls("evidence")).toHaveLength(1);
    expect((await loadPayDispute(ids.org, id)).evidence.files).toEqual([
      { storageKey: "evidence/check-in.pdf", label: "check-in.pdf" },
    ]);
    await expect(loadPayDispute(ids.otherOrg, id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("refund funding (§5.2)", () => {
  const refund = (id: string, amount: number, at: string) =>
    pg.exec(`
      INSERT INTO refund_records (id, organization_id, order_id, disposition, amount_minor, currency, reason, status, initiated_by_person_id, created_at)
        VALUES ('${id}', '${ids.org}', '${ids.order}', 'original-payment', ${amount}, 'USD', 'Club cancelled the clinic', 'succeeded', '${ids.owner}', '${at}');
      UPDATE payment_fund_schedules SET refunded_minor = refunded_minor + ${amount} WHERE id = '${ids.fund}';
    `);

  it("before payout comes from held funds and reduces the payout, without counting twice", async () => {
    await runPayReleaseJob({ now: new Date("2026-12-04T00:00:00Z"), policy });
    await refund(
      "78000000-0000-4000-8000-000000000001",
      1_000,
      "2026-12-04T01:00:00Z",
    );
    await processAutomaticOrganizationPayouts(afterDelivery);
    const funded = await rows<{ source: string; amount_minor: number }>(
      `select source, amount_minor from pay_obligation_refunds`,
    );
    // Pro rata today: 1000 of 4000 gross → 900 of the 3600 proceeds.
    expect(funded).toEqual([{ source: "held-funds", amount_minor: 900 }]);
    expect(calls("payout")[0]!.input).toMatchObject({ amountMinor: 2_700 });
    // Replays fund nothing more.
    await runPayReleaseJob({ now: afterDelivery, policy });
    expect(await rows(`select id from pay_obligation_refunds`)).toHaveLength(1);
  });

  it("after payout comes from the available balance or future proceeds", async () => {
    await processAutomaticOrganizationPayouts(afterDelivery);
    await refund(
      "78000000-0000-4000-8000-000000000002",
      4_000,
      "2026-12-12T00:00:00Z",
    );
    await runPayReleaseJob({ now: new Date("2026-12-12T01:00:00Z"), policy });
    const funded = await rows<{ source: string; amount_minor: number }>(
      `select source, amount_minor from pay_obligation_refunds`,
    );
    expect(funded).toEqual([
      { source: "future-proceeds", amount_minor: 3_600 },
    ]);
    const [obligation] = await rows<{ status: string }>(
      `select status from pay_obligations`,
    );
    expect(obligation!.status).toBe("refunded");
  });

  it("the operator can refund a credit-paid order through the router (defect 5)", async () => {
    await seedAcademy(pg);
    const booked = await startCatalogCheckout({
      actor: testActor(academy.players[0]!),
      catalogItemId: academy.item,
      catalogVariantId: academy.variant,
      paymentMethod: "credit",
      quantity: 1,
      catalogSessionOccurrenceId: academy.occurrence,
      successUrl: "https://example.test/success",
      cancelUrl: "https://example.test/cancel",
      idempotencyKey: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
      now: academy.now,
    });
    const owner = {
      ...testActor(academy.owner, academy.org),
      roles: ["owner" as const],
      scopes: ["payments:write"],
    };
    const caller = createCaller(
      createApiContext({ actor: owner, now: academy.now }),
    );
    const result = await caller.operator.refundOrganizationOrder({
      orderId: (booked as { orderId: string }).orderId,
      amountMinor: 0,
      disposition: "original-payment",
      reason: "Coach unavailable",
      confirmed: true,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(result.status).toBe("succeeded");
  });
});

describe("reserves, recovery and reconciliation (§5.4, §5.5)", () => {
  it("a proposed rolling reserve withholds nothing until a person activates it, then holds and ends", async () => {
    await pg.exec(`
      INSERT INTO refund_records (organization_id, order_id, disposition, amount_minor, currency, reason, status, initiated_by_person_id, created_at)
        VALUES ('${ids.org}', '${ids.order}', 'organization-credit', 1, 'USD', 'x', 'succeeded', '${ids.owner}', '2026-12-04T00:00:00Z');
      INSERT INTO refund_records (organization_id, order_id, disposition, amount_minor, currency, reason, status, initiated_by_person_id, created_at)
        VALUES ('${ids.org}', '${ids.order}', 'original-payment', 600, 'USD', 'Courtesy refund', 'succeeded', '${ids.owner}', '2026-12-04T00:00:00Z');
    `);
    await runPayReleaseJob({ now: new Date("2026-12-04T00:00:00Z"), policy });
    await reconcilePayBalances({
      policy,
      now: new Date("2026-12-04T01:00:00Z"),
    });
    const [reserve] = await listPayReserves(ids.org);
    expect(reserve).toMatchObject({
      kind: "rolling",
      trigger: "refund-rate",
      status: "proposed",
      held: { amountMinor: 0 },
    });
    await activateRollingReserve({
      reserveId: reserve!.id,
      actorPersonId: ids.owner,
      confirmed: true,
      noticeSentAt: new Date("2026-12-04T02:00:00Z"),
      policy,
      now: new Date("2026-12-04T02:00:00Z"),
    });
    await reconcilePayBalances({
      policy,
      now: new Date("2026-12-04T03:00:00Z"),
    });
    const [active] = await listPayReserves(ids.org);
    expect(active).toMatchObject({ status: "active", percentBps: 1_000 });
    // Its window starts at activation; nothing sold since, so 0 held now.
    expect(active!.held.amountMinor).toBe(0);
    await reconcilePayBalances({
      policy,
      now: new Date("2027-03-05T00:00:00Z"),
    });
    const [ended] = await listPayReserves(ids.org);
    expect(ended!.status).toBe("released");
  });

  it("a negative processor balance becomes a set-off, then an invoice, then is collected", async () => {
    await runPayReleaseJob({ now: new Date("2026-12-04T00:00:00Z"), policy });
    state.availableMinor = -2_500;
    await reconcilePayBalances({
      policy,
      now: new Date("2026-12-12T00:00:00Z"),
    });
    await reconcilePayBalances({
      policy,
      now: new Date("2026-12-12T01:00:00Z"),
    });
    expect(
      (await listPayRecoveries(ids.org)).map((r) => [
        r.kind,
        r.status,
        r.amount.amountMinor,
      ]),
    ).toEqual([["set-off", "pending", 2_500]]);
    await reconcilePayBalances({
      policy,
      now: new Date("2026-12-28T00:00:00Z"),
    });
    expect(
      (await listPayRecoveries(ids.org)).map((r) => r.kind).sort(),
    ).toEqual(["invoice", "set-off"]);
    state.availableMinor = 500;
    await reconcilePayBalances({
      policy,
      now: new Date("2026-12-29T00:00:00Z"),
    });
    const setOff = (await listPayRecoveries(ids.org)).find(
      (r) => r.kind === "set-off",
    )!;
    expect(setOff.status).toBe("collected");
  });

  it("reports drift between the processor balance and Duna's records", async () => {
    await runPayReleaseJob({ now: new Date("2026-12-04T00:00:00Z"), policy });
    state.availableMinor = 3_600;
    const exact = await reconcilePayBalances({
      policy,
      now: new Date("2026-12-04T01:00:00Z"),
    });
    expect(exact.lines).toEqual([
      {
        organizationId: ids.org,
        currency: "USD",
        processorMinor: 3_600,
        expectedMinor: 3_600,
        driftMinor: 0,
      },
    ]);
    expect(exact.drifted).toBe(0);
    state.availableMinor = 3_000;
    const drift = await reconcilePayBalances({
      policy,
      now: new Date("2026-12-04T02:00:00Z"),
    });
    expect(drift.drifted).toBe(1);
    expect(drift.lines[0]!.driftMinor).toBe(-600);
  });
});
