export interface IdentityRecord {
  readonly personId: string;
  readonly displayName: string;
  readonly birthDate?: string;
  readonly email?: string;
  readonly phoneE164?: string;
  readonly homeMarket?: string;
  readonly externalIds?: Readonly<Record<string, string>>;
}

export interface ImportedIdentity {
  readonly source: string;
  readonly externalId: string;
  readonly displayName: string;
  readonly birthDate?: string;
  readonly email?: string;
  readonly phoneE164?: string;
  readonly homeMarket?: string;
}

function normalizedText(value: string | undefined): string {
  return (
    value
      ?.normalize("NFKD")
      .replaceAll(/\p{Diacritic}/gu, "")
      .trim()
      .toLocaleLowerCase("en-US")
      .replaceAll(/[^a-z0-9]+/g, " ") ?? ""
  );
}

export interface IdentityCandidateScore {
  readonly personId: string;
  readonly score: number;
  readonly reasons: readonly string[];
}

export function scoreIdentityCandidate(
  imported: ImportedIdentity,
  candidate: IdentityRecord,
): IdentityCandidateScore {
  const reasons: string[] = [];
  let score = 0;
  if (candidate.externalIds?.[imported.source] === imported.externalId) {
    return {
      personId: candidate.personId,
      score: 1,
      reasons: ["linked-external-id"],
    };
  }
  if (
    imported.phoneE164 &&
    candidate.phoneE164 &&
    imported.phoneE164 === candidate.phoneE164
  ) {
    score += 0.48;
    reasons.push("phone-exact");
  }
  if (
    imported.email &&
    candidate.email &&
    normalizedText(imported.email) === normalizedText(candidate.email)
  ) {
    score += 0.42;
    reasons.push("email-exact");
  }
  if (
    normalizedText(imported.displayName) ===
    normalizedText(candidate.displayName)
  ) {
    score += 0.2;
    reasons.push("name-exact");
  }
  if (
    imported.birthDate &&
    candidate.birthDate &&
    imported.birthDate === candidate.birthDate
  ) {
    score += 0.2;
    reasons.push("birth-date-exact");
  }
  if (
    imported.homeMarket &&
    candidate.homeMarket &&
    normalizedText(imported.homeMarket) === normalizedText(candidate.homeMarket)
  ) {
    score += 0.08;
    reasons.push("market-exact");
  }
  return {
    personId: candidate.personId,
    score: Math.min(1, Number(score.toFixed(4))),
    reasons,
  };
}

export interface IdentityResolutionDecision {
  readonly action: "link" | "review" | "create";
  readonly personId?: string;
  readonly score: number;
  readonly margin: number;
  readonly candidates: readonly IdentityCandidateScore[];
}

export function resolveImportedIdentity(input: {
  readonly imported: ImportedIdentity;
  readonly candidates: readonly IdentityRecord[];
  readonly autoLinkThreshold?: number;
  readonly reviewThreshold?: number;
  readonly minimumMargin?: number;
}): IdentityResolutionDecision {
  const candidates = input.candidates
    .map((candidate) => scoreIdentityCandidate(input.imported, candidate))
    .sort((a, b) => b.score - a.score || a.personId.localeCompare(b.personId));
  const best = candidates[0];
  const second = candidates[1];
  const score = best?.score ?? 0;
  const margin = Number((score - (second?.score ?? 0)).toFixed(4));
  const autoLinkThreshold = input.autoLinkThreshold ?? 0.9;
  const reviewThreshold = input.reviewThreshold ?? 0.45;
  const minimumMargin = input.minimumMargin ?? 0.12;
  const externallyLinked =
    best?.reasons.includes("linked-external-id") ?? false;

  if (
    best &&
    (externallyLinked ||
      (score >= autoLinkThreshold && margin >= minimumMargin))
  ) {
    return {
      action: "link",
      personId: best.personId,
      score,
      margin,
      candidates,
    };
  }
  if (best && score >= reviewThreshold) {
    return {
      action: "review",
      personId: best.personId,
      score,
      margin,
      candidates,
    };
  }
  return { action: "create", score, margin, candidates };
}

export interface ImportedRatingEvent {
  readonly source: string;
  readonly externalEventId: string;
  readonly occurredAt: string;
  readonly payloadHash: string;
  readonly verificationWeight: number;
}

export function unionImportedRatingHistory(
  histories: readonly (readonly ImportedRatingEvent[])[],
): {
  readonly events: readonly ImportedRatingEvent[];
  readonly conflicts: readonly {
    readonly key: string;
    readonly payloadHashes: readonly string[];
  }[];
} {
  const byKey = new Map<string, ImportedRatingEvent>();
  const conflicts = new Map<string, Set<string>>();
  for (const event of histories.flat()) {
    const key = `${event.source}:${event.externalEventId}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, event);
      continue;
    }
    if (existing.payloadHash !== event.payloadHash) {
      const hashes = conflicts.get(key) ?? new Set([existing.payloadHash]);
      hashes.add(event.payloadHash);
      conflicts.set(key, hashes);
    }
    if (event.verificationWeight > existing.verificationWeight) {
      byKey.set(key, event);
    }
  }
  return {
    events: [...byKey.values()].sort(
      (a, b) =>
        a.occurredAt.localeCompare(b.occurredAt) ||
        a.source.localeCompare(b.source) ||
        a.externalEventId.localeCompare(b.externalEventId),
    ),
    conflicts: [...conflicts.entries()]
      .map(([key, hashes]) => ({
        key,
        payloadHashes: [...hashes].sort(),
      }))
      .sort((a, b) => a.key.localeCompare(b.key)),
  };
}
