import { hashValue, normalizePersonName, parseDate } from "./normalize";
import { scrapeHtml, scrapeJson } from "./http";
import {
  SandDataUpstreamError,
  type ExternalMatchRecord,
  type ExternalPlayerRecord,
  type ProfessionalEventRecord,
  type SourceImportResult,
  type WorldRankingRecord,
} from "./types";

const volleyballLifeApi = "https://api-v8.volleyballlife.com";
const fivbBase = "https://fivb.12ndr.at";
const volleyballWorldApi =
  "https://en.volleyballworld.com/api/v1/worldranking/beachvolleyball";

export interface SourceImportProgress {
  readonly phase: string;
  readonly current: number;
  readonly total: number;
  readonly matchesFound: number;
  readonly profilesFound: number;
}

type SourceImportProgressHandler = (
  progress: SourceImportProgress,
) => void | Promise<void>;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function records(value: unknown): readonly Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(record) : [];
}

function stringValue(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
}

function numberValue(value: unknown): number | undefined {
  const valueNumber =
    typeof value === "number" ? value : Number.parseFloat(stringValue(value));
  return Number.isFinite(valueNumber) ? valueNumber : undefined;
}

function stripHtml(value: string): string {
  return value
    .replaceAll(/<[^>]+>/g, " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&nbsp;", " ")
    .replaceAll(/\s+/g, " ")
    .trim();
}

function pageCells(row: string): readonly string[] {
  return [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(
    (match) => match[1] ?? "",
  );
}

function compactFederationCode(value: string): string | undefined {
  const code = value.trim();
  return /^[A-Z]{2,3}$/.test(code) ? code : undefined;
}

export async function importBvbInfoPlayer(
  playerId: string,
  onProgress?: SourceImportProgressHandler,
): Promise<SourceImportResult> {
  const numericId = Number.parseInt(playerId, 10);
  if (!Number.isInteger(numericId) || numericId < 1) {
    throw new SandDataUpstreamError(
      "bvbinfo",
      "not-found",
      "BVBInfo player ID must be a positive integer.",
    );
  }
  const requestedUrl = `http://www.bvbinfo.com/player.asp?ID=${numericId}&Page=1`;
  const first = await scrapeHtml("bvbinfo", requestedUrl, {
    timeoutMs: 90_000,
  });
  const pages = new Map<number, string>([[1, first.html]]);
  for (const pageMatch of first.html.matchAll(
    /player\.asp\?ID=\d+(?:&amp;|&)Page=(\d+)/gi,
  )) {
    const page = Number.parseInt(pageMatch[1] ?? "1", 10);
    if (page > 1 && page <= 50) pages.set(page, "");
  }
  for (const page of pages.keys()) {
    if (page === 1) continue;
    const pageResult = await scrapeHtml(
      "bvbinfo",
      `http://www.bvbinfo.com/player.asp?ID=${numericId}&Page=${page}`,
      { timeoutMs: 90_000 },
    );
    pages.set(page, pageResult.html);
    await onProgress?.({
      phase: "fetching-career-pages",
      current: [...pages.entries()].filter(([, html]) => Boolean(html)).length,
      total: pages.size,
      matchesFound: 0,
      profilesFound: 1,
    });
  }

  const profileHtml = first.html;
  const title =
    profileHtml.match(/<td\s+class="clsPlayerName">([^<]+)<\/td>/i)?.[1] ??
    profileHtml
      .match(/document\.title="([^"]+)"/)?.[1]
      ?.replace(/\s*:\s*Career.*$/i, "") ??
    `BVBInfo player ${numericId}`;
  const field = (label: string) =>
    profileHtml
      .match(
        new RegExp(
          `<td[^>]*class="clsPlayerDataLabel"[^>]*>${label}</td>\\s*<td[^>]*class="clsPlayerData"[^>]*>([^<]+)`,
          "i",
        ),
      )?.[1]
      ?.trim();
  const country = profileHtml
    .match(/<td\s+class="clsPlayerCountry"[^>]*>([^<&]+)/i)?.[1]
    ?.trim();
  const player: ExternalPlayerRecord = {
    externalPersonId: String(numericId),
    displayName: title.trim(),
    profileUrl: requestedUrl,
    hometown: field("Home Town") ?? field("Resides"),
    countryCode: country,
    birthDate: parseDate(field("Birth Date") ?? ""),
    isProfessional: true,
    raw: {
      bvbinfoId: numericId,
      country,
      birthDate: field("Birth Date"),
      hometown: field("Home Town"),
      resides: field("Resides"),
      height: field("Height"),
      college: field("College"),
    },
  };

  const players = new Map<string, ExternalPlayerRecord>([
    [player.externalPersonId, player],
  ]);
  const matches: ExternalMatchRecord[] = [];
  let parsedPages = 0;
  for (const html of pages.values()) {
    if (!html) continue;
    const seasonStart = html.indexOf("Season Summaries");
    if (seasonStart < 0) continue;
    const blocks = html
      .slice(seasonStart)
      .split(/<a\s+name="(\d{4})([^"]*)"><\/a>/i);
    for (let index = 1; index < blocks.length; index += 3) {
      const season = blocks[index] ?? "";
      const body = blocks[index + 2] ?? "";
      let tournament:
        | {
            name: string;
            date: string;
            partnerId?: string;
            partnerName: string;
          }
        | undefined;
      for (const row of body.split(/<tr(?:\s+[^>]*)?>/i)) {
        const tournamentLink = row.match(
          /<a\s+href="Tournament\.asp\?ID=(\d+)"[^>]*>([^<]+)<\/a>/i,
        );
        const dateCell = row.match(/<td\s+align="center">([^<]+)<\/td>/i);
        const linkedPlayers = [
          ...row.matchAll(
            /<a\s+href="player\.asp\?ID=(\d+)"[^>]*>([^<]+)<\/a>/gi,
          ),
        ];
        if (tournamentLink && dateCell) {
          tournament = {
            name: tournamentLink[2]?.trim() ?? "BVBInfo event",
            date:
              parseDate(`${dateCell[1]?.trim()}/${season}`) ??
              `${season}-01-01`,
            partnerId: linkedPlayers[0]?.[1],
            partnerName: linkedPlayers[0]?.[2]?.trim() ?? "Unknown partner",
          };
          if (tournament.partnerId) {
            players.set(tournament.partnerId, {
              externalPersonId: tournament.partnerId,
              displayName: tournament.partnerName,
              profileUrl: `http://www.bvbinfo.com/player.asp?ID=${tournament.partnerId}`,
              isProfessional: true,
              raw: {},
            });
          }
          continue;
        }
        const resultMatch = row.match(/([dlw])\.\s*<a/i);
        if (!tournament || !resultMatch) continue;
        const opponents = linkedPlayers.map((opponent) => ({
          externalPersonId: opponent[1] ?? "",
          name: opponent[2]?.trim() ?? "Unknown opponent",
        }));
        if (opponents.length < 2 || !tournament.partnerId) continue;
        for (const opponent of opponents) {
          if (!opponent.externalPersonId) continue;
          players.set(opponent.externalPersonId, {
            externalPersonId: opponent.externalPersonId,
            displayName: opponent.name,
            profileUrl: `http://www.bvbinfo.com/player.asp?ID=${opponent.externalPersonId}`,
            isProfessional: true,
            raw: {},
          });
        }
        const scoreText =
          row.match(
            /(?:\)|&nbsp;)\s*&nbsp;&nbsp;([\d\-,\s]+(?:\s*\(\d+:\d+\))?)/,
          )?.[1] ??
          row.match(
            /&nbsp;&nbsp;([\d\-,\s]+(?:\s*\(\d+:\d+\))?)\s*<\/td>/,
          )?.[1] ??
          "";
        const sets = [...scoreText.matchAll(/(\d+)-(\d+)/g)].map((score) => ({
          a: Number.parseInt(score[1] ?? "0", 10),
          b: Number.parseInt(score[2] ?? "0", 10),
        }));
        if (sets.length === 0) continue;
        const roundLabel =
          row
            .match(/<td\s+align="right">([^<]+)<\/td>/i)?.[1]
            ?.trim()
            .replace(/:$/, "") ?? "";
        const externalMatchId = hashValue(
          [
            season,
            tournament.name,
            tournament.date,
            numericId,
            tournament.partnerId,
            opponents.map((opponent) => opponent.externalPersonId).join("-"),
            roundLabel,
            sets.map((set) => `${set.a}-${set.b}`).join(","),
          ].join("|"),
        );
        matches.push({
          externalMatchId,
          externalEventId: `${season}:${normalizePersonName(tournament.name)}`,
          sourceUrl: requestedUrl,
          title: tournament.name,
          roundLabel,
          location: tournament.name,
          genderCategory: undefined,
          playedAt: `${tournament.date}T12:00:00.000Z`,
          participants: [
            {
              externalPersonId: String(numericId),
              name: player.displayName,
              side: "A",
            },
            {
              externalPersonId: tournament.partnerId,
              name: tournament.partnerName,
              side: "A",
            },
            ...opponents.slice(0, 2).map((opponent) => ({
              ...opponent,
              side: "B" as const,
            })),
          ],
          sets,
          winnerSide: resultMatch[1]?.toLowerCase() === "l" ? "B" : "A",
          raw: { season, roundLabel, scoreText },
        });
      }
    }
    parsedPages += 1;
    await onProgress?.({
      phase: "reading-match-history",
      current: parsedPages,
      total: pages.size,
      matchesFound: matches.length,
      profilesFound: players.size,
    });
  }
  return {
    source: "bvbinfo",
    requestedUrl,
    players: [...players.values()],
    matches,
    checkpoint: { pages: pages.size, engine: first.engine },
  };
}

export function selectVolleyballLifeDivisionData(
  hydratedValue: unknown,
  tournamentValue: unknown,
): Record<string, unknown> {
  const hydrated = record(hydratedValue);
  const tournamentDivision = record(tournamentValue);
  const hydratedHasCompetitionData =
    records(hydrated.teams).length > 0 || records(hydrated.days).length > 0;
  return hydratedHasCompetitionData ? hydrated : tournamentDivision;
}

function volleyballLifeGender(
  divisionName: string,
): ExternalMatchRecord["genderCategory"] {
  const normalized = divisionName.toLowerCase();
  if (normalized.includes("coed") || normalized.includes("mixed")) {
    return "coed";
  }
  if (normalized.includes("women") || normalized.includes("girls")) {
    return "women";
  }
  if (normalized.includes("men") || normalized.includes("boys")) return "men";
  return undefined;
}

function upsertVolleyballLifePlayer(
  players: Map<string, ExternalPlayerRecord>,
  value: unknown,
): ExternalPlayerRecord | undefined {
  const source = record(value);
  const externalPersonId =
    stringValue(source.playerProfileId) || stringValue(source.id);
  const displayName = stringValue(source.name);
  if (!externalPersonId || !displayName) return undefined;
  const existing = players.get(externalPersonId);
  const next: ExternalPlayerRecord = {
    ...existing,
    externalPersonId,
    displayName: existing?.displayName ?? displayName,
    profileUrl:
      existing?.profileUrl ??
      `https://volleyballlife.com/player/${externalPersonId}`,
    raw: { ...source, ...(existing?.raw ?? {}) },
  };
  players.set(externalPersonId, next);
  return next;
}

export function parseVolleyballLifeMatchFeed(
  playerId: number,
  feedValue: unknown,
  seedPlayer: ExternalPlayerRecord,
): {
  readonly eventCount: number;
  readonly players: readonly ExternalPlayerRecord[];
  readonly matches: readonly ExternalMatchRecord[];
} {
  const targetId = String(playerId);
  const players = new Map<string, ExternalPlayerRecord>([
    [targetId, seedPlayer],
  ]);
  const matches = new Map<string, ExternalMatchRecord>();
  const results = records(record(feedValue).results);

  for (const result of results) {
    const resultPlayerId = stringValue(result.playerId);
    if (resultPlayerId && resultPlayerId !== targetId) continue;
    const tournamentId = stringValue(result.tournamentId);
    const divisionId = stringValue(result.tournamentDivisionId);
    const divisionName = stringValue(result.division);
    const title = stringValue(result.tournament) || "VolleyballLife tournament";
    const target = upsertVolleyballLifePlayer(players, {
      id: targetId,
      name: stringValue(result.playerName) || seedPlayer.displayName,
    });
    if (!target || !tournamentId) continue;

    for (const match of records(result.matches)) {
      const partners = (
        records(match.partners).length > 0
          ? records(match.partners)
          : records(result.partners)
      ).flatMap((partner) => {
        const player = upsertVolleyballLifePlayer(players, partner);
        return player ? [player] : [];
      });
      const opponents = records(match.opponents).flatMap((opponent) => {
        const player = upsertVolleyballLifePlayer(players, opponent);
        return player ? [player] : [];
      });
      // Sand Rating's canonical competition surface is beach doubles.
      // Multi-player formats remain represented by the finish record but are
      // not emitted as 2v2 matches.
      if (partners.length !== 1 || opponents.length !== 2) continue;
      const sets = records(match.sets)
        .map((set) => ({
          a: numberValue(set.teamScore) ?? 0,
          b: numberValue(set.opponentScore) ?? 0,
        }))
        .filter((set) => set.a > 0 || set.b > 0);
      const matchId =
        stringValue(match.matchId) ||
        [
          stringValue(match.type),
          stringValue(match.roundNumber),
          stringValue(match.matchNumber),
          stringValue(match.date),
        ]
          .filter(Boolean)
          .join(":");
      if (!matchId) continue;
      const externalMatchId = `${tournamentId}:${divisionId || "division"}:${matchId}`;
      const winsA = sets.filter((set) => set.a > set.b).length;
      const winsB = sets.filter((set) => set.b > set.a).length;
      const didWin =
        typeof match.didWin === "boolean"
          ? match.didWin
          : winsA === winsB
            ? undefined
            : winsA > winsB;
      matches.set(externalMatchId, {
        externalMatchId,
        externalEventId: tournamentId,
        sourceUrl: `https://volleyballlife.com/event/${tournamentId}`,
        title,
        roundLabel:
          stringValue(match.roundName) ||
          stringValue(match.phase) ||
          stringValue(match.type),
        genderCategory: volleyballLifeGender(divisionName),
        playedAt: stringValue(match.date) || undefined,
        participants: [
          {
            externalPersonId: target.externalPersonId,
            name: target.displayName,
            side: "A",
          },
          {
            externalPersonId: partners[0]!.externalPersonId,
            name: partners[0]!.displayName,
            side: "A",
          },
          ...opponents.map((opponent) => ({
            externalPersonId: opponent.externalPersonId,
            name: opponent.displayName,
            side: "B" as const,
          })),
        ],
        sets,
        winnerSide:
          didWin === undefined ? undefined : didWin ? ("A" as const) : "B",
        raw: {
          tournamentId,
          divisionId,
          divisionName,
          teamId: stringValue(result.teamId),
          match,
        },
      });
    }
  }

  return {
    eventCount: results.length,
    players: [...players.values()],
    matches: [...matches.values()],
  };
}

export async function importVolleyballLifePlayer(
  playerId: string,
  onProgress?: SourceImportProgressHandler,
): Promise<SourceImportResult> {
  const numericId = Number.parseInt(playerId, 10);
  if (!Number.isInteger(numericId) || numericId < 1) {
    throw new SandDataUpstreamError(
      "volleyball-life",
      "not-found",
      "VolleyballLife player ID must be a positive integer.",
    );
  }
  const apiProfileUrl = `${volleyballLifeApi}/playerprofile/${numericId}`;
  const requestedUrl = `${apiProfileUrl}/finishes`;
  const [profileValue, finishesValue] = await Promise.all([
    scrapeJson<unknown>("volleyball-life", apiProfileUrl),
    scrapeJson<unknown>("volleyball-life", requestedUrl),
  ]);
  const profile = record(profileValue);
  const finishes = record(finishesValue);
  const displayName =
    [stringValue(profile.firstName), stringValue(profile.lastName)]
      .filter(Boolean)
      .join(" ") ||
    stringValue(profile.name) ||
    stringValue(finishes.name) ||
    `VolleyballLife player ${numericId}`;
  const hometown = [stringValue(profile.city), stringValue(profile.state)]
    .filter(Boolean)
    .join(", ");
  const players = new Map<string, ExternalPlayerRecord>();
  players.set(String(numericId), {
    externalPersonId: String(numericId),
    displayName,
    profileUrl: `https://volleyballlife.com/player/${numericId}`,
    hometown: hometown || undefined,
    birthDate: parseDate(stringValue(profile.dob)),
    avatarUrl: stringValue(profile.pic) || undefined,
    raw: {
      ...profile,
      finishes,
      apiProfileUrl,
    },
  });

  let truVolley: Record<string, unknown> = {};
  try {
    truVolley = record(
      await scrapeJson<unknown>(
        "volleyball-life",
        `${volleyballLifeApi}/playerprofile/${numericId}/truvolley`,
      ),
    );
  } catch {
    // TruVolley is an optional prior. Match history remains importable.
  }
  const truVolleyInner =
    record(truVolley.truVolley).rating !== undefined
      ? record(truVolley.truVolley)
      : record(truVolley.truvolley).rating !== undefined
        ? record(truVolley.truvolley)
        : record(truVolley.profile).rating !== undefined
          ? record(truVolley.profile)
          : truVolley;
  const current = players.get(String(numericId))!;
  players.set(String(numericId), {
    ...current,
    externalRating:
      numberValue(truVolleyInner.truVolley) ??
      numberValue(truVolleyInner.truvolley) ??
      numberValue(truVolleyInner.rating) ??
      numberValue(truVolleyInner.score) ??
      numberValue(truVolleyInner.currentRating),
    externalRatingConfidence:
      numberValue(truVolleyInner.confidence) ??
      numberValue(truVolleyInner.reliability),
    externalMatchCount:
      numberValue(truVolleyInner.matches) ??
      numberValue(truVolleyInner.matchesPlayed),
    raw: { ...current.raw, truVolley, apiProfileUrl },
  });

  const tournamentFinishes = records(finishes.tournaments);
  await onProgress?.({
    phase: "profile-found",
    current: 0,
    total: tournamentFinishes.length,
    matchesFound: 0,
    profilesFound: players.size,
  });
  await onProgress?.({
    phase: "fetching-match-history",
    current: 0,
    total: tournamentFinishes.length,
    matchesFound: 0,
    profilesFound: players.size,
  });
  const feed = await scrapeJson<unknown>(
    "volleyball-life",
    `${volleyballLifeApi}/playerprofile/feed/matches`,
    {
      method: "POST",
      body: {
        playerIds: [numericId],
        tournamentIds: tournamentFinishes.flatMap((finish) => {
          const tournamentId = numberValue(finish.id);
          return tournamentId === undefined ? [] : [tournamentId];
        }),
      },
    },
  );
  const parsedFeed = parseVolleyballLifeMatchFeed(
    numericId,
    feed,
    players.get(String(numericId))!,
  );
  await onProgress?.({
    phase: "reading-match-history",
    current: parsedFeed.eventCount,
    total: tournamentFinishes.length,
    matchesFound: parsedFeed.matches.length,
    profilesFound: parsedFeed.players.length,
  });
  return {
    source: "volleyball-life",
    requestedUrl,
    players: parsedFeed.players,
    matches: parsedFeed.matches,
    checkpoint: {
      tournaments: tournamentFinishes.length,
      matchFeedEvents: parsedFeed.eventCount,
      truVolley: Object.keys(truVolley).length > 0,
    },
  };
}

function fivbUnavailable(html: string): boolean {
  return (
    html.includes("One moment, please") ||
    html.includes("Please wait while your request is being verified")
  );
}

function fivbSection(html: string, id: string): string {
  const start = html.indexOf(`id="${id}"`);
  if (start < 0) return "";
  const nextHeading = html.indexOf("<h4", start + 10);
  const nextBreak = html.indexOf("<br><h", start + 10);
  return html.slice(
    start,
    [nextHeading, nextBreak, html.length]
      .filter((candidate) => candidate > start)
      .sort((a, b) => a - b)[0],
  );
}

function fivbTeam(cell: string): {
  readonly players: readonly ExternalPlayerRecord[];
  readonly countryCode?: string;
} {
  const linked = [
    ...cell.matchAll(/<a href="[^"]*player_id=(\d+)[^"]*">([^<]+)<\/a>/gi),
  ];
  const countryCode = stripHtml(cell).match(
    /([A-Z]{3})(?:\s*\[\d+\])?\s*$/,
  )?.[1];
  return {
    players: linked.slice(0, 2).map((entry) => ({
      externalPersonId: entry[1] ?? "",
      displayName: entry[2]?.trim() ?? "Unknown player",
      profileUrl: `${fivbBase}/player?player_id=${entry[1]}`,
      countryCode,
      isProfessional: true,
      raw: {},
    })),
    countryCode,
  };
}

export interface FivbTeamEntry {
  readonly externalTeamId: string;
  readonly list: "main-draw" | "qualification" | "reserve" | "withdrawn";
  readonly label: string;
  readonly seed?: number;
  readonly entryPoints?: number;
  readonly entryTechnicalPoints?: number;
  readonly seedPoints?: number;
  readonly seedTechnicalPoints?: number;
  readonly countryCode?: string;
  readonly entryTag?: string;
  readonly players: readonly {
    readonly externalPersonId: string;
    readonly displayName: string;
  }[];
}

function parseFivbTeamEntrySection(
  html: string,
  list: FivbTeamEntry["list"],
): readonly FivbTeamEntry[] {
  const entries: FivbTeamEntry[] = [];
  for (const rowMatch of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const rowCells = pageCells(rowMatch[1] ?? "");
    const withdrawn = list === "withdrawn";
    if (rowCells.length < (withdrawn ? 6 : 10)) continue;
    const playerCells = withdrawn
      ? [rowCells[3] ?? "", rowCells[4] ?? ""]
      : [rowCells[5] ?? "", rowCells[6] ?? ""];
    const players = playerCells.flatMap((cell) => {
      const link = cell.match(
        /<a[^>]*href="[^"]*player_id=(\d+)[^"]*"[^>]*>([^<]+)<\/a>/i,
      );
      const displayName = stripHtml(link?.[2] ?? cell);
      return displayName
        ? [
            {
              externalPersonId:
                link?.[1] ??
                hashValue(
                  `${list}:${normalizePersonName(displayName)}:${entries.length}`,
                ),
              displayName,
            },
          ]
        : [];
    });
    if (players.length < 2) continue;
    const label = stripHtml(
      rowCells[withdrawn ? 2 : 3] ??
        players.map((player) => player.displayName).join("/"),
    );
    const countryCode = compactFederationCode(
      stripHtml(rowCells[withdrawn ? 5 : 7] ?? ""),
    );
    const seed = withdrawn
      ? undefined
      : numberValue(stripHtml(rowCells[2] ?? ""));
    entries.push({
      externalTeamId:
        players
          .map((player) => player.externalPersonId)
          .sort()
          .join(":") || hashValue(`${list}:${label}`),
      list,
      label: label || players.map((player) => player.displayName).join(" / "),
      ...(seed !== undefined ? { seed: Math.floor(seed) } : {}),
      ...(numberValue(stripHtml(rowCells[0] ?? "")) !== undefined
        ? { entryPoints: numberValue(stripHtml(rowCells[0] ?? "")) }
        : {}),
      ...(numberValue(stripHtml(rowCells[1] ?? "")) !== undefined
        ? {
            entryTechnicalPoints: numberValue(stripHtml(rowCells[1] ?? "")),
          }
        : {}),
      ...(!withdrawn && numberValue(stripHtml(rowCells[9] ?? "")) !== undefined
        ? { seedPoints: numberValue(stripHtml(rowCells[9] ?? "")) }
        : {}),
      ...(!withdrawn && numberValue(stripHtml(rowCells[10] ?? "")) !== undefined
        ? {
            seedTechnicalPoints: numberValue(stripHtml(rowCells[10] ?? "")),
          }
        : {}),
      ...(countryCode ? { countryCode } : {}),
      ...(stripHtml(rowCells[withdrawn ? 6 : 4] ?? "")
        ? { entryTag: stripHtml(rowCells[withdrawn ? 6 : 4] ?? "") }
        : {}),
      players,
    });
  }
  return entries;
}

export function parseFivbTeamEntries(html: string): readonly FivbTeamEntry[] {
  return [
    ...parseFivbTeamEntrySection(fivbSection(html, "teams_md"), "main-draw"),
    ...parseFivbTeamEntrySection(
      fivbSection(html, "teams_qu"),
      "qualification",
    ),
    ...parseFivbTeamEntrySection(fivbSection(html, "teams_res"), "reserve"),
    ...parseFivbTeamEntrySection(fivbSection(html, "teams_with"), "withdrawn"),
  ];
}

export function parseFivbPagePlayers(
  html: string,
): readonly ExternalPlayerRecord[] {
  const players = new Map<string, ExternalPlayerRecord>();
  for (const match of html.matchAll(
    /<a[^>]*href="[^"]*player_id=(\d+)[^"]*"[^>]*>([^<]+)<\/a>/gi,
  )) {
    const externalPersonId = match[1] ?? "";
    const displayName = stripHtml(match[2] ?? "");
    if (!externalPersonId || !displayName) continue;
    const existing = players.get(externalPersonId);
    const existingScore = existing
      ? existing.displayName.length +
        (existing.displayName.includes(" ") ? 100 : 0)
      : -1;
    const nextScore =
      displayName.length + (displayName.includes(" ") ? 100 : 0);
    if (!existing || nextScore > existingScore) {
      players.set(externalPersonId, {
        externalPersonId,
        displayName,
        profileUrl: `${fivbBase}/player?player_id=${externalPersonId}`,
        isProfessional: true,
        raw: {},
      });
    }
  }
  return [...players.values()];
}

function parseFivbMatchRows(
  html: string,
  eventId: string,
  title: string,
  year: string,
  genderCategory: "men" | "women",
): {
  readonly players: readonly ExternalPlayerRecord[];
  readonly matches: readonly ExternalMatchRecord[];
} {
  const players = new Map<string, ExternalPlayerRecord>();
  const matches: ExternalMatchRecord[] = [];
  let roundLabel = "";
  for (const rowMatch of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = pageCells(rowMatch[1] ?? "");
    if (cells.length === 1) {
      roundLabel = stripHtml(cells[0] ?? "") || roundLabel;
      continue;
    }
    if (cells.length < 7) continue;
    const matchNumber = Number.parseInt(stripHtml(cells[0] ?? ""), 10);
    if (!Number.isInteger(matchNumber)) continue;
    const teamA = fivbTeam(cells[4] ?? "");
    const teamB = fivbTeam(cells[5] ?? "");
    if (teamA.players.length < 2 || teamB.players.length < 2) continue;
    for (const player of [...teamA.players, ...teamB.players]) {
      players.set(player.externalPersonId, player);
    }
    const scoreText = stripHtml(cells[6] ?? "");
    const scoreGroup = scoreText.match(/\(([^)]+)\)/)?.[1] ?? scoreText;
    const sets = [...scoreGroup.matchAll(/(\d+)-(\d+)/g)].map((set) => ({
      a: Number.parseInt(set[1] ?? "0", 10),
      b: Number.parseInt(set[2] ?? "0", 10),
    }));
    const dateText = stripHtml(cells[1] ?? "");
    const dateMatch = dateText.match(/(\d+)-([A-Za-z]+)/);
    const monthByName: Readonly<Record<string, string>> = {
      Jan: "01",
      Feb: "02",
      Mar: "03",
      Apr: "04",
      May: "05",
      Jun: "06",
      Jul: "07",
      Aug: "08",
      Sep: "09",
      Oct: "10",
      Nov: "11",
      Dec: "12",
    };
    const date =
      dateMatch && monthByName[dateMatch[2] ?? ""]
        ? `${year}-${monthByName[dateMatch[2] ?? ""]}-${(dateMatch[1] ?? "1").padStart(2, "0")}`
        : undefined;
    const aBold = (cells[4] ?? "").includes("<b>");
    const bBold = (cells[5] ?? "").includes("<b>");
    const setWinsA = sets.filter((set) => set.a > set.b).length;
    const setWinsB = sets.filter((set) => set.b > set.a).length;
    const winnerSide =
      aBold || setWinsA > setWinsB
        ? "A"
        : bBold || setWinsB > setWinsA
          ? "B"
          : undefined;
    matches.push({
      externalMatchId: `${eventId}:${matchNumber}`,
      externalEventId: eventId,
      sourceUrl: `${fivbBase}/scripts/tournament.php?tcode=${eventId}`,
      title,
      roundLabel,
      location: title,
      genderCategory,
      playedAt: date ? `${date}T12:00:00.000Z` : undefined,
      participants: [
        ...teamA.players.map((player) => ({
          externalPersonId: player.externalPersonId,
          name: player.displayName,
          side: "A" as const,
        })),
        ...teamB.players.map((player) => ({
          externalPersonId: player.externalPersonId,
          name: player.displayName,
          side: "B" as const,
        })),
      ],
      sets,
      winnerSide,
      raw: {
        matchNumber,
        time: stripHtml(cells[2] ?? ""),
        court: stripHtml(cells[3] ?? ""),
        score: scoreText,
      },
    });
  }
  return { players: [...players.values()], matches };
}

export async function importFivbTournament(
  urlOrTcode: string,
): Promise<SourceImportResult> {
  const tcode =
    urlOrTcode.match(/[?&]tcode=([A-Z0-9]+)/i)?.[1] ??
    urlOrTcode.trim().toUpperCase();
  if (!/^[A-Z0-9]+$/.test(tcode)) {
    throw new SandDataUpstreamError(
      "fivb-12ndr",
      "not-found",
      "Use a valid fivb.12ndr tournament URL or tcode.",
    );
  }
  const requestedUrl = `${fivbBase}/scripts/tournament.php?tcode=${tcode}`;
  const { html, engine } = await scrapeHtml("fivb-12ndr", requestedUrl, {
    waitForMs: 2_500,
    timeoutMs: 90_000,
    proxy: "auto",
  });
  if (fivbUnavailable(html)) {
    throw new SandDataUpstreamError(
      "fivb-12ndr",
      "blocked",
      "FIVB returned its anti-bot interstitial; stored event state was not changed.",
    );
  }
  const titleMatch = html.match(/<h3[^>]*>([^<]+)\s*\(([^)]+)\)<\/h3>/i);
  if (!titleMatch) {
    throw new SandDataUpstreamError(
      "fivb-12ndr",
      "invalid-response",
      "The FIVB page no longer matched the documented tournament structure.",
    );
  }
  const title = titleMatch[1]?.trim() ?? tcode;
  const dateParts = titleMatch[2]?.match(
    /(\d{2})\.(\d{2})\.\s*-\s*(\d{2})\.(\d{2})\.(\d{4})/,
  );
  const year = dateParts?.[5] ?? String(new Date().getUTCFullYear());
  const startsOn = dateParts
    ? `${year}-${dateParts[2]}-${dateParts[1]}`
    : undefined;
  const endsOn = dateParts
    ? `${year}-${dateParts[4]}-${dateParts[3]}`
    : undefined;
  const genderCategory = tcode.startsWith("W") ? "women" : "men";
  const category = html
    .match(/<td>([^<]*(?:Pro Tour|Elite|Challenge|Futures)[^<]*)<\/td>/i)?.[1]
    ?.trim();
  const countryName = html
    .match(
      /<td>(?:Pro Tour|Elite|Challenge|Futures)[^<]*<\/td>\s*<td>([^<]+)<\/td>/i,
    )?.[1]
    ?.trim();
  const countryCode = compactFederationCode(countryName ?? "");
  const main = parseFivbMatchRows(
    fivbSection(html, "results_md"),
    tcode,
    title,
    year,
    genderCategory,
  );
  const qualification = parseFivbMatchRows(
    fivbSection(html, "results_qu"),
    tcode,
    title,
    year,
    genderCategory,
  );
  const players = new Map(
    [...main.players, ...qualification.players].map((player) => [
      player.externalPersonId,
      player,
    ]),
  );
  for (const pagePlayer of parseFivbPagePlayers(html)) {
    const existing = players.get(pagePlayer.externalPersonId);
    players.set(pagePlayer.externalPersonId, {
      ...pagePlayer,
      countryCode: existing?.countryCode ?? pagePlayer.countryCode,
      raw: existing?.raw ?? pagePlayer.raw,
    });
  }
  const teamEntries = parseFivbTeamEntries(html).map((entry) => ({
    ...entry,
    players: entry.players.map((player) => ({
      ...player,
      displayName:
        players.get(player.externalPersonId)?.displayName ?? player.displayName,
    })),
  }));
  for (const entry of teamEntries) {
    for (const entryPlayer of entry.players) {
      const existing = players.get(entryPlayer.externalPersonId);
      if (!existing) {
        players.set(entryPlayer.externalPersonId, {
          externalPersonId: entryPlayer.externalPersonId,
          displayName: entryPlayer.displayName,
          profileUrl: `${fivbBase}/player?player_id=${entryPlayer.externalPersonId}`,
          countryCode: entry.countryCode,
          isProfessional: true,
          raw: {},
        });
      } else if (!existing.countryCode && entry.countryCode) {
        players.set(entryPlayer.externalPersonId, {
          ...existing,
          countryCode: entry.countryCode,
        });
      }
    }
  }
  const enrichParticipants = (match: ExternalMatchRecord) => ({
    ...match,
    participants: match.participants.map((participant) => ({
      ...participant,
      name:
        players.get(participant.externalPersonId)?.displayName ??
        participant.name,
    })),
  });
  const today = new Date().toISOString().slice(0, 10);
  const completed =
    Boolean(endsOn && endsOn < today) &&
    html.includes('id="ranking"') &&
    main.matches.some((match) => match.winnerSide);
  const live = Boolean(
    startsOn && startsOn <= today && (!endsOn || endsOn >= today) && !completed,
  );
  const eventInfoCells = pageCells(
    html.match(
      /<table[^>]*data-card-view="true"[^>]*>([\s\S]*?)<\/table>/i,
    )?.[1] ?? "",
  );
  const advertisedTeamCount = Number.parseInt(
    stripHtml(eventInfoCells[3] ?? ""),
    10,
  );
  const event: ProfessionalEventRecord = {
    externalEventId: tcode,
    sourceUrl: requestedUrl,
    name: title,
    location: countryName,
    countryCode,
    category,
    genderCategory,
    startsOn,
    endsOn,
    status: completed ? "completed" : live ? "live" : "upcoming",
    live,
    teamCount:
      advertisedTeamCount ||
      teamEntries.filter((entry) => entry.list === "main-draw").length,
    matchCount: main.matches.length + qualification.matches.length,
    raw: {
      tcode,
      engine,
      detailLevel: "tournament",
      countryName,
      advertisedTeamCount: advertisedTeamCount || undefined,
      teamEntries,
    },
  };
  return {
    source: "fivb-12ndr",
    requestedUrl,
    players: [...players.values()],
    matches: [
      ...main.matches.map(enrichParticipants),
      ...qualification.matches.map(enrichParticipants),
    ],
    events: [event],
    checkpoint: { tcode, engine, completed },
  };
}

export function parseFivbEventIndexHtml(
  html: string,
  season: number,
  today = new Date().toISOString().slice(0, 10),
): readonly ProfessionalEventRecord[] {
  const events: ProfessionalEventRecord[] = [];
  for (const tableMatch of html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)) {
    const table = tableMatch[0];
    if (
      !table.includes('data-field="Name"') ||
      !table.includes('data-field="Men"') ||
      !table.includes('data-field="Women"')
    ) {
      continue;
    }
    for (const rowMatch of table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = pageCells(rowMatch[1] ?? "");
      if (cells.length < 5) continue;
      const category = stripHtml(cells[0] ?? "");
      const name = stripHtml(cells[1] ?? "");
      const countryName = stripHtml(cells[4] ?? "");
      const countryCode = compactFederationCode(countryName);
      const addGender = (cell: string, genderCategory: "men" | "women") => {
        const link = cell.match(
          /<a[^>]*href="([^"]*tcode=([A-Z0-9]+)[^"]*)"[^>]*>([^<]+)<\/a>/i,
        );
        if (!link) return;
        const dateRange = stripHtml(link[3] ?? "").match(
          /(\d{2})\.(\d{2})\.\s*-\s*(\d{2})\.(\d{2})\./,
        );
        const startsOn = dateRange
          ? `${season}-${dateRange[2]}-${dateRange[1]}`
          : undefined;
        const endsOn = dateRange
          ? `${season}-${dateRange[4]}-${dateRange[3]}`
          : undefined;
        const completed = Boolean(endsOn && endsOn < today);
        const live = Boolean(
          startsOn && startsOn <= today && (!endsOn || endsOn >= today),
        );
        events.push({
          externalEventId: link[2] ?? "",
          sourceUrl: `${fivbBase}/scripts/tournament.php?tcode=${link[2]}`,
          name,
          location: countryName,
          countryCode,
          category,
          genderCategory,
          startsOn,
          endsOn,
          status: completed ? "completed" : live ? "live" : "upcoming",
          live,
          teamCount: 0,
          matchCount: 0,
          raw: { countryName, detailLevel: "index" },
        });
      };
      addGender(cells[2] ?? "", "men");
      addGender(cells[3] ?? "", "women");
    }
  }
  return events;
}

export async function listFivbEvents(
  season = new Date().getUTCFullYear(),
): Promise<readonly ProfessionalEventRecord[]> {
  const requestedUrl = `${fivbBase}/?season=${season}&international=fivb`;
  const { html } = await scrapeHtml("fivb-12ndr", requestedUrl, {
    waitForMs: 2_500,
    timeoutMs: 90_000,
    proxy: "auto",
  });
  if (fivbUnavailable(html)) {
    throw new SandDataUpstreamError(
      "fivb-12ndr",
      "blocked",
      "FIVB returned its anti-bot interstitial.",
    );
  }
  return parseFivbEventIndexHtml(html, season);
}

interface VolleyballWorldPage {
  readonly date?: string;
  readonly teams?: readonly Record<string, unknown>[];
}

export async function importWorldRankings(
  count = 250,
): Promise<SourceImportResult> {
  const rankings: WorldRankingRecord[] = [];
  const players = new Map<string, ExternalPlayerRecord>();
  for (const [genderIndex, genderCategory] of [
    [0, "men"],
    [1, "women"],
  ] as const) {
    for (let page = 0; page < Math.ceil(count / 50); page += 1) {
      const response = await scrapeJson<VolleyballWorldPage>(
        "volleyball-world",
        `${volleyballWorldApi}/${genderIndex}/${page}/50`,
      );
      const teams = response.teams ?? [];
      for (const team of teams) {
        const rank =
          numberValue(team.rankToDisplay) ?? numberValue(team.rank) ?? 0;
        if (rank < 1) continue;
        const points = numberValue(team.points) ?? 0;
        const countryCode =
          stringValue(team.federationCode) ||
          stringValue(team.confederationCode);
        for (const name of [
          stringValue(team.player1Name),
          stringValue(team.player2Name),
        ]) {
          if (!name) continue;
          const externalPersonId = `${normalizePersonName(name)}:${countryCode.toLowerCase()}`;
          rankings.push({
            rankingDate:
              parseDate(stringValue(response.date)) ??
              new Date().toISOString().slice(0, 10),
            genderCategory,
            rank,
            points,
            externalPersonId,
            displayName: name,
            countryCode,
            previousRank:
              typeof team.trend === "number" && team.trend !== 0
                ? rank + team.trend
                : undefined,
            raw: team,
          });
          players.set(externalPersonId, {
            externalPersonId,
            displayName: name,
            countryCode,
            avatarUrl: stringValue(team.flagUrl) || undefined,
            isProfessional: true,
            raw: team,
          });
        }
      }
      if (teams.length < 50) break;
    }
  }
  return {
    source: "volleyball-world",
    requestedUrl: volleyballWorldApi,
    players: [...players.values()],
    matches: [],
    rankings,
    checkpoint: {
      records: rankings.length,
      rankingDates: [
        ...new Set(rankings.map((ranking) => ranking.rankingDate)),
      ],
    },
  };
}
