import { describe, expect, it } from "vitest";
import { predictionMarketPath } from "./prediction-market";

describe("prediction market wallet navigation", () => {
  it("returns a stored canonical professional match path", () => {
    expect(
      predictionMarketPath({
        subjectType: "pro-match",
        subjectId: "7177c245-9b70-4073-9cb6-ee9827b9e677",
        sourceSnapshot: {
          eventSlug: "bpt-elite16-hamburg-womens-2026-08-05",
          canonicalPath:
            "/events/bpt-elite16-hamburg-womens-2026-08-05/match/pool-a/7177c245-9b70-4073-9cb6-ee9827b9e677",
        },
      }),
    ).toBe(
      "/events/bpt-elite16-hamburg-womens-2026-08-05/match/pool-a/7177c245-9b70-4073-9cb6-ee9827b9e677",
    );
  });

  it("links generic match orders back to their app detail page", () => {
    expect(
      predictionMarketPath({
        subjectType: "match",
        subjectId: "7177c245-9b70-4073-9cb6-ee9827b9e677",
        sourceSnapshot: {},
      }),
    ).toBe("/app/matches/7177c245-9b70-4073-9cb6-ee9827b9e677");
  });

  it("falls back to a valid event page for older professional markets", () => {
    expect(
      predictionMarketPath({
        subjectType: "pro-match",
        subjectId: "7177c245-9b70-4073-9cb6-ee9827b9e677",
        sourceSnapshot: {
          eventSlug: "bpt-elite16-hamburg-womens-2026-08-05",
        },
      }),
    ).toBe("/events/bpt-elite16-hamburg-womens-2026-08-05");
  });

  it("links tournament contracts directly to the prediction section", () => {
    expect(
      predictionMarketPath({
        subjectType: "pro-event-team",
        subjectId: "event:team",
        sourceSnapshot: {
          eventSlug: "bpt-elite16-hamburg-womens-2026-08-05",
        },
      }),
    ).toBe("/events/bpt-elite16-hamburg-womens-2026-08-05#prediction-markets");
  });
});
