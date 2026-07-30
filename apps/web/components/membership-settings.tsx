"use client";

import type { PlayerSettings } from "@duna/api";
import { formatMoney } from "@duna/core";
import { Badge, Numeric } from "@duna/ui";
import { Check, ExternalLink, Pause } from "lucide-react";
import { useState, useTransition } from "react";
import {
  changeDunaPlusAction,
  openDunaPlusPortalAction,
  startDunaPlusAction,
} from "@/app/app/settings/actions";

type Membership = NonNullable<PlayerSettings["membership"]>;
type Plan = PlayerSettings["dunaPlusPlans"][number];
type ChangeAction = "cancel" | "pause" | "resume";

function membershipTone(
  membership: Membership,
): "positive" | "warning" | "neutral" {
  if (membership.pausedUntil || membership.cancelAtPeriodEnd) return "warning";
  return ["active", "trialing"].includes(membership.status)
    ? "positive"
    : "neutral";
}

function statusLabel(membership: Membership): string {
  if (membership.pausedUntil) return "Paused";
  if (membership.cancelAtPeriodEnd) return "Cancels at period end";
  return membership.status.replaceAll("_", " ");
}

export function MembershipSettings({
  membership,
  plans,
  initialNotice,
}: {
  readonly membership?: Membership;
  readonly plans: readonly Plan[];
  readonly initialNotice?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState(initialNotice);
  const [confirming, setConfirming] = useState<ChangeAction>();

  const openCheckout = (interval: "month" | "year") => {
    setError(undefined);
    startTransition(async () => {
      const response = await startDunaPlusAction(interval);
      if (!response.ok) {
        setError(response.error);
        return;
      }
      window.location.assign(response.url);
    });
  };

  const openPortal = () => {
    setError(undefined);
    startTransition(async () => {
      const response = await openDunaPlusPortalAction();
      if (!response.ok) {
        setError(response.error);
        return;
      }
      window.location.assign(response.url);
    });
  };

  const confirmChange = (action: ChangeAction) => {
    setError(undefined);
    startTransition(async () => {
      const response = await changeDunaPlusAction(action);
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setConfirming(undefined);
      setNotice(
        action === "cancel"
          ? "Duna+ will remain active through the current paid period."
          : action === "pause"
            ? "Duna+ billing is paused for one month."
            : "Duna+ billing has resumed.",
      );
    });
  };

  return (
    <section id="membership">
      <div className="settings-section__heading">
        <div>
          <span className="page-eyebrow">Membership</span>
          <h2>Duna+</h2>
        </div>
        {membership ? (
          <Badge tone={membershipTone(membership)}>
            {statusLabel(membership)}
          </Badge>
        ) : (
          <Badge>Available</Badge>
        )}
      </div>

      {(notice || error) && (
        <p className={error ? "form-error" : "form-notice"} aria-live="polite">
          {error ?? notice}
        </p>
      )}

      {membership ? (
        <>
          <article className="membership-card">
            <div>
              <span>DUNA+</span>
              <Badge>
                {membership.interval === "year" ? "Annual" : "Monthly"}
              </Badge>
            </div>
            <Numeric>
              {formatMoney(membership.priceMinor, membership.currency)}
            </Numeric>
            <p>
              {membership.currentPeriodEndsAt
                ? `${membership.cancelAtPeriodEnd ? "Access through" : "Current period ends"} ${new Intl.DateTimeFormat(
                    "en-US",
                    { dateStyle: "long" },
                  ).format(new Date(membership.currentPeriodEndsAt))}`
                : "Stripe billing period is synchronizing."}
            </p>
            <div className="membership-card__savings">
              <span>
                <small>Pause months used</small>
                <Numeric>{membership.pauseMonthsUsed} / 4</Numeric>
              </span>
              <span>
                <small>Billing status</small>
                <Numeric>{statusLabel(membership)}</Numeric>
              </span>
            </div>
            <ul>
              {membership.benefits.map((benefit) => (
                <li key={benefit}>
                  <Check size={15} /> {benefit}
                </li>
              ))}
            </ul>
          </article>

          {confirming ? (
            <article className="membership-confirm" aria-live="polite">
              <strong>
                {confirming === "cancel"
                  ? "Cancel after this paid period?"
                  : confirming === "pause"
                    ? "Pause billing for one month?"
                    : "Resume Duna+ now?"}
              </strong>
              <p>
                {confirming === "cancel"
                  ? "Your profile, rating, matches, safety features, and network access remain free."
                  : confirming === "pause"
                    ? "One of four available pause months will be used."
                    : "Future invoices and Duna+ benefits will continue normally."}
              </p>
              <div>
                <button
                  className="primary-action"
                  disabled={isPending}
                  onClick={() => confirmChange(confirming)}
                  type="button"
                >
                  {isPending ? "Saving…" : "Confirm"}
                </button>
                <button
                  disabled={isPending}
                  onClick={() => setConfirming(undefined)}
                  type="button"
                >
                  Keep membership
                </button>
              </div>
            </article>
          ) : (
            <div className="membership-actions">
              <button disabled={isPending} onClick={openPortal} type="button">
                <ExternalLink aria-hidden size={17} /> Manage payment method
              </button>
              {membership.pausedUntil || membership.cancelAtPeriodEnd ? (
                <button
                  disabled={isPending}
                  onClick={() => setConfirming("resume")}
                  type="button"
                >
                  Resume membership
                </button>
              ) : (
                <>
                  <button
                    disabled={isPending || membership.pauseMonthsUsed >= 4}
                    onClick={() => setConfirming("pause")}
                    type="button"
                  >
                    <Pause aria-hidden size={17} /> Pause membership
                  </button>
                  <button
                    className="danger-link"
                    disabled={isPending}
                    onClick={() => setConfirming("cancel")}
                    type="button"
                  >
                    Cancel membership
                  </button>
                </>
              )}
              <p>
                Cancellation takes one screen and preserves access through the
                paid period. Core Duna identity and safety features remain free.
              </p>
            </div>
          )}
        </>
      ) : (
        <div className="membership-plan-grid">
          {plans.map((plan) => (
            <article className="membership-card" key={plan.interval}>
              <div>
                <span>DUNA+</span>
                <Badge>{plan.interval === "year" ? "Annual" : "Monthly"}</Badge>
              </div>
              <Numeric>{formatMoney(plan.priceMinor, plan.currency)}</Numeric>
              <p>
                {plan.interval === "year"
                  ? "One annual payment."
                  : "Billed monthly. Cancel at period end."}
              </p>
              <ul>
                <li>
                  <Check size={15} /> No consumer platform fees
                </li>
                <li>
                  <Check size={15} /> Full rating history
                </li>
                <li>
                  <Check size={15} /> Partner chemistry and analytics
                </li>
              </ul>
              <button
                className="primary-action"
                disabled={isPending || !plan.configured}
                onClick={() => openCheckout(plan.interval)}
                type="button"
              >
                {isPending
                  ? "Opening Stripe…"
                  : plan.configured
                    ? `Choose ${plan.interval === "year" ? "annual" : "monthly"}`
                    : "Checkout unavailable"}
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
