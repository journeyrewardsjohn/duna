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

const volleyballLifeApi =
  "https://volleyballlife-api-dot-net-8.azurewebsites.net";
const fivbBase = "https://fivb.12ndr.at";
const volleyballWorldApi =
  "https://en.volleyballworld.com/api/v1/worldranking/beachvolleyball";

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
  }
  return {
    source: "bvbinfo",
    requestedUrl,
    players: [...players.values()],
    matches,
    checkpoint: { pages: pages.size, engine: first.engine },
  };
}

function findVolleyballLifeDivision(
  tournament: Record<string, unknown>,
  divisionName: string,
): string | undefined {
  const target = normalizePersonName(divisionName);
  return records(tournament.divisions)
    .map((division) => {
      const divisionInfo = record(division.division);
      const genderInfo = record(division.gender);
      const candidates = [
        stringValue(division._Name),
        `${stringValue(genderInfo.name)} ${stringValue(divisionInfo.name)}`,
        stringValue(divisionInfo.name),
      ].map(normalizePersonName);
      return {
        id: stringValue(division.id),
        score: candidates.includes(target)
          ? 2
          : candidates.some(
                (candidate) =>
                  candidate.includes(target) || target.includes(candidate),
              )
            ? 1
            : 0,
      };
    })
    .sort((a, b) => b.score - a.score)
    .find((candidate) => candidate.score > 0)?.id;
}

function collectVolleyballLifeMatches(
  value: unknown,
  output: Record<string, unknown>[],
): void {
  if (Array.isArray(value)) {
    for (const item of value) collectVolleyballLifeMatches(item, output);
    return;
  }
  const valueRecord = record(value);
  if (Object.keys(valueRecord).length === 0 || output.includes(valueRecord)) {
    return;
  }
  if (
    valueRecord.homeTeam &&
    valueRecord.awayTeam &&
    Array.isArray(valueRecord.games)
  ) {
    output.push(valueRecord);
  }
  for (const child of Object.values(valueRecord)) {
    if (child && typeof child === "object") {
      collectVolleyballLifeMatches(child, output);
    }
  }
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

export async function importVolleyballLifePlayer(
  playerId: string,
): Promise<SourceImportResult> {
  const numericId = Number.parseInt(playerId, 10);
  if (!Number.isInteger(numericId) || numericId < 1) {
    throw new SandDataUpstreamError(
      "volleyball-life",
      "not-found",
      "VolleyballLife player ID must be a positive integer.",
    );
  }
  const requestedUrl = `${volleyballLifeApi}/playerprofile/${numericId}/finishes`;
  const finishes = record(
    await scrapeJson<unknown>("volleyball-life", requestedUrl),
  );
  const displayName =
    stringValue(finishes.name) || `VolleyballLife player ${numericId}`;
  const players = new Map<string, ExternalPlayerRecord>();
  players.set(String(numericId), {
    externalPersonId: String(numericId),
    displayName,
    profileUrl: `https://volleyballlife.com/playerprofile/${numericId}`,
    raw: finishes,
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
    record(truVolley.truvolley).rating !== undefined
      ? record(truVolley.truvolley)
      : record(truVolley.profile).rating !== undefined
        ? record(truVolley.profile)
        : truVolley;
  const current = players.get(String(numericId))!;
  players.set(String(numericId), {
    ...current,
    externalRating:
      numberValue(truVolleyInner.rating) ??
      numberValue(truVolleyInner.score) ??
      numberValue(truVolleyInner.currentRating),
    externalRatingConfidence:
      numberValue(truVolleyInner.confidence) ??
      numberValue(truVolleyInner.reliability),
    externalMatchCount:
      numberValue(truVolleyInner.matches) ??
      numberValue(truVolleyInner.matchesPlayed),
    raw: { ...current.raw, truVolley },
  });

  const matches: ExternalMatchRecord[] = [];
  for (const finish of records(finishes.tournaments)) {
    const tournamentId = stringValue(finish.id);
    const divisionName = stringValue(finish.division);
    const teamId = stringValue(finish.teamId);
    if (!tournamentId || !divisionName || !teamId) continue;
    const tournament = record(
      await scrapeJson<unknown>(
        "volleyball-life",
        `${volleyballLifeApi}/tournament/${tournamentId}`,
      ),
    );
    const divisionId = findVolleyballLifeDivision(tournament, divisionName);
    if (!divisionId) continue;
    const tournamentDivision = records(tournament.divisions).find(
      (division) => stringValue(division.id) === divisionId,
    );
    if (
      tournamentDivision &&
      numberValue(tournamentDivision.numOfPlayers) !== undefined &&
      numberValue(tournamentDivision.numOfPlayers) !== 2
    ) {
      continue;
    }
    const hydratedDivision = record(
      await scrapeJson<unknown>(
        "volleyball-life",
        `${volleyballLifeApi}/division/${divisionId}/hydrate`,
      ),
    );
    const division = selectVolleyballLifeDivisionData(
      hydratedDivision,
      tournamentDivision,
    );
    const teamById = new Map<
      string,
      { readonly name: string; readonly players: ExternalPlayerRecord[] }
    >();
    for (const team of records(division.teams)) {
      const id = stringValue(team.id);
      const teamPlayers = records(team.players).flatMap((entry) => {
        const externalPersonId =
          stringValue(entry.playerProfileId) || stringValue(entry.id);
        const name = stringValue(entry.name);
        if (!externalPersonId || !name) return [];
        const playerRecord: ExternalPlayerRecord = {
          externalPersonId,
          displayName: name,
          profileUrl: `https://volleyballlife.com/playerprofile/${externalPersonId}`,
          raw: entry,
        };
        players.set(externalPersonId, playerRecord);
        return [playerRecord];
      });
      if (id) {
        teamById.set(id, {
          name: stringValue(team.name),
          players: teamPlayers,
        });
      }
    }
    const discovered: Record<string, unknown>[] = [];
    collectVolleyballLifeMatches(division, discovered);
    for (const discoveredMatch of discovered) {
      const homeTeam = record(discoveredMatch.homeTeam);
      const awayTeam = record(discoveredMatch.awayTeam);
      const homeId = stringValue(homeTeam.teamId);
      const awayId = stringValue(awayTeam.teamId);
      if (homeId !== teamId && awayId !== teamId) continue;
      const home = teamById.get(homeId);
      const away = teamById.get(awayId);
      if (
        !home ||
        !away ||
        home.players.length < 2 ||
        away.players.length < 2
      ) {
        continue;
      }
      const sets = records(discoveredMatch.games)
        .map((game) => ({
          a: numberValue(game.home) ?? 0,
          b: numberValue(game.away) ?? 0,
        }))
        .filter((set) => set.a > 0 || set.b > 0);
      if (sets.length === 0) continue;
      const homeWins = sets.filter((set) => set.a > set.b).length;
      const awayWins = sets.filter((set) => set.b > set.a).length;
      const matchNumber =
        stringValue(discoveredMatch.id) ||
        stringValue(discoveredMatch.number) ||
        hashValue(JSON.stringify(discoveredMatch)).slice(0, 20);
      const eventDate =
        parseDate(stringValue(finish.date)) ??
        parseDate(stringValue(tournament.startDate));
      matches.push({
        externalMatchId: `${tournamentId}:${divisionId}:${matchNumber}`,
        externalEventId: tournamentId,
        sourceUrl: `https://volleyballlife.com/tournament/${tournamentId}`,
        title:
          stringValue(finish.tournament) ||
          stringValue(tournament.name) ||
          "VolleyballLife event",
        roundLabel:
          stringValue(discoveredMatch.roundName) ||
          stringValue(discoveredMatch.round),
        location:
          stringValue(tournament.location) || stringValue(tournament.city),
        playedAt: eventDate ? `${eventDate}T12:00:00.000Z` : undefined,
        participants: [
          ...home.players.slice(0, 2).map((participant) => ({
            externalPersonId: participant.externalPersonId,
            name: participant.displayName,
            side: "A" as const,
          })),
          ...away.players.slice(0, 2).map((participant) => ({
            externalPersonId: participant.externalPersonId,
            name: participant.displayName,
            side: "B" as const,
          })),
        ],
        sets,
        winnerSide: homeWins > awayWins ? "A" : "B",
        raw: {
          tournamentId,
          divisionId,
          finish: stringValue(finish.finish),
          match: discoveredMatch,
        },
      });
    }
  }
  return {
    source: "volleyball-life",
    requestedUrl,
    players: [...players.values()],
    matches,
    checkpoint: {
      tournaments: records(finishes.tournaments).length,
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
    teamCount: players.size / 2,
    matchCount: main.matches.length + qualification.matches.length,
    raw: { tcode, engine, countryName },
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
          raw: { countryName },
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
