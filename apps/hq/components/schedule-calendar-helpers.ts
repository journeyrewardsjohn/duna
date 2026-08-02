interface AvailabilityBlock {
  readonly weekday: number;
  readonly startsAtMinute: number;
  readonly endsAtMinute: number;
  readonly mode: string;
  readonly effectiveFrom?: string;
  readonly effectiveTo?: string;
}

function dateKey(value: Date): string {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatMinute(minute: number): string {
  const hour = Math.floor(minute / 60);
  const minutes = minute % 60;
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: minutes === 0 ? undefined : "2-digit",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2020, 0, 1, hour, minutes)));
}

export function courtAvailabilityLabel(
  schedule: readonly AvailabilityBlock[],
  day: Date,
): string {
  const key = dateKey(day);
  const blocks = schedule
    .filter((block) => {
      if (block.weekday !== day.getDay()) return false;
      if (block.effectiveFrom && key < block.effectiveFrom) return false;
      if (block.effectiveTo && key > block.effectiveTo) return false;
      return block.mode !== "blocked" && block.mode !== "maintenance";
    })
    .sort((left, right) => left.startsAtMinute - right.startsAtMinute);
  if (blocks.length === 0) return "Closed";
  const first = blocks[0]!;
  const last = blocks.at(-1)!;
  return `${formatMinute(first.startsAtMinute)}–${formatMinute(last.endsAtMinute)}`;
}
