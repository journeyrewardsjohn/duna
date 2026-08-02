import { LiveScoreboard } from "@/components/live-scoreboard";
import { getServerCaller } from "@/lib/api";

export const metadata = { title: "Live score" };

type InitialWatchScore = {
  readonly a: number;
  readonly b: number;
};

function parseWatchScores(
  raw: string | undefined,
): readonly InitialWatchScore[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as {
      readonly source?: string;
      readonly sets?: readonly {
        readonly a?: unknown;
        readonly b?: unknown;
      }[];
    };
    if (value.source !== "apple-watch" || !Array.isArray(value.sets)) return [];
    return value.sets
      .slice(0, 3)
      .filter(
        (set): set is { readonly a: number; readonly b: number } =>
          Number.isInteger(set.a) &&
          Number.isInteger(set.b) &&
          Number(set.a) >= 0 &&
          Number(set.b) >= 0 &&
          Number(set.a) <= 99 &&
          Number(set.b) <= 99,
      )
      .map((set) => ({ a: set.a, b: set.b }));
  } catch {
    return [];
  }
}

export default async function ScorePage({
  searchParams,
}: {
  readonly searchParams: Promise<{ match?: string; watch?: string }>;
}) {
  const query = await searchParams;
  const initialWatchScores = parseWatchScores(query.watch);
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
      initialWatchScores={initialWatchScores}
    />
  );
}
