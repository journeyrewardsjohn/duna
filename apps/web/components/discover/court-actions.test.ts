import { beforeEach, describe, expect, it, vi } from "vitest";

const startCourtCheckout = vi.fn();

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "duna.test" }),
}));
vi.mock("@/lib/api", () => ({
  getServerCaller: async () => ({ player: { startCourtCheckout } }),
}));

import { startCourtCheckoutAction } from "./court-actions";

describe("startCourtCheckoutAction", () => {
  beforeEach(() => startCourtCheckout.mockReset());

  it("tells the server the booker sends the invitations themselves", async () => {
    startCourtCheckout.mockResolvedValue({ mode: "free" });
    const answer = await startCourtCheckoutAction({
      venueId: "venue-1",
      courtId: "court-1",
      localStartsAt: "2026-11-28T11:30",
      durationMinutes: 60,
      paymentMode: "split",
      participants: [{ name: "Guest", phoneE164: "+17045550123" }],
      expectedPayNowMinor: 0,
      expectedTotalMinor: 0,
      policyAccepted: true,
      policyFullScrollConfirmed: true,
      checkoutIntent: "private",
      idempotencyKey: "00000000-0000-4000-8000-000000000000",
    });
    expect(answer.ok).toBe(true);
    expect(startCourtCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ inviteDelivery: "self" }),
    );
  });
});
