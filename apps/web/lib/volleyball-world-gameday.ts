export type VolleyballWorldGamedayStatus = "scheduled" | "live" | "completed";

export const volleyballWorldBeachTopic = "/gameday/beach_volleyball/event/*";

export const volleyballWorldLiveFeedTiming = {
  connectionTimeoutMs: 10_000,
  heartbeatMs: 20_000,
  responseGraceMs: 6_000,
  matchStaleMs: 45_000,
  fallbackPollingMs: 15_000,
  healthyPollingMs: 30_000,
  maxReconnectAttempts: 5,
  maximumReconnectDelayMs: 15_000,
} as const;

export function volleyballWorldLiveFeedHealth(input: {
  readonly now: number;
  readonly lastMessageAt: number;
  readonly lastMatchUpdateAt: number;
}) {
  return {
    responseStale:
      input.now - input.lastMessageAt >
      volleyballWorldLiveFeedTiming.heartbeatMs +
        volleyballWorldLiveFeedTiming.responseGraceMs,
    matchStale:
      input.lastMatchUpdateAt <= 0 ||
      input.now - input.lastMatchUpdateAt >
        volleyballWorldLiveFeedTiming.matchStaleMs,
  };
}

export function volleyballWorldReconnectDelay(attempt: number): number {
  const normalizedAttempt = Math.max(1, Math.floor(attempt));
  return Math.min(
    volleyballWorldLiveFeedTiming.maximumReconnectDelayMs,
    1_000 * 2 ** (normalizedAttempt - 1),
  );
}

export interface VolleyballWorldGamedayStatistics {
  readonly team: readonly {
    readonly key: "attack" | "block" | "serve" | "total" | "dig";
    readonly label: string;
    readonly a: number;
    readonly b: number;
  }[];
  readonly players: readonly {
    readonly externalPlayerId: string;
    readonly side: "A" | "B";
    readonly name: string;
    readonly total: number;
    readonly attack: number;
    readonly block: number;
    readonly serve: number;
    readonly errors: number;
    readonly efficiency: number;
  }[];
}

export interface VolleyballWorldGamedayUpdate {
  readonly matchNo: number;
  readonly status?: VolleyballWorldGamedayStatus;
  readonly matchPoints?: { readonly a: number; readonly b: number };
  readonly sets: readonly {
    readonly number: number;
    readonly a: number;
    readonly b: number;
  }[];
  readonly currentSetNo?: number;
  readonly currentSetPoints?: { readonly a: number; readonly b: number };
  readonly statistics?: VolleyballWorldGamedayStatistics;
}

type UnknownRecord = Readonly<Record<string, unknown>>;

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function text(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const normalized = String(value).trim();
  return normalized || undefined;
}

function integer(value: unknown): number | undefined {
  const parsed = Number.parseInt(text(value) ?? "", 10);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function nestedValues(value: unknown, depth = 0): readonly unknown[] {
  if (depth > 7 || value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    return [
      value,
      ...value.flatMap((candidate) => nestedValues(candidate, depth + 1)),
    ];
  }
  if (typeof value !== "object") return [value];
  const values = Object.values(value as Record<string, unknown>);
  return [
    value,
    ...values.flatMap((candidate) => nestedValues(candidate, depth + 1)),
  ];
}

function eventRecord(
  value: unknown,
  matchNo: number,
): UnknownRecord | undefined {
  const expected = `beach_event_${matchNo}`;
  return nestedValues(value)
    .map(record)
    .find((candidate) => {
      const ids = [
        candidate._externalId,
        candidate.externalId,
        candidate.external_id,
      ];
      return ids.some((id) => text(id)?.toLowerCase() === expected);
    });
}

function parsedStatus(
  value: unknown,
): VolleyballWorldGamedayStatus | undefined {
  const candidates = nestedValues(value)
    .flatMap((candidate) => {
      if (typeof candidate === "string" || typeof candidate === "number") {
        return [String(candidate).toLowerCase()];
      }
      const item = record(candidate);
      return [item._id, item.id, item.name, item.label, item.value]
        .map(text)
        .filter((candidate): candidate is string => Boolean(candidate))
        .map((candidate) => candidate.toLowerCase());
    })
    .filter((candidate) =>
      /status|live|progress|final|complete|finish|schedule|upcoming/.test(
        candidate,
      ),
    );
  if (
    candidates.some((candidate) =>
      /(?:final|complete|completed|finished|closed)/.test(candidate),
    )
  ) {
    return "completed";
  }
  if (
    candidates.some((candidate) =>
      /(?:live|in.?progress|running|active)/.test(candidate),
    )
  ) {
    return "live";
  }
  if (
    candidates.some((candidate) =>
      /(?:schedule|upcoming|not.?started|pending)/.test(candidate),
    )
  ) {
    return "scheduled";
  }
  return undefined;
}

function parsedScore(
  value: unknown,
): { readonly a: number; readonly b: number } | undefined {
  const candidate = text(value);
  const match = candidate?.match(/(-?\d+)\s*[:\-]\s*(-?\d+)/);
  if (!match) return undefined;
  const a = integer(match[1]);
  const b = integer(match[2]);
  return a !== undefined && b !== undefined ? { a, b } : undefined;
}

function participantRecords(event: UnknownRecord): readonly UnknownRecord[] {
  return [event._participants, event.participants, event.competitors]
    .flatMap((value) => (Array.isArray(value) ? value : []))
    .map(record);
}

function tagEntries(value: unknown): readonly {
  readonly name: string;
  readonly value: unknown;
}[] {
  return (Array.isArray(value) ? value : []).flatMap((candidate) => {
    const item = record(candidate);
    const name = text(
      item.name ?? item._id ?? item.id ?? item.key ?? item.tag ?? item.type,
    );
    return name
      ? [
          {
            name: name.toLowerCase(),
            value: item.value ?? item._value ?? item.score ?? item.text,
          },
        ]
      : [];
  });
}

function participantTags(participant: UnknownRecord) {
  return tagEntries(participant._tags ?? participant.tags);
}

function tagNumber(
  tags: readonly { readonly name: string; readonly value: unknown }[],
  suffix: string,
): number | undefined {
  const normalized = suffix.toLowerCase();
  return integer(tags.find((tag) => tag.name.endsWith(normalized))?.value);
}

function tagText(
  tags: readonly { readonly name: string; readonly value: unknown }[],
  suffix: string,
): string | undefined {
  const normalized = suffix.toLowerCase();
  return text(tags.find((tag) => tag.name.endsWith(normalized))?.value);
}

function teamParticipants(event: UnknownRecord): readonly UnknownRecord[] {
  const participants = participantRecords(event);
  const explicit = participants.filter((participant) =>
    Boolean(
      text(
        participant._externalTeamId ??
          participant.externalTeamId ??
          participant.external_team_id,
      ),
    ),
  );
  if (explicit.length >= 2) {
    return [...explicit]
      .sort(
        (left, right) =>
          (integer(left.number ?? left._number) ?? 99) -
          (integer(right.number ?? right._number) ?? 99),
      )
      .slice(0, 2);
  }
  return participants
    .filter((participant) => {
      const number = integer(participant.number ?? participant._number);
      return number === 1 || number === 2;
    })
    .slice(0, 2);
}

function participantSetScores(event: UnknownRecord): readonly {
  readonly number: number;
  readonly a: number;
  readonly b: number;
}[] {
  const teams = teamParticipants(event);
  if (teams.length < 2) return [];
  const scores = teams.map((team) => {
    const found = new Map<number, number>();
    for (const tag of participantTags(team)) {
      const number = integer(
        tag.name.match(/(?:participant:vbl:)?set(\d+)_score$/i)?.[1],
      );
      const score = integer(tag.value);
      if (number !== undefined && score !== undefined) found.set(number, score);
    }
    return found;
  });
  return [...new Set([...scores[0]!.keys(), ...scores[1]!.keys()])]
    .sort((left, right) => left - right)
    .flatMap((number) => {
      const a = scores[0]!.get(number);
      const b = scores[1]!.get(number);
      return a !== undefined && b !== undefined ? [{ number, a, b }] : [];
    });
}

function scoreTags(value: unknown): readonly {
  readonly number: number;
  readonly a: number;
  readonly b: number;
}[] {
  const found = new Map<
    number,
    { readonly number: number; readonly a: number; readonly b: number }
  >();
  for (const candidate of nestedValues(value)) {
    const item = record(candidate);
    for (const [key, rawValue] of Object.entries(item)) {
      const setNo = key.match(/score:set:(\d+)/i)?.[1];
      const score = setNo ? parsedScore(rawValue) : undefined;
      const number = integer(setNo);
      if (number !== undefined && score)
        found.set(number, { number, ...score });
    }
    const tagName = [
      item._id,
      item.id,
      item.key,
      item.name,
      item.tag,
      item.type,
    ]
      .map(text)
      .find((candidate) => /score:set:\d+/i.test(candidate ?? ""));
    const number = integer(tagName?.match(/score:set:(\d+)/i)?.[1]);
    const score = [item._value, item.value, item.score, item.text]
      .map(parsedScore)
      .find(Boolean);
    if (number !== undefined && score) found.set(number, { number, ...score });
  }
  const sorted = [...found.values()].sort(
    (left, right) => left.number - right.number,
  );
  const zeroBased = sorted.some((set) => set.number === 0);
  return sorted.map((set) => ({
    ...set,
    number: zeroBased ? set.number + 1 : set.number,
  }));
}

function participantMatchPoints(
  event: UnknownRecord,
): { readonly a: number; readonly b: number } | undefined {
  const candidates = teamParticipants(event);
  if (candidates.length < 2) return undefined;
  const scoreFor = (side: 1 | 2) => {
    const participant = candidates.find((candidate, index) => {
      const number = integer(
        candidate._number ??
          candidate.number ??
          candidate.position ??
          candidate.side,
      );
      return number === side || (number === undefined && index === side - 1);
    });
    return integer(
      participant?._score ??
        participant?.score ??
        participant?.result ??
        participant?.points,
    );
  };
  const a = scoreFor(1);
  const b = scoreFor(2);
  return a !== undefined && b !== undefined ? { a, b } : undefined;
}

function gamedayStatistics(
  event: UnknownRecord,
): VolleyballWorldGamedayStatistics | undefined {
  const teams = teamParticipants(event);
  if (teams.length < 2) return undefined;
  const teamValues = teams.map((participant) => {
    const tags = participantTags(participant);
    const attack = tagNumber(tags, "team_stats:spike_point") ?? 0;
    const block = tagNumber(tags, "team_stats:block_point") ?? 0;
    const serve = tagNumber(tags, "team_stats:serve_point") ?? 0;
    const dig =
      tagNumber(tags, "team_stats:dig_excellent") ??
      tagNumber(tags, "team_stats:dig_total_attempts") ??
      0;
    return { attack, block, serve, dig, total: attack + block + serve };
  });
  const metric = (
    key: "attack" | "block" | "serve" | "total" | "dig",
    label: string,
  ) => ({
    key,
    label,
    a: teamValues[0]![key],
    b: teamValues[1]![key],
  });
  const teamNames = teams.map((participant) => {
    const tags = participantTags(participant);
    return (
      text(participant.name ?? participant._name) ?? tagText(tags, "team_name")
    );
  });
  const playerCandidates = participantRecords(event).filter((participant) =>
    Boolean(
      text(
        participant._externalSportsPersonId ??
          participant.externalSportsPersonId ??
          participant.external_sports_person_id,
      ),
    ),
  );
  const playerTeamNames = playerCandidates.map((participant) =>
    tagText(participantTags(participant), "team_name"),
  );
  const unresolvedSplit = Math.ceil(playerCandidates.length / 2);
  const players = playerCandidates.flatMap((participant, index) => {
    const tags = participantTags(participant);
    const externalPlayerId = text(
      participant._externalSportsPersonId ??
        participant.externalSportsPersonId ??
        participant.external_sports_person_id,
    );
    const name =
      text(participant.name ?? participant._name) ??
      tagText(tags, "player_name") ??
      externalPlayerId;
    if (!externalPlayerId || !name) return [];
    const teamName = playerTeamNames[index];
    const matchingSide = teamName
      ? teamNames.findIndex(
          (candidate) =>
            candidate?.localeCompare(teamName, undefined, {
              sensitivity: "base",
            }) === 0,
        )
      : -1;
    const side: "A" | "B" =
      matchingSide === 0
        ? "A"
        : matchingSide === 1
          ? "B"
          : index < unresolvedSplit
            ? "A"
            : "B";
    const attack = tagNumber(tags, "player_stats:spike_point") ?? 0;
    const block = tagNumber(tags, "player_stats:block_point") ?? 0;
    const serve = tagNumber(tags, "player_stats:serve_point") ?? 0;
    const errors =
      (tagNumber(tags, "player_stats:spike_fault") ?? 0) +
      (tagNumber(tags, "player_stats:serve_fault") ?? 0) +
      (tagNumber(tags, "player_stats:block_fault") ?? 0);
    return [
      {
        externalPlayerId,
        side,
        name,
        total: attack + block + serve,
        attack,
        block,
        serve,
        errors,
        efficiency:
          tagNumber(tags, "player_stats:spike_efficiency_percentage") ?? 0,
      },
    ];
  });
  const team = [
    metric("attack", "Attack"),
    metric("block", "Block"),
    metric("serve", "Serve"),
    metric("dig", "Dig"),
    metric("total", "Total"),
  ];
  return team.some((stat) => stat.a !== 0 || stat.b !== 0) || players.length > 0
    ? { team, players }
    : undefined;
}

export function parseVolleyballWorldGamedayEvent(
  value: unknown,
  matchNo: number,
): VolleyballWorldGamedayUpdate | undefined {
  if (!Number.isInteger(matchNo) || matchNo < 1) return undefined;
  const event = eventRecord(value, matchNo);
  if (!event) return undefined;
  const participantSets = participantSetScores(event);
  const sets =
    participantSets.length > 0
      ? participantSets
      : scoreTags(event._tags ?? event.tags ?? event);
  const current = sets.at(-1);
  const status = parsedStatus(
    event._status ?? event.status ?? event.eventStatus ?? event,
  );
  const matchPoints = participantMatchPoints(event);
  const statistics = gamedayStatistics(event);
  if (!status && !matchPoints && sets.length === 0) return undefined;
  return {
    matchNo,
    ...(status ? { status } : {}),
    ...(matchPoints ? { matchPoints } : {}),
    sets,
    ...(status === "live" && current
      ? {
          currentSetNo: current.number,
          currentSetPoints: { a: current.a, b: current.b },
        }
      : {}),
    ...(statistics ? { statistics } : {}),
  };
}

export function volleyballWorldAnonymousToken(
  value: unknown,
): string | undefined {
  for (const candidate of nestedValues(value)) {
    if (
      typeof candidate !== "object" ||
      candidate === null ||
      Array.isArray(candidate)
    ) {
      continue;
    }
    const item = candidate as Record<string, unknown>;
    for (const key of ["token", "accessToken", "access_token", "jwt"]) {
      const token = text(item[key]);
      if (token && token.split(".").length === 3) return token;
    }
  }
  return undefined;
}
