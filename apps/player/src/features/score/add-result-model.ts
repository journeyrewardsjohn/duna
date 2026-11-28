/**
 * "Add a result" in data (M-P4a). Pure; tested.
 */
import type { MatchType } from "./formats";
import type { EnteredSet } from "./result-rules";
import type { LiveSide, TeamSide } from "./scoring-machine";
import type { ChosenPlace } from "./where-types";

/** "Today", "Yesterday", or "Wed, Nov 25". Pure. */
export function dayLabel(daysBack: number, now: Date): string {
  if (daysBack === 0) return "Today";
  if (daysBack === 1) return "Yesterday";
  const date = new Date(now.getTime() - daysBack * 86_400_000);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

/** When it was played: now for today, midday for an earlier day. Pure. */
export function playedAtFor(daysBack: number, now: Date): string {
  if (daysBack === 0) return now.toISOString();
  const date = new Date(now.getTime() - daysBack * 86_400_000);
  date.setHours(12, 0, 0, 0);
  return date.toISOString();
}

/** The `player.recordCompletedMatch` input. Pure. */
export function recordInput(input: {
  readonly teams: Readonly<Record<TeamSide, LiveSide>>;
  readonly where: ChosenPlace | null;
  readonly playedAt: string;
  readonly sets: readonly EnteredSet[];
  readonly setsToWin: 1 | 2 | 3;
  readonly matchType: MatchType;
  readonly deviceId: string;
  readonly idempotencyKey: string;
}) {
  const ids = (side: TeamSide) =>
    input.teams[side].people.flatMap((person) =>
      person.personId ? [person.personId] : [],
    );
  return {
    teamAIds: ids("A"),
    teamBIds: ids("B"),
    provisionalParticipants: (["A", "B"] as const).flatMap((side) =>
      input.teams[side].people.flatMap((person) =>
        person.personId
          ? []
          : [
              {
                side,
                givenName: person.givenName ?? person.name,
                familyName: person.familyName ?? "",
                ...(person.email ? { email: person.email } : {}),
                ...(person.phoneE164 ? { phoneE164: person.phoneE164 } : {}),
              },
            ],
      ),
    ),
    ...(input.where?.venueId ? { venueId: input.where.venueId } : {}),
    ...(input.where?.location && !input.where.venueId
      ? { location: input.where.location }
      : {}),
    playedAt: input.playedAt,
    setsToWin: input.setsToWin,
    setScores: input.sets.map((set) => ({ a: set.you, b: set.them })),
    matchType: input.matchType,
    allPlayersAgreedToRecord: true as const,
    deviceId: input.deviceId,
    idempotencyKey: input.idempotencyKey,
  };
}
