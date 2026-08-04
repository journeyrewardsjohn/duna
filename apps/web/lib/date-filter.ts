const ISO_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function parseIsoDay(value?: string): string | undefined {
  if (!value || !ISO_DAY_PATTERN.test(value)) return undefined;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
    ? undefined
    : value;
}

export function isoDay(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function datePillDays(
  anchor: string,
  daysBefore = 3,
  daysAfter = 3,
): readonly string[] {
  const parsed = parseIsoDay(anchor);
  if (!parsed) return [];
  const base = new Date(`${parsed}T12:00:00Z`);
  return Array.from({ length: daysBefore + daysAfter + 1 }, (_, index) => {
    const day = new Date(base);
    day.setUTCDate(day.getUTCDate() + index - daysBefore);
    return isoDay(day);
  });
}

export function instantIsoDay(
  value: string,
  timeZone = "UTC",
): string | undefined {
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return undefined;
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone,
  }).formatToParts(instant);
  const part = (type: "year" | "month" | "day") =>
    parts.find((candidate) => candidate.type === type)?.value;
  const year = part("year");
  const month = part("month");
  const day = part("day");
  return year && month && day ? `${year}-${month}-${day}` : undefined;
}
