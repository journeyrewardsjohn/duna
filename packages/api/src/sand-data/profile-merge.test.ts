import { describe, expect, it } from "vitest";
import {
  buildPlayerMergePlan,
  planMergedMatchDeduplication,
  resolvePlayerMergeFields,
  type PlayerMergeCandidate,
} from "./profile-merge";

function candidate(
  overrides: Partial<PlayerMergeCandidate> & Pick<PlayerMergeCandidate, "id">,
): PlayerMergeCandidate {
  const { id, ...rest } = overrides;
  return {
    id,
    displayName: "Crabb",
    handle: `player-${overrides.id}`,
    profileClaimStatus: "unclaimed",
    profileVisibility: "public",
    status: "active",
    isMinor: false,
    hasAccount: false,
    completeness: 2,
    sourceConnections: 0,
    importedMatches: 2,
    ratingEvents: 2,
    values: {},
    ...rest,
  };
}

describe("player merge intelligence", () => {
  it("keeps a claimed canonical profile and fills missing fields from the duplicate", () => {
    const plan = buildPlayerMergePlan({
      profileA: candidate({
        id: "source",
        values: {
          displayName: "Crabb",
          hometown: "Honolulu, Hawaii",
          links: [{ label: "FIVB", url: "https://example.com/fivb" }],
        },
      }),
      profileB: candidate({
        id: "target",
        displayName: "Taylor Crabb",
        handle: "taylor-crabb",
        profileClaimStatus: "claimed",
        hasAccount: true,
        completeness: 8,
        sourceConnections: 1,
        values: {
          displayName: "Taylor Crabb",
          biography: "Reviewed biography",
          links: [{ label: "AVP", url: "https://example.com/avp" }],
        },
      }),
    });

    expect(plan.target.id).toBe("target");
    expect(plan.source.id).toBe("source");
    expect(plan.canMerge).toBe(true);
    expect(plan.conflictCount).toBe(1);
    expect(plan.fields.find((field) => field.key === "hometown")).toMatchObject(
      {
        status: "source-fill",
        suggestedChoice: "source",
      },
    );
    expect(plan.fields.find((field) => field.key === "links")).toMatchObject({
      status: "combined",
      suggestedChoice: "combine",
    });
    const resolved = resolvePlayerMergeFields(plan, {
      displayName: "target",
    });
    expect(resolved.displayName).toBe("Taylor Crabb");
    expect(resolved.hometown).toBe("Honolulu, Hawaii");
    expect(resolved.links).toHaveLength(2);
  });

  it("blocks automatic consolidation when neither profile may be merged away", () => {
    const plan = buildPlayerMergePlan({
      profileA: candidate({
        id: "claimed-a",
        profileClaimStatus: "claimed",
        hasAccount: true,
      }),
      profileB: candidate({
        id: "claimed-b",
        profileClaimStatus: "claimed",
        hasAccount: true,
      }),
    });
    expect(plan.canMerge).toBe(false);
    expect(plan.blockers[0]).toContain("claimed account");
  });
});

describe("post-merge match de-duplication", () => {
  it("finds matches that become identical after person IDs are consolidated", () => {
    const groups = planMergedMatchDeduplication({
      sourcePersonId: "duplicate-crabb",
      targetPersonId: "taylor-crabb",
      matches: [
        {
          id: "fivb-row",
          participants: [
            { personId: "taylor-crabb", side: "A" },
            { personId: "benesh", side: "A" },
            { personId: "evandro", side: "B" },
            { personId: "arthur", side: "B" },
          ],
          sets: [
            { a: 21, b: 18 },
            { a: 21, b: 19 },
          ],
          playedAt: "2026-07-08T10:00:00.000Z",
          importState: "approved",
          canonicalMatchId: "canonical-fivb",
          sourcePriority: 0,
        },
        {
          id: "sandrating-row",
          participants: [
            { personId: "duplicate-crabb", side: "B" },
            { personId: "benesh", side: "B" },
            { personId: "evandro", side: "A" },
            { personId: "arthur", side: "A" },
          ],
          sets: [
            { a: 18, b: 21 },
            { a: 19, b: 21 },
          ],
          playedAt: "2026-07-08T17:00:00.000Z",
          importState: "approved",
          canonicalMatchId: "canonical-sandrating",
          sourcePriority: 5,
        },
      ],
    });

    expect(groups).toHaveLength(1);
    expect(groups[0]?.primary.id).toBe("fivb-row");
    expect(groups[0]?.duplicates.map((match) => match.id)).toEqual([
      "sandrating-row",
    ]);
  });
});
