"use client";

import type { PersonSummary } from "@duna/core";
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
  Search,
  Sparkles,
  Trophy,
  UserCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  createPickupAction,
  searchPickupPlayersAction,
} from "@/app/app/pickup/new/actions";
import { CalendarDatePicker } from "./calendar-date-picker";
import { PlaceSearch, type PlaceDetails } from "./place-search";

type PickupFormat = "2s" | "3s" | "4s" | "6s" | "king-queen";
type MatchType = "competitive" | "casual";
type GenderPreference = "open" | "mens" | "womens" | "mixed";

interface PickupPlayerOption {
  readonly id: string;
  readonly displayName: string;
  readonly handle: string;
  readonly publicPath?: string;
  readonly avatarUrl?: string;
  readonly homeMarket: string;
  readonly ratingDisplay?: number;
  readonly isProfessional?: boolean;
}

function playerOption(player: PersonSummary): PickupPlayerOption {
  return {
    id: player.id,
    displayName: player.displayName,
    handle: player.handle,
    publicPath: player.publicPath,
    avatarUrl: player.avatarUrl,
    homeMarket: player.homeMarket,
    ratingDisplay: player.rating.display,
    isProfessional: player.isProfessional,
  };
}

function displayVenueLocalDateTime(value: string): string {
  const [datePart = "", timePart = ""] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(
    new Date(
      Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1, hour ?? 0, minute ?? 0),
    ),
  );
}

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

export function PickupForm({
  hostPersonId,
  initialPlayers,
  initialCourtBooking,
}: {
  readonly hostPersonId: string;
  readonly initialPlayers: readonly PersonSummary[];
  readonly initialCourtBooking?: {
    readonly id: string;
    readonly venueId?: string;
    readonly venueName: string;
    readonly startsAt: string;
    readonly endsAt: string;
    readonly localStartsAt: string;
  };
}) {
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
  const [venueName, setVenueName] = useState(
    initialCourtBooking?.venueName ?? "Hermosa Beach — Pier Courts",
  );
  const [venueId, setVenueId] = useState(initialCourtBooking?.venueId);
  const [courtBookingId] = useState(initialCourtBooking?.id);
  const [address, setAddress] = useState<string>();
  const [googlePlaceId, setGooglePlaceId] = useState<string>();
  const [latitude, setLatitude] = useState<number>();
  const [longitude, setLongitude] = useState<number>();
  const [date, setDate] = useState(() => {
    if (initialCourtBooking)
      return initialCourtBooking.localStartsAt.slice(0, 10);
    const instant = new Date(Date.now() + 24 * 60 * 60_000);
    return new Date(instant.getTime() - instant.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 10);
  });
  const [time, setTime] = useState(() => {
    if (!initialCourtBooking) return "18:00";
    return initialCourtBooking.localStartsAt.slice(11, 16);
  });
  const [durationMinutes, setDurationMinutes] = useState(() =>
    initialCourtBooking
      ? Math.round(
          (Date.parse(initialCourtBooking.endsAt) -
            Date.parse(initialCourtBooking.startsAt)) /
            60_000,
        )
      : 90,
  );
  const [visibility, setVisibility] = useState<"public" | "unlisted">("public");
  const [note, setNote] = useState(
    "Good energy, competitive games, easy rotation. Bring your own water.",
  );
  const [recordMatches, setRecordMatches] = useState(true);
  const [approvalRequired, setApprovalRequired] = useState(false);
  const [waitlistEnabled, setWaitlistEnabled] = useState(true);
  const [allowLateCancellation, setAllowLateCancellation] = useState(false);
  const [minimumNoticeMinutes, setMinimumNoticeMinutes] = useState(60);
  const [autoCancelLowAttendance, setAutoCancelLowAttendance] = useState(false);
  const [minimumAttendance, setMinimumAttendance] = useState(4);
  const [playerSearch, setPlayerSearch] = useState("");
  const [playerResults, setPlayerResults] = useState<
    readonly PickupPlayerOption[]
  >(() => initialPlayers.map(playerOption));
  const [selectedPlayers, setSelectedPlayers] = useState<
    readonly PickupPlayerOption[]
  >([]);
  const [searchingPlayers, setSearchingPlayers] = useState(false);
  const [error, setError] = useState<string>();
  const [isPending, startTransition] = useTransition();
  const minimumDate = useMemo(() => new Date().toISOString().slice(0, 10), []);
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

  useEffect(() => {
    const normalized = playerSearch.trim();
    if (normalized.length < 2) {
      setPlayerResults(initialPlayers.map(playerOption));
      setSearchingPlayers(false);
      return;
    }
    let active = true;
    setSearchingPlayers(true);
    const timeout = window.setTimeout(() => {
      void searchPickupPlayersAction(normalized).then((results) => {
        if (!active) return;
        setPlayerResults(
          results
            .filter((player) => player.id !== hostPersonId)
            .map((player) => ({
              id: player.id,
              displayName: player.displayName,
              handle: player.handle,
              publicPath: player.publicPath,
              avatarUrl: player.avatarUrl ?? undefined,
              homeMarket: player.homeMarket ?? "Duna player",
              ratingDisplay: player.sandRating ?? undefined,
              isProfessional: player.isProfessional,
            })),
        );
        setSearchingPlayers(false);
      });
    }, 280);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [hostPersonId, initialPlayers, playerSearch]);

  useEffect(() => {
    setSelectedPlayers((players) =>
      players.slice(0, Math.max(0, capacity - 1)),
    );
  }, [capacity]);

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
                      Challenge your level. Confirmed results can move your Sand
                      Rating.
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
                      Sand Rating range
                    </span>
                    <strong>
                      {ratingMinimum.toFixed(1)}–{ratingMaximum.toFixed(1)}
                    </strong>
                  </div>
                  <div className="pickup-level-card__sliders">
                    <label>
                      <span>Minimum {ratingMinimum.toFixed(1)}</span>
                      <input
                        aria-label="Minimum Sand Rating"
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
                        aria-label="Maximum Sand Rating"
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
              {initialCourtBooking ? (
                <section className="pickup-reserved-court">
                  <span>
                    <Check aria-hidden size={22} />
                  </span>
                  <div>
                    <small>COURT RESERVED</small>
                    <h3>{initialCourtBooking.venueName}</h3>
                    <p>
                      {displayVenueLocalDateTime(
                        initialCourtBooking.localStartsAt,
                      )}{" "}
                      · {durationMinutes} minutes
                    </p>
                    <small>
                      This match stays attached to your confirmed court.
                    </small>
                  </div>
                </section>
              ) : (
                <>
                  <div className="field-group">
                    <label htmlFor="pickup-venue">Where</label>
                    <PlaceSearch
                      id="pickup-venue"
                      onPlace={(details: PlaceDetails) => {
                        setVenueId(undefined);
                        setGooglePlaceId(details.placeId);
                        setAddress(details.address);
                        setLatitude(details.latitude);
                        setLongitude(details.longitude);
                        if (details.name) setVenueName(details.name);
                      }}
                      onValue={(value) => {
                        setVenueId(undefined);
                        setVenueName(value);
                        if (value !== address) {
                          setGooglePlaceId(undefined);
                          setLatitude(undefined);
                          setLongitude(undefined);
                        }
                      }}
                      value={venueName}
                    />
                    <small>
                      {googlePlaceId
                        ? "Confirmed with Google Places."
                        : "Custom locations are shown as approximate until confirmed."}
                    </small>
                  </div>
                  <fieldset className="pickup-choice-section pickup-date-section">
                    <legend>When do you want to play?</legend>
                    <CalendarDatePicker
                      calendarTitle="When do you want to play?"
                      minDate={minimumDate}
                      onChange={setDate}
                      value={date}
                    />
                  </fieldset>
                  <div className="form-grid pickup-time-row">
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
                </>
              )}
              <fieldset className="pickup-choice-section">
                <legend>Cost to join</legend>
                <div className="pickup-cost-options">
                  <button aria-pressed className="selected" type="button">
                    <span className="choice-radio" />
                    <strong>Free in Duna</strong>
                    <small>
                      Court payment is handled through the connected Duna venue
                      reservation, never as a separate match fee.
                    </small>
                  </button>
                </div>
              </fieldset>
            </>
          )}

          {step === 3 && (
            <>
              <section className="pickup-player-picker">
                <header>
                  <span>
                    <UserCheck aria-hidden size={20} />
                    <strong>Add players now</strong>
                  </span>
                  <Badge tone={selectedPlayers.length ? "positive" : "neutral"}>
                    {selectedPlayers.length + 1} of {capacity}
                  </Badge>
                </header>
                <p>
                  Search Duna profiles, open a player card, and add confirmed
                  players before publishing. You can leave every remaining spot
                  available.
                </p>
                {selectedPlayers.length > 0 && (
                  <div className="pickup-player-picker__selected">
                    {selectedPlayers.map((player) => (
                      <article key={player.id}>
                        <span className="avatar">
                          {player.avatarUrl ? (
                            <img alt="" src={player.avatarUrl} />
                          ) : (
                            player.displayName
                              .split(/\s+/)
                              .map((part) => part[0])
                              .join("")
                              .slice(0, 2)
                          )}
                        </span>
                        <span>
                          <strong>{player.displayName}</strong>
                          <small>Confirmed when this match is published</small>
                        </span>
                        <button
                          aria-label={`Remove ${player.displayName}`}
                          onClick={() =>
                            setSelectedPlayers((players) =>
                              players.filter((item) => item.id !== player.id),
                            )
                          }
                          type="button"
                        >
                          <Minus aria-hidden size={16} />
                        </button>
                      </article>
                    ))}
                  </div>
                )}
                <label className="pickup-player-picker__search">
                  <Search aria-hidden size={19} />
                  <input
                    aria-label="Search Duna player profiles"
                    onChange={(event) => setPlayerSearch(event.target.value)}
                    placeholder="Search player name or @handle"
                    value={playerSearch}
                  />
                  {searchingPlayers && <small>Searching…</small>}
                </label>
                <div className="pickup-player-picker__results">
                  {playerResults.slice(0, 8).map((player) => {
                    const selected = selectedPlayers.some(
                      (item) => item.id === player.id,
                    );
                    const canAdd = selectedPlayers.length < capacity - 1;
                    return (
                      <article key={player.id}>
                        <span className="avatar">
                          {player.avatarUrl ? (
                            <img alt="" src={player.avatarUrl} />
                          ) : (
                            player.displayName
                              .split(/\s+/)
                              .map((part) => part[0])
                              .join("")
                              .slice(0, 2)
                          )}
                        </span>
                        <span className="pickup-player-picker__identity">
                          <span>
                            <strong>{player.displayName}</strong>
                            {player.isProfessional && (
                              <Badge tone="positive">Pro</Badge>
                            )}
                          </span>
                          <small>
                            @{player.handle} · {player.homeMarket}
                          </small>
                        </span>
                        {player.ratingDisplay !== undefined && (
                          <Numeric tier="chip">
                            {player.ratingDisplay.toFixed(2)}
                          </Numeric>
                        )}
                        <Link
                          aria-label={`View ${player.displayName}'s profile`}
                          href={
                            player.publicPath ?? `/players/${player.handle}`
                          }
                          target="_blank"
                        >
                          Profile
                        </Link>
                        <button
                          className={selected ? "selected" : undefined}
                          disabled={!selected && !canAdd}
                          onClick={() =>
                            setSelectedPlayers((players) =>
                              selected
                                ? players.filter(
                                    (item) => item.id !== player.id,
                                  )
                                : [...players, player],
                            )
                          }
                          type="button"
                        >
                          {selected ? (
                            <>
                              <Check aria-hidden size={15} /> Added
                            </>
                          ) : (
                            <>
                              <Plus aria-hidden size={15} /> Add
                            </>
                          )}
                        </button>
                      </article>
                    );
                  })}
                  {!searchingPlayers && playerResults.length === 0 && (
                    <p>No public Duna profile matches that search.</p>
                  )}
                </div>
              </section>
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
              <label className="toggle-row">
                <span>
                  <strong>Require approval to join</strong>
                  <small>
                    Players request a spot first. Nobody is charged until you
                    approve them.
                  </small>
                </span>
                <input
                  checked={approvalRequired}
                  onChange={(event) =>
                    setApprovalRequired(event.target.checked)
                  }
                  type="checkbox"
                />
              </label>
              <section className="pickup-smart-rules">
                <header>
                  <span>
                    <UserCheck aria-hidden size={19} />
                    <strong>Smart rules</strong>
                  </span>
                  <small>Simple controls. Duna handles the edge cases.</small>
                </header>
                <label>
                  <span>
                    <strong>Enable waitlist</strong>
                    <small>Keep demand when the match fills.</small>
                  </span>
                  <input
                    checked={waitlistEnabled}
                    onChange={(event) =>
                      setWaitlistEnabled(event.target.checked)
                    }
                    type="checkbox"
                  />
                </label>
                <label>
                  <span>
                    <strong>Allow late cancellations</strong>
                    <small>
                      Players can still leave inside the notice window.
                    </small>
                  </span>
                  <input
                    checked={allowLateCancellation}
                    onChange={(event) =>
                      setAllowLateCancellation(event.target.checked)
                    }
                    type="checkbox"
                  />
                </label>
                <label>
                  <span>
                    <strong>Cancellation notice</strong>
                    <small>Minimum notice before the start.</small>
                  </span>
                  <select
                    onChange={(event) =>
                      setMinimumNoticeMinutes(Number(event.target.value))
                    }
                    value={minimumNoticeMinutes}
                  >
                    <option value={0}>Any time</option>
                    <option value={60}>1 hour</option>
                    <option value={360}>6 hours</option>
                    <option value={720}>12 hours</option>
                    <option value={1440}>24 hours</option>
                  </select>
                </label>
                <label>
                  <span>
                    <strong>Auto-cancel if underbooked</strong>
                    <small>Protect everyone from an unplayable run.</small>
                  </span>
                  <input
                    checked={autoCancelLowAttendance}
                    onChange={(event) =>
                      setAutoCancelLowAttendance(event.target.checked)
                    }
                    type="checkbox"
                  />
                </label>
                {autoCancelLowAttendance && (
                  <label>
                    <span>
                      <strong>Minimum players</strong>
                      <small>
                        Duna checks before the notice window closes.
                      </small>
                    </span>
                    <input
                      max={capacity}
                      min={2}
                      onChange={(event) =>
                        setMinimumAttendance(Number(event.target.value))
                      }
                      type="number"
                      value={minimumAttendance}
                    />
                  </label>
                )}
              </section>
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
                  startTransition(async () => {
                    const result = await createPickupAction({
                      title,
                      startsAt,
                      endsAt,
                      venueName,
                      venueId,
                      courtBookingId,
                      address,
                      googlePlaceId,
                      latitude,
                      longitude,
                      locationConfidence: googlePlaceId
                        ? "confirmed"
                        : "approximate",
                      capacity,
                      format,
                      matchType,
                      genderPreference,
                      note: note.trim() || undefined,
                      visibility,
                      approvalRequired,
                      smartRules: {
                        waitlistEnabled,
                        allowLateCancellation,
                        minimumNoticeMinutes,
                        autoCancelLowAttendance,
                        minimumAttendance: Math.min(
                          capacity,
                          Math.max(2, minimumAttendance),
                        ),
                      },
                      costMinor: 0,
                      currency: "USD",
                      recordMatches,
                      ratingMinimum:
                        matchType === "competitive" ? ratingMinimum : undefined,
                      ratingMaximum:
                        matchType === "competitive" ? ratingMaximum : undefined,
                      participantPersonIds: selectedPlayers.map(
                        (player) => player.id,
                      ),
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
            <span>Free in Duna</span>
          </div>
        </aside>
      </section>
    </div>
  );
}
