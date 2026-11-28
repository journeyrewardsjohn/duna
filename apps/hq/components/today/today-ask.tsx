"use client";

import { DunaMark } from "@duna/ui";
import { Icon } from "@duna/ui/icons";
import { Button } from "@duna/ui/tideline";
import { useState } from "react";
import { useShell } from "../shell/shell-context";

/**
 * Ask Duna on Today: one line to hand Duna a task, and the next steps the
 * day's data suggests. Both open the docked panel; Duna proposes and the
 * owner approves every change there.
 */
export function TodayAsk({
  suggestions,
}: {
  readonly suggestions: readonly string[];
}) {
  const { openAsk, session } = useShell();
  const [text, setText] = useState("");
  const ready = session.askDuna === "ready";
  return (
    <section aria-labelledby="today-ask-title" className="today-ask">
      <h2 className="td-sr" id="today-ask-title">
        Ask Duna
      </h2>
      <form
        className="today-ask__form"
        onSubmit={(event) => {
          event.preventDefault();
          const prompt = text.trim();
          openAsk(prompt || undefined);
          if (prompt && ready) setText("");
        }}
      >
        <DunaMark className="today-ask__mark" decorative size={20} />
        <input
          aria-label="What would you like Duna to do?"
          className="today-ask__input"
          maxLength={2000}
          onChange={(event) => setText(event.target.value)}
          placeholder="Ask Duna to do something for your club…"
          value={text}
        />
        <Button size="sm" type="submit" variant="primary">
          Ask Duna
        </Button>
      </form>
      {suggestions.length > 0 ? (
        <ul aria-label="Suggested next steps" className="today-ask__next">
          {suggestions.map((suggestion) => (
            <li key={suggestion}>
              <button
                className="today-ask__suggestion"
                onClick={() => openAsk(suggestion)}
                type="button"
              >
                <Icon name="find" size="inline" />
                {suggestion}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
