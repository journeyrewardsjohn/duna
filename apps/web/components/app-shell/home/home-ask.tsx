"use client";

import { Button, Card, CrestMark } from "@duna/ui/tideline";
import { askDunaStarters } from "../ask-duna";
import { useAppShell } from "../shell-context";

/** Ask Duna on Home: the Crest, one line, and the starters (sends nothing until pressed). */
export function AskDunaPrompt({ firstName }: { readonly firstName: string }) {
  const { openAsk } = useAppShell();
  return (
    <section aria-labelledby="aph-ask" className="aph-section">
      <Card className="aph-ask">
        <div className="aph-ask__head">
          <CrestMark className="aph-ask__mark" />
          <div>
            <h2 className="aph-h2" id="aph-ask">
              Ask Duna
            </h2>
            <p className="td-meta">
              {firstName}, ask about your games, bookings and clubs. Duna
              suggests; you decide.
            </p>
          </div>
        </div>
        <div className="aph-ask__starters">
          {askDunaStarters.map((starter) => (
            <Button
              key={starter}
              onClick={() => openAsk(starter)}
              size="sm"
              variant="secondary"
            >
              {starter}
            </Button>
          ))}
        </div>
      </Card>
    </section>
  );
}
