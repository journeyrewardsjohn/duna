"use client";

import { Badge, Numeric } from "@duna/ui";
import { Check, ChevronRight, Clock3, Eye, MapPin, Users } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { createPickupAction } from "@/app/app/pickup/new/actions";

export function PickupForm() {
  const [step, setStep] = useState(1);
  const [createdSlug, setCreatedSlug] = useState<string>();
  const [title, setTitle] = useState("Golden Hour 4s");
  const [format, setFormat] = useState<"2s" | "4s" | "6s" | "king-queen">("4s");
  const [capacity, setCapacity] = useState(8);
  const [ratingMinimum, setRatingMinimum] = useState(4);
  const [ratingMaximum, setRatingMaximum] = useState(5);
  const [venueName, setVenueName] = useState("Hermosa Beach — Pier Courts");
  const [date, setDate] = useState(() =>
    new Date(Date.now() + 24 * 60 * 60_000).toISOString().slice(0, 10),
  );
  const [time, setTime] = useState("18:00");
  const [durationMinutes, setDurationMinutes] = useState(90);
  const [costMode, setCostMode] = useState<"free" | "split" | "fixed">("free");
  const [costDollars, setCostDollars] = useState("10.00");
  const [visibility, setVisibility] = useState<"public" | "unlisted">("public");
  const [note, setNote] = useState(
    "Good energy, competitive games, easy rotation. Bring your own water.",
  );
  const [recordMatches, setRecordMatches] = useState(true);
  const [error, setError] = useState<string>();
  const [isPending, startTransition] = useTransition();
  const startsAt = useMemo(() => {
    const value = new Date(`${date}T${time}:00`);
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  }, [date, time]);
  const endsAt = useMemo(() => {
    if (!startsAt) return undefined;
    return new Date(
      new Date(startsAt).getTime() + durationMinutes * 60_000,
    ).toISOString();
  }, [durationMinutes, startsAt]);

  if (createdSlug) {
    return (
      <section className="pickup-created">
        <span className="pickup-created__check">
          <Check aria-hidden size={28} />
        </span>
        <Badge tone="positive">Published</Badge>
        <h1>{title} is live.</h1>
        <p>
          The connected listing is published and ready to share. Matching
          notifications will begin when the messaging provider is activated.
        </p>
        <div>
          <Link className="primary-action" href={`/events/${createdSlug}`}>
            Open pickup <ChevronRight aria-hidden size={17} />
          </Link>
          <Link className="secondary-action" href="/app/play">
            Back to Play
          </Link>
        </div>
      </section>
    );
  }

  return (
    <div className="pickup-builder">
      <header>
        <div>
          <span className="page-eyebrow">Create in under 20 seconds</span>
          <h1>Host pickup.</h1>
          <p>Set the shape. Duna finds the right nearby players.</p>
        </div>
        <div className="pickup-builder__progress">
          {[1, 2, 3].map((value) => (
            <span className={value <= step ? "active" : undefined} key={value}>
              {value}
            </span>
          ))}
        </div>
      </header>

      <section className="pickup-builder__form">
        <div className="pickup-builder__main">
          {step === 1 && (
            <>
              <div className="field-group">
                <label htmlFor="pickup-title">Name your run</label>
                <input
                  id="pickup-title"
                  maxLength={80}
                  onChange={(event) => setTitle(event.target.value)}
                  value={title}
                />
              </div>
              <div className="form-grid form-grid--2">
                <div className="field-group">
                  <label htmlFor="pickup-format">Format</label>
                  <select
                    id="pickup-format"
                    onChange={(event) =>
                      setFormat(
                        event.target.value as "2s" | "4s" | "6s" | "king-queen",
                      )
                    }
                    value={format}
                  >
                    <option value="2s">2s</option>
                    <option value="4s">4s</option>
                    <option value="6s">6s</option>
                    <option value="king-queen">King / Queen</option>
                  </select>
                </div>
                <div className="field-group">
                  <label htmlFor="pickup-spots">Total spots</label>
                  <select
                    id="pickup-spots"
                    onChange={(event) =>
                      setCapacity(Number(event.target.value))
                    }
                    value={capacity}
                  >
                    <option value="4">4</option>
                    <option value="8">8</option>
                    <option value="12">12</option>
                    <option value="16">16</option>
                  </select>
                </div>
              </div>
              <div className="field-group">
                <label>Level</label>
                <div className="range-control">
                  <input
                    aria-label="Minimum rating"
                    max="8"
                    min="1"
                    onChange={(event) =>
                      setRatingMinimum(Number(event.target.value))
                    }
                    step="0.1"
                    type="number"
                    value={ratingMinimum}
                  />
                  <span>to</span>
                  <input
                    aria-label="Maximum rating"
                    max="8"
                    min="1"
                    onChange={(event) =>
                      setRatingMaximum(Number(event.target.value))
                    }
                    step="0.1"
                    type="number"
                    value={ratingMaximum}
                  />
                </div>
                <small>
                  Duna will match against connected, consented players.
                </small>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="field-group field-group--icon">
                <label htmlFor="pickup-venue">Where</label>
                <MapPin aria-hidden size={18} />
                <input
                  id="pickup-venue"
                  onChange={(event) => setVenueName(event.target.value)}
                  value={venueName}
                />
              </div>
              <div className="form-grid form-grid--2">
                <div className="field-group">
                  <label htmlFor="pickup-date">Date</label>
                  <input
                    id="pickup-date"
                    onChange={(event) => setDate(event.target.value)}
                    type="date"
                    value={date}
                  />
                </div>
                <div className="field-group">
                  <label htmlFor="pickup-time">Start time</label>
                  <input
                    id="pickup-time"
                    onChange={(event) => setTime(event.target.value)}
                    type="time"
                    value={time}
                  />
                </div>
              </div>
              <div className="form-grid form-grid--2">
                <div className="field-group">
                  <label htmlFor="pickup-duration">Duration</label>
                  <select
                    id="pickup-duration"
                    onChange={(event) =>
                      setDurationMinutes(Number(event.target.value))
                    }
                    value={durationMinutes}
                  >
                    <option value="60">1 hour</option>
                    <option value="90">1.5 hours</option>
                    <option value="120">2 hours</option>
                  </select>
                </div>
                <div className="field-group">
                  <label htmlFor="pickup-cost">Cost per player</label>
                  <select
                    id="pickup-cost"
                    onChange={(event) =>
                      setCostMode(
                        event.target.value as "free" | "split" | "fixed",
                      )
                    }
                    value={costMode}
                  >
                    <option value="free">Free</option>
                    <option value="split">Split court cost</option>
                    <option value="fixed">Fixed amount</option>
                  </select>
                </div>
              </div>
              {costMode !== "free" && (
                <div className="field-group">
                  <label htmlFor="pickup-cost-amount">
                    Amount per player (USD)
                  </label>
                  <input
                    id="pickup-cost-amount"
                    inputMode="decimal"
                    min="0.50"
                    onChange={(event) => setCostDollars(event.target.value)}
                    step="0.01"
                    type="number"
                    value={costDollars}
                  />
                  <small>
                    Paid pickup is available only through a connected club or
                    facility Stripe account; Duna never holds host funds.
                  </small>
                </div>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <div className="field-group">
                <label>Who can see it</label>
                <div className="choice-list">
                  <label
                    className={visibility === "public" ? "selected" : undefined}
                  >
                    <input
                      checked={visibility === "public"}
                      name="visibility"
                      onChange={() => setVisibility("public")}
                      type="radio"
                    />
                    <Eye aria-hidden size={20} />
                    <span>
                      <strong>Nearby matches</strong>
                      <small>Public to players in your level and area.</small>
                    </span>
                  </label>
                  <label
                    className={
                      visibility === "unlisted" ? "selected" : undefined
                    }
                  >
                    <input
                      checked={visibility === "unlisted"}
                      name="visibility"
                      onChange={() => setVisibility("unlisted")}
                      type="radio"
                    />
                    <Users aria-hidden size={20} />
                    <span>
                      <strong>People I invite</strong>
                      <small>Only via your private link.</small>
                    </span>
                  </label>
                </div>
              </div>
              <div className="field-group">
                <label htmlFor="pickup-note">A note for the group</label>
                <textarea
                  id="pickup-note"
                  maxLength={1_000}
                  onChange={(event) => setNote(event.target.value)}
                  rows={4}
                  value={note}
                />
              </div>
              <label className="toggle-row">
                <span>
                  <strong>Record matches inside this pickup</strong>
                  <small>
                    Group-confirmed results carry 0.60 rating weight.
                  </small>
                </span>
                <input
                  checked={recordMatches}
                  onChange={(event) => setRecordMatches(event.target.checked)}
                  type="checkbox"
                />
              </label>
              {error && <p role="alert">{error}</p>}
            </>
          )}

          <footer>
            {step > 1 ? (
              <button
                className="secondary-action"
                onClick={() => setStep(step - 1)}
              >
                Back
              </button>
            ) : (
              <Link className="secondary-action" href="/app/play">
                Cancel
              </Link>
            )}
            {step < 3 ? (
              <button
                className="primary-action"
                onClick={() => setStep(step + 1)}
              >
                Continue <ChevronRight aria-hidden size={17} />
              </button>
            ) : (
              <button
                className="primary-action"
                disabled={isPending}
                onClick={() => {
                  setError(undefined);
                  if (!startsAt || !endsAt) {
                    setError("Choose a valid date and start time.");
                    return;
                  }
                  if (ratingMinimum > ratingMaximum) {
                    setError(
                      "The minimum rating cannot exceed the maximum rating.",
                    );
                    return;
                  }
                  const costMinor =
                    costMode === "free"
                      ? 0
                      : Math.round(Number(costDollars) * 100);
                  if (
                    !Number.isSafeInteger(costMinor) ||
                    (costMode !== "free" && costMinor < 50)
                  ) {
                    setError(
                      "Enter a valid per-player amount of at least $0.50.",
                    );
                    return;
                  }
                  startTransition(async () => {
                    const result = await createPickupAction({
                      title,
                      startsAt,
                      endsAt,
                      venueName,
                      capacity,
                      format,
                      note: note.trim() || undefined,
                      visibility,
                      costMinor,
                      currency: "USD",
                      recordMatches,
                      ratingMinimum,
                      ratingMaximum,
                      idempotencyKey: crypto.randomUUID(),
                    });
                    if (result.ok) {
                      setCreatedSlug(result.event.slug);
                    } else {
                      setError(result.error);
                    }
                  });
                }}
              >
                {isPending ? "Publishing…" : "Publish pickup"}{" "}
                <Check aria-hidden size={17} />
              </button>
            )}
          </footer>
        </div>

        <aside className="pickup-preview">
          <span className="page-eyebrow">Preview</span>
          <div className="pickup-preview__art">
            <div />
            <Badge>Pickup</Badge>
          </div>
          <h2>{title || "Untitled pickup"}</h2>
          <p>
            <MapPin aria-hidden size={14} /> {venueName || "Choose a location"}
          </p>
          <div>
            <span>
              <Clock3 aria-hidden size={15} /> {date} · {time}
            </span>
            <span>
              <Users aria-hidden size={15} /> {capacity} spots
            </span>
          </div>
          <Badge tone="positive">
            {ratingMinimum.toFixed(1)}–{ratingMaximum.toFixed(1)}
          </Badge>
          <div className="pickup-preview__meta">
            <Badge>{format === "king-queen" ? "King / Queen" : format}</Badge>
            <Numeric>
              {costMode === "free"
                ? "Free"
                : `$${Number(costDollars || 0).toFixed(2)}`}
            </Numeric>
          </div>
        </aside>
      </section>
    </div>
  );
}
