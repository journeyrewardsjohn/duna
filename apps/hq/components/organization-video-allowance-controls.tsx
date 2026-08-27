"use client";

import type { AdminOrganizationDetail, VideoAllowanceGrant } from "@duna/api";
import { Badge } from "@duna/ui";
import {
  Check,
  CircleAlert,
  Clock3,
  Radio,
  Trash2,
  UploadCloud,
  UsersRound,
} from "lucide-react";
import { useActionState } from "react";
import {
  grantOrganizationVideoAllowanceAction,
  revokeOrganizationVideoAllowanceAction,
  type OrganizationVideoAllowanceActionState,
} from "@/app/admin/actions";

const initialState: OrganizationVideoAllowanceActionState = {
  status: "idle",
  message: "",
};

function hours(seconds: number): string {
  return (seconds / 3_600).toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
}

function date(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}

function ActionNotice({
  state,
}: {
  readonly state: OrganizationVideoAllowanceActionState;
}) {
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

function AllowanceGrantRow({
  canManage,
  grant,
  organizationId,
}: {
  readonly canManage: boolean;
  readonly grant: VideoAllowanceGrant;
  readonly organizationId: string;
}) {
  const [state, action, pending] = useActionState(
    revokeOrganizationVideoAllowanceAction,
    initialState,
  );
  return (
    <article className="admin-org-video-grant">
      <div className="admin-org-video-grant__identity">
        <span>
          {grant.targetType === "organization" ? (
            <UsersRound aria-hidden size={17} />
          ) : (
            <UploadCloud aria-hidden size={17} />
          )}
        </span>
        <div>
          <strong>{grant.targetName}</strong>
          <small>
            {hours(grant.uploadSeconds)} upload hours ·{" "}
            {hours(grant.liveSeconds)} live hours
          </small>
          <small>
            {grant.cadence === "recurring"
              ? "Every month until revoked"
              : `Through ${date(grant.endsAt!)}`}{" "}
            · {grant.reason}
          </small>
        </div>
      </div>
      <Badge tone={grant.active ? "positive" : "neutral"}>
        {grant.active ? "Active" : grant.revokedAt ? "Revoked" : "Expired"}
      </Badge>
      {grant.active && canManage && (
        <form action={action} className="admin-org-video-grant__revoke">
          <input
            name="scopeOrganizationId"
            type="hidden"
            value={organizationId}
          />
          <input name="grantId" type="hidden" value={grant.id} />
          <input
            aria-label={`Reason to revoke video hours for ${grant.targetName}`}
            minLength={10}
            name="reason"
            placeholder="Why these extra hours are ending"
            required
          />
          <label>
            <input name="confirmed" required type="checkbox" value="true" />
            Confirm
          </label>
          <button
            className="hq-button hq-button--secondary"
            disabled={pending}
            type="submit"
          >
            <Trash2 aria-hidden size={14} />
            {pending ? "Revoking…" : "Revoke"}
          </button>
          <ActionNotice state={state} />
        </form>
      )}
    </article>
  );
}

export function OrganizationVideoAllowanceControls({
  detail,
}: {
  readonly detail: AdminOrganizationDetail;
}) {
  const [state, action, pending] = useActionState(
    grantOrganizationVideoAllowanceAction,
    initialState,
  );
  const allowance = detail.videoAllowance;
  const canManage = detail.canManageCommission;
  return (
    <section className="hq-card admin-org-panel admin-org-video-policy">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Video allowances</span>
          <h2>Upload + live-stream hours</h2>
          <p>
            Add temporary or recurring hours to the shared organization pool or
            to an individual member&apos;s personal studio.
          </p>
        </div>
        <Badge tone={allowance.payAsYouGo ? "positive" : "neutral"}>
          {allowance.payAsYouGo
            ? "Pay as you go enabled"
            : "Monthly limits enforced"}
        </Badge>
      </header>

      <div className="admin-org-video-policy__scope-rule">
        <Radio aria-hidden size={21} />
        <div>
          <strong>Usage follows the workspace where capture starts.</strong>
          <p>
            A member uploading or streaming inside {detail.organization.name}{" "}
            uses the organization&apos;s shared pool. The same person using
            their Personal Studio uses their individual allowance. Membership
            alone never charges both pools.
          </p>
        </div>
      </div>

      <div className="admin-org-video-policy__meters">
        <article>
          <UploadCloud aria-hidden size={19} />
          <span>
            <small>Upload allowance this month</small>
            <strong>{hours(allowance.totalUploadSeconds)} hours</strong>
          </span>
          <small>
            {hours(allowance.baseUploadSeconds)} plan +{" "}
            {hours(allowance.paidUploadSeconds)} paid +{" "}
            {hours(allowance.earnedUploadSeconds)} earned +{" "}
            {hours(allowance.grantedUploadSeconds)} granted
          </small>
        </article>
        <article>
          <Radio aria-hidden size={19} />
          <span>
            <small>Live-stream allowance this month</small>
            <strong>{hours(allowance.totalLiveSeconds)} hours</strong>
          </span>
          <small>
            {hours(allowance.baseLiveSeconds)} plan +{" "}
            {hours(allowance.paidLiveSeconds)} paid +{" "}
            {hours(allowance.earnedLiveSeconds)} earned +{" "}
            {hours(allowance.grantedLiveSeconds)} granted
          </small>
        </article>
      </div>

      {canManage ? (
        <form action={action} className="admin-org-video-policy__form">
          <input
            name="scopeOrganizationId"
            type="hidden"
            value={detail.organization.id}
          />
          <div className="admin-org-video-policy__fields">
            <label className="admin-org-video-policy__target">
              <span>Credit these hours to</span>
              <select
                defaultValue={`organization:${detail.organization.id}`}
                name="target"
                required
              >
                <option value={`organization:${detail.organization.id}`}>
                  {detail.organization.name} · shared organization pool
                </option>
                {detail.people.map((person) => (
                  <option key={person.id} value={`person:${person.id}`}>
                    {person.displayName} · personal studio
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Extra upload hours</span>
              <input
                defaultValue="0"
                max="10000"
                min="0"
                name="uploadHours"
                required
                step="0.25"
                type="number"
              />
            </label>
            <label>
              <span>Extra live hours</span>
              <input
                defaultValue="0"
                max="10000"
                min="0"
                name="liveHours"
                required
                step="0.25"
                type="number"
              />
            </label>
            <label>
              <span>Grant duration</span>
              <select defaultValue="current-period" name="cadence">
                <option value="current-period">
                  This month · through {date(allowance.periodEndsAt)}
                </option>
                <option value="recurring">Every month until revoked</option>
              </select>
            </label>
            <label className="admin-org-video-policy__reason">
              <span>Audit reason</span>
              <textarea
                maxLength={500}
                minLength={10}
                name="reason"
                placeholder="Why this organization or player needs extra video hours"
                required
                rows={3}
              />
            </label>
          </div>
          <label className="admin-org-video-policy__confirm">
            <input name="confirmed" required type="checkbox" value="true" />
            <span>
              <Clock3 aria-hidden size={16} /> I reviewed the target, both hour
              amounts, and whether this repeats monthly.
            </span>
          </label>
          <footer>
            <ActionNotice state={state} />
            <button
              className="hq-button hq-button--primary"
              disabled={pending}
              type="submit"
            >
              {pending ? "Adding hours…" : "Add video hours"}
            </button>
          </footer>
        </form>
      ) : (
        <p className="admin-org-fee-policy__restricted">
          Super Admin access is required to add or revoke video hours.
        </p>
      )}

      <section className="admin-org-video-policy__grants">
        <header>
          <div>
            <span className="hq-eyebrow">Allowance register</span>
            <h3>Granted hours</h3>
          </div>
          <Badge>{allowance.grants.length}</Badge>
        </header>
        {allowance.grants.map((grant) => (
          <AllowanceGrantRow
            canManage={canManage}
            grant={grant}
            key={grant.id}
            organizationId={detail.organization.id}
          />
        ))}
        {allowance.grants.length === 0 && (
          <p className="hq-empty">
            No Super Admin video-hour grants have been recorded for this
            organization.
          </p>
        )}
      </section>
    </section>
  );
}
