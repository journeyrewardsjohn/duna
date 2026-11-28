import { describe, expect, it } from "vitest";
import {
  CHIP_BUDGET,
  FACT_BUDGET,
  avatarGround,
  filterRoster,
  fit,
  guardianRule,
  nextBestAction,
  nextSessionFor,
  ratingFor,
  rosterRow,
  segmentCounts,
  type ProfileInput,
} from "./people-model";
import {
  previewMembers,
  previewRelationships,
  previewRosterEntries,
} from "./preview-people";

const NOW = Date.parse("2026-11-28T15:00:00.000Z");
const ZONE = "America/Los_Angeles";

const rows = previewMembers.map((member) =>
  rosterRow(
    member,
    previewRelationships.find((r) => r.personId === member.id),
    {
      next: nextSessionFor(member.id, previewRosterEntries(NOW), NOW),
      timeZone: ZONE,
    },
  ),
);

describe("roster rows", () => {
  it("nothing wraps: every fact and chip fits its one-line budget at the longest fixture", () => {
    const longest = rows.find((row) => row.name.startsWith("Maximiliana"))!;
    expect(longest.fact).toBe("Unlimited Sunset Doubles… · 12 credits");
    for (const row of rows) {
      expect(row.fact.length, row.name).toBeLessThanOrEqual(FACT_BUDGET);
      if (row.chip)
        expect(row.chip.label.length, row.name).toBeLessThanOrEqual(
          CHIP_BUDGET,
        );
      expect(row.fact).not.toMatch(/\n/);
    }
    // A long next-session title is shortened, never wrapped.
    const longSession = rosterRow(previewMembers[0]!, undefined, {
      next: {
        id: "x",
        sourceType: "session",
        title: "Advanced defensive footwork and reading the setter clinic",
        startsAt: "2026-11-29T17:00:00.000Z",
        status: "scheduled",
        attendees: [],
      },
      timeZone: ZONE,
    });
    expect(longSession.fact.length).toBeLessThanOrEqual(FACT_BUDGET);
    expect(longSession.fact.startsWith("Sun 9:00 AM · Advanced")).toBe(true);
  });

  it("a provisional Sand Rating is a dash, never '3.00 Provisional'", () => {
    expect(ratingFor({ display: 3, confidence: "Provisional" })).toEqual({
      value: null,
      reliability: 0,
    });
    expect(ratingFor({ display: 1.96, confidence: "Locked" })).toEqual({
      value: 1.96,
      reliability: 3,
    });
    const riley = rows.find((row) => row.name === "Riley Moss")!;
    expect(riley.rating.value).toBeNull();
    expect(riley.accessibilityLabel).toContain("Sand Rating provisional");
    expect(riley.accessibilityLabel).not.toContain("3.00");
  });

  it("says the one fact that matters next, in priority order", () => {
    const byName = (name: string) => rows.find((row) => row.name === name)!;
    expect(byName("Sam Rivera").fact).toBe("Needs attention · quiet 34 days");
    expect(byName("Sam Rivera").factTone).toBe("attention");
    expect(byName("Sam Rivera").chip).toEqual({
      label: "Follow up",
      tone: "attention",
    });
    expect(byName("Mara Lewis").fact).toMatch(
      /^Sun 9:00 AM · Sunset doubles clinic$/,
    );
    expect(byName("Elena Torres").chip?.label).toBe("Invited");
    expect(byName("Riley Moss").chip?.label).toBe("Junior");
    expect(byName("Noa Williams").fact).toBe("No plan or credits yet");
    expect(byName("Noa Williams").chip).toBeNull();
  });

  it("segments and search", () => {
    const counts = segmentCounts(rows);
    expect(counts.all).toBe(rows.length);
    expect(counts.juniors).toBe(1);
    expect(filterRoster(rows, "attention", "").map((r) => r.name)).toEqual([
      "Sam Rivera",
    ]);
    expect(filterRoster(rows, "all", "maxi").map((r) => r.name)).toEqual([
      "Maximiliana Castellanos-Oyelaran",
    ]);
    expect(filterRoster(rows, "staff", "").map((r) => r.name)).toContain(
      "Jordan Cruz",
    );
  });

  it("initials grounds are stable per person", () => {
    expect(avatarGround("abc")).toBe(avatarGround("abc"));
    expect(
      new Set(rows.map((row) => avatarGround(row.id))).size,
    ).toBeGreaterThan(1);
  });

  it("fit cuts at a word boundary", () => {
    expect(fit("Short", 10)).toBe("Short");
    expect(fit("Performance membership plus", 16)).toBe("Performance…");
  });
});

const profile = (patch: Partial<ProfileInput> = {}): ProfileInput => ({
  relationship: {
    ...previewRelationships[0]!,
    displayName: "Mara Lewis",
  },
  plans: [],
  creditGrants: [],
  sessions: [],
  ...patch,
});

describe("a person's next best action", () => {
  it("a junior without a verified guardian comes first", () => {
    const action = nextBestAction(
      profile({
        relationship: {
          ...previewRelationships[0]!,
          isMinor: true,
          displayName: "Riley Moss",
        },
      }),
      { guardians: [] },
      NOW,
    );
    expect(action.title).toBe("Link a verified guardian");
    expect(guardianRule("Riley Moss", true, { guardians: [] })).toContain(
      "None is linked yet",
    );
    expect(
      guardianRule("Riley Moss", true, {
        guardians: [
          {
            displayName: "Dana Moss",
            reviewStatus: "verified",
            contacted: true,
          },
        ],
      }),
    ).toBe(
      "Messages and receipts about Riley go to Dana Moss, their verified guardian.",
    );
  });

  it("a quiet player gets a check-in; nothing to pay from gets collect", () => {
    expect(
      nextBestAction(
        profile({
          relationship: {
            ...previewRelationships[2]!,
            displayName: "Sam Rivera",
          },
        }),
        null,
        NOW,
      ),
    ).toMatchObject({ title: "Check in with Sam", action: "message" });
    expect(nextBestAction(profile(), null, NOW)).toMatchObject({
      action: "collect",
    });
  });

  it("an active plan with a booking is all set", () => {
    const action = nextBestAction(
      profile({
        plans: [
          { name: "Performance", status: "active", cancelAtPeriodEnd: false },
        ],
        sessions: [
          {
            title: "Sunset doubles clinic",
            startsAt: "2026-11-29T17:00:00.000Z",
            status: "confirmed",
          },
        ],
      }),
      null,
      NOW,
    );
    expect(action).toMatchObject({
      title: "Next: Sunset doubles clinic",
      action: "note",
    });
  });
});
