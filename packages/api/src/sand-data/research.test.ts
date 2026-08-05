import { describe, expect, it } from "vitest";
import {
  filterResearchToEvidence,
  parseProfessionalEventResearchProposal,
} from "./research";

describe("professional event research evidence guard", () => {
  it("publishes only fields and links backed by supplied evidence", () => {
    const officialUrl = "https://example.com/events/hamburg-2026";
    const ticketUrl = "https://tickets.example.com/hamburg-2026";
    const result = filterResearchToEvidence(
      {
        overview: "Hamburg hosts the 2026 Elite event at the racecourse.",
        venueName: "Hamburg-Horn racecourse",
        venueAddress: "Rennbahnstraße 96, Hamburg",
        startsOn: "2026-08-05",
        endsOn: "2026-08-09",
        ticketUrl,
        watchOptions: [
          {
            kind: "live-tv",
            label: "CBS Sports Network",
            url: "https://unsupported.example.com/watch",
            channelName: "CBS Sports Network",
            confidence: 88,
            evidenceUrls: [officialUrl],
          },
        ],
        claims: [
          {
            field: "overview",
            value: "Hamburg hosts the 2026 Elite event at the racecourse.",
            confidence: 92,
            evidenceUrls: [officialUrl],
          },
          {
            field: "venueName",
            value: "Hamburg-Horn racecourse",
            confidence: 90,
            evidenceUrls: ["https://invented.example.com/venue"],
          },
          {
            field: "startsOn",
            value: "2026-08-05",
            confidence: 95,
            evidenceUrls: [officialUrl],
          },
          {
            field: "endsOn",
            value: "2026-08-09",
            confidence: 95,
            evidenceUrls: [officialUrl],
          },
          {
            field: "ticketUrl",
            value: ticketUrl,
            confidence: 94,
            evidenceUrls: [ticketUrl],
          },
        ],
      },
      new Set([officialUrl, ticketUrl]),
    );

    expect(result.overview).toContain("Hamburg hosts");
    expect(result.venueName).toBe("");
    expect(result.startsOn).toBe("2026-08-05");
    expect(result.endsOn).toBe("2026-08-09");
    expect(result.ticketUrl).toBe(ticketUrl);
    expect(result.watchOptions).toEqual([
      expect.objectContaining({
        channelName: "CBS Sports Network",
        evidenceUrls: [officialUrl],
        url: "",
      }),
    ]);
  });

  it("rejects malformed stored proposals instead of trusting raw JSON", () => {
    expect(
      parseProfessionalEventResearchProposal({
        id: "proposal",
        query: "event",
        generatedAt: "2026-08-04T12:00:00.000Z",
        model: "openai/gpt-5.6-luna",
        status: "silently-published",
        watchOptions: [],
        claims: [],
        evidence: [],
      }),
    ).toBeUndefined();
  });
});
