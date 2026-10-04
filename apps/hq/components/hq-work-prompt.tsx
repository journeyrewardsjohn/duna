"use client";

import { DunaMark, openDunaAi } from "@duna/ui";
import { ArrowUp } from "lucide-react";
import { useRef, useState } from "react";

const prompts = [
  {
    label: "What needs attention?",
    prompt: "What needs my attention today in this organization?",
  },
  {
    label: "Plan an event",
    prompt:
      "Help me plan a new event. Ask me what you need before preparing a draft.",
  },
  {
    label: "Review this week",
    prompt:
      "Give me a concise overview of this week's schedule and business performance.",
  },
];

export function HqWorkPrompt({ date }: { readonly date: string }) {
  const [value, setValue] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const send = () => {
    if (value.trim()) {
      openDunaAi(value);
      setValue("");
    }
  };
  return (
    <section className="hq-work-prompt" aria-labelledby="hq-work-title">
      <p className="hq-work-date">{date}</p>
      <h1 id="hq-work-title">What would you like to get done?</h1>
      <p>Ask Duna to find answers, plan your day, or prepare a change.</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <textarea
          ref={input}
          aria-label="What would you like Duna to do?"
          placeholder="Ask about your club, or describe a task…"
          value={value}
          rows={2}
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
        <div className="hq-work-prompt__tools">
          <span>
            <DunaMark compact /> Duna AI
          </span>
          <button aria-label="Ask Duna" disabled={!value.trim()} type="submit">
            <ArrowUp size={18} aria-hidden />
          </button>
        </div>
      </form>
      <div className="hq-work-prompts">
        {prompts.map((prompt) => (
          <button
            key={prompt.label}
            type="button"
            onClick={() => {
              setValue(prompt.prompt);
              input.current?.focus();
            }}
          >
            {prompt.label}
          </button>
        ))}
      </div>
      <small>You review important changes before they happen.</small>
    </section>
  );
}

export function HqPagePrompt({ label }: { readonly label: string }) {
  const [value, setValue] = useState("");
  return (
    <form
      className="hq-page-prompt"
      onSubmit={(event) => {
        event.preventDefault();
        if (!value.trim()) return;
        openDunaAi(value);
        setValue("");
      }}
    >
      <DunaMark compact />
      <input
        aria-label={`Ask Duna about ${label.toLowerCase()}`}
        placeholder={`Ask Duna about ${label.toLowerCase()}, or describe a task…`}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <button aria-label="Ask Duna" disabled={!value.trim()} type="submit">
        <ArrowUp size={18} aria-hidden />
      </button>
    </form>
  );
}
