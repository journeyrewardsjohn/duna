"use client";

import {
  Bot,
  Check,
  ChevronRight,
  CornerDownLeft,
  ExternalLink,
  Globe2,
  MapPin,
  Sparkles,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties } from "react";

type ApprovalCard = {
  readonly kind: "approval";
  readonly title: string;
  readonly detail: string;
  readonly changes: readonly string[];
  readonly draft: {
    readonly id: string;
    readonly riskTier: "read" | "propose" | "confirm-always";
    readonly confirmationNonce?: string;
  };
};

type DunaCard =
  | ApprovalCard
  | {
      readonly kind: "link" | "notice";
      readonly title: string;
      readonly detail: string;
      readonly href?: string;
      readonly tone?: "default" | "positive" | "warning" | "danger";
    }
  | {
      readonly kind: "event";
      readonly title: string;
      readonly detail: string;
      readonly href: string;
      readonly imageUrl?: string;
      readonly startsAt?: string;
      readonly venue?: string;
      readonly price?: string;
      readonly spotsRemaining?: number;
    }
  | {
      readonly kind: "map";
      readonly title: string;
      readonly detail: string;
      readonly points: readonly {
        readonly id: string;
        readonly title: string;
        readonly subtitle: string;
        readonly href: string;
        readonly latitude: number;
        readonly longitude: number;
      }[];
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
    };

type Message = {
  readonly role: "assistant" | "user";
  readonly body: string;
  readonly cards?: readonly DunaCard[];
};

type AgentResponse = {
  readonly reply?: string;
  readonly cards?: readonly DunaCard[];
  readonly suggestions?: readonly string[];
  readonly error?: string;
};

const initialSuggestions = [
  "Find events that fit my upcoming schedule",
  "Why did my rating move?",
  "What should I know before my next booking?",
] as const;

function boundedContext(pathname: string, interactions: readonly string[]) {
  const key = "duna-ai-recent-player-paths";
  let recentPaths: string[] = [pathname];
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? "[]") as unknown;
    if (Array.isArray(stored)) {
      recentPaths = [
        pathname,
        ...stored.filter(
          (item): item is string =>
            typeof item === "string" && item !== pathname,
        ),
      ].slice(0, 8);
    }
    localStorage.setItem(key, JSON.stringify(recentPaths));
  } catch {
    // Browsing context is helpful, never required.
  }
  return {
    pathname,
    pageTitle: document.title,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    locale: navigator.language,
    localTime: new Date().toISOString(),
    recentPaths,
    interactionSignals: interactions.slice(-8),
  };
}

function mapPosition(
  point: Extract<DunaCard, { kind: "map" }>["points"][number],
  points: Extract<DunaCard, { kind: "map" }>["points"],
): CSSProperties {
  const latitudes = points.map(({ latitude }) => latitude);
  const longitudes = points.map(({ longitude }) => longitude);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);
  const x =
    maxLng === minLng
      ? 50
      : 10 + ((point.longitude - minLng) / (maxLng - minLng)) * 80;
  const y =
    maxLat === minLat
      ? 50
      : 10 + ((maxLat - point.latitude) / (maxLat - minLat)) * 80;
  return { left: `${x}%`, top: `${y}%` };
}

export function AskDuna() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(false);
  const [research, setResearch] = useState(false);
  const [suggestions, setSuggestions] =
    useState<readonly string[]>(initialSuggestions);
  const loadedSuggestions = useRef(false);
  const interactions = useRef<string[]>([]);
  const [messages, setMessages] = useState<readonly Message[]>([
    {
      role: "assistant",
      body: "I’m Duna AI. I’m aware of this page, your upcoming Duna schedule, and the permissions on your account. I’ll always show the exact change before important work.",
    },
  ]);

  useEffect(() => {
    const record = (event: MouseEvent) => {
      const target =
        event.target instanceof Element
          ? event.target.closest("a, button")
          : null;
      if (
        !target ||
        target.closest(".ask-duna__panel") ||
        target.closest(".ask-duna__launcher")
      )
        return;
      const label =
        target.getAttribute("aria-label") ??
        target.textContent?.replace(/\s+/g, " ").trim();
      if (label)
        interactions.current = [
          ...interactions.current,
          `Selected “${label.slice(0, 120)}” on ${pathname}`,
        ].slice(-8);
    };
    document.addEventListener("click", record);
    return () => document.removeEventListener("click", record);
  }, [pathname]);

  useEffect(() => {
    if (!open || loadedSuggestions.current) return;
    loadedSuggestions.current = true;
    const load = async () => {
      try {
        const response = await fetch("/api/duna-ai", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            mode: "suggestions",
            surface: "player",
            page: pathname,
            context: boundedContext(pathname, interactions.current),
          }),
        });
        const result = (await response.json()) as AgentResponse;
        if (result.suggestions?.length) setSuggestions(result.suggestions);
        if (result.cards?.length) {
          setMessages([
            {
              role: "assistant",
              body: result.reply ?? "Here’s what is relevant right now.",
              cards: result.cards,
            },
          ]);
        }
      } catch {
        // Keep useful static starters when proactive context is unavailable.
      }
    };
    void load();
  }, [open, pathname]);

  async function submit(value: string) {
    const trimmed = value.trim();
    if (!trimmed || pending) return;
    const previous = messages
      .slice(-8)
      .map(({ role, body }) => ({ role, body }));
    setMessages((current) => [...current, { role: "user", body: trimmed }]);
    setQuery("");
    setPending(true);
    try {
      const response = await fetch("/api/duna-ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "ask",
          message: trimmed,
          surface: "player",
          page: pathname,
          context: boundedContext(pathname, interactions.current),
          history: previous,
          researchMode: research ? "on" : "off",
        }),
      });
      const result = (await response.json()) as AgentResponse;
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          body:
            result.reply ??
            result.error ??
            "I couldn’t complete that safely. Please try again.",
          cards: result.cards,
        },
      ]);
      if (result.suggestions?.length) setSuggestions(result.suggestions);
    } catch {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          body: "I can’t reach Duna AI right now. Your Duna account has not been changed.",
        },
      ]);
    } finally {
      setPending(false);
    }
  }

  async function approve(card: ApprovalCard) {
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
      const result = (await response.json()) as {
        result?: {
          status: "applied" | "approved-plan" | "failed";
          reply: string;
          changes: readonly string[];
          href?: string;
        };
        error?: string;
      };
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          body:
            result.result?.reply ??
            result.error ??
            "That approval could not be completed. Nothing changed.",
          cards: result.result
            ? [
                {
                  kind: result.result.href ? "link" : "notice",
                  title:
                    result.result.status === "applied"
                      ? "Changes applied"
                      : result.result.status === "approved-plan"
                        ? "Plan approved"
                        : "Action needs attention",
                  detail: result.result.changes.join(" · "),
                  href: result.result.href,
                  tone:
                    result.result.status === "applied"
                      ? "positive"
                      : result.result.status === "failed"
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
          body: "That approval could not be completed. Nothing changed.",
        },
      ]);
    } finally {
      setPending(false);
    }
  }

  function renderCard(card: DunaCard, index: number) {
    const key = `${card.kind}-${card.title}-${index}`;
    if (card.kind === "approval") {
      return (
        <section className="ask-duna__card ask-duna__card--approval" key={key}>
          <span>Exact review required</span>
          <strong>{card.title}</strong>
          <p>{card.detail}</p>
          <ul>
            {card.changes.map((change) => (
              <li key={change}>{change}</li>
            ))}
          </ul>
          <button
            disabled={pending}
            onClick={() => approve(card)}
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
    if (card.kind === "map") {
      return (
        <section className="ask-duna__map-card" key={key}>
          <span>
            <MapPin aria-hidden size={13} /> Co-pilot map
          </span>
          <strong>{card.title}</strong>
          <p>{card.detail}</p>
          <div className="ask-duna__mini-map">
            {card.points.map((point, pointIndex) => (
              <Link
                aria-label={`Open ${point.title}`}
                href={point.href}
                key={point.id}
                style={mapPosition(point, card.points)}
                title={`${point.title} — ${point.subtitle}`}
              >
                {pointIndex + 1}
              </Link>
            ))}
          </div>
          <ol>
            {card.points.slice(0, 4).map((point, pointIndex) => (
              <li key={point.id}>
                <Link href={point.href}>
                  <b>{pointIndex + 1}</b>
                  <span>
                    <strong>{point.title}</strong>
                    <small>{point.subtitle}</small>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      );
    }
    if (card.kind === "event") {
      return (
        <Link
          className="ask-duna__event-card"
          href={card.href}
          key={key}
          onClick={() => setOpen(false)}
        >
          {card.imageUrl && (
            <Image alt="" height={88} src={card.imageUrl} width={112} />
          )}
          <span>
            <small>Recommended in Duna</small>
            <strong>{card.title}</strong>
            <p>
              {card.startsAt
                ? new Date(card.startsAt).toLocaleString([], {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })
                : card.detail}
            </p>
            <em>
              {[
                card.price,
                card.spotsRemaining !== undefined
                  ? `${card.spotsRemaining} spots`
                  : undefined,
              ]
                .filter(Boolean)
                .join(" · ")}
            </em>
          </span>
          <ChevronRight aria-hidden size={16} />
        </Link>
      );
    }
    if (card.kind === "metric") {
      return (
        <section className="ask-duna__metric-card" key={key}>
          <span>Live Duna metrics</span>
          <strong>{card.title}</strong>
          <p>{card.detail}</p>
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
    if (card.href) {
      return (
        <Link
          className={`ask-duna__card ask-duna__card--${card.tone ?? "default"}`}
          href={card.href}
          key={key}
          onClick={() => setOpen(false)}
        >
          <span>{card.kind === "notice" ? "Duna signal" : "Open in Duna"}</span>
          <strong>{card.title}</strong>
          <p>{card.detail}</p>
          <ChevronRight aria-hidden size={16} />
        </Link>
      );
    }
    return (
      <section
        className={`ask-duna__card ask-duna__card--${card.tone ?? "default"}`}
        key={key}
      >
        <span>Duna signal</span>
        <strong>{card.title}</strong>
        <p>{card.detail}</p>
      </section>
    );
  }

  return (
    <>
      <button
        aria-expanded={open}
        aria-label={open ? "Close Duna AI" : "Open Duna AI"}
        className="ask-duna__launcher"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        {open ? <X aria-hidden /> : <Sparkles aria-hidden />}
        <span>Duna AI</span>
      </button>
      {open && (
        <aside aria-label="Duna AI assistant" className="ask-duna__panel">
          <div className="ask-duna__header">
            <span className="ask-duna__avatar">
              <Bot aria-hidden size={19} />
            </span>
            <div>
              <strong>Duna AI</strong>
              <small>Context on · {research ? "web on" : "Duna only"}</small>
            </div>
            <button
              aria-label="Close Duna AI"
              onClick={() => setOpen(false)}
              type="button"
            >
              <X aria-hidden size={18} />
            </button>
          </div>
          <div className="ask-duna__messages" role="log">
            {messages.map((message, index) => (
              <div className="ask-duna__turn" key={`${message.role}-${index}`}>
                <p
                  className={`ask-duna__message ask-duna__message--${message.role}`}
                >
                  {message.body}
                </p>
                {message.cards?.map(renderCard)}
              </div>
            ))}
            {pending && (
              <p className="ask-duna__thinking">
                Checking your page, schedule, and Duna context…
              </p>
            )}
          </div>
          <div className="ask-duna__suggestions">
            {messages.filter(({ role }) => role === "user").length === 0 &&
              suggestions.map((item) => (
                <button key={item} onClick={() => submit(item)} type="button">
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
              aria-label="Ask Duna AI a question"
              disabled={pending}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ask about your Duna world…"
              value={query}
            />
            <button aria-label="Send question" disabled={pending} type="submit">
              <CornerDownLeft aria-hidden size={17} />
            </button>
          </form>
          <div className="ask-duna__controls">
            <button
              aria-pressed={research}
              onClick={() => setResearch((value) => !value)}
              type="button"
            >
              <Globe2 aria-hidden size={14} /> Web research{" "}
              {research ? "on" : "off"}
            </button>
            <span>
              <ExternalLink aria-hidden size={12} /> Important changes require
              approval
            </span>
          </div>
        </aside>
      )}
    </>
  );
}
