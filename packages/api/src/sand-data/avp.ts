import { z } from "zod";
import { parseAvpApiMatches, type AvpApiMatch } from "./avp-tournaments";
import { scrapeHtml, scrapeJson } from "./http";
import { hashValue, normalizePersonName } from "./normalize";
import {
  SandDataUpstreamError,
  type ExternalMatchRecord,
  type ExternalPlayerRecord,
  type ProfessionalEventRecord,
  type SourceImportResult,
} from "./types";

const avpLeagueUrl = "https://avp.com/league/";
const avpLeagueFeedUrl =
  "https://volleyballapi.web4data.co.uk/api/matches/byevent";
const defaultAvpGatewayModel = "openai/gpt-5.6-luna";
const liveAvpMaxAgeMs = 2 * 60 * 1_000;

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
  playedOn: z.string().optional(),
  bracketLabel: z.string().optional(),
  roundLabel: z.string().optional(),
  timeLabel: z.string().optional(),
  timezone: z.string().optional(),
  matchState: z.string().optional(),
  sourceCompetitionId: z.number().int().optional(),
  sourceMatchNo: z.number().int().optional(),
});

const competitionSchema = z.object({
  key: z.string().trim().min(1),
  label: z.string().trim().min(1),
  kind: z.enum(["week", "championship", "competition"]),
  weekNumber: z.number().int().min(1).max(30).nullable(),
  locationLabel: z.string().trim().min(1),
  genderCategory: z.enum(["coed", "men", "women"]),
  matches: z.array(avpMatchSchema),
});

const snapshotSchema = z.object({
  season: z.number().int().min(2000).max(2100),
  cityStandings: z.array(standingSchema),
  rosters: z.array(rosterSchema),
  competitions: z.array(competitionSchema),
});

export type AvpLeagueSnapshot = z.infer<typeof snapshotSchema>;
export type AvpRoster = z.infer<typeof rosterSchema>;
export type AvpLeagueCompetition = z.infer<typeof competitionSchema>;

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

function parseWeekMatches(table: string): AvpLeagueCompetition["matches"] {
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
  const matches: AvpLeagueCompetition["matches"][number][] = [];
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

function competitionDescriptor(
  rawLabel: string,
  index: number,
): Omit<AvpLeagueCompetition, "matches"> {
  const label = stripHtml(rawLabel);
  const week = label.match(/^Week\s*(\d+)\s*[-–—]\s*(.+)$/i);
  if (week) {
    const weekNumber = Number.parseInt(week[1] ?? "", 10);
    return {
      key: `week-${weekNumber}`,
      label,
      kind: "week",
      weekNumber,
      locationLabel: week[2]?.trim() || label,
      genderCategory: "coed",
    };
  }
  const championship = label.match(
    /^League\s+(Men(?:'s)?|Women(?:'s)?)\s+Championships?\s*[-–—]\s*(.+)$/i,
  );
  if (championship) {
    const genderCategory = /^women/i.test(championship[1] ?? "")
      ? ("women" as const)
      : ("men" as const);
    return {
      key: `championship-${genderCategory}`,
      label,
      kind: "championship",
      weekNumber: null,
      locationLabel: championship[2]?.trim() || label,
      genderCategory,
    };
  }
  const normalized = normalizePersonName(label).replaceAll(/\s+/g, "-");
  return {
    key: normalized || `competition-${index + 1}`,
    label,
    kind: /championship/i.test(label) ? "championship" : "competition",
    weekNumber: null,
    locationLabel: label,
    genderCategory: /women/i.test(label)
      ? "women"
      : /\bmen/i.test(label)
        ? "men"
        : "coed",
  };
}

export function parseAvpLeagueEventId(html: string): number | undefined {
  const value = Number.parseInt(
    html.match(/\bdata-event-id=["'](\d+)["']/i)?.[1] ?? "",
    10,
  );
  return Number.isInteger(value) && value > 0 ? value : undefined;
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
  const headings = [...html.matchAll(/<h3([^>]*)>([\s\S]*?)<\/h3>/gi)]
    .filter((match) => /\bleague__competition-heading\b/i.test(match[1] ?? ""))
    .map((match) => stripHtml(match[2] ?? ""))
    .filter((label) => label && !/leaderboard/i.test(label));
  const matchTables = tableBodies(html, "league__match-table");
  const competitions = headings.map((heading, index) => ({
    ...competitionDescriptor(heading, index),
    matches: parseWeekMatches(matchTables[index] ?? ""),
  }));
  const snapshot = snapshotSchema.safeParse({
    season,
    cityStandings,
    rosters,
    competitions,
  });
  if (
    !snapshot.success ||
    rosters.length === 0 ||
    competitions.length === 0 ||
    competitions.length !== matchTables.length
  ) {
    throw new SandDataUpstreamError(
      "avp-league",
      "invalid-response",
      "The rendered AVP League page did not contain the expected season, roster, and competition tables.",
    );
  }
  return snapshot.data;
}

const gatewayJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["season", "cityStandings", "rosters", "competitions"],
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
    competitions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "key",
          "label",
          "kind",
          "weekNumber",
          "locationLabel",
          "genderCategory",
          "matches",
        ],
        properties: {
          key: { type: "string" },
          label: { type: "string" },
          kind: {
            type: "string",
            enum: ["week", "championship", "competition"],
          },
          weekNumber: {
            type: ["integer", "null"],
            minimum: 1,
            maximum: 30,
          },
          locationLabel: { type: "string" },
          genderCategory: {
            type: "string",
            enum: ["coed", "men", "women"],
          },
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
                  text: "Normalize AVP League standings, seasonal rosters, and competition match results. Use only the supplied rendered-page evidence. Preserve source surnames exactly; never expand or invent a player's given name. Preserve incomplete and TBD values as empty arrays or strings. Return every supplied competition, including men's and women's championships, and every match.",
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
      normalized.competitions.length < evidence.competitions.length ||
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

function feedText(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function feedTeamName(
  team: AvpApiMatch["TeamA"] | AvpApiMatch["TeamB"],
): string {
  const city = feedText(team?.Name);
  if (city) return city;
  const surnames = [team?.Captain?.LastName, team?.Player?.LastName]
    .flatMap((name) => (feedText(name) ? [feedText(name)!] : []))
    .join(", ");
  return surnames || "TBD";
}

function feedMatchGender(
  match: AvpApiMatch,
  competition: Omit<AvpLeagueCompetition, "matches">,
): "men" | "women" {
  const gender =
    feedText(match.TeamA?.Captain?.Gender) ??
    feedText(match.TeamA?.Player?.Gender) ??
    feedText(match.TeamB?.Captain?.Gender) ??
    feedText(match.TeamB?.Player?.Gender);
  if (gender && /^(f|w|women)$/i.test(gender)) return "women";
  if (gender && /^(m|men)$/i.test(gender)) return "men";
  return competition.genderCategory === "women" ? "women" : "men";
}

function feedSchedule(value: string | null | undefined): {
  readonly playedOn?: string;
  readonly timeLabel?: string;
} {
  const text = feedText(value);
  if (!text) return {};
  const match = text.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  return match
    ? { playedOn: match[1], timeLabel: match[2] }
    : { playedOn: text.match(/\d{4}-\d{2}-\d{2}/)?.[0] };
}

function avpDateText(playedOn: string | undefined): string {
  if (!playedOn) return "";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "numeric",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${playedOn}T12:00:00.000Z`));
}

function competitionTimezone(location: string): string | undefined {
  const normalized = location.toLowerCase();
  if (normalized.includes("chicago") || normalized.includes("dallas")) {
    return "America/Chicago";
  }
  if (normalized.includes("aspen")) return "America/Denver";
  if (normalized.includes("los angeles") || normalized.includes("las vegas")) {
    return "America/Los_Angeles";
  }
  if (
    normalized.includes("belmar") ||
    normalized.includes("miami") ||
    normalized.includes("new york") ||
    normalized.includes("east hampton")
  ) {
    return "America/New_York";
  }
  return undefined;
}

export function enrichAvpLeagueSnapshotWithFeed(
  snapshot: AvpLeagueSnapshot,
  value: unknown,
): AvpLeagueSnapshot {
  const matches = parseAvpApiMatches(value);
  if (matches.length === 0) return snapshot;
  const grouped = new Map<number, AvpApiMatch[]>();
  for (const match of matches) {
    const group = grouped.get(match.CompetitionId) ?? [];
    group.push(match);
    grouped.set(match.CompetitionId, group);
  }
  const competitions = [...grouped.entries()].map(
    ([sourceCompetitionId, competitionMatches], index) => {
      const label = competitionMatches[0]?.CompetitionName ?? "Competition";
      const descriptor = competitionDescriptor(label, index);
      const timezone = competitionTimezone(descriptor.locationLabel);
      return {
        ...descriptor,
        matches: competitionMatches
          .toSorted((a, b) => a.MatchNo - b.MatchNo)
          .map((match) => {
            const schedule = feedSchedule(
              match.MatchSchedule?.ScheduleTime ?? match.StartTime,
            );
            return {
              dateText: avpDateText(schedule.playedOn),
              venue: feedText(match.MatchSchedule?.CourtName) ?? "",
              gender: feedMatchGender(match, descriptor),
              teamA: feedTeamName(match.TeamA),
              teamB: feedTeamName(match.TeamB),
              sets: match.Sets.map((set) => ({ a: set.A, b: set.B })),
              winnerSide:
                match.Winner === 1
                  ? ("A" as const)
                  : match.Winner === 2
                    ? ("B" as const)
                    : ("" as const),
              ...schedule,
              ...(feedText(match.Bracket)
                ? { bracketLabel: feedText(match.Bracket) }
                : {}),
              ...(feedText(match.Round)
                ? { roundLabel: feedText(match.Round) }
                : {}),
              ...(timezone ? { timezone } : {}),
              ...(feedText(match.MatchState)
                ? { matchState: feedText(match.MatchState) }
                : {}),
              sourceCompetitionId,
              sourceMatchNo: match.MatchNo,
            };
          }),
      } satisfies AvpLeagueCompetition;
    },
  );
  return snapshotSchema.parse({ ...snapshot, competitions });
}

function dateFromAvp(value: string, season: number): string | undefined {
  const isoDate = value.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1];
  if (isoDate) return isoDate;
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

function competitionEventName(competition: AvpLeagueCompetition): string {
  if (competition.kind === "week" && competition.weekNumber) {
    return `AVP League Week ${competition.weekNumber} — ${competition.locationLabel}`;
  }
  return `AVP ${competition.label.replace(/\s*[-–—]\s*/, " — ")}`;
}

export function avpLeagueEventIdentity(
  season: number,
  competition: AvpLeagueCompetition,
): Pick<
  ProfessionalEventRecord,
  "externalEventId" | "name" | "category" | "genderCategory"
> {
  return {
    externalEventId: `avp:${season}:${competition.key}`,
    name: competitionEventName(competition),
    category:
      competition.kind === "championship"
        ? "AVP League Championship"
        : "AVP League",
    genderCategory: competition.genderCategory,
  };
}

function cleanAvpRound(value: string | undefined): string | undefined {
  return (
    value?.replace(/\bQuaterfinals\b/gi, "Quarterfinals").trim() || undefined
  );
}

function competitionRoundLabel(
  competition: AvpLeagueCompetition,
  match: AvpLeagueCompetition["matches"][number],
): string {
  const fallback =
    competition.kind === "week" && competition.weekNumber
      ? `Week ${competition.weekNumber}`
      : competition.kind === "championship"
        ? "Championship"
        : competition.label;
  return [
    match.gender === "women" ? "Women" : "Men",
    cleanAvpRound(match.bracketLabel),
    cleanAvpRound(match.roundLabel) ?? fallback,
  ]
    .filter((part, index, parts) => part && parts.indexOf(part) === index)
    .join(" · ");
}

export async function importAvpLeague(
  requestedSeason?: number,
): Promise<SourceImportResult> {
  const { html, rawHtml, engine } = await scrapeHtml(
    "avp-league",
    avpLeagueUrl,
    {
      waitForSelector: "#league-app table",
      waitAfterSelectorMs: 1_500,
      timeoutMs: 90_000,
      proxy: "auto",
      maxAgeMs: liveAvpMaxAgeMs,
      includeRawHtml: true,
    },
  );
  const deterministic = parseAvpLeagueHtml(html, requestedSeason);
  const normalized = await normalizeAvpSnapshotWithGateway(deterministic);
  const sourceEventId = parseAvpLeagueEventId(rawHtml ?? html);
  let snapshot = normalized.snapshot;
  let structuredFeedUsed = false;
  let structuredFeedMatches = 0;
  let structuredFeedFallbackReason: string | undefined;
  if (sourceEventId) {
    try {
      const feed = await scrapeJson<unknown>(
        "avp-league",
        `${avpLeagueFeedUrl}/${sourceEventId}?noStats=1`,
        { timeoutMs: 90_000, maxAgeMs: liveAvpMaxAgeMs },
      );
      snapshot = enrichAvpLeagueSnapshotWithFeed(snapshot, feed);
      structuredFeedUsed = true;
      structuredFeedMatches = snapshot.competitions.reduce(
        (total, competition) => total + competition.matches.length,
        0,
      );
    } catch (error) {
      structuredFeedFallbackReason =
        error instanceof Error
          ? error.message
          : "The official AVP League match feed was unavailable.";
    }
  } else {
    structuredFeedFallbackReason =
      "The official AVP League page did not expose its event identifier.";
  }
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
  for (const competition of snapshot.competitions) {
    const identity = avpLeagueEventIdentity(snapshot.season, competition);
    const eventId = identity.externalEventId;
    const eventName = identity.name;
    const dates = competition.matches
      .flatMap((match) => {
        const date = dateFromAvp(
          match.playedOn ?? match.dateText,
          snapshot.season,
        );
        return date ? [date] : [];
      })
      .sort();
    const startsOn = dates[0];
    const endsOn = dates.at(-1);
    const competitionMatches: ExternalMatchRecord[] = [];
    competition.matches.forEach((match, index) => {
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
      const playedOn = dateFromAvp(
        match.playedOn ?? match.dateText,
        snapshot.season,
      );
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
      competitionMatches.push({
        externalMatchId,
        externalEventId: eventId,
        sourceUrl: avpLeagueUrl,
        title: eventName,
        roundLabel: competitionRoundLabel(competition, match),
        location: [match.venue, competition.locationLabel]
          .filter(Boolean)
          .join(" · "),
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
          ...(competition.weekNumber ? { week: competition.weekNumber } : {}),
          competitionKey: competition.key,
          competitionLabel: competition.label,
          competitionKind: competition.kind,
          sourceCompetitionId: match.sourceCompetitionId,
          sourceMatchNo: match.sourceMatchNo,
          bracket: cleanAvpRound(match.bracketLabel),
          round: cleanAvpRound(match.roundLabel),
          matchState: match.matchState,
          time: match.timeLabel,
          timezone: match.timezone,
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
    matches.push(...competitionMatches);
    const competitionTeams = new Set(
      competition.matches
        .flatMap((match) => [match.teamA, match.teamB])
        .filter((team) => team && team.toLowerCase() !== "tbd"),
    );
    events.push({
      externalEventId: eventId,
      sourceUrl: avpLeagueUrl,
      name: identity.name,
      location: competition.locationLabel,
      countryCode: "USA",
      category: identity.category,
      genderCategory: identity.genderCategory,
      startsOn,
      endsOn,
      ...eventStatus(startsOn, endsOn, today),
      teamCount: competitionTeams.size,
      matchCount: competitionMatches.length,
      raw: {
        source: "avp-league",
        tour: "avp",
        season: snapshot.season,
        ...(competition.weekNumber ? { week: competition.weekNumber } : {}),
        competitionKey: competition.key,
        competitionLabel: competition.label,
        competitionKind: competition.kind,
        genderCategory: competition.genderCategory,
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
      weeks: snapshot.competitions.filter(
        (competition) => competition.kind === "week",
      ).length,
      championships: snapshot.competitions.filter(
        (competition) => competition.kind === "championship",
      ).length,
      competitions: snapshot.competitions.length,
      sourceEventId,
      engine,
      structuredFeedUsed,
      structuredFeedMatches,
      ...(structuredFeedFallbackReason ? { structuredFeedFallbackReason } : {}),
      gatewayUsed: normalized.used,
      gatewayModel: normalized.model,
      ...(normalized.fallbackReason
        ? { gatewayFallbackReason: normalized.fallbackReason }
        : {}),
    },
  };
}
