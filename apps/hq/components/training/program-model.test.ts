import type { TrainingProgramsSession } from "@duna/api";
import {
  trainingProgramsDemoProgram,
  trainingProgramsDemoProposal,
} from "@duna/core/demo/training-programs";
import { describe, expect, it } from "vitest";
import {
  activationWords,
  draftProblems,
  patternChangePreview,
  patternPractices,
  patternSentence,
  previewSentence,
  type ProgramDraft,
  proposalPills,
  sessionPlanWords,
  timeRangeWords,
} from "./program-model";

const draft = trainingProgramsDemoProposal.draft as unknown as ProgramDraft;

describe("the sentence → summary mapping", () => {
  it("restates what Duna read as pills: dates, each day group's times, dates off", () => {
    expect(proposalPills(draft)).toEqual([
      { label: "Dates", value: "Nov 23 – Feb 14, 2027 · 12 weeks" },
      { label: "Mon · Wed", value: "4:00–6:00 PM" },
      { label: "Sat", value: "9:00–11:00 AM" },
      { label: "Off", value: "Dec 21 – Jan 3, 2027" },
    ]);
  });

  it("keeps each weekday's own times in the pattern sentence", () => {
    expect(patternSentence(draft.weeklySlots)).toBe(
      "Mon and Wed 4:00–6:00 PM, Sat 9:00–11:00 AM",
    );
    expect(
      patternSentence([
        { weekday: 2, startsAt: "17:00", endsAt: "19:00", intervalWeeks: 1 },
        { weekday: 4, startsAt: "17:30", endsAt: "19:00", intervalWeeks: 2 },
      ]),
    ).toBe("Tue 5:00–7:00 PM, Thu 5:30–7:00 PM every 2 weeks");
    expect(timeRangeWords("09:00", "13:00")).toBe("9:00 AM–1:00 PM");
  });

  it("blocks a draft that can't be saved and warns about one that can", () => {
    expect(draftProblems(draft).errors).toEqual([]);
    const broken = {
      ...draft,
      title: " ",
      weeklySlots: [
        { ...draft.weeklySlots[0]!, startsAt: "18:00", endsAt: "16:00" },
      ],
      coaches: [],
    };
    const problems = draftProblems(broken);
    expect(problems.errors).toEqual([
      "Give the program a name.",
      "Monday: the practice ends before it starts.",
    ]);
    expect(problems.warnings).toContain(
      "No coach yet: practices are not ready until one is set.",
    );
  });

  it("skips dates off and counts practices the way the schedule does", () => {
    const practices = patternPractices({
      startDate: "2026-12-14",
      endDate: "2026-12-27",
      timezone: "America/Los_Angeles",
      slots: draft.weeklySlots,
      exceptions: [{ startsOn: "2026-12-21", endsOn: "2027-01-03" }],
    });
    expect(practices.map((row) => row.key)).toEqual([
      "2026-12-14|16:00",
      "2026-12-16|16:00",
      "2026-12-19|09:00",
    ]);
  });
});

function session(
  id: string,
  startsAt: string,
  extra: Partial<TrainingProgramsSession> = {},
): TrainingProgramsSession {
  const end = new Date(Date.parse(startsAt) + 2 * 3_600_000).toISOString();
  return {
    id,
    programId: "p",
    kind: "practice",
    title: "Practice",
    startsAt,
    endsAt: end,
    timezone: "America/Los_Angeles",
    status: "planned",
    source: "program",
    coaches: [],
    plan: { mode: "none" },
    needsCover: false,
    athleteCount: 12,
    ...extra,
  };
}

describe("the pattern-change preview", () => {
  const program = {
    startDate: "2026-12-07",
    endDate: "2026-12-13",
    timezone: "America/Los_Angeles",
  };
  // Mon 7th and Wed 9th at 4 PM Pacific (midnight UTC next day), Sat 12th at 9 AM.
  const sessions = [
    session("mon", "2026-12-08T00:00:00.000Z"),
    session("wed", "2026-12-10T00:00:00.000Z", {
      plan: {
        mode: "focus",
        focus: "Defence",
        plannedLoad: 50,
        loadEstimateSource: "assumed",
      },
    }),
    session("sat", "2026-12-12T17:00:00.000Z"),
  ];

  it("adds, removes and leaves for review exactly the practices that change", () => {
    const preview = patternChangePreview({
      program,
      sessions,
      next: {
        startDate: program.startDate,
        endDate: program.endDate,
        // Wednesday moves to Thursday; Monday and Saturday stay.
        slots: [
          { weekday: 1, startsAt: "16:00", endsAt: "18:00", intervalWeeks: 1 },
          { weekday: 4, startsAt: "16:00", endsAt: "18:00", intervalWeeks: 1 },
          { weekday: 6, startsAt: "09:00", endsAt: "11:00", intervalWeeks: 1 },
        ],
        exceptions: [],
      },
      now: "2026-12-01T00:00:00.000Z",
    });
    expect(preview.added.map((row) => row.key)).toEqual(["2026-12-10|16:00"]);
    expect(preview.removed).toEqual([]);
    expect(preview.needsReview.map((row) => row.id)).toEqual(["wed"]);
    expect(preview.unchanged).toBe(2);
    expect(previewSentence(preview)).toBe(
      "This adds 1 practice, leaves 1 practice someone relied on for you to review; 2 practices stay as they are.",
    );
  });

  it("removes only untouched future practices and never past or manual ones", () => {
    const preview = patternChangePreview({
      program,
      sessions: [
        ...sessions,
        session("manual", "2026-12-11T00:00:00.000Z", { source: "manual" }),
      ],
      next: {
        startDate: program.startDate,
        endDate: program.endDate,
        slots: [
          { weekday: 6, startsAt: "09:00", endsAt: "11:00", intervalWeeks: 1 },
        ],
        exceptions: [],
      },
      now: "2026-12-09T12:00:00.000Z",
    });
    // Monday is past; Wednesday has a focus; the manual one is never a candidate.
    expect(preview.removed).toEqual([]);
    expect(preview.needsReview.map((row) => row.id)).toEqual(["wed"]);
    expect(preview.unchanged).toBe(1);
  });

  it("says plainly when nothing changes", () => {
    const preview = patternChangePreview({
      program,
      sessions,
      next: {
        startDate: program.startDate,
        endDate: program.endDate,
        slots: [
          { weekday: 1, startsAt: "16:00", endsAt: "18:00", intervalWeeks: 1 },
          { weekday: 3, startsAt: "16:00", endsAt: "18:00", intervalWeeks: 1 },
          { weekday: 6, startsAt: "09:00", endsAt: "11:00", intervalWeeks: 1 },
        ],
        exceptions: [],
      },
      now: "2026-12-01T00:00:00.000Z",
    });
    expect(previewSentence(preview)).toBe(
      "Nothing changes: 3 practices stay as they are.",
    );
  });
});

describe("activation and sessions in words", () => {
  it("states what Activate creates", () => {
    const words = activationWords({
      program: {
        ...trainingProgramsDemoProgram,
        startDate: "2026-12-07",
        endDate: "2026-12-13",
      },
      now: "2026-12-01T00:00:00.000Z",
    });
    expect(words.count).toBe(3);
    expect(words.sentence).toContain("Creates 3 practices");
    expect(words.sentence).toContain(
      "Athletes are not notified automatically.",
    );
  });

  it("labels load as an estimate", () => {
    expect(
      sessionPlanWords({
        mode: "focus",
        focus: "Jump volume",
        plannedLoad: 50,
        loadEstimateSource: "assumed",
      }),
    ).toBe("Jump volume · load 50 (estimate) · focus and load only");
  });
});
