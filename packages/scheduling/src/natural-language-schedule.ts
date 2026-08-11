export type RecurringScheduleDraftBlock = {
  readonly weekday: number;
  readonly day: string;
  readonly startsAtMinute: number;
  readonly endsAtMinute: number;
};

export type NaturalLanguageScheduleDraft = {
  readonly status: "ready" | "needs-clarification";
  readonly summary: string;
  readonly reason: string;
  readonly blocks: readonly RecurringScheduleDraftBlock[];
  readonly warnings: readonly string[];
};

const days = [
  { day: "Sunday", weekday: 0, aliases: ["sun", "sunday"] },
  { day: "Monday", weekday: 1, aliases: ["mon", "monday", "mondays"] },
  {
    day: "Tuesday",
    weekday: 2,
    aliases: ["tue", "tues", "tuesday", "tuesdays"],
  },
  {
    day: "Wednesday",
    weekday: 3,
    aliases: ["wed", "weds", "wednesday", "wednesdays"],
  },
  {
    day: "Thursday",
    weekday: 4,
    aliases: ["thu", "thur", "thurs", "thursday", "thursdays"],
  },
  { day: "Friday", weekday: 5, aliases: ["fri", "friday", "fridays"] },
  {
    day: "Saturday",
    weekday: 6,
    aliases: ["sat", "saturday", "saturdays"],
  },
] as const;

function parseClock(
  value: string,
  fallbackMeridiem?: "am" | "pm",
): number | undefined {
  const normalized = value.trim().toLowerCase().replaceAll(".", "");
  if (normalized === "noon") return 12 * 60;
  if (normalized === "midnight") return 0;
  const match = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/.exec(normalized);
  if (!match) return undefined;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const meridiem = (match[3] as "am" | "pm" | undefined) ?? fallbackMeridiem;
  if (hour > 23 || minute > 59 || (meridiem && hour > 12)) return undefined;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (meridiem === "pm" && hour < 12) hour += 12;
  return hour * 60 + minute;
}

function clockLabel(minutes: number): string {
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const meridiem = hour24 >= 12 ? "PM" : "AM";
  const hour = hour24 % 12 || 12;
  return `${hour}:${String(minute).padStart(2, "0")} ${meridiem}`;
}

export function parseNaturalLanguageSchedule(
  prompt: string,
): NaturalLanguageScheduleDraft {
  const normalized = prompt.trim().replaceAll(/\s+/g, " ");
  const lower = normalized.toLowerCase();
  const selectedDays = days.filter((candidate) =>
    candidate.aliases.some((alias) =>
      new RegExp(`\\b${alias}\\b`, "i").test(lower),
    ),
  );
  const timeMatch =
    /(noon|midnight|\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)\s*(?:-|–|—|to|until|through)\s*(noon|midnight|\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)/i.exec(
      normalized,
    );
  const endMeridiem = timeMatch?.[2]
    ?.toLowerCase()
    .replaceAll(".", "")
    .match(/(am|pm)$/)?.[1] as "am" | "pm" | undefined;
  const startMeridiem = timeMatch?.[1]
    ?.toLowerCase()
    .replaceAll(".", "")
    .match(/(am|pm)$/)?.[1] as "am" | "pm" | undefined;
  const startsAtMinute = timeMatch?.[1]
    ? parseClock(timeMatch[1], endMeridiem)
    : undefined;
  const endsAtMinute = timeMatch?.[2]
    ? parseClock(timeMatch[2], startMeridiem)
    : undefined;
  const warnings: string[] = [];
  if (selectedDays.length === 0) {
    warnings.push("Add at least one weekday, such as Monday or Wed.");
  }
  if (startsAtMinute === undefined || endsAtMinute === undefined) {
    warnings.push("Add a clear time range, such as noon–3 PM.");
  } else if (endsAtMinute <= startsAtMinute) {
    warnings.push("The ending time must be later than the starting time.");
  }
  const usableTimes =
    startsAtMinute !== undefined &&
    endsAtMinute !== undefined &&
    endsAtMinute > startsAtMinute;
  const blocks = usableTimes
    ? selectedDays.map((candidate) => ({
        weekday: candidate.weekday,
        day: candidate.day,
        startsAtMinute,
        endsAtMinute,
      }))
    : [];
  const reasonMatch = /\b(?:for|because of|due to)\s+(.+?)(?:[.!?]|$)/i.exec(
    normalized,
  );
  const reason = reasonMatch?.[1]?.trim() || normalized || "Schedule block";
  const summary =
    blocks.length > 0
      ? `${blocks.map((block) => block.day).join(", ")} · ${clockLabel(blocks[0]!.startsAtMinute)}–${clockLabel(blocks[0]!.endsAtMinute)}`
      : "Duna needs one more detail before it can build this schedule.";
  return {
    status: warnings.length === 0 ? "ready" : "needs-clarification",
    summary,
    reason,
    blocks,
    warnings,
  };
}
