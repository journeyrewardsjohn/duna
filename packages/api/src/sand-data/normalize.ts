import { createHash } from "node:crypto";
import type { ExternalMatchParticipant, ExternalMatchRecord } from "./types";

export function normalizePersonName(value: string): string {
  return value
    .normalize("NFKD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, " ")
    .trim()
    .replaceAll(/\s+/g, " ");
}

export function safeExternalHandle(
  sourceSlug: string,
  externalPersonId: string,
): string {
  const source = sourceSlug.replaceAll(/[^a-z0-9]+/g, "-").slice(0, 15);
  const external = externalPersonId
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/(^-|-$)/g, "")
    .slice(0, 24);
  const digest = hashValue(`${source}:${externalPersonId}`).slice(0, 7);
  return `${source}-${external || "player"}-${digest}`.slice(0, 48);
}

export function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function participantKey(
  participants: readonly ExternalMatchParticipant[],
): string {
  return participants
    .map((participant) => normalizePersonName(participant.name))
    .filter(Boolean)
    .sort()
    .join("|");
}

function scoreKey(sets: readonly { a: number; b: number }[]): string {
  return sets
    .map((set) => `${Math.min(set.a, set.b)}-${Math.max(set.a, set.b)}`)
    .sort()
    .join(",");
}

export function sourceMatchFingerprint(
  sourceSlug: string,
  match: ExternalMatchRecord,
): string {
  return hashValue(
    [
      sourceSlug,
      match.externalEventId ?? "",
      match.externalMatchId,
      match.playedAt?.slice(0, 10) ?? "",
      participantKey(match.participants),
      scoreKey(match.sets),
    ].join("::"),
  );
}

export function crossSourceMatchFingerprint(
  match: ExternalMatchRecord,
): string {
  return hashValue(
    [
      match.playedAt?.slice(0, 10) ?? "",
      participantKey(match.participants),
      scoreKey(match.sets),
    ].join("::"),
  );
}

export interface ParsedDateSpan {
  readonly start: string;
  readonly end?: string;
}

function isoDate(year: number, month: number, day: number): string | undefined {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }
  return date.toISOString().slice(0, 10);
}

export function parseDateSpan(value: string): ParsedDateSpan | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const start = isoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    return start ? { start } : undefined;
  }
  const crossMonthRange = trimmed.match(
    /^(\d{1,2})\/(\d{1,2})\s*[-–—]\s*(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
  );
  if (crossMonthRange) {
    const endYear = Number(crossMonthRange[5]);
    const startMonth = Number(crossMonthRange[1]);
    const endMonth = Number(crossMonthRange[3]);
    const start = isoDate(
      startMonth > endMonth ? endYear - 1 : endYear,
      startMonth,
      Number(crossMonthRange[2]),
    );
    const end = isoDate(endYear, endMonth, Number(crossMonthRange[4]));
    return start && end && start <= end ? { start, end } : undefined;
  }
  const sameMonthRange = trimmed.match(
    /^(\d{1,2})\/(\d{1,2})\s*[-–—]\s*(\d{1,2})\/(\d{4})$/,
  );
  if (sameMonthRange) {
    const year = Number(sameMonthRange[4]);
    const month = Number(sameMonthRange[1]);
    const start = isoDate(year, month, Number(sameMonthRange[2]));
    const end = isoDate(year, month, Number(sameMonthRange[3]));
    return start && end && start <= end ? { start, end } : undefined;
  }
  const us = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) {
    const start = isoDate(Number(us[3]), Number(us[1]), Number(us[2]));
    return start ? { start } : undefined;
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime())
    ? undefined
    : { start: parsed.toISOString().slice(0, 10) };
}

export function parseDate(value: string): string | undefined {
  return parseDateSpan(value)?.start;
}

export function matchMappingConfidence(input: {
  readonly externalIdMatched: boolean;
  readonly externalName: string;
  readonly candidateName: string;
}): number {
  if (input.externalIdMatched) return 10_000;
  const external = normalizePersonName(input.externalName);
  const candidate = normalizePersonName(input.candidateName);
  if (!external || !candidate) return 0;
  if (external === candidate) return 9_500;
  const externalParts = external.split(" ");
  const candidateParts = candidate.split(" ");
  // Volleyball World occasionally publishes a two-part name as
  // "Family, Given". Treat that exact reversal as the same identity without
  // weakening the normal surname/initial fallback below.
  if (
    externalParts.length === 2 &&
    candidateParts.length === 2 &&
    externalParts[0] === candidateParts[1] &&
    externalParts[1] === candidateParts[0]
  ) {
    return 9_500;
  }
  const externalLast = externalParts.at(-1);
  const candidateLast = candidateParts.at(-1);
  if (
    externalLast === candidateLast &&
    externalParts[0]?.[0] === candidateParts[0]?.[0]
  ) {
    return 7_000;
  }
  return externalLast === candidateLast ? 5_000 : 0;
}
