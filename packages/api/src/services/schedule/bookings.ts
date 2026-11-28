/**
 * Court bookings from the front desk (SCHED-API): create, move, cancel and
 * record a desk payment, on the same records a player booking creates
 * (`court_bookings`, `court_booking_participants`, `orders`,
 * `order_items`), so Money, the player's bookings and the calendar all see
 * them. No second booking system and no new money rules:
 *
 * - price: the court's rate (`priceCourtRate`, shared with the player
 *   checkout); by the payment link, plus the consumer fees the player
 *   checkout adds (`priceConsumerOrder`); at the desk, the rate alone (cash
 *   carries no Duna fee, as `operator.fees.quote` says);
 * - conflicts: the shared availability rule (court-availability.ts) inside
 *   the transaction that writes, with the court row locked; the database's
 *   `court_bookings_no_overlap` constraint backs it up against players;
 * - payment link: the existing split-share invitation checkout
 *   (`/app/booking-invite/{token}`), which holds the court and confirms the
 *   booking when paid; nothing is sent by these procedures;
 * - cancellation refunds: cancellation.ts, executed through
 *   `refundOrganizationOrder`.
 *
 * Logs carry ids and counts only.
 */
import {
  auditLog,
  courtBookingParticipants,
  courtBookings,
  getTransactionalDatabase,
  guardianships,
  memberships,
  membershipTiers,
  orderItems,
  orders,
  organizationMemberships,
  organizationParticipants,
  organizations,
  people,
  pickupSessions,
  refundRecords,
  venues,
} from "@duna/db";
import { log } from "@duna/observability";
import { priceConsumerOrder, type CurrencyCode } from "@duna/pricing";
import { localDateOf } from "@duna/scheduling";
import { and, eq, gt, inArray, lt, ne, notInArray, or, sql } from "drizzle-orm";
import { stableHash } from "../../canonical";
import { refundOrganizationOrder } from "../../catalog-service";
import type {
  ScheduleCancelLine,
  ScheduleConflict,
  ScheduleMessageDraft,
  SchedulePaymentState,
} from "../../contracts/schedule";
import {
  CourtCheckoutError,
  normalizeCourtCancellationPolicy,
  priceCourtRate,
  type CourtRate,
} from "../../court-checkout";
import { hasActiveDunaPlusMembership } from "../../membership";
import { isStripeConfigured } from "../../payments";
import { canonicalPublicWebUrl } from "../../public-web-url";
import {
  planCourtCancellation,
  type CancelCause,
  type PlanOrder,
  type PlanParticipant,
  type RefundChoice,
} from "./cancellation";
import { courtConflicts } from "./court-availability";
import {
  assertCourtOpen,
  loadCourt,
  loadCourtFacts,
  type CourtRow,
  type Transaction,
} from "./court-situation";
import {
  canSeeMoney,
  hasScope,
  minutesBetween,
  requireDatabase,
  requireScope,
  ScheduleError,
  type ScheduleCaller,
} from "./shared";

/** The split-pay hold the player checkout uses while invitees pay. */
const LINK_HOLD_MINUTES = 120;
const MAX_BOOKING_MINUTES = 24 * 60;
const MIN_BOOKING_MINUTES = 15;

function transactional<T>(run: (tx: Transaction) => Promise<T>): Promise<T> {
  return getTransactionalDatabase().transaction(run);
}

function isOverlapError(error: unknown): boolean {
  const candidate = error as {
    readonly code?: string;
    readonly constraint?: string;
    readonly message?: string;
    readonly cause?: unknown;
  };
  return (
    candidate?.code === "23P01" ||
    candidate?.constraint === "court_bookings_no_overlap" ||
    candidate?.message?.includes("court_bookings_no_overlap") === true ||
    (candidate?.cause ? isOverlapError(candidate.cause) : false)
  );
}

function clock(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(at);
}

function conflictMessage(conflicts: readonly ScheduleConflict[]): string {
  const first = conflicts[0];
  const words: Record<ScheduleConflict["what"], string> = {
    booking: "another booking",
    session: "a session",
    block: "a block or closure",
    closed: "a weekly closure",
    hours: "the court's opening hours",
  };
  return `That court is not free then: ${first ? words[first.what] : "something"} is in the way. Nothing was booked.`;
}

function money(minor: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    minor / 100,
  );
}

function validateSlot(startsAt: Date, endsAt: Date, now: Date): void {
  const minutes = minutesBetween(startsAt, endsAt);
  if (
    !Number.isFinite(minutes) ||
    minutes < MIN_BOOKING_MINUTES ||
    minutes > MAX_BOOKING_MINUTES
  ) {
    throw new ScheduleError(
      "BAD_REQUEST",
      "A court booking is between 15 minutes and 24 hours long.",
    );
  }
  if (endsAt.getTime() <= now.getTime()) {
    throw new ScheduleError(
      "BAD_REQUEST",
      "That time has already passed. Nothing was booked.",
    );
  }
}

/* ------------------------------------------------------------ people */

/** A person this club knows (participant, member or staff); else not found. */
async function assertClubPerson(
  tx: Transaction,
  organizationId: string,
  personId: string,
): Promise<{ id: string; displayName: string; isMinor: boolean }> {
  const [row] = await tx
    .select({
      id: people.id,
      displayName: people.displayName,
      isMinor: people.isMinor,
      participant: organizationParticipants.id,
      staff: organizationMemberships.id,
      member: memberships.id,
    })
    .from(people)
    .leftJoin(
      organizationParticipants,
      and(
        eq(organizationParticipants.personId, people.id),
        eq(organizationParticipants.organizationId, organizationId),
        eq(organizationParticipants.status, "active"),
      ),
    )
    .leftJoin(
      organizationMemberships,
      and(
        eq(organizationMemberships.personId, people.id),
        eq(organizationMemberships.organizationId, organizationId),
        eq(organizationMemberships.active, true),
      ),
    )
    .leftJoin(
      memberships,
      and(
        eq(memberships.personId, people.id),
        inArray(memberships.status, ["active", "trialing"]),
        sql`EXISTS (SELECT 1 FROM ${membershipTiers} WHERE ${membershipTiers.id} = ${memberships.tierId} AND ${membershipTiers.organizationId} = ${organizationId})`,
      ),
    )
    .where(and(eq(people.id, personId), eq(people.status, "active")))
    .limit(1);
  if (!row || (!row.participant && !row.staff && !row.member)) {
    throw new ScheduleError(
      "NOT_FOUND",
      "That person was not found in this club.",
    );
  }
  return { id: row.id, displayName: row.displayName, isMinor: row.isMinor };
}

/** Booker, invited players and the verified guardians of juniors. */
async function recipientsFor(
  tx: Transaction,
  booking: { readonly id: string; readonly personId: string },
): Promise<ScheduleMessageDraft["recipients"]> {
  const rows = await tx
    .select({
      personId: courtBookingParticipants.personId,
      invitedName: courtBookingParticipants.invitedName,
      role: courtBookingParticipants.role,
      displayName: people.displayName,
      isMinor: people.isMinor,
    })
    .from(courtBookingParticipants)
    .leftJoin(people, eq(courtBookingParticipants.personId, people.id))
    .where(
      and(
        eq(courtBookingParticipants.bookingId, booking.id),
        notInArray(courtBookingParticipants.status, ["cancelled", "declined"]),
      ),
    );
  const recipients: ScheduleMessageDraft["recipients"][number][] = rows.map(
    (row) => ({
      ...(row.personId ? { personId: row.personId } : {}),
      name: row.displayName ?? row.invitedName ?? "Player",
      role:
        row.role === "organizer" || row.personId === booking.personId
          ? ("booker" as const)
          : ("player" as const),
    }),
  );
  const minors = rows.flatMap((row) =>
    row.isMinor && row.personId
      ? [{ id: row.personId, name: row.displayName ?? "Player" }]
      : [],
  );
  if (minors.length > 0) {
    const guardians = await tx
      .select({
        guardianId: guardianships.guardianId,
        minorId: guardianships.minorId,
        name: people.displayName,
      })
      .from(guardianships)
      .innerJoin(people, eq(guardianships.guardianId, people.id))
      .where(
        and(
          inArray(
            guardianships.minorId,
            minors.map((minor) => minor.id),
          ),
          eq(guardianships.verified, true),
        ),
      );
    for (const guardian of guardians) {
      if (recipients.some((row) => row.personId === guardian.guardianId))
        continue;
      recipients.push({
        personId: guardian.guardianId,
        name: guardian.name,
        role: "guardian",
        forName: minors.find((minor) => minor.id === guardian.minorId)?.name,
      });
    }
  }
  return recipients;
}

/* ------------------------------------------------------------ create */

interface CreateWho {
  readonly personId?: string;
  readonly walkIn?: { readonly name: string; readonly phoneE164?: string };
}

interface CreatePrice {
  readonly rate?: CourtRate;
  readonly rateError?: string;
  readonly subtotalMinor: number;
  readonly totalMinor: number;
  readonly currency: CurrencyCode;
  readonly source: "rate" | "staff" | "free";
}

async function organizationPayments(
  tx: Transaction,
  organizationId: string,
): Promise<{ ready: boolean; currency: string }> {
  const [row] = await tx
    .select({
      stripeAccountId: organizations.stripeAccountId,
      stripeChargesEnabled: organizations.stripeChargesEnabled,
      currency: organizations.currency,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  return {
    ready: Boolean(
      row?.stripeAccountId && row.stripeChargesEnabled && isStripeConfigured(),
    ),
    currency: row?.currency ?? "USD",
  };
}

async function rateFor(input: {
  readonly court: CourtRow;
  readonly personId?: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
}): Promise<{ rate?: CourtRate; error?: string }> {
  try {
    return {
      rate: await priceCourtRate({
        courtId: input.court.courtId,
        organizationId: input.court.organizationId,
        subjectPersonId: input.personId,
        localDate: localDateOf(input.startsAt.getTime(), input.court.timeZone),
        durationMinutes: minutesBetween(input.startsAt, input.endsAt),
      }),
    };
  } catch (error) {
    if (error instanceof CourtCheckoutError) return { error: error.message };
    throw error;
  }
}

async function priceFor(input: {
  readonly court: CourtRow;
  readonly personId?: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly intent: "pay-at-desk" | "send-payment-link" | "free";
  readonly staffPriceMinor?: number;
  readonly fallbackCurrency: string;
  readonly now: Date;
}): Promise<CreatePrice> {
  const { rate, error } = await rateFor(input);
  const currency = (rate?.currency ?? input.fallbackCurrency) as CurrencyCode;
  if (input.intent === "free") {
    return {
      rate,
      rateError: error,
      subtotalMinor: 0,
      totalMinor: 0,
      currency,
      source: "free",
    };
  }
  const subtotalMinor = input.staffPriceMinor ?? rate?.amountMinor;
  if (subtotalMinor === undefined) {
    throw new ScheduleError(
      "PRECONDITION_FAILED",
      `${error ?? "No court rate applies."} Set a price or book it free. Nothing was booked.`,
    );
  }
  const source = input.staffPriceMinor === undefined ? "rate" : "staff";
  if (input.intent === "pay-at-desk" || subtotalMinor === 0) {
    return {
      rate,
      rateError: error,
      subtotalMinor,
      totalMinor: subtotalMinor,
      currency,
      source,
    };
  }
  const priced = priceConsumerOrder({
    currency,
    isDunaPlus: input.personId
      ? await hasActiveDunaPlusMembership(input.personId, input.now)
      : false,
    items: [
      {
        id: input.court.courtId,
        kind: "booking",
        description: `${input.court.venueName} · ${input.court.courtName}`,
        quantity: 1,
        unitAmountMinor: subtotalMinor,
      },
    ],
  });
  return {
    rate,
    rateError: error,
    subtotalMinor,
    totalMinor: priced.totalMinor,
    currency,
    source,
  };
}

export async function previewCreateCourtBooking(
  caller: ScheduleCaller,
  input: CreateWho & {
    readonly courtId: string;
    readonly startsAt: string;
    readonly endsAt: string;
    readonly paymentIntent: "pay-at-desk" | "send-payment-link" | "free";
  },
) {
  requireDatabase();
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  validateSlot(startsAt, endsAt, caller.now);
  return transactional(async (tx) => {
    const court = await loadCourt(tx, {
      organizationId: caller.organizationId,
      courtId: input.courtId,
      lock: false,
    });
    if (input.personId) {
      await assertClubPerson(tx, caller.organizationId, input.personId);
    }
    const facts = await loadCourtFacts(tx, {
      organizationId: caller.organizationId,
      court,
      startsAt,
      endsAt,
      now: caller.now,
    });
    const conflicts =
      court.courtStatus === "active" && court.venueStatus === "active"
        ? courtConflicts(facts, { startsAt, endsAt })
        : [
            {
              reason: "blackout" as const,
              what: "closed" as const,
              startsAt: startsAt.toISOString(),
              endsAt: endsAt.toISOString(),
              ids: [court.courtId],
            },
          ];
    const payments = await organizationPayments(tx, caller.organizationId);
    let price: CreatePrice | undefined;
    let priceUnavailable: string | undefined;
    try {
      price = await priceFor({
        court,
        personId: input.personId,
        startsAt,
        endsAt,
        intent: input.paymentIntent,
        fallbackCurrency: payments.currency,
        now: caller.now,
      });
    } catch (error) {
      if (!(error instanceof ScheduleError)) throw error;
      priceUnavailable = error.message;
    }
    log.info("schedule.booking.previewed", {
      courtId: court.courtId,
      conflicts: conflicts.length,
    });
    return {
      available: conflicts.length === 0,
      conflicts,
      ...(price && canSeeMoney(caller.actor)
        ? {
            price: {
              rateMinor: price.rate?.amountMinor ?? price.subtotalMinor,
              totalMinor: price.totalMinor,
              currency: price.currency,
              ratePlanName: price.rate?.planName ?? "Staff price",
              priceKind: price.rate?.priceKind ?? "base",
            },
          }
        : {}),
      ...(priceUnavailable ? { priceUnavailable } : {}),
      paymentLinkAvailable:
        payments.ready && Boolean(input.personId || input.walkIn?.phoneE164),
      timeZone: court.timeZone,
    };
  });
}

export async function createCourtBooking(
  caller: ScheduleCaller,
  input: CreateWho & {
    readonly courtId: string;
    readonly startsAt: string;
    readonly endsAt: string;
    readonly priceMinor?: number;
    readonly priceReason?: string;
    readonly currency: string;
    readonly paymentIntent: "pay-at-desk" | "send-payment-link" | "free";
    readonly expectedTotalMinor?: number;
    readonly note?: string;
    readonly idempotencyKey: string;
  },
) {
  requireDatabase();
  if (input.priceMinor !== undefined) requireScope(caller.actor, "payments:write");
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  validateSlot(startsAt, endsAt, caller.now);
  const bookingId = crypto.randomUUID();
  const keyHash = stableHash({
    organizationId: caller.organizationId,
    key: input.idempotencyKey,
  });
  try {
    const result = await transactional(async (tx) => {
      const court = await loadCourt(tx, {
        organizationId: caller.organizationId,
        courtId: input.courtId,
        lock: true,
      });
      assertCourtOpen(court);
      const member = input.personId
        ? await assertClubPerson(tx, caller.organizationId, input.personId)
        : undefined;
      const facts = await loadCourtFacts(tx, {
        organizationId: caller.organizationId,
        court,
        startsAt,
        endsAt,
        now: caller.now,
      });
      const conflicts = courtConflicts(facts, { startsAt, endsAt });
      if (conflicts.length > 0) {
        throw new ScheduleError("CONFLICT", conflictMessage(conflicts));
      }
      const payments = await organizationPayments(tx, caller.organizationId);
      const price = await priceFor({
        court,
        personId: member?.id,
        startsAt,
        endsAt,
        intent: input.paymentIntent,
        staffPriceMinor: input.priceMinor,
        fallbackCurrency: payments.currency,
        now: caller.now,
      });
      if (
        input.paymentIntent === "free" &&
        (price.rate?.amountMinor ?? 1) > 0
      ) {
        // Giving court time away is a price decision.
        requireScope(caller.actor, "payments:write");
      }
      if (input.currency.toUpperCase() !== price.currency) {
        throw new ScheduleError(
          "BAD_REQUEST",
          `This court is priced in ${price.currency}. Nothing was booked.`,
        );
      }
      if (
        input.expectedTotalMinor !== undefined &&
        input.expectedTotalMinor !== price.totalMinor
      ) {
        throw new ScheduleError(
          "CONFLICT",
          `The price is now ${money(price.totalMinor, price.currency)}. Review it and confirm again. Nothing was booked.`,
        );
      }
      const intent =
        price.totalMinor === 0 ? ("free" as const) : input.paymentIntent;
      if (intent === "send-payment-link") {
        if (!payments.ready) {
          throw new ScheduleError(
            "PRECONDITION_FAILED",
            "Payment links need Duna Pay to be set up. Nothing was booked; take payment at the desk instead.",
          );
        }
        if (!member && !input.walkIn?.phoneE164) {
          throw new ScheduleError(
            "BAD_REQUEST",
            "A payment link needs a member or a walk-in's phone number to claim it. Nothing was booked.",
          );
        }
      }

      let personId = member?.id;
      const walkInName = input.walkIn?.name.trim();
      if (!personId) {
        personId = crypto.randomUUID();
        // A contact for the booking, never an account: unclaimed, private,
        // no sign-in identity, and no phone stored on the profile.
        await tx.insert(people).values({
          id: personId,
          displayName: walkInName ?? "Walk-in",
          handle: `walkin-${personId.replaceAll("-", "").slice(0, 16)}`,
          profileClaimStatus: "unclaimed",
          profileVisibility: "private",
          status: "active",
          ageBand: "unknown",
        });
        await tx
          .insert(organizationParticipants)
          .values({
            organizationId: caller.organizationId,
            personId,
            relationship: "player",
            status: "active",
            addedByPersonId: caller.actor.personId,
          })
          .onConflictDoNothing();
      }
      const policy = normalizeCourtCancellationPolicy(court.cancellationPolicy);
      const holdExpiresAt =
        intent === "send-payment-link"
          ? new Date(
              Math.min(
                caller.now.getTime() + LINK_HOLD_MINUTES * 60_000,
                startsAt.getTime(),
              ),
            )
          : null;
      const orderId = intent === "pay-at-desk" ? crypto.randomUUID() : null;
      if (orderId) {
        await tx.insert(orders).values({
          id: orderId,
          organizationId: caller.organizationId,
          buyerPersonId: personId,
          status: "pending",
          currency: price.currency,
          subtotalMinor: price.subtotalMinor,
          feeTotalMinor: 0,
          taxTotalMinor: 0,
          totalMinor: price.totalMinor,
          idempotencyKey: `desk-order:${keyHash}`,
          checkoutSurface: "desk",
        });
      }
      await tx.insert(courtBookings).values({
        id: bookingId,
        organizationId: caller.organizationId,
        venueId: court.venueId,
        courtId: court.courtId,
        personId,
        orderId,
        startsAt,
        endsAt,
        bufferBeforeMinutes: court.bufferBeforeMinutes,
        bufferAfterMinutes: court.bufferAfterMinutes,
        status: intent === "send-payment-link" ? "held" : "confirmed",
        paymentMode: intent === "send-payment-link" ? "split" : "full",
        totalAmountMinor: price.totalMinor,
        fundedAmountMinor: 0,
        currency: price.currency,
        participantTarget: 1,
        policySnapshot: policy,
        holdExpiresAt,
        idempotencyKey: `desk:${keyHash}`,
        createdAt: caller.now,
        updatedAt: caller.now,
      });
      if (orderId) {
        await tx.insert(orderItems).values({
          orderId,
          kind: "booking",
          referenceId: bookingId,
          description: `${court.venueName} · ${court.courtName} · ${minutesBetween(startsAt, endsAt)} minutes`,
          quantity: 1,
          unitAmountMinor: price.subtotalMinor,
          totalAmountMinor: price.subtotalMinor,
        });
      }
      const inviteToken = crypto.randomUUID();
      await tx.insert(courtBookingParticipants).values({
        bookingId,
        // The link is claimed by a member's own account, or by the phone a
        // walk-in gave; never by the walk-in's contact profile.
        personId: intent === "send-payment-link" ? (member?.id ?? null) : personId,
        invitedName: member?.displayName ?? walkInName ?? "Walk-in",
        invitedPhoneE164: input.walkIn?.phoneE164 ?? null,
        inviteToken,
        role: intent === "send-payment-link" ? "player" : "organizer",
        status:
          intent === "send-payment-link"
            ? "invited"
            : intent === "free"
              ? "paid"
              : "payment-pending",
        shareAmountMinor: price.totalMinor,
        orderId,
        paidAt: intent === "free" ? caller.now : null,
        acceptedAt: intent === "send-payment-link" ? null : caller.now,
        createdAt: caller.now,
        updatedAt: caller.now,
      });
      await tx.insert(auditLog).values({
        organizationId: caller.organizationId,
        actorPersonId: caller.actor.personId,
        actorType: "person",
        action: "court-booking.desk-created",
        entityType: "court-booking",
        entityId: bookingId,
        afterHash: stableHash({
          courtId: court.courtId,
          startsAt,
          endsAt,
          intent,
          priceSource: price.source,
          totalMinor: price.totalMinor,
          walkIn: !member,
        }),
        reason: input.note?.trim() || "Booked at the front desk.",
        traceId: caller.requestId,
        ipAddress: caller.ipAddress,
        createdAt: caller.now,
      });
      if (price.source === "staff") {
        await tx.insert(auditLog).values({
          organizationId: caller.organizationId,
          actorPersonId: caller.actor.personId,
          actorType: "person",
          action: "court-booking.price-set-by-staff",
          entityType: "court-booking",
          entityId: bookingId,
          beforeHash: stableHash({ rateMinor: price.rate?.amountMinor ?? null }),
          afterHash: stableHash({ priceMinor: price.subtotalMinor }),
          reason: input.priceReason ?? "Staff price.",
          traceId: caller.requestId,
          ipAddress: caller.ipAddress,
          createdAt: caller.now,
        });
      }
      return { court, price, intent, orderId, inviteToken, holdExpiresAt };
    });
    log.info("schedule.booking.created", {
      bookingId,
      courtId: result.court.courtId,
      intent: result.intent,
    });
    const showMoney = canSeeMoney(caller.actor);
    return {
      id: bookingId,
      status:
        result.intent === "send-payment-link"
          ? ("held" as const)
          : ("confirmed" as const),
      paymentState:
        result.intent === "free"
          ? ("free" as const)
          : ("unpaid" as const),
      ...(result.intent === "send-payment-link" && result.holdExpiresAt
        ? {
            paymentLink: {
              url: canonicalPublicWebUrl(
                `/app/booking-invite/${result.inviteToken}`,
              ),
              expiresAt: result.holdExpiresAt.toISOString(),
            },
          }
        : {}),
      ...(result.orderId ? { orderId: result.orderId } : {}),
      ...(showMoney ? { totalMinor: result.price.totalMinor } : {}),
      currency: result.price.currency,
      priceSource: result.price.source,
    };
  } catch (error) {
    if (isOverlapError(error)) {
      log.info("schedule.booking.refused", {
        courtId: input.courtId,
        reason: "overlap",
      });
      throw new ScheduleError(
        "CONFLICT",
        "That court was just booked by someone else. Nothing was booked.",
      );
    }
    throw error;
  }
}

/* ---------------------------------------------------------- bookings */

type BookingRow = typeof courtBookings.$inferSelect;

async function loadBooking(
  tx: Transaction,
  organizationId: string,
  bookingId: string,
  lock: boolean,
): Promise<BookingRow> {
  const query = tx
    .select()
    .from(courtBookings)
    .where(
      and(
        eq(courtBookings.id, bookingId),
        eq(courtBookings.organizationId, organizationId),
      ),
    )
    .limit(1);
  const [row] = lock ? await query.for("update") : await query;
  if (!row) throw new ScheduleError("NOT_FOUND", "Booking was not found.");
  return row;
}

function assertLive(booking: BookingRow, now: Date): void {
  const live =
    booking.status === "confirmed" ||
    (booking.status === "held" &&
      Boolean(booking.holdExpiresAt && booking.holdExpiresAt > now));
  if (!live) {
    throw new ScheduleError(
      "CONFLICT",
      "This booking is no longer active. Nothing was changed.",
    );
  }
}

async function assertNoLinkedMatch(
  tx: Transaction,
  bookingId: string,
): Promise<void> {
  const [linked] = await tx
    .select({ id: pickupSessions.id })
    .from(pickupSessions)
    .where(
      and(
        eq(pickupSessions.courtBookingId, bookingId),
        ne(pickupSessions.status, "cancelled"),
      ),
    )
    .limit(1);
  if (linked) {
    throw new ScheduleError(
      "CONFLICT",
      "A player match is linked to this booking; change it from the match. Nothing was changed.",
    );
  }
}

async function courtName(
  tx: Transaction,
  organizationId: string,
  courtId: string,
): Promise<string> {
  const court = await loadCourt(tx, { organizationId, courtId, lock: false });
  return court.courtName;
}

function draftBody(input: {
  readonly kind: "moved" | "cancelled";
  readonly venueName: string;
  readonly courtName: string;
  readonly timeZone: string;
  readonly from: Date;
  readonly to?: Date;
  readonly toCourtName?: string;
}): string {
  const place = `${input.venueName} · ${input.courtName}`;
  if (input.kind === "cancelled") {
    return `Your court booking at ${place} on ${clock(input.from, input.timeZone)} is cancelled. Any refund goes back the way you paid.`;
  }
  return `Your court booking at ${place} on ${clock(input.from, input.timeZone)} has moved to ${clock(input.to!, input.timeZone)}${input.toCourtName && input.toCourtName !== input.courtName ? ` on ${input.toCourtName}` : ""}.`;
}

/* -------------------------------------------------------------- move */

interface MovePlan {
  readonly booking: BookingRow;
  readonly fromCourt: CourtRow;
  readonly toCourt: CourtRow;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly conflicts: ScheduleConflict[];
  readonly price: {
    readonly action: "unchanged" | "reprice" | "kept";
    readonly currentTotalMinor: number;
    readonly newTotalMinor: number;
    readonly differenceMinor: number;
    readonly currency: string;
    readonly orderId?: string;
  };
  readonly recipients: ScheduleMessageDraft["recipients"];
  readonly materialChange: boolean;
  readonly token: string;
}

async function planMove(
  tx: Transaction,
  caller: ScheduleCaller,
  input: {
    readonly bookingId: string;
    readonly startsAt: string;
    readonly endsAt: string;
    readonly courtId?: string;
  },
  lock: boolean,
): Promise<MovePlan> {
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  validateSlot(startsAt, endsAt, caller.now);
  const booking = await loadBooking(
    tx,
    caller.organizationId,
    input.bookingId,
    lock,
  );
  assertLive(booking, caller.now);
  if (booking.endsAt <= caller.now) {
    throw new ScheduleError(
      "CONFLICT",
      "This booking has already finished. Nothing was moved.",
    );
  }
  await assertNoLinkedMatch(tx, booking.id);
  const fromCourt = await loadCourt(tx, {
    organizationId: caller.organizationId,
    courtId: booking.courtId,
    lock: false,
  });
  const toCourt =
    input.courtId && input.courtId !== booking.courtId
      ? await loadCourt(tx, {
          organizationId: caller.organizationId,
          courtId: input.courtId,
          lock,
        })
      : lock
        ? await loadCourt(tx, {
            organizationId: caller.organizationId,
            courtId: booking.courtId,
            lock: true,
          })
        : fromCourt;
  const facts = await loadCourtFacts(tx, {
    organizationId: caller.organizationId,
    court: toCourt,
    startsAt,
    endsAt,
    now: caller.now,
  });
  const conflicts =
    toCourt.courtStatus === "active" && toCourt.venueStatus === "active"
      ? courtConflicts(facts, { startsAt, endsAt }, [booking.id])
      : [
          {
            reason: "blackout" as const,
            what: "closed" as const,
            startsAt: startsAt.toISOString(),
            endsAt: endsAt.toISOString(),
            ids: [toCourt.courtId],
          },
        ];

  // The price: an unpaid desk order still at the court's rate takes the
  // rate of the new slot; everything else keeps its price.
  const currentTotalMinor = booking.totalAmountMinor;
  let price: MovePlan["price"] = {
    action: currentTotalMinor === 0 ? "unchanged" : "kept",
    currentTotalMinor,
    newTotalMinor: currentTotalMinor,
    differenceMinor: 0,
    currency: booking.currency,
  };
  if (booking.orderId && currentTotalMinor > 0) {
    const [order] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, booking.orderId))
      .limit(1);
    if (order?.status === "pending" && order.checkoutSurface === "desk") {
      const [before, after] = await Promise.all([
        rateFor({
          court: fromCourt,
          personId: booking.personId,
          startsAt: booking.startsAt,
          endsAt: booking.endsAt,
        }),
        rateFor({ court: toCourt, personId: booking.personId, startsAt, endsAt }),
      ]);
      if (
        before.rate &&
        after.rate &&
        before.rate.amountMinor === order.subtotalMinor &&
        after.rate.currency === order.currency
      ) {
        const difference = after.rate.amountMinor - order.totalMinor;
        price = {
          action: difference === 0 ? "unchanged" : "reprice",
          currentTotalMinor: order.totalMinor,
          newTotalMinor: after.rate.amountMinor,
          differenceMinor: difference,
          currency: order.currency,
          orderId: order.id,
        };
      }
    }
  }
  const recipients = await recipientsFor(tx, booking);
  const shift = Math.abs(startsAt.getTime() - booking.startsAt.getTime());
  const materialChange =
    shift >= 60 * 60_000 || toCourt.venueId !== fromCourt.venueId;
  const token = stableHash({
    bookingId: booking.id,
    status: booking.status,
    updatedAt: booking.updatedAt,
    to: { courtId: toCourt.courtId, startsAt, endsAt },
    price,
    conflicts: conflicts.length,
  }).slice(0, 32);
  return {
    booking,
    fromCourt,
    toCourt,
    startsAt,
    endsAt,
    conflicts,
    price,
    recipients,
    materialChange,
    token,
  };
}

function moveDraft(plan: MovePlan): ScheduleMessageDraft {
  return {
    recipients: plan.recipients,
    body: draftBody({
      kind: "moved",
      venueName: plan.fromCourt.venueName,
      courtName: plan.fromCourt.courtName,
      timeZone: plan.toCourt.timeZone,
      from: plan.booking.startsAt,
      to: plan.startsAt,
      toCourtName: plan.toCourt.courtName,
    }),
  };
}

export async function previewMoveCourtBooking(
  caller: ScheduleCaller,
  input: {
    readonly bookingId: string;
    readonly startsAt: string;
    readonly endsAt: string;
    readonly courtId?: string;
  },
) {
  requireDatabase();
  const plan = await transactional((tx) => planMove(tx, caller, input, false));
  const showMoney = canSeeMoney(caller.actor);
  return {
    bookingId: plan.booking.id,
    from: {
      courtId: plan.fromCourt.courtId,
      courtName: plan.fromCourt.courtName,
      startsAt: plan.booking.startsAt.toISOString(),
      endsAt: plan.booking.endsAt.toISOString(),
    },
    to: {
      courtId: plan.toCourt.courtId,
      courtName: plan.toCourt.courtName,
      startsAt: plan.startsAt.toISOString(),
      endsAt: plan.endsAt.toISOString(),
    },
    available: plan.conflicts.length === 0,
    conflicts: plan.conflicts,
    price: {
      action: plan.price.action,
      ...(showMoney
        ? {
            currentTotalMinor: plan.price.currentTotalMinor,
            newTotalMinor: plan.price.newTotalMinor,
            differenceMinor: plan.price.differenceMinor,
            currency: plan.price.currency,
          }
        : {}),
    },
    requiresPriceConfirmation: plan.price.action === "reprice",
    materialChange: plan.materialChange,
    draft: moveDraft(plan),
    previewToken: plan.token,
  };
}

export async function moveCourtBooking(
  caller: ScheduleCaller,
  input: {
    readonly bookingId: string;
    readonly startsAt: string;
    readonly endsAt: string;
    readonly courtId?: string;
    readonly notify: boolean;
    readonly previewToken?: string;
    readonly confirmedPriceChange?: boolean;
    readonly idempotencyKey: string;
  },
) {
  requireDatabase();
  try {
    const plan = await transactional(async (tx) => {
      const plan = await planMove(tx, caller, input, true);
      if (input.previewToken && input.previewToken !== plan.token) {
        throw new ScheduleError(
          "CONFLICT",
          "This booking changed since you looked. Review the move again. Nothing was moved.",
        );
      }
      if (plan.conflicts.length > 0) {
        throw new ScheduleError(
          "CONFLICT",
          conflictMessage(plan.conflicts).replace("booked", "moved"),
        );
      }
      if (plan.price.action === "reprice" && input.confirmedPriceChange !== true) {
        throw new ScheduleError(
          "PRECONDITION_FAILED",
          `This move changes the price by ${money(plan.price.differenceMinor, plan.price.currency)}. Confirm the new price. Nothing was moved.`,
        );
      }
      const { booking, toCourt } = plan;
      await tx
        .update(courtBookings)
        .set({
          courtId: toCourt.courtId,
          venueId: toCourt.venueId,
          startsAt: plan.startsAt,
          endsAt: plan.endsAt,
          bufferBeforeMinutes: toCourt.bufferBeforeMinutes,
          bufferAfterMinutes: toCourt.bufferAfterMinutes,
          ...(booking.status === "held" && booking.holdExpiresAt
            ? {
                holdExpiresAt: new Date(
                  Math.min(
                    booking.holdExpiresAt.getTime(),
                    plan.startsAt.getTime(),
                  ),
                ),
              }
            : {}),
          ...(plan.price.action === "reprice"
            ? { totalAmountMinor: plan.price.newTotalMinor }
            : {}),
          updatedAt: caller.now,
        })
        .where(eq(courtBookings.id, booking.id));
      if (plan.price.action === "reprice" && plan.price.orderId) {
        const amount = plan.price.newTotalMinor;
        await tx
          .update(orders)
          .set({ subtotalMinor: amount, totalMinor: amount, updatedAt: caller.now })
          .where(
            and(eq(orders.id, plan.price.orderId), eq(orders.status, "pending")),
          );
        await tx
          .update(orderItems)
          .set({ unitAmountMinor: amount, totalAmountMinor: amount })
          .where(
            and(
              eq(orderItems.orderId, plan.price.orderId),
              eq(orderItems.referenceId, booking.id),
            ),
          );
        await tx
          .update(courtBookingParticipants)
          .set({ shareAmountMinor: amount, updatedAt: caller.now })
          .where(
            and(
              eq(courtBookingParticipants.bookingId, booking.id),
              eq(courtBookingParticipants.orderId, plan.price.orderId),
            ),
          );
      }
      await tx.insert(auditLog).values({
        organizationId: caller.organizationId,
        actorPersonId: caller.actor.personId,
        actorType: "person",
        action: "court-booking.moved",
        entityType: "court-booking",
        entityId: booking.id,
        beforeHash: stableHash({
          courtId: booking.courtId,
          startsAt: booking.startsAt,
          endsAt: booking.endsAt,
          totalMinor: booking.totalAmountMinor,
        }),
        afterHash: stableHash({
          courtId: toCourt.courtId,
          startsAt: plan.startsAt,
          endsAt: plan.endsAt,
          totalMinor: plan.price.newTotalMinor,
        }),
        reason:
          plan.price.action === "reprice"
            ? "Moved from the schedule; the unpaid desk price follows the court's rate (confirmed)."
            : "Moved from the schedule.",
        traceId: caller.requestId,
        ipAddress: caller.ipAddress,
        createdAt: caller.now,
      });
      return plan;
    });
    log.info("schedule.booking.moved", {
      bookingId: plan.booking.id,
      courtId: plan.toCourt.courtId,
      recipients: input.notify ? plan.recipients.length : 0,
    });
    return {
      id: plan.booking.id,
      startsAt: plan.startsAt.toISOString(),
      endsAt: plan.endsAt.toISOString(),
      courtId: plan.toCourt.courtId,
      undo: {
        startsAt: plan.booking.startsAt.toISOString(),
        endsAt: plan.booking.endsAt.toISOString(),
        courtId: plan.booking.courtId,
      },
      toTell: input.notify ? plan.recipients.length : 0,
      sent: 0 as const,
      ...(input.notify ? { draft: moveDraft(plan) } : {}),
      repriced: plan.price.action === "reprice",
    };
  } catch (error) {
    if (isOverlapError(error)) {
      throw new ScheduleError(
        "CONFLICT",
        "That court was just booked by someone else. Nothing was moved.",
      );
    }
    throw error;
  }
}

/* ------------------------------------------------------------ cancel */

interface CancelPlan {
  readonly booking: BookingRow;
  readonly court: CourtRow;
  readonly plan: ReturnType<typeof planCourtCancellation>;
  readonly policy: ReturnType<typeof normalizeCourtCancellationPolicy>;
  readonly orders: readonly PlanOrder[];
  readonly participants: readonly PlanParticipant[];
  readonly recipients: ScheduleMessageDraft["recipients"];
  readonly token: string;
}

async function loadCancelPlan(
  tx: Transaction,
  caller: ScheduleCaller,
  input: {
    readonly bookingId: string;
    readonly refund: RefundChoice;
    readonly cause: CancelCause;
  },
  lock: boolean,
): Promise<CancelPlan> {
  const booking = await loadBooking(
    tx,
    caller.organizationId,
    input.bookingId,
    lock,
  );
  assertLive(booking, caller.now);
  await assertNoLinkedMatch(tx, booking.id);
  const court = await loadCourt(tx, {
    organizationId: caller.organizationId,
    courtId: booking.courtId,
    lock: false,
  });
  const participantRows = await tx
    .select({
      id: courtBookingParticipants.id,
      personId: courtBookingParticipants.personId,
      invitedName: courtBookingParticipants.invitedName,
      displayName: people.displayName,
      role: courtBookingParticipants.role,
      status: courtBookingParticipants.status,
      orderId: courtBookingParticipants.orderId,
    })
    .from(courtBookingParticipants)
    .leftJoin(people, eq(courtBookingParticipants.personId, people.id))
    .where(eq(courtBookingParticipants.bookingId, booking.id));
  const orderIds = [
    ...new Set(
      [booking.orderId, ...participantRows.map((row) => row.orderId)].filter(
        (id): id is string => Boolean(id),
      ),
    ),
  ];
  const [orderRows, refundRows] =
    orderIds.length === 0
      ? [[], []]
      : await Promise.all([
          tx
            .select({
              id: orders.id,
              status: orders.status,
              totalMinor: orders.totalMinor,
              currency: orders.currency,
              stripePaymentIntentId: orders.stripePaymentIntentId,
            })
            .from(orders)
            .where(
              and(
                inArray(orders.id, orderIds),
                eq(orders.organizationId, caller.organizationId),
              ),
            ),
          tx
            .select({
              orderId: refundRecords.orderId,
              amount: sql<number>`coalesce(sum(${refundRecords.amountMinor}), 0)::bigint`,
            })
            .from(refundRecords)
            .where(
              and(
                inArray(refundRecords.orderId, orderIds),
                inArray(refundRecords.status, ["pending", "succeeded"]),
              ),
            )
            .groupBy(refundRecords.orderId),
        ]);
  const refunded = new Map(
    refundRows.map((row) => [row.orderId, Number(row.amount)]),
  );
  const planOrders: PlanOrder[] = orderRows.map((row) => ({
    ...row,
    refundedMinor: refunded.get(row.id) ?? 0,
  }));
  const participants: PlanParticipant[] = participantRows.map((row) => ({
    id: row.id,
    personId: row.personId,
    name: row.displayName ?? row.invitedName ?? "Player",
    role: row.role,
    status: row.status,
    orderId: row.orderId,
  }));
  const policy = normalizeCourtCancellationPolicy(booking.policySnapshot);
  const plan = planCourtCancellation({
    booking: {
      startsAt: booking.startsAt,
      orderId: booking.orderId,
      personId: booking.personId,
      refundBeforeHours: policy.refundBeforeHours,
    },
    participants,
    orders: planOrders,
    refund: input.refund,
    cause: input.cause,
    now: caller.now,
  });
  if (input.cause === "club" && plan.keepsPaidMoney) {
    // Unreachable by construction (club → full); kept as a guard.
    throw new ScheduleError(
      "BAD_REQUEST",
      "When the club cancels, every payer gets their money back in full.",
    );
  }
  const recipients = await recipientsFor(tx, booking);
  const token = stableHash({
    bookingId: booking.id,
    status: booking.status,
    updatedAt: booking.updatedAt,
    lines: plan.lines.map((line) => ({
      orderId: line.orderId ?? null,
      participantId: line.participantId ?? null,
      action: line.action,
      refundMinor: line.refundMinor,
    })),
  }).slice(0, 32);
  return {
    booking,
    court,
    plan,
    policy,
    orders: planOrders,
    participants,
    recipients,
    token,
  };
}

function lineOut(
  line: CancelPlan["plan"]["lines"][number],
  showMoney: boolean,
): ScheduleCancelLine {
  return {
    ...(line.participantId ? { participantId: line.participantId } : {}),
    ...(line.orderId ? { orderId: line.orderId } : {}),
    name: line.name,
    method: line.method,
    action: line.action,
    ...(showMoney
      ? { paidMinor: line.paidMinor, refundMinor: line.refundMinor }
      : {}),
  };
}

function cancelDraft(loaded: CancelPlan): ScheduleMessageDraft {
  return {
    recipients: loaded.recipients,
    body: draftBody({
      kind: "cancelled",
      venueName: loaded.court.venueName,
      courtName: loaded.court.courtName,
      timeZone: loaded.court.timeZone,
      from: loaded.booking.startsAt,
    }),
  };
}

export async function previewCancelCourtBooking(
  caller: ScheduleCaller,
  input: {
    readonly bookingId: string;
    readonly refund: RefundChoice;
    readonly cause: CancelCause;
  },
) {
  requireDatabase();
  const loaded = await transactional((tx) =>
    loadCancelPlan(tx, caller, input, false),
  );
  const showMoney = canSeeMoney(caller.actor);
  return {
    bookingId: loaded.booking.id,
    refund: input.refund,
    cause: input.cause,
    policy: {
      title: loaded.policy.title,
      ...(loaded.policy.refundBeforeHours !== undefined
        ? { refundBeforeHours: loaded.policy.refundBeforeHours }
        : {}),
      insideRefundWindow: loaded.plan.insideRefundWindow,
    },
    lines: loaded.plan.lines.map((line) => lineOut(line, showMoney)),
    ...(showMoney
      ? {
          totalRefundMinor: loaded.plan.totalRefundMinor,
          ...(loaded.plan.currency ? { currency: loaded.plan.currency } : {}),
        }
      : {}),
    needsMoneyPermission: loaded.plan.movesMoney,
    draft: cancelDraft(loaded),
    previewToken: loaded.token,
  };
}

export async function cancelCourtBooking(
  caller: ScheduleCaller,
  input: {
    readonly bookingId: string;
    readonly reason: string;
    readonly refund: RefundChoice;
    readonly cause: CancelCause;
    readonly previewToken?: string;
    readonly idempotencyKey: string;
  },
) {
  requireDatabase();
  const loaded = await transactional(async (tx) => {
    const loaded = await loadCancelPlan(tx, caller, input, true);
    if (input.previewToken && input.previewToken !== loaded.token) {
      throw new ScheduleError(
        "CONFLICT",
        "This booking changed since you looked. Review the cancellation again. Nothing was cancelled.",
      );
    }
    if (loaded.plan.movesMoney) requireScope(caller.actor, "payments:write");
    const { booking } = loaded;
    await tx
      .update(courtBookings)
      .set({ status: "cancelled", holdExpiresAt: null, updatedAt: caller.now })
      .where(eq(courtBookings.id, booking.id));
    await tx
      .update(courtBookingParticipants)
      .set({ status: "cancelled", updatedAt: caller.now })
      .where(
        and(
          eq(courtBookingParticipants.bookingId, booking.id),
          notInArray(courtBookingParticipants.status, ["cancelled", "declined"]),
        ),
      );
    for (const line of loaded.plan.lines) {
      if (line.action === "release" && line.orderId) {
        await tx
          .update(orders)
          .set({ status: "cancelled", updatedAt: caller.now })
          .where(
            and(
              eq(orders.id, line.orderId),
              inArray(orders.status, ["pending", "draft"]),
            ),
          );
      }
      if (line.action === "hand-back-at-desk" && line.orderId) {
        const order = loaded.orders.find((row) => row.id === line.orderId)!;
        await tx
          .update(orders)
          .set({
            status:
              line.refundMinor + order.refundedMinor >= order.totalMinor
                ? "refunded"
                : "partially-refunded",
            updatedAt: caller.now,
          })
          .where(eq(orders.id, line.orderId));
        await tx.insert(auditLog).values({
          organizationId: caller.organizationId,
          actorPersonId: caller.actor.personId,
          actorType: "person",
          action: "court-booking.desk-refund-recorded",
          entityType: "order",
          entityId: line.orderId,
          afterHash: stableHash({
            refundMinor: line.refundMinor,
            currency: order.currency,
          }),
          reason: `Handed back at the desk: ${input.reason}`,
          traceId: caller.requestId,
          ipAddress: caller.ipAddress,
          createdAt: caller.now,
        });
      }
    }
    await tx.insert(auditLog).values({
      organizationId: caller.organizationId,
      actorPersonId: caller.actor.personId,
      actorType: "person",
      action: "court-booking.desk-cancelled",
      entityType: "court-booking",
      entityId: booking.id,
      beforeHash: stableHash({ status: booking.status }),
      afterHash: stableHash({
        status: "cancelled",
        refund: input.refund,
        cause: input.cause,
        totalRefundMinor: loaded.plan.totalRefundMinor,
      }),
      reason: input.reason,
      traceId: caller.requestId,
      ipAddress: caller.ipAddress,
      createdAt: caller.now,
    });
    return loaded;
  });

  // Card refunds go through the club's refund path after the slot is
  // released: each is its own refund record and processor call (keyed by
  // this cancellation, so a retry never refunds twice).
  const outcomes = new Map<string, { outcome: string; refundId?: string }>();
  for (const line of loaded.plan.lines) {
    if (line.action !== "refund-card" || !line.orderId) continue;
    try {
      const result = await refundOrganizationOrder({
        actor: { ...caller.actor, organizationId: caller.organizationId },
        orderId: line.orderId,
        amountMinor: line.refundMinor,
        disposition: "original-payment",
        reason: input.reason,
        requestId: `schedule-cancel:${stableHash({ key: input.idempotencyKey, orderId: line.orderId }).slice(0, 40)}`,
        ipAddress: caller.ipAddress,
        now: caller.now,
      });
      outcomes.set(line.orderId, {
        outcome: result.status === "failed" ? "refund-failed" : "refund-submitted",
        refundId: result.id,
      });
    } catch (error) {
      log.warn("schedule.booking.refundFailed", {
        bookingId: loaded.booking.id,
        orderId: line.orderId,
        error,
      });
      outcomes.set(line.orderId, { outcome: "refund-failed" });
    }
  }
  const showMoney = canSeeMoney(caller.actor);
  log.info("schedule.booking.cancelled", {
    bookingId: loaded.booking.id,
    lines: loaded.plan.lines.length,
    refunds: outcomes.size,
  });
  return {
    id: loaded.booking.id,
    status: "cancelled" as const,
    lines: loaded.plan.lines.map((line) => {
      const outcome = line.orderId ? outcomes.get(line.orderId) : undefined;
      return {
        ...lineOut(line, showMoney),
        outcome: (outcome?.outcome ??
          (line.action === "release"
            ? "released"
            : line.action === "hand-back-at-desk"
              ? "handed-back-recorded"
              : "kept")) as
          | "released"
          | "refund-submitted"
          | "refund-failed"
          | "handed-back-recorded"
          | "kept",
        ...(outcome?.refundId ? { refundId: outcome.refundId } : {}),
      };
    }),
    ...(showMoney
      ? {
          totalRefundMinor: loaded.plan.totalRefundMinor,
          ...(loaded.plan.currency ? { currency: loaded.plan.currency } : {}),
        }
      : {}),
    toTell: loaded.recipients.length,
    sent: 0 as const,
    draft: cancelDraft(loaded),
  };
}

/* ------------------------------------------------------ desk payment */

export async function recordDeskPayment(
  caller: ScheduleCaller,
  input: {
    readonly orderId?: string;
    readonly bookingId?: string;
    readonly amountMinor: number;
    readonly method: "cash" | "card-at-desk-external" | "other";
    readonly note?: string;
    readonly idempotencyKey: string;
  },
) {
  requireDatabase();
  const auditId = crypto.randomUUID();
  const result = await transactional(async (tx) => {
    const [found] = await tx
      .select({ id: courtBookings.id })
      .from(courtBookings)
      .where(
        and(
          eq(courtBookings.organizationId, caller.organizationId),
          input.bookingId
            ? eq(courtBookings.id, input.bookingId)
            : eq(courtBookings.orderId, input.orderId!),
        ),
      )
      .limit(1);
    if (!found) throw new ScheduleError("NOT_FOUND", "Booking was not found.");
    const booking = await loadBooking(
      tx,
      caller.organizationId,
      found.id,
      true,
    );
    if (booking.status !== "confirmed") {
      throw new ScheduleError(
        "CONFLICT",
        "This booking is not active, so there is nothing to collect. Nothing was recorded.",
      );
    }
    if (!booking.orderId) {
      throw new ScheduleError(
        "CONFLICT",
        booking.paymentMode === "split"
          ? "This booking is paid by its link or in shares; the desk cannot record it. Nothing was recorded."
          : "Nothing is owed on this booking. Nothing was recorded.",
      );
    }
    const [order] = await tx
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.id, booking.orderId),
          eq(orders.organizationId, caller.organizationId),
        ),
      )
      .limit(1);
    if (!order) throw new ScheduleError("NOT_FOUND", "Order was not found.");
    if (order.status !== "pending" || order.checkoutSurface !== "desk") {
      throw new ScheduleError(
        "CONFLICT",
        order.status === "paid"
          ? "This booking is already paid. Nothing was recorded."
          : "This order is paid online, not at the desk. Nothing was recorded.",
      );
    }
    if (input.amountMinor !== order.totalMinor) {
      throw new ScheduleError(
        "BAD_REQUEST",
        `Record the whole amount due (${money(order.totalMinor, order.currency)}). Part payments are not supported by orders yet. Nothing was recorded.`,
      );
    }
    const [paid] = await tx
      .update(orders)
      .set({ status: "paid", updatedAt: caller.now })
      .where(and(eq(orders.id, order.id), eq(orders.status, "pending")))
      .returning({ id: orders.id });
    if (!paid) {
      throw new ScheduleError(
        "CONFLICT",
        "Someone else recorded this payment just now. Nothing was recorded.",
      );
    }
    await tx
      .update(courtBookings)
      .set({ fundedAmountMinor: booking.totalAmountMinor, updatedAt: caller.now })
      .where(eq(courtBookings.id, booking.id));
    await tx
      .update(courtBookingParticipants)
      .set({ status: "paid", paidAt: caller.now, updatedAt: caller.now })
      .where(
        and(
          eq(courtBookingParticipants.bookingId, booking.id),
          eq(courtBookingParticipants.orderId, order.id),
        ),
      );
    await tx.insert(auditLog).values({
      id: auditId,
      organizationId: caller.organizationId,
      actorPersonId: caller.actor.personId,
      actorType: "person",
      action: "court-booking.desk-payment-recorded",
      entityType: "order",
      entityId: order.id,
      beforeHash: stableHash({ status: "pending" }),
      afterHash: stableHash({
        status: "paid",
        method: input.method,
        amountMinor: input.amountMinor,
        currency: order.currency,
        bookingId: booking.id,
      }),
      reason: input.note?.trim()
        ? `Paid at the desk (${input.method}): ${input.note.trim()}`
        : `Paid at the desk (${input.method}).`,
      traceId: caller.requestId,
      ipAddress: caller.ipAddress,
      createdAt: caller.now,
    });
    return { booking, order };
  });
  log.info("schedule.deskPayment.recorded", {
    orderId: result.order.id,
    bookingId: result.booking.id,
    method: input.method,
  });
  return {
    id: auditId,
    orderId: result.order.id,
    bookingId: result.booking.id,
    orderStatus: "paid" as const,
    amountMinor: input.amountMinor,
    currency: result.order.currency,
    method: input.method,
    ledgerRecorded: false as const,
  };
}

/* ------------------------------------------- calendar money (one read) */

export async function bookingPayments(
  caller: ScheduleCaller,
  input: { readonly from: string; readonly to: string; readonly venueId?: string },
): Promise<{
  bookings: {
    bookingId: string;
    orderId?: string;
    totalMinor: number;
    paidMinor: number;
    currency: string;
    paymentState: SchedulePaymentState;
    due: boolean;
  }[];
}> {
  requireDatabase();
  if (!canSeeMoney(caller.actor)) {
    throw new ScheduleError(
      "FORBIDDEN",
      "Missing required scope: payments:read",
    );
  }
  const from = new Date(input.from);
  const to = new Date(input.to);
  if (!(to > from) || to.getTime() - from.getTime() > 62 * 24 * 60 * 60_000) {
    throw new ScheduleError(
      "BAD_REQUEST",
      "Ask for at most 62 days at a time.",
    );
  }
  return transactional(async (tx) => {
    const rows = await tx
      .select({
        id: courtBookings.id,
        orderId: courtBookings.orderId,
        status: courtBookings.status,
        totalMinor: courtBookings.totalAmountMinor,
        fundedMinor: courtBookings.fundedAmountMinor,
        currency: courtBookings.currency,
      })
      .from(courtBookings)
      .innerJoin(venues, eq(courtBookings.venueId, venues.id))
      .where(
        and(
          eq(courtBookings.organizationId, caller.organizationId),
          eq(venues.organizationId, caller.organizationId),
          input.venueId ? eq(courtBookings.venueId, input.venueId) : undefined,
          lt(courtBookings.startsAt, to),
          gt(courtBookings.endsAt, from),
          ne(courtBookings.status, "expired"),
        ),
      )
      .limit(5_000);
    if (rows.length === 0) return { bookings: [] };
    const ids = rows.map((row) => row.id);
    const refunds = await tx
      .select({
        bookingId: courtBookingParticipants.bookingId,
        amount: sql<number>`coalesce(sum(${refundRecords.amountMinor}), 0)::bigint`,
      })
      .from(refundRecords)
      .innerJoin(
        courtBookingParticipants,
        eq(courtBookingParticipants.orderId, refundRecords.orderId),
      )
      .where(
        and(
          inArray(courtBookingParticipants.bookingId, ids),
          inArray(refundRecords.status, ["pending", "succeeded"]),
        ),
      )
      .groupBy(courtBookingParticipants.bookingId);
    const refundedBy = new Map(
      refunds.map((row) => [row.bookingId, Number(row.amount)]),
    );
    return {
      bookings: rows.map((row) => {
        const refunded = refundedBy.get(row.id) ?? 0;
        const paidMinor = Math.max(0, row.fundedMinor - refunded);
        const gone = row.status === "cancelled" || row.status === "refunded";
        const paymentState: SchedulePaymentState =
          row.totalMinor === 0
            ? "free"
            : gone
              ? refunded > 0
                ? "refunded"
                : "cancelled"
              : paidMinor >= row.totalMinor
                ? "paid"
                : paidMinor > 0
                  ? "part-paid"
                  : "unpaid";
        return {
          bookingId: row.id,
          ...(row.orderId ? { orderId: row.orderId } : {}),
          totalMinor: row.totalMinor,
          paidMinor,
          currency: row.currency,
          paymentState,
          due: paymentState === "unpaid" || paymentState === "part-paid",
        };
      }),
    };
  });
}

export { hasScope };
