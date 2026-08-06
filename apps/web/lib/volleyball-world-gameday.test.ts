import { describe, expect, it } from "vitest";
import {
  parseVolleyballWorldGamedayEvent,
  volleyballWorldAnonymousToken,
  volleyballWorldBeachTopic,
  volleyballWorldLiveFeedHealth,
  volleyballWorldLiveFeedTiming,
  volleyballWorldReconnectDelay,
} from "./volleyball-world-gameday";

describe("Volleyball World Gameday events", () => {
  it("downgrades stale match data, closes unresponsive feeds, and caps reconnect backoff", () => {
    const now = 100_000;
    expect(
      volleyballWorldLiveFeedHealth({
        now,
        lastMessageAt:
          now -
          volleyballWorldLiveFeedTiming.heartbeatMs -
          volleyballWorldLiveFeedTiming.responseGraceMs,
        lastMatchUpdateAt: now - volleyballWorldLiveFeedTiming.matchStaleMs,
      }),
    ).toEqual({ responseStale: false, matchStale: false });
    expect(
      volleyballWorldLiveFeedHealth({
        now,
        lastMessageAt:
          now -
          volleyballWorldLiveFeedTiming.heartbeatMs -
          volleyballWorldLiveFeedTiming.responseGraceMs -
          1,
        lastMatchUpdateAt: now - volleyballWorldLiveFeedTiming.matchStaleMs - 1,
      }),
    ).toEqual({ responseStale: true, matchStale: true });
    expect(volleyballWorldReconnectDelay(1)).toBe(1_000);
    expect(volleyballWorldReconnectDelay(5)).toBe(15_000);
    expect(volleyballWorldReconnectDelay(20)).toBe(15_000);
  });

  it("parses a specific beach event push update", () => {
    expect(
      parseVolleyballWorldGamedayEvent(
        {
          data: {
            event: {
              _externalId: "beach_event_544963",
              eventCompletionState: "urn:gd:event:status:inprogress",
              participants: [
                { number: 1, score: 0 },
                { number: 2, score: 1 },
              ],
              tags: [
                {
                  name: "urn:gd:tag:event:score:set:1",
                  value: "21:23",
                },
                {
                  name: "urn:gd:tag:event:score:set:2",
                  value: "17:19",
                },
              ],
            },
          },
        },
        544963,
      ),
    ).toEqual({
      matchNo: 544963,
      status: "live",
      matchPoints: { a: 0, b: 1 },
      sets: [
        { number: 1, a: 21, b: 23 },
        { number: 2, a: 17, b: 19 },
      ],
      currentSetNo: 2,
      currentSetPoints: { a: 17, b: 19 },
    });
  });

  it("ignores acknowledgements and events for another match", () => {
    expect(
      parseVolleyballWorldGamedayEvent(
        { code: 200, action: "subscribe", topic: "/event/544963" },
        544963,
      ),
    ).toBeUndefined();
    expect(
      parseVolleyballWorldGamedayEvent(
        { _externalId: "beach_event_123", status: "live" },
        544963,
      ),
    ).toBeUndefined();
  });

  it("parses the wildcard feed's participant scores and live statistics", () => {
    expect(volleyballWorldBeachTopic).toBe("/gameday/beach_volleyball/event/*");
    expect(
      parseVolleyballWorldGamedayEvent(
        {
          _externalId: "beach_event_544974",
          eventCompletionState: "urn:gd:event:status:inprogress",
          participants: [
            {
              _externalTeamId: "beach_team_3169072",
              number: 1,
              score: null,
              name: "Team A",
              tags: [
                {
                  name: "urn:gd:tag:event:participant:vbl:set1_score",
                  value: 17,
                },
                {
                  name: "urn:gd:tag:event:participant:vbl:set2_score",
                  value: 14,
                },
                {
                  name: "urn:gd:tag:event:vbl:team_stats:spike_point",
                  value: 23,
                },
                {
                  name: "urn:gd:tag:event:vbl:team_stats:serve_point",
                  value: 2,
                },
                {
                  name: "urn:gd:tag:event:vbl:team_stats:block_point",
                  value: 1,
                },
                {
                  name: "urn:gd:tag:event:vbl:team_stats:dig_excellent",
                  value: 8,
                },
              ],
            },
            {
              _externalTeamId: "beach_team_3170000",
              number: 2,
              score: null,
              name: "Team B",
              tags: [
                {
                  name: "urn:gd:tag:event:participant:vbl:set1_score",
                  value: 21,
                },
                {
                  name: "urn:gd:tag:event:participant:vbl:set2_score",
                  value: 12,
                },
                {
                  name: "urn:gd:tag:event:vbl:team_stats:spike_point",
                  value: 25,
                },
                {
                  name: "urn:gd:tag:event:vbl:team_stats:serve_point",
                  value: 1,
                },
                {
                  name: "urn:gd:tag:event:vbl:team_stats:block_point",
                  value: 2,
                },
                {
                  name: "urn:gd:tag:event:vbl:team_stats:dig_excellent",
                  value: 6,
                },
              ],
            },
            {
              _externalSportsPersonId: "152347",
              name: "Player One",
              tags: [
                { name: "urn:gd:tag:event:vbl:team_name", value: "Team A" },
                {
                  name: "urn:gd:tag:event:vbl:player_stats:spike_point",
                  value: 14,
                },
                {
                  name: "urn:gd:tag:event:vbl:player_stats:serve_point",
                  value: 2,
                },
                {
                  name: "urn:gd:tag:event:vbl:player_stats:block_point",
                  value: 1,
                },
                {
                  name: "urn:gd:tag:event:vbl:player_stats:spike_fault",
                  value: 3,
                },
                {
                  name: "urn:gd:tag:event:vbl:player_stats:spike_efficiency_percentage",
                  value: 31,
                },
              ],
            },
          ],
        },
        544974,
      ),
    ).toMatchObject({
      matchNo: 544974,
      status: "live",
      sets: [
        { number: 1, a: 17, b: 21 },
        { number: 2, a: 14, b: 12 },
      ],
      currentSetNo: 2,
      currentSetPoints: { a: 14, b: 12 },
      statistics: {
        team: [
          { key: "attack", a: 23, b: 25 },
          { key: "block", a: 1, b: 2 },
          { key: "serve", a: 2, b: 1 },
          { key: "dig", a: 8, b: 6 },
          { key: "total", a: 26, b: 28 },
        ],
        players: [
          {
            externalPlayerId: "152347",
            side: "A",
            total: 17,
            attack: 14,
            block: 1,
            serve: 2,
            errors: 3,
            efficiency: 31,
          },
        ],
      },
    });
  });

  it("finds the anonymous JWT in wrapped responses", () => {
    expect(
      volleyballWorldAnonymousToken({
        data: { access_token: "one.two.three" },
      }),
    ).toBe("one.two.three");
  });
});
