/**
 * Demo fixtures: a club tournament's published draw (owner: SITE-5). What
 * `public.tournamentCompetition` returns in demo mode for the demo
 * tournament, so the event page's results and its "Bracket and results"
 * link, and the legacy tournament desk, can be walked without a database.
 * Team names are the public names the entry list shows (a team with a
 * player who has no public profile is its seed). Illustrative only.
 */
import { demoId } from "./ids";

const OPEN = "20000000-0000-4000-8000-000000000001";
const team = (n: number, name: string, seed: number) => ({
  id: demoId("tournament", n),
  name,
  seed,
});
const one = team(1, "Theo Park / Noa Williams", 1);
const two = team(2, "Seed 2", 2);

const semifinal = {
  id: demoId("tournament", 11),
  logicalId: "W1-1",
  bracket: "winners" as const,
  round: 1,
  position: 1,
  label: "Final",
  status: "complete",
  teamA: one,
  teamB: two,
  winnerTeamId: one.id,
  courtName: "Stadium",
  scheduledAt: "2026-07-31T02:00:00.000Z",
  startedAt: "2026-07-31T02:05:00.000Z",
  completedAt: "2026-07-31T02:50:00.000Z",
  score: {
    status: "complete" as const,
    sets: [
      [21, 17],
      [21, 19],
    ] as [number, number][],
  },
};

/** The published draw for a demo tournament slug, or undefined. */
export function demoTournamentCompetition(slug: string) {
  if (slug !== "sunset-open-qualifier") return undefined;
  return {
    session: {
      id: "10000000-0000-4000-8000-000000000201",
      title: "Sunset Open — Qualifier",
      status: "completed",
      timezone: "America/Los_Angeles",
      updatedAt: "2026-07-31T03:00:00.000Z",
    },
    divisions: [
      {
        id: OPEN,
        name: "Open",
        competitionVersion: 1,
        format: "single-elimination",
        pools: [],
        rounds: [
          {
            key: "winners-1",
            label: "Final",
            bracket: "winners" as const,
            round: 1,
            matches: [semifinal],
          },
        ],
        matches: [semifinal],
      },
    ],
  };
}
