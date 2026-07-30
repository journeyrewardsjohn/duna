"use server";

import { getServerCaller } from "@/lib/api";

export interface CreatePickupActionInput {
  readonly title: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly venueName: string;
  readonly capacity: number;
  readonly format: "2s" | "4s" | "6s" | "king-queen";
  readonly note?: string;
  readonly visibility: "public" | "unlisted";
  readonly costMinor: number;
  readonly currency: "USD";
  readonly recordMatches: boolean;
  readonly ratingMinimum?: number;
  readonly ratingMaximum?: number;
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
