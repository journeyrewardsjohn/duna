import type { TeamPayRun } from "@duna/api";
import {
  teamPayDemoRuns,
  teamPayDemoStaffCompensation,
} from "@duna/core/demo/team-pay";
import { teamAvailabilityDemoIds } from "@duna/core/demo/team-availability";
import { describe, expect, it } from "vitest";
import {
  DUNA_PAY_PAYOUTS,
  PAYROLL_STATEMENT,
  goalView,
  myPayLines,
  payHeadline,
  soFarLabel,
} from "./earnings-model";

describe("how I'm paid", () => {
  it("is HQ's sentence, with classification as the club set it", () => {
    expect(payHeadline(teamPayDemoStaffCompensation.current)).toEqual({
      sentence:
        "$40.00 an hour for scheduled time, plus 20% of net proceeds from private lessons",
      classification: "Contractor (1099)",
      since: "Since 1 September",
    });
    expect(payHeadline(undefined)).toEqual({ classification: "Not set" });
  });

  it("says plainly that Duna pays no one", () => {
    expect(PAYROLL_STATEMENT).toContain("doesn't pay anyone");
    expect(DUNA_PAY_PAYOUTS).toBe("Duna Pay payouts: not configured yet");
  });
});

describe("the income goal", () => {
  it("shows the backend's progress honestly, including past 100%", () => {
    const view = goalView(teamPayDemoStaffCompensation.goal);
    expect(view).toMatchObject({
      earned: "$720.00",
      target: "$1,200.00",
      line: "$720.00 of $1,200.00 a week",
      progress: "60% of your goal",
      barPercent: 60,
    });
    const over = goalView({
      ...teamPayDemoStaffCompensation.goal,
      earned: { amountMinor: 134_400, currency: "USD" },
      progressPercent: 112,
    });
    expect(over.progress).toBe("Goal reached: 112%");
    expect(over.barPercent).toBe(100);
    expect(soFarLabel("week")).toBe("This week so far");
  });
});

describe("past pay: my own line only", () => {
  const runs = teamPayDemoRuns as unknown as readonly TeamPayRun[];
  const theo = teamAvailabilityDemoIds.theo;

  it("takes only my line, skips cancelled runs, newest period first", () => {
    const lines = myPayLines(runs, theo);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      const run = runs.find((candidate) => candidate.id === line.runId)!;
      expect(run.status).not.toBe("cancelled");
      const mine = run.lines.find(
        (candidate) => candidate.staff.staffProfileId === theo,
      )!;
      expect(line.total).toMatch(/^\$/);
      expect(line.sessions).toBe(
        `${mine.sessionsCount} ${mine.sessionsCount === 1 ? "session" : "sessions"}`,
      );
    }
    const ends = lines.map((line) => line.periodEndsOn);
    expect([...ends].sort().reverse()).toEqual(ends);
  });

  it("shows nothing of anyone else", () => {
    expect(myPayLines(runs, "someone-without-lines")).toEqual([]);
  });
});
