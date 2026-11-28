"use client";

import { Icon, type IconName } from "@duna/ui/icons";
import { Chip } from "@duna/ui/tideline";
import { report } from "@duna/observability";
import { useEffect, useState } from "react";
import { unwrap, type MoneyActionResult } from "../money/money-action-result";
import {
  clockRange,
  kindLabels,
  type ItemKind,
  type ScheduleItem,
} from "./schedule-model";

/** Each kind's icon: the second way (after shape and label) kinds differ. */
export const kindIcons: Readonly<Record<ItemKind, IconName>> = {
  booking: "court-taken",
  lesson: "lesson",
  session: "clinic",
  event: "league",
  block: "block",
};

export function KindIcon({
  kind,
  size = "chip",
}: {
  kind: ItemKind;
  size?: "chip" | "inline";
}) {
  return <Icon name={kindIcons[kind]} size={size} />;
}

/** "Group session" or "Weather hold": what an item is, in words. */
export function kindWords(item: ScheduleItem): string {
  if (item.kind === "block") {
    if (item.blockMode === "weather") return "Weather hold";
    if (item.blockMode === "maintenance") return "Maintenance";
    return "Blocked time";
  }
  if (item.source === "pickup") return "Player match";
  return kindLabels[item.kind];
}

/** The accessible name of an item on the calendar: what, when, where, who, state. */
export function itemLabel(item: ScheduleItem, live: boolean): string {
  return [
    `${kindWords(item)}: ${item.title}`,
    clockRange(item.startsAt, item.endsAt, item.timeZone),
    item.courtName,
    item.who,
    item.groupStatus,
    item.cancelled ? "Cancelled" : undefined,
    live ? "On now" : undefined,
  ]
    .filter(Boolean)
    .join(", ");
}

/** A group session's state chip, in the shared words. */
export function GroupChip({ item }: { item: ScheduleItem }) {
  if (!item.groupStatus) return null;
  return (
    <Chip tone={item.groupNeedsPeople ? "attention" : "neutral"}>
      {item.groupStatus}
    </Chip>
  );
}

/** Runs a server action and throws its failure for the kit to show. */
export async function act<T>(
  result: Promise<MoneyActionResult<T>>,
): Promise<T> {
  return unwrap(await result);
}

export const reportError = (error: unknown) =>
  void report(error, { event: "hq.schedule.action_error" });

/** Side panels open from the right on wide screens and rise from the bottom on a phone. */
export function useSheetSide(): "right" | "bottom" {
  const [side, setSide] = useState<"right" | "bottom">("right");
  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const sync = () => setSide(media.matches ? "bottom" : "right");
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  return side;
}
