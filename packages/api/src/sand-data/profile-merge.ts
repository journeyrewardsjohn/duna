export const playerMergeFieldDefinitions = [
  { key: "displayName", label: "Player name", group: "Identity", kind: "text" },
  { key: "handle", label: "Duna handle", group: "Identity", kind: "text" },
  { key: "givenName", label: "Given name", group: "Identity", kind: "text" },
  { key: "familyName", label: "Family name", group: "Identity", kind: "text" },
  { key: "avatarUrl", label: "Profile photo", group: "Identity", kind: "text" },
  { key: "homeMarket", label: "Home market", group: "Identity", kind: "text" },
  {
    key: "genderCategory",
    label: "Gender category",
    group: "Identity",
    kind: "text",
  },
  { key: "birthDate", label: "Birth date", group: "Identity", kind: "text" },
  {
    key: "heightMillimeters",
    label: "Height",
    group: "Identity",
    kind: "number",
  },
  {
    key: "professionalSince",
    label: "Professional since",
    group: "Playing profile",
    kind: "text",
  },
  {
    key: "professionalDefinition",
    label: "Professional evidence",
    group: "Playing profile",
    kind: "text",
  },
  {
    key: "playingExperience",
    label: "Playing experience",
    group: "Playing profile",
    kind: "text",
  },
  {
    key: "playedIndoorPrior",
    label: "Played indoor previously",
    group: "Playing profile",
    kind: "boolean",
  },
  {
    key: "yearsPlaying",
    label: "Years playing",
    group: "Playing profile",
    kind: "number",
  },
  {
    key: "collegeName",
    label: "College",
    group: "Playing profile",
    kind: "text",
  },
  {
    key: "experienceSummary",
    label: "Experience summary",
    group: "Playing profile",
    kind: "text",
  },
  {
    key: "shortBio",
    label: "Introduction",
    group: "Public story",
    kind: "text",
  },
  { key: "biography", label: "Biography", group: "Public story", kind: "text" },
  { key: "countryCode", label: "Country", group: "Public story", kind: "text" },
  { key: "hometown", label: "Hometown", group: "Public story", kind: "text" },
  {
    key: "profileCollegeName",
    label: "Public college",
    group: "Public story",
    kind: "text",
  },
  {
    key: "collegeLogoUrl",
    label: "College logo",
    group: "Public story",
    kind: "text",
  },
  {
    key: "playingRole",
    label: "Playing role",
    group: "Public story",
    kind: "text",
  },
  {
    key: "cutoutImageUrl",
    label: "Player cutout",
    group: "Public artwork",
    kind: "text",
  },
  {
    key: "heroImageUrl",
    label: "Hero image",
    group: "Public artwork",
    kind: "text",
  },
  {
    key: "heroVideoUrl",
    label: "Hero video",
    group: "Public artwork",
    kind: "text",
  },
  {
    key: "imageAlt",
    label: "Image description",
    group: "Public artwork",
    kind: "text",
  },
  {
    key: "careerEvents",
    label: "Career events",
    group: "Career record",
    kind: "number",
  },
  {
    key: "careerWins",
    label: "Event wins",
    group: "Career record",
    kind: "number",
  },
  {
    key: "careerPodiums",
    label: "Podiums",
    group: "Career record",
    kind: "number",
  },
  {
    key: "careerGold",
    label: "Gold medals",
    group: "Career record",
    kind: "number",
  },
  {
    key: "careerSilver",
    label: "Silver medals",
    group: "Career record",
    kind: "number",
  },
  {
    key: "careerBronze",
    label: "Bronze medals",
    group: "Career record",
    kind: "number",
  },
  {
    key: "careerEarningsMinor",
    label: "Career earnings",
    group: "Career record",
    kind: "number",
  },
  {
    key: "careerEarningsCurrency",
    label: "Earnings currency",
    group: "Career record",
    kind: "text",
  },
  {
    key: "links",
    label: "Profile links",
    group: "Evidence",
    kind: "collection",
  },
  {
    key: "news",
    label: "Recent coverage",
    group: "Evidence",
    kind: "collection",
  },
  {
    key: "researchEvidence",
    label: "Research evidence",
    group: "Evidence",
    kind: "collection",
  },
] as const;

export type PlayerMergeFieldKey =
  (typeof playerMergeFieldDefinitions)[number]["key"];
export type PlayerMergeFieldChoice =
  "source" | "target" | "combine" | "discard";
export type PlayerMergeFieldValue =
  string | number | boolean | readonly Record<string, unknown>[] | null;

export interface PlayerMergeCandidate {
  readonly id: string;
  readonly displayName: string;
  readonly handle: string;
  readonly profileClaimStatus: string;
  readonly profileVisibility: string;
  readonly status: string;
  readonly isMinor: boolean;
  readonly hasAccount: boolean;
  readonly publicationStatus?: string;
  readonly completeness: number;
  readonly sourceConnections: number;
  readonly importedMatches: number;
  readonly ratingEvents: number;
  readonly values: Readonly<
    Partial<Record<PlayerMergeFieldKey, PlayerMergeFieldValue>>
  >;
}

export interface PlayerMergeFieldPlan {
  readonly key: PlayerMergeFieldKey;
  readonly label: string;
  readonly group: string;
  readonly kind: "text" | "number" | "boolean" | "collection";
  readonly sourceValue: PlayerMergeFieldValue;
  readonly targetValue: PlayerMergeFieldValue;
  readonly status:
    "empty" | "same" | "source-fill" | "target-fill" | "combined" | "conflict";
  readonly suggestedChoice: PlayerMergeFieldChoice;
  readonly suggestedValue: PlayerMergeFieldValue;
}

export interface PlayerMergePlan {
  readonly source: PlayerMergeCandidate;
  readonly target: PlayerMergeCandidate;
  readonly confidence: number;
  readonly reasons: readonly string[];
  readonly blockers: readonly string[];
  readonly canMerge: boolean;
  readonly fields: readonly PlayerMergeFieldPlan[];
  readonly conflictCount: number;
  readonly autoFilledCount: number;
}

function canMergeAway(candidate: PlayerMergeCandidate): boolean {
  return (
    ["unclaimed", "claim-pending"].includes(candidate.profileClaimStatus) &&
    !candidate.hasAccount &&
    !candidate.isMinor &&
    candidate.status !== "merged"
  );
}

function publicationScore(status?: string): number {
  return status === "published"
    ? 300
    : status === "review"
      ? 160
      : status === "draft"
        ? 60
        : 0;
}

function candidateScore(candidate: PlayerMergeCandidate): number {
  const claimScore =
    candidate.profileClaimStatus === "claimed"
      ? 2_000
      : candidate.profileClaimStatus === "claim-pending"
        ? 500
        : 0;
  return (
    claimScore +
    (candidate.hasAccount ? 3_000 : 0) +
    publicationScore(candidate.publicationStatus) +
    (candidate.profileVisibility === "public" ? 120 : 0) +
    candidate.completeness * 8 +
    Math.min(candidate.sourceConnections, 10) * 12 +
    Math.min(candidate.importedMatches, 100) +
    Math.min(candidate.ratingEvents, 100)
  );
}

function meaningful(value: PlayerMergeFieldValue | undefined): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  return value.length > 0;
}

function equalValue(
  left: PlayerMergeFieldValue,
  right: PlayerMergeFieldValue,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function combineCollections(
  target: PlayerMergeFieldValue,
  source: PlayerMergeFieldValue,
): readonly Record<string, unknown>[] {
  const rows = [
    ...(Array.isArray(target) ? target : []),
    ...(Array.isArray(source) ? source : []),
  ];
  return [
    ...new Map(rows.map((row) => [JSON.stringify(row), row] as const)).values(),
  ];
}

function fieldPlan(
  definition: (typeof playerMergeFieldDefinitions)[number],
  source: PlayerMergeCandidate,
  target: PlayerMergeCandidate,
): PlayerMergeFieldPlan {
  const sourceValue = source.values[definition.key] ?? null;
  const targetValue = target.values[definition.key] ?? null;
  const hasSource = meaningful(sourceValue);
  const hasTarget = meaningful(targetValue);
  if (!hasSource && !hasTarget) {
    return {
      ...definition,
      sourceValue,
      targetValue,
      status: "empty",
      suggestedChoice: "discard",
      suggestedValue: null,
    };
  }
  if (!hasTarget) {
    return {
      ...definition,
      sourceValue,
      targetValue,
      status: "source-fill",
      suggestedChoice: "source",
      suggestedValue: sourceValue,
    };
  }
  if (!hasSource) {
    return {
      ...definition,
      sourceValue,
      targetValue,
      status: "target-fill",
      suggestedChoice: "target",
      suggestedValue: targetValue,
    };
  }
  if (equalValue(sourceValue, targetValue)) {
    return {
      ...definition,
      sourceValue,
      targetValue,
      status: "same",
      suggestedChoice: "target",
      suggestedValue: targetValue,
    };
  }
  if (definition.kind === "collection") {
    const combined = combineCollections(targetValue, sourceValue);
    return {
      ...definition,
      sourceValue,
      targetValue,
      status: "combined",
      suggestedChoice: "combine",
      suggestedValue: combined,
    };
  }
  return {
    ...definition,
    sourceValue,
    targetValue,
    status: "conflict",
    suggestedChoice: "target",
    suggestedValue: targetValue,
  };
}

export function buildPlayerMergePlan(input: {
  readonly profileA: PlayerMergeCandidate;
  readonly profileB: PlayerMergeCandidate;
  readonly preferredTargetPersonId?: string;
  readonly additionalBlockers?: readonly string[];
}): PlayerMergePlan {
  const aDisposable = canMergeAway(input.profileA);
  const bDisposable = canMergeAway(input.profileB);
  const aScore = candidateScore(input.profileA);
  const bScore = candidateScore(input.profileB);
  const preferredTarget = [input.profileA, input.profileB].find(
    (candidate) => candidate.id === input.preferredTargetPersonId,
  );
  const preferredSource = preferredTarget
    ? preferredTarget.id === input.profileA.id
      ? input.profileB
      : input.profileA
    : undefined;
  const target =
    preferredTarget && preferredSource && canMergeAway(preferredSource)
      ? preferredTarget
      : aDisposable !== bDisposable
        ? aDisposable
          ? input.profileB
          : input.profileA
        : aScore >= bScore
          ? input.profileA
          : input.profileB;
  const source =
    target.id === input.profileA.id ? input.profileB : input.profileA;
  const reasons: string[] = [];
  if (target.profileClaimStatus === "claimed") {
    reasons.push(
      "Preserves the claimed Duna account as the canonical identity.",
    );
  }
  if (target.publicationStatus === "published") {
    reasons.push(
      "Preserves the reviewed public profile and its published URL.",
    );
  }
  if (target.completeness > source.completeness) {
    reasons.push("Keeps the more complete player record as the survivor.");
  }
  if (target.sourceConnections > source.sourceConnections) {
    reasons.push("Keeps the identity with more verified source connections.");
  }
  if (reasons.length === 0) {
    reasons.push(
      "Keeps the stronger canonical record and fills its gaps from the duplicate.",
    );
  }
  const blockers = [...(input.additionalBlockers ?? [])];
  if (input.profileA.id === input.profileB.id) {
    blockers.push("Choose two different player profiles.");
  }
  if (!canMergeAway(source)) {
    blockers.push(
      source.hasAccount || source.profileClaimStatus === "claimed"
        ? `${source.displayName} is attached to a claimed account and cannot be merged automatically.`
        : `${source.displayName} is not an eligible unclaimed duplicate.`,
    );
  }
  if (target.status === "merged" || target.profileClaimStatus === "merged") {
    blockers.push("The suggested canonical profile has already been merged.");
  }
  const fields = playerMergeFieldDefinitions.map((definition) =>
    fieldPlan(definition, source, target),
  );
  const scoreDifference = Math.abs(aScore - bScore);
  const confidence =
    target.profileClaimStatus === "claimed" &&
    source.profileClaimStatus !== "claimed"
      ? 98
      : aDisposable !== bDisposable
        ? 94
        : Math.min(92, 72 + Math.round(scoreDifference / 80));
  return {
    source,
    target,
    confidence,
    reasons,
    blockers: [...new Set(blockers)],
    canMerge: blockers.length === 0,
    fields,
    conflictCount: fields.filter((field) => field.status === "conflict").length,
    autoFilledCount: fields.filter((field) =>
      ["source-fill", "target-fill", "combined"].includes(field.status),
    ).length,
  };
}

export function resolvePlayerMergeFields(
  plan: PlayerMergePlan,
  choices: Readonly<
    Partial<Record<PlayerMergeFieldKey, PlayerMergeFieldChoice>>
  >,
): Readonly<Record<PlayerMergeFieldKey, PlayerMergeFieldValue>> {
  return Object.fromEntries(
    plan.fields.map((field) => {
      const choice = choices[field.key] ?? field.suggestedChoice;
      const value =
        choice === "source"
          ? field.sourceValue
          : choice === "target"
            ? field.targetValue
            : choice === "combine" && field.kind === "collection"
              ? combineCollections(field.targetValue, field.sourceValue)
              : null;
      return [field.key, value];
    }),
  ) as Readonly<Record<PlayerMergeFieldKey, PlayerMergeFieldValue>>;
}

export interface PlayerMergeMatchRow {
  readonly id: string;
  readonly participants: readonly {
    readonly personId?: string;
    readonly side: "A" | "B";
  }[];
  readonly sets: readonly { readonly a: number; readonly b: number }[];
  readonly playedAt?: string;
  readonly importState: string;
  readonly canonicalMatchId?: string;
  readonly sourcePriority?: number;
}

export interface PlayerMergeDuplicateMatchGroup {
  readonly key: string;
  readonly primary: PlayerMergeMatchRow;
  readonly duplicates: readonly PlayerMergeMatchRow[];
}

export function mergedMatchIdentityKey(
  row: PlayerMergeMatchRow,
  sourcePersonId: string,
  targetPersonId: string,
): string | undefined {
  const participants = row.participants.map((participant) => ({
    ...participant,
    personId:
      participant.personId === sourcePersonId
        ? targetPersonId
        : participant.personId,
  }));
  if (
    participants.length !== 4 ||
    participants.some((participant) => !participant.personId)
  ) {
    return undefined;
  }
  const sideA = participants
    .filter((participant) => participant.side === "A")
    .map((participant) => participant.personId!)
    .sort();
  const sideB = participants
    .filter((participant) => participant.side === "B")
    .map((participant) => participant.personId!)
    .sort();
  if (sideA.length !== 2 || sideB.length !== 2) return undefined;
  const sides = [sideA.join("|"), sideB.join("|")].sort();
  const score = row.sets
    .map((set) => `${Math.min(set.a, set.b)}-${Math.max(set.a, set.b)}`)
    .sort()
    .join(",");
  return [row.playedAt?.slice(0, 10) ?? "", ...sides, score].join("::");
}

function primaryMatchScore(row: PlayerMergeMatchRow): number {
  const stateScore =
    row.importState === "approved"
      ? 10_000
      : row.importState === "ready"
        ? 4_000
        : row.importState === "needs-mapping"
          ? 2_000
          : row.importState === "staged"
            ? 1_000
            : row.importState === "duplicate"
              ? -1_000
              : -2_000;
  return (
    stateScore + (row.canonicalMatchId ? 5_000 : 0) - (row.sourcePriority ?? 99)
  );
}

export function planMergedMatchDeduplication(input: {
  readonly matches: readonly PlayerMergeMatchRow[];
  readonly sourcePersonId: string;
  readonly targetPersonId: string;
}): readonly PlayerMergeDuplicateMatchGroup[] {
  const groups = new Map<string, PlayerMergeMatchRow[]>();
  for (const match of input.matches) {
    const key = mergedMatchIdentityKey(
      match,
      input.sourcePersonId,
      input.targetPersonId,
    );
    if (!key) continue;
    const rows = groups.get(key) ?? [];
    rows.push(match);
    groups.set(key, rows);
  }
  return [...groups.entries()].flatMap(([key, rows]) => {
    if (rows.length < 2) return [];
    const ordered = [...rows].sort(
      (left, right) =>
        primaryMatchScore(right) - primaryMatchScore(left) ||
        left.id.localeCompare(right.id),
    );
    const [primary, ...duplicates] = ordered;
    return primary ? [{ key, primary, duplicates }] : [];
  });
}
