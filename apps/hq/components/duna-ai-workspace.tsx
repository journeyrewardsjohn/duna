"use client";

import { ArrowUpRight, Bot, Check, Globe2, Send, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Card =
  | {
      readonly kind: "link" | "notice";
      readonly title: string;
      readonly detail: string;
      readonly href?: string;
      readonly tone?: "default" | "positive" | "warning" | "danger";
    }
  | {
      readonly kind: "approval";
      readonly title: string;
      readonly detail: string;
      readonly changes: readonly string[];
      readonly draft: {
        readonly id: string;
        readonly riskTier: "read" | "propose" | "confirm-always";
        readonly confirmationNonce?: string;
      };
    }
  | {
      readonly kind: "metric";
      readonly title: string;
      readonly detail: string;
      readonly metrics: readonly {
        readonly label: string;
        readonly value: string;
        readonly change?: string;
        readonly tone?: string;
      }[];
    }
  | {
      readonly kind: "event";
      readonly title: string;
      readonly detail: string;
      readonly href: string;
      readonly startsAt?: string;
      readonly price?: string;
      readonly spotsRemaining?: number;
    };

type Message = {
  readonly role: "assistant" | "user";
  readonly body: string;
  readonly cards?: readonly Card[];
};

const initialStarters = [
  "Show me what needs attention today",
  "How is the business performing today?",
  "Help me plan next week around coaches and courts",
] as const;

function boundedContext(pathname: string) {
  const key = "duna-ai-recent-hq-paths";
  let recentPaths: string[] = [pathname];
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? "[]") as unknown;
    if (Array.isArray(stored))
      recentPaths = [
        pathname,
        ...stored.filter(
          (item): item is string =>
            typeof item === "string" && item !== pathname,
        ),
      ].slice(0, 8);
    localStorage.setItem(key, JSON.stringify(recentPaths));
  } catch {
    // Context is additive, never required for authorization.
  }
  return {
    pathname,
    pageTitle: document.title,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    locale: navigator.language,
    localTime: new Date().toISOString(),
    recentPaths,
    interactionSignals: [`Opened Duna AI from ${pathname}`],
  };
}

export function DunaAiWorkspace() {
  const pathname = usePathname();
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [research, setResearch] = useState(false);
  const [starters, setStarters] = useState<readonly string[]>(initialStarters);
  const loaded = useRef(false);
  const [messages, setMessages] = useState<readonly Message[]>([
    {
      role: "assistant",
      body: "I’m Duna AI. I’m using your active organization, this page, current time, schedule, performance, weather, and permissions to help you operate.",
    },
  ]);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    const load = async () => {
      try {
        const response = await fetch("/api/duna-ai", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            mode: "suggestions",
            surface: "hq",
            page: pathname,
            context: boundedContext(pathname),
          }),
        });
        const result = (await response.json()) as {
          reply?: string;
          cards?: readonly Card[];
          suggestions?: readonly string[];
        };
        if (result.suggestions?.length) setStarters(result.suggestions);
        if (result.cards?.length)
          setMessages([
            {
              role: "assistant",
              body: result.reply ?? "Here’s what deserves attention now.",
              cards: result.cards,
            },
          ]);
      } catch {
        // Static operating starters remain available.
      }
    };
    void load();
  }, [pathname]);

  async function ask(message: string) {
    const value = message.trim();
    if (!value || pending) return;
    const history = messages
      .slice(-8)
      .map(({ role, body }) => ({ role, body }));
    setText("");
    setMessages((current) => [...current, { role: "user", body: value }]);
    setPending(true);
    try {
      const response = await fetch("/api/duna-ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "ask",
          message: value,
          surface: "hq",
          page: pathname,
          context: boundedContext(pathname),
          history,
          researchMode: research ? "on" : "off",
        }),
      });
      const result = (await response.json()) as {
        reply?: string;
        cards?: readonly Card[];
        suggestions?: readonly string[];
        error?: string;
      };
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          body:
            result.reply ?? result.error ?? "I couldn’t complete that safely.",
          cards: result.cards,
        },
      ]);
      if (result.suggestions?.length) setStarters(result.suggestions);
    } catch {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          body: "Duna AI is unavailable right now. Nothing in your operation changed.",
        },
      ]);
    } finally {
      setPending(false);
    }
  }

  async function confirm(card: Extract<Card, { kind: "approval" }>) {
    setPending(true);
    try {
      const response = await fetch("/api/duna-ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "confirm",
          draftId: card.draft.id,
          confirmationNonce: card.draft.confirmationNonce,
        }),
      });
      const payload = (await response.json()) as {
        result?: {
          status: "applied" | "approved-plan" | "failed";
          reply: string;
          changes: readonly string[];
          href?: string;
        };
        error?: string;
      };
      const result = payload.result;
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          body:
            result?.reply ??
            payload.error ??
            "I couldn’t complete that approval. Nothing changed.",
          cards: result
            ? [
                {
                  kind: result.href ? "link" : "notice",
                  title:
                    result.status === "applied"
                      ? "Changes applied"
                      : result.status === "approved-plan"
                        ? "Plan approved"
                        : "Action needs attention",
                  detail: result.changes.join(" · "),
                  href: result.href,
                  tone:
                    result.status === "applied"
                      ? "positive"
                      : result.status === "failed"
                        ? "danger"
                        : "default",
                },
              ]
            : undefined,
        },
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          body: "I couldn’t complete that approval. Nothing changed.",
        },
      ]);
    } finally {
      setPending(false);
    }
  }

  function renderCard(card: Card, index: number) {
    const key = `${card.kind}-${card.title}-${index}`;
    if (card.kind === "approval") {
      return (
        <section
          className="duna-ai-workspace__card duna-ai-workspace__card--approval"
          key={key}
        >
          <span>Exact review required</span>
          <strong>{card.title}</strong>
          <small>{card.detail}</small>
          <ul>
            {card.changes.map((change) => (
              <li key={change}>{change}</li>
            ))}
          </ul>
          <button
            disabled={pending}
            onClick={() => confirm(card)}
            type="button"
          >
            <Check aria-hidden size={15} />{" "}
            {card.draft.riskTier === "confirm-always"
              ? "Approve these changes"
              : "Approve plan"}
          </button>
        </section>
      );
    }
    if (card.kind === "metric") {
      return (
        <section className="duna-ai-workspace__metric-card" key={key}>
          <span>Live organization metrics</span>
          <strong>{card.title}</strong>
          <small>{card.detail}</small>
          <dl>
            {card.metrics.map((metric) => (
              <div data-tone={metric.tone} key={metric.label}>
                <dt>{metric.label}</dt>
                <dd>{metric.value}</dd>
                {metric.change && <small>{metric.change}</small>}
              </div>
            ))}
          </dl>
        </section>
      );
    }
    if (card.kind === "event") {
      return (
        <Link className="duna-ai-workspace__card" href={card.href} key={key}>
          <span>Relevant event</span>
          <strong>{card.title}</strong>
          <small>
            {card.startsAt
              ? new Date(card.startsAt).toLocaleString()
              : card.detail}
          </small>
          <ArrowUpRight aria-hidden size={16} />
        </Link>
      );
    }
    if (card.href) {
      return (
        <Link
          className={`duna-ai-workspace__card duna-ai-workspace__card--${card.tone ?? "default"}`}
          href={card.href}
          key={key}
        >
          <span>
            {card.kind === "notice" ? "Duna signal" : "Open workspace"}
          </span>
          <strong>{card.title}</strong>
          <small>{card.detail}</small>
          <ArrowUpRight aria-hidden size={16} />
        </Link>
      );
    }
    return (
      <section
        className={`duna-ai-workspace__card duna-ai-workspace__card--${card.tone ?? "default"}`}
        key={key}
      >
        <span>Duna signal</span>
        <strong>{card.title}</strong>
        <small>{card.detail}</small>
      </section>
    );
  }

  return (
    <section className="duna-ai-workspace">
      <aside className="duna-ai-workspace__intro">
        <span className="hq-eyebrow">
          <Sparkles aria-hidden size={15} /> Context-aware co-pilot
        </span>
        <h2>See what matters. Act with control.</h2>
        <p>
          Duna AI connects the page you’re on with your schedule, weather,
          performance, conflicts, and active permissions.
        </p>
        <dl>
          <div>
            <dt>Context</dt>
            <dd>Identity, page, time, business, weather</dd>
          </div>
          <div>
            <dt>Complex work</dt>
            <dd>Exact multi-record change sets</dd>
          </div>
          <div>
            <dt>Consequential work</dt>
            <dd>Fresh approval, execution result, audit trail</dd>
          </div>
        </dl>
        <button
          aria-pressed={research}
          className="duna-ai-workspace__research"
          onClick={() => setResearch((value) => !value)}
          type="button"
        >
          <Globe2 aria-hidden size={15} /> Web research{" "}
          {research ? "on" : "off"}
        </button>
      </aside>
      <div className="duna-ai-workspace__chat">
        <header>
          <span className="duna-ai-workspace__avatar">
            <Bot aria-hidden size={19} />
          </span>
          <div>
            <strong>Duna AI</strong>
            <small>Context on · {research ? "web on" : "Duna only"}</small>
          </div>
        </header>
        <div className="duna-ai-workspace__messages" role="log">
          {messages.map((message, index) => (
            <div
              className={`duna-ai-workspace__turn duna-ai-workspace__turn--${message.role}`}
              key={`${message.role}-${index}`}
            >
              <p>{message.body}</p>
              {message.cards?.map(renderCard)}
            </div>
          ))}
          {pending && (
            <p className="duna-ai-workspace__thinking">
              Checking the page, schedule, weather, and operating context…
            </p>
          )}
        </div>
        {messages.filter(({ role }) => role === "user").length === 0 && (
          <div className="duna-ai-workspace__starters">
            {starters.map((starter) => (
              <button key={starter} onClick={() => ask(starter)} type="button">
                {starter}
              </button>
            ))}
          </div>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            ask(text);
          }}
        >
          <input
            aria-label="Ask Duna AI"
            disabled={pending}
            onChange={(event) => setText(event.target.value)}
            placeholder="Ask about your operation…"
            value={text}
          />
          <button aria-label="Send to Duna AI" disabled={pending} type="submit">
            <Send aria-hidden size={17} />
          </button>
        </form>
      </div>
    </section>
  );
}
