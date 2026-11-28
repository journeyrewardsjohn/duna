/**
 * Coverage (B3a): which scheduled sessions a member's unavailability
 * affects, and who could take them, ranked by plain rules. Pure; the
 * service loads the data and a person confirms every reassignment.
 *
 * Ranking (`rankSubstitutes`):
 * 1. Only members free for the whole session (availabilityFor, ignoring the
 *    session itself) are suggested.
 * 2. Members the data says are not qualified for the offering are left out;
 *    "qualified" ranks above "the data does not say".
 * 3. A member whose stated weekly maximum the session would exceed is left out.
 * 4. Already at the session's venue that day ranks higher.
 * 5. Fewer scheduled minutes that week ranks higher.
 * 6. Ties break by display name, then id, so the order is stable.
 */
import {
  type AvailabilityRange,
  type StaffAvailabilityInputs,
  type StaffCommitment,
  isFreeThroughout,
} from "./availability";

export interface CoverageSession {
  readonly id: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly venueId?: string;
}

export interface CoverageCandidate {
  readonly staffProfileId: string;
  readonly displayName: string;
  readonly inputs: StaffAvailabilityInputs;
  /** true / false when the data says; undefined when it does not. */
  readonly qualified?: boolean;
  /** Venues the member is already at on the session's local day. */
  readonly venueIdsThatDay: readonly string[];
  /** Minutes already scheduled in the session's week. */
  readonly minutesThisWeek: number;
  /** Stated weekly maximum, if the club recorded one. */
  readonly weeklyMaxMinutes?: number;
}

export interface RankedSubstitute {
  readonly staffProfileId: string;
  readonly rank: number;
  readonly qualified: "yes" | "unknown";
  readonly atVenueThatDay: boolean;
  readonly minutesThisWeek: number;
  /** One plain sentence for the coverage panel. */
  readonly rationale: string;
}

function minutesBetween(range: AvailabilityRange): number {
  return (Date.parse(range.endsAt) - Date.parse(range.startsAt)) / 60_000;
}

function hours(minutes: number): string {
  const value = Math.round((minutes / 60) * 10) / 10;
  return `${value} ${value === 1 ? "hour" : "hours"}`;
}

export function rankSubstitutes(input: {
  readonly session: CoverageSession;
  readonly candidates: readonly CoverageCandidate[];
  /** Never suggest these (the member who is away). */
  readonly excludeStaffProfileIds?: readonly string[];
}): RankedSubstitute[] {
  const excluded = new Set(input.excludeStaffProfileIds ?? []);
  const sessionMinutes = minutesBetween(input.session);
  const eligible = input.candidates.filter(
    (candidate) =>
      !excluded.has(candidate.staffProfileId) &&
      candidate.qualified !== false &&
      (candidate.weeklyMaxMinutes === undefined ||
        candidate.minutesThisWeek + sessionMinutes <=
          candidate.weeklyMaxMinutes) &&
      isFreeThroughout(candidate, input.session, candidate.inputs, {
        ignoreCommitmentIds: [input.session.id],
      }),
  );
  const keyed = eligible.map((candidate) => ({
    candidate,
    qualified: candidate.qualified === true ? 0 : 1,
    atVenue:
      input.session.venueId !== undefined &&
      candidate.venueIdsThatDay.includes(input.session.venueId)
        ? 0
        : 1,
  }));
  keyed.sort(
    (left, right) =>
      left.qualified - right.qualified ||
      left.atVenue - right.atVenue ||
      left.candidate.minutesThisWeek - right.candidate.minutesThisWeek ||
      left.candidate.displayName.localeCompare(right.candidate.displayName) ||
      left.candidate.staffProfileId.localeCompare(
        right.candidate.staffProfileId,
      ),
  );
  return keyed.map(({ candidate, qualified, atVenue }, rank) => {
    const reasons = [
      "Free for the whole session",
      qualified === 0 ? "set up for this offering" : undefined,
      atVenue === 0 ? "already at this venue that day" : undefined,
      `${hours(candidate.minutesThisWeek)} scheduled this week`,
    ].filter((reason): reason is string => Boolean(reason));
    return {
      staffProfileId: candidate.staffProfileId,
      rank,
      qualified: qualified === 0 ? "yes" : "unknown",
      atVenueThatDay: atVenue === 0,
      minutesThisWeek: candidate.minutesThisWeek,
      rationale: `${reasons.join(", ")}.`,
    };
  });
}

/**
 * Commitments that a span of unavailability touches (time off approved, a
 * blackout added, "sick today"): the sessions that now need cover.
 */
export function affectedCommitments(input: {
  readonly commitments: readonly StaffCommitment[];
  readonly unavailable: AvailabilityRange;
  readonly kinds?: readonly StaffCommitment["kind"][];
}): StaffCommitment[] {
  const start = Date.parse(input.unavailable.startsAt);
  const end = Date.parse(input.unavailable.endsAt);
  return input.commitments
    .filter(
      (commitment) =>
        (!input.kinds || input.kinds.includes(commitment.kind)) &&
        Date.parse(commitment.startsAt) < end &&
        Date.parse(commitment.endsAt) > start,
    )
    .sort(
      (left, right) =>
        Date.parse(left.startsAt) - Date.parse(right.startsAt) ||
        left.id.localeCompare(right.id),
    );
}

/** Scheduled minutes of commitments that fall in [weekStart, weekEnd). */
export function scheduledMinutes(
  commitments: readonly StaffCommitment[],
  range: AvailabilityRange,
): number {
  const start = Date.parse(range.startsAt);
  const end = Date.parse(range.endsAt);
  return commitments.reduce((total, commitment) => {
    const overlapStart = Math.max(start, Date.parse(commitment.startsAt));
    const overlapEnd = Math.min(end, Date.parse(commitment.endsAt));
    return overlapEnd > overlapStart
      ? total + (overlapEnd - overlapStart) / 60_000
      : total;
  }, 0);
}
