import { LiveScoreboard } from "@/components/live-scoreboard";
import { getServerCaller } from "@/lib/api";

export const metadata = { title: "Live score" };

export default async function ScorePage({
  searchParams,
}: {
  readonly searchParams: Promise<{ match?: string }>;
}) {
  const query = await searchParams;
  const caller = await getServerCaller();
  const [dashboard, publicPlayers, venues, initialMatch] = await Promise.all([
    caller.player.dashboard(),
    caller.public.players({ limit: 50 }),
    caller.public.venues(),
    query.match
      ? caller.player
          .matchScoringState({ matchId: query.match })
          .catch(() => undefined)
      : Promise.resolve(undefined),
  ]);
  const players = [
    dashboard.player,
    ...publicPlayers.filter((player) => player.id !== dashboard.player.id),
  ];
  return (
    <LiveScoreboard
      currentPlayer={dashboard.player}
      initialMatch={initialMatch}
      players={players}
      venues={venues}
    />
  );
}
