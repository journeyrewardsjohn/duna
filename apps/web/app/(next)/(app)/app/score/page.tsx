import "@/components/player/player.css";

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { loadMatches } from "@/components/player/matches/matches-data";
import { UNDER_13_MESSAGE } from "@/components/player/result-copy";
import { ScoreFlow } from "@/components/player/score/score-flow";
import {
  recentPeople,
  setsFromQuery,
  setsFromWatch,
} from "@/components/player/score/score-model";
import { NotForThisAccount, ReadFailed } from "@/components/player/states";

export const metadata: Metadata = { title: "Add a result" };

type Query = Readonly<Record<string, string | string[] | undefined>>;

const one = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : undefined;

/**
 * Add a result, signed in (`/app/score`, P-WEB-1): `/add-score`'s parts with
 * the person's own players. Ends on the result's page. `?match=` (a match
 * being kept point by point) opens the live scorer; `?watch=` carries the
 * sets from the watch; `?sets=` and `?type=` come from "Change this result".
 */
export default async function ScorePage({
  searchParams,
}: {
  readonly searchParams: Promise<Query>;
}) {
  const query = await searchParams;
  const live = one(query.match);
  if (live) redirect(`/app/score/live?match=${encodeURIComponent(live)}`);
  const loaded = await loadMatches();
  const head = (
    <header className="pp-head">
      <div className="pp-head__text">
        <h1 className="td-display pp-title">Add a result</h1>
        <p className="td-lead">
          Where you played, the score and who played. Someone on the other side
          confirms it, then it counts.
        </p>
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
          what="Add a result"
        />
      </div>
    );
  }
  const { session, me, matches } = loaded.value;
  if (session.ageBand === "under-13" || session.actingFor) {
    return (
      <div className="pp">
        {head}
        <NotForThisAccount
          area={
            session.actingFor
              ? `Adding a result for ${session.actingFor.firstName}`
              : "Adding a result"
          }
          grantedBy={
            session.actingFor
              ? "your own account: switch back to it first"
              : "a parent or guardian"
          }
        />
        <p className="td-meta pp-center">{UNDER_13_MESSAGE}</p>
      </div>
    );
  }
  const { partners, opponents } = recentPeople(matches, me.id);
  const fromWatch = setsFromWatch(one(query.watch));
  const fromChange = setsFromQuery(one(query.sets));
  const type = one(query.type);
  return (
    <div className="pp pp--narrow">
      {head}
      <ScoreFlow
        {...(fromWatch.length || fromChange.length
          ? { initialSets: fromWatch.length ? fromWatch : fromChange }
          : {})}
        {...(type === "friendly" || type === "competitive"
          ? { initialType: type }
          : {})}
        me={{
          id: me.id,
          name: me.displayName,
          ...(me.rating.confidence !== "Provisional"
            ? { level: me.rating.display.toFixed(1) }
            : {}),
        }}
        opponents={opponents}
        partners={partners}
      />
    </div>
  );
}
