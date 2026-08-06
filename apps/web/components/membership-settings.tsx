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
  const [billingInterval, setBillingInterval] = useState<"month" | "year">(
    "year",
  );

  const openCheckout = (
    plan: "premium" | "premium-plus",
    interval: "month" | "year",
  ) => {
    setError(undefined);
    startTransition(async () => {
      const response = await startDunaPlusAction(plan, interval);
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
          ? "Premium access will remain active through the current paid period."
          : action === "pause"
            ? "Premium billing is paused for one month."
            : "Premium billing has resumed.",
      );
    });
  };

  return (
    <section id="membership">
      <div className="settings-section__heading">
        <div>
          <span className="page-eyebrow">Membership</span>
          <h2>Duna Premium</h2>
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
              <span>{membership.tierName}</span>
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
                : "Billing period is synchronizing."}
            </p>
            <div className="membership-card__savings">
              <span>
                <small>Pause months used</small>
                <Numeric>{membership.pauseMonthsUsed} / 4</Numeric>
              </span>
              <span>
                <small>Billing status</small>
                <span>{statusLabel(membership)}</span>
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
                    : "Resume Premium now?"}
              </strong>
              <p>
                {confirming === "cancel"
                  ? "Your profile, rating, matches, safety features, and network access remain free."
                  : confirming === "pause"
                    ? "One of four available pause months will be used."
                    : "Future invoices and Premium benefits will continue normally."}
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
                <ExternalLink aria-hidden size={17} /> Manage billing or change
                plan
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
        <>
          <p>
            Free includes 4 uploaded-video hours each month. Upgrade for native
            live broadcasting, higher video limits, and no Duna service fees on
            eligible purchases.
          </p>
          <div className="membership-actions" aria-label="Billing interval">
            <button
              aria-pressed={billingInterval === "month"}
              disabled={isPending}
              onClick={() => setBillingInterval("month")}
              type="button"
            >
              Monthly
            </button>
            <button
              aria-pressed={billingInterval === "year"}
              disabled={isPending}
              onClick={() => setBillingInterval("year")}
              type="button"
            >
              Annual · 2 months free
            </button>
          </div>
          <div className="membership-plan-grid">
            {plans
              .filter((plan) => plan.interval === billingInterval)
              .map((plan) => (
                <article className="membership-card" key={plan.plan}>
                  <div>
                    <span>{plan.name}</span>
                    <Badge>
                      {plan.interval === "year" ? "Annual" : "Monthly"}
                    </Badge>
                  </div>
                  <Numeric>
                    {formatMoney(plan.priceMinor, plan.currency)}
                  </Numeric>
                  <p>
                    {plan.tagline}{" "}
                    {plan.interval === "year"
                      ? `${formatMoney(Math.round(plan.priceMinor / 12), plan.currency)} per month, billed annually.`
                      : "Billed monthly. Cancel at period end."}
                  </p>
                  <ul>
                    {plan.benefits.map((benefit) => (
                      <li key={benefit}>
                        <Check size={15} /> {benefit}
                      </li>
                    ))}
                  </ul>
                  <button
                    className="primary-action"
                    disabled={isPending || !plan.configured}
                    onClick={() => openCheckout(plan.plan, plan.interval)}
                    type="button"
                  >
                    {isPending
                      ? "Opening secure checkout…"
                      : plan.configured
                        ? `Choose ${plan.name}`
                        : "Checkout unavailable"}
                  </button>
                </article>
              ))}
          </div>
        </>
      )}
    </section>
  );
}
