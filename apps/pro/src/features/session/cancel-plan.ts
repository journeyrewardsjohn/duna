/**
 * Which cancellation a calendar entry takes (M-R4, owner's point 9). Pure
 * and unit-tested (`cancel-plan.test.ts`).
 *
 * Root cause of the owner's failed cancel (err_1b38f68db0c9f267): every
 * calendar entry without a group subject was cancelled with
 * `operator.cancelCalendarSession`, which looks the id up in `sessions`.
 * A court booking's calendar entry carries the COURT BOOKING id (the
 * `court_bookings` row the Player app created, with its match, invites and
 * the $30 order), so the server answered "Session was not found in this
 * organization" and nothing changed. Each entry kind now maps to the
 * procedure that owns it, and the sheet shows its preview of who gets what
 * back before anyone confirms.
 */
import type { SessionDetail } from "./session-model";

/** What a calendar entry is, from `calendar.entries[].sourceType`. */
export type SessionEntryKind =
  "session" | "court-booking" | "pickup" | "block" | "group-occurrence";

export function entryKindFromSource(sourceType: string): SessionEntryKind {
  switch (sourceType) {
    case "session":
      return "session";
    case "booking":
      return "court-booking";
    case "pickup":
      return "pickup";
    case "busy-block":
    case "operator-block":
      return "block";
    default:
      return "session";
  }
}

/**
 * Whether the server has the staff court-booking cancellation
 * (`operator.schedule.cancelCourtBooking`, SCHED-API). `unknown` until the
 * preview call answers; `missing` when the router has no such procedure.
 */
export type CourtBookingCapability = "unknown" | "available" | "missing";

export type CancelPlan =
  | {
      /** A group session with a participation rule: refunds per booking. */
      readonly kind: "group-refund";
      readonly action: "cancel-refund";
      readonly preview: "operator.participation.cancelPreview";
      readonly procedure: "operator.participation.cancelSession";
    }
  | {
      /** A calendar session (`sessions` row): registrations refunded, everyone told. */
      readonly kind: "calendar-session";
      readonly action: "cancel-session";
      readonly preview: "operator.sessionDetail";
      readonly procedure: "operator.cancelCalendarSession";
    }
  | {
      /** A player's court booking (with its match and invites). */
      readonly kind: "court-booking";
      readonly action: "cancel-booking";
      readonly preview: "operator.schedule.cancelCourtBookingPreview";
      readonly procedure: "operator.schedule.cancelCourtBooking";
      /** False while the server has no staff path: the sheet says so. */
      readonly available: boolean;
    }
  | {
      readonly kind: "none";
      /** Why there is no cancel action, in words. */
      readonly reason: string;
    };

export const COURT_BOOKING_MISSING =
  "Staff can't cancel a player's court booking from Pro on this version of Duna yet. Nothing was changed. Cancel it from Schedule in Duna HQ, or ask the player to cancel in the Duna app.";

export function cancelPlanFor(
  detail: Pick<SessionDetail, "entryKind" | "subject" | "cancelled">,
  options: {
    readonly audience: "coach" | "owner";
    readonly courtBooking?: CourtBookingCapability;
  },
): CancelPlan {
  if (detail.cancelled)
    return { kind: "none", reason: "It is already cancelled." };
  if (options.audience !== "owner")
    return {
      kind: "none",
      reason: "Only an owner, admin or manager can cancel.",
    };
  if (detail.subject)
    return {
      kind: "group-refund",
      action: "cancel-refund",
      preview: "operator.participation.cancelPreview",
      procedure: "operator.participation.cancelSession",
    };
  switch (detail.entryKind) {
    case "session":
      return {
        kind: "calendar-session",
        action: "cancel-session",
        preview: "operator.sessionDetail",
        procedure: "operator.cancelCalendarSession",
      };
    case "court-booking":
      return {
        kind: "court-booking",
        action: "cancel-booking",
        preview: "operator.schedule.cancelCourtBookingPreview",
        procedure: "operator.schedule.cancelCourtBooking",
        available: options.courtBooking !== "missing",
      };
    case "pickup":
      return {
        kind: "none",
        reason:
          "Open play is run by the player who hosts it; they cancel it from the Duna app.",
      };
    case "block":
      return { kind: "none", reason: "A block is removed in Schedule." };
    case "group-occurrence":
      return {
        kind: "none",
        reason: "This session has no booking rule to cancel against yet.",
      };
  }
}

/** True when a tRPC error says the router has no such procedure. */
export function isMissingProcedure(error: unknown): boolean {
  const code = (error as { data?: { code?: unknown } } | null)?.data?.code;
  const message = error instanceof Error ? error.message : "";
  return (
    code === "NOT_FOUND" && /no (query|mutation )?procedure/i.test(message)
  );
}
