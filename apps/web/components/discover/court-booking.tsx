"use client";

import type {
  CourtAvailability,
  CourtBookingInventory,
  CourtCheckoutQuote,
} from "@duna/api";
import { formatMoney, type PersonSummary } from "@duna/core";
import { report } from "@duna/observability";
import { priceConsumerOrder } from "@duna/pricing";
import {
  Button,
  Checkbox,
  Chip,
  createIdempotencyKey,
  DatePicker,
  DayStrip,
  Icon,
  Input,
  Notice,
  Sheet,
  SheetContent,
} from "@duna/ui/tideline";
import Link from "@/components/site/site-link";
import {
  type FormEvent,
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
  quoteCourtCheckoutAction,
  startCourtCheckoutAction,
} from "./court-actions";
import { groupWords } from "./results";
import {
  BookingInvites,
  type BookingInviteSeat,
} from "../player/invite/booking-invites";

type InvitedPlayer = {
  readonly key: string;
  readonly personId?: string;
  readonly name: string;
  readonly email?: string;
  readonly phoneE164?: string;
};

function displayDate(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

function displayTime(localDateTime: string) {
  const [hours, minutes] = localDateTime.slice(11).split(":").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2020, 0, 1, hours ?? 0, minutes ?? 0)));
}

function instantTime(instant: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(instant));
}

function zoneWords(timeZone: string) {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "short",
  })
    .formatToParts(new Date())
    .find((part) => part.type === "timeZoneName")?.value;
  return name ? `Times are local (${name})` : "Times are local";
}

function fahrenheit(celsius: number) {
  return Math.round((celsius * 9) / 5 + 32);
}

export interface CourtBookingProps {
  readonly inventory: CourtBookingInventory;
  /** YYYY-MM-DDTHH:mm at the venue. */
  readonly defaultLocalStartsAt: string;
  readonly defaultDurationMinutes?: number;
  /** Signed out: browse days, times and prices, then sign in to book here. */
  readonly guest?: boolean;
  readonly bookingSubjects?: readonly PersonSummary[];
  readonly suggestedPlayers?: readonly PersonSummary[];
  readonly isDunaPlus?: boolean;
  readonly initialCheckoutSessionId?: string;
  readonly initialNotice?: string;
  readonly initialCheckoutIntent?: "host";
}

/**
 * Book a court: a day, a length and an open start, the courts free then and
 * any open match already forming at that time (in the shared group words).
 * Signed out, every choice travels through sign-in and back to this same
 * place; signed in, the review restates the court, the time, who pays what
 * and the venue's cancellation policy, and checkout holds the court with an
 * idempotency key before the person pays on the secure payment page.
 */
export function CourtBooking({
  inventory,
  defaultLocalStartsAt,
  defaultDurationMinutes,
  guest = false,
  bookingSubjects = [],
  suggestedPlayers = [],
  isDunaPlus = false,
  initialCheckoutSessionId,
  initialNotice,
  initialCheckoutIntent,
}: CourtBookingProps) {
  const venue = inventory.venue;
  const firstCourt =
    inventory.courts.find((court) => court.pricing) ?? inventory.courts[0];
  const firstDuration =
    firstCourt?.durationOptionsMinutes[0] ??
    firstCourt?.minimumDurationMinutes ??
    60;
  const durationOptions = useMemo(
    () =>
      [
        ...new Set(
          inventory.courts.flatMap((court) => court.durationOptionsMinutes),
        ),
      ].sort((left, right) => left - right),
    [inventory.courts],
  );
  const [selectedDate, setSelectedDate] = useState(
    defaultLocalStartsAt.slice(0, 10),
  );
  const [durationMinutes, setDurationMinutes] = useState(
    defaultDurationMinutes && durationOptions.includes(defaultDurationMinutes)
      ? defaultDurationMinutes
      : firstDuration,
  );
  const [availability, setAvailability] = useState<CourtAvailability>();
  const [loadFailed, setLoadFailed] = useState<string>();
  const [selectedLocalStart, setSelectedLocalStart] = useState("");
  const [courtId, setCourtId] = useState("");
  const [subjectPersonId, setSubjectPersonId] = useState(
    bookingSubjects[0]?.id ?? "",
  );
  const [paymentMode, setPaymentMode] = useState<"full" | "split">("full");
  const [players, setPlayers] = useState<readonly InvitedPlayer[]>([]);
  const [inviteValue, setInviteValue] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [intent, setIntent] = useState<"private" | "host">(
    initialCheckoutIntent ?? "private",
  );
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [policyScrolled, setPolicyScrolled] = useState(false);
  const [notice, setNotice] = useState(initialNotice ?? "");
  const [checkoutSessionId] = useState(initialCheckoutSessionId);
  const [inviteSeats, setInviteSeats] = useState<readonly BookingInviteSeat[]>(
    [],
  );
  const [inviteWhen, setInviteWhen] = useState<string>();
  const [quote, setQuote] = useState<CourtCheckoutQuote>();
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [refreshes, setRefreshes] = useState(0);
  const [isPending, startTransition] = useTransition();
  const policyRef = useRef<HTMLDivElement>(null);
  const hostReviewOpened = useRef(false);
  const idempotencyKey = useRef(createIdempotencyKey());
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const uniqueStarts = useMemo(
    () =>
      [
        ...new Set([
          ...(availability?.slots ?? []).map((slot) => slot.localStartsAt),
          ...(availability?.openMatches ?? []).map(
            (match) => match.localStartsAt,
          ),
        ]),
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
  const openMatches = useMemo(
    () =>
      (availability?.openMatches ?? []).filter(
        (match) => match.localStartsAt === selectedLocalStart,
      ),
    [availability, selectedLocalStart],
  );
  const forecastDay = availability?.forecast?.days.find(
    (day) => day.date === selectedDate,
  );
  const subject =
    bookingSubjects.find((person) => person.id === subjectPersonId) ??
    bookingSubjects[0];
  const policy = selectedCourt?.cancellationPolicy;

  useEffect(() => {
    let cancelled = false;
    setLoadingSlots(true);
    setLoadFailed(undefined);
    void loadCourtAvailabilityAction({
      venueId: venue.id,
      date: selectedDate,
      durationMinutes,
    }).then((response) => {
      if (cancelled) return;
      setLoadingSlots(false);
      if (!response.ok) {
        setAvailability(undefined);
        setLoadFailed(
          report(new Error(response.error), {
            event: "web.venue.availability_failed",
            level: "warning",
          }),
        );
        return;
      }
      setAvailability(response.availability);
      const starts = [
        ...response.availability.slots.map((slot) => slot.localStartsAt),
        ...response.availability.openMatches.map(
          (match) => match.localStartsAt,
        ),
      ].sort();
      const requested = defaultLocalStartsAt.slice(0, 16);
      const start = starts.includes(requested) ? requested : (starts[0] ?? "");
      setSelectedLocalStart(start);
      setCourtId(
        response.availability.slots.find((slot) => slot.localStartsAt === start)
          ?.courtId ?? "",
      );
    });
    return () => {
      cancelled = true;
    };
  }, [
    defaultLocalStartsAt,
    durationMinutes,
    venue.id,
    selectedDate,
    refreshes,
  ]);

  useEffect(() => {
    if (!selectedSlots.some((slot) => slot.courtId === courtId)) {
      setCourtId(selectedSlots[0]?.courtId ?? "");
    }
  }, [courtId, selectedSlots]);

  // Back from the payment page: follow the booking until it is confirmed.
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
        if (initialCheckoutIntent === "host") {
          if (!response.status.match) {
            setNotice("Payment received. Creating your match…");
            timer = setTimeout(check, 1_500);
            return;
          }
          window.location.replace(
            `/events/${encodeURIComponent(response.status.match.slug)}`,
          );
          return;
        }
        setInviteSeats(response.status.participants ?? []);
        setNotice("Payment received. Your court is confirmed.");
        return;
      }
      if (response.status.awaitingParticipants) {
        setInviteSeats(response.status.participants ?? []);
        setNotice(
          "Your share is paid. The court stays reserved while the invited players finish their shares.",
        );
        return;
      }
      setNotice("Payment received. Confirming your reservation…");
      timer = setTimeout(check, 1_500);
    };
    void check();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [checkoutSessionId, initialCheckoutIntent]);

  useEffect(() => {
    if (!reviewOpen || !policy?.requireFullScroll) return;
    const element = policyRef.current;
    if (element && element.scrollHeight <= element.clientHeight + 2) {
      setPolicyScrolled(true);
    }
  }, [policy?.requireFullScroll, reviewOpen]);

  const publicEstimate = useMemo(() => {
    if (!selectedCourt || !selectedSlot?.price) return undefined;
    return priceConsumerOrder({
      currency: selectedSlot.price.currency,
      isDunaPlus,
      items: [
        {
          id: selectedCourt.id,
          kind: "booking",
          description: selectedCourt.name,
          quantity: 1,
          unitAmountMinor: selectedSlot.price.amountMinor,
        },
      ],
    });
  }, [isDunaPlus, selectedCourt, selectedSlot?.price]);

  // Signed in, the price is the server's quote that checkout verifies.
  useEffect(() => {
    if (guest || !selectedCourt || !selectedSlot) {
      setQuote(undefined);
      setQuoteLoading(false);
      return;
    }
    let cancelled = false;
    setQuote(undefined);
    setQuoteLoading(true);
    void quoteCourtCheckoutAction({
      courtId: selectedCourt.id,
      subjectPersonId: subject?.id,
      localStartsAt: selectedSlot.localStartsAt,
      durationMinutes,
      paymentMode,
      participants: players.map((player) => ({
        personId: player.personId,
        name: player.name,
        email: player.email,
        phoneE164: player.phoneE164,
      })),
    })
      .then((response) => {
        if (cancelled) return;
        if (!response.ok) setNotice(response.error);
        else setQuote(response.result);
      })
      .finally(() => {
        if (!cancelled) setQuoteLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // The quote follows the choices, not the object identities.
  }, [
    guest,
    durationMinutes,
    paymentMode,
    players,
    selectedCourt?.id,
    selectedSlot?.courtId,
    selectedSlot?.localStartsAt,
    subject?.id,
  ]);

  const estimate = quote ?? publicEstimate;
  const priceReady = Boolean(guest || quote);
  const splitCount = players.length + 1;
  const payNowMinor =
    quote?.payNowMinor ??
    (estimate
      ? paymentMode === "split"
        ? Math.floor(estimate.totalMinor / splitCount) +
          (estimate.totalMinor % splitCount)
        : estimate.totalMinor
      : undefined);

  const openReview = (next: "private" | "host") => {
    setIntent(next);
    if (next === "host") setPaymentMode("full");
    idempotencyKey.current = createIdempotencyKey();
    setPolicyAccepted(false);
    setPolicyScrolled(!policy?.requireFullScroll);
    setReviewOpen(true);
  };

  useEffect(() => {
    if (
      initialCheckoutIntent !== "host" ||
      initialCheckoutSessionId ||
      hostReviewOpened.current ||
      !selectedSlot ||
      !estimate ||
      !priceReady ||
      guest
    ) {
      return;
    }
    hostReviewOpened.current = true;
    openReview("host");
    // Opens once, when the returning host's price is known.
  }, [priceReady, estimate, selectedSlot]);

  const returnHref = (next: "private" | "host") => {
    const query = new URLSearchParams({
      date: selectedDate,
      duration: String(durationMinutes),
    });
    if (selectedLocalStart) query.set("start", selectedLocalStart);
    if (next === "host") query.set("intent", "host");
    return `/sign-in?returnTo=${encodeURIComponent(
      `/app/venues/${venue.id}?${query.toString()}`,
    )}`;
  };

  const addPlayer = (person: PersonSummary) => {
    if (players.some((player) => player.personId === person.id)) return;
    setPlayers((current) => [
      ...current,
      { key: person.id, personId: person.id, name: person.displayName },
    ]);
  };

  const invite = () => {
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
        (player) =>
          (email && player.email === email) ||
          (phoneE164 && player.phoneE164 === phoneE164),
      )
    ) {
      setInviteValue("");
      return;
    }
    setPlayers((current) => [
      ...current,
      {
        key: createIdempotencyKey(),
        name: email ?? phoneE164 ?? "Invited player",
        email,
        phoneE164,
      },
    ]);
    setInviteValue("");
    setNotice("");
  };

  const createAlert = () => {
    startTransition(async () => {
      const response = await createAvailabilityAlertAction({
        venueId: venue.id,
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
          ? "Your free alert is already watching another court. Premium watches as many as you like."
          : response.result.created
            ? "Alert set. We’ll tell you when a court opens at this time."
            : "You already have this alert.",
      );
    });
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedCourt || !selectedSlot || !quote) {
      setNotice(
        quote
          ? "Choose an open time and a court first."
          : "We’re confirming your exact price. Try again in a moment.",
      );
      return;
    }
    if (paymentMode === "split" && players.length === 0) {
      setNotice("Add at least one player to split the court.");
      return;
    }
    if (!policyAccepted) {
      setNotice("Read and accept the cancellation policy to continue.");
      return;
    }
    setNotice("");
    startTransition(async () => {
      const response = await startCourtCheckoutAction({
        venueId: venue.id,
        courtId: selectedCourt.id,
        subjectPersonId: subject?.id,
        localStartsAt: selectedSlot.localStartsAt,
        durationMinutes,
        paymentMode,
        participants: players.map((player) => ({
          personId: player.personId,
          name: player.name,
          email: player.email,
          phoneE164: player.phoneE164,
        })),
        expectedPayNowMinor: quote.payNowMinor,
        expectedTotalMinor: quote.totalMinor,
        policyAccepted,
        policyFullScrollConfirmed: !policy?.requireFullScroll || policyScrolled,
        checkoutIntent: intent,
        idempotencyKey: idempotencyKey.current,
      });
      if (!response.ok) {
        setNotice(response.error);
        return;
      }
      if (response.result.mode === "unavailable") {
        setNotice("Someone just took that time. The times are refreshed.");
        setReviewOpen(false);
        setRefreshes((count) => count + 1);
        return;
      }
      if (response.result.mode === "stripe" && response.result.checkoutUrl) {
        window.location.assign(response.result.checkoutUrl);
        return;
      }
      if (intent === "host" && response.result.bookingId) {
        window.location.assign(
          `/app/pickup/new?courtBookingId=${encodeURIComponent(response.result.bookingId)}`,
        );
        return;
      }
      setInviteSeats(response.result.participants ?? []);
      setInviteWhen(
        `${new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: venue.timezone }).format(new Date(response.result.startsAt))} ${instantTime(response.result.startsAt, venue.timezone)}`,
      );
      setNotice("Your court is confirmed.");
      setReviewOpen(false);
    });
  };

  const days = Math.min(14, firstCourt?.maximumAdvanceDays ?? 14);
  const slotWeather = availability?.slots[0]?.weather;

  return (
    <section aria-labelledby="dv-book-title" className="vn-book" id="book">
      <div className="vn-book__head">
        <h2 className="vn-section__title" id="dv-book-title">
          Book a court
        </h2>
        <p className="site-meta">{zoneWords(venue.timezone)}</p>
      </div>
      <DayStrip
        aria-label="Day"
        count={days}
        onValueChange={(next) => {
          if (typeof next === "string") setSelectedDate(next);
        }}
        start={today}
        today={today}
        value={selectedDate}
      />
      <div className="vn-book__row">
        <DatePicker
          aria-label="Another date"
          min={today}
          onValueChange={(next) => {
            if (next) setSelectedDate(next);
          }}
          value={selectedDate}
        />
        <div aria-label="How long" className="site-choices" role="group">
          {durationOptions.map((minutes) => (
            <button
              aria-pressed={minutes === durationMinutes}
              className="site-choice"
              key={minutes}
              onClick={() => setDurationMinutes(minutes)}
              type="button"
            >
              {minutes} min
            </button>
          ))}
        </div>
      </div>

      {availability?.forecast && (slotWeather || forecastDay) ? (
        <p className="vn-book__weather">
          {slotWeather?.temperatureC !== undefined
            ? `${fahrenheit(slotWeather.temperatureC)}°F · `
            : ""}
          {slotWeather?.condition ?? forecastDay?.condition}
          {forecastDay?.sunsetAt
            ? ` · sunset ${instantTime(forecastDay.sunsetAt, availability.timezone)}`
            : ""}
        </p>
      ) : null}

      <h3 className="site-label vn-book__label" id="vn-times">
        Open starts on {displayDate(selectedDate)}
      </h3>
      <div
        aria-busy={loadingSlots || undefined}
        aria-labelledby="vn-times"
        className="vn-times"
        role="group"
      >
        {loadingSlots
          ? Array.from({ length: 8 }, (_, index) => (
              <span
                aria-hidden="true"
                className="vn-times__ghost"
                key={index}
              />
            ))
          : uniqueStarts.map((start) => {
              const forming = (availability?.openMatches ?? []).filter(
                (match) => match.localStartsAt === start,
              ).length;
              return (
                <button
                  aria-pressed={start === selectedLocalStart}
                  className="vn-time"
                  key={start}
                  onClick={() => {
                    setSelectedLocalStart(start);
                    setCourtId(
                      availability?.slots.find(
                        (slot) => slot.localStartsAt === start,
                      )?.courtId ?? "",
                    );
                  }}
                  type="button"
                >
                  <span className="vn-time__clock">{displayTime(start)}</span>
                  {forming ? (
                    <span className="vn-time__note">
                      {forming} open {forming === 1 ? "match" : "matches"}
                    </span>
                  ) : null}
                </button>
              );
            })}
      </div>
      {loadFailed ? (
        <Notice role="status" tone="warning" title="Times didn’t load">
          Choose another day, or try again in a moment. Reference {loadFailed}.
        </Notice>
      ) : null}
      {!loadingSlots && !loadFailed && uniqueStarts.length === 0 ? (
        <div className="vn-book__empty">
          <p>
            <strong>
              No court is open for {durationMinutes} minutes then.
            </strong>{" "}
            Try another day or a shorter time
            {guest ? "." : ", or set an alert and we’ll tell you if one opens."}
          </p>
          {guest ? null : (
            <Button
              loading={isPending}
              onClick={createAlert}
              size="sm"
              variant="secondary"
            >
              Tell me if a court opens
            </Button>
          )}
        </div>
      ) : null}
      {!loadingSlots && (availability?.excludedAfterDarkCount ?? 0) > 0 ? (
        <p className="site-meta">
          {availability!.excludedAfterDarkCount} after-dark{" "}
          {availability!.excludedAfterDarkCount === 1
            ? "start is"
            : "starts are"}{" "}
          hidden: those courts have no lights.
        </p>
      ) : null}

      {openMatches.length > 0 ? (
        <div className="vn-forming">
          <h3 className="site-label">
            Already forming at {displayTime(selectedLocalStart)}
          </h3>
          <ul className="vn-forming__list">
            {openMatches.map((match) => {
              const group = groupWords(
                match.spotsRemaining,
                Date.parse(match.startsAt),
                new Date(),
              );
              return (
                <li className="vn-forming__item" key={match.id}>
                  <div>
                    <p className="vn-forming__title">{match.title}</p>
                    <p className="site-meta">
                      {match.matchType === "competitive"
                        ? "Competitive"
                        : "Casual"}{" "}
                      · {match.format} · hosted by {match.host.displayName}
                      {match.ratingRange
                        ? ` · Sand Rating ${match.ratingRange[0].toFixed(1)} to ${match.ratingRange[1].toFixed(1)}`
                        : ""}
                    </p>
                  </div>
                  <div className="vn-forming__aside">
                    <span className="vn-price">
                      {match.price.amountMinor
                        ? formatMoney(
                            match.price.amountMinor,
                            match.price.currency,
                          )
                        : "Free"}
                    </span>
                    {group ? (
                      <Chip
                        kind="status"
                        tone={group.tone === "caution" ? "warning" : "neutral"}
                      >
                        {group.words}
                      </Chip>
                    ) : null}
                    <Button
                      href={`/events/${encodeURIComponent(match.slug)}`}
                      size="sm"
                      variant="secondary"
                    >
                      Join this match
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {selectedSlots.length > 0 ? (
        <fieldset className="vn-courts">
          <legend className="site-label">
            Courts free at {displayTime(selectedLocalStart)}
          </legend>
          {selectedSlots.map((slot) => {
            const court = inventory.courts.find(
              (candidate) => candidate.id === slot.courtId,
            );
            if (!court) return null;
            return (
              <label className="vn-court" key={court.id}>
                <input
                  checked={court.id === courtId}
                  className="vn-court__radio"
                  name="vn-court"
                  onChange={() => setCourtId(court.id)}
                  type="radio"
                />
                <span className="vn-court__text">
                  <span className="vn-court__name">{court.name}</span>
                  <span className="site-meta">
                    {court.surface} · {court.lit ? "Lit" : "Daylight only"} · up
                    to {court.capacity}
                  </span>
                </span>
                <span className="vn-price">
                  {slot.price
                    ? formatMoney(slot.price.amountMinor, slot.price.currency)
                    : "Not on sale"}
                </span>
              </label>
            );
          })}
        </fieldset>
      ) : null}

      {selectedCourt && selectedSlot && !estimate ? (
        <p className="site-meta" role="status">
          {quoteLoading
            ? "Confirming your exact price…"
            : "This court isn’t on sale yet: the venue hasn’t published a price."}
        </p>
      ) : null}
      {notice && !reviewOpen ? (
        <p aria-live="polite" className="vn-book__notice" role="status">
          {notice}
        </p>
      ) : null}

      {inviteSeats.length > 0 ? (
        <BookingInvites
          organizerName={subject?.displayName ?? ""}
          origin={typeof window === "undefined" ? "" : window.location.origin}
          place={venue.name}
          seats={inviteSeats}
          what="a court"
          {...(inviteWhen ? { when: inviteWhen } : {})}
        />
      ) : null}

      {selectedSlots.length > 0 ? (
        <div className="vn-book__actions">
          {guest ? (
            <>
              <Button href={returnHref("private")} variant="primary">
                {estimate
                  ? `Sign in to book · ${formatMoney(estimate.totalMinor, estimate.currency)}`
                  : "Sign in to book"}
              </Button>
              <Button href={returnHref("host")} variant="secondary">
                Sign in to start an open match
              </Button>
            </>
          ) : (
            <>
              <Button
                disabled={!selectedSlot || !estimate || !priceReady}
                onClick={() => openReview("private")}
                variant="primary"
              >
                {estimate
                  ? `Book · ${formatMoney(estimate.totalMinor, estimate.currency)}`
                  : "Price on its way"}
              </Button>
              <Button
                disabled={!selectedSlot || !estimate || !priceReady}
                onClick={() => openReview("host")}
                variant="secondary"
              >
                Start an open match
              </Button>
            </>
          )}
        </div>
      ) : null}
      {guest ? (
        <p className="site-meta">
          You’ll come back here after signing in, with this time chosen.
        </p>
      ) : null}

      <Sheet onOpenChange={setReviewOpen} open={reviewOpen}>
        <SheetContent
          className="vn-review"
          closeLabel="Close review"
          title={
            intent === "host" ? "Reserve the court, then invite" : "Your court"
          }
        >
          {selectedCourt && selectedSlot && estimate ? (
            <form onSubmit={submit}>
              <dl className="vn-review__facts">
                <div>
                  <dt>When</dt>
                  <dd>
                    {displayDate(selectedDate)} ·{" "}
                    {displayTime(selectedLocalStart)} · {durationMinutes} min
                  </dd>
                </div>
                <div>
                  <dt>Where</dt>
                  <dd>
                    {venue.name} · {selectedCourt.name} ({selectedCourt.surface}
                    )
                  </dd>
                </div>
              </dl>

              {bookingSubjects.length > 1 ? (
                <fieldset className="vn-review__group">
                  <legend className="site-label">Who is playing?</legend>
                  {bookingSubjects.map((person, at) => (
                    <label className="vn-court" key={person.id}>
                      <input
                        checked={person.id === subject?.id}
                        className="vn-court__radio"
                        name="vn-subject"
                        onChange={() => {
                          setSubjectPersonId(person.id);
                          setPlayers((current) =>
                            current.filter(
                              (player) => player.personId !== person.id,
                            ),
                          );
                        }}
                        type="radio"
                      />
                      <span className="vn-court__text">
                        <span className="vn-court__name">
                          {at === 0 ? "Me" : person.displayName}
                        </span>
                        <span className="site-meta">
                          {person.isMinor
                            ? "Junior in your household"
                            : "My profile"}
                        </span>
                      </span>
                    </label>
                  ))}
                  {subject?.isMinor ? (
                    <p className="site-meta">
                      You pay and accept the venue’s policy as{" "}
                      {subject.displayName}’s guardian.
                    </p>
                  ) : null}
                </fieldset>
              ) : null}

              {intent === "host" ? (
                <p className="vn-review__line">
                  After the court is confirmed, you set up the match with this
                  venue, time and court already filled in.
                </p>
              ) : (
                <fieldset className="vn-review__group">
                  <legend className="site-label">How you pay</legend>
                  <label className="vn-court">
                    <input
                      checked={paymentMode === "full"}
                      className="vn-court__radio"
                      name="vn-pay"
                      onChange={() => setPaymentMode("full")}
                      type="radio"
                    />
                    <span className="vn-court__text">
                      <span className="vn-court__name">Pay for the court</span>
                      <span className="site-meta">You cover it all now.</span>
                    </span>
                    <span className="vn-price">
                      {formatMoney(estimate.totalMinor, estimate.currency)}
                    </span>
                  </label>
                  <label className="vn-court">
                    <input
                      checked={paymentMode === "split"}
                      className="vn-court__radio"
                      name="vn-pay"
                      onChange={() => setPaymentMode("split")}
                      type="radio"
                    />
                    <span className="vn-court__text">
                      <span className="vn-court__name">Split it</span>
                      <span className="site-meta">
                        You pay your share, then send everyone else their link
                        from your own phone.
                      </span>
                    </span>
                    <span className="vn-price">
                      {formatMoney(
                        payNowMinor ?? estimate.totalMinor,
                        estimate.currency,
                      )}
                    </span>
                  </label>
                </fieldset>
              )}

              {intent === "private" && paymentMode === "split" ? (
                <fieldset className="vn-review__group">
                  <legend className="site-label">
                    Players sharing the court ({splitCount} paying)
                  </legend>
                  {players.length > 0 ? (
                    <ul className="vn-players">
                      {players.map((player) => (
                        <li className="vn-players__item" key={player.key}>
                          <span>{player.name}</span>
                          <button
                            aria-label={`Remove ${player.name}`}
                            className="vn-players__remove"
                            onClick={() =>
                              setPlayers((current) =>
                                current.filter(
                                  (candidate) => candidate.key !== player.key,
                                ),
                              )
                            }
                            type="button"
                          >
                            <Icon name="close" size="chip" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="vn-invite">
                    <Input
                      aria-label="Invite by email or phone"
                      onChange={(event) => setInviteValue(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          invite();
                        }
                      }}
                      placeholder="Email or +1 phone number"
                      value={inviteValue}
                    />
                    <Button onClick={invite} size="sm" variant="secondary">
                      Invite
                    </Button>
                  </div>
                  {suggestedPlayers.length > 0 ? (
                    <div
                      className="site-choices"
                      aria-label="Players you know"
                      role="group"
                    >
                      {suggestedPlayers
                        .filter(
                          (person) =>
                            person.id !== subject?.id &&
                            !players.some(
                              (player) => player.personId === person.id,
                            ),
                        )
                        .slice(0, 8)
                        .map((person) => (
                          <button
                            className="site-choice"
                            key={person.id}
                            onClick={() => addPlayer(person)}
                            type="button"
                          >
                            <Icon name="plus" size="chip" />{" "}
                            {person.displayName}
                          </button>
                        ))}
                    </div>
                  ) : null}
                </fieldset>
              ) : null}

              <section className="vn-review__group">
                <p className="site-label">
                  {policy?.title ?? "Cancellation policy"}
                  {policy?.refundBeforeHours !== undefined
                    ? ` · refundable until ${policy.refundBeforeHours} hours before`
                    : ""}
                </p>
                <div
                  className="vn-policy"
                  onScroll={(event) => {
                    const element = event.currentTarget;
                    if (
                      element.scrollTop + element.clientHeight >=
                      element.scrollHeight - 4
                    ) {
                      setPolicyScrolled(true);
                    }
                  }}
                  ref={policyRef}
                  tabIndex={0}
                >
                  <p>{policy?.markdown}</p>
                  {policy?.lateCancellation ? (
                    <p>
                      <strong>Inside the cancellation window:</strong>{" "}
                      {policy.lateCancellation}
                    </p>
                  ) : null}
                  <p className="site-meta">End of policy</p>
                </div>
                <Checkbox
                  checked={policyAccepted}
                  description={
                    policy?.requireFullScroll && !policyScrolled
                      ? "Scroll to the end of the policy first."
                      : undefined
                  }
                  disabled={Boolean(
                    policy?.requireFullScroll && !policyScrolled,
                  )}
                  label="I’ve read and accept the cancellation policy"
                  onCheckedChange={(checked) =>
                    setPolicyAccepted(checked === true)
                  }
                />
              </section>

              <div className="vn-review__total">
                <span className="site-meta">
                  {paymentMode === "split"
                    ? `Your share today · ${splitCount} players`
                    : "Total today"}
                </span>
                <strong className="vn-review__amount">
                  {formatMoney(
                    paymentMode === "split"
                      ? (payNowMinor ?? estimate.totalMinor)
                      : estimate.totalMinor,
                    estimate.currency,
                  )}
                </strong>
                {quote ? (
                  <span className="site-meta">
                    {quote.ratePlanName}
                    {quote.dunaPlusApplied ? " · Premium: no service fee" : ""}
                  </span>
                ) : (
                  <span className="site-meta" role="status">
                    {quoteLoading
                      ? "Updating your exact price…"
                      : "We couldn’t confirm your exact price yet."}
                  </span>
                )}
              </div>
              {!venue.paymentsReady ? (
                <Notice tone="info" title="Payments aren’t open here yet">
                  {inventory.venue.organizationName} hasn’t finished setting up
                  payments, so courts can’t be paid for online yet.
                </Notice>
              ) : null}
              {notice ? (
                <p aria-live="polite" className="vn-book__notice" role="status">
                  {notice}
                </p>
              ) : null}
              <Button
                block
                disabled={
                  !quote ||
                  !policyAccepted ||
                  (paymentMode === "split" && players.length === 0) ||
                  !venue.paymentsReady
                }
                loading={isPending}
                type="submit"
                variant="primary"
              >
                {intent === "host"
                  ? "Reserve the court and continue"
                  : "Continue to secure payment"}
              </Button>
            </form>
          ) : null}
        </SheetContent>
      </Sheet>
      {checkoutSessionId ? null : (
        <p className="site-meta vn-book__more">
          Looking for a game instead?{" "}
          <Link className="site-textbutton" href="#on-this-week">
            See what’s on here this week
          </Link>
        </p>
      )}
    </section>
  );
}
