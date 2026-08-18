"use client";

import type {
  DemoDataControl,
  FeatureFlagCollection,
  FeatureFlagSummary,
} from "@duna/api";
import type { OrganizationSummary } from "@duna/core";
import { Badge } from "@duna/ui";
import { Check, CircleAlert, Flag, Plus, ShieldCheck } from "lucide-react";
import { useActionState } from "react";
import {
  createFeatureFlagAction,
  updateFeatureFlagAction,
  type FeatureFlagActionState,
} from "@/app/admin/actions";
import { DemoDataControls } from "./demo-data-controls";

const initialState: FeatureFlagActionState = {
  status: "idle",
  message: "",
};

function ActionNotice({ state }: { readonly state: FeatureFlagActionState }) {
  if (state.status === "idle") return null;
  return (
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
  );
}

function scopeLabel(flag: FeatureFlagSummary): string {
  if (flag.organizationName && flag.market) {
    return `${flag.organizationName} · ${flag.market}`;
  }
  return flag.organizationName ?? flag.market ?? "Global";
}

function FlagEditor({
  flag,
  canManage,
}: {
  readonly flag: FeatureFlagSummary;
  readonly canManage: boolean;
}) {
  const [state, action, pending] = useActionState(
    updateFeatureFlagAction,
    initialState,
  );
  return (
    <article className="feature-flag-card">
      <header>
        <span>
          <strong>{flag.key}</strong>
          <small>{scopeLabel(flag)}</small>
        </span>
        <Badge tone={flag.enabled ? "live" : "neutral"}>
          {flag.enabled ? "enabled" : "disabled"}
        </Badge>
      </header>
      <form action={action} className="operator-form">
        <input type="hidden" name="flagId" value={flag.id} />
        <label>
          <span>Rollout state</span>
          <select
            defaultValue={flag.enabled ? "true" : "false"}
            disabled={!canManage}
            name="enabled"
          >
            <option value="false">Disabled</option>
            <option value="true">Enabled</option>
          </select>
        </label>
        <label>
          <span>Configuration JSON</span>
          <textarea
            defaultValue={JSON.stringify(flag.configuration, null, 2)}
            disabled={!canManage}
            name="configuration"
            rows={5}
          />
        </label>
        <label>
          <span>Audit reason</span>
          <input
            disabled={!canManage}
            minLength={10}
            name="reason"
            placeholder="Why this rollout state is changing"
            required
          />
        </label>
        <label className="operator-confirmation">
          <input
            disabled={!canManage}
            name="confirmed"
            required
            type="checkbox"
            value="true"
          />
          <span>
            <strong>I reviewed this exact scope and state.</strong>
            The change is written to the immutable platform audit record.
          </span>
        </label>
        <footer className="operator-form-footer">
          <ActionNotice state={state} />
          <button
            className="hq-button hq-button--primary"
            disabled={!canManage || pending}
            type="submit"
          >
            {pending ? "Saving…" : "Save rollout"}
          </button>
        </footer>
      </form>
      <small className="feature-flag-meta">
        Updated{" "}
        {new Intl.DateTimeFormat("en-US", {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(flag.updatedAt))}
        {flag.updatedByName ? ` by ${flag.updatedByName}` : ""}
      </small>
    </article>
  );
}

function CreateFlag({
  organizations,
  canManage,
}: {
  readonly organizations: readonly OrganizationSummary[];
  readonly canManage: boolean;
}) {
  const [state, action, pending] = useActionState(
    createFeatureFlagAction,
    initialState,
  );
  return (
    <section className="hq-card feature-flag-create">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Controlled rollout</span>
          <h2>Create a scoped flag</h2>
          <p>
            Leave organization and market empty for a global control. More
            specific scopes can safely override rollout policy.
          </p>
        </div>
        <Plus aria-hidden size={24} />
      </header>
      <form action={action} className="operator-form">
        <div className="operator-form-grid operator-form-grid--two">
          <label>
            <span>Flag key</span>
            <input
              disabled={!canManage}
              name="key"
              pattern="[a-z0-9][a-z0-9._-]*"
              placeholder="wallet.withdrawals"
              required
            />
          </label>
          <label>
            <span>Organization scope</span>
            <select disabled={!canManage} name="organizationId" defaultValue="">
              <option value="">All organizations</option>
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Market scope</span>
            <input
              disabled={!canManage}
              name="market"
              placeholder="Optional, e.g. South Bay"
            />
          </label>
          <label>
            <span>Initial state</span>
            <select disabled={!canManage} name="enabled" defaultValue="false">
              <option value="false">Disabled</option>
              <option value="true">Enabled</option>
            </select>
          </label>
          <label className="operator-field--full">
            <span>Configuration JSON</span>
            <textarea
              defaultValue="{}"
              disabled={!canManage}
              name="configuration"
              rows={5}
            />
          </label>
          <label className="operator-field--full">
            <span>Audit reason</span>
            <input
              disabled={!canManage}
              minLength={10}
              name="reason"
              placeholder="Why this control is being created"
              required
            />
          </label>
        </div>
        <label className="operator-confirmation">
          <input
            disabled={!canManage}
            name="confirmed"
            required
            type="checkbox"
            value="true"
          />
          <span>
            <strong>I reviewed the key, scope, and initial state.</strong>
            Creation is audit-logged and restricted to super administrators.
          </span>
        </label>
        <footer className="operator-form-footer">
          <ActionNotice state={state} />
          <button
            className="hq-button hq-button--primary"
            disabled={!canManage || pending}
            type="submit"
          >
            {pending ? "Creating…" : "Create flag"}
          </button>
        </footer>
      </form>
    </section>
  );
}

export function FeatureFlagControls({
  collection,
  organizations,
  demoData,
}: {
  readonly collection: FeatureFlagCollection;
  readonly organizations: readonly OrganizationSummary[];
  readonly demoData: DemoDataControl;
}) {
  return (
    <div className="feature-flag-controls">
      <DemoDataControls control={demoData} />
      {!collection.canManage && (
        <section className="hq-card feature-flag-readonly">
          <ShieldCheck aria-hidden size={22} />
          <div>
            <strong>Read-only platform access</strong>
            <p>
              Flag state is visible to administrators. Only a verified super
              administrator can change rollout policy.
            </p>
          </div>
        </section>
      )}
      <section className="hq-card feature-flag-list">
        <header className="hq-card-heading">
          <div>
            <span className="hq-eyebrow">Connected policy state</span>
            <h2>{collection.flags.length} feature flags</h2>
          </div>
          <Flag aria-hidden size={24} />
        </header>
        <div className="feature-flag-grid">
          {collection.flags.map((flag) => (
            <FlagEditor
              canManage={collection.canManage}
              flag={flag}
              key={flag.id}
            />
          ))}
          {collection.flags.length === 0 && (
            <div className="hq-empty">
              <strong>No rollout controls exist yet.</strong>
              <span>Create the first scoped flag below.</span>
            </div>
          )}
        </div>
      </section>
      <CreateFlag
        canManage={collection.canManage}
        organizations={organizations}
      />
    </div>
  );
}
