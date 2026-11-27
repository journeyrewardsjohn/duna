import type { ProTourSection } from "../../../pro-tour";

export const proTourSectionLabels: Record<ProTourSection, string> = {
  overview: "Overview",
  live: "Live",
  schedule: "Schedule",
  draw: "Draw",
  teams: "Teams",
  watch: "Watch",
};

function formatProEventDay(value?: string | null): string {
  if (!value) return "Date pending";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

export function formatProEventDates(
  start?: string | null,
  end?: string | null,
) {
  if (!start && !end) return "Dates to be announced";
  if (!start || !end || start === end) return formatProEventDay(start ?? end);
  return `${formatProEventDay(start)} – ${formatProEventDay(end)}`;
}

export function countryFlag(code?: string | null): string {
  const normalized = code?.trim().toUpperCase();
  if (!normalized || normalized.length !== 2) return "";
  return String.fromCodePoint(
    ...[...normalized].map((letter) => 127397 + letter.charCodeAt(0)),
  );
}
