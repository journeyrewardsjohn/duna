import { type OperatorMatches } from "../../runtime";
import { demoPeople } from "@duna/core/demo";

export function previewOperatorMatches(): OperatorMatches {
  const base = new Date();
  base.setMinutes(0, 0, 0);
  const person = (index: number) => {
    const source = demoPeople[index % demoPeople.length]!;
    return {
      id: source.id,
      displayName: source.displayName,
      initials: source.initials,
      ratingDisplay: source.rating.display,
    };
  };
  return [
    {
      id: "20000000-0000-4000-8000-000000000001",
      status: "live",
      scheduledAt: base.toISOString(),
      venueId: "30000000-0000-4000-8000-000000000001",
      venueName: "Manhattan Beach Club",
      courtId: "40000000-0000-4000-8000-000000000001",
      courtName: "Stadium Court",
      sessionId: "50000000-0000-4000-8000-000000000001",
      sessionTitle: "South Bay Open Match",
      divisionName: "Open Doubles",
      authoritativeDeviceId: "duna-pro-preview",
      teamA: {
        id: "60000000-0000-4000-8000-000000000001",
        name: "Maya / Zoe",
        people: [person(0), person(1)],
      },
      teamB: {
        id: "60000000-0000-4000-8000-000000000002",
        name: "Ari / Liv",
        people: [person(2), person(3)],
      },
    },
    {
      id: "20000000-0000-4000-8000-000000000002",
      status: "scheduled",
      scheduledAt: new Date(base.getTime() + 2 * 60 * 60_000).toISOString(),
      venueId: "30000000-0000-4000-8000-000000000001",
      venueName: "Manhattan Beach Club",
      courtId: "40000000-0000-4000-8000-000000000002",
      courtName: "Court 2",
      sessionId: "50000000-0000-4000-8000-000000000002",
      sessionTitle: "Members Match Window",
      divisionName: "Competitive Doubles",
      teamA: {
        id: "60000000-0000-4000-8000-000000000003",
        name: "Nina / Jo",
        people: [person(4), person(5)],
      },
      teamB: {
        id: "60000000-0000-4000-8000-000000000004",
        name: "Cam / Riley",
        people: [person(6), person(7)],
      },
    },
  ] as OperatorMatches;
}
