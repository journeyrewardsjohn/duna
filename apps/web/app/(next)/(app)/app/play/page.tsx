import "@/components/player/player.css";

import { Button } from "@duna/ui/tideline";
import type { Metadata } from "next";
import { loadPlay } from "@/components/player/play/play-data";
import { PlayView } from "@/components/player/play/play-view";
import { ReadFailed } from "@/components/player/states";

export const metadata: Metadata = { title: "Plans" };

/**
 * Play (`/app/play`, P-WEB-1): what the person (or the junior they act for)
 * has coming up, as a calm agenda by day, each plan with its group state,
 * price line, free-cancellation deadline and actions; then what they played.
 * Booking itself starts in Find.
 */
export default async function PlayPage() {
  const loaded = await loadPlay();
  if (!loaded.ok) {
    return (
      <div className="pp">
        <h1 className="td-display pp-title">Your plans</h1>
        <ReadFailed
          busy={loaded.busy}
          reference={loaded.reference}
          what="Your plans"
        />
      </div>
    );
  }
  const { session, agenda, catalogMissing } = loaded.value;
  const acting = session.actingFor;
  const count = agenda.count;
  return (
    <div className="pp">
      <header className="pp-head">
        <div className="pp-head__text">
          <h1 className="td-display pp-title">
            {acting ? `${acting.firstName}’s plans` : "Your plans"}
          </h1>
          <p className="td-lead">
            {count === 0
              ? "Nothing coming up yet."
              : `${count} coming up. Everything you need on the day, and until when you can cancel for free.`}
          </p>
        </div>
        <div className="pp-head__actions">
          <Button href="/app/discover" variant="primary">
            Find a game
          </Button>
          {session.junior || acting ? null : (
            <Button href="/app/pickup/new" variant="secondary">
              Host a pickup
            </Button>
          )}
        </div>
      </header>
      <PlayView
        actingFor={acting}
        agenda={agenda}
        {...(catalogMissing ? { catalogMissing } : {})}
        junior={session.junior}
      />
    </div>
  );
}
