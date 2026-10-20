import { z } from "zod";
import { stableHash } from "./canonical";

export const courtScheduleWindowSchema = z
  .object({
    weekday: z
      .number()
      .int()
      .min(0)
      .max(6)
      .describe("Sunday = 0, Monday = 1, Saturday = 6."),
    startsAtMinute: z.number().int().min(0).max(1439),
    endsAtMinute: z.number().int().min(1).max(1440),
    mode: z.enum([
      "open",
      "rentals-only",
      "members-only",
      "private-lessons-only",
      "group-only",
      "league-reserved",
      "maintenance",
      "blocked",
    ]),
    effectiveFrom: z.iso.date().optional(),
    effectiveTo: z.iso.date().optional(),
  })
  .refine((block) => block.endsAtMinute > block.startsAtMinute, {
    message:
      "The end time must be after the start time. Split overnight hours across two days.",
  })
  .refine(
    (block) =>
      !block.effectiveFrom ||
      !block.effectiveTo ||
      block.effectiveFrom <= block.effectiveTo,
    {
      message: "The end date must be on or after the start date.",
    },
  );

export type CourtScheduleWindow = z.infer<typeof courtScheduleWindowSchema>;
export const courtScheduleChangesSchema = z
  .array(courtScheduleWindowSchema)
  .min(1)
  .max(64)
  .refine(
    (changes) =>
      !changes.some((change, index) =>
        changes.slice(0, index).some((other) => overlaps(change, other)),
      ),
    {
      message:
        "Requested court windows overlap. Separate them before applying.",
    },
  )
  .describe(
    "Only the requested windows in the venue's local timezone. Each replaces overlapping hours; all other hours are preserved. Use blocked to reserve time from bookings, including 'block for morning sessions'. This does not create sessions.",
  );

function dateBefore(date: string) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

function dateAfter(date: string) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

function overlaps(left: CourtScheduleWindow, right: CourtScheduleWindow) {
  return (
    left.weekday === right.weekday &&
    left.startsAtMinute < right.endsAtMinute &&
    right.startsAtMinute < left.endsAtMinute &&
    (left.effectiveFrom ?? "") <= (right.effectiveTo ?? "9999-12-31") &&
    (right.effectiveFrom ?? "") <= (left.effectiveTo ?? "9999-12-31")
  );
}

/** Subtract a date/time rectangle; retain every unaffected part of a window. */
function subtract(
  block: CourtScheduleWindow,
  change: CourtScheduleWindow,
): CourtScheduleWindow[] {
  if (!overlaps(block, change)) return [block];
  const retained: CourtScheduleWindow[] = [];
  const middle = { ...block };
  if (
    change.effectiveFrom &&
    (!block.effectiveFrom || block.effectiveFrom < change.effectiveFrom)
  ) {
    retained.push({ ...block, effectiveTo: dateBefore(change.effectiveFrom) });
    middle.effectiveFrom = change.effectiveFrom;
  }
  if (
    change.effectiveTo &&
    (!block.effectiveTo || block.effectiveTo > change.effectiveTo)
  ) {
    retained.push({ ...block, effectiveFrom: dateAfter(change.effectiveTo) });
    middle.effectiveTo = change.effectiveTo;
  }
  if (block.startsAtMinute < change.startsAtMinute) {
    retained.push({ ...middle, endsAtMinute: change.startsAtMinute });
  }
  if (block.endsAtMinute > change.endsAtMinute) {
    retained.push({ ...middle, startsAtMinute: change.endsAtMinute });
  }
  return retained;
}

export function applyCourtScheduleChanges(
  current: readonly CourtScheduleWindow[],
  input: readonly CourtScheduleWindow[],
): CourtScheduleWindow[] {
  const changes = courtScheduleChangesSchema.parse(input);
  const result = changes
    .reduce<CourtScheduleWindow[]>(
      (blocks, change) => [
        ...blocks.flatMap((block) => subtract(block, change)),
        change,
      ],
      current.map((block) => courtScheduleWindowSchema.parse(block)),
    )
    .sort(
      (a, b) =>
        a.weekday - b.weekday ||
        a.startsAtMinute - b.startsAtMinute ||
        (a.effectiveFrom ?? "").localeCompare(b.effectiveFrom ?? ""),
    );
  if (result.length > 256)
    throw new Error(
      "This change creates too many weekly windows. Simplify the court schedule first.",
    );
  return result;
}

export function courtScheduleVersion(
  timezone: string,
  scheduleIds: readonly string[],
  blocks: readonly CourtScheduleWindow[],
) {
  return stableHash({
    timezone,
    scheduleIds: [...scheduleIds].sort(),
    blocks: blocks
      .map((block) => courtScheduleWindowSchema.parse(block))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  });
}
