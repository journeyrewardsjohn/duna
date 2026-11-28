import { describe, expect, it } from "vitest";
import {
  persistableSnapshot,
  storedSnapshotHoldsCredential,
} from "./runtime-persist";

const snapshot = {
  cachedAt: "2026-11-28T12:00:00.000Z",
  organizationWallets: [],
  memberCard: {
    memberId: "7K2Q9D",
    holderName: "Noa Williams",
    credentialPayload: "duna:member:v1:secret",
    walletStatus: "available",
    walletPassPath: "/api/wallet/members/token",
    upcoming: [],
  },
};

describe("the persisted runtime snapshot", () => {
  it("never contains the member credential or its pass path", () => {
    const stored = JSON.stringify(persistableSnapshot(snapshot));
    expect(stored).not.toContain("duna:member:v1:");
    expect(stored).not.toContain("credentialPayload");
    expect(stored).not.toContain("/api/wallet/members/");
    expect(JSON.parse(stored)).toEqual({
      cachedAt: snapshot.cachedAt,
      organizationWallets: [],
    });
  });

  it("finds an old stored snapshot that still holds it (one-time cleanup)", () => {
    expect(storedSnapshotHoldsCredential(snapshot)).toBe(true);
    expect(storedSnapshotHoldsCredential(persistableSnapshot(snapshot))).toBe(
      false,
    );
    expect(storedSnapshotHoldsCredential(null)).toBe(false);
  });
});
