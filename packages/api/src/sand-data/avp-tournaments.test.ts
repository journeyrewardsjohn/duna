import { describe, expect, it } from "vitest";
import {
  parseAvpApiMatches,
  parseAvpTournamentSnapshot,
} from "./avp-tournaments";

const event = {
  EventId: 52,
  EventCode: "Manhattan",
  EventName: "2026 Manhattan Beach Open - Heritage Event",
  Year: 2026,
  StartDate: "2026-08-14T00:00:00",
  EndDate: "2026-08-16T00:00:00",
};

const competition = {
  Id: 163,
  EventId: 52,
  Code: "MDM",
  Name: "Men's Main Draw",
  DrawSize: 32,
  NumQualifiers: 8,
  CompetitionTypeName: "Double Elimination",
};

const match = {
  EventId: 52,
  EventName: event.EventName,
  CompetitionId: 163,
  CompetitionName: "Men's Main Draw",
  CompetitionCode: "MDM",
  MatchNo: 1,
  BracketId: 3,
  Bracket: "Winner's Bracket",
  RoundId: 1,
  Round: "First Round",
  TeamA: {
    Captain: {
      PlayerId: 1022,
      FirstName: "Chase",
      LastName: "Budinger",
      Gender: "M",
    },
    Player: {
      PlayerId: 1010,
      FirstName: "Trevor",
      LastName: "Crabb",
      Gender: "M",
    },
    Seed: 1,
  },
  TeamB: {
    Captain: {
      PlayerId: 1437,
      FirstName: "Ric",
      LastName: "Cervantes",
      Gender: "M",
    },
    Player: {
      PlayerId: 1798,
      FirstName: "Jonah",
      LastName: "Seif",
      Gender: "M",
    },
    Seed: 32,
  },
  Sets: [
    { SetNo: 1, A: 21, B: 18 },
    { SetNo: 2, A: 16, B: 21 },
  ],
  Winner: 2,
  StartTime: "2026-08-14T11:01:17.000-04:00",
  FinishTime: "2026-08-14T12:04:09.000-04:00",
  MatchState: "F",
  MatchSchedule: {
    ScheduleDisp: "Fri 8:00AM",
    TimeZone: "PST",
    CourtName: "ST",
  },
};

describe("AVP tournament brackets", () => {
  it("keeps men and women as separate Pro Events and records a main-draw match", () => {
    const result = parseAvpTournamentSnapshot({
      events: [event],
      detailByEventId: new Map([
        [52, { competitions: [competition], matches: [match] }],
      ]),
      today: "2026-08-15",
    });

    expect(result.events).toMatchObject([
      {
        externalEventId: "avp-tournament:52:men",
        genderCategory: "men",
        status: "live",
        matchCount: 1,
      },
    ]);
    expect(result.players).toHaveLength(4);
    expect(result.matches[0]).toMatchObject({
      externalMatchId: "avp-match:52:163:1",
      externalEventId: "avp-tournament:52:men",
      roundLabel: "Main Draw · Winner's Bracket · First Round",
      winnerSide: "B",
      sets: [
        { a: 21, b: 18 },
        { a: 16, b: 21 },
      ],
    });
    expect(result.matches[0]?.participants.slice(0, 2)).toEqual([
      {
        externalPersonId: "avp-player:1022",
        name: "Chase Budinger",
        side: "A",
      },
      { externalPersonId: "avp-player:1010", name: "Trevor Crabb", side: "A" },
    ]);
  });

  it("prefers the official live endpoint over the full feed for an in-progress match", () => {
    const liveMatch = {
      ...match,
      Winner: null,
      MatchState: "P",
      Sets: [{ SetNo: 1, A: 12, B: 10 }],
    };
    const result = parseAvpTournamentSnapshot({
      events: [event],
      detailByEventId: new Map([
        [
          52,
          {
            competitions: [competition],
            matches: [match],
            liveMatches: [liveMatch],
          },
        ],
      ]),
      today: "2026-08-15",
    });

    expect(result.matches[0]).toMatchObject({
      sets: [{ a: 12, b: 10 }],
      raw: { live: true, matchState: "P" },
    });
    expect(result.matches[0]).not.toHaveProperty("winnerSide");
  });

  it("does not duplicate the AVP League event from the shared feed", () => {
    const result = parseAvpTournamentSnapshot({
      events: [{ ...event, EventId: 51, EventName: "2026 AVP League Season" }],
      detailByEventId: new Map(),
      today: "2026-08-15",
    });
    expect(result.events).toEqual([]);
  });

  it("accepts an official scheduled final before its second team is known", () => {
    const pendingFinal = {
      ...match,
      MatchNo: 5,
      TeamB: {
        Captain: { PlayerId: null, LastName: "TBD", Gender: "M" },
        Player: { PlayerId: null, LastName: "TBD", Gender: "M" },
      },
      Sets: null,
      Winner: null,
      MatchState: "U",
    };

    expect(parseAvpApiMatches([pendingFinal])[0]).toMatchObject({
      MatchNo: 5,
      Sets: [],
      TeamB: { Captain: { PlayerId: null } },
    });
  });
});
