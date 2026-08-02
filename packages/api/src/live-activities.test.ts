import { standardBeachFormat } from "@duna/league-engine";
import { describe, expect, it } from "vitest";
import type { MatchScoringState } from "./match-service";
import {
  liveActivityDeliveryConfigured,
  matchLiveActivityState,
} from "./live-activities";

describe("Live Activity delivery", () => {
  it("requires the complete APNs signing configuration", () => {
    expect(liveActivityDeliveryConfigured({})).toBe(false);
    expect(
      liveActivityDeliveryConfigured({
        APNS_TEAM_ID: "TEAM123",
        APNS_KEY_ID: "KEY123",
        APNS_PRIVATE_KEY: "private-key",
      }),
    ).toBe(true);
  });

  it("maps the active set and reporter-neutral match state for APNs", () => {
    const state: MatchScoringState = {
      matchId: "10000000-0000-4000-8000-000000000001",
      status: "live",
      deviceId: "device-123",
      venueName: "Manhattan Beach Pier",
      teamA: {
        id: "10000000-0000-4000-8000-000000000002",
        name: "Sutton / Evans",
        people: [],
      },
      teamB: {
        id: "10000000-0000-4000-8000-000000000003",
        name: "Taylor / Lee",
        people: [],
      },
      format: standardBeachFormat,
      events: [],
      score: {
        status: "live",
        sets: [
          { a: 21, b: 18, winner: "A" },
          { a: 12, b: 10 },
        ],
        setIndex: 1,
        setsWon: { A: 1, B: 0 },
        serving: "B",
        timeouts: { A: 0, B: 0 },
        sideSwitchDue: false,
        technicalTimeoutDue: false,
        activeEventCount: 42,
      },
      nextSequence: 43,
      nextMonotonicCounter: 43,
      confirmation: {
        confirmedPersonIds: [],
        disputedPersonIds: [],
      },
      reporting: { reporters: [] },
    };

    expect(matchLiveActivityState(state)).toMatchObject({
      subjectId: state.matchId,
      kind: "match",
      title: "Sutton / Evans vs Taylor / Lee",
      subtitle: "Manhattan Beach Pier",
      status: "Live",
      scoreA: 12,
      scoreB: 10,
      setLabel: "Set 2",
    });
  });
});
