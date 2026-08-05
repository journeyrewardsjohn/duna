import { normalizePersonName } from "./normalize";

export interface RankingIdentityRow {
  readonly rankingDate: string;
  readonly genderCategory: string;
  readonly rank: number;
  readonly points: number;
  readonly externalPersonId: string;
  readonly displayName: string;
  readonly countryCode?: string | null;
  readonly personId?: string | null;
  readonly handle?: string | null;
  readonly avatarUrl?: string | null;
  readonly sandRating?: number | null;
  readonly ratedMatches?: number | null;
  readonly rawPayload?: unknown;
}

function personKey(row: RankingIdentityRow): string | undefined {
  return row.personId
    ? `${row.rankingDate}:${row.genderCategory}:${row.personId}`
    : undefined;
}

function strictIdentityKey(row: RankingIdentityRow): string {
  return [
    row.rankingDate,
    row.genderCategory,
    normalizePersonName(row.displayName),
    row.countryCode?.trim().toUpperCase() ?? "",
    row.rank,
    Number.isFinite(row.points) ? row.points : 0,
  ].join(":");
}

function rankingEvidenceKey(row: RankingIdentityRow): string {
  return [
    row.rankingDate,
    row.genderCategory,
    row.countryCode?.trim().toUpperCase() ?? "",
    row.rank,
    Number.isFinite(row.points) ? row.points : 0,
  ].join(":");
}

function nameTokens(value: string): readonly string[] {
  return normalizePersonName(value).split(" ").filter(Boolean);
}

function aliasMatchesCanonical(alias: string, canonical: string): boolean {
  const aliasParts = nameTokens(alias);
  const canonicalParts = nameTokens(canonical);
  if (aliasParts.length === 0 || canonicalParts.length === 0) return false;
  return aliasParts.every((aliasPart) =>
    canonicalParts.some(
      (canonicalPart) =>
        canonicalPart === aliasPart ||
        (aliasPart.length === 1 && canonicalPart.startsWith(aliasPart)),
    ),
  );
}

function canonicalNameVariants(row: RankingIdentityRow): readonly string[] {
  const variants = [row.displayName];
  if (
    row.rawPayload &&
    typeof row.rawPayload === "object" &&
    "sourcePlayerName" in row.rawPayload &&
    typeof row.rawPayload.sourcePlayerName === "string"
  ) {
    variants.push(row.rawPayload.sourcePlayerName);
  }
  return [...new Set(variants.map((value) => value.trim()).filter(Boolean))];
}

function quality(row: RankingIdentityRow): number {
  const normalized = normalizePersonName(row.displayName);
  return (
    (row.personId ? 10_000 : 0) +
    (typeof row.sandRating === "number" ? 1_000 : 0) +
    (typeof row.ratedMatches === "number"
      ? Math.min(row.ratedMatches, 500)
      : 0) +
    (row.handle ? 100 : 0) +
    (row.avatarUrl ? 50 : 0) +
    normalized.split(" ").filter(Boolean).length * 10 +
    normalized.length
  );
}

function preferred<T extends RankingIdentityRow>(left: T, right: T): T {
  const difference = quality(right) - quality(left);
  if (difference !== 0) return difference > 0 ? right : left;
  return right.externalPersonId.localeCompare(left.externalPersonId) < 0
    ? right
    : left;
}

function dedupeBy<T extends RankingIdentityRow>(
  rows: readonly T[],
  keyFor: (row: T) => string | undefined,
): T[] {
  const unkeyed: T[] = [];
  const byKey = new Map<string, T>();
  for (const row of rows) {
    const key = keyFor(row);
    if (!key) {
      unkeyed.push(row);
      continue;
    }
    const existing = byKey.get(key);
    byKey.set(key, existing ? preferred(existing, row) : row);
  }
  return [...byKey.values(), ...unkeyed];
}

/**
 * Collapses only decisive ranking duplicates:
 * - rows already linked to the same Duna person; or
 * - exact normalized name/country/rank/points duplicates in one snapshot; or
 * - an abbreviated row that uniquely matches one mapped canonical player with
 *   identical ranking evidence.
 *
 * Rank and points are deliberately part of the fallback identity so two
 * different athletes with the same name and country are not silently merged.
 */
export function dedupeWorldRankingRows<T extends RankingIdentityRow>(
  rows: readonly T[],
): T[] {
  const decisiveRows = dedupeBy(
    dedupeBy(rows, (row) => personKey(row)),
    (row) => strictIdentityKey(row),
  );
  const linkedByEvidence = new Map<string, T[]>();
  for (const row of decisiveRows) {
    if (!row.personId) continue;
    const key = rankingEvidenceKey(row);
    linkedByEvidence.set(key, [...(linkedByEvidence.get(key) ?? []), row]);
  }
  return decisiveRows
    .filter((row) => {
      if (row.personId) return true;
      const matches = (linkedByEvidence.get(rankingEvidenceKey(row)) ?? [])
        .filter((candidate) =>
          canonicalNameVariants(candidate).some((candidateName) =>
            aliasMatchesCanonical(row.displayName, candidateName),
          ),
        )
        .map((candidate) => candidate.personId)
        .filter((personId): personId is string => Boolean(personId));
      return new Set(matches).size !== 1;
    })
    .sort(
      (left, right) =>
        left.genderCategory.localeCompare(right.genderCategory) ||
        left.rankingDate.localeCompare(right.rankingDate) ||
        left.rank - right.rank ||
        left.displayName.localeCompare(right.displayName),
    );
}
