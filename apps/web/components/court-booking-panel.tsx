"use client";

import type { CourtAvailability, CourtBookingInventory } from "@duna/api";
import type { PersonSummary } from "@duna/core";
import { formatMoney } from "@duna/core";
import { priceConsumerOrder } from "@duna/pricing";
import { Badge, Numeric } from "@duna/ui";
import {
  ArrowLeft,
  BellRing,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  CreditCard,
  MapPin,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  Waves,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  courtCheckoutStatusAction,
  createAvailabilityAlertAction,
  loadCourtAvailabilityAction,
  startCourtCheckoutAction,
} from "@/app/app/venues/[venueId]/actions";

type InvitedPlayer = {
  readonly key: string;
  readonly personId?: string;
  readonly name: string;
  readonly email?: string;
  readonly phoneE164?: string;
  readonly avatarUrl?: string;
};

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function displayDate(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

function displayTime(localDateTime: string) {
  const time = localDateTime.slice(11);
  const [hours, minutes] = time.split(":").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2020, 0, 1, hours ?? 0, minutes ?? 0)));
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function CourtBookingPanel({
  inventory,
  defaultLocalStartsAt,
  initialCheckoutSessionId,
  initialNotice,
  isDunaPlus,
  suggestedPlayers,
}: {
  readonly inventory: CourtBookingInventory;
  readonly defaultLocalStartsAt: string;
  readonly initialCheckoutSessionId?: string;
  readonly initialNotice?: string;
  readonly isDunaPlus: boolean;
  readonly suggestedPlayers: readonly PersonSummary[];
}) {
  const firstCourt =
    inventory.courts.find((court) => court.pricing) ?? inventory.courts[0];
  const firstDuration =
    firstCourt?.durationOptionsMinutes[0] ??
    firstCourt?.minimumDurationMinutes ??
    60;
  const [selectedDate, setSelectedDate] = useState(
    defaultLocalStartsAt.slice(0, 10),
  );
  const [durationMinutes, setDurationMinutes] = useState(firstDuration);
  const [availability, setAvailability] = useState<CourtAvailability>();
  const [selectedLocalStart, setSelectedLocalStart] = useState("");
  const [courtId, setCourtId] = useState("");
  const [paymentMode, setPaymentMode] = useState<"full" | "split">("full");
  const [players, setPlayers] = useState<readonly InvitedPlayer[]>([]);
  const [inviteValue, setInviteValue] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [policyScrolled, setPolicyScrolled] = useState(false);
  const [notice, setNotice] = useState(initialNotice ?? "");
  const [checkoutSessionId, setCheckoutSessionId] = useState(
    initialCheckoutSessionId,
  );
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [isPending, startTransition] = useTransition();
  const policyRef = useRef<HTMLDivElement>(null);

  const durationOptions = useMemo(
    () =>
      [
        ...new Set(
          inventory.courts.flatMap((court) => court.durationOptionsMinutes),
        ),
      ].sort((left, right) => left - right),
    [inventory.courts],
  );
  const dates = useMemo(
    () =>
      Array.from({ length: 10 }, (_, index) => addDays(selectedDate, index)),
    [selectedDate],
  );
  const uniqueStarts = useMemo(
    () =>
      [
        ...new Set(
          (availability?.slots ?? []).map((slot) => slot.localStartsAt),
        ),
      ].sort(),
    [availability],
  );
  const selectedSlots = useMemo(
    () =>
      (availability?.slots ?? []).filter(
        (slot) => slot.localStartsAt === selectedLocalStart,
      ),
    [availability, selectedLocalStart],
  );
  const selectedCourt = inventory.courts.find((court) => court.id === courtId);
  const selectedSlot = selectedSlots.find((slot) => slot.courtId === courtId);
  const policy = selectedCourt?.cancellationPolicy;

  useEffect(() => {
    let cancelled = false;
    setIsLoadingSlots(true);
    setNotice("");
    void loadCourtAvailabilityAction({
      venueId: inventory.venue.id,
      date: selectedDate,
      durationMinutes,
    }).then((response) => {
      if (cancelled) return;
      setIsLoadingSlots(false);
      if (!response.ok) {
        setAvailability(undefined);
        setNotice(response.error);
        return;
      }
      setAvailability(response.availability);
      const first = response.availability.slots[0];
      setSelectedLocalStart(first?.localStartsAt ?? "");
      setCourtId(first?.courtId ?? "");
    });
    return () => {
      cancelled = true;
    };
  }, [durationMinutes, inventory.venue.id, selectedDate]);

  useEffect(() => {
    if (!selectedSlots.some((slot) => slot.courtId === courtId)) {
      setCourtId(selectedSlots[0]?.courtId ?? "");
    }
  }, [courtId, selectedSlots]);

  useEffect(() => {
    if (!checkoutSessionId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      const response = await courtCheckoutStatusAction(checkoutSessionId);
      if (cancelled) return;
      if (!response.ok) {
        setNotice(response.error);
        return;
      }
      if (response.status.complete) {
        setNotice("Payment received. Your court is confirmed.");
        setReviewOpen(false);
        return;
      }
      if (response.status.awaitingParticipants) {
        setNotice(
          "Your share is paid. The court stays reserved while the invited players finish their shares.",
        );
        setReviewOpen(false);
        return;
      }
      setNotice("Payment received by Stripe. Confirming your reservation…");
      timer = setTimeout(check, 1_500);
    };
    void check();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [checkoutSessionId]);

  useEffect(() => {
    if (!reviewOpen || !policy?.requireFullScroll) return;
    const element = policyRef.current;
    if (element && element.scrollHeight <= element.clientHeight + 2) {
      setPolicyScrolled(true);
    }
  }, [policy?.requireFullScroll, reviewOpen]);

  const estimate = useMemo(() => {
    if (!selectedCourt?.pricing) return undefined;
    const unitAmount =
      selectedCourt.pricing.nonMemberAmountMinor ??
      selectedCourt.pricing.baseAmountMinor;
    const subtotalMinor = Math.max(
      unitAmount === 0 ? 0 : 1,
      Math.round(
        (unitAmount * durationMinutes) / selectedCourt.pricing.rateUnitMinutes,
      ),
    );
    return priceConsumerOrder({
      currency: selectedCourt.pricing.currency,
      isDunaPlus,
      items: [
        {
          id: selectedCourt.id,
          kind: "booking",
          description: selectedCourt.name,
          quantity: 1,
          unitAmountMinor: subtotalMinor,
        },
      ],
    });
  }, [durationMinutes, isDunaPlus, selectedCourt]);

  const addSuggestedPlayer = (person: PersonSummary) => {
    if (players.some((player) => player.personId === person.id)) return;
    setPlayers((current) => [
      ...current,
      {
        key: person.id,
        personId: person.id,
        name: person.displayName,
        avatarUrl: person.avatarUrl,
      },
    ]);
  };

  const addManualPlayer = () => {
    const value = inviteValue.trim();
    if (!value) return;
    const email = value.includes("@") ? value.toLowerCase() : undefined;
    const phoneE164 = /^\+[1-9]\d{7,14}$/.test(value) ? value : undefined;
    if (!email && !phoneE164) {
      setNotice(
        "Enter an email or an international phone number such as +17045550123.",
      );
      return;
    }
    if (
      players.some(
        (player) => player.email === email || player.phoneE164 === phoneE164,
      )
    ) {
      setInviteValue("");
      return;
    }
    setPlayers((current) => [
      ...current,
      {
        key: crypto.randomUUID(),
        name: email ?? phoneE164 ?? "Invited player",
        email,
        phoneE164,
      },
    ]);
    setInviteValue("");
    setNotice("");
  };

  const selectStart = (localStartsAt: string) => {
    setSelectedLocalStart(localStartsAt);
    const court = availability?.slots.find(
      (slot) => slot.localStartsAt === localStartsAt,
    );
    setCourtId(court?.courtId ?? "");
  };

  const createAlert = () => {
    startTransition(async () => {
      const response = await createAvailabilityAlertAction({
        venueId: inventory.venue.id,
        courtId: courtId || undefined,
        targetDate: selectedDate,
        durationMinutes,
      });
      if (!response.ok) {
        setNotice(response.error);
        return;
      }
      setNotice(
        response.result.premiumRequired
          ? "Your free priority alert is already active. Duna+ unlocks unlimited alerts."
          : response.result.created
            ? "Priority alert created. We’ll notify you when a matching court opens."
            : "You already have this priority alert.",
      );
    });
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedCourt || !selectedSlot || !estimate) {
      setNotice("Choose an available time and court first.");
      return;
    }
    if (paymentMode === "split" && players.length === 0) {
      setNotice("Add at least one player when everyone is paying their part.");
      return;
    }
    if (!policyAccepted) {
      setNotice("Read and accept the cancellation policy to continue.");
      return;
    }
    setNotice("");
    startTransition(async () => {
      const response = await startCourtCheckoutAction({
        venueId: inventory.venue.id,
        courtId: selectedCourt.id,
        localStartsAt: selectedSlot.localStartsAt,
        durationMinutes,
        paymentMode,
        participants: players.map((player) => ({
          personId: player.personId,
          name: player.name,
          email: player.email,
          phoneE164: player.phoneE164,
        })),
        policyAccepted,
        policyFullScrollConfirmed: !policy?.requireFullScroll || policyScrolled,
        idempotencyKey: crypto.randomUUID(),
      });
      if (!response.ok) {
        setNotice(response.error);
        return;
      }
      if (response.result.mode === "unavailable") {
        setNotice(
          "That start was just taken. The schedule has been refreshed.",
        );
        setReviewOpen(false);
        return;
      }
      if (response.result.mode === "stripe" && response.result.checkoutUrl) {
        setCheckoutSessionId(response.result.checkoutSessionId);
        window.location.assign(response.result.checkoutUrl);
        return;
      }
      setNotice("Your court is confirmed.");
      setReviewOpen(false);
    });
  };

  const splitCount = players.length + 1;
  const splitShare = estimate
    ? Math.floor(estimate.totalMinor / splitCount)
    : 0;

  return (
    <>
      <header
        className="court-booking-hero court-booking-hero--visual"
        style={
          inventory.venue.heroImageTreatmentUrl || inventory.venue.heroImageUrl
            ? {
                backgroundImage: `linear-gradient(90deg, rgba(8, 26, 43, .88), rgba(8, 26, 43, .28)), url(${inventory.venue.heroImageTreatmentUrl ?? inventory.venue.heroImageUrl})`,
              }
            : undefined
        }
      >
        <div>
          <Link href="/app/discover">
            <ArrowLeft aria-hidden size={15} /> Back to discover
          </Link>
          <span className="page-eyebrow">Venue booking</span>
          <h1>{inventory.venue.name}</h1>
          <p>
            <MapPin aria-hidden size={15} /> {inventory.venue.city},{" "}
            {inventory.venue.region} · {inventory.venue.organizationName}
          </p>
          {inventory.venue.description && (
            <p className="court-booking-hero__description">
              {inventory.venue.description}
            </p>
          )}
        </div>
        <div className="court-booking-hero__mark" aria-hidden>
          <Waves size={30} />
          <Numeric>{inventory.courts.length}</Numeric>
          <small>courts</small>
        </div>
      </header>

      <nav className="venue-booking-tabs" aria-label="Venue">
        <span>Home</span>
        <strong>Book</strong>
        <Link href="/app/discover?kind=pickup">Open matches</Link>
        <Link href="/app/discover">Events</Link>
      </nav>

      <section className="venue-booking-shell">
        <header className="venue-booking-heading">
          <div>
            <span className="page-eyebrow">Find your court</span>
            <h2>Pick a day, a length, and an open start.</h2>
          </div>
          <Badge>{inventory.venue.timezone}</Badge>
        </header>

        <div className="venue-date-strip">
          {dates.map((date) => (
            <button
              type="button"
              className={date === selectedDate ? "selected" : undefined}
              key={date}
              onClick={() => setSelectedDate(date)}
            >
              <span>{displayDate(date).split(",")[0]}</span>
              <strong>{date.slice(-2)}</strong>
              <small>{displayDate(date).split(",")[1]}</small>
            </button>
          ))}
        </div>

        <div className="venue-duration-row" aria-label="Rental length">
          {durationOptions.map((minutes) => (
            <button
              type="button"
              className={minutes === durationMinutes ? "selected" : undefined}
              key={minutes}
              onClick={() => setDurationMinutes(minutes)}
            >
              {minutes} min
            </button>
          ))}
        </div>

        <div className="venue-time-grid" aria-busy={isLoadingSlots}>
          {isLoadingSlots &&
            Array.from({ length: 10 }, (_, index) => (
              <span className="venue-time-skeleton" key={index} />
            ))}
          {!isLoadingSlots &&
            uniqueStarts.map((localStartsAt) => (
              <button
                type="button"
                className={
                  localStartsAt === selectedLocalStart ? "selected" : undefined
                }
                key={localStartsAt}
                onClick={() => selectStart(localStartsAt)}
              >
                {displayTime(localStartsAt)}
              </button>
            ))}
        </div>

        {!isLoadingSlots && uniqueStarts.length === 0 && (
          <div className="venue-no-slots">
            <CalendarDays aria-hidden size={22} />
            <div>
              <strong>No matching court is open yet.</strong>
              <p>
                Create a priority alert and we’ll watch cancellations for you.
              </p>
            </div>
          </div>
        )}

        <div className="venue-court-list">
          <header>
            <div>
              <span className="page-eyebrow">Reserve a court</span>
              <h3>
                {selectedLocalStart
                  ? `${displayTime(selectedLocalStart)} starts`
                  : "Choose an open start"}
              </h3>
            </div>
            <button
              type="button"
              className="venue-priority-alert"
              onClick={createAlert}
              disabled={isPending}
            >
              <BellRing aria-hidden size={16} /> Priority alert
            </button>
          </header>
          {selectedSlots.map((slot) => {
            const court = inventory.courts.find(
              (candidate) => candidate.id === slot.courtId,
            );
            if (!court) return null;
            return (
              <button
                type="button"
                className={court.id === courtId ? "selected" : undefined}
                key={court.id}
                onClick={() => setCourtId(court.id)}
              >
                <span>
                  <strong>{court.name}</strong>
                  <small>
                    {court.surface} · {court.lit ? "Lit" : "Natural light"} · up
                    to {court.capacity}
                  </small>
                </span>
                <span>
                  <Numeric>
                    {slot.price
                      ? formatMoney(slot.price.amountMinor, slot.price.currency)
                      : "Not on sale"}
                  </Numeric>
                  <ChevronRight aria-hidden size={17} />
                </span>
              </button>
            );
          })}
        </div>

        {selectedCourt && selectedSlot && !estimate && (
          <p className="court-booking-notice" role="status">
            This court is not on sale yet. The venue needs to publish a rate
            plan before checkout opens.
          </p>
        )}

        {notice && (
          <p className="court-booking-notice" role="status" aria-live="polite">
            {notice}
          </p>
        )}

        <button
          type="button"
          className="primary-action venue-review-button"
          disabled={!selectedCourt || !selectedSlot || !estimate}
          onClick={() => {
            setReviewOpen(true);
            setPolicyAccepted(false);
            setPolicyScrolled(!policy?.requireFullScroll);
          }}
        >
          {estimate
            ? `Review ${selectedCourt?.name ?? "booking"} · ${formatMoney(
                estimate.totalMinor,
                estimate.currency,
              )}`
            : "Pricing pending"}
        </button>
      </section>

      {reviewOpen && selectedCourt && selectedSlot && estimate && (
        <div className="booking-review-backdrop" role="presentation">
          <form
            className="booking-review-sheet"
            aria-label="Review court reservation"
            onSubmit={submit}
          >
            <header>
              <div>
                <span className="page-eyebrow">Review</span>
                <h2>Your reservation</h2>
              </div>
              <button
                type="button"
                aria-label="Close review"
                onClick={() => setReviewOpen(false)}
              >
                <X aria-hidden size={22} />
              </button>
            </header>

            <section className="booking-review-reservation">
              <div>
                <strong>
                  {displayDate(selectedDate)} ·{" "}
                  {displayTime(selectedLocalStart)}
                </strong>
                <span>
                  {inventory.venue.name} · {selectedCourt.name}
                </span>
                <small>
                  {selectedCourt.surface} · {durationMinutes} minutes
                </small>
              </div>
              <div>
                <Clock3 aria-hidden size={18} />
                <Numeric>{durationMinutes}</Numeric>
                <small>minutes</small>
              </div>
            </section>

            <section className="booking-payment-choice">
              <button
                type="button"
                className={paymentMode === "full" ? "selected" : undefined}
                onClick={() => setPaymentMode("full")}
              >
                <span className="booking-choice-radio" />
                <CreditCard aria-hidden size={21} />
                <span>
                  <strong>Pay everything</strong>
                  <small>You cover the full court now.</small>
                </span>
                <Numeric>
                  {formatMoney(estimate.totalMinor, estimate.currency)}
                </Numeric>
              </button>
              <button
                type="button"
                className={paymentMode === "split" ? "selected" : undefined}
                onClick={() => setPaymentMode("split")}
              >
                <span className="booking-choice-radio" />
                <Users aria-hidden size={21} />
                <span>
                  <strong>Pay your part</strong>
                  <small>Everyone gets a secure payment link.</small>
                </span>
                <Numeric>
                  {formatMoney(
                    splitShare +
                      (estimate.totalMinor - splitShare * splitCount),
                    estimate.currency,
                  )}
                </Numeric>
              </button>
            </section>

            {paymentMode === "split" && (
              <section className="booking-player-picker">
                <header>
                  <div>
                    <span className="page-eyebrow">Players</span>
                    <h3>Add everyone sharing the court.</h3>
                  </div>
                  <Badge>{players.length + 1} paying</Badge>
                </header>
                <div className="booking-selected-players">
                  <span className="booking-player-avatar organizer">You</span>
                  {players.map((player) => (
                    <span className="booking-player-chip" key={player.key}>
                      <span className="booking-player-avatar">
                        {player.avatarUrl ? (
                          <img src={player.avatarUrl} alt="" />
                        ) : (
                          initials(player.name)
                        )}
                      </span>
                      <span>{player.name}</span>
                      <button
                        type="button"
                        aria-label={`Remove ${player.name}`}
                        onClick={() =>
                          setPlayers((current) =>
                            current.filter(
                              (candidate) => candidate.key !== player.key,
                            ),
                          )
                        }
                      >
                        <X aria-hidden size={13} />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="booking-player-search">
                  <Search aria-hidden size={17} />
                  <input
                    value={inviteValue}
                    onChange={(event) => setInviteValue(event.target.value)}
                    placeholder="Email or +1 phone number"
                  />
                  <button type="button" onClick={addManualPlayer}>
                    <Plus aria-hidden size={15} /> Invite
                  </button>
                </div>
                <div className="booking-player-suggestions">
                  {suggestedPlayers
                    .filter(
                      (person) =>
                        !players.some(
                          (player) => player.personId === person.id,
                        ),
                    )
                    .slice(0, 8)
                    .map((person) => (
                      <button
                        type="button"
                        key={person.id}
                        onClick={() => addSuggestedPlayer(person)}
                      >
                        <span className="booking-player-avatar">
                          {person.avatarUrl ? (
                            <img src={person.avatarUrl} alt="" />
                          ) : (
                            person.initials
                          )}
                        </span>
                        <span>
                          <strong>{person.displayName}</strong>
                          <small>
                            SandRating {person.rating.display.toFixed(2)}
                          </small>
                        </span>
                        <Plus aria-hidden size={16} />
                      </button>
                    ))}
                </div>
              </section>
            )}

            <section className="booking-policy-card">
              <header>
                <ShieldCheck aria-hidden size={20} />
                <div>
                  <strong>{policy?.title ?? "Cancellation policy"}</strong>
                  <small>
                    {policy?.refundBeforeHours !== undefined
                      ? `Refundable until ${policy.refundBeforeHours} hours before start`
                      : "Venue terms apply"}
                  </small>
                </div>
              </header>
              <div
                ref={policyRef}
                className="booking-policy-scroll"
                tabIndex={0}
                onScroll={(event) => {
                  const element = event.currentTarget;
                  if (
                    element.scrollTop + element.clientHeight >=
                    element.scrollHeight - 4
                  ) {
                    setPolicyScrolled(true);
                  }
                }}
              >
                <p>{policy?.markdown}</p>
                {policy?.lateCancellation && (
                  <p>
                    <strong>Inside the cancellation window:</strong>{" "}
                    {policy.lateCancellation}
                  </p>
                )}
                <small>End of policy</small>
              </div>
              <label>
                <input
                  type="checkbox"
                  checked={policyAccepted}
                  disabled={Boolean(
                    policy?.requireFullScroll && !policyScrolled,
                  )}
                  onChange={(event) => setPolicyAccepted(event.target.checked)}
                />
                <span>
                  I have read and accept this cancellation policy.
                  {policy?.requireFullScroll && !policyScrolled && (
                    <small> Scroll through the policy to continue.</small>
                  )}
                </span>
              </label>
            </section>

            <section className="booking-total-card">
              <span>
                <small>
                  {paymentMode === "split"
                    ? `Your share today · ${splitCount} players`
                    : "Total today"}
                </small>
                <strong>
                  {paymentMode === "split"
                    ? formatMoney(
                        splitShare +
                          (estimate.totalMinor - splitShare * splitCount),
                        estimate.currency,
                      )
                    : formatMoney(estimate.totalMinor, estimate.currency)}
                </strong>
              </span>
              {isDunaPlus && (
                <Badge tone="positive">
                  <Sparkles aria-hidden size={13} /> Duna+ fee waived
                </Badge>
              )}
            </section>

            {notice && (
              <p
                className="court-booking-notice"
                role="status"
                aria-live="polite"
              >
                {notice}
              </p>
            )}

            <button
              className="primary-action booking-review-submit"
              type="submit"
              disabled={
                isPending ||
                !policyAccepted ||
                (paymentMode === "split" && players.length === 0) ||
                !inventory.venue.paymentsReady
              }
            >
              {isPending ? (
                "Holding your court…"
              ) : (
                <>
                  <Check aria-hidden size={17} /> Continue to secure payment
                </>
              )}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
