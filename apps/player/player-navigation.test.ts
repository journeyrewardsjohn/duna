import { describe, expect, it } from "vitest";
import { playerPrimaryDestination } from "./player-navigation";

describe("playerPrimaryDestination", () => {
  it("keeps primary destinations selected across their child routes", () => {
    expect(playerPrimaryDestination("home")).toBe("home");
    expect(playerPrimaryDestination("plans")).toBe("calendar");
    expect(playerPrimaryDestination("training")).toBe("calendar");
    expect(playerPrimaryDestination("messages")).toBe("messages");
  });

  it("does not mislabel secondary workflows as a primary destination", () => {
    expect(playerPrimaryDestination("video")).toBeUndefined();
    expect(playerPrimaryDestination("score")).toBeUndefined();
    expect(playerPrimaryDestination("discover")).toBeUndefined();
  });
});
