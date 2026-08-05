import { describe, expect, it } from "vitest";
import {
  ACCOUNT_DELETION_GRACE_PERIOD_MS,
  accountDeletionScheduledFor,
  deletedPersonHandle,
} from "./account-deletion";

describe("account deletion safety window", () => {
  it("schedules irreversible deletion seven days after the request", () => {
    const requestedAt = new Date("2026-08-04T16:00:00.000Z");
    expect(accountDeletionScheduledFor(requestedAt).toISOString()).toBe(
      "2026-08-11T16:00:00.000Z",
    );
    expect(ACCOUNT_DELETION_GRACE_PERIOD_MS).toBe(604_800_000);
  });

  it("creates a stable non-identifying replacement handle", () => {
    const handle = deletedPersonHandle("4b1a1be4-0775-4b09-89f6-a599f9a2472f");
    expect(handle).toBe("deleted-4b1a1be407754b0989f6a599f9a2472f");
    expect(handle.length).toBeLessThanOrEqual(48);
  });
});
