"use client";

import { Badge, Numeric } from "@duna/ui";
import {
  ArrowRight,
  CalendarDays,
  Check,
  MapPin,
  Sparkles,
  Trophy,
} from "lucide-react";
import { useState } from "react";

function defaultStart() {
  const value = new Date();
  value.setDate(value.getDate() + 21);
  value.setHours(9, 0, 0, 0);
  const offset = value.getTimezoneOffset();
  return new Date(value.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

export function PublicCreateStarter({ hqUrl }: { readonly hqUrl: string }) {
  const [kind, setKind] = useState<"tournament" | "league">("tournament");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [venue, setVenue] = useState("");
  const [startsAt, setStartsAt] = useState(defaultStart);

  const continueInHq = () => {
    const params = new URLSearchParams({
      type: kind,
      title,
      summary,
      venue,
      starts: startsAt,
      source: "public-create",
    });
    window.location.assign(`${hqUrl}/events/create?${params.toString()}`);
  };

  return (
    <div className="public-create">
      <section className="public-create__intro">
        <Badge>
          <Sparkles aria-hidden size={12} /> Event-only launch plan
        </Badge>
        <h1>Put your event on Duna.</h1>
        <p>
          Start here without learning a new operating system. We&apos;ll carry
          your first details into the full guided setup in Duna HQ.
        </p>
        <div className="public-create__plan">
          <span>
            <small>Monthly software</small>
            <Numeric>$0</Numeric>
          </span>
          <span>
            <small>On event sales</small>
            <Numeric>15%</Numeric>
          </span>
          <ul>
            <li>
              <Check aria-hidden size={15} /> Public event page
            </li>
            <li>
              <Check aria-hidden size={15} /> Entries, teams + tickets
            </li>
            <li>
              <Check aria-hidden size={15} /> Pools, brackets + live play
            </li>
          </ul>
        </div>
      </section>

      <section className="public-create__form">
        <span className="section__eyebrow">Start your draft</span>
        <h2>Just enough to begin.</h2>
        <div className="public-create__types">
          <button
            className={kind === "tournament" ? "active" : undefined}
            onClick={() => setKind("tournament")}
            type="button"
          >
            <Trophy aria-hidden size={21} />
            <span>
              <strong>Tournament</strong>
              <small>Divisions, pools, brackets + tickets</small>
            </span>
          </button>
          <button
            className={kind === "league" ? "active" : undefined}
            onClick={() => setKind("league")}
            type="button"
          >
            <CalendarDays aria-hidden size={21} />
            <span>
              <strong>League</strong>
              <small>Recurring play, teams + standings</small>
            </span>
          </button>
        </div>
        <div className="public-create__fields">
          <label>
            <span>Name</span>
            <input
              autoFocus
              maxLength={140}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={
                kind === "tournament"
                  ? "Sunset Open"
                  : "South Bay Summer League"
              }
              value={title}
            />
          </label>
          <label>
            <span>One-line summary</span>
            <input
              maxLength={180}
              onChange={(event) => setSummary(event.target.value)}
              placeholder="What makes this worth joining?"
              value={summary}
            />
          </label>
          <label>
            <span>
              <CalendarDays aria-hidden size={14} /> Starts
            </span>
            <input
              onChange={(event) => setStartsAt(event.target.value)}
              type="datetime-local"
              value={startsAt}
            />
          </label>
          <label>
            <span>
              <MapPin aria-hidden size={14} /> Venue or city
            </span>
            <input
              onChange={(event) => setVenue(event.target.value)}
              placeholder="Manhattan Beach Pier"
              value={venue}
            />
          </label>
        </div>
        <button
          className="public-create__continue"
          disabled={
            title.trim().length < 3 || summary.trim().length < 3 || !startsAt
          }
          onClick={continueInHq}
          type="button"
        >
          Continue the guided setup <ArrowRight aria-hidden size={17} />
        </button>
        <small className="public-create__fineprint">
          Your event stays private until you explicitly publish it. Paid events
          require Stripe setup in Duna HQ.
        </small>
      </section>
    </div>
  );
}
