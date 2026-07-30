import { describe, expect, it } from "vitest";
import {
  resolveImportedIdentity,
  unionImportedRatingHistory,
  type ImportedIdentity,
} from "./import-resolution";

const imported: ImportedIdentity = {
  source: "volleyball-life",
  externalId: "vl-8871",
  displayName: "Mára Lewis",
  birthDate: "2001-06-12",
  email: "mara@example.com",
  homeMarket: "South Bay",
};

describe("historical import and identity resolution", () => {
  it("links an exact source identity deterministically", () => {
    expect(
      resolveImportedIdentity({
        imported,
        candidates: [
          {
            personId: "person-1",
            displayName: "Different Name",
            externalIds: { "volleyball-life": "vl-8871" },
          },
        ],
      }),
    ).toMatchObject({
      action: "link",
      personId: "person-1",
      score: 1,
    });
  });

  it("routes ambiguous matches to human review instead of auto-merging", () => {
    const decision = resolveImportedIdentity({
      imported,
      candidates: [
        {
          personId: "person-a",
          displayName: "Mara Lewis",
          birthDate: "2001-06-12",
          homeMarket: "South Bay",
        },
        {
          personId: "person-b",
          displayName: "Mara Lewis",
          birthDate: "2001-06-12",
          homeMarket: "South Bay",
        },
      ],
    });

    expect(decision.action).toBe("review");
    expect(decision.margin).toBe(0);
    expect(decision.candidates.map((candidate) => candidate.personId)).toEqual([
      "person-a",
      "person-b",
    ]);
  });

  it("creates a person when no candidate clears the review threshold", () => {
    expect(
      resolveImportedIdentity({
        imported,
        candidates: [
          {
            personId: "unrelated",
            displayName: "Another Player",
          },
        ],
      }).action,
    ).toBe("create");
  });

  it("unions rating history by provenance and surfaces payload conflicts", () => {
    const result = unionImportedRatingHistory([
      [
        {
          source: "bvbinfo",
          externalEventId: "match-1",
          occurredAt: "2024-01-02T00:00:00Z",
          payloadHash: "hash-a",
          verificationWeight: 0.7,
        },
      ],
      [
        {
          source: "bvbinfo",
          externalEventId: "match-1",
          occurredAt: "2024-01-02T00:00:00Z",
          payloadHash: "hash-b",
          verificationWeight: 1,
        },
      ],
    ]);

    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.verificationWeight).toBe(1);
    expect(result.conflicts).toEqual([
      {
        key: "bvbinfo:match-1",
        payloadHashes: ["hash-a", "hash-b"],
      },
    ]);
  });
});
