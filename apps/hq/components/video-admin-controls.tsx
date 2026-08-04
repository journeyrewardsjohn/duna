"use client";

import type { AdminVideoOverview, DunaPlusGrant } from "@duna/api";
import { Badge, Numeric } from "@duna/ui";
import {
  Check,
  CircleAlert,
  Clock3,
  Cloud,
  Database,
  Gift,
  HardDrive,
  Radio,
  ShieldCheck,
  Trash2,
  UsersRound,
} from "lucide-react";
import { useActionState } from "react";
import {
  grantComplimentaryDunaPlusAction,
  revokeComplimentaryDunaPlusAction,
  updateVideoQuotaPolicyAction,
  type VideoAdminActionState,
} from "@/app/admin/actions";

const initialState: VideoAdminActionState = {
  status: "idle",
  message: "",
};

function formatHours(seconds: number): string {
  const hours = seconds / 60 / 60;
  return hours >= 10 || Number.isInteger(hours)
    ? `${hours.toLocaleString("en-US", { maximumFractionDigits: 0 })}h`
    : `${hours.toLocaleString("en-US", { maximumFractionDigits: 1 })}h`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 GB";
  const units = ["B", "KB", "MB", "GB", "TB"] as const;
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  return `${(bytes / 1024 ** exponent).toLocaleString("en-US", {
    maximumFractionDigits: exponent > 2 ? 1 : 0,
  })} ${units[exponent]}`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}

function ActionNotice({ state }: { readonly state: VideoAdminActionState }) {
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

function QuotaPolicy({ overview }: { readonly overview: AdminVideoOverview }) {
  const [state, action, pending] = useActionState(
    updateVideoQuotaPolicyAction,
    initialState,
  );
  return (
    <section className="hq-card video-policy-card">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Global monthly policy</span>
          <h2>Streaming + upload limits</h2>
          <p>
            Live streaming begins at 4 hours and is enforced. Uploads begin at
            24 hours as a reported allowance, with no hard stop.
          </p>
        </div>
        <Clock3 aria-hidden size={24} />
      </header>
      <form action={action} className="operator-form">
        <div className="operator-form-grid operator-form-grid--two">
          <label>
            <span>Live stream hours</span>
            <input
              defaultValue={overview.settings.monthlyLiveSeconds / 3600}
              disabled={!overview.canManage}
              max={744}
              min={0}
              name="liveHours"
              required
              step={0.25}
              type="number"
            />
          </label>
          <label>
            <span>Uploaded video hours</span>
            <input
              defaultValue={overview.settings.monthlyUploadSeconds / 3600}
              disabled={!overview.canManage}
              max={744}
              min={0}
              name="uploadHours"
              required
              step={0.25}
              type="number"
            />
          </label>
        </div>
        <div className="video-policy-switches">
          <label className="operator-switch">
            <input
              defaultChecked={overview.settings.enforceLiveLimit}
              disabled={!overview.canManage}
              name="enforceLiveLimit"
              type="checkbox"
              value="true"
            />
            <span>
              <strong>Enforce live stream allowance</strong>
              Prevent a new stream when the monthly allowance is exhausted.
            </span>
          </label>
          <label className="operator-switch">
            <input
              defaultChecked={overview.settings.enforceUploadLimit}
              disabled={!overview.canManage}
              name="enforceUploadLimit"
              type="checkbox"
              value="true"
            />
            <span>
              <strong>Enforce upload allowance</strong>
              Leave off to report usage and overage without blocking uploads.
            </span>
          </label>
        </div>
        <label>
          <span>Audit reason</span>
          <input
            disabled={!overview.canManage}
            minLength={8}
            name="reason"
            placeholder="Why the global video policy is changing"
            required
          />
        </label>
        <label className="operator-confirmation">
          <input
            disabled={!overview.canManage}
            name="confirmed"
            required
            type="checkbox"
            value="true"
          />
          <span>
            <strong>I reviewed both allowances and enforcement states.</strong>
            This changes the default policy for every player without a
            person-specific override.
          </span>
        </label>
        <footer className="operator-form-footer">
          <ActionNotice state={state} />
          <button
            className="hq-button hq-button--primary"
            disabled={!overview.canManage || pending}
            type="submit"
          >
            {pending ? "Saving…" : "Save video policy"}
          </button>
        </footer>
      </form>
    </section>
  );
}

function GrantComplimentary({ canManage }: { readonly canManage: boolean }) {
  const [state, action, pending] = useActionState(
    grantComplimentaryDunaPlusAction,
    initialState,
  );
  return (
    <section className="hq-card video-grant-card">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Super Admin entitlement</span>
          <h2>Grant Complimentary Duna+</h2>
          <p>
            Grant by email before or after the person creates an account. Leave
            the end date empty for an indefinite entitlement.
          </p>
        </div>
        <Gift aria-hidden size={24} />
      </header>
      <form action={action} className="operator-form">
        <div className="operator-form-grid operator-form-grid--two">
          <label>
            <span>Player email</span>
            <input
              disabled={!canManage}
              name="email"
              placeholder="player@example.com"
              required
              type="email"
            />
          </label>
          <label>
            <span>End date · optional</span>
            <input disabled={!canManage} name="endDate" type="date" />
          </label>
          <label className="operator-field--full">
            <span>Audit reason</span>
            <input
              disabled={!canManage}
              minLength={8}
              name="reason"
              placeholder="Why this person receives Complimentary Duna+"
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
            <strong>I reviewed the person, duration, and reason.</strong>
            This creates a local Duna+ entitlement; it does not create or alter
            a Stripe subscription.
          </span>
        </label>
        <footer className="operator-form-footer">
          <ActionNotice state={state} />
          <button
            className="hq-button hq-button--primary"
            disabled={!canManage || pending}
            type="submit"
          >
            {pending ? "Granting…" : "Grant Complimentary Duna+"}
          </button>
        </footer>
      </form>
    </section>
  );
}

function GrantRow({
  canManage,
  grant,
}: {
  readonly canManage: boolean;
  readonly grant: DunaPlusGrant;
}) {
  const [state, action, pending] = useActionState(
    revokeComplimentaryDunaPlusAction,
    initialState,
  );
  const expired = Boolean(
    grant.endsAt && new Date(grant.endsAt).getTime() < Date.now(),
  );
  const active = grant.status === "active" && !expired;
  return (
    <article className="video-grant-row">
      <div className="video-grant-identity">
        <span>
          <Gift aria-hidden size={17} />
        </span>
        <div>
          <strong>{grant.displayName ?? grant.email}</strong>
          {grant.displayName && <small>{grant.email}</small>}
          <small>
            {grant.endsAt
              ? `Through ${formatDate(grant.endsAt)}`
              : "Indefinite"}{" "}
            · {grant.reason}
          </small>
        </div>
      </div>
      <Badge tone={active ? "positive" : "neutral"}>
        {active ? "Complimentary Duna+" : expired ? "expired" : grant.status}
      </Badge>
      {active && canManage ? (
        <form action={action} className="video-grant-revoke">
          <input name="grantId" type="hidden" value={grant.id} />
          <input
            aria-label={`Reason to revoke ${grant.email}`}
            minLength={8}
            name="reason"
            placeholder="Revocation reason"
            required
          />
          <label>
            <input name="confirmed" required type="checkbox" value="true" />
            Confirm
          </label>
          <button
            aria-label={`Revoke Complimentary Duna+ for ${grant.email}`}
            className="hq-button hq-button--secondary"
            disabled={pending}
            type="submit"
          >
            <Trash2 aria-hidden size={15} />
            {pending ? "Revoking…" : "Revoke"}
          </button>
          <ActionNotice state={state} />
        </form>
      ) : null}
    </article>
  );
}

function EntitlementList({
  overview,
}: {
  readonly overview: AdminVideoOverview;
}) {
  return (
    <section className="hq-card video-entitlement-list">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Entitlement register</span>
          <h2>Complimentary Duna+ grants</h2>
        </div>
        <Badge>{overview.grants.length}</Badge>
      </header>
      <div>
        {overview.grants.map((grant) => (
          <GrantRow
            canManage={overview.canManage}
            grant={grant}
            key={grant.id}
          />
        ))}
        {overview.grants.length === 0 && (
          <div className="hq-empty">
            <strong>No complimentary grants yet.</strong>
            <span>New grants will appear here with their audit reason.</span>
          </div>
        )}
      </div>
    </section>
  );
}

function UsageTables({ overview }: { readonly overview: AdminVideoOverview }) {
  return (
    <div className="video-admin-lower">
      <section className="hq-card video-live-list">
        <header className="hq-card-heading">
          <div>
            <span className="hq-eyebrow">Mux ingest</span>
            <h2>Live now</h2>
          </div>
          <Badge tone={overview.activeStreams.length ? "live" : "neutral"}>
            {overview.activeStreams.length}
          </Badge>
        </header>
        {overview.activeStreams.map((stream) => (
          <article key={stream.id}>
            <Radio aria-hidden size={17} />
            <div>
              <strong>{stream.title}</strong>
              <small>
                {stream.owner.displayName} ·{" "}
                {stream.match?.label ?? stream.event?.title ?? stream.category}
              </small>
            </div>
            <Badge tone="live">{stream.liveVisibility}</Badge>
          </article>
        ))}
        {overview.activeStreams.length === 0 && (
          <div className="hq-empty">
            <strong>No one is live right now.</strong>
            <span>Active Mux streams will appear here.</span>
          </div>
        )}
      </section>

      <section className="hq-card video-usage-list">
        <header className="hq-card-heading">
          <div>
            <span className="hq-eyebrow">Current billing month</span>
            <h2>Highest video usage</h2>
          </div>
          <UsersRound aria-hidden size={22} />
        </header>
        {overview.topUsage.map(({ person, usage, videoCount }) => (
          <article key={person.id}>
            <div>
              <strong>{person.displayName}</strong>
              <small>
                {videoCount} videos · {formatHours(usage.live.usedSeconds)} live
                · {formatHours(usage.uploads.usedSeconds)} uploaded
              </small>
            </div>
            <div className="video-usage-bars" aria-hidden>
              <i
                style={{
                  width: `${Math.min(
                    100,
                    usage.live.limitSeconds
                      ? (usage.live.usedSeconds / usage.live.limitSeconds) * 100
                      : 0,
                  )}%`,
                }}
              />
              <i
                style={{
                  width: `${Math.min(
                    100,
                    usage.uploads.limitSeconds
                      ? (usage.uploads.usedSeconds /
                          usage.uploads.limitSeconds) *
                          100
                      : 0,
                  )}%`,
                }}
              />
            </div>
          </article>
        ))}
        {overview.topUsage.length === 0 && (
          <div className="hq-empty">
            <strong>No monthly usage yet.</strong>
            <span>
              Player usage will appear after the first stream or upload.
            </span>
          </div>
        )}
      </section>
    </div>
  );
}

export function VideoAdminControls({
  overview,
}: {
  readonly overview: AdminVideoOverview;
}) {
  const metrics = [
    { label: "Videos", value: overview.totals.videos, icon: Database },
    { label: "Live now", value: overview.totals.liveNow, icon: Radio },
    {
      label: "R2 storage",
      value: formatBytes(overview.totals.storageBytes),
      icon: HardDrive,
    },
    {
      label: "Watched",
      value: formatHours(overview.totals.watchedSeconds),
      icon: Clock3,
    },
    {
      label: "Complimentary",
      value: overview.totals.complimentarySubscribers,
      icon: Gift,
    },
  ] as const;

  return (
    <div className="video-admin-controls">
      {!overview.canManage && (
        <section className="hq-card feature-flag-readonly">
          <ShieldCheck aria-hidden size={22} />
          <div>
            <strong>Read-only platform access</strong>
            <p>
              Video operations are visible to administrators. Complimentary
              grants and quota policy changes require Super Admin access.
            </p>
          </div>
        </section>
      )}

      <section className="video-admin-metrics">
        {metrics.map(({ label, value, icon: Icon }) => (
          <article className="hq-card" key={label}>
            <span>
              <small>{label}</small>
              <Icon aria-hidden size={17} />
            </span>
            <Numeric>{value}</Numeric>
          </article>
        ))}
      </section>

      <section className="video-provider-grid">
        <article className="hq-card">
          <Cloud aria-hidden size={22} />
          <div>
            <strong>Mux live + playback</strong>
            <small>RTMPS ingest, secure playback, recordings, and Data</small>
          </div>
          <Badge tone={overview.muxConfigured ? "positive" : "warning"}>
            {overview.muxConfigured ? "configured" : "needs environment"}
          </Badge>
        </article>
        <article className="hq-card">
          <HardDrive aria-hidden size={22} />
          <div>
            <strong>Cloudflare R2 uploads</strong>
            <small>Private multipart originals with signed playback</small>
          </div>
          <Badge tone={overview.r2Configured ? "positive" : "warning"}>
            {overview.r2Configured ? "configured" : "needs environment"}
          </Badge>
        </article>
      </section>

      <div className="video-admin-grid">
        <QuotaPolicy overview={overview} />
        <GrantComplimentary canManage={overview.canManage} />
      </div>
      <EntitlementList overview={overview} />
      <UsageTables overview={overview} />
    </div>
  );
}
