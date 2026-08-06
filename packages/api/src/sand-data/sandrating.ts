import { normalizePersonName, parseDate, parseDateSpan } from "./normalize";
import { scrapeJson } from "./http";
import type {
  ExternalMatchRecord,
  ExternalPlayerRecord,
  SourceImportResult,
  WorldRankingRecord,
} from "./types";
import type { SourceImportProgress } from "./sources";

const sandRatingBase = "https://sandrating.com";

interface SandRatingUser {
  readonly id: number;
  readonly memberId?: string | null;
  readonly name: string;
  readonly avatarUrl?: string | null;
  readonly gender?: string | null;
  readonly bvbInfoUrl?: string | null;
  readonly volleyballLifeUrl?: string | null;
  readonly profileStatus?: string | null;
  readonly sandScore?: number | null;
  readonly worldRankingRank?: number | null;
  readonly worldRankingGender?: number | null;
  readonly worldRankingPoints?: number | null;
}

interface SandRatingMatchRow {
  readonly match: {
    readonly id: number;
    readonly team1Player1Id: number;
    readonly team1Player2Id: number;
    readonly team2Player1Id: number;
    readonly team2Player2Id: number;
    readonly winningSide?: number | null;
    readonly matchDate?: string | null;
    readonly matchType?: string | null;
    readonly location?: string | null;
    readonly rankedMatch?: boolean | null;
    readonly tournamentId?: number | null;
  };
  readonly team1Player1?: SandRatingUser | null;
  readonly team1Player2?: SandRatingUser | null;
  readonly team2Player1?: SandRatingUser | null;
  readonly team2Player2?: SandRatingUser | null;
  readonly sets?: readonly {
    readonly setNumber?: number;
    readonly team1Score?: number;
    readonly team2Score?: number;
    readonly isForfeit?: boolean;
  }[];
  readonly verificationStatus?: string;
  readonly tournamentGroup?: Readonly<Record<string, unknown>> | null;
}

interface SandRatingRankingTeam {
  readonly teamKey?: string;
  readonly gender?: string;
  readonly rank?: number;
  readonly points?: number;
  readonly player1Name?: string;
  readonly player2Name?: string;
  readonly player1UserId?: number | null;
  readonly player2UserId?: number | null;
  readonly federationCode?: string;
  readonly snapshotDate?: string;
}

interface SandRatingUserPage {
  readonly users?: readonly SandRatingUser[];
  readonly total?: number;
}

interface SandRatingMatchPage {
  readonly matches?: readonly SandRatingMatchRow[];
  readonly total?: number;
}

export interface SandRatingNetworkInput {
  readonly users: readonly SandRatingUser[];
  readonly matches: readonly SandRatingMatchRow[];
  readonly rankings: Readonly<
    Record<"men" | "women", readonly SandRatingRankingTeam[]>
  >;
  readonly maxDepth?: number;
  readonly topPlayersPerGender?: number;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  const number = finiteNumber(value);
  return number !== undefined && Number.isSafeInteger(number) && number > 0
    ? number
    : undefined;
}

function genderCategory(
  value: string | null | undefined,
): "men" | "women" | undefined {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "female" || normalized === "women") return "women";
  if (normalized === "male" || normalized === "men") return "men";
  return undefined;
}

function rankingGenderCode(gender: "men" | "women"): number {
  return gender === "men" ? 0 : 1;
}

function participantIds(row: SandRatingMatchRow): readonly number[] {
  return [
    row.match.team1Player1Id,
    row.match.team1Player2Id,
    row.match.team2Player1Id,
    row.match.team2Player2Id,
  ].flatMap((value) => {
    const id = positiveInteger(value);
    return id === undefined ? [] : [id];
  });
}

function rankingNameScore(rankingName: string, userName: string): number {
  const ranking = normalizePersonName(rankingName);
  const user = normalizePersonName(userName);
  if (!ranking || !user) return 0;
  if (ranking === user) return 100;
  const rankingParts = ranking.split(" ");
  const userParts = user.split(" ");
  const rankingLast = rankingParts[0];
  const rankingInitial = rankingParts.at(-1)?.[0];
  const userLast = userParts.at(-1);
  if (
    rankingName.includes(",") &&
    rankingLast === userLast &&
    rankingInitial === userParts[0]?.[0]
  ) {
    return 95;
  }
  if (rankingParts.length === 1) {
    return userParts.at(-1) === ranking || userParts[0] === ranking ? 85 : 0;
  }
  if (user.endsWith(` ${ranking}`) || user.startsWith(`${ranking} `)) {
    return 80;
  }
  return rankingParts.every((part) => userParts.includes(part)) ? 70 : 0;
}

function bestUniqueUser(input: {
  readonly name: string;
  readonly candidates: readonly SandRatingUser[];
  readonly excludedIds: ReadonlySet<number>;
}): SandRatingUser | undefined {
  const scored = input.candidates
    .filter((candidate) => !input.excludedIds.has(candidate.id))
    .map((candidate) => ({
      candidate,
      score: rankingNameScore(input.name, candidate.name),
    }))
    .filter(({ score }) => score > 0)
    .sort(
      (left, right) =>
        right.score - left.score || left.candidate.id - right.candidate.id,
    );
  const best = scored[0];
  if (!best || scored[1]?.score === best.score) return undefined;
  return best.candidate;
}

function rankingDate(value: string | undefined): string {
  return parseDate(value ?? "") ?? new Date().toISOString().slice(0, 10);
}

function safeCountryCode(value: string | undefined): string | undefined {
  const code = value?.trim().toUpperCase();
  return code && /^[A-Z]{2,3}$/.test(code) ? code : undefined;
}

function minimalUserRaw(user: SandRatingUser, depth: number | undefined) {
  return {
    sandRatingUserId: user.id,
    memberId: user.memberId ?? undefined,
    profileStatus: user.profileStatus ?? undefined,
    sourceSandScore: finiteNumber(user.sandScore),
    worldRankingRank: positiveInteger(user.worldRankingRank),
    worldRankingGender: finiteNumber(user.worldRankingGender),
    worldRankingPoints: finiteNumber(user.worldRankingPoints),
    bvbInfoUrl: user.bvbInfoUrl ?? undefined,
    volleyballLifeUrl: user.volleyballLifeUrl ?? undefined,
    graphDepth: depth,
  };
}

function inferredMatchGender(
  row: SandRatingMatchRow,
  users: ReadonlyMap<number, SandRatingUser>,
): "men" | "women" | undefined {
  const location = row.match.location?.toLowerCase() ?? "";
  if (/\bwomen(?:'s|s)?\b/.test(location)) return "women";
  if (/\bmen(?:'s|s)?\b/.test(location)) return "men";
  const genders = new Set(
    participantIds(row).flatMap((id) => {
      const gender = genderCategory(users.get(id)?.gender);
      return gender ? [gender] : [];
    }),
  );
  return genders.size === 1 ? [...genders][0] : undefined;
}

function displayNameFor(
  id: number,
  users: ReadonlyMap<number, SandRatingUser>,
): string {
  return users.get(id)?.name?.trim() || `Sand Rating player ${id}`;
}

/**
 * Builds a bounded player graph from one SandRating snapshot. The source is
 * downloaded in bulk first, then traversed locally so depth expansion does not
 * multiply requests against the partner service.
 */
export function buildSandRatingNetwork(
  input: SandRatingNetworkInput,
): SourceImportResult {
  const maxDepth = Math.min(4, Math.max(0, Math.floor(input.maxDepth ?? 4)));
  const topPlayersPerGender = Math.min(
    500,
    Math.max(1, Math.floor(input.topPlayersPerGender ?? 200)),
  );
  const users = new Map<number, SandRatingUser>();
  for (const user of input.users) {
    const id = positiveInteger(user.id);
    if (id && user.name?.trim()) users.set(id, user);
  }
  for (const row of input.matches) {
    for (const user of [
      row.team1Player1,
      row.team1Player2,
      row.team2Player1,
      row.team2Player2,
    ]) {
      const id = positiveInteger(user?.id);
      if (id && user?.name?.trim()) users.set(id, user);
    }
  }

  const players = new Map<string, ExternalPlayerRecord>();
  const rankings: WorldRankingRecord[] = [];
  const seedUserIds = new Set<number>();
  const seedGender = new Map<number, "men" | "women">();
  const seedCountry = new Map<number, string>();
  let rankingTargets = 0;
  let mappedRankingTargets = 0;

  for (const gender of ["men", "women"] as const) {
    const teams = [...input.rankings[gender]].sort(
      (left, right) =>
        (positiveInteger(left.rank) ?? Number.MAX_SAFE_INTEGER) -
          (positiveInteger(right.rank) ?? Number.MAX_SAFE_INTEGER) ||
        (left.teamKey ?? "").localeCompare(right.teamKey ?? ""),
    );
    let genderTargets = 0;
    const seenRankingIdentities = new Set<string>();
    for (const team of teams) {
      if (genderTargets >= topPlayersPerGender) break;
      const rank = positiveInteger(team.rank);
      if (!rank) continue;
      const usedIds = new Set<number>();
      const genderCandidates = [...users.values()].filter((user) => {
        const userGender = genderCategory(user.gender);
        return userGender === undefined || userGender === gender;
      });
      const rankCandidates = genderCandidates.filter(
        (user) =>
          user.worldRankingRank === rank &&
          user.worldRankingGender === rankingGenderCode(gender),
      );
      for (const [rawName, rawUserId] of [
        [team.player1Name, team.player1UserId],
        [team.player2Name, team.player2UserId],
      ] as const) {
        if (genderTargets >= topPlayersPerGender) break;
        const name = rawName?.trim();
        if (!name) continue;
        const directUserId = positiveInteger(rawUserId);
        const directCandidate = directUserId
          ? users.get(directUserId)
          : undefined;
        const directUser =
          directCandidate &&
          (genderCategory(directCandidate.gender) === undefined ||
            genderCategory(directCandidate.gender) === gender)
            ? directCandidate
            : undefined;
        const matchedUser =
          directUser ??
          bestUniqueUser({
            name,
            candidates: rankCandidates,
            excludedIds: usedIds,
          }) ??
          bestUniqueUser({
            name,
            candidates: genderCandidates,
            excludedIds: usedIds,
          });
        const countryCode = safeCountryCode(team.federationCode);
        const rankingIdentity = matchedUser
          ? `user:${matchedUser.id}`
          : `name:${normalizePersonName(name)}:${countryCode ?? "unknown"}`;
        if (seenRankingIdentities.has(rankingIdentity)) continue;
        seenRankingIdentities.add(rankingIdentity);
        genderTargets += 1;
        rankingTargets += 1;
        const externalPersonId = matchedUser
          ? String(matchedUser.id)
          : `world:${gender}:${normalizePersonName(name).replaceAll(" ", "-")}:${countryCode?.toLowerCase() ?? "unknown"}`;
        if (matchedUser) {
          usedIds.add(matchedUser.id);
          seedUserIds.add(matchedUser.id);
          seedGender.set(matchedUser.id, gender);
          if (countryCode) seedCountry.set(matchedUser.id, countryCode);
          mappedRankingTargets += 1;
        }
        players.set(externalPersonId, {
          externalPersonId,
          displayName: matchedUser?.name ?? name,
          profileUrl: matchedUser
            ? `${sandRatingBase}/profile/${matchedUser.id}`
            : undefined,
          avatarUrl: matchedUser?.avatarUrl ?? undefined,
          countryCode,
          genderCategory: gender,
          isProfessional: true,
          raw: matchedUser
            ? {
                ...minimalUserRaw(matchedUser, 0),
                rankingSeed: true,
              }
            : {
                rankingSeed: true,
                rankingStub: true,
                teamKey: team.teamKey,
                federationCode: countryCode,
              },
        });
        rankings.push({
          rankingDate: rankingDate(team.snapshotDate),
          genderCategory: gender,
          rank,
          points: finiteNumber(team.points) ?? 0,
          externalPersonId,
          displayName: matchedUser?.name ?? name,
          countryCode,
          raw: {
            teamKey: team.teamKey,
            sourcePlayerName: name,
            sourceUserId: matchedUser?.id,
          },
        });
      }
    }
  }

  const matchIndexesByUser = new Map<number, number[]>();
  for (const [index, row] of input.matches.entries()) {
    const ids = participantIds(row);
    if (ids.length !== 4) continue;
    for (const id of ids) {
      const indexes = matchIndexesByUser.get(id) ?? [];
      indexes.push(index);
      matchIndexesByUser.set(id, indexes);
    }
  }
  const depthByUser = new Map<number, number>();
  const queue: number[] = [];
  for (const id of seedUserIds) {
    depthByUser.set(id, 0);
    queue.push(id);
  }
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const userId = queue[cursor]!;
    const depth = depthByUser.get(userId)!;
    if (depth >= maxDepth) continue;
    for (const matchIndex of matchIndexesByUser.get(userId) ?? []) {
      for (const participantId of participantIds(input.matches[matchIndex]!)) {
        if (depthByUser.has(participantId)) continue;
        depthByUser.set(participantId, depth + 1);
        queue.push(participantId);
      }
    }
  }

  for (const [id, depth] of depthByUser) {
    const user = users.get(id);
    if (!user) continue;
    const externalPersonId = String(id);
    const existing = players.get(externalPersonId);
    players.set(externalPersonId, {
      externalPersonId,
      displayName: user.name.trim(),
      profileUrl: `${sandRatingBase}/profile/${id}`,
      avatarUrl: user.avatarUrl ?? undefined,
      countryCode: seedCountry.get(id),
      genderCategory: seedGender.get(id) ?? genderCategory(user.gender),
      isProfessional: Boolean(
        existing?.isProfessional ||
        positiveInteger(user.worldRankingRank) ||
        user.bvbInfoUrl ||
        user.volleyballLifeUrl,
      ),
      externalMatchCount: matchIndexesByUser.get(id)?.length,
      raw: {
        ...minimalUserRaw(user, depth),
        rankingSeed: existing?.raw.rankingSeed === true,
      },
    });
  }

  const matches: ExternalMatchRecord[] = [];
  for (const row of input.matches) {
    const ids = participantIds(row);
    if (ids.length !== 4 || ids.some((id) => !depthByUser.has(id))) continue;
    const minimumDepth = Math.min(...ids.map((id) => depthByUser.get(id)!));
    if (minimumDepth >= maxDepth && maxDepth > 0) continue;
    const sets = (row.sets ?? []).flatMap((set) => {
      const a = finiteNumber(set.team1Score);
      const b = finiteNumber(set.team2Score);
      return !set.isForfeit &&
        a !== undefined &&
        b !== undefined &&
        Number.isSafeInteger(a) &&
        Number.isSafeInteger(b) &&
        a >= 0 &&
        b >= 0 &&
        a !== b
        ? [{ a, b }]
        : [];
    });
    const winnerSide =
      row.match.winningSide === 1
        ? ("A" as const)
        : row.match.winningSide === 2
          ? ("B" as const)
          : undefined;
    const location = row.match.location?.trim() || undefined;
    const sourceMatchDate = row.match.matchDate?.trim() || undefined;
    const dateSpan = parseDateSpan(sourceMatchDate ?? "");
    matches.push({
      externalMatchId: String(row.match.id),
      externalEventId: row.match.tournamentId
        ? String(row.match.tournamentId)
        : undefined,
      sourceUrl: `${sandRatingBase}/matches/${row.match.id}`,
      title: location ?? "Sand Rating match",
      location,
      genderCategory: inferredMatchGender(row, users),
      playedAt: dateSpan ? `${dateSpan.start}T12:00:00.000Z` : undefined,
      participants: [
        {
          externalPersonId: String(ids[0]),
          name: displayNameFor(ids[0]!, users),
          side: "A",
        },
        {
          externalPersonId: String(ids[1]),
          name: displayNameFor(ids[1]!, users),
          side: "A",
        },
        {
          externalPersonId: String(ids[2]),
          name: displayNameFor(ids[2]!, users),
          side: "B",
        },
        {
          externalPersonId: String(ids[3]),
          name: displayNameFor(ids[3]!, users),
          side: "B",
        },
      ],
      sets,
      winnerSide,
      raw: {
        sandRatingMatchId: row.match.id,
        matchType: row.match.matchType ?? undefined,
        rankedMatch: row.match.rankedMatch ?? undefined,
        verificationStatus: row.verificationStatus,
        tournamentId: row.match.tournamentId ?? undefined,
        graphDepth: minimumDepth,
        sourceMatchDate,
        sourceMatchDateEnd: dateSpan?.end,
      },
    });
  }

  const graphDepths = Object.fromEntries(
    [...depthByUser.values()].reduce((counts, depth) => {
      counts.set(String(depth), (counts.get(String(depth)) ?? 0) + 1);
      return counts;
    }, new Map<string, number>()),
  );
  return {
    source: "sandrating",
    requestedUrl: `${sandRatingBase}/api/matches`,
    players: [...players.values()],
    matches,
    rankings,
    checkpoint: {
      maxDepth,
      topPlayersPerGender,
      rankingTargets,
      mappedRankingTargets,
      graphDepths,
      sourceUsers: users.size,
      sourceMatches: input.matches.length,
      includedPlayers: players.size,
      includedMatches: matches.length,
    },
  };
}

async function fetchUsers(): Promise<readonly SandRatingUser[]> {
  const pageSize = 1_000;
  const users: SandRatingUser[] = [];
  let total = Number.MAX_SAFE_INTEGER;
  for (let offset = 0; offset < total; offset += pageSize) {
    const page = await scrapeJson<SandRatingUserPage>(
      "sandrating",
      `${sandRatingBase}/api/users?offset=${offset}&limit=${pageSize}`,
    );
    const rows = page.users ?? [];
    users.push(...rows);
    total = finiteNumber(page.total) ?? users.length;
    if (rows.length < pageSize) break;
  }
  return users;
}

async function fetchMatches(
  onProgress?: (progress: SourceImportProgress) => void | Promise<void>,
): Promise<readonly SandRatingMatchRow[]> {
  const pageSize = 500;
  const matches: SandRatingMatchRow[] = [];
  let total = Number.MAX_SAFE_INTEGER;
  for (let offset = 0; offset < total; offset += pageSize) {
    const page = await scrapeJson<SandRatingMatchPage>(
      "sandrating",
      `${sandRatingBase}/api/matches?offset=${offset}&limit=${pageSize}`,
    );
    const rows = page.matches ?? [];
    matches.push(...rows);
    total = finiteNumber(page.total) ?? matches.length;
    await onProgress?.({
      phase: "fetching-partner-match-snapshot",
      current: Math.min(matches.length, total),
      total,
      matchesFound: matches.length,
      profilesFound: 0,
    });
    if (rows.length < pageSize) break;
  }
  return matches;
}

export async function importSandRatingNetwork(
  input: {
    readonly maxDepth?: number;
    readonly topPlayersPerGender?: number;
  } = {},
  onProgress?: (progress: SourceImportProgress) => void | Promise<void>,
): Promise<SourceImportResult> {
  const topPlayersPerGender = Math.min(
    500,
    Math.max(1, Math.floor(input.topPlayersPerGender ?? 200)),
  );
  const bufferedPlayersPerGender = Math.min(500, topPlayersPerGender + 25);
  // Partnerships can repeat a player, so request enough teams to select 200
  // distinct people without issuing follow-up player-by-player requests.
  const teamLimit = bufferedPlayersPerGender;
  const users = await fetchUsers();
  await onProgress?.({
    phase: "fetching-partner-player-snapshot",
    current: users.length,
    total: users.length,
    matchesFound: 0,
    profilesFound: users.length,
  });
  const men = await scrapeJson<readonly SandRatingRankingTeam[]>(
    "sandrating",
    `${sandRatingBase}/api/world-rankings?gender=men&limit=${teamLimit}`,
  );
  const women = await scrapeJson<readonly SandRatingRankingTeam[]>(
    "sandrating",
    `${sandRatingBase}/api/world-rankings?gender=women&limit=${teamLimit}`,
  );
  const matches = await fetchMatches(onProgress);
  const result = buildSandRatingNetwork({
    users,
    matches,
    rankings: { men, women },
    maxDepth: input.maxDepth,
    topPlayersPerGender: bufferedPlayersPerGender,
  });
  return {
    ...result,
    checkpoint: {
      ...result.checkpoint,
      minimumTopPlayersPerGender: topPlayersPerGender,
      rankingBufferPerGender: bufferedPlayersPerGender - topPlayersPerGender,
    },
  };
}
