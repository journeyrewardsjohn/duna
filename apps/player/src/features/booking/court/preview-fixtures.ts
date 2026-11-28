/**
 * Preview builds only (no sign-in, no payments): fixture data so each step of
 * the court booking flow can be opened and photographed from a dev link,
 * `duna://dev/shell?route=court&id=<venue>&step=players|pay|confirming|confirmed|failed`.
 * Live builds never read it (`CourtTimesScreen` passes it only in preview).
 */
import type {
  BookingParticipant,
  CourtAvailability,
  CourtCheckoutQuote,
} from "../../courts/court-types";
import type { CourtFlowState } from "./court-flow";
import type { ConfirmedBooking } from "./CourtBookingFlow";

export type CourtFlowPreviewStep =
  "players" | "pay" | "confirming" | "confirmed" | "failed";

export interface CourtFlowPreview {
  readonly state: (initial: CourtFlowState) => Partial<CourtFlowState>;
  readonly quote?: CourtCheckoutQuote;
  readonly slot?: CourtAvailability["slots"][number];
  readonly confirmed?: ConfirmedBooking;
  readonly bookerName?: string;
}

export function isPreviewStep(
  value: string | undefined,
): value is CourtFlowPreviewStep {
  return (
    value === "players" ||
    value === "pay" ||
    value === "confirming" ||
    value === "confirmed" ||
    value === "failed"
  );
}

const GUESTS: readonly BookingParticipant[] = [
  { personId: "00000000-0000-4000-8000-000000000002", name: "Taylor Crabb" },
  { name: "Kerri Walsh", phoneE164: "+17045550199" },
];

/** A fixture for a step at a real venue, a real date and a real court. */
export function courtFlowPreview(input: {
  readonly step: CourtFlowPreviewStep;
  readonly date: string;
  readonly localStartsAt: string;
  readonly courtId: string;
  readonly courtName: string;
  readonly startsAt: string;
  readonly endsAt: string;
}): CourtFlowPreview {
  const quote: CourtCheckoutQuote = {
    subtotalMinor: 3000,
    feeTotalMinor: 0,
    totalMinor: 3000,
    payNowMinor: 1000,
    organizerShareMinor: 1000,
    participantShareMinor: 1000,
    shareCount: 3,
    currency: "USD",
    rateUnitMinutes: 30,
    ratePlanId: "00000000-0000-4000-8000-0000000000aa",
    ratePlanName: "Preview",
    priceKind: "member",
    memberRateApplied: true,
    dunaPlusApplied: true,
  };
  const slot: CourtAvailability["slots"][number] = {
    courtId: input.courtId,
    courtName: input.courtName,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    localStartsAt: input.localStartsAt,
    localEndsAt: input.localStartsAt,
    durationMinutes: 90,
    price: { amountMinor: 7500, currency: "USD" },
    daylightStatus: "daylight",
  };
  return {
    bookerName: "John Sutton",
    quote,
    slot,
    state: () => ({
      step: input.step,
      guests: GUESTS,
      paymentMode: "split",
      intent: "host",
      policyAccepted: input.step !== "pay",
      policyRead: input.step !== "pay",
      phase: input.step === "confirming" ? 1 : 3,
      ...(input.step === "failed"
        ? {
            failure: {
              message: "That court was taken a moment ago. Pick another time.",
              money: "not-charged" as const,
              reference: "err_preview",
            },
          }
        : {}),
    }),
    ...(input.step === "confirmed"
      ? {
          confirmed: {
            bookingId: "00000000-0000-4000-8000-0000000000bb",
            startsAt: input.startsAt,
            endsAt: input.endsAt,
            complete: true,
            awaitingParticipants: false,
            paidMinor: 1000,
            totalMinor: 3000,
            currency: "USD",
            paymentMode: "split" as const,
            match: {
              id: "00000000-0000-4000-8000-0000000000cc",
              slug: "preview",
              title: "Saturday match",
            },
            participants: [
              {
                id: "a",
                personId: GUESTS[0]!.personId,
                displayName: "Taylor Crabb",
                role: "player",
                status: "paid" as const,
                shareAmountMinor: 1000,
              },
              {
                id: "b",
                displayName: "Kerri Walsh",
                role: "player",
                status: "payment-pending" as const,
                shareAmountMinor: 1000,
                inviteToken: "preview-token",
              },
            ],
          },
        }
      : {}),
  };
}
