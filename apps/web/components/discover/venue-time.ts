/** Tomorrow at 10:00 on the venue's clock (YYYY-MM-DDTHH:mm): a sensible first look. */
export function localVenueStart(timeZone: string, now = Date.now()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(now + 24 * 60 * 60_000));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T10:00`;
}

/** The start a returning visitor chose before signing in, if it is well formed. */
export function requestedVenueStart(query: {
  readonly start?: string;
  readonly date?: string;
}): string | undefined {
  if (query.start && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(query.start)) {
    return query.start;
  }
  if (query.date && /^\d{4}-\d{2}-\d{2}$/.test(query.date)) {
    return `${query.date}T10:00`;
  }
  return undefined;
}
