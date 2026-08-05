export type AvailabilityMode =
  | "open"
  | "private-lessons-only"
  | "group-only"
  | "league-reserved"
  | "rentals-only"
  | "members-only"
  | "maintenance"
  | "blocked";

export * from "./arrival";

export interface TimeRange {
  readonly startsAt: string;
  readonly endsAt: string;
}

export interface AvailabilityBlock extends TimeRange {
  readonly id: string;
  readonly resourceId: string;
  readonly mode: AvailabilityMode;
}

export interface BusyRange extends TimeRange {
  readonly id: string;
  readonly resourceId: string;
  readonly kind: "booking" | "buffer" | "blackout" | "hold";
}

export interface SlotRequest {
  readonly coachId?: string;
  readonly courtIds: readonly string[];
  readonly durationMinutes: number;
  readonly bufferBeforeMinutes: number;
  readonly bufferAfterMinutes: number;
  readonly incrementMinutes: number;
  readonly window: TimeRange;
  readonly allowedModes: readonly AvailabilityMode[];
  readonly coachAvailability?: readonly AvailabilityBlock[];
  readonly courtAvailability: readonly AvailabilityBlock[];
  readonly busyRanges: readonly BusyRange[];
}

export interface AvailableSlot {
  readonly startsAt: string;
  readonly endsAt: string;
  readonly courtId: string;
  readonly coachId?: string;
  readonly mode: AvailabilityMode;
}

function milliseconds(value: string): number {
  const parsed = new Date(value).getTime();
  if (!Number.isFinite(parsed))
    throw new Error(`Invalid ISO timestamp: ${value}`);
  return parsed;
}

function intervalContains(
  container: TimeRange,
  startsAt: number,
  endsAt: number,
): boolean {
  return (
    milliseconds(container.startsAt) <= startsAt &&
    milliseconds(container.endsAt) >= endsAt
  );
}

function overlaps(startsAt: number, endsAt: number, range: TimeRange): boolean {
  return (
    startsAt < milliseconds(range.endsAt) &&
    endsAt > milliseconds(range.startsAt)
  );
}

export function solveAvailableSlots(
  request: SlotRequest,
): readonly AvailableSlot[] {
  if (
    request.durationMinutes <= 0 ||
    request.incrementMinutes <= 0 ||
    request.bufferBeforeMinutes < 0 ||
    request.bufferAfterMinutes < 0
  ) {
    throw new Error("Durations and increments must be valid");
  }
  const windowStart = milliseconds(request.window.startsAt);
  const windowEnd = milliseconds(request.window.endsAt);
  const durationMs = request.durationMinutes * 60_000;
  const stepMs = request.incrementMinutes * 60_000;
  const beforeMs = request.bufferBeforeMinutes * 60_000;
  const afterMs = request.bufferAfterMinutes * 60_000;
  const slots: AvailableSlot[] = [];

  for (const courtId of request.courtIds) {
    const courtBlocks = request.courtAvailability.filter(
      (block) =>
        block.resourceId === courtId &&
        request.allowedModes.includes(block.mode) &&
        block.mode !== "blocked" &&
        block.mode !== "maintenance",
    );
    for (
      let startsAt = windowStart;
      startsAt + durationMs <= windowEnd;
      startsAt += stepMs
    ) {
      const endsAt = startsAt + durationMs;
      const courtBlock = courtBlocks.find((block) =>
        intervalContains(block, startsAt, endsAt),
      );
      if (!courtBlock) continue;
      const coachBlock = request.coachId
        ? request.coachAvailability?.find(
            (block) =>
              block.resourceId === request.coachId &&
              request.allowedModes.includes(block.mode) &&
              intervalContains(block, startsAt, endsAt),
          )
        : undefined;
      if (request.coachId && !coachBlock) continue;
      const conflicts = request.busyRanges.some(
        (range) =>
          (range.resourceId === courtId ||
            (request.coachId && range.resourceId === request.coachId)) &&
          overlaps(startsAt - beforeMs, endsAt + afterMs, range),
      );
      if (conflicts) continue;
      slots.push({
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        courtId,
        coachId: request.coachId,
        mode: coachBlock?.mode ?? courtBlock.mode,
      });
    }
  }
  return slots.sort(
    (a, b) =>
      milliseconds(a.startsAt) - milliseconds(b.startsAt) ||
      a.courtId.localeCompare(b.courtId),
  );
}

export interface TournamentMatchRequest {
  readonly id: string;
  readonly divisionId: string;
  readonly teamIds: readonly [string, string];
  readonly durationMinutes: number;
  readonly earliestStart?: string;
  readonly dependsOnMatchIds?: readonly string[];
}

export interface CourtWindow extends TimeRange {
  readonly courtId: string;
  readonly divisionIds: readonly string[];
}

export interface ScheduledMatch {
  readonly matchId: string;
  readonly courtId: string;
  readonly startsAt: string;
  readonly endsAt: string;
}

export interface TournamentScheduleResult {
  readonly feasible: boolean;
  readonly matches: readonly ScheduledMatch[];
  readonly unscheduledMatchIds: readonly string[];
  readonly violations: readonly string[];
}

function teamReadyAt(
  teamId: string,
  scheduled: readonly ScheduledMatch[],
  requestsById: ReadonlyMap<string, TournamentMatchRequest>,
  minimumRestMs: number,
): number {
  let ready = 0;
  for (const slot of scheduled) {
    const request = requestsById.get(slot.matchId);
    if (request?.teamIds.includes(teamId)) {
      ready = Math.max(ready, milliseconds(slot.endsAt) + minimumRestMs);
    }
  }
  return ready;
}

export function scheduleTournament(input: {
  readonly matches: readonly TournamentMatchRequest[];
  readonly courtWindows: readonly CourtWindow[];
  readonly minimumRestMinutes: number;
  readonly incrementMinutes?: number;
}): TournamentScheduleResult {
  const incrementMs = (input.incrementMinutes ?? 5) * 60_000;
  const minimumRestMs = input.minimumRestMinutes * 60_000;
  const scheduled: ScheduledMatch[] = [];
  const unscheduled: string[] = [];
  const requestsById = new Map(input.matches.map((match) => [match.id, match]));
  const pending = [...input.matches];

  while (pending.length > 0) {
    const readyIndex = pending.findIndex((match) =>
      (match.dependsOnMatchIds ?? []).every((dependencyId) =>
        scheduled.some((slot) => slot.matchId === dependencyId),
      ),
    );
    if (readyIndex < 0) {
      unscheduled.push(...pending.map((match) => match.id));
      break;
    }
    const request = pending.splice(readyIndex, 1)[0];
    if (!request) break;
    let best:
      | {
          readonly startsAt: number;
          readonly endsAt: number;
          readonly courtId: string;
        }
      | undefined;
    for (const window of input.courtWindows) {
      if (!window.divisionIds.includes(request.divisionId)) continue;
      let cursor = Math.max(
        milliseconds(window.startsAt),
        request.earliestStart ? milliseconds(request.earliestStart) : 0,
        ...request.teamIds.map((teamId) =>
          teamReadyAt(teamId, scheduled, requestsById, minimumRestMs),
        ),
        ...(request.dependsOnMatchIds ?? []).map((dependencyId) => {
          const dependency = scheduled.find(
            (slot) => slot.matchId === dependencyId,
          );
          return dependency
            ? milliseconds(dependency.endsAt) + minimumRestMs
            : 0;
        }),
      );
      cursor = Math.ceil(cursor / incrementMs) * incrementMs;
      const durationMs = request.durationMinutes * 60_000;
      while (cursor + durationMs <= milliseconds(window.endsAt)) {
        const endsAt = cursor + durationMs;
        const courtConflict = scheduled.some(
          (slot) =>
            slot.courtId === window.courtId &&
            cursor < milliseconds(slot.endsAt) &&
            endsAt > milliseconds(slot.startsAt),
        );
        if (!courtConflict) {
          if (!best || cursor < best.startsAt) {
            best = { startsAt: cursor, endsAt, courtId: window.courtId };
          }
          break;
        }
        cursor += incrementMs;
      }
    }
    if (best) {
      scheduled.push({
        matchId: request.id,
        courtId: best.courtId,
        startsAt: new Date(best.startsAt).toISOString(),
        endsAt: new Date(best.endsAt).toISOString(),
      });
      scheduled.sort(
        (a, b) =>
          milliseconds(a.startsAt) - milliseconds(b.startsAt) ||
          a.courtId.localeCompare(b.courtId),
      );
    } else {
      unscheduled.push(request.id);
    }
  }

  return {
    feasible: unscheduled.length === 0,
    matches: scheduled,
    unscheduledMatchIds: unscheduled,
    violations:
      unscheduled.length === 0
        ? []
        : [`No feasible court/time assignment for ${unscheduled.join(", ")}`],
  };
}

export function validateManualMove(input: {
  readonly schedule: readonly ScheduledMatch[];
  readonly matchRequests: readonly TournamentMatchRequest[];
  readonly courtWindows: readonly CourtWindow[];
  readonly minimumRestMinutes: number;
  readonly proposed: ScheduledMatch;
}): readonly string[] {
  const violations: string[] = [];
  const request = input.matchRequests.find(
    (match) => match.id === input.proposed.matchId,
  );
  if (!request) return ["Unknown match"];
  const startsAt = milliseconds(input.proposed.startsAt);
  const endsAt = milliseconds(input.proposed.endsAt);
  const window = input.courtWindows.find(
    (candidate) =>
      candidate.courtId === input.proposed.courtId &&
      candidate.divisionIds.includes(request.divisionId) &&
      intervalContains(candidate, startsAt, endsAt),
  );
  if (!window)
    violations.push("Court is not allocated to this division and time");
  const others = input.schedule.filter(
    (slot) => slot.matchId !== input.proposed.matchId,
  );
  if (
    others.some(
      (slot) =>
        slot.courtId === input.proposed.courtId &&
        startsAt < milliseconds(slot.endsAt) &&
        endsAt > milliseconds(slot.startsAt),
    )
  ) {
    violations.push("Court is already occupied");
  }
  const requestById = new Map(
    input.matchRequests.map((match) => [match.id, match]),
  );
  const restMs = input.minimumRestMinutes * 60_000;
  for (const slot of others) {
    const otherRequest = requestById.get(slot.matchId);
    if (!otherRequest) continue;
    const sharesTeam = request.teamIds.some((teamId) =>
      otherRequest.teamIds.includes(teamId),
    );
    if (!sharesTeam) continue;
    const gap =
      startsAt >= milliseconds(slot.endsAt)
        ? startsAt - milliseconds(slot.endsAt)
        : milliseconds(slot.startsAt) - endsAt;
    if (gap < restMs) {
      violations.push(`Minimum rest is not met after ${slot.matchId}`);
    }
  }
  return [...new Set(violations)];
}
