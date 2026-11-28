/**
 * The live match's sync rules (M-P4a). Pure; tested.
 */
import type { LiveMatch, TeamSide } from "./scoring-machine";

/** How a failed call is handled. Pure; tested through `classifyFailure`. */
export function classifyFailure(
  reason: unknown,
): "network" | "conflict" | "other-device" | "closed" | "other" {
  const code = (reason as { data?: { code?: string } } | null)?.data?.code;
  if (code === "CONFLICT") return "conflict";
  if (code === "FORBIDDEN") {
    const message = reason instanceof Error ? reason.message : "";
    return /device/i.test(message) ? "other-device" : "other";
  }
  if (code === "PRECONDITION_FAILED") return "closed";
  if (code) return "other";
  return "network";
}

/** The `player.startMatch` input for a match. Pure. */
export function startInput(
  match: LiveMatch,
  deviceId: string,
  idempotencyKey: string,
) {
  const ids = (side: TeamSide) =>
    match.teams[side].people.flatMap((person) =>
      person.personId ? [person.personId] : [],
    );
  const provisionalParticipants = (["A", "B"] as const).flatMap((side) =>
    match.teams[side].people.flatMap((person) =>
      person.personId
        ? []
        : [
            {
              side,
              givenName: person.givenName ?? person.name.split(/\s+/)[0] ?? "",
              familyName:
                person.familyName ??
                person.name.split(/\s+/).slice(1).join(" "),
              ...(person.email ? { email: person.email } : {}),
              ...(person.phoneE164 ? { phoneE164: person.phoneE164 } : {}),
            },
          ],
    ),
  );
  const teamAIds = ids("A");
  const teamBIds = ids("B");
  const firstServer = (match.initialServer === "A" ? teamAIds : teamBIds)[0];
  return {
    teamAIds,
    teamBIds,
    provisionalParticipants,
    ...(match.venue ? { venueId: match.venue.id } : {}),
    scoringSystem: match.format.scoringSystem,
    matchType: match.matchType,
    allPlayersAgreedToRecord: true as const,
    serviceOrder: { A: teamAIds, B: teamBIds },
    ...(firstServer ? { initialServerPersonId: firstServer } : {}),
    initialServerSide: match.initialServer,
    deviceId,
    idempotencyKey,
  };
}
