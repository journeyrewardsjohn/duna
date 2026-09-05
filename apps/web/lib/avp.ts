import type { PublicProCoverage } from "@duna/api";

export type AvpEvent = PublicProCoverage["events"][number];
export type AvpMatch = PublicProCoverage["matches"][number];

export interface OfficialAvpCoverage {
  readonly events: readonly AvpEvent[];
  readonly matches: readonly AvpMatch[];
}

function officialAvpEventId(value: string): boolean {
  return value.startsWith("avp:") || value.startsWith("avp-tournament:");
}

export function selectOfficialAvpCoverage(
  coverage: PublicProCoverage | undefined,
): OfficialAvpCoverage {
  const events = (coverage?.events ?? []).filter(
    (event) =>
      event.source === "avp" && officialAvpEventId(event.externalEventId),
  );
  const eventIds = new Set(events.map((event) => event.externalEventId));
  return {
    events,
    matches: (coverage?.matches ?? []).filter(
      (match) =>
        match.source === "avp" &&
        match.externalEventId !== null &&
        eventIds.has(match.externalEventId),
    ),
  };
}

export function isAvpChampionship(event: AvpEvent): boolean {
  return (
    event.externalEventId.includes(":championship-") ||
    /championship/i.test(event.category ?? "") ||
    /championship/i.test(event.name)
  );
}

export type AvpBracketRound = "Quarterfinals" | "Semifinals" | "Final";

export function avpBracketRound(
  match: Pick<AvpMatch, "roundLabel">,
): AvpBracketRound | undefined {
  const label = match.roundLabel?.toLowerCase() ?? "";
  if (label.includes("quarter") || label.includes("quater")) {
    return "Quarterfinals";
  }
  if (label.includes("semifinal")) return "Semifinals";
  if (label.includes("final")) return "Final";
  return undefined;
}
