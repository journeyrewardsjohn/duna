"use client";

import type { CourtBookingInventory } from "@duna/api";
import { formatMoney } from "@duna/core";
import { priceConsumerOrder } from "@duna/pricing";
import { Badge, Numeric } from "@duna/ui";
import {
  ArrowLeft,
  CalendarClock,
  Check,
  Clock3,
  CreditCard,
  Lightbulb,
  MapPin,
  ShieldCheck,
  Waves,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import {
  courtCheckoutStatusAction,
  startCourtCheckoutAction,
} from "@/app/app/venues/[venueId]/actions";

function localInputValue(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

export function CourtBookingPanel({
  inventory,
  defaultLocalStartsAt,
  initialCheckoutSessionId,
  initialNotice,
  isDunaPlus,
}: {
  readonly inventory: CourtBookingInventory;
  readonly defaultLocalStartsAt: string;
  readonly initialCheckoutSessionId?: string;
  readonly initialNotice?: string;
  readonly isDunaPlus: boolean;
}) {
  const firstConfiguredCourt =
    inventory.courts.find((court) => court.pricing) ?? inventory.courts[0];
  const [courtId, setCourtId] = useState(firstConfiguredCourt?.id ?? "");
  const selectedCourt = inventory.courts.find((court) => court.id === courtId);
  const [localStartsAt, setLocalStartsAt] = useState(defaultLocalStartsAt);
  const [durationMinutes, setDurationMinutes] = useState(
    Math.max(60, selectedCourt?.minimumDurationMinutes ?? 60),
  );
  const [notice, setNotice] = useState(initialNotice ?? "");
  const [checkoutSessionId, setCheckoutSessionId] = useState(
    initialCheckoutSessionId,
  );
  const [alternatives, setAlternatives] = useState<
    readonly { startsAt: string; endsAt: string }[]
  >([]);
  const [isPending, startTransition] = useTransition();

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
        return;
      }
      setNotice("Payment received by Stripe. Confirming your court…");
      timer = setTimeout(check, 1_500);
    };
    void check();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [checkoutSessionId]);

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

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice("");
    setAlternatives([]);
    if (!selectedCourt?.pricing) {
      setNotice("This court is awaiting an operator-approved rate plan.");
      return;
    }
    startTransition(async () => {
      const response = await startCourtCheckoutAction({
        venueId: inventory.venue.id,
        courtId: selectedCourt.id,
        localStartsAt,
        durationMinutes,
        idempotencyKey: crypto.randomUUID(),
      });
      if (!response.ok) {
        setNotice(response.error);
        return;
      }
      if (response.result.mode === "unavailable") {
        setNotice("That time was just taken. Choose another available start.");
        setAlternatives(response.result.alternatives);
        return;
      }
      if (response.result.mode === "stripe" && response.result.checkoutUrl) {
        setCheckoutSessionId(response.result.checkoutSessionId);
        window.location.assign(response.result.checkoutUrl);
        return;
      }
      setNotice("Your court is confirmed.");
    });
  };

  const updateCourt = (nextCourtId: string) => {
    setCourtId(nextCourtId);
    const court = inventory.courts.find((item) => item.id === nextCourtId);
    if (court) {
      setDurationMinutes(Math.max(60, court.minimumDurationMinutes));
    }
  };

  return (
    <>
      <header className="court-booking-hero">
        <div>
          <Link href="/app/discover">
            <ArrowLeft aria-hidden size={15} /> Back to discover
          </Link>
          <span className="page-eyebrow">Court rental · venue time</span>
          <h1>{inventory.venue.name}</h1>
          <p>
            <MapPin aria-hidden size={15} /> {inventory.venue.city},{" "}
            {inventory.venue.region} · {inventory.venue.organizationName}
          </p>
        </div>
        <div className="court-booking-hero__mark" aria-hidden>
          <Waves size={34} />
          <Numeric>{inventory.courts.length}</Numeric>
          <small>courts</small>
        </div>
      </header>

      <div className="court-booking-layout">
        <form className="court-booking-form" onSubmit={submit}>
          <header>
            <span className="page-eyebrow">Reserve in a minute</span>
            <h2>Choose your court and time.</h2>
            <Badge>{inventory.venue.timezone}</Badge>
          </header>

          <fieldset>
            <legend>Court</legend>
            <div className="court-choice-grid">
              {inventory.courts.map((court) => (
                <label
                  className={court.id === courtId ? "selected" : undefined}
                  key={court.id}
                >
                  <input
                    type="radio"
                    name="court"
                    value={court.id}
                    checked={court.id === courtId}
                    onChange={() => updateCourt(court.id)}
                  />
                  <span>
                    <strong>{court.name}</strong>
                    <small>
                      {court.surface} · {court.lit ? "Lit" : "Daylight"}
                    </small>
                  </span>
                  <Numeric>
                    {court.pricing
                      ? formatMoney(
                          court.pricing.nonMemberAmountMinor ??
                            court.pricing.baseAmountMinor,
                          court.pricing.currency,
                        )
                      : "—"}
                  </Numeric>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="court-booking-fields">
            <label>
              <span>
                <CalendarClock aria-hidden size={15} /> Start at the venue
              </span>
              <input
                type="datetime-local"
                value={localStartsAt}
                onChange={(event) => setLocalStartsAt(event.target.value)}
                required
              />
            </label>
            <label>
              <span>
                <Clock3 aria-hidden size={15} /> Duration
              </span>
              <select
                value={durationMinutes}
                onChange={(event) =>
                  setDurationMinutes(Number(event.target.value))
                }
              >
                {[30, 60, 90, 120, 150, 180]
                  .filter(
                    (minutes) =>
                      minutes >=
                        (selectedCourt?.minimumDurationMinutes ?? 30) &&
                      minutes <= (selectedCourt?.maximumDurationMinutes ?? 180),
                  )
                  .map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {minutes < 60
                        ? `${minutes} min`
                        : `${minutes / 60} ${minutes === 60 ? "hour" : "hours"}`}
                    </option>
                  ))}
              </select>
            </label>
          </div>

          {alternatives.length > 0 && (
            <section className="court-alternatives">
              <strong>Nearest open starts</strong>
              <div>
                {alternatives.map((alternative) => {
                  const local = localInputValue(
                    alternative.startsAt,
                    inventory.venue.timezone,
                  );
                  return (
                    <button
                      type="button"
                      key={alternative.startsAt}
                      onClick={() => {
                        setLocalStartsAt(local);
                        setAlternatives([]);
                        setNotice("");
                      }}
                    >
                      {new Intl.DateTimeFormat("en-US", {
                        timeZone: inventory.venue.timezone,
                        weekday: "short",
                        hour: "numeric",
                        minute: "2-digit",
                      }).format(new Date(alternative.startsAt))}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

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
            className="primary-action court-booking-submit"
            type="submit"
            disabled={
              isPending ||
              !selectedCourt?.pricing ||
              (Boolean(estimate?.totalMinor) && !inventory.venue.paymentsReady)
            }
          >
            {isPending ? (
              "Holding the court…"
            ) : estimate?.totalMinor ? (
              <>
                <CreditCard aria-hidden size={17} /> Continue to secure checkout
              </>
            ) : (
              <>
                <Check aria-hidden size={17} /> Confirm court
              </>
            )}
          </button>
        </form>

        <aside className="court-booking-summary">
          <span className="page-eyebrow">Your reservation</span>
          <h2>{selectedCourt?.name ?? "Choose a court"}</h2>
          <dl>
            <div>
              <dt>Rental</dt>
              <dd>
                {durationMinutes} minutes ·{" "}
                {selectedCourt?.pricing?.name ?? "Rate not configured"}
              </dd>
            </div>
            <div>
              <dt>Court</dt>
              <dd>
                {selectedCourt?.surface ?? "—"} ·{" "}
                {selectedCourt?.lit ? "Lighting available" : "Daylight court"}
              </dd>
            </div>
            <div>
              <dt>Rental subtotal</dt>
              <dd>
                <Numeric>
                  {estimate
                    ? formatMoney(estimate.subtotalMinor, estimate.currency)
                    : "Unavailable"}
                </Numeric>
              </dd>
            </div>
            <div>
              <dt>Duna fee</dt>
              <dd>
                <Numeric>
                  {estimate
                    ? formatMoney(
                        estimate.fees.reduce(
                          (total, fee) => total + fee.amountMinor,
                          0,
                        ),
                        estimate.currency,
                      )
                    : "—"}
                </Numeric>
                {isDunaPlus && <Badge tone="positive">Waived</Badge>}
              </dd>
            </div>
          </dl>
          <footer>
            <span>Total</span>
            <Numeric>
              {estimate
                ? formatMoney(estimate.totalMinor, estimate.currency)
                : "—"}
            </Numeric>
          </footer>
          {!inventory.venue.paymentsReady && Boolean(estimate?.totalMinor) && (
            <p className="court-activation-note">
              <Lightbulb aria-hidden size={15} /> This operator is finishing
              Stripe payout activation. Paid reservations stay disabled until
              funds can route directly to them.
            </p>
          )}
          <p className="court-booking-assurance">
            <ShieldCheck aria-hidden size={15} /> A database exclusion lock
            protects the court and its setup buffers from double-booking.
          </p>
        </aside>
      </div>
    </>
  );
}
