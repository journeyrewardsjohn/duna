import { z } from "zod";
import { scrapeJson } from "./http";
import {
  type ExternalMatchParticipant,
  type ExternalMatchRecord,
  type ExternalPlayerRecord,
  type ProfessionalEventRecord,
  type SourceImportResult,
} from "./types";

const avpApi = "https://volleyballapi.web4data.co.uk/api";
const avpBracketUrl = "https://avp.com/brackets/";

const eventSchema = z.object({
  EventId: z.number().int(),
  EventCode: z.string().optional().nullable(),
  EventName: z.string(),
  Year: z.number().int(),
  StartDate: z.string(),
  EndDate: z.string(),
});

const competitionSchema = z.object({
  Id: z.number().int(),
  EventId: z.number().int(),
  Name: z.string(),
  Code: z.string().optional().nullable(),
  DrawSize: z.number().int().optional().nullable(),
  NumQualifiers: z.number().int().optional().nullable(),
  NumWildcards: z.number().int().optional().nullable(),
  CompetitionTypeName: z.string().optional().nullable(),
});

const playerSchema = z.object({
  PlayerId: z.number().int(),
  FirstName: z.string().optional().nullable(),
  LastName: z.string().optional().nullable(),
  Gender: z.string().optional().nullable(),
});

const teamSchema = z
  .object({
    Name: z.string().optional().nullable(),
    TeamId: z.number().int().optional().nullable(),
    Captain: playerSchema.optional().nullable(),
    Player: playerSchema.optional().nullable(),
    Seed: z.number().int().optional().nullable(),
  })
  .optional()
  .nullable();

const matchSchema = z.object({
  EventId: z.number().int(),
  EventName: z.string(),
  TournamentId: z.number().int().optional().nullable(),
  TournamentName: z.string().optional().nullable(),
  CompetitionId: z.number().int(),
  CompetitionName: z.string(),
  CompetitionCode: z.string().optional().nullable(),
  MatchNo: z.number().int(),
  BracketId: z.number().int().optional().nullable(),
  Bracket: z.string().optional().nullable(),
  RoundId: z.number().int().optional().nullable(),
  Round: z.string().optional().nullable(),
  TeamA: teamSchema,
  TeamB: teamSchema,
  Sets: z
    .array(
      z.object({
        SetNo: z.number().int(),
        A: z.number().int(),
        B: z.number().int(),
      }),
    )
    .default([]),
  Winner: z.number().int().optional().nullable(),
  StartTime: z.string().optional().nullable(),
  FinishTime: z.string().optional().nullable(),
  MatchState: z.string().optional().nullable(),
  MatchSchedule: z
    .object({
      ScheduleDisp: z.string().optional().nullable(),
      ScheduleTime: z.string().optional().nullable(),
      TimeZone: z.string().optional().nullable(),
      CourtName: z.string().optional().nullable(),
    })
    .optional()
    .nullable(),
});

export type AvpApiEvent = z.infer<typeof eventSchema>;
export type AvpApiCompetition = z.infer<typeof competitionSchema>;
export type AvpApiMatch = z.infer<typeof matchSchema>;

function dateOnly(value: string): string | undefined {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed)
    ? undefined
    : new Date(parsed).toISOString().slice(0, 10);
}

function stringValue(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function genderFromCompetition(name: string): "men" | "women" | undefined {
  const normalized = name.toLowerCase();
  if (normalized.includes("women")) return "women";
  if (normalized.includes("men")) return "men";
  return undefined;
}

function playerName(player: z.infer<typeof playerSchema>): string | undefined {
  const name = [stringValue(player.FirstName), stringValue(player.LastName)]
    .filter(Boolean)
    .join(" ");
  return name || undefined;
}

function playersForTeam(
  team: z.infer<typeof teamSchema>,
  gender: "men" | "women",
  side: "A" | "B",
): {
  readonly players: readonly ExternalPlayerRecord[];
  readonly participants: readonly ExternalMatchParticipant[];
} {
  const players = [team?.Captain, team?.Player].flatMap((player) => {
    if (!player) return [];
    const name = playerName(player);
    return name
      ? [
          {
            externalPersonId: `avp-player:${player.PlayerId}`,
            displayName: name,
            genderCategory: gender,
            isProfessional: true,
            raw: {
              source: "avp-tournaments",
              avpPlayerId: player.PlayerId,
              gender: player.Gender,
            },
          } satisfies ExternalPlayerRecord,
        ]
      : [];
  });
  return {
    players,
    participants: players.map((player) => ({
      externalPersonId: player.externalPersonId,
      name: player.displayName,
      side,
    })),
  };
}

function eventStatus(
  startsOn: string | undefined,
  endsOn: string | undefined,
  today: string,
): Pick<ProfessionalEventRecord, "status" | "live"> {
  if (startsOn && startsOn <= today && (!endsOn || today <= endsOn)) {
    return { status: "live", live: true };
  }
  if (endsOn && endsOn < today) return { status: "completed", live: false };
  return { status: "upcoming", live: false };
}

function isLeagueEvent(event: AvpApiEvent): boolean {
  return /\bavp\s+league\b/i.test(event.EventName);
}

function drawLabel(competitionName: string): "Main Draw" | "Qualifying Draw" {
  return /qualif/i.test(competitionName) ? "Qualifying Draw" : "Main Draw";
}

function matchRoundLabel(match: AvpApiMatch): string {
  return [
    drawLabel(match.CompetitionName),
    stringValue(match.Bracket),
    stringValue(match.Round) ?? `Match ${match.MatchNo}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

function teamLabel(team: z.infer<typeof teamSchema>): string | undefined {
  const names = [team?.Captain, team?.Player]
    .flatMap((player) => (player ? [playerName(player)] : []))
    .filter((name): name is string => Boolean(name));
  return names.join(" / ") || stringValue(team?.Name);
}

function mergedMatches(
  full: readonly AvpApiMatch[],
  live: readonly AvpApiMatch[],
): readonly AvpApiMatch[] {
  const liveByKey = new Map(
    live.map((match) => [`${match.CompetitionId}:${match.MatchNo}`, match]),
  );
  const all = full.map(
    (match) =>
      liveByKey.get(`${match.CompetitionId}:${match.MatchNo}`) ?? match,
  );
  for (const match of live) {
    if (
      !full.some(
        (candidate) =>
          candidate.CompetitionId === match.CompetitionId &&
          candidate.MatchNo === match.MatchNo,
      )
    ) {
      all.push(match);
    }
  }
  return all;
}

export function parseAvpTournamentSnapshot(input: {
  readonly events: unknown;
  readonly detailByEventId: ReadonlyMap<
    number,
    {
      readonly competitions: unknown;
      readonly matches: unknown;
      readonly liveMatches?: unknown;
    }
  >;
  readonly today?: string;
}): SourceImportResult {
  const events = z
    .array(eventSchema)
    .parse(input.events)
    .filter((event) => !isLeagueEvent(event));
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const players = new Map<string, ExternalPlayerRecord>();
  const matches: ExternalMatchRecord[] = [];
  const professionalEvents: ProfessionalEventRecord[] = [];

  for (const event of events) {
    const detail = input.detailByEventId.get(event.EventId);
    if (!detail) continue;
    const competitions = z.array(competitionSchema).parse(detail.competitions);
    const competitionById = new Map(
      competitions.map((competition) => [competition.Id, competition]),
    );
    const fullMatches = z.array(matchSchema).parse(detail.matches);
    const liveMatches = z.array(matchSchema).parse(detail.liveMatches ?? []);
    const eventMatches = mergedMatches(fullMatches, liveMatches);
    const startsOn = dateOnly(event.StartDate);
    const endsOn = dateOnly(event.EndDate);

    for (const gender of ["men", "women"] as const) {
      const genderMatches = eventMatches.filter(
        (match) => genderFromCompetition(match.CompetitionName) === gender,
      );
      const genderCompetitions = competitions.filter(
        (competition) => genderFromCompetition(competition.Name) === gender,
      );
      if (genderCompetitions.length === 0 && genderMatches.length === 0)
        continue;
      const externalEventId = `avp-tournament:${event.EventId}:${gender}`;
      const category = genderCompetitions
        .map((competition) => competition.CompetitionTypeName)
        .filter((value): value is string => Boolean(value))
        .join(" + ");
      professionalEvents.push({
        externalEventId,
        sourceUrl: avpBracketUrl,
        name: `${event.EventName} — ${gender === "women" ? "Women's" : "Men's"}`,
        location: stringValue(event.EventCode),
        countryCode: "USA",
        category: category || "AVP Tournament",
        genderCategory: gender,
        startsOn,
        endsOn,
        ...eventStatus(startsOn, endsOn, today),
        teamCount: new Set(
          genderMatches
            .flatMap((match) => [
              teamLabel(match.TeamA),
              teamLabel(match.TeamB),
            ])
            .filter(Boolean),
        ).size,
        matchCount: genderMatches.length,
        raw: {
          source: "avp-tournaments",
          avpEventId: event.EventId,
          eventCode: event.EventCode,
          gender,
          competitions: genderCompetitions,
          liveMatchCount: liveMatches.filter(
            (match) => genderFromCompetition(match.CompetitionName) === gender,
          ).length,
        },
      });

      for (const match of genderMatches) {
        const teamA = playersForTeam(match.TeamA, gender, "A");
        const teamB = playersForTeam(match.TeamB, gender, "B");
        for (const player of [...teamA.players, ...teamB.players])
          players.set(player.externalPersonId, player);
        const competition = competitionById.get(match.CompetitionId);
        matches.push({
          externalMatchId: `avp-match:${event.EventId}:${match.CompetitionId}:${match.MatchNo}`,
          externalEventId,
          sourceUrl: avpBracketUrl,
          title: event.EventName,
          roundLabel: matchRoundLabel(match),
          location: stringValue(event.EventCode),
          genderCategory: gender,
          playedAt:
            stringValue(match.StartTime) ??
            stringValue(match.MatchSchedule?.ScheduleTime),
          participants: [...teamA.participants, ...teamB.participants],
          sets: match.Sets.map((set) => ({ a: set.A, b: set.B })),
          ...(match.Winner === 1
            ? { winnerSide: "A" as const }
            : match.Winner === 2
              ? { winnerSide: "B" as const }
              : {}),
          raw: {
            source: "avp-tournaments",
            avpEventId: event.EventId,
            competitionId: match.CompetitionId,
            competitionCode: match.CompetitionCode,
            competitionName: match.CompetitionName,
            competition,
            matchNo: match.MatchNo,
            bracket: match.Bracket,
            bracketId: match.BracketId,
            round: match.Round,
            roundId: match.RoundId,
            matchState: match.MatchState,
            court: match.MatchSchedule?.CourtName,
            time: match.MatchSchedule?.ScheduleDisp,
            timezone: match.MatchSchedule?.TimeZone,
            finishTime: match.FinishTime,
            teamASeed: match.TeamA?.Seed,
            teamBSeed: match.TeamB?.Seed,
            live: liveMatches.some(
              (candidate) =>
                candidate.CompetitionId === match.CompetitionId &&
                candidate.MatchNo === match.MatchNo,
            ),
          },
        });
      }
    }
  }
  return {
    source: "avp-tournaments",
    requestedUrl: avpBracketUrl,
    players: [...players.values()],
    matches,
    events: professionalEvents,
    checkpoint: {
      events: events.length,
      liveMatches: matches.filter((match) => match.raw.live === true).length,
    },
  };
}

export async function importAvpTournaments(
  requestedSeason = new Date().getUTCFullYear(),
): Promise<SourceImportResult> {
  const events = await scrapeJson<unknown>(
    "avp-tournaments",
    `${avpApi}/events`,
  );
  const selected = z
    .array(eventSchema)
    .parse(events)
    .filter((event) => event.Year === requestedSeason && !isLeagueEvent(event));
  const detailByEventId = new Map<
    number,
    {
      readonly competitions: unknown;
      readonly matches: unknown;
      readonly liveMatches?: unknown;
    }
  >();
  for (const event of selected) {
    const [competitions, matches] = await Promise.all([
      scrapeJson<unknown>(
        "avp-tournaments",
        `${avpApi}/competitions/byevent/${event.EventId}`,
      ),
      scrapeJson<unknown>(
        "avp-tournaments",
        `${avpApi}/matches/byevent/${event.EventId}?noStats=1`,
      ),
    ]);
    const startsOn = dateOnly(event.StartDate);
    const endsOn = dateOnly(event.EndDate);
    const today = new Date().toISOString().slice(0, 10);
    const liveMatches =
      startsOn && startsOn <= today && (!endsOn || today <= endsOn)
        ? await scrapeJson<unknown>(
            "avp-tournaments",
            `${avpApi}/matches/byevent/${event.EventId}/live`,
          )
        : [];
    detailByEventId.set(event.EventId, { competitions, matches, liveMatches });
  }
  return parseAvpTournamentSnapshot({ events: selected, detailByEventId });
}
