import { describe, expect, it } from "vitest";
import {
  parseVolleyballWorldGamedayEvent,
  volleyballWorldAnonymousToken,
} from "./volleyball-world-gameday";

describe("Volleyball World Gameday events", () => {
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

  it("finds the anonymous JWT in wrapped responses", () => {
    expect(
      volleyballWorldAnonymousToken({
        data: { access_token: "one.two.three" },
      }),
    ).toBe("one.two.three");
  });
});
