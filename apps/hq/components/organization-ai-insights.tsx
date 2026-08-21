"use client";

import { DunaActionTrigger } from "@duna/ui";
import {
  ArrowRight,
  CalendarDays,
  Check,
  CircleAlert,
  RefreshCw,
  Sparkles,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Signal = {
  readonly kind: "attention" | "demand" | "opportunity" | "steady";
  readonly label: string;
  readonly title: string;
  readonly detail: string;
  readonly href: string;
};

type Insights = {
  readonly headline: string;
  readonly summary: string;
  readonly signals: readonly Signal[];
  readonly generatedAt?: string;
  readonly source?: "ai" | "deterministic";
};

const signalIcon = {
  attention: CircleAlert,
  demand: UsersRound,
  opportunity: TrendingUp,
  steady: Check,
} as const;

export function OrganizationAiInsights({
  eventCount,
  initial,
  scheduleCount,
}: {
  readonly eventCount: number;
  readonly initial: Insights;
  readonly scheduleCount: number;
}) {
  const [insights, setInsights] = useState(initial);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch("/api/duna-ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "insights", surface: "hq" }),
      });
      const result = (await response.json()) as {
        readonly headline?: string;
        readonly summary?: string;
        readonly signals?: readonly Omit<Signal, "href">[];
        readonly hrefs?: readonly string[];
        readonly generatedAt?: string;
        readonly source?: "ai" | "deterministic";
      };
      if (result.headline && result.summary && result.signals?.length) {
        setInsights({
          headline: result.headline,
          summary: result.summary,
          generatedAt: result.generatedAt,
          source: result.source,
          signals: result.signals.map((signal, index) => ({
            ...signal,
            href: result.hrefs?.[index] ?? "/reports",
          })),
        });
      }
    } catch {
      // Keep the server-grounded initial signals when the AI brief is unavailable.
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <aside
      className="hq-ai-analyst"
      data-ai-source={insights.source ?? "loading"}
    >
      <header>
        <span>
          <Sparkles aria-hidden size={18} />
          Duna AI
        </span>
        <button
          aria-label="Refresh Duna AI insights"
          className={refreshing ? "is-refreshing" : undefined}
          disabled={refreshing}
          onClick={() => void refresh()}
          type="button"
        >
          <RefreshCw aria-hidden size={17} />
        </button>
      </header>

      <div className="hq-ai-analyst__intro">
        <span>
          Today’s operating signals
          {refreshing && <i> · Analyzing connected context…</i>}
        </span>
        <h2>{insights.headline}</h2>
        <p>{insights.summary}</p>
      </div>

      <div className="hq-ai-analyst__signals">
        {insights.signals.map((signal) => {
          const Icon = signalIcon[signal.kind];
          return (
            <article
              className={`hq-ai-signal hq-ai-signal--${signal.kind}`}
              key={`${signal.kind}-${signal.title}`}
            >
              <span>
                <Icon aria-hidden size={18} />
              </span>
              <div>
                <span className="hq-ai-signal__label">{signal.label}</span>
                <h3>{signal.title}</h3>
                <p>{signal.detail}</p>
                <Link href={signal.href}>
                  Open in Duna <ArrowRight aria-hidden size={14} />
                </Link>
              </div>
            </article>
          );
        })}
      </div>

      <footer>
        <span>
          <CalendarDays aria-hidden size={16} />
          {scheduleCount} schedule items · {eventCount} events
        </span>
        <DunaActionTrigger panel="chat">
          Ask Duna <ArrowRight aria-hidden size={15} />
        </DunaActionTrigger>
      </footer>
    </aside>
  );
}
