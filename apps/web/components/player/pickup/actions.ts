"use server";

/**
 * Hosting a pickup: publish (`createPickup`) and change it (`updatePickup`),
 * with the person's own idempotency key, plus the Duna player search for
 * inviting people. Publishing is pressed by the host after the review step;
 * the invitations it sends are the ones listed there.
 */
import { log } from "@duna/observability";
import { revalidatePath } from "next/cache";
import { getServerCaller } from "@/lib/api";
import type { ActionResult } from "../action-result";
import type { CreatePickupInput, UpdatePickupInput } from "../api-types";
import { runAction } from "../server-action";

export async function publishPickupAction(
  input: CreatePickupInput,
): Promise<ActionResult<{ readonly slug: string; readonly title: string }>> {
  return runAction("web.pickup.publish_failed", async () => {
    const caller = await getServerCaller();
    const event = await caller.player.createPickup(input);
    log.info("web.pickup.published", { capacity: input.capacity });
    revalidatePath("/app/play");
    revalidatePath("/app");
    return { slug: event.slug, title: event.title };
  });
}

export async function updatePickupAction(
  input: UpdatePickupInput,
): Promise<ActionResult<{ readonly status: "active" }>> {
  return runAction("web.pickup.update_failed", async () => {
    const caller = await getServerCaller();
    const result = await caller.player.updatePickup(input);
    revalidatePath("/app/play");
    return { status: result.status };
  });
}

export async function searchPickupPlayersAction(query: string): Promise<
  readonly {
    readonly id: string;
    readonly name: string;
    readonly level?: string;
    readonly detail?: string;
  }[]
> {
  const text = query.trim();
  if (text.length < 2) return [];
  try {
    const caller = await getServerCaller();
    const found = await caller.public.searchPlayers({ query: text, limit: 20 });
    return found.map((person) => ({
      id: person.id,
      name: person.displayName,
      ...(person.sandRating !== null && person.confidence !== "Provisional"
        ? { level: person.sandRating.toFixed(1) }
        : {}),
      ...(person.homeMarket ? { detail: person.homeMarket } : {}),
    }));
  } catch {
    return [];
  }
}
