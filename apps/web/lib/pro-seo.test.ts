import type { PublicProEvent, PublicProMatchDetail } from "@duna/api";
import { describe, expect, it } from "vitest";
import {
  professionalEventJsonLd,
  professionalMatchJsonLd,
  professionalOgImageUrl,
  serializeJsonLd,
} from "./pro-seo";

const teamA = {
  key: "a",
  label: "T. Crabb / A. Benesh",
  players: [
    { name: "Taylor Crabb", handle: "taylor-crabb", rating: 4.62 },
    { name: "Andy Benesh", handle: "andy-benesh", rating: 4.58 },
  ],
};
const teamB = {
  key: "b",
  label: "P. Lotman / S. Tucker",
  players: [
    { name: "Paul Lotman", handle: "paul-lotman", rating: 4.31 },
    { name: "Silila Tucker", rating: 4.19 },
  ],
};
const match = {
  id: "025c772d-ae52-4d12-ba4c-3d9b52f1327e",
  externalMatchId: "avp:dallas:8",
  roundLabel: "Men · Week 8",
  playedAt: "2026-08-08T02:00:00.000Z",
  sourceUrl: "https://avp.com/league/",
  teamA,
  teamB,
  sets: [
    { a: 15, b: 10 },
    { a: 13, b: 15 },
  ],
  status: "live" as const,
  slug: "t-crabb-a-benesh-vs-p-lotman-s-tucker",
  canonicalPath:
    "/events/avp-league-dallas-mens-2026-08-07/match/t-crabb-a-benesh-vs-p-lotman-s-tucker/025c772d-ae52-4d12-ba4c-3d9b52f1327e",
  prediction: {
    teamA: 66,
    teamB: 34,
    favorite: "A" as const,
    basis: "SandRating" as const,
  },
  watchOptions: [
    {
      id: "youtube",
      kind: "youtube" as const,
      label: "YouTube",
      url: "https://www.youtube.com/watch?v=example",
    },
  ],
};
const event = {
  id: "event",
  slug: "avp-league-dallas-mens-2026-08-07",
  externalEventId: "avp-2026-week-8-men",
  name: "AVP League Dallas",
  location: "Frisco, Texas",
  category: "AVP League",
  source: "avp" as const,
  tour: "avp" as const,
  genderCategory: "men",
  startsOn: "2026-08-07",
  endsOn: "2026-08-08",
  status: "live",
  live: true,
  teamCount: 4,
  matchCount: 8,
  sourceUrl: "https://avp.com/league/",
  lastSyncedAt: "2026-08-08T01:15:00.000Z",
  editorial: {
    summary: "Week 8 of AVP League competition in Dallas.",
    venueName: "Comerica Center",
    venueAddress: "2601 Avenue of the Stars, Frisco, TX 75034",
    venue: {
      formattedAddress: "2601 Avenue of the Stars, Frisco, TX 75034, USA",
      addressLine1: "2601 Avenue of the Stars",
      locality: "Frisco",
      administrativeArea: "TX",
      postalCode: "75034",
      countryCode: "US",
      latitude: 33.0998,
      longitude: -96.8194,
      googleMapsUri: "https://maps.google.com/?cid=example",
    },
    timezone: "America/Chicago",
    ticketUrl: "https://tickets.example.com/avp-dallas",
    media: [],
  },
  watchOptions: match.watchOptions,
  teamEntries: [],
  podium: [],
  pools: [],
  liveStandings: [],
  bracket: [],
  matches: [match],
} as unknown as PublicProEvent;

describe("professional public discovery metadata", () => {
  it("describes the event, venue, teams, tickets, and broadcasts as linked entities", () => {
    const data = professionalEventJsonLd(event) as {
      readonly "@graph": readonly Record<string, unknown>[];
    };
    const types = data["@graph"].map((node) => node["@type"]);
    expect(types).toContain("SportsEvent");
    expect(types).toContain("Place");
    expect(types).toContain("SportsTeam");
    expect(types).toContain("BroadcastEvent");
    const place = data["@graph"].find((node) => node["@type"] === "Place");
    expect(place).toMatchObject({
      name: "Comerica Center",
      geo: { latitude: 33.0998, longitude: -96.8194 },
    });
    const sportsEvent = data["@graph"].find(
      (node) => node["@type"] === "SportsEvent",
    );
    expect(sportsEvent).toMatchObject({
      offers: { url: "https://tickets.example.com/avp-dallas" },
      eventStatus: "https://schema.org/EventInProgress",
    });
  });

  it("gives match pages their own canonical SportsEvent and set-score context", () => {
    const data = professionalMatchJsonLd({
      event,
      match,
    } as PublicProMatchDetail) as {
      readonly "@graph": readonly Record<string, unknown>[];
    };
    const sportsEvent = data["@graph"].find(
      (node) => node["@type"] === "SportsEvent",
    );
    expect(sportsEvent).toMatchObject({
      eventStatus: "https://schema.org/EventInProgress",
      additionalProperty: { name: "Set scores", value: "15-10, 13-15" },
    });
  });

  it("escapes script-like input and creates an absolute social image URL", () => {
    expect(
      serializeJsonLd({ name: "</script><script>alert(1)</script>" }),
    ).not.toContain("<script>");
    expect(
      professionalOgImageUrl({ title: "AVP Dallas", detail: "Week 8" }),
    ).toMatch(/^https:\/\/duna\.coach\/api\/og\/pro\?/);
  });
});
