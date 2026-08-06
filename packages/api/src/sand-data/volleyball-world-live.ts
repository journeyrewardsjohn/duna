import { normalizePersonName } from "./normalize";
import { scrapeHtml, scrapeJson } from "./http";
import type { ExternalMatchRecord } from "./types";

const volleyballWorldOrigin = "https://en.volleyballworld.com";
const volleyballWorldLiveOrigin = "https://en-live.volleyballworld.com";

type UnknownRecord = Readonly<Record<string, unknown>>;

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function records(value: unknown): readonly UnknownRecord[] {
  return Array.isArray(value) ? value.map(record) : [];
}

function text(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const normalized = String(value).trim();
  return normalized || undefined;
}

function number(value: unknown): number | undefined {
  const parsed =
    typeof value === "number" ? value : Number.parseFloat(text(value) ?? "");
  return Number.isFinite(parsed) ? parsed : undefined;
}

function integer(value: unknown): number | undefined {
  const parsed = number(value);
  return parsed !== undefined && Number.isInteger(parsed) ? parsed : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  const parsed = integer(value);
  return parsed !== undefined && parsed > 0 ? parsed : undefined;
}

function absoluteVolleyballWorldUrl(value: unknown): string | undefined {
  const candidate = text(value);
  if (!candidate) return undefined;
  try {
    const url = new URL(candidate, volleyballWorldOrigin);
    if (url.origin !== volleyballWorldOrigin) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function normalizedDate(value: unknown): string | undefined {
  const candidate = text(value)?.slice(0, 10);
  return candidate && /^\d{4}-\d{2}-\d{2}$/.test(candidate)
    ? candidate
    : undefined;
}

function normalizedUtcDateTime(value: unknown): string | undefined {
  const candidate = text(value);
  if (!candidate) return undefined;
  const withZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(candidate)
    ? candidate
    : `${candidate}Z`;
  const parsed = new Date(withZone);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function stripHtml(value: string): string {
  return value
    .replaceAll(/<[^>]+>/g, " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&#39;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll(/\s+/g, " ")
    .trim();
}

function classCell(row: string, className: string): string | undefined {
  for (const match of row.matchAll(
    /<td\b([^>]*)>([\s\S]*?)(?=<td\b|<\/tr>|$)/gi,
  )) {
    const classes = new Set(
      (attribute(match[1] ?? "", "class") ?? "").split(/\s+/).filter(Boolean),
    );
    if (classes.has(className)) return stripHtml(match[2] ?? "");
  }
  return undefined;
}

function tableRows(html: string): readonly string[] {
  return [
    ...html.matchAll(/<tr\b[^>]*>[\s\S]*?(?=<tr\b|<\/tbody>|<\/table>|$)/gi),
  ].map((match) => match[0]);
}

function numericCell(row: string, className: string): number | undefined {
  return number(classCell(row, className));
}

export type VolleyballWorldMatchStatus = "scheduled" | "live" | "completed";

export interface VolleyballWorldSetScore {
  readonly number: number;
  readonly a: number;
  readonly b: number;
}

export interface VolleyballWorldLiveMatch {
  readonly matchNo: number;
  readonly tournamentNo: number;
  readonly tournamentName?: string;
  readonly teamANo?: number;
  readonly teamBNo?: number;
  readonly status: VolleyballWorldMatchStatus;
  readonly statusLabel: string;
  readonly currentSetNo?: number;
  readonly currentSetPoints?: { readonly a: number; readonly b: number };
  readonly matchPoints: { readonly a: number; readonly b: number };
  readonly sets: readonly VolleyballWorldSetScore[];
  readonly liveStreamUrl?: string;
  readonly hasLineup: boolean;
}

function liveStatus(
  value: unknown,
  label: unknown,
): VolleyballWorldMatchStatus {
  const status = integer(value);
  const normalizedLabel = text(label)?.toLowerCase();
  if (status === 1 || normalizedLabel === "live") return "live";
  if (
    status === 2 ||
    normalizedLabel === "results" ||
    normalizedLabel === "final"
  ) {
    return "completed";
  }
  return "scheduled";
}

function setScores(value: unknown): readonly VolleyballWorldSetScore[] {
  const scored = records(value).flatMap((candidate) => {
    const a = integer(candidate.pointsTeamA);
    const b = integer(candidate.pointsTeamB);
    if (a === undefined || b === undefined || (a === 0 && b === 0)) return [];
    return [{ sourceNumber: integer(candidate.no), a, b }];
  });
  const zeroBased = scored.some((set) => set.sourceNumber === 0);
  return scored.map((set, index) => ({
    number: zeroBased
      ? index + 1
      : (positiveInteger(set.sourceNumber) ?? index + 1),
    a: set.a,
    b: set.b,
  }));
}

export function parseVolleyballWorldLiveMatch(
  value: unknown,
): VolleyballWorldLiveMatch | undefined {
  const payload = record(value);
  const matchNo = positiveInteger(payload.no);
  const tournamentNo = positiveInteger(payload.tournamentNo);
  if (!matchNo || !tournamentNo) return undefined;
  const a = integer(payload.currentSetTeamAPoints);
  const b = integer(payload.currentSetTeamBPoints);
  const status = liveStatus(payload.status, payload.statusLabel);
  return {
    matchNo,
    tournamentNo,
    ...(text(payload.tournamentName)
      ? { tournamentName: text(payload.tournamentName) }
      : {}),
    ...(positiveInteger(payload.noTeamA)
      ? { teamANo: positiveInteger(payload.noTeamA) }
      : {}),
    ...(positiveInteger(payload.noTeamB)
      ? { teamBNo: positiveInteger(payload.noTeamB) }
      : {}),
    status,
    statusLabel:
      text(payload.statusLabel) ??
      (status === "completed"
        ? "Final"
        : status === "live"
          ? "Live"
          : "Upcoming"),
    ...(positiveInteger(payload.currentSetNo)
      ? { currentSetNo: positiveInteger(payload.currentSetNo) }
      : {}),
    ...(a !== undefined && b !== undefined
      ? { currentSetPoints: { a, b } }
      : {}),
    matchPoints: {
      a: integer(payload.matchPointsA) ?? 0,
      b: integer(payload.matchPointsB) ?? 0,
    },
    sets: setScores(payload.sets),
    ...(text(payload.liveStreamUrl)
      ? { liveStreamUrl: text(payload.liveStreamUrl) }
      : {}),
    hasLineup: payload.hasLineup === true,
  };
}

export interface VolleyballWorldCompetition {
  readonly name: string;
  readonly shortName: string;
  readonly url: string;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly destination?: string;
  readonly subCompetitionType?: string;
  readonly menTournamentNumbers: readonly number[];
  readonly womenTournamentNumbers: readonly number[];
}

function tournamentNumbers(value: unknown): readonly number[] {
  return (text(value) ?? "").split(";").flatMap((candidate) => {
    const parsed = positiveInteger(candidate);
    return parsed ? [parsed] : [];
  });
}

export function parseVolleyballWorldCompetitions(
  value: unknown,
): readonly VolleyballWorldCompetition[] {
  return records(record(value).competitions).flatMap((candidate) => {
    if (text(candidate.discipline)?.toLowerCase() !== "beach") return [];
    const name = text(candidate.competitionFullName) ?? text(candidate.name);
    const shortName = text(candidate.competitionShortName) ?? name;
    const url = absoluteVolleyballWorldUrl(candidate.url);
    const startsOn = normalizedDate(candidate.startDate);
    const endsOn = normalizedDate(candidate.endDate);
    if (!name || !shortName || !url || !startsOn || !endsOn) return [];
    return [
      {
        name,
        shortName,
        url,
        startsOn,
        endsOn,
        ...(text(candidate.destination)
          ? { destination: text(candidate.destination) }
          : {}),
        ...(text(candidate.subCompetitionType)
          ? { subCompetitionType: text(candidate.subCompetitionType) }
          : {}),
        menTournamentNumbers: tournamentNumbers(candidate.menTournaments),
        womenTournamentNumbers: tournamentNumbers(candidate.womenTournaments),
      },
    ];
  });
}

export interface VolleyballWorldTeam {
  readonly teamNo: number;
  readonly name: string;
  readonly countryCode?: string;
  readonly country?: string;
  readonly flagUrl?: string;
  readonly squareFlagUrl?: string;
  readonly tournamentCode?: string;
}

export interface VolleyballWorldScheduledMatch {
  readonly matchNo: number;
  readonly matchNoInTournament: number;
  readonly tournamentNo: number;
  readonly scheduledAt?: string;
  readonly localStartsAt?: string;
  readonly gender?: "men" | "women";
  readonly phase?: string;
  readonly roundName?: string;
  readonly court?: string;
  readonly city?: string;
  readonly country?: string;
  readonly countryCode?: string;
  readonly teamANo?: number;
  readonly teamBNo?: number;
  readonly sets: readonly VolleyballWorldSetScore[];
  readonly matchPoints: { readonly a: number; readonly b: number };
  readonly winnerSide?: "A" | "B";
  readonly sourceUrl?: string;
  readonly volleyballTvUrl?: string;
  readonly youtubeUrl?: string;
}

export interface VolleyballWorldSchedule {
  readonly matches: readonly VolleyballWorldScheduledMatch[];
  readonly teams: readonly VolleyballWorldTeam[];
}

export function parseVolleyballWorldSchedule(
  value: unknown,
): VolleyballWorldSchedule {
  const payload = record(value);
  const teams = records(payload.allTeams).flatMap<VolleyballWorldTeam>(
    (candidate) => {
      const teamNo = positiveInteger(candidate.no);
      const name = text(candidate.name);
      if (!teamNo || !name) return [];
      return [
        {
          teamNo,
          name,
          ...(text(candidate.code)
            ? { countryCode: text(candidate.code)?.toUpperCase() }
            : {}),
          ...(text(candidate.country)
            ? { country: text(candidate.country) }
            : {}),
          ...(text(candidate.img) ? { flagUrl: text(candidate.img) } : {}),
          ...(text(candidate.imgSquared)
            ? { squareFlagUrl: text(candidate.imgSquared) }
            : {}),
          ...(text(candidate.tournamentCode)
            ? { tournamentCode: text(candidate.tournamentCode)?.toUpperCase() }
            : {}),
        },
      ];
    },
  );
  const matches = records(
    payload.matches,
  ).flatMap<VolleyballWorldScheduledMatch>((candidate) => {
    const matchNo = positiveInteger(candidate.matchNo);
    const matchNoInTournament = positiveInteger(candidate.matchNoInTournament);
    const tournamentNo = positiveInteger(candidate.tournamentNo);
    if (!matchNo || !matchNoInTournament || !tournamentNo) return [];
    const winnerTeamNo = positiveInteger(candidate.winnerTeamNo);
    const teamANo = positiveInteger(candidate.teamANo);
    const teamBNo = positiveInteger(candidate.teamBNo);
    const a = integer(candidate.teamAScore) ?? 0;
    const b = integer(candidate.teamBScore) ?? 0;
    const matchCenterUrl = absoluteVolleyballWorldUrl(candidate.matchCenterUrl);
    return [
      {
        matchNo,
        matchNoInTournament,
        tournamentNo,
        ...(normalizedUtcDateTime(candidate.matchDateUtc)
          ? { scheduledAt: normalizedUtcDateTime(candidate.matchDateUtc) }
          : {}),
        ...(text(candidate.matchDateTimeLocal)
          ? { localStartsAt: text(candidate.matchDateTimeLocal) }
          : {}),
        ...(text(candidate.gender)?.toLowerCase() === "men" ||
        text(candidate.gender)?.toLowerCase() === "women"
          ? {
              gender: text(candidate.gender)?.toLowerCase() as "men" | "women",
            }
          : {}),
        ...(text(record(candidate.phase).name)
          ? { phase: text(record(candidate.phase).name) }
          : {}),
        ...(text(candidate.roundName)
          ? { roundName: text(candidate.roundName) }
          : {}),
        ...((text(candidate.courtText) ?? text(candidate.court))
          ? { court: text(candidate.courtText) ?? text(candidate.court) }
          : {}),
        ...(text(candidate.city) ? { city: text(candidate.city) } : {}),
        ...(text(candidate.country)
          ? { country: text(candidate.country) }
          : {}),
        ...(text(candidate.countryCode)
          ? { countryCode: text(candidate.countryCode)?.toUpperCase() }
          : {}),
        ...(teamANo ? { teamANo } : {}),
        ...(teamBNo ? { teamBNo } : {}),
        sets: setScores(candidate.sets),
        matchPoints: { a, b },
        ...(winnerTeamNo && winnerTeamNo === teamANo
          ? { winnerSide: "A" as const }
          : winnerTeamNo && winnerTeamNo === teamBNo
            ? { winnerSide: "B" as const }
            : a > b
              ? { winnerSide: "A" as const }
              : b > a
                ? { winnerSide: "B" as const }
                : {}),
        ...(matchCenterUrl ? { sourceUrl: matchCenterUrl } : {}),
        ...(text(candidate.volleyBallTvLink)
          ? { volleyballTvUrl: text(candidate.volleyBallTvLink) }
          : {}),
        ...(text(candidate.youTubeLink)
          ? { youtubeUrl: text(candidate.youTubeLink) }
          : {}),
      },
    ];
  });
  return { matches, teams };
}

export interface OfficialFivbRosterCandidate {
  readonly teamNo?: number;
  readonly countryCode?: string;
  readonly provisional?: boolean;
  readonly participants: readonly {
    readonly externalPersonId: string;
    readonly name: string;
    readonly personId?: string;
  }[];
}

export function officialFivbPhase(
  value: string | undefined,
): "main-draw" | "qualification" | undefined {
  const normalized = normalizePersonName(value ?? "");
  if (normalized.includes("qualification")) return "qualification";
  if (normalized.includes("main draw")) return "main-draw";
  return undefined;
}

function officialRosterNameScore(
  officialName: string,
  candidateName: string,
): number {
  const official = normalizePersonName(officialName);
  const candidate = normalizePersonName(candidateName);
  if (!official || !candidate) return 0;
  if (official === candidate) return 100;
  if (candidate.includes(official)) return 90;
  if (official.includes(candidate)) return 80;
  const officialParts = official.split(" ");
  const candidateParts = candidate.split(" ");
  const lastName = officialParts.at(-1);
  if (!lastName || !candidateParts.includes(lastName)) return 0;
  return officialParts[0] === candidateParts[0] ? 70 : 55;
}

function officialRosterCandidateScore(input: {
  readonly team: VolleyballWorldTeam;
  readonly candidate: OfficialFivbRosterCandidate;
}): number {
  if (input.candidate.participants.length !== 2) return -Infinity;
  if (
    input.team.countryCode &&
    input.candidate.countryCode &&
    input.team.countryCode.toUpperCase() !==
      input.candidate.countryCode.toUpperCase()
  ) {
    return -Infinity;
  }
  const officialNames = input.team.name
    .split("/")
    .map((name) => name.trim())
    .filter(Boolean);
  if (officialNames.length !== 2) return -Infinity;
  const [first, second] = input.candidate.participants;
  if (!first || !second) return -Infinity;
  const direct = [
    officialRosterNameScore(officialNames[0] ?? "", first.name),
    officialRosterNameScore(officialNames[1] ?? "", second.name),
  ];
  const swapped = [
    officialRosterNameScore(officialNames[0] ?? "", second.name),
    officialRosterNameScore(officialNames[1] ?? "", first.name),
  ];
  const nameScore = Math.max(
    direct.every((score) => score > 0)
      ? direct.reduce((total, score) => total + score, 0)
      : -Infinity,
    swapped.every((score) => score > 0)
      ? swapped.reduce((total, score) => total + score, 0)
      : -Infinity,
  );
  if (!Number.isFinite(nameScore)) return -Infinity;
  return (
    nameScore +
    (input.candidate.teamNo === input.team.teamNo &&
    !input.candidate.provisional
      ? 10_000
      : 0) +
    (input.team.countryCode && input.candidate.countryCode ? 100 : 0) -
    (input.candidate.provisional ? 50 : 0)
  );
}

export function officialFivbTeamRoster(input: {
  readonly team: VolleyballWorldTeam;
  readonly candidates: readonly OfficialFivbRosterCandidate[];
}): OfficialFivbRosterCandidate["participants"] | undefined {
  const ranked = input.candidates
    .map((candidate) => ({
      candidate,
      score: officialRosterCandidateScore({ team: input.team, candidate }),
      key: candidate.participants
        .map((participant) => participant.externalPersonId)
        .sort()
        .join(":"),
    }))
    .filter(({ score }) => Number.isFinite(score))
    .sort((left, right) => right.score - left.score);
  const best = ranked[0];
  if (!best) return undefined;
  if (
    ranked.some(
      (candidate, index) =>
        index > 0 &&
        candidate.score === best.score &&
        candidate.key !== best.key,
    )
  ) {
    return undefined;
  }
  return best.candidate.participants;
}

function fallbackOfficialFivbRoster(
  team: VolleyballWorldTeam,
): OfficialFivbRosterCandidate["participants"] | undefined {
  const names = team.name
    .split("/")
    .map((name) => name.trim())
    .filter(Boolean);
  return names.length === 2
    ? names.map((name, index) => ({
        externalPersonId: `volleyball-world-team-${team.teamNo}-player-${index + 1}`,
        name,
      }))
    : undefined;
}

function officialRoundLabel(match: {
  readonly phase?: string;
  readonly roundName?: string;
}): string | undefined {
  const labels = [match.phase, match.roundName].filter(Boolean);
  return labels.length > 0 ? [...new Set(labels)].join(" - ") : undefined;
}

export function buildOfficialFivbMatchRecord(input: {
  readonly eventExternalId: string;
  readonly eventName: string;
  readonly eventGender: "men" | "women" | "coed";
  readonly scheduled: VolleyballWorldScheduledMatch;
  readonly teamA: VolleyballWorldTeam;
  readonly teamB: VolleyballWorldTeam;
  readonly rosterCandidates: readonly OfficialFivbRosterCandidate[];
}): ExternalMatchRecord | undefined {
  const phase = officialFivbPhase(input.scheduled.phase);
  if (!phase) return undefined;
  const rosterA =
    officialFivbTeamRoster({
      team: input.teamA,
      candidates: input.rosterCandidates,
    }) ?? fallbackOfficialFivbRoster(input.teamA);
  const rosterB =
    officialFivbTeamRoster({
      team: input.teamB,
      candidates: input.rosterCandidates,
    }) ?? fallbackOfficialFivbRoster(input.teamB);
  if (!rosterA || !rosterB) return undefined;
  const watchOptions = [
    ...(input.scheduled.volleyballTvUrl
      ? [
          {
            id: "volleyball-world-vbtv",
            kind: "vbtv",
            label: "VBTV",
            url: input.scheduled.volleyballTvUrl,
          },
        ]
      : []),
    ...(input.scheduled.youtubeUrl
      ? [
          {
            id: "volleyball-world-youtube",
            kind: "youtube",
            label: "YouTube",
            url: input.scheduled.youtubeUrl,
          },
        ]
      : []),
  ];
  return {
    externalMatchId: `${input.eventExternalId}:${phase}:${input.scheduled.matchNoInTournament}`,
    externalEventId: input.eventExternalId,
    sourceUrl: input.scheduled.sourceUrl,
    title: input.eventName,
    roundLabel: officialRoundLabel(input.scheduled),
    location:
      [input.scheduled.city, input.scheduled.country]
        .filter(Boolean)
        .join(", ") || undefined,
    genderCategory:
      input.scheduled.gender ??
      (input.eventGender === "coed" ? "coed" : input.eventGender),
    playedAt: input.scheduled.scheduledAt,
    participants: [
      ...rosterA.map((participant) => ({ ...participant, side: "A" as const })),
      ...rosterB.map((participant) => ({ ...participant, side: "B" as const })),
    ],
    sets: input.scheduled.sets.map((set) => ({ a: set.a, b: set.b })),
    winnerSide: input.scheduled.winnerSide,
    raw: {
      matchNumber: input.scheduled.matchNoInTournament,
      phase,
      volleyballWorldMatchNo: input.scheduled.matchNo,
      teamANo: input.teamA.teamNo,
      teamBNo: input.teamB.teamNo,
      teamAName: input.teamA.name,
      teamBName: input.teamB.name,
      ...(input.scheduled.localStartsAt
        ? { time: input.scheduled.localStartsAt.slice(11, 16) }
        : {}),
      ...(input.scheduled.court ? { court: input.scheduled.court } : {}),
      ...(watchOptions.length > 0 ? { watchOptions } : {}),
    },
  };
}

export interface VolleyballWorldTeamStat {
  readonly key:
    "attack" | "block" | "serve" | "opponent-error" | "total" | "dig";
  readonly label: string;
  readonly a: number;
  readonly b: number;
}

export interface VolleyballWorldPlayerStat {
  readonly externalPlayerId: string;
  readonly side: "A" | "B";
  readonly name: string;
  readonly total: number;
  readonly attack: number;
  readonly block: number;
  readonly serve: number;
  readonly errors: number;
  readonly efficiency: number;
}

const teamStatLabels = {
  attack: "Attack",
  block: "Block",
  serve: "Serve",
  "opponent-error": "Opponent error",
  total: "Total",
  dig: "Dig",
} as const;

export function parseVolleyballWorldTeamStatsHtml(
  html: string,
): readonly VolleyballWorldTeamStat[] {
  const rows = tableRows(html);
  return (
    Object.keys(teamStatLabels) as (keyof typeof teamStatLabels)[]
  ).flatMap((key) => {
    const row = rows.find((candidate) => {
      const openingTag = candidate.slice(0, candidate.indexOf(">") + 1);
      return new Set(
        (attribute(openingTag, "class") ?? "").split(/\s+/).filter(Boolean),
      ).has(key);
    });
    if (!row) return [];
    const a = numericCell(row, "-td-teamA");
    const b = numericCell(row, "-td-teamB");
    return a !== undefined && b !== undefined
      ? [{ key, label: teamStatLabels[key], a, b }]
      : [];
  });
}

function attribute(value: string, name: string): string | undefined {
  const escaped = name.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return value
    .match(new RegExp(`${escaped}=(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"))
    ?.slice(1)
    .find(Boolean);
}

export function parseVolleyballWorldPlayerStatsHtml(
  html: string,
): readonly VolleyballWorldPlayerStat[] {
  const tables = [
    ...html.matchAll(
      /<table\b[^>]*data-team=(?:"?(teama|teamb)"?)[^>]*data-set=(?:"?all"?)[^>]*data-stattype=(?:"?scoring"?)[^>]*>[\s\S]*?<\/table>/gi,
    ),
  ];
  return tables.flatMap((table) => {
    const side = table[1]?.toLowerCase() === "teamb" ? "B" : "A";
    return tableRows(table[0]).flatMap((row) => {
      const externalPlayerId = attribute(row, "data-player-no");
      const name = classCell(row, "playername");
      const total = numericCell(row, "total-abs");
      const attack = numericCell(row, "attacks");
      const block = numericCell(row, "blocks");
      const serve = numericCell(row, "serves");
      const errors = numericCell(row, "errors");
      const efficiency = numericCell(row, "efficiency-percentage");
      if (
        !externalPlayerId ||
        !name ||
        total === undefined ||
        attack === undefined ||
        block === undefined ||
        serve === undefined ||
        errors === undefined ||
        efficiency === undefined
      ) {
        return [];
      }
      return [
        {
          externalPlayerId,
          side,
          name,
          total,
          attack,
          block,
          serve,
          errors,
          efficiency,
        } satisfies VolleyballWorldPlayerStat,
      ];
    });
  });
}

export interface VolleyballWorldMatchStatistics {
  readonly team: readonly VolleyballWorldTeamStat[];
  readonly players: readonly VolleyballWorldPlayerStat[];
}

export interface VolleyballWorldBinding {
  readonly competitionName: string;
  readonly competitionUrl: string;
  readonly tournamentNo: number;
  readonly tournamentNumbers: readonly number[];
  readonly startsOn: string;
  readonly endsOn: string;
  readonly discoveredAt: string;
}

export function parseVolleyballWorldBinding(
  value: unknown,
): VolleyballWorldBinding | undefined {
  const binding = record(record(value).volleyballWorld);
  const competitionName = text(binding.competitionName);
  const competitionUrl = absoluteVolleyballWorldUrl(binding.competitionUrl);
  const tournamentNo = positiveInteger(binding.tournamentNo);
  const tournamentNumbers = Array.isArray(binding.tournamentNumbers)
    ? binding.tournamentNumbers.flatMap((candidate) => {
        const parsed = positiveInteger(candidate);
        return parsed ? [parsed] : [];
      })
    : [];
  const startsOn = normalizedDate(binding.startsOn);
  const endsOn = normalizedDate(binding.endsOn);
  const discoveredAt = text(binding.discoveredAt);
  if (
    !competitionName ||
    !competitionUrl ||
    !tournamentNo ||
    tournamentNumbers.length === 0 ||
    !startsOn ||
    !endsOn ||
    !discoveredAt
  ) {
    return undefined;
  }
  return {
    competitionName,
    competitionUrl,
    tournamentNo,
    tournamentNumbers,
    startsOn,
    endsOn,
    discoveredAt,
  };
}

export interface VolleyballWorldStoredMatch {
  readonly provider: "volleyball-world";
  readonly transport: "rest" | "websocket";
  readonly matchNo: number;
  readonly tournamentNo: number;
  readonly status: VolleyballWorldMatchStatus;
  readonly statusLabel: string;
  readonly currentSetNo?: number;
  readonly currentSetPoints?: { readonly a: number; readonly b: number };
  readonly matchPoints: { readonly a: number; readonly b: number };
  readonly sets: readonly VolleyballWorldSetScore[];
  readonly hasLineup: boolean;
  readonly liveStreamUrl?: string;
  readonly sourceUrl?: string;
  readonly teamA?: VolleyballWorldTeam;
  readonly teamB?: VolleyballWorldTeam;
  readonly statistics?: VolleyballWorldMatchStatistics;
  readonly syncedAt: string;
  readonly pollingMs: 30_000;
}

export function parseStoredVolleyballWorldMatch(
  value: unknown,
): VolleyballWorldStoredMatch | undefined {
  const stored = record(record(value).volleyballWorld);
  const matchNo = positiveInteger(stored.matchNo);
  const tournamentNo = positiveInteger(stored.tournamentNo);
  const status =
    stored.status === "scheduled" ||
    stored.status === "live" ||
    stored.status === "completed"
      ? stored.status
      : undefined;
  const syncedAt = text(stored.syncedAt);
  if (!matchNo || !tournamentNo || !status || !syncedAt) return undefined;
  const parseTeam = (candidate: unknown): VolleyballWorldTeam | undefined => {
    const team = record(candidate);
    const teamNo = positiveInteger(team.teamNo);
    const name = text(team.name);
    if (!teamNo || !name) return undefined;
    return {
      teamNo,
      name,
      ...(text(team.countryCode)
        ? { countryCode: text(team.countryCode)?.toUpperCase() }
        : {}),
      ...(text(team.country) ? { country: text(team.country) } : {}),
      ...(text(team.flagUrl) ? { flagUrl: text(team.flagUrl) } : {}),
      ...(text(team.squareFlagUrl)
        ? { squareFlagUrl: text(team.squareFlagUrl) }
        : {}),
      ...(text(team.tournamentCode)
        ? { tournamentCode: text(team.tournamentCode) }
        : {}),
    };
  };
  const parsedSets = records(stored.sets).flatMap((candidate, index) => {
    const a = integer(candidate.a);
    const b = integer(candidate.b);
    return a !== undefined && b !== undefined
      ? [{ number: positiveInteger(candidate.number) ?? index + 1, a, b }]
      : [];
  });
  const teamStats = records(record(stored.statistics).team).flatMap(
    (candidate) => {
      const key = text(candidate.key);
      const label = text(candidate.label);
      const a = number(candidate.a);
      const b = number(candidate.b);
      return key && label && a !== undefined && b !== undefined
        ? [{ key, label, a, b }]
        : [];
    },
  ) as readonly VolleyballWorldTeamStat[];
  const playerStats = records(
    record(stored.statistics).players,
  ).flatMap<VolleyballWorldPlayerStat>((candidate) => {
    const externalPlayerId = text(candidate.externalPlayerId);
    const side =
      candidate.side === "B" ? "B" : candidate.side === "A" ? "A" : undefined;
    const name = text(candidate.name);
    const total = number(candidate.total);
    const attack = number(candidate.attack);
    const block = number(candidate.block);
    const serve = number(candidate.serve);
    const errors = number(candidate.errors);
    const efficiency = number(candidate.efficiency);
    return externalPlayerId &&
      side &&
      name &&
      total !== undefined &&
      attack !== undefined &&
      block !== undefined &&
      serve !== undefined &&
      errors !== undefined &&
      efficiency !== undefined
      ? [
          {
            externalPlayerId,
            side,
            name,
            total,
            attack,
            block,
            serve,
            errors,
            efficiency,
          },
        ]
      : [];
  });
  const current = record(stored.currentSetPoints);
  const currentA = integer(current.a);
  const currentB = integer(current.b);
  const matchPoints = record(stored.matchPoints);
  const teamA = parseTeam(stored.teamA);
  const teamB = parseTeam(stored.teamB);
  return {
    provider: "volleyball-world",
    transport: stored.transport === "websocket" ? "websocket" : "rest",
    matchNo,
    tournamentNo,
    status,
    statusLabel:
      text(stored.statusLabel) ??
      (status === "completed"
        ? "Final"
        : status === "live"
          ? "Live"
          : "Upcoming"),
    ...(positiveInteger(stored.currentSetNo)
      ? { currentSetNo: positiveInteger(stored.currentSetNo) }
      : {}),
    ...(currentA !== undefined && currentB !== undefined
      ? { currentSetPoints: { a: currentA, b: currentB } }
      : {}),
    matchPoints: {
      a: integer(matchPoints.a) ?? 0,
      b: integer(matchPoints.b) ?? 0,
    },
    sets: parsedSets,
    hasLineup: stored.hasLineup === true,
    ...(text(stored.liveStreamUrl)
      ? { liveStreamUrl: text(stored.liveStreamUrl) }
      : {}),
    ...(absoluteVolleyballWorldUrl(stored.sourceUrl)
      ? { sourceUrl: absoluteVolleyballWorldUrl(stored.sourceUrl) }
      : {}),
    ...(teamA ? { teamA } : {}),
    ...(teamB ? { teamB } : {}),
    ...(teamStats.length > 0 || playerStats.length > 0
      ? { statistics: { team: teamStats, players: playerStats } }
      : {}),
    syncedAt,
    pollingMs: 30_000,
  };
}

export async function fetchVolleyballWorldCompetitions(
  year: number,
  month: number,
): Promise<readonly VolleyballWorldCompetition[]> {
  const payload = await scrapeJson<unknown>(
    "volleyball-world",
    `${volleyballWorldOrigin}/api/v1/globalschedule/competitions/${year}/${month}`,
  );
  return parseVolleyballWorldCompetitions(payload);
}

export async function fetchVolleyballWorldSchedule(input: {
  readonly startsOn: string;
  readonly endsOn: string;
  readonly tournamentNumbers: readonly number[];
}): Promise<VolleyballWorldSchedule> {
  const ids = [...new Set(input.tournamentNumbers)].filter(
    (candidate) => Number.isInteger(candidate) && candidate > 0,
  );
  if (ids.length === 0)
    throw new Error("A Volleyball World tournament ID is required.");
  const payload = await scrapeJson<unknown>(
    "volleyball-world",
    `${volleyballWorldOrigin}/api/v1/beach-tournament/${input.startsOn}/${input.endsOn}/${ids.join(";")}`,
  );
  return parseVolleyballWorldSchedule(payload);
}

export async function fetchVolleyballWorldLiveMatches(
  tournamentNumbers: readonly number[],
): Promise<readonly VolleyballWorldLiveMatch[]> {
  const ids = [...new Set(tournamentNumbers)].filter(
    (candidate) => Number.isInteger(candidate) && candidate > 0,
  );
  if (ids.length === 0) return [];
  const payload = await scrapeJson<unknown>(
    "volleyball-world",
    `${volleyballWorldLiveOrigin}/api/v1/live/beach/matches/bytournaments/${ids.join(";")}`,
  );
  return (Array.isArray(payload) ? payload : []).flatMap((candidate) => {
    const parsed = parseVolleyballWorldLiveMatch(candidate);
    return parsed ? [parsed] : [];
  });
}

export async function fetchVolleyballWorldLiveMatch(
  matchNo: number,
): Promise<VolleyballWorldLiveMatch> {
  if (!Number.isInteger(matchNo) || matchNo < 1) {
    throw new Error("A valid Volleyball World match ID is required.");
  }
  const payload = await scrapeJson<unknown>(
    "volleyball-world",
    `${volleyballWorldLiveOrigin}/api/v1/live/beach/matches/${matchNo}`,
  );
  const parsed = parseVolleyballWorldLiveMatch(payload);
  if (!parsed)
    throw new Error("Volleyball World returned an invalid live match.");
  return parsed;
}

function competitionScheduleBase(competitionUrl: string): string {
  const url = new URL(competitionUrl);
  if (url.origin !== volleyballWorldOrigin) {
    throw new Error(
      "Statistics must use an official Volleyball World event URL.",
    );
  }
  const basePath = url.pathname.replace(/\/(?:schedule)?\/?$/, "");
  return `${volleyballWorldOrigin}${basePath}/schedule`;
}

export async function fetchVolleyballWorldMatchStatistics(input: {
  readonly competitionUrl: string;
  readonly matchNo: number;
}): Promise<VolleyballWorldMatchStatistics> {
  const base = competitionScheduleBase(input.competitionUrl);
  // These fragments share the same upstream host and pacing budget. Fetching
  // sequentially keeps the source limiter deterministic during a live window.
  const team = await scrapeHtml(
    "volleyball-world",
    `${base}/${input.matchNo}/_libraries/live/_beach-match-statistics-by-team`,
    { timeoutMs: 30_000 },
  );
  const players = await scrapeHtml(
    "volleyball-world",
    `${base}/${input.matchNo}/_libraries/live/_beach-match-statistics-by-player`,
    { timeoutMs: 30_000 },
  );
  return {
    team: parseVolleyballWorldTeamStatsHtml(team.html),
    players: parseVolleyballWorldPlayerStatsHtml(players.html),
  };
}

function normalizedTokens(value: string | undefined): ReadonlySet<string> {
  const stop = new Set([
    "beach",
    "pro",
    "tour",
    "bpt",
    "fivb",
    "volleyball",
    "men",
    "women",
  ]);
  return new Set(
    (value ?? "")
      .normalize("NFKD")
      .replaceAll(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter(
        (token) =>
          token.length > 2 && !stop.has(token) && !/^20\d{2}$/.test(token),
      ),
  );
}

function intersectionSize(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): number {
  return [...left].filter((token) => right.has(token)).length;
}

function competitionScore(
  competition: VolleyballWorldCompetition,
  input: {
    readonly name: string;
    readonly location?: string;
    readonly category?: string;
    readonly startsOn: string;
    readonly endsOn: string;
  },
): number {
  if (
    competition.endsOn < input.startsOn ||
    competition.startsOn > input.endsOn
  ) {
    return -Infinity;
  }
  const eventTokens = normalizedTokens(
    `${input.name} ${input.location ?? ""} ${input.category ?? ""}`,
  );
  const competitionTokens = normalizedTokens(
    `${competition.name} ${competition.shortName} ${competition.destination ?? ""} ${competition.subCompetitionType ?? ""}`,
  );
  const exactDates =
    competition.startsOn === input.startsOn &&
    competition.endsOn === input.endsOn;
  return (
    (exactDates ? 8 : 4) +
    intersectionSize(eventTokens, competitionTokens) * 3 +
    (input.category &&
    competition.subCompetitionType &&
    normalizePersonName(input.category).includes(
      normalizePersonName(competition.subCompetitionType),
    )
      ? 3
      : 0)
  );
}

export async function discoverVolleyballWorldEvent(input: {
  readonly tcode: string;
  readonly name: string;
  readonly location?: string;
  readonly category?: string;
  readonly genderCategory: "men" | "women" | "coed";
  readonly startsOn: string;
  readonly endsOn: string;
  readonly now?: Date;
}): Promise<{
  readonly binding: VolleyballWorldBinding;
  readonly schedule: VolleyballWorldSchedule;
}> {
  const start = new Date(`${input.startsOn}T12:00:00Z`);
  const competitions = await fetchVolleyballWorldCompetitions(
    start.getUTCFullYear(),
    start.getUTCMonth() + 1,
  );
  const ranked = competitions
    .map((competition) => ({
      competition,
      score: competitionScore(competition, input),
    }))
    .filter(({ score, competition }) => {
      const ids =
        input.genderCategory === "women"
          ? competition.womenTournamentNumbers
          : input.genderCategory === "men"
            ? competition.menTournamentNumbers
            : [
                ...competition.menTournamentNumbers,
                ...competition.womenTournamentNumbers,
              ];
      return score >= 8 && ids.length > 0;
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);
  const tcode = input.tcode.toUpperCase();
  let fallback:
    | {
        readonly competition: VolleyballWorldCompetition;
        readonly tournamentNumbers: readonly number[];
        readonly schedule: VolleyballWorldSchedule;
        readonly score: number;
      }
    | undefined;
  for (const candidate of ranked) {
    const tournamentNumbers =
      input.genderCategory === "women"
        ? candidate.competition.womenTournamentNumbers
        : input.genderCategory === "men"
          ? candidate.competition.menTournamentNumbers
          : [
              ...candidate.competition.menTournamentNumbers,
              ...candidate.competition.womenTournamentNumbers,
            ];
    const schedule = await fetchVolleyballWorldSchedule({
      startsOn: candidate.competition.startsOn,
      endsOn: candidate.competition.endsOn,
      tournamentNumbers,
    });
    const confirmsTcode = schedule.teams.some(
      (team) => team.tournamentCode?.toUpperCase() === tcode,
    );
    const tournamentNo =
      schedule.matches.find((match) =>
        tournamentNumbers.includes(match.tournamentNo),
      )?.tournamentNo ?? tournamentNumbers[0];
    if (confirmsTcode && tournamentNo) {
      return {
        binding: {
          competitionName: candidate.competition.name,
          competitionUrl: candidate.competition.url,
          tournamentNo,
          tournamentNumbers,
          startsOn: candidate.competition.startsOn,
          endsOn: candidate.competition.endsOn,
          discoveredAt: (input.now ?? new Date()).toISOString(),
        },
        schedule,
      };
    }
    fallback ??= {
      competition: candidate.competition,
      tournamentNumbers,
      schedule,
      score: candidate.score,
    };
  }
  if (fallback && fallback.score >= 14) {
    const tournamentNo =
      fallback.schedule.matches.find((match) =>
        fallback.tournamentNumbers.includes(match.tournamentNo),
      )?.tournamentNo ?? fallback.tournamentNumbers[0];
    if (tournamentNo) {
      return {
        binding: {
          competitionName: fallback.competition.name,
          competitionUrl: fallback.competition.url,
          tournamentNo,
          tournamentNumbers: fallback.tournamentNumbers,
          startsOn: fallback.competition.startsOn,
          endsOn: fallback.competition.endsOn,
          discoveredAt: (input.now ?? new Date()).toISOString(),
        },
        schedule: fallback.schedule,
      };
    }
  }
  throw new Error(`No official Volleyball World event matched ${input.tcode}.`);
}

export function storedVolleyballWorldMatch(input: {
  readonly scheduled: VolleyballWorldScheduledMatch;
  readonly live?: VolleyballWorldLiveMatch;
  readonly teamA?: VolleyballWorldTeam;
  readonly teamB?: VolleyballWorldTeam;
  readonly statistics?: VolleyballWorldMatchStatistics;
  readonly syncedAt: Date;
}): VolleyballWorldStoredMatch {
  const current = input.live;
  return {
    provider: "volleyball-world",
    transport: "rest",
    matchNo: input.scheduled.matchNo,
    tournamentNo: input.scheduled.tournamentNo,
    status:
      current?.status ??
      (input.scheduled.winnerSide ? "completed" : "scheduled"),
    statusLabel:
      current?.statusLabel ??
      (input.scheduled.winnerSide ? "Results" : "Upcoming"),
    ...(current?.currentSetNo ? { currentSetNo: current.currentSetNo } : {}),
    ...(current?.currentSetPoints
      ? { currentSetPoints: current.currentSetPoints }
      : {}),
    matchPoints: current?.matchPoints ?? input.scheduled.matchPoints,
    sets:
      current && current.sets.length > 0 ? current.sets : input.scheduled.sets,
    hasLineup: current?.hasLineup ?? false,
    ...(current?.liveStreamUrl ? { liveStreamUrl: current.liveStreamUrl } : {}),
    ...(input.scheduled.sourceUrl
      ? { sourceUrl: input.scheduled.sourceUrl }
      : {}),
    ...(input.teamA ? { teamA: input.teamA } : {}),
    ...(input.teamB ? { teamB: input.teamB } : {}),
    ...(input.statistics ? { statistics: input.statistics } : {}),
    syncedAt: input.syncedAt.toISOString(),
    pollingMs: 30_000,
  };
}
