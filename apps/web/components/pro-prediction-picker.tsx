"use client";

import type { PublicProEvent } from "@duna/api";
import { Check, ChevronDown, History, Sparkles, Trophy } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  predictProEventAction,
  predictProMatchAction,
} from "@/app/events/[slug]/actions";
import { countryFlag } from "@/lib/country-flag";

type ProMatch = PublicProEvent["matches"][number];

function changedAt(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function ProEventWinnerPicker({
  event,
}: {
  readonly event: Pick<PublicProEvent, "slug" | "winnerPrediction">;
}) {
  const router = useRouter();
  const prediction = event.winnerPrediction;
  const [pending, startTransition] = useTransition();
  const [current, setCurrent] = useState(
    prediction.viewerExternalTeamId ?? null,
  );
  const [counts, setCounts] = useState(
    () =>
      new Map(
        prediction.entries.map((entry) => [
          entry.externalTeamId,
          entry.predictionCount,
        ]),
      ),
  );
  const [showAll, setShowAll] = useState(false);
  const [message, setMessage] = useState("");
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  const sorted = useMemo(
    () =>
      [...prediction.entries].sort((a, b) => {
        if (a.externalTeamId === current) return -1;
        if (b.externalTeamId === current) return 1;
        if (a.externalTeamId === prediction.systemPickExternalTeamId) return -1;
        if (b.externalTeamId === prediction.systemPickExternalTeamId) return 1;
        return (
          (counts.get(b.externalTeamId) ?? 0) -
            (counts.get(a.externalTeamId) ?? 0) ||
          (a.seed ?? 999) - (b.seed ?? 999)
        );
      }),
    [counts, current, prediction.entries, prediction.systemPickExternalTeamId],
  );
  const visible = showAll ? sorted : sorted.slice(0, 8);

  const pick = (externalTeamId: string) => {
    if (pending || prediction.closed || externalTeamId === current) return;
    const previous = current;
    setMessage("");
    startTransition(async () => {
      const result = await predictProEventAction({
        slug: event.slug,
        externalTeamId,
        idempotencyKey: crypto.randomUUID(),
      });
      if (!result.ok) {
        setMessage(result.error ?? "Try again.");
        return;
      }
      setCurrent(externalTeamId);
      setCounts((stored) => {
        const next = new Map(stored);
        if (previous) {
          next.set(previous, Math.max(0, (next.get(previous) ?? 0) - 1));
        }
        next.set(externalTeamId, (next.get(externalTeamId) ?? 0) + 1);
        return next;
      });
      setMessage(previous ? "Your pick changed." : "Your pick is in.");
      router.refresh();
    });
  };

  return (
    <section className="pro-event-section pro-winner-pick">
      <header>
        <div>
          <span className="page-eyebrow">One pick · change it anytime</span>
          <h2>Who will win?</h2>
        </div>
        <Trophy aria-hidden size={24} />
      </header>
      <div className="pro-winner-pick__summary">
        <p>
          Choose one team for this tournament. Duna keeps your current pick and
          a private timeline of every change.
        </p>
        <span>{total} community picks</span>
      </div>
      <div className="pro-winner-pick__list">
        {visible.map((entry) => {
          const count = counts.get(entry.externalTeamId) ?? 0;
          const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
          const selected = current === entry.externalTeamId;
          const systemPick =
            prediction.systemPickExternalTeamId === entry.externalTeamId;
          return (
            <article
              className={selected ? "is-selected" : undefined}
              key={entry.externalTeamId}
            >
              <span className="pro-winner-pick__flag" aria-hidden>
                {countryFlag(entry.countryCode) || "◌"}
              </span>
              <div>
                <strong>{entry.label}</strong>
                <small>
                  {entry.seed ? `Seed ${entry.seed}` : "Draw confirmed"}
                  {entry.averageRating !== undefined
                    ? ` · Duna ${entry.averageRating.toFixed(2)}`
                    : ""}
                </small>
              </div>
              {systemPick && (
                <span className="pro-winner-pick__model">
                  <Sparkles aria-hidden size={11} /> Duna pick
                </span>
              )}
              <b>{percentage}%</b>
              {prediction.viewerAuthenticated ? (
                <button
                  aria-pressed={selected}
                  disabled={pending || prediction.closed || selected}
                  onClick={() => pick(entry.externalTeamId)}
                  type="button"
                >
                  {selected ? (
                    <>
                      <Check aria-hidden size={14} /> Your pick
                    </>
                  ) : (
                    "Pick"
                  )}
                </button>
              ) : (
                <Link
                  href={`/sign-in?returnTo=${encodeURIComponent(`/events/${event.slug}`)}`}
                >
                  Pick
                </Link>
              )}
            </article>
          );
        })}
      </div>
      {sorted.length > 8 && (
        <button
          className="pro-winner-pick__more"
          onClick={() => setShowAll((value) => !value)}
          type="button"
        >
          <ChevronDown aria-hidden size={15} />
          {showAll ? "Show top teams" : `Show all ${sorted.length} teams`}
        </button>
      )}
      {prediction.history.length > 0 && (
        <details className="pro-pick-history">
          <summary>
            <History aria-hidden size={14} /> Your pick history
          </summary>
          <ol>
            {prediction.history.map((history, index) => (
              <li key={`${history.changedAt}-${index}`}>
                <span>
                  {history.previousLabel
                    ? `${history.previousLabel} → ${history.newLabel}`
                    : `Started with ${history.newLabel}`}
                </span>
                <time dateTime={history.changedAt}>
                  {changedAt(history.changedAt)}
                </time>
              </li>
            ))}
          </ol>
        </details>
      )}
      {prediction.closed && <p role="status">Picks are closed.</p>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}

export function ProMatchCommunityPicker({
  eventSlug,
  match,
  compact = false,
}: {
  readonly eventSlug: string;
  readonly match: ProMatch;
  readonly compact?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [current, setCurrent] = useState(match.communityPrediction.viewerSide);
  const [counts, setCounts] = useState({
    A: match.communityPrediction.teamACount,
    B: match.communityPrediction.teamBCount,
  });
  const [message, setMessage] = useState("");
  const total = counts.A + counts.B;
  const teamA = total > 0 ? Math.round((counts.A / total) * 100) : 50;
  const teamB = 100 - teamA;

  const pick = (side: "A" | "B") => {
    if (pending || match.communityPrediction.closed || side === current) return;
    const previous = current;
    setMessage("");
    startTransition(async () => {
      const result = await predictProMatchAction({
        slug: eventSlug,
        matchId: match.id,
        predictedSide: side,
        idempotencyKey: crypto.randomUUID(),
      });
      if (!result.ok) {
        setMessage(result.error ?? "Try again.");
        return;
      }
      setCurrent(side);
      setCounts((stored) => ({
        A: stored.A + (side === "A" ? 1 : 0) - (previous === "A" ? 1 : 0),
        B: stored.B + (side === "B" ? 1 : 0) - (previous === "B" ? 1 : 0),
      }));
      setMessage(previous ? "Pick changed." : "Pick saved.");
      router.refresh();
    });
  };

  return (
    <div
      className={`pro-community-pick${compact ? " pro-community-pick--compact" : ""}`}
    >
      <header>
        <strong>{compact ? "Make your pick" : "Community prediction"}</strong>
        <span>{total} picks</span>
      </header>
      <div>
        {(["A", "B"] as const).map((side) => {
          const label = side === "A" ? match.teamA.label : match.teamB.label;
          const percentage = side === "A" ? teamA : teamB;
          const selected = current === side;
          const content = (
            <>
              <span>{label}</span>
              <b>{percentage}%</b>
              {selected && <Check aria-hidden size={13} />}
            </>
          );
          return match.communityPrediction.viewerAuthenticated ? (
            <button
              aria-pressed={selected}
              className={selected ? "is-selected" : undefined}
              disabled={pending || match.communityPrediction.closed}
              key={side}
              onClick={() => pick(side)}
              type="button"
            >
              {content}
            </button>
          ) : (
            <Link
              href={`/sign-in?returnTo=${encodeURIComponent(match.canonicalPath)}`}
              key={side}
            >
              {content}
            </Link>
          );
        })}
      </div>
      {!compact && match.communityPrediction.viewerHistory.length > 1 && (
        <small>
          <History aria-hidden size={12} /> Your pick changed{" "}
          {match.communityPrediction.viewerHistory.length - 1} time
          {match.communityPrediction.viewerHistory.length === 2 ? "" : "s"}.
        </small>
      )}
      {match.communityPrediction.closed && (
        <small>Picks closed when this match began.</small>
      )}
      {message && <small role="status">{message}</small>}
    </div>
  );
}
