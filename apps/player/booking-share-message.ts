export type ShareableBookingDetails = {
  readonly title: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly timezone?: string;
  readonly organizationName?: string;
  readonly locationName?: string;
  readonly address?: string;
  readonly courtName?: string;
  readonly playerNames?: readonly string[];
  readonly detailsUrl?: string;
};

export function bookingDateTime(details: ShareableBookingDetails) {
  const startsAt = new Date(details.startsAt);
  const endsAt = new Date(details.endsAt);
  const timeZone = details.timezone;
  const date = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    ...(timeZone ? { timeZone } : {}),
  }).format(startsAt);
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  });
  return { date, time: `${time.format(startsAt)}–${time.format(endsAt)}` };
}

export function buildBookingShareMessage(
  details: ShareableBookingDetails,
): string {
  const when = bookingDateTime(details);
  const place = [details.locationName, details.courtName]
    .filter(Boolean)
    .join(" · ");
  return [
    details.title,
    `${when.date} · ${when.time}`,
    place,
    details.address,
    details.playerNames?.length
      ? `Players: ${details.playerNames.join(", ")}`
      : undefined,
    details.organizationName
      ? `Hosted by ${details.organizationName}`
      : undefined,
    details.detailsUrl ? `Details: ${details.detailsUrl}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}
