import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const databaseDoubles = vi.hoisted(() => ({
  getDatabase: vi.fn(),
  getTransactionalDatabase: vi.fn(),
}));

vi.mock("@duna/db", async (importOriginal) => {
  const database = await importOriginal<typeof import("@duna/db")>();
  return {
    ...database,
    getDatabase: databaseDoubles.getDatabase,
    getTransactionalDatabase: databaseDoubles.getTransactionalDatabase,
  };
});

import { createVenueLayout } from "./venue-layout-service";

describe("venue layout transactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://test:test@localhost:5432/duna_test",
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("creates the first layout with the transaction-capable Neon client", async () => {
    const organizationId = "11111111-1111-4111-8111-111111111111";
    const venueId = "22222222-2222-4222-8222-222222222222";
    const httpTransaction = vi.fn(() => {
      throw new Error("No transactions support in neon-http driver");
    });
    const httpDatabase = {
      query: {
        venues: {
          findFirst: vi.fn().mockResolvedValue({
            id: venueId,
            organizationId,
            latitude: 33.8847,
            longitude: -118.4109,
          }),
        },
      },
      transaction: httpTransaction,
    };
    const values = vi.fn().mockResolvedValue(undefined);
    const transaction = {
      insert: vi.fn(() => ({ values })),
    };
    const transactionalDatabase = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([{ version: null }]),
        })),
      })),
      transaction: vi.fn(
        async (callback: (client: typeof transaction) => unknown) =>
          callback(transaction),
      ),
    };
    databaseDoubles.getDatabase.mockReturnValue(httpDatabase);
    databaseDoubles.getTransactionalDatabase.mockReturnValue(
      transactionalDatabase,
    );

    await expect(
      createVenueLayout({
        actor: {
          personId: "33333333-3333-4333-8333-333333333333",
          displayName: "Venue Owner",
          roles: ["owner"],
          organizationId,
          scopes: ["*"],
          ageBand: "adult",
          isDemo: false,
        },
        requestId: "44444444-4444-4444-8444-444444444444",
        now: new Date("2026-08-10T18:00:00.000Z"),
        venueId,
        name: "Primary venue layout",
        sourceType: "satellite",
      }),
    ).resolves.toMatchObject({ entity: "venue-layout", status: "draft" });

    expect(databaseDoubles.getTransactionalDatabase).toHaveBeenCalledOnce();
    expect(transactionalDatabase.transaction).toHaveBeenCalledOnce();
    expect(transaction.insert).toHaveBeenCalledTimes(2);
    expect(httpTransaction).not.toHaveBeenCalled();
  });
});
