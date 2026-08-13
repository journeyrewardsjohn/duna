import { beforeEach, describe, expect, it, vi } from "vitest";

const serviceDoubles = vi.hoisted(() => ({
  evaluatePickupParticipant: vi.fn(),
  getDatabase: vi.fn(),
  getTransactionalDatabase: vi.fn(),
}));

vi.mock("@duna/db", async (importOriginal) => {
  const database = await importOriginal<typeof import("@duna/db")>();
  return {
    ...database,
    getDatabase: serviceDoubles.getDatabase,
    getTransactionalDatabase: serviceDoubles.getTransactionalDatabase,
  };
});

vi.mock("./commerce", async (importOriginal) => {
  const commerce = await importOriginal<typeof import("./commerce")>();
  return {
    ...commerce,
    evaluatePickupParticipant: serviceDoubles.evaluatePickupParticipant,
  };
});

import { invitePickupPlayers } from "./pickup-service";

describe("pickup management transactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceDoubles.evaluatePickupParticipant.mockResolvedValue(undefined);
  });

  it("invites players with the transaction-capable Neon client", async () => {
    const hostPersonId = "11111111-1111-4111-8111-111111111111";
    const invitedPersonId = "22222222-2222-4222-8222-222222222222";
    const pickupSessionId = "33333333-3333-4333-8333-333333333333";
    const organizationId = "44444444-4444-4444-8444-444444444444";
    const startsAt = new Date("2026-08-12T18:00:00.000Z");
    const endsAt = new Date("2026-08-12T19:30:00.000Z");
    const httpTransaction = vi.fn(() => {
      throw new Error("No transactions support in neon-http driver");
    });
    const httpDatabase = {
      query: {
        pickupParticipants: {
          findFirst: vi.fn().mockResolvedValue({ id: "host-participation" }),
        },
        pickupSessions: {
          findFirst: vi.fn().mockResolvedValue({
            id: pickupSessionId,
            organizationId,
            hostPersonId,
            startsAt,
            endsAt,
            title: "Sunset fours",
            venueLabel: "The Strand",
            status: "active",
          }),
        },
      },
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([]),
        })),
      })),
      transaction: httpTransaction,
    };
    const values = vi.fn().mockResolvedValue(undefined);
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn(() => ({ where }));
    const transaction = {
      insert: vi.fn(() => ({ values })),
      update: vi.fn(() => ({ set })),
    };
    const transactionalDatabase = {
      transaction: vi.fn(
        async (callback: (client: typeof transaction) => unknown) =>
          callback(transaction),
      ),
    };
    serviceDoubles.getDatabase.mockReturnValue(httpDatabase);
    serviceDoubles.getTransactionalDatabase.mockReturnValue(
      transactionalDatabase,
    );

    await expect(
      invitePickupPlayers({
        actor: {
          personId: hostPersonId,
          displayName: "Host Player",
          roles: ["player"],
          organizationId,
          scopes: [],
          ageBand: "adult",
          isDemo: false,
        },
        pickupSessionId,
        personIds: [invitedPersonId],
        requestId: "55555555-5555-4555-8555-555555555555",
        now: new Date("2026-08-11T18:00:00.000Z"),
      }),
    ).resolves.toEqual({
      invitedPersonIds: [invitedPersonId],
      alreadyActivePersonIds: [],
    });

    expect(serviceDoubles.getTransactionalDatabase).toHaveBeenCalledOnce();
    expect(transactionalDatabase.transaction).toHaveBeenCalledOnce();
    expect(transaction.insert).toHaveBeenCalledTimes(3);
    expect(transaction.update).toHaveBeenCalledOnce();
    expect(httpTransaction).not.toHaveBeenCalled();
  });
});
