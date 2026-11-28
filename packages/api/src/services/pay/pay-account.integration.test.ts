/**
 * Duna Pay account state, onboarding without keys, the publish gate and the
 * up-front fee quote, against an in-memory Postgres with every migration.
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

const state = vi.hoisted(() => ({ db: null as unknown, configured: false }));
vi.mock("@duna/db", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getDatabase: () => state.db,
  getTransactionalDatabase: () => state.db,
}));
vi.mock("../../payments", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isStripeConfigured: () => state.configured,
  retrieveConnectAccountFacts: vi.fn(async () => ({
    chargesEnabled: true,
    payoutsEnabled: true,
    detailsSubmitted: true,
    cardPaymentsActive: true,
    currentlyDue: [],
    pastDue: [],
    pendingVerification: [],
    bank: { status: "verified", last4: "6789", name: "Test Bank" },
  })),
}));

import {
  academy,
  applyAllMigrations,
  createCatalogTestDatabase,
  seedAcademy,
  testActor,
} from "../../catalog-booking.test-support";
import { feesQuoteSchema } from "../../contracts/fees";
import { payAccountSchema, payPublishGateSchema } from "../../contracts/pay";
import { quoteCatalogPurchase } from "../fees/quote";
import {
  assertPaymentsReady,
  loadPayAccount,
  payPublishGate,
  startPayOnboarding,
  syncPayAccount,
  updatePayBusiness,
} from "./account";

const { pg, db } = createCatalogTestDatabase();
state.db = db;
const now = new Date("2026-12-01T12:00:00.000Z");

beforeAll(() => applyAllMigrations(pg), 120_000);
afterAll(() => pg.close());
beforeEach(async () => {
  await seedAcademy(pg);
  state.configured = false;
});

describe("Duna Pay account", () => {
  it("is honest without processor keys: not started, onboarding not configured", async () => {
    const account = payAccountSchema.parse(await loadPayAccount(academy.org));
    expect(account.status).toBe("not-started");
    await expect(
      startPayOnboarding({
        actor: testActor(academy.owner, academy.org),
        organizationId: academy.org,
        method: "embedded",
        returnPath: "/money/duna-pay",
        requestId: "req-1",
        now,
      }),
    ).resolves.toEqual({ state: "not-configured" });
    await syncPayAccount({ organizationId: academy.org, now }); // no-op without keys
    const gate = payPublishGateSchema.parse(
      await payPublishGate(academy.org, {}),
    );
    expect(gate.ready).toBe(false);
    await expect(assertPaymentsReady(academy.org)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });

  it("derives the status from the processor and opens the publish gate when ready", async () => {
    await pg.exec(
      `UPDATE organizations SET stripe_account_id = 'acct_account_1' WHERE id = '${academy.org}'`,
    );
    state.configured = true;
    await syncPayAccount({ organizationId: academy.org, now });
    await updatePayBusiness({
      organizationId: academy.org,
      businessType: "company",
      whatYouSell: "Beach volleyball coaching",
      now,
    });
    const account = payAccountSchema.parse(await loadPayAccount(academy.org));
    expect(account).toMatchObject({
      status: "ready",
      bank: { status: "verified", last4: "6789" },
      business: {
        businessType: "company",
        whatYouSell: "Beach volleyball coaching",
      },
    });
    expect((await payPublishGate(academy.org, {})).ready).toBe(true);
    await expect(assertPaymentsReady(academy.org)).resolves.toBeUndefined();
  });
});

describe("fee quote before commitment (defect 4)", () => {
  it("prices the all-in total from the catalog and records the quote", async () => {
    await pg.exec(`
      UPDATE catalog_items SET allow_card = true WHERE id = '${academy.item}';
      INSERT INTO catalog_prices (organization_id, catalog_item_id, catalog_variant_id, payment_kind, amount_minor, currency)
        VALUES ('${academy.org}', '${academy.item}', '${academy.variant}', 'card', 4000, 'USD');
    `);
    const quote = feesQuoteSchema.parse(
      await quoteCatalogPurchase({
        personId: academy.players[0]!,
        request: {
          organizationId: academy.org,
          catalogItemId: academy.item,
          quantity: 1,
          surface: "player-app",
        },
        now,
      }),
    );
    expect(quote.subtotal.amountMinor).toBe(4000);
    expect(quote.total.amountMinor).toBe(
      quote.subtotal.amountMinor + quote.serviceFee.amountMinor,
    );
    expect(quote.lines[0]).toMatchObject({
      kind: "item",
      label: "Group training",
    });
    const [row] = (
      await pg.query<{
        total_minor: number;
        fee_rule_version: string;
        surface: string;
      }>(`select total_minor, fee_rule_version, surface from pay_fee_quotes`)
    ).rows;
    expect(row).toEqual({
      total_minor: quote.total.amountMinor,
      fee_rule_version: "checkout-fees-v1",
      surface: "player-app",
    });
    await expect(
      quoteCatalogPurchase({
        personId: academy.players[0]!,
        request: {
          organizationId: academy.org,
          catalogItemId: "40000000-0000-4000-8000-0000000000ff",
          quantity: 1,
          surface: "player-app",
        },
        now,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
