"use client";

import type { EventSummary, PersonSummary } from "@duna/core";
import { formatMoney } from "@duna/core";
import { priceConsumerOrder } from "@duna/pricing";
import { Badge, Numeric } from "@duna/ui";
import {
  Check,
  ChevronRight,
  CreditCard,
  LockKeyhole,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  checkoutStatusAction,
  startEventCheckoutAction,
} from "@/app/app/checkout/[slug]/actions";

export function CheckoutPanel({
  event,
  initialDivisionId,
  initialCheckoutSessionId,
  initialNotice,
  isDunaPlus,
  participants,
  player,
  walletAvailableMinor,
}: {
  readonly event: EventSummary;
  readonly initialDivisionId?: string;
  readonly initialCheckoutSessionId?: string;
  readonly initialNotice?: string;
  readonly isDunaPlus: boolean;
  readonly participants: readonly {
    readonly person: PersonSummary;
    readonly label: string;
    readonly available: boolean;
  }[];
  readonly player: PersonSummary;
  readonly walletAvailableMinor: number;
}) {
  const [selectedDivisionId, setSelectedDivisionId] = useState(
    event.divisions?.find((division) => division.id === initialDivisionId)
      ?.id ?? event.divisions?.[0]?.id,
  );
  const firstAvailableParticipant =
    participants.find((participant) => participant.available) ??
    participants[0];
  const [selectedParticipantId, setSelectedParticipantId] = useState(
    firstAvailableParticipant?.person.id ?? player.id,
  );
  const [completion, setCompletion] = useState<
    "confirmed" | "waitlisted" | "already-registered"
  >();
  const [error, setError] = useState<string>();
  const [processingReturn, setProcessingReturn] = useState(
    Boolean(initialCheckoutSessionId),
  );
  const [isPending, startTransition] = useTransition();
  const idempotencyKey = useRef(crypto.randomUUID());
  const selectedDivision = event.divisions?.find(
    (division) => division.id === selectedDivisionId,
  );
  const selectedParticipant =
    participants.find(
      (participant) => participant.person.id === selectedParticipantId,
    ) ?? firstAvailableParticipant;
  const entryPrice = selectedDivision?.price ?? event.price;
  const pricing = useMemo(
    () =>
      priceConsumerOrder({
        currency: entryPrice.currency,
        isDunaPlus,
        items: [
          {
            id: event.id,
            kind:
              event.kind === "tournament" || event.kind === "league"
                ? "registration"
                : "booking",
            description: selectedDivision
              ? `${event.title} · ${selectedDivision.name}`
              : event.title,
            quantity: 1,
            unitAmountMinor: entryPrice.amountMinor,
          },
        ],
      }),
    [entryPrice, event, isDunaPlus, selectedDivision],
  );

  useEffect(() => {
    if (!initialCheckoutSessionId) return;
    let cancelled = false;
    let attempt = 0;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      attempt += 1;
      const response = await checkoutStatusAction(initialCheckoutSessionId);
      if (cancelled) return;
      if (response.ok && response.status.complete) {
        setCompletion("confirmed");
        setProcessingReturn(false);
        return;
      }
      if (
        response.ok &&
        ["failed", "cancelled", "refunded"].includes(
          response.status.orderStatus,
        )
      ) {
        setError(
          "Payment did not complete. Your temporary spot is being released.",
        );
        setProcessingReturn(false);
        return;
      }
      if (attempt >= 15) {
        setError(
          "Payment is still processing. Your spot remains held; refresh shortly.",
        );
        setProcessingReturn(false);
        return;
      }
      timeout = setTimeout(poll, 2_000);
    };
    void poll();
    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
    };
  }, [initialCheckoutSessionId]);

  if (completion) {
    return (
      <section className="checkout-complete">
        <span>
          <Check aria-hidden size={29} />
        </span>
        <Badge tone={completion === "waitlisted" ? "warning" : "positive"}>
          {completion === "waitlisted" ? "Waitlisted" : "Confirmed"}
        </Badge>
        <h1>
          {completion === "waitlisted"
            ? "You’re on the list."
            : completion === "already-registered"
              ? "You were already in."
              : "You’re in."}
        </h1>
        <p>
          {completion === "waitlisted"
            ? `${event.title} is full. Your position is saved and Duna will surface a promotion when capacity opens.`
            : `${event.title} is on your connected Duna calendar.`}
        </p>
        <a className="primary-action" href="/app/play">
          View your booking <ChevronRight aria-hidden size={17} />
        </a>
      </section>
    );
  }

  if (processingReturn) {
    return (
      <section className="checkout-complete" aria-live="polite">
        <Badge tone="warning">Confirming payment</Badge>
        <h1>Stripe sent you back safely.</h1>
        <p>
          Duna is verifying the signed payment event and converting your
          capacity hold into a confirmed registration.
        </p>
      </section>
    );
  }

  return (
    <div className="checkout-layout">
      <section className="checkout-main">
        {initialNotice && (
          <article className="checkout-section">
            <p>{initialNotice}</p>
          </article>
        )}
        <div>
          <span className="page-eyebrow">Secure checkout</span>
          <h1>Finish your spot.</h1>
          <p>Clear math, one Duna fee, and Stripe-hosted payment.</p>
        </div>

        <article className="checkout-section">
          <div className="checkout-section__heading">
            <span>
              <Numeric>1</Numeric>
            </span>
            <h2>Your entry</h2>
            {isDunaPlus && <Badge tone="positive">Duna+ fee waiver</Badge>}
          </div>
          {event.divisions && event.divisions.length > 0 ? (
            <div className="checkout-division-grid">
              {event.divisions.map((division) => (
                <label
                  className={
                    division.id === selectedDivisionId ? "selected" : undefined
                  }
                  key={division.id}
                >
                  <input
                    checked={division.id === selectedDivisionId}
                    name="division"
                    onChange={() => {
                      setSelectedDivisionId(division.id);
                      idempotencyKey.current = crypto.randomUUID();
                    }}
                    type="radio"
                  />
                  <span>
                    <strong>{division.name}</strong>
                    <small>
                      {division.discipline.replace("-", " ")} ·{" "}
                      <Numeric>{division.spotsRemaining}</Numeric> spots left
                    </small>
                  </span>
                  <Numeric>
                    {division.price.amountMinor === 0
                      ? "Free"
                      : formatMoney(
                          division.price.amountMinor,
                          division.price.currency,
                        )}
                  </Numeric>
                </label>
              ))}
            </div>
          ) : (
            <div className="checkout-player">
              <Check aria-hidden size={18} />
              <span>
                <strong>{event.kind.replace("-", " ")}</strong>
                <small>
                  <Numeric>{event.spotsRemaining}</Numeric> of{" "}
                  <Numeric>{event.capacity}</Numeric> spots remain
                </small>
              </span>
              <Numeric>
                {entryPrice.amountMinor === 0
                  ? "Free"
                  : formatMoney(entryPrice.amountMinor, entryPrice.currency)}
              </Numeric>
            </div>
          )}
        </article>

        <article className="checkout-section">
          <div className="checkout-section__heading">
            <span>
              <Numeric>2</Numeric>
            </span>
            <h2>Who’s playing</h2>
            <Badge>Guardian rules enforced</Badge>
          </div>
          <div className="checkout-player">
            <span className="avatar">
              {selectedParticipant?.person.initials ?? player.initials}
            </span>
            <span>
              <strong>
                {selectedParticipant?.person.displayName ?? player.displayName}
              </strong>
              <small>
                Sand Rating{" "}
                {(
                  selectedParticipant?.person.rating.display ??
                  player.rating.display
                ).toFixed(2)}{" "}
                · eligibility checked on confirmation
              </small>
            </span>
            {participants.length > 1 ? (
              <select
                aria-label="Participant"
                onChange={(eventValue) => {
                  setSelectedParticipantId(eventValue.target.value);
                  idempotencyKey.current = crypto.randomUUID();
                }}
                value={selectedParticipantId}
              >
                {participants.map((participant) => (
                  <option
                    disabled={!participant.available}
                    key={participant.person.id}
                    value={participant.person.id}
                  >
                    {participant.person.displayName} · {participant.label}
                    {participant.available ? "" : " · verification pending"}
                  </option>
                ))}
              </select>
            ) : selectedParticipant?.available ? (
              <Check aria-hidden size={18} />
            ) : (
              <Badge tone="warning">Guardian required</Badge>
            )}
          </div>
          {!selectedParticipant?.available && (
            <p className="checkout-inline-warning">
              A verified adult guardian must complete this participant flow.
              Guardian review status is available in Settings.
            </p>
          )}
        </article>

        <article className="checkout-section">
          <div className="checkout-section__heading">
            <span>
              <Numeric>3</Numeric>
            </span>
            <h2>Pay your way</h2>
          </div>
          <label className="payment-choice">
            <input checked={false} disabled readOnly type="checkbox" />
            <WalletCards aria-hidden size={21} />
            <span>
              <strong>Use Duna Wallet</strong>
              <small>
                <Numeric>
                  {formatMoney(walletAvailableMinor, entryPrice.currency)}
                </Numeric>{" "}
                available · split tender activates with production wallet rails
              </small>
            </span>
            <Numeric>{formatMoney(0, entryPrice.currency)}</Numeric>
          </label>
          {pricing.totalMinor > 0 && (
            <label className="payment-choice selected">
              <input defaultChecked name="payment" type="radio" />
              <CreditCard aria-hidden size={21} />
              <span>
                <strong>Stripe Checkout</strong>
                <small>Choose a saved card or another supported method</small>
              </span>
              <Numeric>
                {formatMoney(pricing.totalMinor, entryPrice.currency)}
              </Numeric>
            </label>
          )}
        </article>

        {!isDunaPlus &&
          event.kind !== "tournament" &&
          event.kind !== "league" && (
            <article className="checkout-plus">
              <div>
                <Badge tone="positive">Duna+</Badge>
                <h3>Make the platform fee disappear.</h3>
                <p>
                  Start at $7.99/month. Pause any time, up to four months each
                  year.
                </p>
              </div>
              <Link href="/app/settings">View Duna+</Link>
            </article>
          )}
      </section>

      <aside className="checkout-summary">
        <div className="checkout-summary__art">
          <Badge>{event.kind.replace("-", " ")}</Badge>
        </div>
        <h2>{event.title}</h2>
        <p>{event.venueName}</p>
        {selectedDivision && (
          <p className="checkout-summary__division">
            {selectedDivision.name} ·{" "}
            {selectedDivision.discipline.replace("-", " ")}
          </p>
        )}
        <div className="checkout-summary__math">
          <span>
            <small>
              {event.kind === "tournament" || event.kind === "league"
                ? "Registration"
                : "Booking"}
            </small>
            <Numeric>
              {formatMoney(pricing.subtotalMinor, entryPrice.currency)}
            </Numeric>
          </span>
          {pricing.fees.map((fee) => (
            <span key={fee.id}>
              <small>{fee.label}</small>
              <Numeric>
                {formatMoney(fee.amountMinor, entryPrice.currency)}
              </Numeric>
            </span>
          ))}
          {isDunaPlus && (
            <span className="positive">
              <small>Duna+ platform-fee waiver</small>
              <Numeric>Included</Numeric>
            </span>
          )}
          <span className="checkout-summary__total">
            <strong>Total</strong>
            <Numeric>
              {formatMoney(pricing.totalMinor, entryPrice.currency)}
            </Numeric>
          </span>
        </div>
        {error && <p role="alert">{error}</p>}
        <button
          className="checkout-summary__pay"
          disabled={isPending || !selectedParticipant?.available}
          onClick={() => {
            setError(undefined);
            startTransition(async () => {
              const response = await startEventCheckoutAction({
                sessionId: event.id,
                slug: event.slug,
                divisionId: selectedDivision?.id,
                subjectPersonId: selectedParticipant?.person.id,
                isDunaPlus,
                idempotencyKey: idempotencyKey.current,
              });
              if (!response.ok) {
                setError(response.error);
                idempotencyKey.current = crypto.randomUUID();
                return;
              }
              const result = response.result;
              if (result.mode === "stripe" && result.checkoutUrl) {
                window.location.assign(result.checkoutUrl);
                return;
              }
              setCompletion(
                result.mode === "waitlist"
                  ? "waitlisted"
                  : result.mode === "already-registered"
                    ? "already-registered"
                    : "confirmed",
              );
            });
          }}
        >
          <LockKeyhole aria-hidden size={17} />
          {isPending
            ? "Securing your spot…"
            : pricing.totalMinor > 0
              ? `Continue to Stripe · ${formatMoney(pricing.totalMinor, entryPrice.currency)}`
              : "Confirm free registration"}
        </button>
        <p className="checkout-summary__trust">
          <ShieldCheck aria-hidden size={16} />
          Payments are processed by Stripe. Card details never touch Duna.
        </p>
      </aside>
    </div>
  );
}
