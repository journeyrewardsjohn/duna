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

export function parseDate(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) {
    return `${us[3]}-${(us[1] ?? "").padStart(2, "0")}-${(us[2] ?? "").padStart(2, "0")}`;
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime())
    ? undefined
    : parsed.toISOString().slice(0, 10);
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
