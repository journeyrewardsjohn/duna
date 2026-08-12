import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({
  getAllKeys: vi.fn(),
  getItem: vi.fn(),
  setItem: vi.fn(),
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: storage,
}));

import {
  hasLiveActivityOptIn,
  LIVE_ACTIVITY_OPT_IN_KEY,
  liveActivityHomeMode,
  rememberLiveActivityOptIn,
} from "./live-activity-preference";

describe("live activity preference", () => {
  beforeEach(() => {
    storage.getAllKeys.mockReset();
    storage.getItem.mockReset();
    storage.setItem.mockReset();
    storage.getAllKeys.mockResolvedValue([]);
    storage.getItem.mockResolvedValue(null);
    storage.setItem.mockResolvedValue(undefined);
  });

  it("recognizes the explicit opt-in marker", async () => {
    storage.getItem.mockResolvedValue("2026-08-07T12:00:00.000Z");
    await expect(hasLiveActivityOptIn()).resolves.toBe(true);
    expect(storage.getAllKeys).not.toHaveBeenCalled();
  });

  it("recognizes an existing live activity token from older builds", async () => {
    storage.getAllKeys.mockResolvedValue([
      "duna-theme",
      "duna.live-activity.match.match-123",
    ]);
    await expect(hasLiveActivityOptIn()).resolves.toBe(true);
  });

  it("keeps first-time education visible when no activity has started", async () => {
    storage.getAllKeys.mockResolvedValue(["duna-theme"]);
    await expect(hasLiveActivityOptIn()).resolves.toBe(false);
  });

  it("persists a reusable opt-in marker", async () => {
    await rememberLiveActivityOptIn();
    expect(storage.setItem).toHaveBeenCalledWith(
      LIVE_ACTIVITY_OPT_IN_KEY,
      expect.any(String),
    );
  });

  it("keeps first-time education and post-opt-in controls mutually exclusive", () => {
    expect(
      liveActivityHomeMode({ checking: false, isIOS: true, optedIn: false }),
    ).toBe("prompt");
    expect(
      liveActivityHomeMode({ checking: false, isIOS: true, optedIn: true }),
    ).toBe("compact");
    expect(
      liveActivityHomeMode({ checking: true, isIOS: true, optedIn: true }),
    ).toBe("hidden");
    expect(
      liveActivityHomeMode({ checking: false, isIOS: false, optedIn: true }),
    ).toBe("hidden");
  });
});
