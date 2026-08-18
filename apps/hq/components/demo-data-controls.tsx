"use client";

import type { DemoDataControl } from "@duna/api";
import { Badge } from "@duna/ui";
import { Check, CircleAlert, DatabaseZap, ShieldCheck } from "lucide-react";
import { useActionState, useState } from "react";
import {
  setDemoDataAction,
  type DemoDataActionState,
} from "@/app/admin/actions";

const initialState: DemoDataActionState = { status: "idle", message: "" };

export function DemoDataControls({
  control,
}: {
  readonly control: DemoDataControl;
}) {
  const [enabled, setEnabled] = useState(control.enabled);
  const [state, action, pending] = useActionState(
    setDemoDataAction,
    initialState,
  );
  if (!control.target) {
    return (
      <section className="hq-card feature-flag-readonly">
        <DatabaseZap aria-hidden size={22} />
        <div>
          <strong>Beach Elite Academy is not connected</strong>
          <p>
            This dedicated control appears when the Beach Elite Academy (Demo)
            organization exists in the connected database.
          </p>
        </div>
      </section>
    );
  }
  return (
    <section className="hq-card feature-flag-create">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Beach Elite Academy only</span>
          <h2>Enable Demo Data</h2>
          <p>
            Seeds clearly labelled tournaments, divisions, waitlists, league
            stages, teams, brackets, and matches into the real QA account.
          </p>
        </div>
        <Badge tone={control.enabled ? "live" : "neutral"}>
          {control.enabled ? "live" : "off"}
        </Badge>
      </header>
      <form action={action} className="operator-form">
        <input
          name="enabled"
          type="hidden"
          value={enabled ? "true" : "false"}
        />
        <label className="operator-confirmation">
          <input
            checked={enabled}
            disabled={!control.canManage || pending}
            onChange={(event) => setEnabled(event.target.checked)}
            type="checkbox"
          />
          <span>
            <strong>Enable Demo Data</strong>
            Turning this off removes only the {control.recordCount} rows tagged
            to this Demo dataset; it never touches normal Beach Elite records.
          </span>
        </label>
        <label>
          <span>Audit reason</span>
          <input
            disabled={!control.canManage || pending}
            minLength={10}
            name="reason"
            placeholder={
              enabled
                ? "Why this QA dataset should be live"
                : "Why this QA dataset should be removed"
            }
            required
          />
        </label>
        <label className="operator-confirmation">
          <input
            disabled={!control.canManage || pending}
            name="confirmed"
            required
            type="checkbox"
            value="true"
          />
          <span>
            <strong>I reviewed this exact Demo data change.</strong>
            {enabled
              ? " The dataset is live and visibly labelled Demo across product surfaces."
              : " This will remove the tracked Demo rows from the connected account."}
          </span>
        </label>
        <footer className="operator-form-footer">
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
          {!control.canManage && (
            <small className="feature-flag-meta">
              <ShieldCheck aria-hidden size={14} /> Super Admin access is
              required.
            </small>
          )}
          <button
            className="hq-button hq-button--primary"
            disabled={!control.canManage || pending}
            type="submit"
          >
            {pending
              ? "Updating…"
              : enabled
                ? "Make Demo data live"
                : "Remove Demo data"}
          </button>
        </footer>
      </form>
    </section>
  );
}
