/**
 * Cover from the coach's side (M-R5). Pure; `cover-model.test.ts`.
 *
 * - "Mine": sessions of mine that need cover (opened by the backend when I
 *   became unavailable: time off approved, a day I can't work, my hours
 *   changed, or a single session I asked cover for).
 * - "I could cover": open needs of colleagues where I am free for the whole
 *   session by the ONE shared rule (`isFreeThroughout`, the rule the
 *   backend's substitute ranking uses), never my own needs.
 * - My offer's state when the club asked me (suggested, asked, said yes,
 *   assigned, no longer needed).
 *
 * Words come from `team-words.ts` (HQ's). What happens to pay for a covered
 * session is not stated by the backend, so nothing here says it.
 */
import type { TeamAvailabilityCoverageRequest } from "@duna/api";
import {
  isFreeThroughout,
  type StaffAvailabilityInputs,
} from "@duna/scheduling";
import {
  coverageReasonWords,
  coverageStatusCopy,
  offerStatusWords,
  type StateCopy,
} from "../availability/team-words";

export type CoverageRequest = TeamAvailabilityCoverageRequest;
export type CoverageOffer = CoverageRequest["offers"][number];

const OPEN = new Set(["open", "asking", "nobody-free"]);

export function myOffer(
  request: CoverageRequest,
  staffProfileId: string,
): CoverageOffer | undefined {
  return request.offers.find(
    (offer) => offer.staff.staffProfileId === staffProfileId,
  );
}

export interface CoverLists {
  /** My sessions that need (or needed) cover, soonest first. */
  readonly mine: readonly CoverageRequest[];
  /** Colleagues' open needs I am free for, soonest first. */
  readonly couldCover: readonly CoverageRequest[];
  /** Colleagues' needs where the club already named me (any state). */
  readonly offered: readonly CoverageRequest[];
}

export function coverLists(input: {
  readonly requests: readonly CoverageRequest[];
  readonly staffProfileId: string;
  /** My schedules, time away and booked sessions, as the shared rule reads them. */
  readonly myInputs: StaffAvailabilityInputs;
  readonly now: string;
}): CoverLists {
  const now = Date.parse(input.now);
  const upcoming = input.requests
    .filter((request) => Date.parse(request.endsAt) > now)
    .sort(
      (left, right) =>
        left.startsAt.localeCompare(right.startsAt) ||
        left.id.localeCompare(right.id),
    );
  const isMine = (request: CoverageRequest) =>
    request.originalStaff?.staffProfileId === input.staffProfileId;
  const mine = upcoming.filter(
    (request) => isMine(request) && request.status !== "cancelled",
  );
  const offered = upcoming.filter(
    (request) =>
      !isMine(request) &&
      request.status !== "cancelled" &&
      myOffer(request, input.staffProfileId) !== undefined,
  );
  const offeredIds = new Set(offered.map((request) => request.id));
  const couldCover = upcoming.filter(
    (request) =>
      !isMine(request) &&
      !offeredIds.has(request.id) &&
      OPEN.has(request.status) &&
      isFreeThroughout(
        { staffProfileId: input.staffProfileId },
        { startsAt: request.startsAt, endsAt: request.endsAt },
        input.myInputs,
      ),
  );
  return { mine, couldCover, offered };
}

/** One request's state chip, from my side. */
export function coverStateCopy(
  request: CoverageRequest,
  staffProfileId: string,
): StateCopy {
  if (request.originalStaff?.staffProfileId !== staffProfileId) {
    const offer = myOffer(request, staffProfileId);
    if (offer) {
      if (offer.status === "assigned")
        return { label: "You're covering", tone: "positive" };
      if (offer.status === "withdrawn")
        return { label: offerStatusWords("withdrawn"), tone: "neutral" };
      if (offer.status === "asked")
        return { label: "You were asked", tone: "info" };
      if (offer.status === "accepted")
        return { label: "You said yes", tone: "positive" };
      if (offer.status === "declined")
        return { label: "You said no", tone: "neutral" };
    }
  }
  return coverageStatusCopy(request.status);
}

/** The line under a request: why it needs cover and who covers it. */
export function coverReasonLine(
  request: CoverageRequest,
  staffProfileId: string,
): string {
  const mine = request.originalStaff?.staffProfileId === staffProfileId;
  const who = mine ? "You" : request.originalStaff?.displayName;
  const reason = mine
    ? myReasonWords(request.reason)
    : coverageReasonWords(request.reason, who);
  if (request.status === "covered" && request.coveredBy) {
    const by =
      request.coveredBy.staffProfileId === staffProfileId
        ? "you"
        : request.coveredBy.displayName;
    return `${reason}. Covered by ${by}.`;
  }
  return `${reason}.`;
}

/** HQ's reasons, said to the member about themselves. */
function myReasonWords(reason: string): string {
  switch (reason) {
    case "time-off":
      return "You have time off";
    case "blackout":
      return "You can't work then";
    case "schedule-change":
      return "Your hours changed";
    case "no-coach-assigned":
      return "No coach is assigned";
    default:
      return "Marked as needing cover";
  }
}

/** Who the club has asked so far, for my own needs ("Asked: Noa, Sam"). */
export function askedLine(request: CoverageRequest): string | undefined {
  const asked = request.offers.filter(
    (offer) => offer.status === "asked" || offer.status === "accepted",
  );
  if (asked.length === 0) return undefined;
  return `${offerStatusWords("asked")}: ${asked
    .map((offer) => offer.staff.displayName)
    .join(", ")}`;
}
