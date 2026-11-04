/** Routing is a destination decision, never authorization to read or mutate club data.
 * Callers supply only clubs/conversations already authorized for the signed-in person.
 * Unresolved messages stay outside every club inbox. */
export interface ClubDestination {
  readonly organizationId: string;
  readonly label: string;
  readonly conversationIds: readonly string[];
}

export type ClubRoutingDecision =
  | {
      readonly status: "routed";
      readonly organizationId: string;
      readonly conversationId?: string;
      readonly reason: "conversation" | "selection" | "named-club";
    }
  | {
      readonly status: "clarify";
      readonly reason:
        "choose-club" | "conflicting-context" | "unavailable-context";
      readonly choices: readonly { organizationId: string; label: string }[];
    };

export function resolveClubDestination(input: {
  readonly destinations: readonly ClubDestination[];
  readonly conversationId?: string;
  readonly selectedOrganizationId?: string;
  readonly message?: string;
}): ClubRoutingDecision {
  const choices = [
    ...new Map(
      input.destinations.map((club) => [
        club.organizationId,
        { organizationId: club.organizationId, label: club.label },
      ]),
    ).values(),
  ];
  const clarify = (
    reason: "choose-club" | "conflicting-context" | "unavailable-context",
  ): ClubRoutingDecision => ({ status: "clarify", reason, choices });
  if (input.conversationId) {
    const matches = input.destinations.filter((club) =>
      club.conversationIds.includes(input.conversationId!),
    );
    if (matches.length !== 1) return clarify("unavailable-context");
    const club = matches[0]!;
    if (
      input.selectedOrganizationId &&
      input.selectedOrganizationId !== club.organizationId
    )
      return clarify("conflicting-context");
    return {
      status: "routed",
      organizationId: club.organizationId,
      conversationId: input.conversationId,
      reason: "conversation",
    };
  }
  if (input.selectedOrganizationId) {
    const club = input.destinations.find(
      (candidate) => candidate.organizationId === input.selectedOrganizationId,
    );
    return club
      ? {
          status: "routed",
          organizationId: club.organizationId,
          reason: "selection",
        }
      : clarify("unavailable-context");
  }
  // Whole club names are deterministic hints. Generic intent and pronouns never
  // select a club, including when there is only one historic relationship.
  const normalize = (value: string) =>
    value
      .normalize("NFKC")
      .toLocaleLowerCase("en")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  const message = ` ${normalize(input.message ?? "")} `;
  const named = input.destinations.filter((club) => {
    const label = normalize(club.label);
    return label.length >= 4 && message.includes(` ${label} `);
  });
  const ids = [...new Set(named.map((club) => club.organizationId))];
  if (ids.length === 1)
    return { status: "routed", organizationId: ids[0]!, reason: "named-club" };
  return clarify(ids.length > 1 ? "conflicting-context" : "choose-club");
}
