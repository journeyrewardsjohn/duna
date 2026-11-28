import "@/components/player/player.css";

import { Button, EmptyState } from "@duna/ui/tideline";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { loadMatch } from "@/components/player/matches/matches-data";
import { MatchView } from "@/components/player/matches/match-view";
import { ReadFailed } from "@/components/player/states";

export const metadata: Metadata = { title: "Result" };

/**
 * One result (`/app/matches/[id]`, P-WEB-1). A result claimed from
 * `/add-score` lands here. The film, private notes, comments and the
 * prediction market stay on the match's own page (`/matches/[id]`), linked
 * as "Match details" (as the app's details sheet does).
 */
export default async function MatchPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const { id } = await params;
  const loaded = await loadMatch(id);
  if (!loaded.ok) {
    return (
      <div className="pp">
        <h1 className="td-display pp-title">Result</h1>
        <ReadFailed
          busy={loaded.busy}
          reference={loaded.reference}
          what="This result"
        />
      </div>
    );
  }
  const { match, scoring, me, viewerId } = loaded.value;
  if (!match) {
    return (
      <div className="pp">
        <h1 className="td-display pp-title">Result not found</h1>
        <EmptyState
          actions={
            <>
              <Button href="/app/matches" variant="primary">
                Your results
              </Button>
              <Button href="/app/score" variant="secondary">
                Add a result
              </Button>
            </>
          }
          description="It may have been removed, or it belongs to someone else’s account."
          icon="score"
          title="We couldn’t find this result"
        />
      </div>
    );
  }
  const incoming = await headers();
  const host = incoming.get("x-forwarded-host") ?? incoming.get("host");
  const protocol = incoming.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${protocol}://${host}` : "https://duna.coach";
  const timeZone =
    incoming.get("x-vercel-ip-timezone") ?? "America/Los_Angeles";
  return (
    <div className="pp">
      <MatchView
        match={match}
        me={me}
        origin={origin}
        {...(scoring ? { scoring } : {})}
        timeZone={timeZone}
        viewerId={viewerId}
      />
    </div>
  );
}
