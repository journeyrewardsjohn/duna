import "@/components/player/player.css";

import { Button } from "@duna/ui/tideline";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { historyModel } from "@/components/player/matches/history-model";
import { loadMatches } from "@/components/player/matches/matches-data";
import { MatchesView } from "@/components/player/matches/matches-view";
import { ReadFailed } from "@/components/player/states";

export const metadata: Metadata = { title: "Results" };

/**
 * Results (`/app/matches`, P-WEB-1): the Sand Rating with the provisional
 * rule, the form line, results waiting for a confirmation, then every result
 * by month with its state and what it did to the rating. `?date=YYYY-MM-DD`
 * shows one day (the old match calendar's links keep working).
 */
export default async function MatchesPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly date?: string | string[] }>;
}) {
  const { date } = await searchParams;
  const onDay =
    typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? date
      : undefined;
  const loaded = await loadMatches();
  const head = (
    <header className="pp-head">
      <div className="pp-head__text">
        <h1 className="td-display pp-title">Your results</h1>
        <p className="td-lead">
          Every match you played, who confirmed it and what it did to your Sand
          Rating.
        </p>
      </div>
      <div className="pp-head__actions">
        <Button href="/app/score" variant="primary">
          Add a result
        </Button>
      </div>
    </header>
  );
  if (!loaded.ok) {
    return (
      <div className="pp">
        {head}
        <ReadFailed
          busy={loaded.busy}
          reference={loaded.reference}
          what="Your results"
        />
      </div>
    );
  }
  const { session, me, matches } = loaded.value;
  const timeZone =
    (await headers()).get("x-vercel-ip-timezone") ?? "America/Los_Angeles";
  const model = historyModel({
    matches,
    myId: me.id,
    now: new Date(),
    timeZone,
    ...(onDay ? { onDay } : {}),
  });
  return (
    <div className="pp">
      {head}
      <MatchesView
        actingFor={session.actingFor?.firstName ?? null}
        me={me}
        model={model}
        {...(onDay ? { onDay } : {})}
      />
    </div>
  );
}
