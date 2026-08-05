import { describe, expect, it } from "vitest";
import {
  detectSessionNotePeople,
  summarizeSessionTranscript,
} from "./people-service";

describe("session note drafting", () => {
  it("turns a transcript into a concise reviewable draft", () => {
    expect(
      summarizeSessionTranscript(
        "  Maya stayed balanced in serve receive.   Her platform was calm. " +
          "Next time, begin one step deeper. Keep the same early call. " +
          "This fifth sentence should not be included.",
      ),
    ).toBe(
      "Maya stayed balanced in serve receive. Her platform was calm. Next time, begin one step deeper. Keep the same early call.",
    );
  });

  it("limits long drafts without losing the review boundary", () => {
    const summary = summarizeSessionTranscript(`${"a".repeat(700)}.`);
    expect(summary).toHaveLength(648);
    expect(summary.endsWith("…")).toBe(true);
  });
});

describe("session note player detection", () => {
  const roster = [
    { personId: "maya", displayName: "Maya Chen" },
    { personId: "jordan-one", displayName: "Jordan Lee" },
    { personId: "jordan-two", displayName: "Jordan Smith" },
  ] as const;

  it("detects a unique first name or an exact full name", () => {
    expect(
      detectSessionNotePeople(
        "Maya looked composed. Jordan Smith should start deeper.",
        roster,
      ),
    ).toEqual(["maya", "jordan-two"]);
  });

  it("does not guess when a first name is ambiguous", () => {
    expect(detectSessionNotePeople("Jordan was early today.", roster)).toEqual(
      [],
    );
  });

  it("does not match a name embedded inside another word", () => {
    expect(
      detectSessionNotePeople("Mayans used this pattern.", roster),
    ).toEqual([]);
  });
});
