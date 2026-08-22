import type { EventDivisionSummary } from "./types";

function words(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  return value
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function eventDivisionTeamSize(division: EventDivisionSummary): number {
  if (division.teamSize) return division.teamSize;
  return {
    solo: 1,
    doubles: 2,
    "three-person": 3,
    "four-person": 4,
    "six-person": 6,
  }[division.teamFormat ?? "solo"];
}

export function eventDivisionEntryLabel(
  division: EventDivisionSummary,
): string {
  if (
    division.kobConfig?.entryMode === "individual" ||
    eventDivisionTeamSize(division) === 1
  ) {
    return "Individual signup";
  }
  const size = eventDivisionTeamSize(division);
  return `${size}-player team`;
}

export function eventDivisionCompetitionLabel(
  division: EventDivisionSummary,
): string {
  if (division.tournamentFormat === "kob-qob") {
    return "King / Queen of the Beach";
  }
  if (division.tournamentFormat === "double-elimination-true") {
    return "True double elimination";
  }
  if (division.tournamentFormat === "double-elimination-crossover") {
    return "Crossover double elimination";
  }
  if (division.tournamentFormat === "single-elimination") {
    return "Single elimination";
  }
  return words(division.teamFormat ?? division.discipline, "Configured play");
}

export function eventDivisionAgeLabel(division: EventDivisionSummary): string {
  if (division.ageMinimum === undefined && division.ageMaximum === undefined) {
    return "All ages";
  }
  if (division.ageMinimum === undefined) return `${division.ageMaximum}U`;
  if (division.ageMaximum === undefined) return `${division.ageMinimum}+`;
  return `${division.ageMinimum}–${division.ageMaximum}`;
}

export function eventDivisionRatingLabel(
  division: EventDivisionSummary,
): string {
  if (
    division.ratingMinimum !== undefined &&
    division.ratingMaximum !== undefined
  ) {
    return `${division.ratingMinimum.toFixed(2)}–${division.ratingMaximum.toFixed(2)} Sand Rating`;
  }
  if (division.ratingMinimum !== undefined) {
    return `${division.ratingMinimum.toFixed(2)}+ Sand Rating`;
  }
  if (division.ratingMaximum !== undefined) {
    return `Up to ${division.ratingMaximum.toFixed(2)} Sand Rating`;
  }
  return "Open Sand Rating";
}

export function eventDivisionFieldLabel(
  division: EventDivisionSummary,
): string {
  const gender = {
    mens: "Men",
    womens: "Women",
    coed: "Coed",
    open: "Open",
  }[division.gender ?? "open"];
  const surface = {
    sand: "Sand",
    grass: "Grass",
    water: "Water",
    "indoor-sand": "Indoor sand",
  }[division.surface ?? "sand"];
  return `${gender} · ${surface}`;
}

export function eventDivisionSeedingLabel(
  division: EventDivisionSummary,
): string {
  const seeding = {
    "first-come": "First come",
    "sand-rating-score": "Sand Rating",
    "sand-rating-best-8": "Best 8 Sand Rating results",
    "sand-rating-ttm": "Trailing Sand Rating",
    manual: "Organizer seeded",
  }[division.seeding ?? "manual"];
  return division.seeding
    ? seeding
    : words(division.ratingBasis, "Organizer seeded");
}

export function eventDivisionFilledCount(
  division: EventDivisionSummary,
): number {
  return Math.max(0, division.capacity - division.spotsRemaining);
}

export function eventDivisionFilledPercent(
  division: EventDivisionSummary,
): number {
  if (division.capacity <= 0) return 0;
  return Math.min(
    100,
    Math.max(0, (eventDivisionFilledCount(division) / division.capacity) * 100),
  );
}
