import { beforeEach, describe, expect, it, vi } from "vitest";

const policyDoubles = vi.hoisted(() => ({
  getDatabase: vi.fn(),
}));

vi.mock("@duna/db", async (importOriginal) => {
  const database = await importOriginal<typeof import("@duna/db")>();
  return { ...database, getDatabase: policyDoubles.getDatabase };
});

import {
  organizationHasActiveMembershipOffer,
  requireActiveMembershipOffer,
  requireMembershipOfferCanDeactivate,
} from "./organization-membership-policy";

function selectChain(result: readonly { readonly id: string }[]) {
  return {
    from: vi.fn(() => ({
      innerJoin: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue(result),
        })),
      })),
    })),
  };
}

describe("organization membership policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("recognizes a published membership and permits member-only offers", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: "membership-1" });
    policyDoubles.getDatabase.mockReturnValue({
      query: { catalogItems: { findFirst } },
    });

    await expect(
      organizationHasActiveMembershipOffer("organization-1"),
    ).resolves.toBe(true);
    await expect(
      requireActiveMembershipOffer("organization-1"),
    ).resolves.toBeUndefined();
  });

  it("rejects member-only configuration before a membership is published", async () => {
    policyDoubles.getDatabase.mockReturnValue({
      query: {
        catalogItems: { findFirst: vi.fn().mockResolvedValue(undefined) },
      },
    });

    await expect(
      requireActiveMembershipOffer("organization-1"),
    ).rejects.toThrow(
      "Publish a membership plan before making products or courts members only.",
    );
  });

  it("protects the final membership while a member-only product is active", async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ id: "member-product-1" });
    const select = vi
      .fn()
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([]));
    policyDoubles.getDatabase.mockReturnValue({
      query: { catalogItems: { findFirst } },
      select,
    });

    await expect(
      requireMembershipOfferCanDeactivate("organization-1", "membership-1"),
    ).rejects.toThrow(
      "Make every members-only product, court, and schedule public before unpublishing the last membership plan.",
    );
  });

  it("allows one membership to deactivate when another remains active", async () => {
    const select = vi.fn();
    policyDoubles.getDatabase.mockReturnValue({
      query: {
        catalogItems: {
          findFirst: vi.fn().mockResolvedValue({ id: "membership-2" }),
        },
      },
      select,
    });

    await expect(
      requireMembershipOfferCanDeactivate("organization-1", "membership-1"),
    ).resolves.toBeUndefined();
    expect(select).not.toHaveBeenCalled();
  });
});
