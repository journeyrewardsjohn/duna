"use client";

import { Badge, Numeric } from "@duna/ui";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  Gauge,
  MapPin,
  Minus,
  Plus,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { createPickupAction } from "@/app/app/pickup/new/actions";

type PickupFormat = "2s" | "3s" | "4s" | "6s" | "king-queen";
type MatchType = "competitive" | "casual";
type GenderPreference = "open" | "mens" | "womens" | "mixed";

const FORMAT_OPTIONS: ReadonlyArray<{
  value: PickupFormat;
  label: string;
  detail: string;
  spots: number;
}> = [
  { value: "2s", label: "2v2", detail: "Beach doubles", spots: 4 },
  { value: "3s", label: "3v3", detail: "Fast triples", spots: 6 },
  { value: "4s", label: "4v4", detail: "Social fours", spots: 8 },
  { value: "6s", label: "6v6", detail: "Full court", spots: 12 },
  {
    value: "king-queen",
    label: "KOB / QOB",
    detail: "Rotating partners",
    spots: 8,
  },
];

const GENDER_OPTIONS: ReadonlyArray<{
  value: GenderPreference;
  label: string;
  detail: string;
}> = [
  {
    value: "open",
    label: "All players",
    detail: "Everyone can request a spot",
  },
  { value: "mixed", label: "CoEd", detail: "Mixed-gender teams" },
  { value: "womens", label: "Women", detail: "Women’s run" },
  { value: "mens", label: "Men", detail: "Men’s run" },
];

export function PickupForm() {
  const [step, setStep] = useState(1);
  const [createdSlug, setCreatedSlug] = useState<string>();
  const [title, setTitle] = useState("Golden Hour 4s");
  const [format, setFormat] = useState<PickupFormat>("4s");
  const [matchType, setMatchType] = useState<MatchType>("competitive");
  const [genderPreference, setGenderPreference] =
    useState<GenderPreference>("open");
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
          <h1>Host a match.</h1>
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
              <fieldset className="pickup-choice-section">
                <legend>What kind of match?</legend>
                <div className="match-style-grid">
                  <button
                    aria-pressed={matchType === "competitive"}
                    className={
                      matchType === "competitive" ? "selected" : undefined
                    }
                    onClick={() => {
                      setMatchType("competitive");
                      setRecordMatches(true);
                    }}
                    type="button"
                  >
                    <span className="choice-radio" />
                    <span className="match-style-grid__icon">
                      <Trophy aria-hidden size={22} />
                    </span>
                    <strong>Competitive</strong>
                    <small>
                      Challenge your level. Confirmed results can move your
                      SandRating.
                    </small>
                    <span className="match-style-grid__art match-style-grid__art--competitive">
                      <Gauge aria-hidden size={32} />
                    </span>
                  </button>
                  <button
                    aria-pressed={matchType === "casual"}
                    className={matchType === "casual" ? "selected" : undefined}
                    onClick={() => {
                      setMatchType("casual");
                      setRecordMatches(false);
                    }}
                    type="button"
                  >
                    <span className="choice-radio" />
                    <span className="match-style-grid__icon">
                      <Sparkles aria-hidden size={22} />
                    </span>
                    <strong>Casual</strong>
                    <small>
                      Play for fun, meet people, and leave ratings unchanged.
                    </small>
                    <span className="match-style-grid__art match-style-grid__art--casual">
                      <Users aria-hidden size={32} />
                    </span>
                  </button>
                </div>
              </fieldset>

              {matchType === "competitive" && (
                <fieldset className="pickup-choice-section pickup-level-card">
                  <legend>Who is this run for?</legend>
                  <div className="pickup-level-card__heading">
                    <span>
                      <Gauge aria-hidden size={19} />
                      SandRating range
                    </span>
                    <strong>
                      {ratingMinimum.toFixed(1)}–{ratingMaximum.toFixed(1)}
                    </strong>
                  </div>
                  <div className="pickup-level-card__sliders">
                    <label>
                      <span>Minimum {ratingMinimum.toFixed(1)}</span>
                      <input
                        aria-label="Minimum SandRating"
                        max={ratingMaximum}
                        min="1"
                        onChange={(event) =>
                          setRatingMinimum(Number(event.target.value))
                        }
                        step="0.1"
                        type="range"
                        value={ratingMinimum}
                      />
                    </label>
                    <label>
                      <span>Maximum {ratingMaximum.toFixed(1)}</span>
                      <input
                        aria-label="Maximum SandRating"
                        max="8"
                        min={ratingMinimum}
                        onChange={(event) =>
                          setRatingMaximum(Number(event.target.value))
                        }
                        step="0.1"
                        type="range"
                        value={ratingMaximum}
                      />
                    </label>
                  </div>
                  <small>
                    Players outside the range can still request access.
                  </small>
                </fieldset>
              )}

              <fieldset className="pickup-choice-section">
                <legend>Choose a format</legend>
                <div className="pickup-option-grid pickup-option-grid--formats">
                  {FORMAT_OPTIONS.map((option) => (
                    <button
                      aria-pressed={format === option.value}
                      className={
                        format === option.value ? "selected" : undefined
                      }
                      key={option.value}
                      onClick={() => {
                        setFormat(option.value);
                        setCapacity(option.spots);
                      }}
                      type="button"
                    >
                      <span className="choice-radio" />
                      <strong>{option.label}</strong>
                      <small>{option.detail}</small>
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset className="pickup-choice-section">
                <legend>Who do you want to play with?</legend>
                <div className="pickup-option-grid pickup-option-grid--gender">
                  {GENDER_OPTIONS.map((option) => (
                    <button
                      aria-pressed={genderPreference === option.value}
                      className={
                        genderPreference === option.value
                          ? "selected"
                          : undefined
                      }
                      key={option.value}
                      onClick={() => setGenderPreference(option.value)}
                      type="button"
                    >
                      <span className="choice-radio" />
                      <strong>{option.label}</strong>
                      <small>{option.detail}</small>
                    </button>
                  ))}
                </div>
              </fieldset>

              <div className="pickup-basics-row">
                <div className="field-group">
                  <label htmlFor="pickup-title">Name your run</label>
                  <input
                    id="pickup-title"
                    maxLength={80}
                    onChange={(event) => setTitle(event.target.value)}
                    value={title}
                  />
                </div>
                <div className="field-group">
                  <label>Total players</label>
                  <div className="pickup-stepper">
                    <button
                      aria-label="Remove a player"
                      disabled={capacity <= 2}
                      onClick={() => setCapacity(Math.max(2, capacity - 1))}
                      type="button"
                    >
                      <Minus aria-hidden size={16} />
                    </button>
                    <Numeric>{capacity}</Numeric>
                    <button
                      aria-label="Add a player"
                      disabled={capacity >= 40}
                      onClick={() => setCapacity(Math.min(40, capacity + 1))}
                      type="button"
                    >
                      <Plus aria-hidden size={16} />
                    </button>
                  </div>
                </div>
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
              <fieldset className="pickup-choice-section">
                <legend>How long?</legend>
                <div className="pickup-duration-options">
                  {[60, 90, 120].map((value) => (
                    <button
                      aria-pressed={durationMinutes === value}
                      className={
                        durationMinutes === value ? "selected" : undefined
                      }
                      key={value}
                      onClick={() => setDurationMinutes(value)}
                      type="button"
                    >
                      <Clock3 aria-hidden size={17} />
                      <strong>{value} min</strong>
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset className="pickup-choice-section">
                <legend>Amount per player</legend>
                <div className="pickup-cost-options">
                  {(
                    [
                      ["free", "Free", "No payment needed"],
                      ["split", "Split the court", "Each player pays a share"],
                      ["fixed", "Fixed price", "One price per player"],
                    ] as const
                  ).map(([value, label, detail]) => (
                    <button
                      aria-pressed={costMode === value}
                      className={costMode === value ? "selected" : undefined}
                      key={value}
                      onClick={() => setCostMode(value)}
                      type="button"
                    >
                      <span className="choice-radio" />
                      <strong>{label}</strong>
                      <small>{detail}</small>
                    </button>
                  ))}
                </div>
              </fieldset>
              {costMode !== "free" && (
                <div className="field-group pickup-amount-field">
                  <label htmlFor="pickup-cost-amount">
                    Amount per player (USD)
                  </label>
                  <div>
                    <span>$</span>
                    <input
                      id="pickup-cost-amount"
                      inputMode="decimal"
                      min="0.50"
                      onChange={(event) => setCostDollars(event.target.value)}
                      step="0.01"
                      type="number"
                      value={costDollars}
                    />
                  </div>
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
                type="button"
              >
                <ChevronLeft aria-hidden size={17} /> Back
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
                type="button"
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
                      matchType,
                      genderPreference,
                      note: note.trim() || undefined,
                      visibility,
                      costMinor,
                      currency: "USD",
                      recordMatches,
                      ratingMinimum:
                        matchType === "competitive" ? ratingMinimum : undefined,
                      ratingMaximum:
                        matchType === "competitive" ? ratingMaximum : undefined,
                      idempotencyKey: crypto.randomUUID(),
                    });
                    if (result.ok) {
                      setCreatedSlug(result.event.slug);
                    } else {
                      setError(result.error);
                    }
                  });
                }}
                type="button"
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
          <div className="pickup-preview__badges">
            <Badge tone={matchType === "competitive" ? "positive" : "neutral"}>
              {matchType === "competitive"
                ? `${ratingMinimum.toFixed(1)}–${ratingMaximum.toFixed(1)}`
                : "Casual"}
            </Badge>
            <Badge>
              {GENDER_OPTIONS.find(
                (option) => option.value === genderPreference,
              )?.label ?? "All players"}
            </Badge>
          </div>
          <div className="pickup-preview__meta">
            <Badge>
              {FORMAT_OPTIONS.find((option) => option.value === format)
                ?.label ?? format}
            </Badge>
            <Numeric>
              {costMode === "free"
                ? "Free"
                : `$${Number(costDollars || 0).toFixed(2)} / player`}
            </Numeric>
          </div>
        </aside>
      </section>
    </div>
  );
}
