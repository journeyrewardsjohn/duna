import type { PersonSummary } from "@duna/core";
import type { DunaApiClient } from "../../../mobile-api";

export type CourtInventory = Awaited<
  ReturnType<DunaApiClient["public"]["courtBookingInventory"]["query"]>
>;
export type CourtAvailability = Awaited<
  ReturnType<DunaApiClient["public"]["courtAvailability"]["query"]>
>;
export type CourtCheckoutQuote = Awaited<
  ReturnType<DunaApiClient["player"]["courtCheckoutQuote"]["query"]>
>;

export type BookingParticipant = {
  readonly personId?: string;
  readonly name?: string;
  readonly email?: string;
  readonly phoneE164?: string;
  /**
   * Held so a selected Duna player survives a round trip through the picker.
   * Re-deriving this from the cached public player list dropped anyone outside
   * that list, which made their Add control look inert.
   */
  readonly person?: PersonSummary;
};

export type CourtBookingRequest = {
  readonly venueId: string;
  readonly date: string;
  readonly durationMinutes: number;
  readonly intent?: "private" | "host";
};
