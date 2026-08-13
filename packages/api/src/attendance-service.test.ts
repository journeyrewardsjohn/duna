import { describe, expect, it } from "vitest";
import { attendanceReliabilityForCounts } from "./attendance-service";

describe("attendanceReliabilityForCounts", () => {
  it("does not publish a numeric score before three tracked outcomes", () => {
    expect(attendanceReliabilityForCounts(0, 0)).toEqual({
      score: undefined,
      label: "new",
      tracked: 0,
      attended: 0,
      noShows: 0,
    });
    expect(attendanceReliabilityForCounts(1, 1)).toMatchObject({
      score: undefined,
      label: "building",
      tracked: 2,
    });
  });

  it("uses a conservative prior once enough outcomes are available", () => {
    expect(attendanceReliabilityForCounts(1, 2)).toMatchObject({
      score: 63,
      label: "needs-context",
    });
    expect(attendanceReliabilityForCounts(3, 0)).toMatchObject({
      score: 88,
      label: "reliable",
    });
    expect(attendanceReliabilityForCounts(5, 0)).toMatchObject({
      score: 90,
      label: "highly-reliable",
    });
  });
});
