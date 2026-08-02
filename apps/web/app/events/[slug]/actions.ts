"use server";

import { revalidatePath } from "next/cache";
import { getServerCaller } from "@/lib/api";

function failure(error: unknown, fallback: string) {
  return {
    ok: false as const,
    error: error instanceof Error ? error.message : fallback,
  };
}

export async function requestPickupJoinAction(input: {
  readonly pickupSessionId: string;
  readonly slug: string;
  readonly note?: string;
  readonly idempotencyKey: string;
}) {
  try {
    const caller = await getServerCaller();
    const result = await caller.player.requestPickupJoin({
      pickupSessionId: input.pickupSessionId,
      note: input.note,
      idempotencyKey: input.idempotencyKey,
    });
    revalidatePath(`/events/${input.slug}`);
    return { ok: true as const, result };
  } catch (error) {
    return failure(error, "Your request could not be sent.");
  }
}

export async function reviewPickupJoinRequestAction(input: {
  readonly requestId: string;
  readonly decision: "approved" | "rejected";
  readonly slug: string;
  readonly idempotencyKey: string;
}) {
  try {
    const caller = await getServerCaller();
    const result = await caller.player.reviewPickupJoinRequest({
      requestId: input.requestId,
      decision: input.decision,
      idempotencyKey: input.idempotencyKey,
    });
    revalidatePath(`/events/${input.slug}`);
    return { ok: true as const, result };
  } catch (error) {
    return failure(error, "The request could not be reviewed.");
  }
}

export async function cancelPickupAction(input: {
  readonly pickupSessionId: string;
  readonly slug: string;
  readonly idempotencyKey: string;
}) {
  try {
    const caller = await getServerCaller();
    const result = await caller.player.cancelPickup({
      pickupSessionId: input.pickupSessionId,
      idempotencyKey: input.idempotencyKey,
    });
    revalidatePath(`/events/${input.slug}`);
    revalidatePath("/app/play");
    return { ok: true as const, result };
  } catch (error) {
    return failure(error, "The pickup could not be cancelled.");
  }
}

export async function updatePickupAction(input: {
  readonly pickupSessionId: string;
  readonly slug: string;
  readonly title: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly venueName: string;
  readonly address?: string;
  readonly googlePlaceId?: string;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly locationConfidence?: "confirmed" | "approximate";
  readonly capacity: number;
  readonly note?: string;
  readonly approvalRequired: boolean;
  readonly visibility: "public" | "unlisted";
  readonly idempotencyKey: string;
}) {
  try {
    const caller = await getServerCaller();
    const result = await caller.player.updatePickup({
      pickupSessionId: input.pickupSessionId,
      title: input.title,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      venueName: input.venueName,
      address: input.address,
      googlePlaceId: input.googlePlaceId,
      latitude: input.latitude,
      longitude: input.longitude,
      locationConfidence: input.locationConfidence,
      capacity: input.capacity,
      note: input.note,
      approvalRequired: input.approvalRequired,
      visibility: input.visibility,
      idempotencyKey: input.idempotencyKey,
    });
    revalidatePath(`/events/${input.slug}`);
    revalidatePath(`/app/pickup/${input.slug}/edit`);
    revalidatePath("/app/play");
    return { ok: true as const, result };
  } catch (error) {
    return failure(error, "The pickup could not be updated.");
  }
}

export async function leavePickupAction(input: {
  readonly pickupSessionId: string;
  readonly slug: string;
  readonly idempotencyKey: string;
}) {
  try {
    const caller = await getServerCaller();
    const result = await caller.player.leavePickup({
      pickupSessionId: input.pickupSessionId,
      idempotencyKey: input.idempotencyKey,
    });
    revalidatePath(`/events/${input.slug}`);
    revalidatePath("/app/play");
    return { ok: true as const, result };
  } catch (error) {
    return failure(error, "Your spot could not be removed.");
  }
}
