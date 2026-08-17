"use client";

import type { AdminOrganizationDetail } from "@duna/api";
import { Badge } from "@duna/ui";
import { Check, CircleAlert, Copy, ShieldCheck, UserPlus } from "lucide-react";
import { useActionState, useState } from "react";
import {
  grantOrganizationAccessAction,
  type OperatorActionState,
} from "@/app/actions";

const initialState: OperatorActionState = { status: "idle", message: "" };

export function OrganizationAccessControls({
  organizationId,
  canManage,
}: {
  readonly organizationId: AdminOrganizationDetail["organization"]["id"];
  readonly canManage: boolean;
}) {
  const [state, action, pending] = useActionState(
    grantOrganizationAccessAction,
    initialState,
  );
  const [deliveryMode, setDeliveryMode] = useState<"link-only" | "send">(
    "link-only",
  );
  const [copied, setCopied] = useState(false);

  if (!canManage) {
    return (
      <section className="hq-card admin-org-panel organization-access-controls">
        <header className="hq-card-heading">
          <div>
            <span className="hq-eyebrow">Super Admin only</span>
            <h2>Organization access</h2>
            <p>
              Only the Duna Super Admin can grant cross-organization access.
            </p>
          </div>
          <ShieldCheck aria-hidden size={20} />
        </header>
      </section>
    );
  }

  return (
    <section className="hq-card admin-org-panel organization-access-controls">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Super Admin · organization access</span>
          <h2>Add an existing user or create a secure invitation.</h2>
          <p>
            Existing Duna users are added immediately. Linked WorkOS users are
            synchronized with the same role; new people receive a private claim
            link.
          </p>
        </div>
        <UserPlus aria-hidden size={20} />
      </header>
      <form action={action} className="operator-form">
        <input name="organizationId" type="hidden" value={organizationId} />
        <div className="operator-form-grid operator-form-grid--two">
          <label>
            <span>Email</span>
            <input
              name="email"
              type="email"
              placeholder="teammate@club.com"
              required
            />
          </label>
          <label>
            <span>Role</span>
            <select name="role" defaultValue="manager">
              <option value="director">Director · owner access</option>
              <option value="manager">Manager</option>
              <option value="coach">Coach</option>
              <option value="front-desk">Front desk</option>
              <option value="accountant">Accountant</option>
            </select>
          </label>
          <label>
            <span>Name — required only for a new invite</span>
            <input name="displayName" placeholder="Jordan Lee" />
          </label>
          <label>
            <span>Worker classification</span>
            <select name="workerClassification" defaultValue="1099-contractor">
              <option value="1099-contractor">1099 contractor</option>
              <option value="w2-employee">W-2 employee</option>
            </select>
          </label>
          <label className="operator-field--wide">
            <span>New-user delivery</span>
            <select
              name="deliveryMode"
              value={deliveryMode}
              onChange={(event) =>
                setDeliveryMode(event.target.value as "link-only" | "send")
              }
            >
              <option value="link-only">Create a private claim link</option>
              <option value="send">Email the invitation from Duna</option>
            </select>
          </label>
        </div>
        <div className="organization-access-controls__note">
          <ShieldCheck aria-hidden size={17} />
          <p>
            Director creates an active organization owner. It is intentionally
            available only here, not in club team management.
          </p>
        </div>
        {state.privateClaimLink && (
          <div className="operator-private-link" role="status">
            <div>
              <span className="hq-eyebrow">Private claim link</span>
              <strong>Ready to share</strong>
              <p>This role-specific link expires after 7 days.</p>
            </div>
            <div className="operator-private-link__controls">
              <input
                readOnly
                aria-label="Private claim link"
                value={state.privateClaimLink}
              />
              <button
                className="hq-button hq-button--secondary hq-button--compact"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(state.privateClaimLink!)
                    .then(() => setCopied(true));
                }}
                type="button"
              >
                <Copy aria-hidden size={14} /> {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        )}
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
        <div className="operator-form-footer">
          <Badge tone="warning">Audited role change</Badge>
          <button className="hq-button" disabled={pending} type="submit">
            {pending ? "Saving access…" : "Grant organization access"}
          </button>
        </div>
      </form>
    </section>
  );
}
