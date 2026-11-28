/**
 * Contracts: schedule (SCHED-API). The front desk's court bookings, moves,
 * cancellations, desk payments and calendar blocks, mounted at
 * `operator.schedule`, plus the coaches' availability for a date range
 * (`operator.teamAvailability.range`). Additive: nothing here changes an
 * existing contract.
 *
 * Money fields (`totalMinor`, `paidMinor`, refunds, price differences) are
 * returned only to callers with a money permission (`payments:read`,
 * `payments:write` or `payments:collect`); everyone else gets the same answer
 * without them.
 */
import { z } from "zod";
import {
  w3DateSchema,
  w3DateTimeSchema,
  w3IdSchema,
  w3IdempotencyKeySchema,
} from "./w3-common";

/** An ISO 4217 code as orders store it. */
const w3CurrencySchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{3}$/));

const e164Schema = z
  .string()
  .trim()
  .regex(
    /^\+[1-9]\d{6,14}$/,
    "Use the international format, e.g. +13105550100.",
  );

/** A person at the desk without a Duna profile. A phone only if given. */
export const scheduleWalkInSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phoneE164: e164Schema.optional(),
});

/** Why a slot cannot be used, by the shared availability rule. */
export const scheduleConflictSchema = z.object({
  /** `availabilityFor`'s primary reason. */
  reason: z.enum([
    "time-off",
    "blackout",
    "commitment",
    "outside-hours",
    "no-schedule",
  ]),
  /** What is in the way, in the calendar's words. */
  what: z.enum(["booking", "session", "block", "closed", "hours"]),
  startsAt: w3DateTimeSchema,
  endsAt: w3DateTimeSchema,
  /** The booking, session or block ids behind it (never another club's). */
  ids: z.array(z.string()),
});

const slotSchema = z.object({
  courtId: w3IdSchema,
  startsAt: w3DateTimeSchema,
  endsAt: w3DateTimeSchema,
});

export const schedulePaymentIntentSchema = z.enum([
  "pay-at-desk",
  "send-payment-link",
  "free",
]);

export const schedulePaymentStateSchema = z.enum([
  /** No money is due (a free booking). */
  "free",
  /** An order is waiting to be paid (at the desk or by the link). */
  "unpaid",
  /** Some shares are paid, some are not (split pay). */
  "part-paid",
  "paid",
  "refunded",
  "cancelled",
]);

/* -------------------------------------------------------------- create */

export const scheduleCreateCourtBookingPreviewInputSchema = slotSchema
  .extend({
    personId: w3IdSchema.optional(),
    walkIn: scheduleWalkInSchema.optional(),
    paymentIntent: schedulePaymentIntentSchema.default("pay-at-desk"),
  })
  .refine((value) => !(value.personId && value.walkIn), {
    message: "Choose a member or enter a walk-in, not both.",
    path: ["personId"],
  });

export const schedulePriceSchema = z.object({
  /** The court's rate for the slot (before any online consumer fee). */
  rateMinor: z.number().int().nonnegative(),
  /** What the booker pays: the rate at the desk; rate + fees by the link. */
  totalMinor: z.number().int().nonnegative(),
  currency: w3CurrencySchema,
  ratePlanName: z.string(),
  priceKind: z.enum(["base", "public", "member"]),
});

export const scheduleCreateCourtBookingPreviewSchema = z.object({
  available: z.boolean(),
  conflicts: z.array(scheduleConflictSchema),
  /** Money permission only. Absent when no rate applies. */
  price: schedulePriceSchema.optional(),
  /** Why there is no price ("No court rate applies…"). */
  priceUnavailable: z.string().optional(),
  /** The link needs Duna Pay ready and a member or a phone to claim it. */
  paymentLinkAvailable: z.boolean(),
  timeZone: z.string(),
});

export const scheduleCreateCourtBookingInputSchema = slotSchema
  .extend({
    personId: w3IdSchema.optional(),
    walkIn: scheduleWalkInSchema.optional(),
    /** Staff price (money permission `payments:write` only; audited). */
    priceMinor: z.number().int().nonnegative().max(10_000_000).optional(),
    /** Why the price differs from the court's rate (required with priceMinor). */
    priceReason: z.string().trim().min(3).max(500).optional(),
    currency: w3CurrencySchema,
    paymentIntent: schedulePaymentIntentSchema,
    /** The total the person saw; a different total is refused (no silent price). */
    expectedTotalMinor: z.number().int().nonnegative().optional(),
    note: z.string().trim().max(500).optional(),
    idempotencyKey: w3IdempotencyKeySchema,
  })
  .refine((value) => Boolean(value.personId) !== Boolean(value.walkIn), {
    message: "Choose a member or enter a walk-in, not both.",
    path: ["personId"],
  })
  .refine(
    (value) => value.priceMinor === undefined || Boolean(value.priceReason),
    {
      message: "Say why the price differs from the court's rate.",
      path: ["priceReason"],
    },
  );

export const schedulePaymentLinkSchema = z.object({
  url: z.string().url(),
  /** The court is held until then; unpaid, it is released. */
  expiresAt: w3DateTimeSchema,
});

export const scheduleCreateCourtBookingSchema = z.object({
  id: w3IdSchema,
  status: z.enum(["confirmed", "held"]),
  paymentState: schedulePaymentStateSchema,
  /** Nothing is sent: the screen shows this or hands a draft to Inbox. */
  paymentLink: schedulePaymentLinkSchema.optional(),
  orderId: w3IdSchema.optional(),
  totalMinor: z.number().int().nonnegative().optional(),
  currency: w3CurrencySchema,
  priceSource: z.enum(["rate", "staff", "free"]),
});

/* ---------------------------------------------------------------- move */

export const scheduleMoveCourtBookingPreviewInputSchema = z.object({
  bookingId: w3IdSchema,
  startsAt: w3DateTimeSchema,
  endsAt: w3DateTimeSchema,
  courtId: w3IdSchema.optional(),
});

export const scheduleRecipientSchema = z.object({
  personId: w3IdSchema.optional(),
  name: z.string(),
  role: z.enum(["booker", "player", "guardian"]),
  /** A guardian is told because this player is a junior. */
  forName: z.string().optional(),
});

/** The Concierge thread and its Send review (nothing has been sent). */
export const scheduleConciergeDraftSchema = z.object({
  conversationId: w3IdSchema,
  proposalId: w3IdSchema.optional(),
});

/** Handed to Inbox by the screen; never sent by these procedures. */
export const scheduleMessageDraftSchema = z.object({
  recipients: z.array(scheduleRecipientSchema),
  body: z.string(),
});

const placeSchema = z.object({
  courtId: w3IdSchema,
  courtName: z.string(),
  startsAt: w3DateTimeSchema,
  endsAt: w3DateTimeSchema,
});

export const scheduleMoveCourtBookingPreviewSchema = z.object({
  bookingId: w3IdSchema,
  from: placeSchema,
  to: placeSchema,
  available: z.boolean(),
  conflicts: z.array(scheduleConflictSchema),
  /**
   * What happens to the price. `reprice`: an unpaid desk order takes the
   * court's rate for the new slot (needs `confirmedPriceChange`); `kept`:
   * paid, link, staff-priced and free bookings keep their price.
   */
  price: z.object({
    action: z.enum(["unchanged", "reprice", "kept"]),
    /** Money permission only. */
    currentTotalMinor: z.number().int().nonnegative().optional(),
    newTotalMinor: z.number().int().nonnegative().optional(),
    differenceMinor: z.number().int().optional(),
    currency: w3CurrencySchema.optional(),
  }),
  requiresPriceConfirmation: z.boolean(),
  /** 60 minutes or more, or another place: players may ask for a full refund. */
  materialChange: z.boolean(),
  /** Who would be told, as a draft. */
  draft: scheduleMessageDraftSchema,
  /** Echo on the move; a stale preview is refused. */
  previewToken: z.string(),
});

export const scheduleMoveCourtBookingInputSchema = z.object({
  bookingId: w3IdSchema,
  startsAt: w3DateTimeSchema,
  endsAt: w3DateTimeSchema,
  courtId: w3IdSchema.optional(),
  notify: z.boolean(),
  previewToken: z.string().min(8).max(128).optional(),
  confirmedPriceChange: z.boolean().optional(),
  idempotencyKey: w3IdempotencyKeySchema,
});

export const scheduleMoveCourtBookingSchema = z.object({
  id: w3IdSchema,
  startsAt: w3DateTimeSchema,
  endsAt: w3DateTimeSchema,
  courtId: w3IdSchema,
  /** Where it was: moving back there is the undo. */
  undo: z.object({
    startsAt: w3DateTimeSchema,
    endsAt: w3DateTimeSchema,
    courtId: w3IdSchema,
  }),
  /** People the draft is for; nobody has been told (always 0 sent). */
  toTell: z.number().int().nonnegative(),
  sent: z.literal(0),
  draft: scheduleMessageDraftSchema.optional(),
  /** With `notify`: the Concierge Send review for the people told. */
  conciergeDraft: scheduleConciergeDraftSchema.optional(),
  repriced: z.boolean(),
});

/* -------------------------------------------------------------- cancel */

export const scheduleRefundChoiceSchema = z.enum(["full", "none", "by-policy"]);

export const scheduleCancelCourtBookingPreviewInputSchema = z.object({
  bookingId: w3IdSchema,
  refund: scheduleRefundChoiceSchema,
  /**
   * `club`: the club cancels (weather, closure, its own mistake): the refund
   * floor gives every payer their money back in full. `player-asked`: the
   * player asked; the reservation policy decides.
   */
  cause: z.enum(["club", "player-asked"]).default("player-asked"),
});

export const scheduleCancelLineSchema = z.object({
  participantId: w3IdSchema.optional(),
  orderId: w3IdSchema.optional(),
  name: z.string(),
  /** How their money comes back. */
  method: z.enum(["card", "desk", "unpaid", "free", "nothing-paid"]),
  action: z.enum([
    /** An unpaid order or invitation is cancelled; nothing to return. */
    "release",
    /** Refunded to the card through the club's refund path. */
    "refund-card",
    /** Paid at the desk: hand it back at the desk (recorded, no money moves in Duna). */
    "hand-back-at-desk",
    /** Paid, kept under the policy or by choice. */
    "keep",
  ]),
  /** Money permission only. */
  paidMinor: z.number().int().nonnegative().optional(),
  refundMinor: z.number().int().nonnegative().optional(),
});

export const scheduleCancelCourtBookingPreviewSchema = z.object({
  bookingId: w3IdSchema,
  refund: scheduleRefundChoiceSchema,
  cause: z.enum(["club", "player-asked"]),
  /** The policy's words, and whether this cancellation is inside it. */
  policy: z.object({
    title: z.string(),
    refundBeforeHours: z.number().int().nonnegative().optional(),
    insideRefundWindow: z.boolean(),
  }),
  lines: z.array(scheduleCancelLineSchema),
  /** Money permission only. */
  totalRefundMinor: z.number().int().nonnegative().optional(),
  currency: w3CurrencySchema.optional(),
  /** Refunding money needs `payments:write`. */
  needsMoneyPermission: z.boolean(),
  draft: scheduleMessageDraftSchema,
  previewToken: z.string(),
});

export const scheduleCancelCourtBookingInputSchema = z.object({
  bookingId: w3IdSchema,
  reason: z.string().trim().min(3).max(500),
  refund: scheduleRefundChoiceSchema,
  cause: z.enum(["club", "player-asked"]).default("player-asked"),
  confirmed: z.literal(true),
  previewToken: z.string().min(8).max(128).optional(),
  /** Prepare a Concierge Send review for the people booked (never sent). */
  notify: z.boolean().default(true),
  idempotencyKey: w3IdempotencyKeySchema,
});

export const scheduleCancelCourtBookingSchema = z.object({
  id: w3IdSchema,
  status: z.literal("cancelled"),
  lines: z.array(
    scheduleCancelLineSchema.extend({
      /** What the refund path answered for this line. */
      outcome: z.enum([
        "released",
        "refund-submitted",
        "refund-failed",
        "handed-back-recorded",
        "kept",
      ]),
      refundId: w3IdSchema.optional(),
    }),
  ),
  totalRefundMinor: z.number().int().nonnegative().optional(),
  currency: w3CurrencySchema.optional(),
  toTell: z.number().int().nonnegative(),
  sent: z.literal(0),
  draft: scheduleMessageDraftSchema,
  conciergeDraft: scheduleConciergeDraftSchema.optional(),
});

/* -------------------------------------------------------- desk payment */

export const scheduleRecordDeskPaymentInputSchema = z
  .object({
    orderId: w3IdSchema.optional(),
    bookingId: w3IdSchema.optional(),
    amountMinor: z.number().int().positive().max(10_000_000),
    method: z.enum(["cash", "card-at-desk-external", "other"]),
    note: z.string().trim().max(500).optional(),
    confirmed: z.literal(true),
    idempotencyKey: w3IdempotencyKeySchema,
  })
  .refine((value) => Boolean(value.orderId) !== Boolean(value.bookingId), {
    message: "Give the booking or its order, not both.",
    path: ["bookingId"],
  });

export const scheduleRecordDeskPaymentSchema = z.object({
  /** The audit row that records the payment. */
  id: w3IdSchema,
  orderId: w3IdSchema,
  bookingId: w3IdSchema,
  orderStatus: z.literal("paid"),
  amountMinor: z.number().int().positive(),
  currency: w3CurrencySchema,
  method: z.enum(["cash", "card-at-desk-external", "other"]),
  /** Always false: desk money is outside Duna Pay (no ledger, no payout). */
  ledgerRecorded: z.literal(false),
});

/* -------------------------------------------------------------- blocks */

export const scheduleBlockScopeSchema = z.enum([
  /** A one-off block or closure (schedule override). */
  "this",
  /** A weekly block: this date only. */
  "this-occurrence",
  /** A weekly block: this date and every later one. */
  "this-and-following",
  /** A weekly block: every date. */
  "all",
]);

export const scheduleRemoveCalendarBlockPreviewInputSchema = z.object({
  id: w3IdSchema,
  /** For a weekly block: the local date of the occurrence chosen. */
  date: w3DateSchema.optional(),
  scope: scheduleBlockScopeSchema.default("this"),
});

export const scheduleRemoveCalendarBlockPreviewSchema = z.object({
  id: w3IdSchema,
  kind: z.enum(["one-off", "weekly"]),
  scope: scheduleBlockScopeSchema,
  resourceType: z.enum(["court", "coach"]),
  resourceId: w3IdSchema,
  reason: z.string().optional(),
  startsAt: w3DateTimeSchema.optional(),
  endsAt: w3DateTimeSchema.optional(),
  /**
   * Sessions and bookings cancelled under this closure. Removing it does
   * not bring them back; the remover must acknowledge them.
   */
  cancelledUnder: z.array(
    z.object({
      id: w3IdSchema,
      kind: z.enum(["session", "booking"]),
      title: z.string(),
      startsAt: w3DateTimeSchema,
    }),
  ),
});

export const scheduleRemoveCalendarBlockInputSchema = z.object({
  id: w3IdSchema,
  reason: z.string().trim().min(3).max(500),
  date: w3DateSchema.optional(),
  scope: scheduleBlockScopeSchema.default("this"),
  /** Required when sessions or bookings were cancelled under it. */
  acknowledgeCancelled: z.boolean().optional(),
  idempotencyKey: w3IdempotencyKeySchema,
});

export const scheduleRemoveCalendarBlockSchema = z.object({
  id: w3IdSchema,
  removed: z.boolean(),
  scope: scheduleBlockScopeSchema,
  /** Still cancelled: removing the block does not restore them. */
  stillCancelled: z.number().int().nonnegative(),
});

/* ------------------------------------------------------ calendar money */

export const scheduleBookingPaymentsInputSchema = z.object({
  from: w3DateTimeSchema,
  to: w3DateTimeSchema,
  venueId: w3IdSchema.optional(),
});

export const scheduleBookingPaymentSchema = z.object({
  bookingId: w3IdSchema,
  orderId: w3IdSchema.optional(),
  totalMinor: z.number().int().nonnegative(),
  paidMinor: z.number().int().nonnegative(),
  currency: w3CurrencySchema,
  paymentState: schedulePaymentStateSchema,
  /** The calendar's "Unpaid" chip: money is due at the desk or by the link. */
  due: z.boolean(),
});

export const scheduleBookingPaymentsSchema = z.object({
  bookings: z.array(scheduleBookingPaymentSchema),
});

/* ------------------------------------------- team availability (range) */

export const teamAvailabilityRangeInputSchema = z.object({
  from: w3DateSchema,
  to: w3DateSchema,
});

/**
 * Every coach's availability inputs for a date range, in the shape the
 * shared rule (`availabilityFor` in @duna/scheduling) takes, minus
 * commitments (the calendar already has those). One call for the calendar.
 */
export const teamAvailabilityRangeSchema = z.object({
  from: w3DateSchema,
  to: w3DateSchema,
  staff: z.array(
    z.object({
      staffProfileId: w3IdSchema,
      personId: w3IdSchema,
      displayName: z.string(),
      schedules: z.array(
        z.object({
          id: z.string(),
          status: z.enum(["draft", "active", "fallback", "archived"]),
          effectiveFrom: w3DateSchema,
          effectiveTo: w3DateSchema.optional(),
          timezone: z.string(),
          windows: z.array(
            z.object({
              weekday: z.number().int().min(0).max(6),
              startMinute: z.number().int().min(0).max(1440),
              endMinute: z.number().int().min(0).max(2880),
              kind: z.string().optional(),
              venueId: w3IdSchema.optional(),
            }),
          ),
        }),
      ),
      blackouts: z.array(
        z.object({
          id: z.string(),
          startsAt: w3DateTimeSchema,
          endsAt: w3DateTimeSchema,
          scope: z.enum(["personal", "club"]).optional(),
          recurrence: z.literal("yearly").optional(),
          timezone: z.string().optional(),
        }),
      ),
      timeOff: z.array(
        z.object({
          id: z.string(),
          startsAt: w3DateTimeSchema,
          endsAt: w3DateTimeSchema,
          status: z.enum(["requested", "approved", "declined", "cancelled"]),
        }),
      ),
      /** Read from the legacy availability column (not copied yet). */
      legacy: z.boolean(),
    }),
  ),
});

export type ScheduleConflict = z.infer<typeof scheduleConflictSchema>;
export type ScheduleMessageDraft = z.infer<typeof scheduleMessageDraftSchema>;
export type ScheduleCancelLine = z.infer<typeof scheduleCancelLineSchema>;
export type SchedulePaymentState = z.infer<typeof schedulePaymentStateSchema>;
export type ScheduleCreateCourtBookingInput = z.infer<
  typeof scheduleCreateCourtBookingInputSchema
>;
export type ScheduleMoveCourtBookingInput = z.infer<
  typeof scheduleMoveCourtBookingInputSchema
>;
export type ScheduleCancelCourtBookingInput = z.infer<
  typeof scheduleCancelCourtBookingInputSchema
>;
export type ScheduleRecordDeskPaymentInput = z.infer<
  typeof scheduleRecordDeskPaymentInputSchema
>;
export type ScheduleRemoveCalendarBlockInput = z.infer<
  typeof scheduleRemoveCalendarBlockInputSchema
>;
export type TeamAvailabilityRange = z.infer<typeof teamAvailabilityRangeSchema>;
