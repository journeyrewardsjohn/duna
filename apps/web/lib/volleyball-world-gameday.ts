export type VolleyballWorldGamedayStatus = "scheduled" | "live" | "completed";

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
  const candidates = [
    event._participants,
    event.participants,
    event.competitors,
  ]
    .flatMap((value) => (Array.isArray(value) ? value : []))
    .map(record);
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

export function parseVolleyballWorldGamedayEvent(
  value: unknown,
  matchNo: number,
): VolleyballWorldGamedayUpdate | undefined {
  if (!Number.isInteger(matchNo) || matchNo < 1) return undefined;
  const event = eventRecord(value, matchNo);
  if (!event) return undefined;
  const sets = scoreTags(event._tags ?? event.tags ?? event);
  const current = sets.at(-1);
  const status = parsedStatus(
    event._status ?? event.status ?? event.eventStatus ?? event,
  );
  const matchPoints = participantMatchPoints(event);
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
