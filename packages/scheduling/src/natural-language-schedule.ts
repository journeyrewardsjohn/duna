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

export type RecurringScheduleExistingBlock = {
  readonly weekday: number;
  readonly startsAtMinute: number;
  readonly endsAtMinute: number;
  readonly scheduleId?: string;
  readonly scheduleName?: string;
};

export type RecurringScheduleConflict = {
  readonly proposed: RecurringScheduleDraftBlock;
  readonly existing: RecurringScheduleExistingBlock;
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

function weekdayFromToken(token: string): number | undefined {
  const normalized = token.toLowerCase();
  return days.find((candidate) =>
    candidate.aliases.some((alias) => normalized.startsWith(alias)),
  )?.weekday;
}

function selectedWeekdays(prompt: string): readonly (typeof days)[number][] {
  const selected = new Set<number>();
  if (/\b(?:weekdays?|business days?)\b/i.test(prompt)) {
    [1, 2, 3, 4, 5].forEach((weekday) => selected.add(weekday));
  }
  if (/\bweekends?\b/i.test(prompt)) {
    [0, 6].forEach((weekday) => selected.add(weekday));
  }
  if (/\b(?:every day|daily|all week)\b/i.test(prompt)) {
    days.forEach(({ weekday }) => selected.add(weekday));
  }

  const dayToken =
    "(?:sun(?:day|days)?|mon(?:day|days)?|tue(?:s|sday|sdays)?|wed(?:s|nesday|nesdays)?|thu(?:r|rs|rsday|rsdays)?|fri(?:day|days)?|sat(?:urday|urdays)?)";
  const ranges = new RegExp(
    `\\b(${dayToken})\\b\\s*(?:-|–|—|to|through|thru)\\s*\\b(${dayToken})\\b`,
    "gi",
  );
  for (const match of prompt.matchAll(ranges)) {
    const start = weekdayFromToken(match[1] ?? "");
    const end = weekdayFromToken(match[2] ?? "");
    if (start === undefined || end === undefined) continue;
    for (let offset = 0; offset < 7; offset += 1) {
      const weekday = (start + offset) % 7;
      selected.add(weekday);
      if (weekday === end) break;
    }
  }

  for (const candidate of days) {
    if (
      candidate.aliases.some((alias) =>
        new RegExp(`\\b${alias}\\b`, "i").test(prompt),
      )
    ) {
      selected.add(candidate.weekday);
    }
  }
  return days.filter(({ weekday }) => selected.has(weekday));
}

function timeRanges(prompt: string): readonly {
  startsAtMinute: number;
  endsAtMinute: number;
}[] {
  const pattern =
    /(noon|midnight|\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)\s*(?:-|–|—|to|until|through|thru)\s*(noon|midnight|\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)/gi;
  const ranges = [...prompt.matchAll(pattern)].flatMap((match) => {
    const endMeridiem = match[2]
      ?.toLowerCase()
      .replaceAll(".", "")
      .match(/(am|pm)$/)?.[1] as "am" | "pm" | undefined;
    const startMeridiem = match[1]
      ?.toLowerCase()
      .replaceAll(".", "")
      .match(/(am|pm)$/)?.[1] as "am" | "pm" | undefined;
    const startsAtMinute = match[1]
      ? parseClock(match[1], endMeridiem)
      : undefined;
    const endsAtMinute = match[2]
      ? parseClock(match[2], startMeridiem)
      : undefined;
    return startsAtMinute === undefined || endsAtMinute === undefined
      ? []
      : [{ startsAtMinute, endsAtMinute }];
  });
  return ranges.filter(
    (range, index) =>
      ranges.findIndex(
        (candidate) =>
          candidate.startsAtMinute === range.startsAtMinute &&
          candidate.endsAtMinute === range.endsAtMinute,
      ) === index,
  );
}

export function findRecurringScheduleConflicts(input: {
  readonly proposed: readonly RecurringScheduleDraftBlock[];
  readonly existing: readonly RecurringScheduleExistingBlock[];
}): readonly RecurringScheduleConflict[] {
  return input.proposed.flatMap((proposed) =>
    input.existing.flatMap((existing) =>
      proposed.weekday === existing.weekday &&
      proposed.startsAtMinute < existing.endsAtMinute &&
      proposed.endsAtMinute > existing.startsAtMinute
        ? [{ proposed, existing }]
        : [],
    ),
  );
}

export function parseNaturalLanguageSchedule(
  prompt: string,
): NaturalLanguageScheduleDraft {
  const normalized = prompt.trim().replaceAll(/\s+/g, " ");
  const selectedDays = selectedWeekdays(normalized);
  const ranges = timeRanges(normalized);
  const warnings: string[] = [];
  if (selectedDays.length === 0) {
    warnings.push("Add at least one weekday, such as Monday or Wed.");
  }
  if (ranges.length === 0) {
    warnings.push("Add a clear time range, such as noon–3 PM.");
  } else if (
    ranges.some((range) => range.endsAtMinute <= range.startsAtMinute)
  ) {
    warnings.push("The ending time must be later than the starting time.");
  }
  const usableRanges = ranges.filter(
    (range) => range.endsAtMinute > range.startsAtMinute,
  );
  const sortedRanges = [...usableRanges].sort(
    (left, right) => left.startsAtMinute - right.startsAtMinute,
  );
  if (
    sortedRanges.some(
      (range, index) =>
        index > 0 &&
        range.startsAtMinute < sortedRanges[index - 1]!.endsAtMinute,
    )
  ) {
    warnings.push(
      "Two proposed time windows overlap. Combine or separate them.",
    );
  }
  const blocks = selectedDays.flatMap((candidate) =>
    sortedRanges.map((range) => ({
      weekday: candidate.weekday,
      day: candidate.day,
      ...range,
    })),
  );
  const reasonMatch = /\b(?:for|because of|due to)\s+(.+?)(?:[.!?]|$)/i.exec(
    normalized,
  );
  const reason = reasonMatch?.[1]?.trim() || normalized || "Schedule block";
  const summary =
    blocks.length > 0
      ? `${selectedDays.map(({ day }) => day).join(", ")} · ${sortedRanges
          .map(
            (range) =>
              `${clockLabel(range.startsAtMinute)}–${clockLabel(range.endsAtMinute)}`,
          )
          .join(" and ")}`
      : "Duna needs one more detail before it can build this schedule.";
  return {
    status: warnings.length === 0 ? "ready" : "needs-clarification",
    summary,
    reason,
    blocks,
    warnings,
  };
}
