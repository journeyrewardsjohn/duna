"use server";

import { getServerCaller } from "@/lib/api";

export interface CreatePickupActionInput {
  readonly title: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly venueName: string;
  readonly venueId?: string;
  readonly courtBookingId?: string;
  readonly address?: string;
  readonly googlePlaceId?: string;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly locationConfidence?: "confirmed" | "approximate";
  readonly capacity: number;
  readonly format: "2s" | "3s" | "4s" | "6s" | "king-queen";
  readonly matchType: "competitive" | "casual";
  readonly genderPreference: "open" | "mens" | "womens" | "mixed";
  readonly note?: string;
  readonly visibility: "public" | "unlisted";
  readonly approvalRequired: boolean;
  readonly smartRules: {
    readonly waitlistEnabled: boolean;
    readonly allowLateCancellation: boolean;
    readonly minimumNoticeMinutes: number;
    readonly autoCancelLowAttendance: boolean;
    readonly minimumAttendance: number;
  };
  readonly costMinor: number;
  readonly currency: "USD";
  readonly recordMatches: boolean;
  readonly ratingMinimum?: number;
  readonly ratingMaximum?: number;
  readonly participantPersonIds: string[];
  readonly idempotencyKey: string;
}

export async function createPickupAction(input: CreatePickupActionInput) {
  try {
    const caller = await getServerCaller();
    const event = await caller.player.createPickup(input);
    return { ok: true as const, event };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "The pickup could not be published.",
    };
  }
}

export async function searchPickupPlayersAction(query: string) {
  const normalized = query.trim();
  if (normalized.length < 2) return [];
  try {
    const caller = await getServerCaller();
    return await caller.public.searchPlayers({ query: normalized, limit: 20 });
  } catch {
    return [];
  }
}
