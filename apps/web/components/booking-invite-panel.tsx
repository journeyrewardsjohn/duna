"use client";

import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@duna/api";
import { formatMoney } from "@duna/core";
import { Badge, Numeric } from "@duna/ui";
import { Check, Clock3, CreditCard, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { startShareCheckoutAction } from "@/app/app/booking-invite/[inviteToken]/actions";
import { courtCheckoutStatusAction } from "@/app/app/venues/[venueId]/actions";

type BookingInvite =
  inferRouterOutputs<AppRouter>["public"]["courtBookingInvite"];

export function BookingInvitePanel({
  invite,
  initialCheckoutSessionId,
  initialNotice,
}: {
  readonly invite: BookingInvite;
  readonly initialCheckoutSessionId?: string;
  readonly initialNotice?: string;
}) {
  const [accepted, setAccepted] = useState(false);
  const [scrolled, setScrolled] = useState(!invite.policy.requireFullScroll);
  const [notice, setNotice] = useState(initialNotice ?? "");
  const [checkoutSessionId, setCheckoutSessionId] = useState(
    initialCheckoutSessionId,
  );
  const [isPending, startTransition] = useTransition();
  const policyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = policyRef.current;
    if (
      invite.policy.requireFullScroll &&
      element &&
      element.scrollHeight <= element.clientHeight + 2
    ) {
      setScrolled(true);
    }
  }, [invite.policy.requireFullScroll]);

  useEffect(() => {
    if (!checkoutSessionId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      const result = await courtCheckoutStatusAction(checkoutSessionId);
      if (cancelled) return;
      if (!result.ok) {
        setNotice(result.error);
        return;
      }
      if (result.status.complete) {
        setNotice("All shares are funded. The court is confirmed.");
        return;
      }
      if (result.status.sharePaid) {
        setNotice(
          "Your share is paid. We’ll confirm the court once everyone finishes.",
        );
        return;
      }
      timer = setTimeout(check, 1_500);
    };
    void check();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [checkoutSessionId]);

  const submit = () => {
    startTransition(async () => {
      const result = await startShareCheckoutAction({
        inviteToken: invite.inviteToken,
        policyAccepted: accepted,
        policyFullScrollConfirmed: scrolled,
        idempotencyKey: crypto.randomUUID(),
      });
      if (!result.ok) {
        setNotice(result.error);
        return;
      }
      if (result.result.mode === "stripe" && result.result.checkoutUrl) {
        setCheckoutSessionId(result.result.checkoutSessionId);
        window.location.assign(result.result.checkoutUrl);
        return;
      }
      setNotice("You’re in. The organizer can see that you accepted.");
    });
  };

  const start = new Intl.DateTimeFormat("en-US", {
    timeZone: invite.timezone,
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(invite.startsAt));
  const duration = Math.round(
    (Date.parse(invite.endsAt) - Date.parse(invite.startsAt)) / 60_000,
  );

  return (
    <div className="booking-invite-panel">
      <header>
        <span className="page-eyebrow">Court invitation</span>
        <h1>{invite.organizerName} invited you to play.</h1>
        <p>
          Your place is held while every player accepts and funds their share.
        </p>
      </header>

      <section className="booking-review-reservation">
        <div>
          <strong>{start}</strong>
          <span>
            {invite.venueName} · {invite.courtName}
          </span>
          <small>{invite.timezone}</small>
        </div>
        <div>
          <Clock3 aria-hidden size={18} />
          <Numeric>{duration}</Numeric>
          <small>minutes</small>
        </div>
      </section>

      <section className="booking-invite-price">
        <div>
          <CreditCard aria-hidden size={20} />
          <span>
            <small>Your share</small>
            <strong>
              {formatMoney(
                invite.participant.shareAmountMinor,
                invite.currency,
              )}
            </strong>
          </span>
        </div>
        <Badge>{invite.participant.status}</Badge>
      </section>

      <section className="booking-policy-card">
        <header>
          <ShieldCheck aria-hidden size={20} />
          <div>
            <strong>{invite.policy.title}</strong>
            <small>
              {invite.policy.refundBeforeHours !== undefined
                ? `Refundable until ${invite.policy.refundBeforeHours} hours before start`
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
              setScrolled(true);
            }
          }}
        >
          <p>{invite.policy.markdown}</p>
          {invite.policy.lateCancellation && (
            <p>{invite.policy.lateCancellation}</p>
          )}
          <small>End of policy</small>
        </div>
        <label>
          <input
            type="checkbox"
            checked={accepted}
            disabled={!scrolled}
            onChange={(event) => setAccepted(event.target.checked)}
          />
          <span>
            I have read and accept this cancellation policy.
            {!scrolled && <small> Scroll to the end first.</small>}
          </span>
        </label>
      </section>

      {notice && (
        <p className="court-booking-notice" role="status" aria-live="polite">
          {notice}
        </p>
      )}

      <button
        type="button"
        className="primary-action booking-review-submit"
        disabled={!invite.available || !accepted || isPending}
        onClick={submit}
      >
        <Check aria-hidden size={17} />
        {isPending
          ? "Opening secure checkout…"
          : invite.available
            ? `Pay ${formatMoney(invite.participant.shareAmountMinor, invite.currency)}`
            : "This invitation is no longer payable"}
      </button>
    </div>
  );
}
