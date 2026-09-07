export type RosterLinkResolution<T> =
  | { readonly kind: "matched"; readonly value: T }
  | { readonly kind: "ambiguous" }
  | { readonly kind: "missing" };

function normalizedName(value: string | null | undefined): string {
  return value?.trim().replace(/\s+/g, " ").toLocaleLowerCase() ?? "";
}

/**
 * Resolves a reservation place from a match-roster row. New reservations use
 * the durable id. Person id and name are deliberately legacy-only fallbacks.
 */
export function resolveCourtParticipantForPickup<
  T extends {
    readonly id: string;
    readonly personId: string | null;
    readonly invitedName: string | null;
  },
>(input: {
  readonly pickupParticipant: {
    readonly courtBookingParticipantId: string | null;
    readonly personId: string;
    readonly displayName: string | null;
  };
  readonly courtParticipants: readonly T[];
}): RosterLinkResolution<T> {
  if (input.pickupParticipant.courtBookingParticipantId) {
    const exact = input.courtParticipants.find(
      (candidate) =>
        candidate.id === input.pickupParticipant.courtBookingParticipantId,
    );
    return exact ? { kind: "matched", value: exact } : { kind: "missing" };
  }

  const personMatch = input.courtParticipants.find(
    (candidate) => candidate.personId === input.pickupParticipant.personId,
  );
  if (personMatch) return { kind: "matched", value: personMatch };

  const displayName = normalizedName(input.pickupParticipant.displayName);
  if (!displayName) return { kind: "missing" };
  const nameMatches = input.courtParticipants.filter(
    (candidate) =>
      !candidate.personId &&
      normalizedName(candidate.invitedName) === displayName,
  );
  if (nameMatches.length === 1) {
    return { kind: "matched", value: nameMatches[0]! };
  }
  return nameMatches.length > 1 ? { kind: "ambiguous" } : { kind: "missing" };
}

/**
 * Resolves the match placeholder for a reservation invitation. For old rows,
 * any still-unlinked same-name placeholder is safe to claim because it has no
 * identity until the invitee signs in; the conditional update prevents races.
 */
export function resolvePickupParticipantForCourtParticipant<
  T extends {
    readonly courtBookingParticipantId: string | null;
    readonly personId: string;
    readonly displayName: string | null;
  },
>(input: {
  readonly courtParticipant: {
    readonly id: string;
    readonly personId: string | null;
    readonly invitedName: string | null;
  };
  readonly pickupParticipants: readonly T[];
}): T | undefined {
  const exact = input.pickupParticipants.find(
    (candidate) =>
      candidate.courtBookingParticipantId === input.courtParticipant.id,
  );
  if (exact) return exact;

  if (input.courtParticipant.personId) {
    return input.pickupParticipants.find(
      (candidate) => candidate.personId === input.courtParticipant.personId,
    );
  }

  const invitedName = normalizedName(input.courtParticipant.invitedName);
  if (!invitedName) return undefined;
  return input.pickupParticipants.find(
    (candidate) =>
      !candidate.courtBookingParticipantId &&
      normalizedName(candidate.displayName) === invitedName,
  );
}
