"use client";

import { useRef, useState } from "react";
import { DunaMark } from "./web";
import { openDunaAi } from "./duna-action-center";

export function DunaTaskPrompt({
  compact = false,
  context,
  suggestions = [],
}: {
  readonly compact?: boolean;
  readonly context?: string;
  readonly suggestions?: readonly { label: string; prompt: string }[];
}) {
  const [value, setValue] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const send = () => {
    if (!value.trim()) return;
    openDunaAi(value.trim());
    setValue("");
  };
  return (
    <section
      aria-label="Ask Duna"
      className={`duna-task-prompt${compact ? " duna-task-prompt--compact" : ""}`}
    >
      {!compact && (
        <header>
          {context && <p>{context}</p>}
          <h1>What would you like to do?</h1>
          <p>Find a game, plan your week, or ask about your progress.</p>
        </header>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <textarea
          aria-label="What would you like Duna to do?"
          ref={input}
          rows={compact ? 1 : 2}
          maxLength={4000}
          placeholder={
            compact
              ? "Ask Duna about this page…"
              : "Ask Duna, or describe what you need…"
          }
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              send();
            }
          }}
        />
        <div className="duna-task-prompt__tools">
          <span>
            <DunaMark compact /> Duna AI
          </span>
          <button
            aria-label="Send to Duna"
            disabled={!value.trim()}
            type="submit"
          >
            <svg
              aria-hidden="true"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </button>
        </div>
      </form>
      {!compact && (
        <div className="duna-task-prompt__suggestions">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.label}
              type="button"
              onClick={() => {
                setValue(suggestion.prompt);
                input.current?.focus();
              }}
            >
              {suggestion.label}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
