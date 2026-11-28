import { describe, expect, it } from "vitest";
import {
  DUNA_THREAD_TITLE,
  threadContextParts,
  type ThreadContext,
} from "./concierge";

describe("threadContextParts", () => {
  it("a lesson has kind, time, coach, club and place in that order", () => {
    const parts = threadContextParts({
      kind: "lesson",
      id: "l1",
      title: "Serve clinic",
      startsAt: 1000,
      coachName: "Sam",
      clubName: "Santa Monica BC",
      place: "Court 3",
    });
    expect(parts.title).toBe("Serve clinic");
    expect(parts.isDuna).toBe(false);
    expect(parts.subtitleParts).toEqual([
      { type: "kind", labelKey: "concierge.context.lesson" },
      { type: "time", at: 1000 },
      { type: "coach", text: "Sam" },
      { type: "club", text: "Santa Monica BC" },
      { type: "place", text: "Court 3" },
    ]);
  });

  it("every kind gets its label key", () => {
    const kinds = ["match", "tournament", "league", "program", "club"] as const;
    for (const kind of kinds) {
      const context: ThreadContext = { kind, id: "x", title: "T" };
      expect(threadContextParts(context).subtitleParts).toEqual([
        { type: "kind", labelKey: `concierge.context.${kind}` },
      ]);
    }
  });

  it("a club thread does not repeat the club name", () => {
    const parts = threadContextParts({
      kind: "club",
      id: "c",
      title: "Dunes",
      clubName: "Dunes",
    });
    expect(parts.subtitleParts.some((p) => p.type === "club")).toBe(false);
  });

  it("only lessons show a coach", () => {
    const parts = threadContextParts({
      kind: "match",
      id: "m",
      title: "Final",
      startsAt: 5,
    });
    expect(parts.subtitleParts.map((p) => p.type)).toEqual(["kind", "time"]);
    const lesson = threadContextParts({ kind: "lesson", id: "l", title: "L" });
    expect(lesson.subtitleParts.map((p) => p.type)).toEqual(["kind"]);
  });

  it("a Duna thread is Duna, with no subtitle", () => {
    expect(threadContextParts({ kind: "duna" })).toEqual({
      kind: "duna",
      title: DUNA_THREAD_TITLE,
      subtitleParts: [],
      isDuna: true,
    });
    expect(threadContextParts({ kind: "duna", title: "Welcome" }).title).toBe(
      "Welcome",
    );
  });
});
