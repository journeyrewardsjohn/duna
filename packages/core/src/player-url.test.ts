import { describe, expect, it } from "vitest";
import {
  playerIdFromPublicIdentifier,
  publicPlayerGeneratedIdentifier,
  publicPlayerPath,
} from "./player-url";

const player = {
  id: "14599000-d811-4250-8c31-0250d8179f4a",
  displayName: "Ana Patrícia Silva Ramos",
  handle: "fivb-12ndr-145990-d811025",
  homeMarket: "Fortaleza, Ceará",
  countryCode: "BR",
} as const;

describe("public player URLs", () => {
  it("uses first name, last name, country, city, and the full UUID for unclaimed profiles", () => {
    expect(
      publicPlayerPath({ ...player, profileClaimStatus: "unclaimed" }),
    ).toBe(
      "/players/ana-ramos-br-fortaleza-14599000-d811-4250-8c31-0250d8179f4a",
    );
  });

  it("uses the Duna handle after the player claims the profile", () => {
    expect(
      publicPlayerPath({
        ...player,
        handle: "anapatricia",
        profileClaimStatus: "claimed",
      }),
    ).toBe("/players/anapatricia");
  });

  it("recovers the stable profile identity from a generated URL", () => {
    const identifier = publicPlayerGeneratedIdentifier(player);
    expect(playerIdFromPublicIdentifier(identifier)).toBe(player.id);
    expect(playerIdFromPublicIdentifier(player.handle)).toBeUndefined();
  });

  it("omits placeholder city text when no home market is known", () => {
    expect(
      publicPlayerGeneratedIdentifier({ ...player, homeMarket: undefined }),
    ).toBe("ana-ramos-br-14599000-d811-4250-8c31-0250d8179f4a");
  });
});
