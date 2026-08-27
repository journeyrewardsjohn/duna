"use client";

import type { AdminOrganizationDetail } from "@duna/api";
import {
  ORGANIZATION_PLAN_IDS,
  ORGANIZATION_PLANS,
  type OrganizationPlanId,
} from "@duna/core";
import { Badge } from "@duna/ui";
import {
  Check,
  CircleAlert,
  CreditCard,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useActionState, useState } from "react";
import {
  updateOrganizationPlanPolicyAction,
  type OrganizationPlanActionState,
} from "@/app/admin/actions";

const initialState: OrganizationPlanActionState = {
  status: "idle",
  message: "",
};

function money(amountMinor: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amountMinor / 100);
}

function planName(plan: OrganizationPlanId): string {
  return ORGANIZATION_PLANS[plan].productName;
}

export function OrganizationPlanControls({
  billing,
  canManage,
}: {
  readonly billing: AdminOrganizationDetail["billing"];
  readonly canManage: boolean;
}) {
  const policy = billing.planPolicy;
  const [state, action, pending] = useActionState(
    updateOrganizationPlanPolicyAction,
    initialState,
  );
  const [accessMode, setAccessMode] = useState<
    "admin-assigned" | "billing-managed"
  >(policy.adminPlanOverride ? "admin-assigned" : "billing-managed");
  const [selectedPlan, setSelectedPlan] = useState<OrganizationPlanId>(
    policy.adminPlanOverride ?? policy.effectivePlan,
  );
  const [synchronizeStripe, setSynchronizeStripe] = useState(false);
  const [discountMode, setDiscountMode] = useState<
    "preserve" | "clear" | "apply"
  >("preserve");
  const [discountDuration, setDiscountDuration] = useState<
    "once" | "repeating" | "forever"
  >(
    policy.interval === "year" && policy.discount?.duration === "repeating"
      ? "once"
      : (policy.discount?.duration ?? "once"),
  );
  const stripeEligible =
    policy.hasStripeSubscription && selectedPlan !== "coach";

  return (
    <section className="hq-card admin-org-panel admin-org-plan-policy">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Plan + subscription</span>
          <h2>Organization plan</h2>
          <p>
            Assign Duna access immediately, then optionally synchronize the paid
            plan and discount to its existing Stripe subscription.
          </p>
        </div>
        <Badge
          tone={policy.source === "admin-assigned" ? "warning" : "positive"}
        >
          {planName(policy.effectivePlan)} ·{" "}
          {policy.source.replaceAll("-", " ")}
        </Badge>
      </header>

      <div className="admin-org-plan-policy__summary">
        <div>
          <small>Effective access</small>
          <strong>{planName(policy.effectivePlan)}</strong>
        </div>
        <div>
          <small>Stripe plan</small>
          <strong>{planName(policy.configuredPlan)}</strong>
        </div>
        <div>
          <small>Subscription</small>
          <strong>{policy.subscriptionStatus.replaceAll("_", " ")}</strong>
        </div>
        <div>
          <small>Last Duna discount</small>
          <strong>
            {policy.discount
              ? `${policy.discount.percentBps / 100}% · ${
                  policy.discount.duration === "repeating"
                    ? `${policy.discount.months} months`
                    : policy.discount.duration
                }`
              : "No Duna discount recorded"}
          </strong>
        </div>
      </div>

      {!canManage ? (
        <p className="admin-org-fee-policy__restricted">
          Super Admin access is required to change plan access or Stripe
          billing.
        </p>
      ) : (
        <form action={action} className="admin-org-plan-policy__form">
          <input
            name="organizationId"
            type="hidden"
            value={policy.organizationId}
          />

          <fieldset className="admin-org-plan-policy__access">
            <legend>Who controls access?</legend>
            <label>
              <input
                checked={accessMode === "admin-assigned"}
                name="accessMode"
                onChange={() => setAccessMode("admin-assigned")}
                type="radio"
                value="admin-assigned"
              />
              <span>
                <strong>Super Admin assignment</strong>
                <small>
                  Keeps this plan active even if Stripe billing later becomes
                  past due or inactive.
                </small>
              </span>
            </label>
            <label>
              <input
                checked={accessMode === "billing-managed"}
                name="accessMode"
                onChange={() => setAccessMode("billing-managed")}
                type="radio"
                value="billing-managed"
              />
              <span>
                <strong>Follow Stripe billing</strong>
                <small>
                  Clears the Super Admin override; paid access requires an
                  active or trialing subscription.
                </small>
              </span>
            </label>
          </fieldset>

          <fieldset className="admin-org-plan-grid">
            <legend>Choose plan</legend>
            {ORGANIZATION_PLAN_IDS.map((planId) => {
              const plan = ORGANIZATION_PLANS[planId];
              const selected = selectedPlan === planId;
              return (
                <label
                  className={`admin-org-plan-card${selected ? " admin-org-plan-card--selected" : ""}`}
                  key={plan.id}
                >
                  <input
                    checked={selected}
                    name="plan"
                    onChange={() => {
                      setSelectedPlan(plan.id);
                      if (plan.id === "coach") {
                        setSynchronizeStripe(false);
                        setDiscountMode("preserve");
                      }
                    }}
                    type="radio"
                    value={plan.id}
                  />
                  <span className="admin-org-plan-card__check">
                    {selected && <Check aria-hidden size={15} />}
                  </span>
                  <small>{plan.name}</small>
                  <strong>{plan.productName}</strong>
                  <span className="admin-org-plan-card__price">
                    {money(plan.monthlyPriceMinor)}
                    <small>/ month</small>
                  </span>
                  <span className="admin-org-plan-card__annual">
                    {plan.id === "coach"
                      ? "No software subscription"
                      : `${money(plan.annualPriceMinor)} with annual prepay`}
                  </span>
                  <p>{plan.tagline}</p>
                  <ul>
                    <li>{plan.defaultCommissionBps / 100}% organization fee</li>
                    <li>{plan.monthlyUploadSeconds / 3_600} upload hours</li>
                    <li>{plan.monthlyLiveSeconds / 3_600} live hours</li>
                  </ul>
                </label>
              );
            })}
          </fieldset>

          <section className="admin-org-stripe-policy">
            <header>
              <div>
                <CreditCard aria-hidden size={19} />
                <span>
                  <strong>Stripe subscription</strong>
                  <small>
                    {policy.hasStripeSubscription
                      ? `${policy.interval ?? "Current"} billing · ${policy.stripeSyncStatus.replaceAll("-", " ")}`
                      : "No Stripe subscription is connected"}
                  </small>
                </span>
              </div>
              <label className="operator-switch">
                <input
                  checked={synchronizeStripe}
                  disabled={!stripeEligible}
                  name="synchronizeStripe"
                  onChange={(event) => {
                    setSynchronizeStripe(event.target.checked);
                    if (!event.target.checked) setDiscountMode("preserve");
                  }}
                  type="checkbox"
                  value="true"
                />
                <span>
                  <strong>Update Stripe</strong>
                  Plan change takes effect without a mid-cycle proration.
                </span>
              </label>
            </header>
            {selectedPlan === "coach" && (
              <p>
                Free is an access assignment, not a Stripe price. To fully comp
                a paid subscription, select Club or Scale and apply 100% off.
              </p>
            )}
            {!policy.hasStripeSubscription && (
              <p>
                Assign access now; the organization must complete checkout
                before Stripe can be synchronized.
              </p>
            )}
            {synchronizeStripe && (
              <div className="admin-org-stripe-policy__discount">
                <label>
                  <span>Discount action</span>
                  <select
                    name="discountMode"
                    onChange={(event) =>
                      setDiscountMode(
                        event.target.value as "preserve" | "clear" | "apply",
                      )
                    }
                    value={discountMode}
                  >
                    <option value="preserve">
                      Keep current Stripe discount
                    </option>
                    <option value="apply">Apply a new discount</option>
                    <option value="clear">Remove Stripe discounts</option>
                  </select>
                </label>
                {discountMode === "apply" && (
                  <>
                    <label>
                      <span>Percent off</span>
                      <input
                        defaultValue={
                          policy.discount?.percentBps
                            ? policy.discount.percentBps / 100
                            : 100
                        }
                        max="100"
                        min="0.01"
                        name="discountPercent"
                        required
                        step="0.01"
                        type="number"
                      />
                    </label>
                    <label>
                      <span>Duration</span>
                      <select
                        name="discountDuration"
                        onChange={(event) =>
                          setDiscountDuration(
                            event.target.value as
                              "once" | "repeating" | "forever",
                          )
                        }
                        value={discountDuration}
                      >
                        <option value="once">Next invoice</option>
                        <option
                          disabled={policy.interval === "year"}
                          value="repeating"
                        >
                          First X months
                        </option>
                        <option value="forever">Forever</option>
                      </select>
                    </label>
                    {discountDuration === "repeating" && (
                      <label>
                        <span>Number of months</span>
                        <input
                          defaultValue={policy.discount?.months ?? 3}
                          max="36"
                          min="1"
                          name="discountMonths"
                          required
                          type="number"
                        />
                      </label>
                    )}
                    {policy.interval === "year" && (
                      <p>
                        First-X-month discounts are disabled for annual prepay
                        so a month-based coupon cannot accidentally discount a
                        full yearly invoice. Use Next invoice or Forever.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
            {!synchronizeStripe && (
              <input name="discountMode" type="hidden" value="preserve" />
            )}
            {policy.stripeSyncError && (
              <p className="admin-org-stripe-policy__error">
                <CircleAlert aria-hidden size={15} /> {policy.stripeSyncError}
              </p>
            )}
          </section>

          <label className="admin-org-plan-policy__reason">
            <span>Audit reason</span>
            <textarea
              maxLength={500}
              minLength={10}
              name="reason"
              placeholder="Why this organization needs this access or billing change"
              required
              rows={3}
            />
          </label>
          <label className="admin-org-plan-policy__confirm">
            <input name="confirmed" required type="checkbox" value="true" />
            <span>
              <ShieldCheck aria-hidden size={16} />I reviewed the access source,
              plan, and any Stripe discount. I understand a Stripe sync changes
              the customer&apos;s real subscription.
            </span>
          </label>
          <footer>
            {state.status !== "idle" && (
              <p
                className={`operator-action-notice operator-action-notice--${state.status}`}
                role={state.status === "error" ? "alert" : "status"}
              >
                {state.status === "success" ? (
                  <Check aria-hidden size={15} />
                ) : (
                  <CircleAlert aria-hidden size={15} />
                )}
                {state.message}
              </p>
            )}
            <button
              className="hq-button hq-button--primary"
              disabled={pending}
              type="submit"
            >
              <RefreshCw aria-hidden size={15} />
              {pending
                ? "Applying…"
                : synchronizeStripe
                  ? "Apply access + Stripe change"
                  : accessMode === "admin-assigned"
                    ? "Assign plan access"
                    : "Follow Stripe billing"}
            </button>
          </footer>
        </form>
      )}
    </section>
  );
}
