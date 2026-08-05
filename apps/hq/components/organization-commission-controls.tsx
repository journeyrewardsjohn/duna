"use client";

import type { AdminOrganizationDetail } from "@duna/api";
import { Badge } from "@duna/ui";
import { Check, CircleAlert, Percent, RefreshCw } from "lucide-react";
import { useActionState } from "react";
import {
  updateOrganizationCommissionAction,
  type OrganizationCommissionActionState,
} from "@/app/admin/actions";

const initialState: OrganizationCommissionActionState = {
  status: "idle",
  message: "",
};

export function OrganizationCommissionControls({
  billing,
  canManage,
}: {
  readonly billing: AdminOrganizationDetail["billing"];
  readonly canManage: boolean;
}) {
  const [state, action, pending] = useActionState(
    updateOrganizationCommissionAction,
    initialState,
  );
  const policy = billing.commission;
  return (
    <section className="hq-card admin-org-panel admin-org-fee-policy">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Commercial policy</span>
          <h2>Organization transaction fee</h2>
        </div>
        <span className="admin-org-fee-policy__rate">
          <Percent aria-hidden size={18} /> {policy.rateBps / 100}%
        </span>
      </header>

      <div className="admin-org-fee-policy__summary">
        <dl>
          <div>
            <dt>Configured plan</dt>
            <dd>{billing.configuredPlan.replaceAll("-", " ")}</dd>
          </div>
          <div>
            <dt>Effective plan</dt>
            <dd>{billing.effectivePlan.replaceAll("-", " ")}</dd>
          </div>
          <div>
            <dt>Billing</dt>
            <dd>{billing.subscriptionStatus.replaceAll("_", " ")}</dd>
          </div>
          <div>
            <dt>Fee source</dt>
            <dd>{policy.source.replace("-", " ")}</dd>
          </div>
        </dl>
        <aside>
          <Badge
            tone={
              policy.stripeSyncStatus === "synced"
                ? "positive"
                : policy.stripeSyncStatus === "failed"
                  ? "danger"
                  : "warning"
            }
          >
            Stripe metadata {policy.stripeSyncStatus}
          </Badge>
          <p>
            Duna calculates the fee from this saved policy for every connected
            payment. Stripe account metadata mirrors it for operations; each
            payment&apos;s application fee is authoritative.
          </p>
          {policy.stripeSyncError && <small>{policy.stripeSyncError}</small>}
        </aside>
      </div>

      {!canManage && (
        <p className="admin-org-fee-policy__restricted">
          Super Admin access is required to change or synchronize this policy.
        </p>
      )}
      {canManage && (
        <form action={action} className="admin-org-fee-policy__form">
          <input
            name="organizationId"
            type="hidden"
            value={policy.organizationId}
          />
          <fieldset>
            <legend>Fee rule</legend>
            <label>
              <input
                defaultChecked={policy.source === "plan-default"}
                name="usePlanDefault"
                type="radio"
                value="true"
              />
              <span>
                <strong>Use plan default</strong>
                <small>
                  {policy.defaultRateBps / 100}% for the effective plan
                </small>
              </span>
            </label>
            <label>
              <input
                defaultChecked={policy.source === "admin-override"}
                name="usePlanDefault"
                type="radio"
                value="false"
              />
              <span>
                <strong>Custom override</strong>
                <small>Applies to all card transaction subtotals</small>
              </span>
            </label>
          </fieldset>
          <label>
            <span>Override percentage</span>
            <input
              defaultValue={(policy.overrideRateBps ?? policy.rateBps) / 100}
              max="25"
              min="0"
              name="overridePercent"
              step="0.01"
              type="number"
            />
          </label>
          <label className="admin-org-fee-policy__reason">
            <span>Audit reason</span>
            <textarea
              maxLength={500}
              minLength={10}
              name="reason"
              placeholder="Why this organization needs a different commercial policy"
              required
              rows={3}
            />
          </label>
          <label className="admin-org-fee-policy__confirm">
            <input name="confirmed" type="checkbox" value="true" />
            <span>
              I reviewed the effective rate and understand it will apply to new
              Stripe Connect payments.
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
              {pending ? "Saving policy…" : "Save and sync policy"}
            </button>
          </footer>
        </form>
      )}
    </section>
  );
}
