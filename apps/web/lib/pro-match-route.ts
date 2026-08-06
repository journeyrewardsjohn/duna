type ProfessionalMatchRouteCandidate = {
  readonly id: string;
  readonly slug: string;
  readonly canonicalPath: string;
};

export function findProfessionalMatchReplacement(
  matches: readonly ProfessionalMatchRouteCandidate[],
  input: {
    readonly matchId: string;
    readonly matchSlug: string;
  },
): ProfessionalMatchRouteCandidate | undefined {
  const replacements = matches.filter(
    (match) => match.id !== input.matchId && match.slug === input.matchSlug,
  );

  return replacements.length === 1 ? replacements[0] : undefined;
}
