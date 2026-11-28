/**
 * Duna Pay release job and payouts against an in-memory Postgres with every
 * migration applied. The processor is mocked; nothing leaves the process.
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
  availableMinor: 1_000_000,
  payoutCalls: [] as { amountMinor: number; idempotencyKey: string }[],
}));
vi.mock("@duna/db", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getDatabase: () => state.db,
  getTransactionalDatabase: () => state.db,
}));
vi.mock("../../payments", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadConnectedAccountMoney: vi.fn(async () => ({
    stripeAvailableMinor: state.availableMinor,
    stripePendingMinor: 0,
  })),
  createConnectedAccountPayout: vi.fn(
    async (input: { amountMinor: number; idempotencyKey: string }) => {
      state.payoutCalls.push(input);
      return { id: `po_${state.payoutCalls.length}`, status: "pending" };
    },
  ),
}));

import {
  academy,
  applyAllMigrations,
  configureParticipation,
  createCatalogTestDatabase,
  seedAcademy,
} from "../../catalog-booking.test-support";
import {
  processAutomaticOrganizationPayouts,
  synchronizeMoneyPayout,
} from "../../money-service";
import {
  payHoldSchema,
  payObligationDetailSchema,
  payObligationsPageSchema,
} from "../../contracts/pay";
import { DEFAULT_PAY_POLICY_SETTINGS } from "./policy-settings";
import {
  listPayHolds,
  listPayObligations,
  loadPayObligationDetail,
} from "./read-model";
import { runPayReleaseJob } from "./release-job";

const { pg, db } = createCatalogTestDatabase();
state.db = db;

const ids = {
  org: "61000000-0000-4000-8000-000000000001",
  buyer: "62000000-0000-4000-8000-000000000001",
  session: "63000000-0000-4000-8000-000000000001",
  order: "64000000-0000-4000-8000-000000000001",
  item: "65000000-0000-4000-8000-000000000001",
  payment: "66000000-0000-4000-8000-000000000001",
  fund: "67000000-0000-4000-8000-000000000001",
  registration: "68000000-0000-4000-8000-000000000001",
} as const;

/** Clinic on Thursday 10 December 2026, 17:00–19:00 UTC; paid 1 December. */
const sessionStartsAt = "2026-12-10T17:00:00.000Z";
const sessionEndsAt = "2026-12-10T19:00:00.000Z";
const paidAt = "2026-12-01T10:00:00.000Z";
const settledAt = "2026-12-03T00:00:00.000Z";

async function seed(options: { readonly paidBefore?: boolean } = {}) {
  await pg.exec(`
    TRUNCATE organizations, people CASCADE;
    INSERT INTO organizations (id, slug, name, currency, timezone, stripe_account_id)
      VALUES ('${ids.org}', 'pay-test', 'Pay Test Club', 'USD', 'UTC', 'acct_test_1');
    INSERT INTO people (id, display_name, handle) VALUES ('${ids.buyer}', 'Buyer', 'buyer');
    INSERT INTO organization_money_settings (organization_id, payout_interval, stripe_settings_status)
      VALUES ('${ids.org}', 'daily', 'synced');
    INSERT INTO sessions (id, title, slug, starts_at, ends_at, timezone, status, capacity)
      VALUES ('${ids.session}', 'Thursday clinic', 'thursday-clinic', '${sessionStartsAt}', '${sessionEndsAt}', 'UTC', 'published', 8);
    INSERT INTO orders (id, organization_id, buyer_person_id, status, currency, subtotal_minor, fee_total_minor, total_minor, idempotency_key, created_at)
      VALUES ('${ids.order}', '${ids.org}', '${ids.buyer}', 'paid', 'USD', 4000, 300, 4300, 'pay-test-order', '${paidAt}');
    INSERT INTO order_items (id, order_id, kind, reference_id, description, quantity, unit_amount_minor, total_amount_minor)
      VALUES ('${ids.item}', '${ids.order}', 'registration', '${ids.session}', 'Thursday clinic', 1, 4000, 4000);
    INSERT INTO registrations (id, session_id, person_id, status, eligibility_decision, order_id)
      VALUES ('${ids.registration}', '${ids.session}', '${ids.buyer}', 'confirmed', '{}'::jsonb, '${ids.order}');
    INSERT INTO payments (id, order_id, method, amount_minor, currency, status, stripe_charge_id, stripe_payment_intent_id, stripe_balance_transaction_id, created_at)
      VALUES ('${ids.payment}', '${ids.order}', 'online-card', 4300, 'USD', 'succeeded', 'ch_test_1', 'pi_test_1', 'txn_test_1', '${paidAt}');
    INSERT INTO payment_fund_schedules (id, organization_id, order_id, payment_id, stripe_balance_transaction_id, session_id, policy_name, policy_mode, refund_before_minutes, event_starts_at, policy_release_at, processor_available_at, available_at, gross_minor, consumer_fee_minor, processing_fee_minor, net_minor, currency, status, created_at)
      VALUES ('${ids.fund}', '${ids.org}', '${ids.order}', '${ids.payment}', 'txn_test_1', '${ids.session}', 'Flexible · 24 hours', 'refundable', 1440, '${sessionStartsAt}', '${sessionEndsAt}', '${settledAt}', '${sessionEndsAt}', 4300, 300, 160, 3840, 'USD', 'held', '${paidAt}');
  `);
  if (options.paidBefore) {
    // An organisation paid out before Duna Pay has no first-payout delay.
    await pg.exec(`
      INSERT INTO payouts (organization_id, amount_minor, currency, status, composition, created_at)
        VALUES ('${ids.org}', 100, 'USD', 'paid', '{}'::jsonb, '2026-01-05T00:00:00Z');
    `);
  }
  state.availableMinor = 1_000_000;
  state.payoutCalls.length = 0;
}

async function rows<T>(query: string): Promise<T[]> {
  return (await pg.query<T>(query)).rows;
}

async function trancheRows() {
  return rows<{
    sequence: number;
    status: string;
    amount_minor: number;
    payout_id: string | null;
  }>(
    `select sequence, status, amount_minor, payout_id from pay_release_tranches order by sequence`,
  );
}

async function ledgerImbalance(): Promise<number> {
  const [row] = await rows<{ unbalanced: number }>(`
    select count(*)::int as unbalanced from (
      select journal_id from ledger_entries
      group by journal_id
      having sum(case when side = 'debit' then amount else -amount end) <> 0
    ) j`);
  return row?.unbalanced ?? -1;
}

beforeAll(async () => {
  await applyAllMigrations(pg);
}, 120_000);

beforeEach(async () => {
  await seed({ paidBefore: true });
});

afterAll(async () => {
  await pg.close();
});

describe("Duna Pay release job", () => {
  it("creates one obligation per sold line with the policy's delivery rule", async () => {
    const now = new Date("2026-12-05T00:00:00.000Z");
    const result = await runPayReleaseJob({
      now,
      policy: DEFAULT_PAY_POLICY_SETTINGS,
    });
    expect(result.obligationsCreated).toBe(1);
    expect(result.failures).toBe(0);
    const [obligation] = await rows<{
      delivery_rule: string;
      status: string;
      gross_minor: number;
      application_fee_minor: number;
      proceeds_minor: number;
      settled_at: Date | null;
    }>(`select * from pay_obligations`);
    expect(obligation).toMatchObject({
      delivery_rule: "scheduled-end",
      status: "awaiting-delivery",
      gross_minor: 4300,
      application_fee_minor: 460,
      proceeds_minor: 3840,
    });
    expect(await trancheRows()).toEqual([
      { sequence: 0, status: "scheduled", amount_minor: 3840, payout_id: null },
    ]);
  });

  it("pays nothing before the session has ended, even after the refund window (defect 1)", async () => {
    // 24 hours before the start the old rule made this money payable.
    const now = new Date("2026-12-10T18:00:00.000Z");
    const result = await processAutomaticOrganizationPayouts(now);
    expect(result.payouts).toBe(0);
    expect(state.payoutCalls).toHaveLength(0);
    expect((await trancheRows())[0]!.status).toBe("scheduled");
  });

  it("pays a delivered, settled sale once, and replays change nothing", async () => {
    const now = new Date("2026-12-11T09:00:00.000Z");
    const first = await processAutomaticOrganizationPayouts(now);
    expect(first.payouts).toBe(1);
    expect(first.release.failures).toBe(0);
    expect(state.payoutCalls).toEqual([
      {
        accountId: "acct_test_1",
        amountMinor: 3840,
        currency: "USD",
        idempotencyKey: `duna-auto-payout:${ids.org}:2026-12-11`,
      },
    ]);
    const afterFirst = {
      tranches: await trancheRows(),
      events: await rows(
        `select kind, idempotency_key from pay_delivery_events order by created_at`,
      ),
      obligations: await rows(
        `select status, released_minor from pay_obligations`,
      ),
    };
    expect(afterFirst.tranches[0]).toMatchObject({
      status: "released",
      amount_minor: 3840,
    });
    expect(afterFirst.obligations).toEqual([
      { status: "released", released_minor: 3840 },
    ]);

    // The hourly cron runs again the same day, and again the next day.
    await processAutomaticOrganizationPayouts(
      new Date("2026-12-11T10:00:00.000Z"),
    );
    await runPayReleaseJob({ now: new Date("2026-12-12T09:00:00.000Z") });
    await processAutomaticOrganizationPayouts(
      new Date("2026-12-12T09:00:00.000Z"),
    );
    expect(state.payoutCalls).toHaveLength(1);
    expect(await trancheRows()).toEqual(afterFirst.tranches);
    expect(
      await rows(
        `select kind, idempotency_key from pay_delivery_events order by created_at`,
      ),
    ).toEqual(afterFirst.events);
    const [payout] = await rows<{ count: number; total: number }>(
      `select count(*)::int as count, sum(amount_minor)::int as total from payouts where stripe_payout_id is not null`,
    );
    expect(payout).toEqual({ count: 1, total: 3840 });
    expect(await ledgerImbalance()).toBe(0);
  });

  it("a session cancelled releases nothing (participation rule)", async () => {
    await pg.exec(
      `update sessions set status = 'cancelled', updated_at = '2026-12-09T17:00:00Z' where id = '${ids.session}'`,
    );
    const result = await processAutomaticOrganizationPayouts(
      new Date("2026-12-12T09:00:00.000Z"),
    );
    expect(result.payouts).toBe(0);
    expect(state.payoutCalls).toHaveLength(0);
    expect((await trancheRows())[0]!.status).toBe("cancelled");
    const [obligation] = await rows<{ status: string }>(
      `select status from pay_obligations`,
    );
    expect(obligation!.status).toBe("cancelled");
    const events = await rows<{ kind: string }>(
      `select kind from pay_delivery_events`,
    );
    expect(events.map((event) => event.kind)).toEqual(["delivery-cancelled"]);
  });

  it("is safe when two payout runs race", async () => {
    const now = new Date("2026-12-11T09:00:00.000Z");
    await runPayReleaseJob({ now });
    await Promise.all([
      processAutomaticOrganizationPayouts(now),
      processAutomaticOrganizationPayouts(now),
    ]);
    expect(state.payoutCalls).toHaveLength(1);
    const [count] = await rows<{ count: number }>(
      `select count(*)::int as count from pay_release_tranches where status = 'released'`,
    );
    expect(count!.count).toBe(1);
  });

  it("never pays more than the processor balance holds", async () => {
    state.availableMinor = 1_000;
    const result = await processAutomaticOrganizationPayouts(
      new Date("2026-12-11T09:00:00.000Z"),
    );
    expect(result.payouts).toBe(0);
    expect((await trancheRows())[0]!.status).toBe("releasable");
  });

  it("a refund before payout reduces what is paid", async () => {
    await pg.exec(
      `update payment_fund_schedules set refunded_minor = 1075, status = 'partially-refunded' where id = '${ids.fund}'`,
    );
    await processAutomaticOrganizationPayouts(
      new Date("2026-12-11T09:00:00.000Z"),
    );
    // Until refund funding records exist (PR 2) the whole refund comes off
    // the proceeds, exactly as the old rail did: 3840 − 1075.
    expect(state.payoutCalls[0]!.amountMinor).toBe(2765);
  });

  it("a failed payout returns its tranches and reverses the journal, once", async () => {
    const now = new Date("2026-12-11T09:00:00.000Z");
    await processAutomaticOrganizationPayouts(now);
    const failure = { id: "po_1", status: "failed" };
    await synchronizeMoneyPayout({
      object: failure,
      now: new Date("2026-12-12T09:00:00.000Z"),
    });
    await synchronizeMoneyPayout({
      object: failure,
      now: new Date("2026-12-12T09:05:00.000Z"),
    });
    expect((await trancheRows())[0]).toMatchObject({
      status: "releasable",
      payout_id: null,
    });
    const journals = await rows<{ count: number }>(
      `select count(*)::int as count from ledger_journals where source_type = 'payout'`,
    );
    expect(journals[0]!.count).toBe(2);
    expect(await ledgerImbalance()).toBe(0);
  });
});

describe("first run after deploy: legacy fund schedules", () => {
  /** A sale made under the old rail: a fund schedule and no obligation. */
  async function legacySale(
    n: number,
    sale: {
      readonly sessionStatus?: string;
      readonly endsAt: string;
      readonly fundStatus: string;
      readonly netMinor: number;
      readonly refundedMinor?: number;
      readonly balanceTransaction?: boolean;
    },
  ) {
    const hex = n.toString(16).padStart(4, "0");
    const id = (prefix: string) =>
      `${prefix}000000-0000-4000-8000-00000000${hex}`;
    const startsAt = new Date(
      new Date(sale.endsAt).getTime() - 2 * 3_600_000,
    ).toISOString();
    const txn =
      sale.balanceTransaction === false ? "NULL" : `'txn_legacy_${n}'`;
    await pg.exec(`
      INSERT INTO sessions (id, title, slug, starts_at, ends_at, timezone, status, capacity)
        VALUES ('${id("a1")}', 'Legacy ${n}', 'legacy-${n}', '${startsAt}', '${sale.endsAt}', 'UTC', '${sale.sessionStatus ?? "published"}', 8);
      INSERT INTO orders (id, organization_id, buyer_person_id, status, currency, subtotal_minor, total_minor, idempotency_key, created_at)
        VALUES ('${id("a2")}', '${ids.org}', '${ids.buyer}', 'paid', 'USD', 4000, 4000, 'legacy-${n}', '${paidAt}');
      INSERT INTO order_items (id, order_id, kind, reference_id, description, quantity, unit_amount_minor, total_amount_minor)
        VALUES ('${id("a3")}', '${id("a2")}', 'registration', '${id("a1")}', 'Legacy ${n}', 1, 4000, 4000);
      INSERT INTO registrations (session_id, person_id, status, eligibility_decision, order_id)
        VALUES ('${id("a1")}', '${ids.buyer}', 'confirmed', '{}'::jsonb, '${id("a2")}');
      INSERT INTO payments (id, order_id, method, amount_minor, currency, status, stripe_charge_id, created_at)
        VALUES ('${id("a4")}', '${id("a2")}', 'online-card', 4000, 'USD', 'succeeded', 'ch_legacy_${n}', '${paidAt}');
      INSERT INTO payment_fund_schedules (organization_id, order_id, payment_id, stripe_balance_transaction_id, policy_name, policy_mode, refund_before_minutes, processor_available_at, available_at, gross_minor, consumer_fee_minor, net_minor, refunded_minor, currency, status, created_at)
        VALUES ('${ids.org}', '${id("a2")}', '${id("a4")}', ${txn}, 'Flexible · 24 hours', 'refundable', 1440, '${settledAt}', '${settledAt}', 4000, 100, ${sale.netMinor}, ${sale.refundedMinor ?? 0}, 'USD', '${sale.fundStatus}', '${paidAt}');
    `);
  }

  it("creates obligations on first sight; delivered sales pay, others wait, cancelled pay nothing, never more than the old rail", async () => {
    await pg.exec(
      `DELETE FROM payment_fund_schedules; DELETE FROM payments; DELETE FROM registrations; DELETE FROM order_items; DELETE FROM orders; DELETE FROM sessions;`,
    );
    const now = new Date("2026-12-11T09:00:00.000Z");
    const delivered = "2026-12-05T19:00:00.000Z";
    const future = "2026-12-20T19:00:00.000Z";
    const sales = [
      { endsAt: delivered, fundStatus: "available", netMinor: 3_700 }, // pays 3700
      { endsAt: delivered, fundStatus: "available", netMinor: 3_500 }, // fee estimate (100) lower than actual: capped at net 3500
      {
        endsAt: delivered,
        fundStatus: "available",
        netMinor: 3_700,
        refundedMinor: 1_000,
      }, // pays 2700
      { endsAt: future, fundStatus: "available", netMinor: 3_700 }, // waits (old rail would have paid)
      {
        endsAt: delivered,
        sessionStatus: "cancelled",
        fundStatus: "available",
        netMinor: 3_700,
      }, // nothing
      {
        endsAt: delivered,
        fundStatus: "available",
        netMinor: 3_700,
        balanceTransaction: false,
      }, // unsettled: waits, as before
      { endsAt: delivered, fundStatus: "paid-out", netMinor: 3_700 }, // already paid: never touched
      { endsAt: delivered, fundStatus: "payout-pending", netMinor: 3_700 }, // already paid: never touched
      { endsAt: delivered, fundStatus: "available", netMinor: 3_700 }, // pays 3700
      { endsAt: delivered, fundStatus: "available", netMinor: 3_700 }, // pays 3700
    ];
    for (const [index, sale] of sales.entries())
      await legacySale(index + 1, sale);
    // The old rail's payout: every available fund with a balance transaction, net − refunded.
    const [old] = await rows<{ total: number }>(`
      select coalesce(sum(net_minor - refunded_minor - disputed_minor), 0)::int as total
      from payment_fund_schedules where status = 'available' and stripe_balance_transaction_id is not null`);

    const result = await processAutomaticOrganizationPayouts(now);
    expect(result.release.obligationsCreated).toBe(8);
    expect(result.release.failures).toBe(0);
    expect(state.payoutCalls).toHaveLength(1);
    expect(state.payoutCalls[0]!.amountMinor).toBe(
      3_700 + 3_500 + 2_700 + 3_700 + 3_700,
    );
    expect(state.payoutCalls[0]!.amountMinor).toBeLessThanOrEqual(old!.total);
    const statuses = await rows<{ status: string; count: number }>(
      `select status, count(*)::int as count from pay_obligations group by status order by status`,
    );
    expect(statuses).toEqual([
      { status: "awaiting-delivery", count: 1 },
      { status: "cancelled", count: 1 },
      { status: "partially-refunded", count: 1 },
      { status: "pending-settlement", count: 1 },
      { status: "released", count: 4 },
    ]);
    const [untouched] = await rows<{ count: number }>(`
      select count(*)::int as count from payment_fund_schedules f
      where f.status in ('paid-out') and exists (select 1 from pay_obligations o where o.fund_schedule_id = f.id)`);
    expect(untouched!.count).toBe(0);

    // Running again (next hour, next day) creates and pays nothing more.
    await processAutomaticOrganizationPayouts(
      new Date("2026-12-11T10:00:00.000Z"),
    );
    const again = await processAutomaticOrganizationPayouts(
      new Date("2026-12-12T09:00:00.000Z"),
    );
    expect(again.release.obligationsCreated).toBe(0);
    expect(state.payoutCalls).toHaveLength(1);
    expect(await ledgerImbalance()).toBe(0);
  });
});

describe("operator.pay read model", () => {
  it("serves obligations, detail and holds on the frozen contract, scoped to the organisation", async () => {
    await processAutomaticOrganizationPayouts(
      new Date("2026-12-11T09:00:00.000Z"),
    );
    const page = payObligationsPageSchema.parse(
      await listPayObligations(ids.org, { limit: 25 }),
    );
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      title: "Thursday clinic",
      status: "released",
      released: { amountMinor: 3840, currency: "USD" },
      buyer: { displayName: "Buyer", initials: "B" },
    });
    const detail = payObligationDetailSchema.parse(
      await loadPayObligationDetail(ids.org, page.items[0]!.id),
    );
    expect(detail.tranches.map((tranche) => tranche.status)).toEqual([
      "released",
    ]);
    expect(detail.deliveryEvents.map((event) => event.kind)).toEqual([
      "session-ended",
    ]);
    expect(payHoldSchema.array().parse(await listPayHolds(ids.org))).toEqual(
      [],
    );
    await expect(
      loadPayObligationDetail(
        "61000000-0000-4000-8000-000000000999",
        page.items[0]!.id,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const filtered = await listPayObligations(ids.org, {
      limit: 25,
      status: "held",
    });
    expect(filtered.items).toEqual([]);
  });
});

describe("first payout delay (§5.3)", () => {
  it("holds a new organisation's first payout for the configured days", async () => {
    await seed({ paidBefore: false });
    const now = new Date("2026-12-07T00:00:00.000Z");
    await pg.exec(
      `update sessions set starts_at = '2026-12-02T17:00:00Z', ends_at = '2026-12-02T19:00:00Z' where id = '${ids.session}'`,
    );
    const early = await processAutomaticOrganizationPayouts(now);
    expect(early.payouts).toBe(0);
    const [tranche] = await rows<{ status: string; releasable_at: Date }>(
      `select status, releasable_at from pay_release_tranches`,
    );
    expect(tranche!.status).toBe("delivered");
    expect(new Date(tranche!.releasable_at).toISOString()).toBe(
      "2026-12-08T10:00:00.000Z",
    );
    const later = await processAutomaticOrganizationPayouts(
      new Date("2026-12-08T11:00:00.000Z"),
    );
    expect(later.payouts).toBe(1);
  });
});

describe("group sessions with a minimum (participation.md §5.4)", () => {
  const order = "64000000-0000-4000-8000-000000000101";
  const item = "65000000-0000-4000-8000-000000000101";
  const fulfillment = "69000000-0000-4000-8000-000000000101";
  const payment = "66000000-0000-4000-8000-000000000101";
  const fund = "67000000-0000-4000-8000-000000000101";
  const buyer = academy.players[0];
  const occurrenceEndsAt = "2026-12-10T18:00:00.000Z";

  beforeEach(async () => {
    await seedAcademy(pg);
    await configureParticipation(
      pg,
      {
        minParticipants: 3,
        minimumPolicy: "cancel",
        cutoffMinutesBeforeStart: 1440,
      },
      1,
    );
    await pg.exec(`
      UPDATE organizations SET stripe_account_id = 'acct_test_2' WHERE id = '${academy.org}';
      INSERT INTO organization_money_settings (organization_id, payout_interval, stripe_settings_status)
        VALUES ('${academy.org}', 'daily', 'synced');
      INSERT INTO payouts (organization_id, amount_minor, currency, status, composition, created_at)
        VALUES ('${academy.org}', 100, 'USD', 'paid', '{}'::jsonb, '2026-01-05T00:00:00Z');
      INSERT INTO orders (id, organization_id, buyer_person_id, status, currency, subtotal_minor, total_minor, idempotency_key, created_at)
        VALUES ('${order}', '${academy.org}', '${buyer}', 'paid', 'USD', 3000, 3000, 'pay-group-order', '${paidAt}');
      INSERT INTO order_items (id, order_id, kind, reference_id, description, quantity, unit_amount_minor, total_amount_minor)
        VALUES ('${item}', '${order}', 'catalog-service', '${academy.variant}', 'Group training', 1, 3000, 3000);
      INSERT INTO catalog_fulfillments (id, organization_id, order_id, order_item_id, catalog_item_id, catalog_variant_id, catalog_session_occurrence_id, person_id, kind, status)
        VALUES ('${fulfillment}', '${academy.org}', '${order}', '${item}', '${academy.item}', '${academy.variant}', '${academy.occurrence}', '${buyer}', 'registration', 'ready');
      INSERT INTO payments (id, order_id, method, amount_minor, currency, status, stripe_charge_id, stripe_balance_transaction_id, created_at)
        VALUES ('${payment}', '${order}', 'online-card', 3000, 'USD', 'succeeded', 'ch_test_2', 'txn_test_2', '${paidAt}');
      INSERT INTO payment_fund_schedules (id, organization_id, order_id, payment_id, stripe_balance_transaction_id, policy_name, policy_mode, refund_before_minutes, processor_available_at, available_at, gross_minor, consumer_fee_minor, net_minor, currency, status, created_at)
        VALUES ('${fund}', '${academy.org}', '${order}', '${payment}', 'txn_test_2', 'Flexible · 24 hours', 'refundable', 1440, '${settledAt}', '${settledAt}', 3000, 200, 2800, 'USD', 'available', '${paidAt}');
    `);
    state.availableMinor = 1_000_000;
    state.payoutCalls.length = 0;
  });

  const decide = (outcome: string) =>
    pg.exec(`
      UPDATE catalog_session_occurrences
        SET participation_outcome = '${outcome}', participation_decided_at = '2026-12-09T17:00:00Z', decided_headcount = 2,
            status = '${outcome === "cancel-under-minimum" ? "cancelled" : "scheduled"}'
        WHERE id = '${academy.occurrence}'`);

  it("is never delivered before the minimum was decided", async () => {
    const result = await processAutomaticOrganizationPayouts(
      new Date("2026-12-11T09:00:00.000Z"),
    );
    expect(result.payouts).toBe(0);
    const [obligation] = await rows<{
      delivery_rule: string;
      product_kind: string;
    }>(`select delivery_rule, product_kind from pay_obligations`);
    expect(obligation).toEqual({
      delivery_rule: "scheduled-end",
      product_kind: "service/group-lesson",
    });
    expect((await trancheRows())[0]!.status).toBe("scheduled");
  });

  it("releases after the decision and the end", async () => {
    await decide("minimum-met");
    const result = await processAutomaticOrganizationPayouts(
      new Date("2026-12-11T09:00:00.000Z"),
    );
    expect(result.payouts).toBe(1);
    expect(state.payoutCalls[0]!.amountMinor).toBe(2800);
    const [event] = await rows<{ kind: string; occurred_at: Date }>(
      `select kind, occurred_at from pay_delivery_events`,
    );
    expect(event!.kind).toBe("session-ended");
    expect(new Date(event!.occurred_at).toISOString()).toBe(occurrenceEndsAt);
  });

  it("a session cancelled under its minimum releases nothing", async () => {
    await decide("cancel-under-minimum");
    const result = await processAutomaticOrganizationPayouts(
      new Date("2026-12-11T09:00:00.000Z"),
    );
    expect(result.payouts).toBe(0);
    expect((await trancheRows())[0]!.status).toBe("cancelled");
    expect(state.payoutCalls).toHaveLength(0);
  });
});
