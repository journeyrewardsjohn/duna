import { z } from "zod";
import { scrapeHtml } from "./http";
import { hashValue, normalizePersonName } from "./normalize";
import {
  SandDataUpstreamError,
  type ExternalMatchRecord,
  type ExternalPlayerRecord,
  type ProfessionalEventRecord,
  type SourceImportResult,
} from "./types";

const avpLeagueUrl = "https://avp.com/league/";
const defaultAvpGatewayModel = "openai/gpt-5.6-luna";

const standingSchema = z.object({
  rank: z.number().int().nonnegative(),
  teamName: z.string().trim().min(1),
  matchesPlayed: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  matchPoints: z.number().int().nonnegative(),
  winPercentage: z.number().min(0).max(100),
});

const rosterSchema = standingSchema.extend({
  gender: z.enum(["men", "women"]),
  playerNames: z.array(z.string().trim().min(1)).max(6),
});

const avpMatchSchema = z.object({
  dateText: z.string(),
  venue: z.string(),
  gender: z.enum(["men", "women"]),
  teamA: z.string().trim().min(1),
  teamB: z.string().trim().min(1),
  sets: z.array(
    z.object({
      a: z.number().int().nonnegative(),
      b: z.number().int().nonnegative(),
    }),
  ),
  winnerSide: z.enum(["A", "B", ""]),
});

const weekSchema = z.object({
  weekNumber: z.number().int().min(1).max(30),
  locationLabel: z.string().trim().min(1),
  matches: z.array(avpMatchSchema),
});

const snapshotSchema = z.object({
  season: z.number().int().min(2000).max(2100),
  cityStandings: z.array(standingSchema),
  rosters: z.array(rosterSchema),
  weeks: z.array(weekSchema),
});

export type AvpLeagueSnapshot = z.infer<typeof snapshotSchema>;
export type AvpRoster = z.infer<typeof rosterSchema>;

function stripHtml(value: string): string {
  return value
    .replaceAll(/<script[\s\S]*?<\/script>/gi, " ")
    .replaceAll(/<style[\s\S]*?<\/style>/gi, " ")
    .replaceAll(/<[^>]+>/g, " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&#8211;", "–")
    .replaceAll("&#8212;", "—")
    .replaceAll("&#8217;", "’")
    .replaceAll("&nbsp;", " ")
    .replaceAll(/\s+/g, " ")
    .trim();
}

function cells(row: string): readonly string[] {
  return [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(
    (match) => match[1] ?? "",
  );
}

function number(value: string): number {
  const parsed = Number.parseFloat(stripHtml(value).replace("%", ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function tableBodies(html: string, className: string): readonly string[] {
  return [...html.matchAll(/<table([^>]*)>([\s\S]*?)<\/table>/gi)]
    .filter((match) =>
      new RegExp(`\\b${className}\\b`, "i").test(match[1] ?? ""),
    )
    .map((match) => match[2] ?? "");
}

function parseStandingRows(
  table: string,
): readonly z.infer<typeof standingSchema>[] {
  const rows: z.infer<typeof standingSchema>[] = [];
  for (const match of table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const rowCells = cells(match[1] ?? "");
    const rank = Number.parseInt(stripHtml(rowCells[0] ?? ""), 10);
    const teamName = stripHtml(rowCells[1] ?? "");
    if (!Number.isInteger(rank) || !teamName) continue;
    rows.push({
      rank,
      teamName,
      matchesPlayed: number(rowCells[2] ?? ""),
      wins: number(rowCells[3] ?? ""),
      losses: number(rowCells[4] ?? ""),
      matchPoints: number(rowCells[5] ?? ""),
      winPercentage: number(rowCells[6] ?? ""),
    });
  }
  return rows;
}

function rosterFromStanding(
  standing: z.infer<typeof standingSchema>,
  gender: "men" | "women",
): AvpRoster {
  const roster = standing.teamName.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  return {
    ...standing,
    teamName: roster?.[1]?.trim() || standing.teamName,
    gender,
    playerNames: (roster?.[2] ?? "")
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean),
  };
}

function parseWeekMatches(
  table: string,
): AvpLeagueSnapshot["weeks"][number]["matches"] {
  const rows = [...table.matchAll(/<tr([^>]*)>([\s\S]*?)<\/tr>/gi)]
    .map((match) => ({
      attributes: match[1] ?? "",
      body: match[2] ?? "",
      cells: cells(match[2] ?? ""),
    }))
    .filter(
      (row) =>
        row.cells.length >= 7 &&
        stripHtml(row.cells[3] ?? "") &&
        stripHtml(row.cells[0] ?? "").toLowerCase() !== "date",
    );
  const matches: AvpLeagueSnapshot["weeks"][number]["matches"][number][] = [];
  for (let index = 0; index + 1 < rows.length; index += 2) {
    const top = rows[index];
    const bottom = rows[index + 1];
    if (!top || !bottom) continue;
    const teamA = stripHtml(top.cells[3] ?? "");
    const teamB = stripHtml(bottom.cells[3] ?? "");
    if (!teamA || !teamB) continue;
    const sets = [4, 5, 6].flatMap((cellIndex) => {
      const aText = stripHtml(top.cells[cellIndex] ?? "");
      const bText = stripHtml(bottom.cells[cellIndex] ?? "");
      if (!/^\d+$/.test(aText) || !/^\d+$/.test(bText)) return [];
      return [{ a: Number.parseInt(aText, 10), b: Number.parseInt(bText, 10) }];
    });
    const topWinner = /league__match-team--winner/i.test(top.body);
    const bottomWinner = /league__match-team--winner/i.test(bottom.body);
    const genderText = stripHtml(top.cells[2] ?? "").toLowerCase();
    matches.push({
      dateText: stripHtml(top.cells[0] ?? ""),
      venue: stripHtml(top.cells[1] ?? ""),
      gender:
        genderText === "f" || genderText === "w" || genderText.includes("women")
          ? "women"
          : "men",
      teamA,
      teamB,
      sets,
      winnerSide: topWinner ? "A" : bottomWinner ? "B" : "",
    });
  }
  return matches;
}

export function parseAvpLeagueHtml(
  html: string,
  fallbackSeason = new Date().getUTCFullYear(),
): AvpLeagueSnapshot {
  const season =
    Number.parseInt(
      stripHtml(
        html.match(/<h1[^>]*>([\s\S]*?\b20\d{2}\b[\s\S]*?)<\/h1>/i)?.[1] ?? "",
      ).match(/\b(20\d{2})\b/)?.[1] ?? "",
      10,
    ) || fallbackSeason;
  const leaderboardTables = tableBodies(html, "league__leaderboard-table");
  const cityStandings = parseStandingRows(leaderboardTables[0] ?? "");
  const rosters = [
    ...parseStandingRows(leaderboardTables[1] ?? "").map((standing) =>
      rosterFromStanding(standing, "women"),
    ),
    ...parseStandingRows(leaderboardTables[2] ?? "").map((standing) =>
      rosterFromStanding(standing, "men"),
    ),
  ];
  const headings = [
    ...html.matchAll(
      /<h3[^>]*>([\s\S]*?Week\s*(\d+)\s*[-–—]\s*[\s\S]*?)<\/h3>/gi,
    ),
  ].map((match) => ({
    weekNumber: Number.parseInt(match[2] ?? "0", 10),
    locationLabel: stripHtml(match[1] ?? "").replace(
      /^\s*Week\s*\d+\s*[-–—]\s*/i,
      "",
    ),
  }));
  const matchTables = tableBodies(html, "league__match-table");
  const weeks = headings.map((heading, index) => ({
    ...heading,
    matches: parseWeekMatches(matchTables[index] ?? ""),
  }));
  const snapshot = snapshotSchema.safeParse({
    season,
    cityStandings,
    rosters,
    weeks,
  });
  if (!snapshot.success || rosters.length === 0 || weeks.length === 0) {
    throw new SandDataUpstreamError(
      "avp-league",
      "invalid-response",
      "The rendered AVP League page did not contain the expected season, roster, and schedule tables.",
    );
  }
  return snapshot.data;
}

const gatewayJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["season", "cityStandings", "rosters", "weeks"],
  properties: {
    season: { type: "integer", minimum: 2000, maximum: 2100 },
    cityStandings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "rank",
          "teamName",
          "matchesPlayed",
          "wins",
          "losses",
          "matchPoints",
          "winPercentage",
        ],
        properties: {
          rank: { type: "integer", minimum: 0 },
          teamName: { type: "string" },
          matchesPlayed: { type: "integer", minimum: 0 },
          wins: { type: "integer", minimum: 0 },
          losses: { type: "integer", minimum: 0 },
          matchPoints: { type: "integer", minimum: 0 },
          winPercentage: { type: "number", minimum: 0, maximum: 100 },
        },
      },
    },
    rosters: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "rank",
          "teamName",
          "matchesPlayed",
          "wins",
          "losses",
          "matchPoints",
          "winPercentage",
          "gender",
          "playerNames",
        ],
        properties: {
          rank: { type: "integer", minimum: 0 },
          teamName: { type: "string" },
          matchesPlayed: { type: "integer", minimum: 0 },
          wins: { type: "integer", minimum: 0 },
          losses: { type: "integer", minimum: 0 },
          matchPoints: { type: "integer", minimum: 0 },
          winPercentage: { type: "number", minimum: 0, maximum: 100 },
          gender: { type: "string", enum: ["men", "women"] },
          playerNames: { type: "array", items: { type: "string" } },
        },
      },
    },
    weeks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["weekNumber", "locationLabel", "matches"],
        properties: {
          weekNumber: { type: "integer", minimum: 1, maximum: 30 },
          locationLabel: { type: "string" },
          matches: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: [
                "dateText",
                "venue",
                "gender",
                "teamA",
                "teamB",
                "sets",
                "winnerSide",
              ],
              properties: {
                dateText: { type: "string" },
                venue: { type: "string" },
                gender: { type: "string", enum: ["men", "women"] },
                teamA: { type: "string" },
                teamB: { type: "string" },
                sets: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["a", "b"],
                    properties: {
                      a: { type: "integer", minimum: 0 },
                      b: { type: "integer", minimum: 0 },
                    },
                  },
                },
                winnerSide: { type: "string", enum: ["A", "B", ""] },
              },
            },
          },
        },
      },
    },
  },
} as const;

function gatewayOutputText(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const response = value as {
    output_text?: unknown;
    output?: readonly {
      content?: readonly { type?: unknown; text?: unknown }[];
    }[];
  };
  if (typeof response.output_text === "string") return response.output_text;
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }
  return undefined;
}

export async function normalizeAvpSnapshotWithGateway(
  evidence: AvpLeagueSnapshot,
  fetchImpl: typeof fetch = fetch,
): Promise<{
  readonly snapshot: AvpLeagueSnapshot;
  readonly model: string;
  readonly used: boolean;
  readonly fallbackReason?: string;
}> {
  const credential =
    process.env.AI_GATEWAY_API_KEY?.trim() ||
    process.env.VERCEL_OIDC_TOKEN?.trim();
  const model =
    process.env.AI_GATEWAY_AVP_MODEL?.trim() || defaultAvpGatewayModel;
  if (!credential) {
    return {
      snapshot: evidence,
      model,
      used: false,
      fallbackReason: "Vercel AI Gateway credential is not configured.",
    };
  }
  try {
    const response = await fetchImpl(
      "https://ai-gateway.vercel.sh/v1/responses",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credential}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          store: false,
          reasoning: { effort: "none" },
          max_output_tokens: 24_000,
          input: [
            {
              role: "system",
              content: [
                {
                  type: "input_text",
                  text: "Normalize AVP League standings, seasonal rosters, and weekly match results. Use only the supplied rendered-page evidence. Preserve source surnames exactly; never expand or invent a player's given name. Preserve incomplete and TBD values as empty arrays or strings. Return every supplied week and match.",
                },
              ],
            },
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: JSON.stringify(evidence),
                },
              ],
            },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "avp_league_snapshot",
              strict: true,
              schema: gatewayJsonSchema,
            },
          },
        }),
      },
    );
    if (!response.ok) {
      throw new Error(`AI Gateway returned HTTP ${response.status}.`);
    }
    const output = gatewayOutputText(await response.json());
    if (!output) throw new Error("AI Gateway returned no structured output.");
    const normalized = snapshotSchema.parse(JSON.parse(output));
    if (
      normalized.season !== evidence.season ||
      normalized.weeks.length < evidence.weeks.length ||
      normalized.rosters.length < evidence.rosters.length
    ) {
      throw new Error("AI Gateway omitted source rows.");
    }
    return { snapshot: normalized, model, used: true };
  } catch (error) {
    return {
      snapshot: evidence,
      model,
      used: false,
      fallbackReason:
        error instanceof Error
          ? error.message
          : "Vercel AI Gateway normalization failed.",
    };
  }
}

function slug(value: string): string {
  return normalizePersonName(value).replaceAll(/\s+/g, "-") || "unknown";
}

export function avpExternalPlayerId(input: {
  readonly season: number;
  readonly teamName: string;
  readonly gender: "men" | "women";
  readonly displayName: string;
}): string {
  return [
    "avp",
    input.season,
    slug(input.teamName),
    input.gender,
    slug(input.displayName),
  ].join(":");
}

function dateFromAvp(value: string, season: number): string | undefined {
  const match = value.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (!match) return undefined;
  const month = Number.parseInt(match[1] ?? "", 10);
  const day = Number.parseInt(match[2] ?? "", 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  return `${season}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function eventStatus(
  startsOn: string | undefined,
  endsOn: string | undefined,
  today: string,
): Pick<ProfessionalEventRecord, "status" | "live"> {
  if (startsOn && startsOn <= today && (!endsOn || today <= endsOn)) {
    return { status: "live", live: true };
  }
  if (endsOn && endsOn < today) {
    return { status: "completed", live: false };
  }
  return { status: "upcoming", live: false };
}

function rosterKey(gender: "men" | "women", teamName: string): string {
  return `${gender}:${slug(teamName)}`;
}

export async function importAvpLeague(
  requestedSeason?: number,
): Promise<SourceImportResult> {
  const { html, engine } = await scrapeHtml("avp-league", avpLeagueUrl, {
    waitForMs: 5_000,
    timeoutMs: 90_000,
    proxy: "auto",
  });
  const deterministic = parseAvpLeagueHtml(html, requestedSeason);
  const normalized = await normalizeAvpSnapshotWithGateway(deterministic);
  const snapshot = normalized.snapshot;
  const players = new Map<string, ExternalPlayerRecord>();
  const rosterByTeam = new Map<string, AvpRoster>();
  for (const roster of snapshot.rosters) {
    rosterByTeam.set(rosterKey(roster.gender, roster.teamName), roster);
    for (const playerName of roster.playerNames) {
      const externalPersonId = avpExternalPlayerId({
        season: snapshot.season,
        teamName: roster.teamName,
        gender: roster.gender,
        displayName: playerName,
      });
      players.set(externalPersonId, {
        externalPersonId,
        displayName: playerName,
        isProfessional: true,
        raw: {
          source: "avp-league",
          season: snapshot.season,
          teamName: roster.teamName,
          teamExternalId: slug(roster.teamName),
          gender: roster.gender,
          role: "starter",
        },
      });
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const matches: ExternalMatchRecord[] = [];
  const events: ProfessionalEventRecord[] = [];
  for (const week of snapshot.weeks) {
    const eventId = `avp:${snapshot.season}:week-${week.weekNumber}`;
    const eventName = `AVP League Week ${week.weekNumber} — ${week.locationLabel}`;
    const dates = week.matches
      .flatMap((match) => {
        const date = dateFromAvp(match.dateText, snapshot.season);
        return date ? [date] : [];
      })
      .sort();
    const startsOn = dates[0];
    const endsOn = dates.at(-1);
    const weekMatches: ExternalMatchRecord[] = [];
    week.matches.forEach((match, index) => {
      const teamA = rosterByTeam.get(rosterKey(match.gender, match.teamA));
      const teamB = rosterByTeam.get(rosterKey(match.gender, match.teamB));
      const participants = [
        ...(teamA?.playerNames ?? []).slice(0, 2).map((name) => ({
          externalPersonId: avpExternalPlayerId({
            season: snapshot.season,
            teamName: match.teamA,
            gender: match.gender,
            displayName: name,
          }),
          name,
          side: "A" as const,
        })),
        ...(teamB?.playerNames ?? []).slice(0, 2).map((name) => ({
          externalPersonId: avpExternalPlayerId({
            season: snapshot.season,
            teamName: match.teamB,
            gender: match.gender,
            displayName: name,
          }),
          name,
          side: "B" as const,
        })),
      ];
      const playedOn = dateFromAvp(match.dateText, snapshot.season);
      const externalMatchId = hashValue(
        [
          eventId,
          index,
          match.gender,
          match.teamA,
          match.teamB,
          match.dateText,
        ].join("|"),
      );
      weekMatches.push({
        externalMatchId,
        externalEventId: eventId,
        sourceUrl: avpLeagueUrl,
        title: eventName,
        roundLabel: `${match.gender === "women" ? "Women" : "Men"} · Week ${week.weekNumber}`,
        location: [match.venue, week.locationLabel].filter(Boolean).join(" · "),
        genderCategory: match.gender,
        playedAt: playedOn ? `${playedOn}T12:00:00.000Z` : undefined,
        participants,
        sets: match.sets,
        winnerSide:
          match.winnerSide === "A" || match.winnerSide === "B"
            ? match.winnerSide
            : undefined,
        raw: {
          source: "avp-league",
          season: snapshot.season,
          week: week.weekNumber,
          teamAName: match.teamA,
          teamAExternalId: slug(match.teamA),
          teamBName: match.teamB,
          teamBExternalId: slug(match.teamB),
          gender: match.gender,
          dateText: match.dateText,
          venue: match.venue,
        },
      });
    });
    matches.push(...weekMatches);
    events.push({
      externalEventId: eventId,
      sourceUrl: avpLeagueUrl,
      name: eventName,
      location: week.locationLabel,
      countryCode: "USA",
      category: "AVP League",
      genderCategory: "coed",
      startsOn,
      endsOn,
      ...eventStatus(startsOn, endsOn, today),
      teamCount: snapshot.rosters.length,
      matchCount: weekMatches.length,
      raw: {
        source: "avp-league",
        tour: "avp",
        season: snapshot.season,
        week: week.weekNumber,
        cityStandings: snapshot.cityStandings,
        rosters: snapshot.rosters,
        gateway: {
          used: normalized.used,
          model: normalized.model,
          ...(normalized.fallbackReason
            ? { fallbackReason: normalized.fallbackReason }
            : {}),
        },
      },
    });
  }
  return {
    source: "avp-league",
    requestedUrl: avpLeagueUrl,
    players: [...players.values()],
    matches,
    events,
    checkpoint: {
      season: snapshot.season,
      weeks: snapshot.weeks.length,
      engine,
      gatewayUsed: normalized.used,
      gatewayModel: normalized.model,
      ...(normalized.fallbackReason
        ? { gatewayFallbackReason: normalized.fallbackReason }
        : {}),
    },
  };
}
