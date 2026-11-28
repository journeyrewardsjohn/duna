import { describe, expect, it } from "vitest";
import { initialsOf, type PlayerSummary } from "../avatar/avatar";
import {
  addPlayer,
  filterPlayers,
  isPlayerSelected,
  openSpots,
  playerSlots,
  removePlayer,
} from "./add-players-logic";

const player = (id: string, name = id, detail?: string): PlayerSummary => ({
  id,
  name,
  detail,
});

describe("AddPlayers selection rules", () => {
  const a = player("a", "Sam Rivera", "Demo Beach Club");
  const b = player("b", "Noor Haddad");
  const c = player("c", "José Núñez", "Sunday open play");

  it("adds at the end until the slots are full", () => {
    const one = addPlayer([], a, 2);
    expect(one).toEqual({ selected: [a], changed: true });
    const two = addPlayer(one.selected, b, 2);
    expect(two.selected).toEqual([a, b]);
    expect(addPlayer(two.selected, c, 2)).toEqual({
      selected: [a, b],
      changed: false,
      reason: "full",
    });
  });

  it("refuses a duplicate before it checks capacity", () => {
    expect(addPlayer([a, b], a, 2)).toMatchObject({
      changed: false,
      reason: "duplicate",
    });
  });

  it("never mutates the list it was given", () => {
    const selected = Object.freeze([a]) as ReadonlyArray<PlayerSummary>;
    expect(addPlayer(selected, b, 4).selected).not.toBe(selected);
    expect(removePlayer(selected, "a").selected).not.toBe(selected);
    expect(selected).toEqual([a]);
  });

  it("removes a player, but not a locked or missing one", () => {
    expect(removePlayer([a, b], "a")).toEqual({ selected: [b], changed: true });
    expect(removePlayer([a, b], "a", ["a"])).toMatchObject({
      changed: false,
      reason: "locked",
    });
    expect(removePlayer([a], "zzz")).toMatchObject({
      changed: false,
      reason: "missing",
    });
  });

  it("counts open spots and lays out the slots", () => {
    expect(openSpots([a], 4)).toBe(3);
    expect(openSpots([a, b, c], 2)).toBe(0);
    expect(playerSlots([a], 3)).toEqual([a, null, null]);
    // Over capacity keeps everyone visible rather than hiding a player.
    expect(playerSlots([a, b, c], 2)).toEqual([a, b, c]);
    expect(isPlayerSelected([a], "a")).toBe(true);
    expect(isPlayerSelected([a], "b")).toBe(false);
  });

  it("filters by every word, ignoring case and accents", () => {
    expect(filterPlayers([a, b, c], "")).toEqual([a, b, c]);
    expect(filterPlayers([a, b, c], "  SAM ")).toEqual([a]);
    expect(filterPlayers([a, b, c], "jose nunez")).toEqual([c]);
    expect(filterPlayers([a, b, c], "beach sam")).toEqual([a]);
    expect(filterPlayers([a, b, c], "sam noor")).toEqual([]);
  });

  it("makes initials from the first and last word", () => {
    expect(initialsOf("Sam Rivera")).toBe("SR");
    expect(initialsOf("  noor ")).toBe("N");
    expect(initialsOf("Ana Maria Duarte")).toBe("AD");
    expect(initialsOf("")).toBe("");
  });
});
