import { describe, expect, it } from "vitest";
import {
  changedCharacters,
  diffKeys,
  FIRST_OPEN,
  firstOpenPhase,
  firstOpenTurnAt,
  type ListEntry,
  mergeExiting,
  parseCssTime,
  rallyIndex,
  RALLY_MAX_STAGGERED,
} from "./motion-core";

const key = (item: string) => item;
const entries = (keys: string[], exiting: string[] = []) =>
  keys.map((k): ListEntry<string> => ({
    key: k,
    item: k,
    exiting: exiting.includes(k),
  }));
const shape = (list: ListEntry<string>[]) =>
  list.map((entry) => (entry.exiting ? `-${entry.key}` : entry.key));

describe("mergeExiting", () => {
  it("keeps a removed item where it was, marked exiting", () => {
    expect(
      shape(mergeExiting(entries(["a", "b", "c"]), ["a", "c"], key)),
    ).toEqual(["a", "-b", "c"]);
  });

  it("keeps a removed first item first", () => {
    expect(shape(mergeExiting(entries(["a", "b"]), ["b"], key))).toEqual([
      "-a",
      "b",
    ]);
  });

  it("keeps several departures in their order and adds inserts in place", () => {
    expect(
      shape(mergeExiting(entries(["a", "b", "c", "d"]), ["a", "x", "d"], key)),
    ).toEqual(["a", "-b", "-c", "x", "d"]);
  });

  it("an item that comes back stops exiting", () => {
    const previous = entries(["a", "b", "c"], ["b"]);
    expect(shape(mergeExiting(previous, ["a", "b", "c"], key))).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("emptying the list keeps every item, exiting", () => {
    expect(shape(mergeExiting(entries(["a", "b"]), [], key))).toEqual([
      "-a",
      "-b",
    ]);
  });
});

describe("diffKeys", () => {
  it("reports inserts, removals and moves", () => {
    expect(diffKeys(["a", "b", "c"], ["c", "a", "d"])).toEqual({
      inserted: ["d"],
      removed: ["b"],
      moved: ["c", "a"],
    });
    expect(diffKeys(["a", "b"], ["a", "b", "c"]).moved).toEqual([]);
  });
});

describe("changedCharacters", () => {
  it("compares from the right so units stay aligned", () => {
    expect(changedCharacters("12", "13")).toEqual([1]);
    expect(changedCharacters("9", "10")).toEqual([0, 1]);
    expect(changedCharacters("6–4", "6–5")).toEqual([2]);
    expect(changedCharacters("3.42", "3.50")).toEqual([2, 3]);
    expect(changedCharacters("15", "15")).toEqual([]);
  });
});

describe("rallyIndex", () => {
  it("caps the stagger so a long list does not wait", () => {
    expect(rallyIndex(0)).toBe(0);
    expect(rallyIndex(3)).toBe(3);
    expect(rallyIndex(50)).toBe(RALLY_MAX_STAGGERED - 1);
  });
});

describe("first open", () => {
  it("follows the brand timeline without a readiness signal", () => {
    const turnAt = firstOpenTurnAt(undefined);
    expect(turnAt).toBe(3500);
    expect(firstOpenPhase(0, turnAt)).toBe("ground");
    expect(firstOpenPhase(300, turnAt)).toBe("line");
    expect(firstOpenPhase(700, turnAt)).toBe("crests");
    expect(firstOpenPhase(1400, turnAt)).toBe("wordmark");
    expect(firstOpenPhase(3500, turnAt)).toBe("turn");
    expect(firstOpenPhase(3500 + FIRST_OPEN.turnMs, turnAt)).toBe("done");
  });

  it("turns early, once the crests have landed, when Home is ready", () => {
    expect(firstOpenTurnAt(200)).toBe(1500);
    expect(firstOpenTurnAt(2200)).toBe(2200);
  });

  it("holds on the finished mark while Home is late", () => {
    expect(firstOpenTurnAt(null)).toBeNull();
    expect(firstOpenPhase(60_000, null)).toBe("wordmark");
  });
});

describe("parseCssTime", () => {
  it("reads ms and s", () => {
    expect(parseCssTime("320ms")).toBe(320);
    expect(parseCssTime(" 0.2s")).toBe(200);
    expect(parseCssTime("")).toBeNaN();
  });
});
