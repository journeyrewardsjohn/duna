"use client";

import { Bot, CornerDownLeft, Sparkles, X } from "lucide-react";
import { useState } from "react";

const suggested = [
  "Find a 4.0–5.0 run tomorrow",
  "Why did my rating move?",
  "What should I know before Friday?",
] as const;

export function AskDuna() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<
    readonly { readonly role: "assistant" | "user"; readonly body: string }[]
  >([
    {
      role: "assistant",
      body: "Hey Mara — I can help you find a game, understand your rating, or get ready for what’s next.",
    },
  ]);

  function submit(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    setMessages((current) => [
      ...current,
      { role: "user", body: trimmed },
      {
        role: "assistant",
        body: trimmed.toLowerCase().includes("rating")
          ? "Your last win carried a 44% expectation and full live-score verification. The close third set added margin signal, moving you +0.08 to 4.62."
          : "I found two strong fits near South Bay. Golden Hour 4s has two spots tonight, and Friday Lights is open from 8–11 PM.",
      },
    ]);
    setQuery("");
  }

  return (
    <>
      <button
        aria-expanded={open}
        aria-label={open ? "Close Ask Duna" : "Open Ask Duna"}
        className="ask-duna__launcher"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <X aria-hidden /> : <Sparkles aria-hidden />}
        <span>Ask Duna</span>
      </button>
      {open && (
        <aside aria-label="Ask Duna assistant" className="ask-duna__panel">
          <div className="ask-duna__header">
            <span className="ask-duna__avatar">
              <Bot aria-hidden size={19} />
            </span>
            <div>
              <strong>Ask Duna</strong>
              <small>Grounded in your game</small>
            </div>
            <button aria-label="Close Ask Duna" onClick={() => setOpen(false)}>
              <X aria-hidden size={18} />
            </button>
          </div>
          <div className="ask-duna__messages" role="log">
            {messages.map((message, index) => (
              <p
                className={`ask-duna__message ask-duna__message--${message.role}`}
                key={`${message.role}-${index}`}
              >
                {message.body}
              </p>
            ))}
          </div>
          <div className="ask-duna__suggestions">
            {messages.length === 1 &&
              suggested.map((item) => (
                <button key={item} onClick={() => submit(item)}>
                  {item}
                </button>
              ))}
          </div>
          <form
            className="ask-duna__composer"
            onSubmit={(event) => {
              event.preventDefault();
              submit(query);
            }}
          >
            <input
              aria-label="Ask Duna a question"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ask about your game…"
              value={query}
            />
            <button aria-label="Send question" type="submit">
              <CornerDownLeft aria-hidden size={17} />
            </button>
          </form>
          <p className="ask-duna__notice">
            Ask Duna is read-only. Actions always move to a review step.
          </p>
        </aside>
      )}
    </>
  );
}
