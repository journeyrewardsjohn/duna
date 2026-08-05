"use server";

import { revalidatePath } from "next/cache";
import { getServerCaller } from "@/lib/api";

function failure(error: unknown, fallback: string) {
  return {
    ok: false as const,
    error: error instanceof Error ? error.message : fallback,
  };
}

export async function placePredictionSellOrderAction(input: {
  readonly marketId: string;
  readonly side: "yes" | "no";
  readonly shares: number;
  readonly limitPriceBps: number;
  readonly idempotencyKey: string;
  readonly returnTo: string;
}) {
  try {
    const caller = await getServerCaller();
    const result = await caller.player.placePredictionSellOrder({
      marketId: input.marketId,
      side: input.side,
      shares: input.shares,
      limitPriceBps: input.limitPriceBps,
      idempotencyKey: input.idempotencyKey,
    });
    if (
      input.returnTo.startsWith("/events/") ||
      input.returnTo.startsWith("/app/matches/")
    ) {
      revalidatePath(input.returnTo);
    }
    revalidatePath("/app/wallet");
    return { ok: true as const, result };
  } catch (error) {
    return failure(error, "Your sell order could not be placed.");
  }
}

export async function placeProMatchPredictionOrderAction(input: {
  readonly eventSlug: string;
  readonly matchId: string;
  readonly side: "A" | "B";
  readonly credits: number;
  readonly limitPriceBps: number;
  readonly idempotencyKey: string;
}) {
  try {
    const caller = await getServerCaller();
    const result = await caller.player.placeProMatchPredictionOrder(input);
    revalidatePath(`/events/${input.eventSlug}`);
    revalidatePath("/app/wallet");
    return { ok: true as const, result };
  } catch (error) {
    return failure(error, "Your position could not be placed.");
  }
}

export async function placeProEventTeamPredictionOrderAction(input: {
  readonly eventSlug: string;
  readonly externalTeamId: string;
  readonly side: "yes" | "no";
  readonly credits: number;
  readonly limitPriceBps: number;
  readonly idempotencyKey: string;
}) {
  try {
    const caller = await getServerCaller();
    const result = await caller.player.placeProEventTeamPredictionOrder(input);
    revalidatePath(`/events/${input.eventSlug}`);
    revalidatePath("/app/wallet");
    return { ok: true as const, result };
  } catch (error) {
    return failure(error, "Your tournament position could not be placed.");
  }
}

export async function placeEventTeamPredictionOrderAction(input: {
  readonly eventSlug: string;
  readonly externalTeamId: string;
  readonly side: "yes" | "no";
  readonly credits: number;
  readonly limitPriceBps: number;
  readonly idempotencyKey: string;
}) {
  try {
    const caller = await getServerCaller();
    const result = await caller.player.placeEventTeamPredictionOrder(input);
    revalidatePath(`/events/${input.eventSlug}`);
    revalidatePath("/app/wallet");
    return { ok: true as const, result };
  } catch (error) {
    return failure(error, "Your tournament position could not be placed.");
  }
}

export async function placeMatchPredictionOrderAction(input: {
  readonly matchId: string;
  readonly side: "A" | "B";
  readonly credits: number;
  readonly limitPriceBps: number;
  readonly idempotencyKey: string;
}) {
  try {
    const caller = await getServerCaller();
    const result = await caller.player.placeMatchPredictionOrder(input);
    revalidatePath(`/app/matches/${input.matchId}`);
    revalidatePath("/app/wallet");
    return { ok: true as const, result };
  } catch (error) {
    return failure(error, "Your position could not be placed.");
  }
}
